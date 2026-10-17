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

// 악마 스프라이트 정보 (devil.bmp 의 배치와 같아야 함)
namespace DevilSprite {
    constexpr float Cell       = 128.f;   // 한 칸 크기. 화면에 1배로 그림
    constexpr int   WalkFrames = 8;
    constexpr float WalkFps    = 10.f;
    constexpr int   JumpKinds  = 3;       // 점프 모션 3종 (뛸 때마다 하나를 무작위로)
    inline int jumpFrames(int kind) { return kind == 0 ? 6 : 5; }
}

// 2스테이지부터 주인공의 패들 위에 올라타 짓밟고 서 있는 방해꾼.
// 패들을 따라다니며 그 위에서 조금씩 왔다 갔다 하고, 2초마다 점프했다가 패들 위로 쿵 떨어진다.
// 공과 부딪히지 않고, 공보다 앞에 그려져서 패들 쪽으로 내려오는 공을 가린다
struct Devil {
    bool  active     = false;
    bool  dropping   = true;    // 등장할 때 위에서 떨어지는 중
    float offset     = 0.f;     // 패들 중심 기준 몸통 중심의 가로 위치
    float walkVel    = 0.f;     // 패들 위에서 걷는 빠르기
    float lift       = 0.f;     // 패들 윗면에서 발까지 높이 (0 이면 밟고 서 있음)
    float liftVel    = 0.f;     // 위쪽이 +
    bool  facingLeft = false;
    bool  airborne   = false;
    int   jumpKind   = 0;       // 이번 점프에 쓰는 모션 (0~2)
    float jumpSpeed  = 0.f;     // 이번 점프의 처음 위쪽 속도 (점프 장면 고르기용)
    float jumpTimer  = 0.f;     // 다음 점프까지 남은 시간
    float animTime   = 0.f;
    float stompTimer = 0.f;     // 착지 직후 패들이 눌리는 연출 남은 시간
    float x = 0.f, y = 0.f;     // 그리기용 스프라이트 칸 좌상단 (매 프레임 계산)

    Rect bounds() const { return Rect(x, y, DevilSprite::Cell, DevilSprite::Cell); }

    int anim() const { return airborne ? 1 + jumpKind : 0; }   // 0 걷기, 1~3 점프
    int frame() const {
        if (!airborne) {
            return static_cast<int>(animTime * DevilSprite::WalkFps) % DevilSprite::WalkFrames;
        }
        // 올라감 → 꼭대기 → 내려옴: 위아래 속도에 맞춰 장을 고름
        const int n = DevilSprite::jumpFrames(jumpKind);
        float p = (jumpSpeed - liftVel) / (2.f * jumpSpeed);
        p = p < 0.f ? 0.f : (p > 0.999f ? 0.999f : p);
        return static_cast<int>(p * n);
    }
};

struct Brick {
    Rect rect;
    int  row   = 0;      // 그리기 색 결정용
    bool alive = true;
    bool item  = false;  // 깨지면 공 하나 추가
    float appearAt = 0.f;   // 스테이지 시작 후 이 시각(초)에 나타남 (무작위 순서 연출)
};
