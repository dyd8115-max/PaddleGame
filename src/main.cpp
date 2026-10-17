// Win32 + GDI 플랫폼 계층: 창, 입력 전달, 게임 루프, 그리기만 담당
#include <windows.h>
#include <windowsx.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <string>
#include "Audio.h"
#include "Game.h"

#pragma comment(lib, "msimg32.lib")   // TransparentBlt

namespace {
    Game          g_game;
    LARGE_INTEGER g_freq;
    LARGE_INTEGER g_prev;

    // ---------- 색상 ----------
    const std::array<COLORREF, 5> kRowColors = {
        RGB(230, 80, 80), RGB(240, 150, 60), RGB(80, 200, 120),
        RGB(80, 160, 240), RGB(170, 110, 230),
    };
    const COLORREF kItemColor     = RGB(255, 230, 90);
    const COLORREF kLetterboxColor = RGB(0, 0, 0);
    const COLORREF kBgColor       = RGB(20, 22, 32);
    const COLORREF kPaddleColor   = RGB(220, 220, 230);
    const COLORREF kBallColor     = RGB(255, 255, 255);
    const COLORREF kCardColor     = RGB(36, 40, 56);
    const COLORREF kCardSelColor  = RGB(70, 80, 120);
    const COLORREF kCardEdgeColor = RGB(255, 230, 90);

    // ---------- 캐릭터 스프라이트 시트 ----------
    // characters.bmp: 행 = 캐릭터 * 2 + (왼쪽 보기 ? 1 : 0), 열 = 프레임, 마젠타가 투명색
    HBITMAP        g_sheet   = nullptr;
    const int      kCellW    = static_cast<int>(Characters::CellW);
    const int      kCellH    = static_cast<int>(Characters::CellH);
    const COLORREF kKeyColor = RGB(255, 0, 255);

    // ---------- 화면 배율 ----------
    // 논리 화면(480x640)을 비율을 유지한 채 창 가운데에 맞추고, 남는 곳은 검은 여백
    struct View {
        float scale = 1.f;
        int   ox = 0, oy = 0;   // 논리 화면이 시작되는 창 좌표

        int toScreenX(float x) const { return ox + static_cast<int>(std::lround(x * scale)); }
        int toScreenY(float y) const { return oy + static_cast<int>(std::lround(y * scale)); }
        float toLogicalX(int x) const { return (x - ox) / scale; }
        float toLogicalY(int y) const { return (y - oy) / scale; }
    };

    View MakeView(int cw, int ch) {
        View v;
        v.scale = std::min(cw / World::Width, ch / World::Height);
        v.ox    = static_cast<int>((cw - World::Width * v.scale) * 0.5f);
        v.oy    = static_cast<int>((ch - World::Height * v.scale) * 0.5f);
        return v;
    }

    View CurrentView(HWND hwnd) {
        RECT c;
        GetClientRect(hwnd, &c);
        return MakeView(c.right, c.bottom);
    }

    // ---------- 전체화면 ----------
    bool            g_fullscreen = false;
    WINDOWPLACEMENT g_placement  = {};
    const DWORD     kWindowStyle = WS_OVERLAPPEDWINDOW;

    void ToggleFullscreen(HWND hwnd) {
        if (!g_fullscreen) {
            g_placement.length = sizeof(g_placement);
            GetWindowPlacement(hwnd, &g_placement);
            MONITORINFO mi = {};
            mi.cbSize = sizeof(mi);
            GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), &mi);
            SetWindowLongPtrW(hwnd, GWL_STYLE, WS_POPUP | WS_VISIBLE);
            SetWindowPos(hwnd, HWND_TOP,
                         mi.rcMonitor.left, mi.rcMonitor.top,
                         mi.rcMonitor.right - mi.rcMonitor.left,
                         mi.rcMonitor.bottom - mi.rcMonitor.top,
                         SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
        } else {
            SetWindowLongPtrW(hwnd, GWL_STYLE, kWindowStyle | WS_VISIBLE);
            SetWindowPlacement(hwnd, &g_placement);
            SetWindowPos(hwnd, nullptr, 0, 0, 0, 0,
                         SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER |
                         SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
        }
        g_fullscreen = !g_fullscreen;
    }

