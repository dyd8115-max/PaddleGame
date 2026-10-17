#pragma once
#include "Geometry.h"

// 논리 좌표계 크기. 실제 창/화면 크기와 무관하게 게임은 이 좌표로만 계산한다.
namespace World {
    constexpr float Width  = 480.f;
    constexpr float Height = 640.f;
}

// 캐릭터 정보 (characters.bmp 의 행 순서와 같아야 함)
struct CharacterDef {
    const wchar_t* name;
    float          fps;    // 걷기 애니메이션 속도
};

namespace Characters {
    constexpr int   Count      = 3;
    constexpr int   FrameCount = 16;    // 걷기 한 주기 프레임 수
    constexpr float CellW      = 67.f;  // 시트 한 칸 크기 (모든 캐릭터 공통)
    constexpr float CellH      = 80.f;

    const CharacterDef List[Count] = {
        { L"KID",   15.f },
        { L"ELF",   13.f },
        { L"SAINT", 16.f },
    };

    // 시작 메뉴의 캐릭터 카드 위치 (논리 좌표)
    inline Rect cardRect(int i) {
        const float w = 120.f, h = 150.f, gap = 30.f;
        const float left = (World::Width - (w * Count + gap * (Count - 1))) * 0.5f;
        return Rect(left + i * (w + gap), 190.f, w, h);
    }
}

// 배경 그림 (backgrounds.bmp 에 세로로 쌓인 개수와 같아야 함)
namespace Backgrounds {
    constexpr int Count = 6;
}

struct Ball {
    Vec2  pos;          // 좌상단 좌표
    Vec2  vel;          // 속도 벡터 (방향 + 빠르기), 단위: 픽셀/초
    float size = 10.f;

    Rect bounds() const { return Rect(pos.x, pos.y, size, size); }
};

struct Paddle {
    float x = 0.f, y = 0.f;
    float w = 80.f, h = 12.f;
    float targetX = World::Width * 0.5f;   // 마우스가 지정하는 목표 중심 x

    Rect bounds() const { return Rect(x, y, w, h); }
};

// 패들 아래에서 패들을 따라 걷는 캐릭터 (충돌 없음, 표시 전용)
struct Player {
    float x = 0.f, y = 0.f;
    float w = Characters::CellW, h = Characters::CellH;
    int   character  = 0;
    bool  facingLeft = false;
    bool  walking    = false;
    float walkTimer  = 0.f;        // 멈춘 뒤에도 잠깐 걷기 유지 (마우스 미세 떨림 대응)
    float animTime   = 0.f;

    int frame() const {
        if (!walking) return 0;
        float fps = Characters::List[character].fps;
        return static_cast<int>(animTime * fps) % Characters::FrameCount;
    }
    Rect bounds() const { return Rect(x, y, w, h); }
};

struct Brick {
    Rect rect;
    int  row   = 0;      // 그리기 색 결정용
    bool alive = true;
    bool item  = false;  // 깨지면 공 하나 추가
    float appearAt = 0.f;   // 스테이지 시작 후 이 시각(초)에 나타남 (무작위 순서 연출)
};
