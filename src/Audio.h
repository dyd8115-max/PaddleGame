#pragma once
#include <string>

// 소리 재생. 모든 작업은 별도 스레드에서 처리하므로
// 소리 장치가 느리거나 없어도 게임(메인 스레드)은 멈추지 않는다.
namespace Audio {
    enum class Sound { Start, StageClear, GameOver, Brick, Count };

    // 배경음악(무한 반복) 경로와 효과음 경로 (Sound 순서). 빈 문자열이면 해당 소리는 생략
    void Init(const std::wstring& bgmPath, const std::wstring (&effectPaths)[static_cast<int>(Sound::Count)]);
    void Play(Sound sound);    // 배경음악 위에 효과음을 겹쳐 재생
    void SetMuted(bool muted);
    bool IsMuted();
    void Shutdown();
}