    // ---------- 리소스 ----------
    // 실행 파일 폴더 → 현재 작업 폴더 순서로 탐색. 없으면 빈 문자열
    std::wstring FindAsset(const wchar_t* name) {
        wchar_t path[MAX_PATH];
        DWORD len = GetModuleFileNameW(nullptr, path, MAX_PATH);
        std::wstring dir(path, len);
        dir = dir.substr(0, dir.find_last_of(L"\\/") + 1);

        for (const std::wstring& p : { dir + name, std::wstring(name) }) {
            if (GetFileAttributesW(p.c_str()) != INVALID_FILE_ATTRIBUTES) return p;
        }
        return std::wstring();
    }

    HBITMAP LoadSpriteSheet() {
        std::wstring p = FindAsset(L"characters.bmp");
        if (p.empty()) return nullptr;
        return static_cast<HBITMAP>(LoadImageW(nullptr, p.c_str(), IMAGE_BITMAP, 0, 0,
                                               LR_LOADFROMFILE | LR_CREATEDIBSECTION));
    }

    // 백버퍼: 창 크기가 바뀔 때만 다시 만든다
    HDC     g_backDC  = nullptr;
    HBITMAP g_backBmp = nullptr;
    HGDIOBJ g_backOld = nullptr;
    int     g_backW = 0, g_backH = 0;

    void EnsureBackBuffer(HDC hdc, int w, int h) {
        if (g_backDC && w == g_backW && h == g_backH) return;
        if (g_backDC) {
            SelectObject(g_backDC, g_backOld);
            DeleteObject(g_backBmp);
            DeleteDC(g_backDC);
        }
        g_backDC  = CreateCompatibleDC(hdc);
        g_backBmp = CreateCompatibleBitmap(hdc, w, h);
        g_backOld = SelectObject(g_backDC, g_backBmp);
        g_backW = w;
        g_backH = h;
    }

    void ReleaseResources() {
        if (g_backDC) {
            SelectObject(g_backDC, g_backOld);
            DeleteObject(g_backBmp);
            DeleteDC(g_backDC);
            g_backDC = nullptr;
        }
        if (g_sheet) {
            DeleteObject(g_sheet);
            g_sheet = nullptr;
        }
    }

    // ---------- 그리기 도우미 ----------
    void FillLogicalRect(HDC hdc, const View& v, const Rect& r, COLORREF color) {
        RECT rc = { v.toScreenX(r.left()), v.toScreenY(r.top()),
                    v.toScreenX(r.right()), v.toScreenY(r.bottom()) };
        HBRUSH brush = CreateSolidBrush(color);
        FillRect(hdc, &rc, brush);
        DeleteObject(brush);
    }

