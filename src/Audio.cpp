#include "Audio.h"
#include <windows.h>
#include <mmsystem.h>
#include <algorithm>
#include <atomic>
#include <cstdint>
#include <cstring>
#include <vector>

#pragma comment(lib, "winmm.lib")   // waveOut

// 구조
//   소리 스레드가 WAV 파일들을 읽어 두고, 작은 버퍼 여러 개를 번갈아 채워 waveOut 으로 보낸다.
//   버퍼를 채울 때 배경음악(반복)과 효과음들을 직접 더해서 섞는다.
//   효과음은 "목소리" 칸 여러 개에 나눠 재생해서, 같은 소리가 연달아 와도 서로 끊지 않고 겹친다.
//   메인 스레드는 원자 변수로 "효과음 재생", "음소거", "종료" 요청만 남긴다.
namespace {
    constexpr int kRate       = 44100;
    constexpr int kBufSamples = 512;    // 버퍼 하나 약 12ms (효과음이 늦지 않게 짧게)
    constexpr int kBufCount   = 5;
    constexpr int kMaxVoices  = 8;      // 동시에 겹쳐 낼 수 있는 효과음 수

    constexpr int kEffectCount = static_cast<int>(Audio::Sound::Count);

    std::wstring          g_bgmPath;
    std::wstring          g_effectPaths[kEffectCount];
    std::vector<int16_t>  g_bgm;
    std::vector<int16_t>  g_effects[kEffectCount];
    HANDLE                g_thread = nullptr;
    HANDLE                g_wake   = nullptr;
    std::atomic<bool>     g_quit{ false };
    std::atomic<bool>     g_muted{ false };
    std::atomic<unsigned> g_pending[kEffectCount];   // 효과음별 재생 요청 횟수

    // 16비트 모노 PCM WAV 만 읽는다 (tools/compose_music.py 출력 형식)
    bool LoadWav(const std::wstring& path, std::vector<int16_t>& out) {
        if (path.empty()) return false;
        HANDLE f = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr,
                               OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (f == INVALID_HANDLE_VALUE) return false;

        LARGE_INTEGER size;
        std::vector<char> bytes;
        if (GetFileSizeEx(f, &size) && size.QuadPart > 44 && size.QuadPart < (64 << 20)) {
            bytes.resize(static_cast<size_t>(size.QuadPart));
            DWORD read = 0;
            if (!ReadFile(f, bytes.data(), static_cast<DWORD>(bytes.size()), &read, nullptr) ||
                read != bytes.size()) {
                bytes.clear();
            }
        }
        CloseHandle(f);
        if (bytes.empty() || std::memcmp(bytes.data(), "RIFF", 4) != 0 ||
            std::memcmp(bytes.data() + 8, "WAVE", 4) != 0) {
            return false;
        }

        uint16_t channels = 0, bits = 0;
        uint32_t rate = 0;
        size_t pos = 12;
        while (pos + 8 <= bytes.size()) {
            uint32_t chunkSize;
            std::memcpy(&chunkSize, bytes.data() + pos + 4, 4);
            const char* id = bytes.data() + pos;
            const char* body = bytes.data() + pos + 8;
            if (pos + 8 + chunkSize > bytes.size()) break;

            if (std::memcmp(id, "fmt ", 4) == 0 && chunkSize >= 16) {
                std::memcpy(&channels, body + 2, 2);
                std::memcpy(&rate, body + 4, 4);
                std::memcpy(&bits, body + 14, 2);
            } else if (std::memcmp(id, "data", 4) == 0) {
                if (channels != 1 || bits != 16 || rate != kRate) return false;
                out.resize(chunkSize / 2);
                std::memcpy(out.data(), body, out.size() * 2);
                return true;
            }
            pos += 8 + chunkSize + (chunkSize & 1);
        }
        return false;
    }

