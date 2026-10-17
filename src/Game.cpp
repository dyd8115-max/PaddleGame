#include "Game.h"
#include <algorithm>
#include <cmath>
#include <string>

namespace {
    constexpr float kPi        = 3.14159265f;
    constexpr float kBallSpeed = 360.f;   // 1스테이지 공 빠르기 (픽셀/초)
    constexpr float kSpeedStep = 0.08f;   // 스테이지마다 8%씩 빨라짐
    constexpr float kSpeedMax  = 1.6f;    // 최대 1.6배
    constexpr float kServeTime = 1.4f;    // 스테이지 시작 전 공이 기다리는 시간 (초)
    constexpr float kFillTime  = 0.9f;    // 벽돌이 모두 나타나기까지 걸리는 시간
    constexpr float kPopTime   = 0.16f;   // 벽돌 하나가 톡 튀어나오는 시간
    constexpr float kBallSize  = 10.f;
    constexpr float kMaxDt     = 1.f / 30.f;

    // 스테이지별 벽돌 배치: '#' 일반, '*' 아이템(공 추가), '.' 빈칸
    // 마지막 배치까지 깨면 처음 배치로 돌아가고, 공은 계속 빨라진다
    const std::vector<std::vector<std::string>> kLayouts = {
        { "########",
          "##*##*##",
          "########",
          "#.####.#",
          "###**###" },
        { "...##...",
          "..#**#..",
          ".######.",
          "##*##*##",
          "########" },
        { "#.#.#.#.",
          ".#.#*#.#",
          "#.#.#.#.",
          ".#*#.#.#",
          "#.#.#.#.",
          ".#.#.#*#" },
        { ".##..##.",
          "########",
          "##*##*##",
          ".######.",
          "..####..",
          "...**..." },
        { "########",
          "........",
          "#*####*#",
          "........",
          "########",
          "#**##**#" },
    };

    constexpr float kBrickTop    = 60.f;
    constexpr float kBrickMargin = 20.f;
    constexpr float kBrickGap    = 4.f;
    constexpr float kBrickHeight = 20.f;
}

Game::Game() : rng_(std::random_device{}()) {
    // 캐릭터는 바닥에 서고, 패들은 캐릭터 머리 위에 위치
    player_.y = World::Height - player_.h - 6.f;
    paddle_.y = player_.y - paddle_.h - 6.f;
    paddle_.x = (World::Width - paddle_.w) * 0.5f;
    player_.x = paddle_.bounds().centerX() - player_.w * 0.5f;
}

void Game::startGame() {
    if (state_ != GameState::Menu) return;

    score_ = 0;
    stage_ = 1;
    player_.character = selected_;
    player_.animTime  = 0.f;
    updatePaddle();
    player_.x       = paddle_.bounds().centerX() - player_.w * 0.5f;
    player_.walking = false;

    background_ = -1;
    pickBackground();    // 게임마다 배경을 무작위로
    startStage(true);    // 벽돌이 다 채워진 뒤 공 출발
    state_ = GameState::Playing;
    events_.push_back(GameEvent::Start);
}

void Game::startStage(bool waitBeforeLaunch) {
    balls_.clear();
    pendingBalls_.clear();
    resetBricks();
    introTime_ = 0.f;

    // 공은 아래면(패들 위)에서 생성되어 위쪽 임의 방향으로 출발
    Vec2 spawn(paddle_.bounds().centerX(), paddle_.y - kBallSize);
    balls_.push_back(makeBall(spawn));
    serveTimer_ = waitBeforeLaunch ? kServeTime : 0.f;
}

void Game::pickBackground() {
    // 직전 배경과 다른 것으로 고름
    std::uniform_int_distribution<int> pick(0, Backgrounds::Count - 1);
    int next = pick(rng_);
    while (Backgrounds::Count > 1 && next == background_) next = pick(rng_);
    background_ = next;
}

float Game::brickReveal(const Brick& k) const {
    float t = (introTime_ - k.appearAt) / kPopTime;
    return std::max(0.f, std::min(1.f, t));
}

float Game::ballSpeed() const {
    return kBallSpeed * std::min(kSpeedMax, 1.f + kSpeedStep * (stage_ - 1));
}