    HFONT MakeFont(const View& v, float logicalSize, bool bold) {
        return CreateFontW(-static_cast<int>(logicalSize * v.scale), 0, 0, 0,
                           bold ? FW_BOLD : FW_NORMAL, FALSE, FALSE, FALSE,
                           DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                           CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Malgun Gothic");
    }

    // 논리 좌표 y 위치에 가로 중앙 정렬로 한 줄 출력
    void DrawTextLine(HDC hdc, const View& v, const std::wstring& text,
                      float y, float size, bool bold, COLORREF color) {
        HFONT font = MakeFont(v, size, bold);
        HGDIOBJ old = SelectObject(hdc, font);
        SetTextColor(hdc, color);

        RECT rc = { v.toScreenX(0.f), v.toScreenY(y),
                    v.toScreenX(World::Width), v.toScreenY(y + size * 1.6f) };
        DrawTextW(hdc, text.c_str(), static_cast<int>(text.size()), &rc,
                  DT_CENTER | DT_SINGLELINE | DT_VCENTER);

        SelectObject(hdc, old);
        DeleteObject(font);
    }

    // 캐릭터 한 프레임을 논리 사각형 dst 에 그림
    void DrawCharacter(HDC hdc, const View& v, int character, int frame,
                       bool facingLeft, const Rect& dst) {
        if (!g_sheet) {   // 이미지가 없으면 단색 사각형으로 대체
            FillLogicalRect(hdc, v, dst, RGB(120, 160, 110));
            return;
        }

        HDC     src = CreateCompatibleDC(hdc);
        HGDIOBJ old = SelectObject(src, g_sheet);

        int srcX = frame * kCellW;
        int srcY = (character * 2 + (facingLeft ? 1 : 0)) * kCellH;
        int x0 = v.toScreenX(dst.left()), y0 = v.toScreenY(dst.top());
        int x1 = v.toScreenX(dst.right()), y1 = v.toScreenY(dst.bottom());

        TransparentBlt(hdc, x0, y0, x1 - x0, y1 - y0,
                       src, srcX, srcY, kCellW, kCellH, kKeyColor);

        SelectObject(src, old);
        DeleteDC(src);
    }

    // ---------- 화면별 그리기 ----------
    void RenderPlaying(HDC hdc, const View& v) {
        const Player& p = g_game.player();
        DrawCharacter(hdc, v, p.character, p.frame(), p.facingLeft, p.bounds());

        for (const Brick& k : g_game.bricks()) {
            if (!k.alive) continue;
            COLORREF c = k.item ? kItemColor : kRowColors[k.row % kRowColors.size()];
            FillLogicalRect(hdc, v, k.rect, c);
        }
        FillLogicalRect(hdc, v, g_game.paddle().bounds(), kPaddleColor);
        for (const Ball& b : g_game.balls()) {
            FillLogicalRect(hdc, v, b.bounds(), kBallColor);
        }

        HFONT font = MakeFont(v, 16.f, true);
        HGDIOBJ old = SelectObject(hdc, font);
        SetTextColor(hdc, RGB(255, 255, 255));
        std::wstring s = L"점수 " + std::to_wstring(g_game.score());
        TextOutW(hdc, v.toScreenX(10.f), v.toScreenY(10.f), s.c_str(), static_cast<int>(s.size()));
        SelectObject(hdc, old);
        DeleteObject(font);
    }

    void RenderMenu(HDC hdc, const View& v) {
        const COLORREF white = RGB(255, 255, 255);
        const COLORREF gray  = RGB(170, 175, 190);

        DrawTextLine(hdc, v, L"PADDLE BREAKOUT", 90.f, 32.f, true, white);
        DrawTextLine(hdc, v, L"캐릭터를 고르세요", 150.f, 16.f, false, gray);

        // 캐릭터 카드 3장
        for (int i = 0; i < Characters::Count; ++i) {
            const Rect card = Characters::cardRect(i);
            const bool sel  = (i == g_game.selected());

            if (sel) {   // 선택된 카드는 노란 테두리
                FillLogicalRect(hdc, v, Rect(card.x - 3, card.y - 3, card.w + 6, card.h + 6), kCardEdgeColor);
            }
            FillLogicalRect(hdc, v, card, sel ? kCardSelColor : kCardColor);

            // 스프라이트를 1.4배로, 카드 아래쪽 이름 위에 발이 닿게
            const float sw = Characters::CellW * 1.4f;
            const float sh = Characters::CellH * 1.4f;
            const Rect dst(card.centerX() - sw * 0.5f, card.bottom() - 30.f - sh, sw, sh);
            int frame = sel ? static_cast<int>(g_game.menuTime() * Characters::List[i].fps) % Characters::FrameCount : 0;
            DrawCharacter(hdc, v, i, frame, false, dst);

            // 이름
            HFONT font = MakeFont(v, 15.f, true);
            HGDIOBJ old = SelectObject(hdc, font);
            SetTextColor(hdc, sel ? kCardEdgeColor : white);
            std::wstring name = std::to_wstring(i + 1) + L". " + Characters::List[i].name;
            RECT rc = { v.toScreenX(card.left()), v.toScreenY(card.bottom() - 28.f),
                        v.toScreenX(card.right()), v.toScreenY(card.bottom() - 4.f) };
            DrawTextW(hdc, name.c_str(), static_cast<int>(name.size()), &rc,
                      DT_CENTER | DT_SINGLELINE | DT_VCENTER);
            SelectObject(hdc, old);
            DeleteObject(font);
        }

        float y = 370.f;
        switch (g_game.lastResult()) {
        case GameResult::GameOver:
            DrawTextLine(hdc, v, L"게임 오버  -  점수 " + std::to_wstring(g_game.score()), y, 18.f, true, RGB(240, 110, 110));
            break;
        case GameResult::Clear:
            DrawTextLine(hdc, v, L"클리어!  -  점수 " + std::to_wstring(g_game.score()), y, 18.f, true, kItemColor);
            break;
        default:
            break;
        }
        DrawTextLine(hdc, v, L"최고 점수 " + std::to_wstring(g_game.bestScore()), y + 32.f, 15.f, false, gray);

        DrawTextLine(hdc, v, L"SPACE  게임 시작", 450.f, 18.f, true, white);
        DrawTextLine(hdc, v, L"방향키 / 1 2 3 / 클릭  캐릭터 선택", 490.f, 14.f, false, gray);
        DrawTextLine(hdc, v, L"마우스  패들 이동", 516.f, 14.f, false, gray);
        DrawTextLine(hdc, v, L"F11 / Alt+Enter  전체화면     ESC  종료", 542.f, 14.f, false, gray);
        DrawTextLine(hdc, v, Audio::IsMuted() ? L"M  소리 켜기" : L"M  소리 끄기", 568.f, 14.f, false, gray);
    }

    // 백버퍼에 그린 뒤 한 번에 복사 (더블 버퍼링으로 깜빡임 방지)
    void Render(HWND hwnd, HDC hdc) {
        RECT client;
        GetClientRect(hwnd, &client);
        const int cw = client.right;
        const int ch = client.bottom;
        if (cw <= 0 || ch <= 0) return;

        EnsureBackBuffer(hdc, cw, ch);
        HDC mem = g_backDC;
        const View v = MakeView(cw, ch);

        // 여백 → 게임 영역 배경
        HBRUSH lb = CreateSolidBrush(kLetterboxColor);
        FillRect(mem, &client, lb);
        DeleteObject(lb);
        FillLogicalRect(mem, v, Rect(0.f, 0.f, World::Width, World::Height), kBgColor);

        // 게임 영역 밖(아래로 빠지는 공 등)은 그리지 않음
        SaveDC(mem);
        IntersectClipRect(mem, v.toScreenX(0.f), v.toScreenY(0.f),
                          v.toScreenX(World::Width), v.toScreenY(World::Height));
        SetBkMode(mem, TRANSPARENT);

        if (g_game.state() == GameState::Playing) RenderPlaying(mem, v);
        else                                      RenderMenu(mem, v);

        RestoreDC(mem, -1);
        BitBlt(hdc, 0, 0, cw, ch, mem, 0, 0, SRCCOPY);
    }

    LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
        switch (msg) {
        case WM_KEYDOWN:
            switch (wParam) {
            case VK_SPACE:
                if (g_game.state() == GameState::Menu) {
                    g_game.startGame();
                    Audio::PlayStart();   // 입장 효과음 (배경음악 위에 겹쳐서)
                }
                break;
            case 'M':       Audio::SetMuted(!Audio::IsMuted()); break;
            case VK_LEFT:   g_game.moveSelection(-1); break;
            case VK_RIGHT:  g_game.moveSelection(+1); break;
            case '1': case '2': case '3':
                g_game.selectCharacter(static_cast<int>(wParam - '1'));
                break;
            case VK_F11:    ToggleFullscreen(hwnd);   break;
            case VK_ESCAPE:
                if (g_fullscreen) ToggleFullscreen(hwnd);   // 전체화면이면 먼저 창 모드로
                else              DestroyWindow(hwnd);
                break;
            }
            return 0;

        case WM_SYSKEYDOWN:
            // Alt + Enter: 전체화면 전환
            if (wParam == VK_RETURN && (lParam & (1 << 29))) {
                ToggleFullscreen(hwnd);
                return 0;
            }
            break;

        case WM_SYSCHAR:
            if (wParam == VK_RETURN) return 0;   // Alt+Enter 경고음 방지
            break;

        case WM_MOUSEMOVE: {
            // 창 좌표 → 논리 좌표로 변환해서 전달
            View v = CurrentView(hwnd);
            g_game.setPaddleTarget(v.toLogicalX(GET_X_LPARAM(lParam)));
            return 0;
        }

        case WM_LBUTTONDOWN: {
            View v = CurrentView(hwnd);
            g_game.clickAt(v.toLogicalX(GET_X_LPARAM(lParam)), v.toLogicalY(GET_Y_LPARAM(lParam)));
            return 0;
        }

        case WM_ERASEBKGND:
            return 1;   // 배경은 Render에서 직접 칠함

        case WM_PAINT: {
            PAINTSTRUCT ps;
            HDC hdc = BeginPaint(hwnd, &ps);
            Render(hwnd, hdc);
            EndPaint(hwnd, &ps);
            return 0;
        }

        case WM_DESTROY:
            Audio::Shutdown();
            ReleaseResources();
            PostQuitMessage(0);
            return 0;
        }
        return DefWindowProcW(hwnd, msg, wParam, lParam);
    }
}

