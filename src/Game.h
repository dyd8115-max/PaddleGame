#pragma once
#include <random>
#include <vector>
#include "GameObjects.h"

enum class GameState { Menu, Playing };
enum class GameResult { None, GameOver };

// 소리 등 플랫폼 쪽 반응이 필요한 사건. 플랫폼 계층이 takeEvents()로 가져가 처리한다
enum class GameEvent { Start, StageClear, GameOver, BrickBreak, DevilStomp };

// 게임 로직 전체. Win32/GDI에 의존하지 않는다.
// 플랫폼 계층은 입력 전달(startGame, setPaddleTarget), update(dt) 호출, 상태 읽어서 그리기만 담당.
class Game {
public:
    Game();

    // 입력
    void startGame();                 // 메뉴에서 시작 키
    void setPaddleTarget(float x);    // 논리 좌표 기준 x
    void selectCharacter(int index);  // 메뉴에서 캐릭터 직접 선택
    void moveSelection(int delta);    // 메뉴에서 좌우 이동 (-1 / +1)
    void clickAt(float x, float y);   // 메뉴에서 클릭 (논리 좌표)

    // 매 프레임 호출 (dt: 초 단위 경과 시간)
    void update(float dt);

    // 그리기용 읽기 전용 접근
    GameState  state()      const { return state_; }
    GameResult lastResult() const { return lastResult_; }
    int        score()      const { return score_; }
    int        bestScore()  const { return bestScore_; }
    int        stage()      const { return stage_; }
    int        background() const { return background_; }   // 지금 쓰는 배경 번호
    bool       serving()    const { return serveTimer_ > 0.f; }   // 스테이지 시작 전 대기 중

    // 벽돌이 나타난 정도 (0: 아직 안 보임 ~ 1: 다 나타남). 그리기에서 크기·색 연출에 사용
    float brickReveal(const Brick& k) const;
    int        selected()   const { return selected_; }
    float      menuTime()   const { return menuTime_; }
    const Paddle&             paddle() const { return paddle_; }
    const Player&             player() const { return player_; }
    const Devil&              devil()  const { return devil_; }
    float                     stompDip() const;   // 악마가 착지해 패들이 눌린 깊이 (그리기용, 픽셀)
    const std::vector<Ball>&  balls()  const { return balls_; }
    const std::vector<Brick>& bricks() const { return bricks_; }

    // 이번 프레임까지 쌓인 사건을 꺼내고 비움
    std::vector<GameEvent> takeEvents();

private:
    void resetBricks();
    void startStage(bool waitBeforeLaunch);
    void pickBackground();
    float ballSpeed() const;
    void updatePaddle();
    void updatePlayer(float dt);
    Ball makeBall(const Vec2& center);
    void moveBall(Ball& b, float dt);
    void collideWalls(Ball& b);
    void collidePaddle(Ball& b);
    void collideBricks(Ball& b);
    void spawnDevil();
    void updateDevil(float dt);
    void endGame(GameResult result);

    GameState  state_      = GameState::Menu;
    GameResult lastResult_ = GameResult::None;
    int score_     = 0;
    int bestScore_ = 0;
    int   stage_      = 1;
    int   background_ = 0;
    float serveTimer_ = 0.f;  // 0보다 크면 공이 패들 위에서 대기
    float introTime_  = 0.f;  // 스테이지가 시작된 뒤 지난 시간 (벽돌 등장 연출용)
    int   selected_ = 0;      // 메뉴에서 고른 캐릭터
    float menuTime_ = 0.f;    // 메뉴 카드 애니메이션용

    Paddle             paddle_;
    Player             player_;
    Devil              devil_;
    std::vector<Ball>  balls_;
    std::vector<Ball>  pendingBalls_;   // 순회 중 추가되는 공 (아이템)
    std::vector<Brick> bricks_;
    std::vector<GameEvent> events_;

    std::mt19937 rng_;
};