std::vector<GameEvent> Game::takeEvents() {
    std::vector<GameEvent> out;
    out.swap(events_);
    return out;
}

void Game::setPaddleTarget(float x) {
    paddle_.targetX = x;
}

void Game::selectCharacter(int index) {
    if (state_ != GameState::Menu) return;
    if (index < 0 || index >= Characters::Count) return;
    selected_ = index;
    menuTime_ = 0.f;
}

void Game::moveSelection(int delta) {
    // 양 끝에서 반대쪽으로 넘어가도록 순환
    selectCharacter((selected_ + delta + Characters::Count) % Characters::Count);
}

void Game::clickAt(float x, float y) {
    if (state_ != GameState::Menu) return;
    Rect point(x, y, 0.01f, 0.01f);
    for (int i = 0; i < Characters::Count; ++i) {
        if (Characters::cardRect(i).intersects(point)) {
            selectCharacter(i);
            return;
        }
    }
}

void Game::update(float dt) {
    dt = std::min(dt, kMaxDt);   // 창 이동 등으로 dt가 튀는 것 방지

    if (state_ != GameState::Playing) {
        menuTime_ += dt;
        return;
    }

    updatePaddle();
    updatePlayer(dt);
    introTime_ += dt;

    // 스테이지 시작 대기: 공이 패들 위에 붙어서 따라다니다가 시간이 되면 출발
    if (serveTimer_ > 0.f) {
        serveTimer_ = std::max(0.f, serveTimer_ - dt);
        for (Ball& b : balls_) {
            b.pos = Vec2(paddle_.bounds().centerX() - b.size * 0.5f, paddle_.y - b.size * 1.5f);   // 생성 위치와 같은 높이
        }
        return;
    }

    for (Ball& b : balls_) moveBall(b, dt);

    // 아이템으로 생긴 공은 순회가 끝난 뒤 합친다 (반복자 무효화 방지)
    balls_.insert(balls_.end(), pendingBalls_.begin(), pendingBalls_.end());
    pendingBalls_.clear();

    // 아래로 빠진 공 제거
    balls_.erase(std::remove_if(balls_.begin(), balls_.end(),
                     [](const Ball& b) { return b.pos.y > World::Height; }),
                 balls_.end());

    if (balls_.empty()) {
        endGame(GameResult::GameOver);
        return;
    }

    // 벽돌을 다 깨면 끝나지 않고 다음 스테이지로
    bool anyAlive = std::any_of(bricks_.begin(), bricks_.end(),
                                [](const Brick& k) { return k.alive; });
    if (!anyAlive) {
        ++stage_;
        pickBackground();   // 스테이지가 바뀌면 배경도 바뀜
        startStage(true);
        events_.push_back(GameEvent::StageClear);
    }
}

void Game::resetBricks() {
    bricks_.clear();
    const std::vector<std::string>& kLayout = kLayouts[(stage_ - 1) % kLayouts.size()];
    const int cols = static_cast<int>(kLayout.front().size());
    const float w = (World::Width - kBrickMargin * 2 - kBrickGap * (cols - 1)) / cols;

    for (int r = 0; r < static_cast<int>(kLayout.size()); ++r) {
        for (int c = 0; c < cols; ++c) {
            char ch = kLayout[r][c];
            if (ch == '.') continue;

            Brick k;
            k.rect = Rect(kBrickMargin + c * (w + kBrickGap),
                          kBrickTop + r * (kBrickHeight + kBrickGap),
                          w, kBrickHeight);
            k.row  = r;
            k.item = (ch == '*');
            k.appearAt = std::uniform_real_distribution<float>(0.f, kFillTime)(rng_);   // 무작위 순서로 등장
            bricks_.push_back(k);
        }
    }
}

void Game::updatePaddle() {
    // 입력이 준 목표 x로 즉시 이동, 화면 밖으로 나가지 않게 제한
    float x = paddle_.targetX - paddle_.w * 0.5f;
    paddle_.x = std::max(0.f, std::min(x, World::Width - paddle_.w));
}