    DWORD WINAPI AudioThread(LPVOID) {
        bool any = LoadWav(g_bgmPath, g_bgm);
        for (int i = 0; i < kEffectCount; ++i) any |= LoadWav(g_effectPaths[i], g_effects[i]);
        if (!any) return 0;

        WAVEFORMATEX fmt = {};
        fmt.wFormatTag      = WAVE_FORMAT_PCM;
        fmt.nChannels       = 1;
        fmt.nSamplesPerSec  = kRate;
        fmt.wBitsPerSample  = 16;
        fmt.nBlockAlign     = 2;
        fmt.nAvgBytesPerSec = kRate * 2;

        HWAVEOUT out = nullptr;
        if (waveOutOpen(&out, WAVE_MAPPER, &fmt, reinterpret_cast<DWORD_PTR>(g_wake),
                        0, CALLBACK_EVENT) != MMSYSERR_NOERROR) {
            return 0;   // 소리 장치가 없으면 조용히 끝냄
        }

        std::vector<int16_t> samples(kBufSamples * kBufCount);
        WAVEHDR headers[kBufCount] = {};
        size_t bgmPos = 0;

        struct Voice { int sound = -1; size_t pos = 0; };   // sound < 0 이면 빈 칸
        Voice voices[kMaxVoices];

        auto startVoice = [&](int sound) {
            // 빈 칸을 쓰고, 없으면 가장 오래 재생된 소리를 밀어냄
            int slot = 0;
            for (int v = 0; v < kMaxVoices; ++v) {
                if (voices[v].sound < 0) { slot = v; break; }
                if (voices[v].pos > voices[slot].pos) slot = v;
            }
            voices[slot].sound = sound;
            voices[slot].pos   = 0;
        };

        auto fill = [&](int16_t* dst) {
            for (int e = 0; e < kEffectCount; ++e) {
                unsigned n = std::min(g_pending[e].exchange(0), 2u);   // 한 번에 너무 많이 쌓이지 않게
                while (n--) {
                    if (!g_effects[e].empty()) startVoice(e);
                }
            }
            const bool muted = g_muted.load();
            for (int i = 0; i < kBufSamples; ++i) {
                int s = 0;
                if (!g_bgm.empty()) {
                    s += g_bgm[bgmPos];
                    bgmPos = (bgmPos + 1) % g_bgm.size();   // 끝나면 처음으로 (무한 반복)
                }
                for (Voice& v : voices) {
                    if (v.sound < 0) continue;
                    const std::vector<int16_t>& clip = g_effects[v.sound];
                    s += clip[v.pos++] * 4 / 5;
                    if (v.pos >= clip.size()) v.sound = -1;
                }
                dst[i] = muted ? 0 : static_cast<int16_t>(std::max(-32768, std::min(32767, s)));
            }
        };

        for (int b = 0; b < kBufCount; ++b) {
            WAVEHDR& h = headers[b];
            h.lpData         = reinterpret_cast<LPSTR>(&samples[b * kBufSamples]);
            h.dwBufferLength = kBufSamples * 2;
            fill(&samples[b * kBufSamples]);
            waveOutPrepareHeader(out, &h, sizeof(h));
            waveOutWrite(out, &h, sizeof(h));
        }

        while (!g_quit.load()) {
            WaitForSingleObject(g_wake, 20);
            for (int b = 0; b < kBufCount; ++b) {
                WAVEHDR& h = headers[b];
                if (h.dwFlags & WHDR_DONE) {   // 다 재생한 버퍼를 다시 채워서 보냄
                    fill(&samples[b * kBufSamples]);
                    waveOutWrite(out, &h, sizeof(h));
                }
            }
        }

        waveOutReset(out);
        for (WAVEHDR& h : headers) waveOutUnprepareHeader(out, &h, sizeof(h));
        waveOutClose(out);
        return 0;
    }
}

namespace Audio {
    void Init(const std::wstring& bgmPath, const std::wstring (&effectPaths)[kEffectCount]) {
        if (g_thread) return;
        g_bgmPath = bgmPath;
        for (int i = 0; i < kEffectCount; ++i) g_effectPaths[i] = effectPaths[i];
        g_wake      = CreateEventW(nullptr, FALSE, FALSE, nullptr);
        g_thread    = CreateThread(nullptr, 0, AudioThread, nullptr, 0, nullptr);
    }

    void Play(Sound sound) {
        if (!g_muted.load()) g_pending[static_cast<int>(sound)].fetch_add(1);
    }

    void SetMuted(bool muted) { g_muted = muted; }
    bool IsMuted()            { return g_muted.load(); }

    void Shutdown() {
        if (!g_thread) return;
        g_quit = true;
        SetEvent(g_wake);
        // 소리 장치가 응답하지 않더라도 종료가 막히지 않도록 최대 1초만 기다림
        WaitForSingleObject(g_thread, 1000);
        CloseHandle(g_thread);
        CloseHandle(g_wake);
        g_thread = nullptr;
        g_wake   = nullptr;
    }
}