int WINAPI WinMain(HINSTANCE hInst, HINSTANCE, LPSTR, int nCmdShow) {
    g_sheet = LoadSpriteSheet();

    WNDCLASSW wc = {};
    wc.lpfnWndProc   = WndProc;
    wc.hInstance     = hInst;
    wc.hCursor       = LoadCursor(nullptr, IDC_ARROW);
    wc.lpszClassName = L"PaddleGameWindow";
    RegisterClassW(&wc);

    // 처음 창은 클라이언트 영역이 논리 해상도와 같도록. 크기 조절·최대화 가능 (비율은 유지됨)
    RECT wr = { 0, 0, static_cast<LONG>(World::Width), static_cast<LONG>(World::Height) };
    AdjustWindowRect(&wr, kWindowStyle, FALSE);

    HWND hwnd = CreateWindowW(wc.lpszClassName, L"Paddle Breakout", kWindowStyle,
                              CW_USEDEFAULT, CW_USEDEFAULT,
                              wr.right - wr.left, wr.bottom - wr.top,
                              nullptr, nullptr, hInst, nullptr);
    if (!hwnd) return 0;

    ShowWindow(hwnd, nCmdShow);
    UpdateWindow(hwnd);
    // 소리는 별도 스레드에서 준비·재생 (메인 스레드를 막지 않음)
    Audio::Init(FindAsset(L"bgm.wav"), FindAsset(L"start.wav"));

    QueryPerformanceFrequency(&g_freq);
    QueryPerformanceCounter(&g_prev);

    // 메시지가 없을 때 게임을 갱신하는 루프
    MSG msg = {};
    while (msg.message != WM_QUIT) {
        if (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
            continue;
        }

        LARGE_INTEGER now;
        QueryPerformanceCounter(&now);
        float dt = static_cast<float>(now.QuadPart - g_prev.QuadPart) / g_freq.QuadPart;
        g_prev = now;

        g_game.update(dt);
        InvalidateRect(hwnd, nullptr, FALSE);
        UpdateWindow(hwnd);
        Sleep(1);
    }
    return static_cast<int>(msg.wParam);
}
