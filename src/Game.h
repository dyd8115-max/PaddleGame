#pragma once
#include <random>
#include <vector>
#include "GameObjects.h"

enum class GameState { Menu, Playing };
enum class GameResult { None, GameOver, Clear };

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
    int        selected()   const { return selected_; }
    float      menuTime()   const { return menuTime_; }
    const Paddle&             paddle() const { return paddle_; }
    const Player&             player() const { return player_; }
    const std::vector<Ball>&  balls()  const { return balls_; }
    const std::vector<Brick>& bricks() const { return bricks_; }

private:
    void resetBricks();
    void updatePaddle();
    void updatePlayer(float dt);
    Ball makeBall(const Vec2& center);
    void moveBall(Ball& b, float dt);
    void collideWalls(Ball& b);
    void collidePaddle(Ball& b);
    void collideBricks(Ball& b);
    void endGame(GameResult result);

    GameState  state_      = GameState::Menu;
    GameResult lastResult_ = GameResult::None;
    int score_     = 0;
    int bestScore_ = 0;
    int   selected_ = 0;      // 메뉴에서 고른 캐릭터
    float menuTime_ = 0.f;    // 메뉴 카드 애니메이션용

    Paddle             paddle_;
    Player             player_;
    std::vector<Ball>  balls_;
    std::vector<Ball>  pendingBalls_;   // 순회 중 추가되는 공 (아이템)
    std::vector<Brick> bricks_;

    std::mt19937 rng_;
};