void Game::updatePlayer(float dt) {
    // 캐릭터는 항상 패들 중앙 아래
    float newX = paddle_.bounds().centerX() - player_.w * 0.5f;
    float dx   = newX - player_.x;
    player_.x  = newX;

    if (std::fabs(dx) > 0.5f) {
        player_.facingLeft = (dx < 0.f);
        player_.walkTimer  = 0.12f;
    } else {
        player_.walkTimer = std::max(0.f, player_.walkTimer - dt);
    }

    bool wasWalking  = player_.walking;
    player_.walking  = (player_.walkTimer > 0.f);
    if (player_.walking) player_.animTime += dt;
    else if (wasWalking) player_.animTime = 0.f;   // 멈추면 기본 자세로
}

Ball Game::makeBall(const Vec2& center) {
    // 위쪽 30°~150° 범위의 임의 방향
    std::uniform_real_distribution<float> deg(30.f, 150.f);
    float a = deg(rng_) * kPi / 180.f;

    Ball b;
    b.size = kBallSize;
    b.pos  = Vec2(center.x - b.size * 0.5f, center.y - b.size * 0.5f);
    b.vel  = Vec2(std::cos(a), -std::sin(a)) * ballSpeed();  // 화면 좌표계는 y가 아래로 증가
    return b;
}

void Game::moveBall(Ball& b, float dt) {
    // 한 프레임 이동 거리를 공 크기의 절반 이하로 쪼개서 벽돌/패들 관통 방지
    float dist  = b.vel.length() * dt;
    int   steps = std::max(1, static_cast<int>(std::ceil(dist / (b.size * 0.5f))));
    float sdt   = dt / steps;

    for (int i = 0; i < steps; ++i) {
        b.pos += b.vel * sdt;
        collideWalls(b);
        collidePaddle(b);
        collideBricks(b);
        if (b.pos.y > World::Height) break;
    }
}

void Game::collideWalls(Ball& b) {
    // 좌우 벽: x 성분만 반전
    if (b.pos.x < 0.f) {
        b.pos.x = 0.f;
        b.vel.x = std::fabs(b.vel.x);
    } else if (b.pos.x + b.size > World::Width) {
        b.pos.x = World::Width - b.size;
        b.vel.x = -std::fabs(b.vel.x);
    }
    // 천장: y 성분만 반전 (아래면은 열려 있음)
    if (b.pos.y < 0.f) {
        b.pos.y = 0.f;
        b.vel.y = std::fabs(b.vel.y);
    }
}

void Game::collidePaddle(Ball& b) {
    if (b.vel.y <= 0.f) return;   // 내려오는 중일 때만
    if (!b.bounds().intersects(paddle_.bounds())) return;

    // 입사각 = 반사각: y 성분만 반전
    b.pos.y = paddle_.y - b.size;
    b.vel.y = -b.vel.y;
}

void Game::collideBricks(Ball& b) {
    const Rect br = b.bounds();
    auto it = std::find_if(bricks_.begin(), bricks_.end(),
                           [&br](const Brick& k) { return k.alive && k.rect.intersects(br); });
    if (it == bricks_.end()) return;

    const Rect& r = it->rect;
    float overlapX = std::min(br.right(), r.right()) - std::max(br.left(), r.left());
    float overlapY = std::min(br.bottom(), r.bottom()) - std::max(br.top(), r.top());

    // 겹친 폭이 작은 축이 실제로 부딪친 면 → 그 축 성분만 반전
    if (overlapX < overlapY) {
        b.vel.x = -b.vel.x;
        b.pos.x += (br.centerX() < r.centerX()) ? -overlapX : overlapX;
    } else {
        b.vel.y = -b.vel.y;
        b.pos.y += (br.centerY() < r.centerY()) ? -overlapY : overlapY;
    }

    it->alive = false;
    score_ += 10;
    events_.push_back(GameEvent::BrickBreak);

    if (it->item) {
        pendingBalls_.push_back(makeBall(Vec2(r.centerX(), r.centerY())));
    }
}

void Game::endGame(GameResult result) {
    lastResult_ = result;
    bestScore_  = std::max(bestScore_, score_);
    balls_.clear();
    state_ = GameState::Menu;   // 게임 종료 시 시작 메뉴로 복귀
    if (result == GameResult::GameOver) events_.push_back(GameEvent::GameOver);
}
