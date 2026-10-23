// 게임 로직 전체 (PC 버전 Game.cpp 와 같은 규칙). 화면, 입력, 소리에 의존하지 않는다.
// 플랫폼 쪽은 입력 전달, update(dt) 호출, 상태를 읽어 그리기, takeEvents() 로 소리 처리만 한다.
import { Rect, Vec2 } from './geometry';
import {
  BALL_SPEED_MUL, BackgroundCount, Ball, Brick, Characters, Devil, DevilSprite, ITEM_INFO, ITEM_KINDS, Item, Paddle, Player, World,
  type BallKind, type ItemKind,
} from './objects';

export type GameState = 'menu' | 'playing';
export type GameResult = 'none' | 'gameover';
export type GameEvent = 'start' | 'stageClear' | 'gameOver' | 'brickBreak' | 'devilStomp' | 'revive' | 'itemGood' | 'itemBad' | 'skill';

const BALL_SPEED = 540;     // 1스테이지 공 빠르기 (픽셀/초)
const SPEED_STEP = 1.3;     // 스테이지마다 1.3배씩 빨라짐
const SPEED_MAX = 4;        // 하얀 공 기준 최대 4배
const SPEED_ABS_MAX = 2400; // 빨간 공이라도 이보다 빠르면 화면에서 보이지 않음 (픽셀/초)
// 아이템이나 능력으로 늘어나는 공의 색 확률 (처음 출발하는 공과 부활 공은 항상 하양)
const KIND_CHANCE: [BallKind, number][] = [['white', 0.4], ['red', 0.3], ['green', 0.3]];
const ITEM_CHANCE = 0.3;    // 일반 벽돌을 깰 때 아이템이 떨어질 확률 (노란 벽돌은 항상)
const ITEM_FALL_SPEED = 170; // 아이템이 떨어지는 빠르기 (픽셀/초)
const MAX_BALLS = 30;       // 화면에 동시에 있을 수 있는 공 수
const PAD_MIN = 24;         // 패들 길이 한계 (짧게 아이템을 여러 번 받아도)
const PAD_MAX = 240;        // (길게 아이템을 여러 번 받아도 화면 절반까지)
const SERVE_SPREAD = 16;    // 시작 공이 여러 개일 때 패들 위에서 벌려 놓는 간격
const SERVE_TIME = 1.4;     // 스테이지 시작 전 공이 기다리는 시간
const FILL_TIME = 0.9;      // 벽돌이 모두 나타나기까지 걸리는 시간
const POP_TIME = 0.16;      // 벽돌 하나가 톡 튀어나오는 시간

const DEVIL_FROM_STAGE = 2;
const DEVIL_WALK_SPEED = 30;
const DEVIL_WALK_MAX = 60;
const DEVIL_WALK_RANGE = 16;
const DEVIL_JUMP_EVERY = 2.0;
const DEVIL_JUMP_SPEED = 400;
const DEVIL_GRAVITY = 1000;
const STOMP_TIME = 0.18;
const STOMP_DEPTH = 5;
const BALL_SIZE = 10;
const MAX_DT = 1 / 30;
const WALL_FADE = 0.25;     // 회색 벽이 나타나는 시간

// 공이 오랫동안 벽돌을 못 깨면 같은 길만 도는 것으로 보고 각도를 살짝 바꾼다
const NUDGE_AFTER_PADDLE = 5;   // 패들에 맞을 때: 이 시간(초) 동안 못 깼으면
const NUDGE_AFTER_WALL = 10;    // 패들에 안 오고 벽 사이에 갇혔을 때
const NUDGE_MIN = 8 * Math.PI / 180;
const NUDGE_MAX = 20 * Math.PI / 180;
const MIN_ANGLE = 30 * Math.PI / 180;   // 공이 수평에 가까워지지 않게 (출발 각도와 같은 기준)

// 스테이지별 배치: '#' 벽돌, '*' 노란 벽돌(아이템이 꼭 떨어짐), '=' 회색 벽(안 깨짐), '.' 빈칸
// 회색 벽은 벽돌 아래에 짧게 한 줄만 두어 공이 튀는 방향만 바꾼다. 5스테이지마다 반복
const LAYOUTS: string[][] = [
  ['########', '##*##*##', '########', '#.####.#', '###**###', '........', '...==...'],
  ['...##...', '..#**#..', '.######.', '##*##*##', '########', '........', '==....=='],
  ['#.#.#.#.', '.#.#*#.#', '#.#.#.#.', '.#*#.#.#', '#.#.#.#.', '.#.#.#*#', '........', '.==..==.'],
  ['.##..##.', '########', '##*##*##', '.######.', '..####..', '...**...', '........', '=..==..='],
  ['########', '........', '#*####*#', '........', '########', '#**##**#', '........', '..=..=..'],
];

const BRICK_TOP = 60;
const BRICK_MARGIN = 20;
const BRICK_GAP = 4;
const BRICK_HEIGHT = 20;

const randInt = (n: number) => Math.floor(Math.random() * n);

export class Game {
  private state_: GameState = 'menu';
  private lastResult_: GameResult = 'none';
  private score_ = 0;
  private best_ = 0;
  private stage_ = 1;
  private background_ = -1;
  private serveTimer_ = 0;
  private introTime_ = 0;
  private selected_ = 0;
  private menuTime_ = 0;
  private revivesLeft_ = 0;   // 성녀: 남은 부활 횟수
  private reviving_ = false;  // 부활 직후 공이 기다리는 중 (안내 문구용)
  private skillUsed_ = false; // 꼬마: 이번 스테이지에 능력을 썼는지

  readonly paddle = new Paddle();
  readonly player = new Player();
  devil = new Devil();
  balls: Ball[] = [];
  items: Item[] = [];   // 떨어지는 아이템
  bricks: Brick[] = [];
  walls: Rect[] = [];   // 회색 벽 (깨지지 않음)
  private events_: GameEvent[] = [];

  constructor() {
    this.placeBottom();
    this.paddle.x = (World.Width - this.paddle.w) * 0.5;
    this.player.x = this.paddle.bounds().centerX - this.player.w * 0.5;
    this.pickBackground();
  }

  // ---------- 읽기 ----------
  get state(): GameState { return this.state_; }
  get lastResult(): GameResult { return this.lastResult_; }
  get score(): number { return this.score_; }
  get bestScore(): number { return this.best_; }
  get stage(): number { return this.stage_; }
  get background(): number { return this.background_; }
  get serving(): boolean { return this.serveTimer_ > 0; }
  get selected(): number { return this.selected_; }
  get menuTime(): number { return this.menuTime_; }
  get revivesLeft(): number { return this.revivesLeft_; }
  get reviving(): boolean { return this.reviving_ && this.serveTimer_ > 0; }
  get hasSkill(): boolean { return Characters.List[this.player.character].skill; }
  get skillUsed(): boolean { return this.skillUsed_; }
  // 꼬마 능력 버튼을 지금 누를 수 있는지 (공이 출발한 뒤, 스테이지마다 한 번)
  get skillReady(): boolean {
    return this.state_ === 'playing' && this.hasSkill && !this.skillUsed_ && this.serveTimer_ <= 0;
  }

  brickReveal(k: Brick): number {
    const t = (this.introTime_ - k.appearAt) / POP_TIME;
    return Math.max(0, Math.min(1, t));
  }

  wallReveal(): number { return Math.min(1, this.introTime_ / WALL_FADE); }

  stompDip(): number {
    const d = this.devil;
    if (!d.active || d.stompTimer <= 0) return 0;
    const t = 1 - d.stompTimer / STOMP_TIME;
    return STOMP_DEPTH * Math.sin(t * Math.PI);
  }

  takeEvents(): GameEvent[] {
    const out = this.events_;
    this.events_ = [];
    return out;
  }

  // 화면 비율이 바뀌어 세계 높이가 달라질 때 (캐릭터와 패들을 바닥으로)
  setWorldHeight(h: number): void {
    if (Math.abs(h - World.Height) < 0.5) return;
    World.Height = h;
    this.placeBottom();
    if (this.devil.active) this.updateDevil(0);
  }

  private placeBottom(): void {
    // 캐릭터는 바닥에 서고, 패들은 캐릭터 머리 위
    this.player.y = World.Height - this.player.h - 6;
    this.paddle.y = this.player.y - this.paddle.h - 6;
  }

  // ---------- 입력 ----------
  setBestScore(v: number): void { this.best_ = Math.max(this.best_, v); }

  setPaddleTarget(x: number): void { this.paddle.targetX = x; }

  selectCharacter(i: number): void {
    if (this.state_ !== 'menu') return;
    if (i < 0 || i >= Characters.List.length) return;
    this.selected_ = i;
    this.menuTime_ = 0;
  }

  moveSelection(delta: number): void {
    const n = Characters.List.length;
    this.selectCharacter((this.selected_ + delta + n) % n);
  }

  // 메뉴에서 누른 곳이 캐릭터 카드면 선택하고 true
  tapCard(x: number, y: number): boolean {
    if (this.state_ !== 'menu') return false;
    for (let i = 0; i < Characters.List.length; i++) {
      if (Characters.cardRect(i).contains(x, y)) {
        this.selectCharacter(i);
        return true;
      }
    }
    return false;
  }

  // 꼬마 능력: 공 2배. 썼으면 true
  useSkill(): boolean {
    if (!this.skillReady) return false;
    this.skillUsed_ = true;
    this.multiplyBalls(2);
    this.events_.push('skill');
    return true;
  }

  startGame(): void {
    if (this.state_ !== 'menu') return;
    this.score_ = 0;
    this.stage_ = 1;
    this.lastResult_ = 'none';
    this.player.character = this.selected_;
    this.player.animTime = 0;
    const ch = Characters.List[this.selected_];
    this.paddle.w = ch.paddleW;
    this.revivesLeft_ = ch.revives;      // 성녀는 부활 1회
    this.reviving_ = false;
    this.updatePaddle();
    this.player.x = this.paddle.bounds().centerX - this.player.w * 0.5;
    this.player.walking = false;

    this.pickBackground();   // 게임마다 배경을 무작위로
    this.startStage(true);
    this.state_ = 'playing';
    this.events_.push('start');
  }

  // 일시정지 화면에서 그만두기: 게임 오버 소리 없이 메뉴로
  quitToMenu(): void {
    if (this.state_ !== 'playing') return;
    this.endGame('none');
  }

  // ---------- 매 프레임 ----------
  update(dtIn: number): void {
    const dt = Math.min(dtIn, MAX_DT);   // 잠깐 멈췄다 돌아와도 dt 가 튀지 않게

    if (this.state_ !== 'playing') {
      this.menuTime_ += dt;
      return;
    }

    this.updatePaddle();
    this.updatePlayer(dt);
    this.introTime_ += dt;
    this.updateDevil(dt);

    // 스테이지 시작 대기: 공이 패들 위에 붙어 따라다니다가 시간이 되면 출발
    if (this.serveTimer_ > 0) {
      this.serveTimer_ = Math.max(0, this.serveTimer_ - dt);
      const n = this.balls.length;
      this.balls.forEach((b, i) => {
        const dx = (i - (n - 1) / 2) * SERVE_SPREAD;   // 엘프는 공 3개를 나란히
        b.pos = new Vec2(this.paddle.bounds().centerX + dx - b.size * 0.5, this.paddle.y - b.size * 1.5);
      });
      return;
    }

    for (const b of this.balls) this.moveBall(b, dt);
    this.updateItems(dt);

    // 아래로 빠진 공 제거
    this.balls = this.balls.filter((b) => b.pos.y <= World.Height);

    if (this.balls.length === 0) {
      if (this.revivesLeft_ > 0) {
        // 성녀: 벽돌은 그대로 두고 패들 위에서 공을 다시 출발
        this.revivesLeft_--;
        this.reviving_ = true;
        const spawn = new Vec2(this.paddle.bounds().centerX, this.paddle.y - BALL_SIZE);
        this.balls.push(this.makeBall(spawn));
        this.serveTimer_ = SERVE_TIME;
        this.events_.push('revive');
        return;
      }
      this.endGame('gameover');
      return;
    }

    // 벽돌을 다 깨면 다음 스테이지로
    if (!this.bricks.some((k) => k.alive)) {
      this.stage_++;
      this.pickBackground();
      this.startStage(true);
      this.events_.push('stageClear');
    }
  }

  // ---------- 내부 ----------
  private startStage(wait: boolean): void {
    const ch = Characters.List[this.player.character];
    this.balls = [];
    this.items = [];
    this.reviving_ = false;
    this.skillUsed_ = false;
    this.paddle.w = ch.paddleW;   // 아이템으로 바뀐 패들 길이는 스테이지마다 원래대로
    this.updatePaddle();
    this.resetBricks();
    this.introTime_ = 0;
    this.spawnDevil();
    const spawn = new Vec2(this.paddle.bounds().centerX, this.paddle.y - BALL_SIZE);
    for (let i = 0; i < ch.startBalls; i++) this.balls.push(this.makeBall(spawn));   // 엘프는 3개
    this.serveTimer_ = wait ? SERVE_TIME : 0;
  }

  private pickBackground(): void {
    let next = randInt(BackgroundCount);
    while (BackgroundCount > 1 && next === this.background_) next = randInt(BackgroundCount);
    this.background_ = next;
  }

  private ballSpeed(kind: BallKind = 'white'): number {
    const white = BALL_SPEED * Math.min(SPEED_MAX, Math.pow(SPEED_STEP, this.stage_ - 1));
    return Math.min(SPEED_ABS_MAX, white * BALL_SPEED_MUL[kind]);
  }

  private resetBricks(): void {
    this.bricks = [];
    const layout = LAYOUTS[(this.stage_ - 1) % LAYOUTS.length];
    const cols = layout[0].length;
    const w = (World.Width - BRICK_MARGIN * 2 - BRICK_GAP * (cols - 1)) / cols;
    const cell = (r: number, c: number) =>
      new Rect(BRICK_MARGIN + c * (w + BRICK_GAP), BRICK_TOP + r * (BRICK_HEIGHT + BRICK_GAP), w, BRICK_HEIGHT);
    layout.forEach((line, r) => {
      for (let c = 0; c < cols; c++) {
        const ch = line[c];
        if (ch !== '#' && ch !== '*') continue;
        this.bricks.push(new Brick(cell(r, c), r, ch === '*', Math.random() * FILL_TIME));
      }
    });
    this.walls = buildWalls(layout, cell);
  }

  private updatePaddle(): void {
    const x = this.paddle.targetX - this.paddle.w * 0.5;
    this.paddle.x = Math.max(0, Math.min(x, World.Width - this.paddle.w));
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    const newX = this.paddle.bounds().centerX - p.w * 0.5;
    const dx = newX - p.x;
    p.x = newX;
    if (Math.abs(dx) > 0.5) {
      p.facingLeft = dx < 0;
      p.walkTimer = 0.12;
    } else {
      p.walkTimer = Math.max(0, p.walkTimer - dt);
    }
    const was = p.walking;
    p.walking = p.walkTimer > 0;
    if (p.walking) p.animTime += dt;
    else if (was) p.animTime = 0;
  }

  private randomKind(): BallKind {
    let r = Math.random();
    for (const [k, p] of KIND_CHANCE) {
      if (r < p) return k;
      r -= p;
    }
    return 'white';
  }

  private makeBall(center: Vec2, kind: BallKind = 'white'): Ball {
    // 위쪽 30°~150° 범위의 임의 방향
    const a = (30 + Math.random() * 120) * Math.PI / 180;
    const b = new Ball();
    b.size = BALL_SIZE;
    b.pos = new Vec2(center.x - b.size * 0.5, center.y - b.size * 0.5);
    b.kind = kind;
    b.vel = new Vec2(Math.cos(a), -Math.sin(a)).scale(this.ballSpeed(kind));   // 화면 좌표는 y 가 아래로 증가
    return b;
  }

  private moveBall(b: Ball, dt: number): void {
    b.idle += dt;
    // 한 프레임 이동 거리를 공 크기의 절반 이하로 쪼개서 관통 방지
    const dist = b.vel.length() * dt;
    const steps = Math.max(1, Math.ceil(dist / (b.size * 0.5)));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      b.pos = b.pos.add(b.vel.scale(sdt));
      this.collideWalls(b);
      this.collidePaddle(b);
      this.collideSolids(b);
      this.collideBricks(b);
      if (b.pos.y > World.Height) break;
    }
  }

  // 공을 사각형 밖으로 밀어내고, 부딪친 면 쪽으로 튕긴다 (입사각 = 반사각)
  private bounceOff(b: Ball, r: Rect): void {
    const br = b.bounds();
    const overlapX = Math.min(br.right, r.right) - Math.max(br.left, r.left);
    const overlapY = Math.min(br.bottom, r.bottom) - Math.max(br.top, r.top);
    // 겹친 폭이 작은 축이 실제로 부딪친 면
    if (overlapX < overlapY) {
      const fromLeft = br.centerX < r.centerX;
      b.vel.x = fromLeft ? -Math.abs(b.vel.x) : Math.abs(b.vel.x);
      b.pos.x += fromLeft ? -overlapX - 0.01 : overlapX + 0.01;
    } else {
      const fromTop = br.centerY < r.centerY;
      b.vel.y = fromTop ? -Math.abs(b.vel.y) : Math.abs(b.vel.y);
      b.pos.y += fromTop ? -overlapY - 0.01 : overlapY + 0.01;
    }
  }

  // 회색 벽: 튕기기만 하고 깨지지 않는다. 벽 사이에 오래 갇혀 있으면 각도를 살짝 바꾼다
  private collideSolids(b: Ball): void {
    for (const r of this.walls) {
      if (!r.intersects(b.bounds())) continue;
      this.bounceOff(b, r);
      if (b.idle > NUDGE_AFTER_WALL) this.nudge(b);
    }
  }

  // 같은 길만 계속 도는 공의 방향을 8~20° 돌린다. 너무 눕지 않게 30°~150° 안에서
  private nudge(b: Ball): void {
    b.idle = 0;
    const speed = b.vel.length();
    const ySign = b.vel.y < 0 ? -1 : 1;
    const a0 = Math.atan2(Math.abs(b.vel.y), b.vel.x);   // 수평에서 잰 각 (0~180°)
    const d = (NUDGE_MIN + Math.random() * (NUDGE_MAX - NUDGE_MIN)) * (Math.random() < 0.5 ? -1 : 1);
    let a = a0 + d;
    if (a < MIN_ANGLE || a > Math.PI - MIN_ANGLE) a = a0 - d;
    a = Math.max(MIN_ANGLE, Math.min(Math.PI - MIN_ANGLE, a));
    b.vel = new Vec2(Math.cos(a) * speed, ySign * Math.sin(a) * speed);
  }

  private collideWalls(b: Ball): void {
    // 좌우 벽: x 성분만 반전
    if (b.pos.x < 0) {
      b.pos.x = 0;
      b.vel.x = Math.abs(b.vel.x);
    } else if (b.pos.x + b.size > World.Width) {
      b.pos.x = World.Width - b.size;
      b.vel.x = -Math.abs(b.vel.x);
    }
    // 천장: y 성분만 반전 (아래는 열려 있음)
    if (b.pos.y < 0) {
      b.pos.y = 0;
      b.vel.y = Math.abs(b.vel.y);
    }
  }

  private collidePaddle(b: Ball): void {
    if (b.vel.y <= 0) return;   // 내려오는 중일 때만
    if (!b.bounds().intersects(this.paddle.bounds())) return;
    // 입사각 = 반사각: y 성분만 반전
    b.pos.y = this.paddle.y - b.size;
    b.vel.y = -b.vel.y;
    // 한동안 벽돌을 못 깨고 패들과 벽 사이만 오가면 각도를 살짝 바꿔 준다
    if (b.idle > NUDGE_AFTER_PADDLE) this.nudge(b);
  }

  private collideBricks(b: Ball): void {
    const br = b.bounds();
    const k = this.bricks.find((q) => q.alive && q.rect.intersects(br));
    if (!k) return;

    const r = k.rect;
    this.bounceOff(b, r);
    b.idle = 0;

    k.alive = false;
    this.score_ += 10;
    this.events_.push('brickBreak');

    // 노란 벽돌은 항상, 일반 벽돌은 30% 확률로 아이템이 떨어진다
    if (k.item || Math.random() < ITEM_CHANCE) {
      const kind = ITEM_KINDS[randInt(ITEM_KINDS.length)];
      const it = new Item(kind, 0, 0);
      it.x = r.centerX - it.w / 2;
      it.y = r.centerY - it.h / 2;
      this.items.push(it);
    }
  }

  // ---------- 아이템 ----------
  private updateItems(dt: number): void {
    const pad = this.paddle.bounds();
    const keep: Item[] = [];
    for (const it of this.items) {
      it.y += ITEM_FALL_SPEED * dt;
      if (it.bounds().intersects(pad)) this.applyItem(it.kind);
      else if (it.y <= World.Height) keep.push(it);
    }
    this.items = keep;
  }

  private applyItem(kind: ItemKind): void {
    switch (kind) {
      case 'ballX2': this.multiplyBalls(2); break;
      case 'ballX3': this.multiplyBalls(3); break;
      case 'ballHalf': this.halveBalls(); break;
      case 'padLong': this.paddle.w = Math.min(PAD_MAX, this.paddle.w * 1.5); break;
      case 'padShort': this.paddle.w = Math.max(PAD_MIN, this.paddle.w / 3); break;
    }
    this.updatePaddle();
    this.events_.push(ITEM_INFO[kind].good ? 'itemGood' : 'itemBad');
  }

  // 지금 있는 공마다 (n-1)개씩 더 만든다. 새 공은 같은 자리에서 다른 방향, 색은 무작위
  private multiplyBalls(n: number): void {
    const add: Ball[] = [];
    for (const b of this.balls) {
      for (let i = 1; i < n; i++) {
        if (this.balls.length + add.length >= MAX_BALLS) break;
        add.push(this.cloneBall(b));
      }
    }
    this.balls.push(...add);
  }

  // 공을 절반으로 (홀수면 올림, 최소 1개). 어느 공이 사라질지는 무작위
  private halveBalls(): void {
    const keep = Math.ceil(this.balls.length / 2);
    const shuffled = [...this.balls].sort(() => Math.random() - 0.5);
    this.balls = shuffled.slice(0, keep);
  }

  private cloneBall(src: Ball): Ball {
    const kind = this.randomKind();
    const a = (30 + Math.random() * 120) * Math.PI / 180;
    const ySign = src.vel.y < 0 ? -1 : 1;
    const b = new Ball(new Vec2(src.pos.x, src.pos.y));
    b.size = src.size;
    b.kind = kind;
    b.vel = new Vec2(Math.cos(a), ySign * Math.sin(a)).scale(this.ballSpeed(kind));
    return b;
  }

  private spawnDevil(): void {
    this.devil = new Devil();
    if (this.stage_ < DEVIL_FROM_STAGE) return;
    const d = this.devil;
    const speed = Math.min(DEVIL_WALK_MAX, DEVIL_WALK_SPEED + 4 * (this.stage_ - DEVIL_FROM_STAGE));
    d.active = true;
    d.dropping = true;
    d.airborne = true;
    d.lift = this.paddle.y;   // 화면 위 밖에서 떨어지며 등장
    d.liftVel = 0;
    d.jumpSpeed = DEVIL_JUMP_SPEED;
    d.jumpKind = randInt(DevilSprite.JumpKinds);
    d.walkVel = Math.random() < 0.5 ? speed : -speed;
    d.facingLeft = d.walkVel < 0;
    d.jumpTimer = DEVIL_JUMP_EVERY;
    this.updateDevil(0);
  }

  private updateDevil(dt: number): void {
    const d = this.devil;
    if (!d.active) return;

    d.animTime += dt;
    d.stompTimer = Math.max(0, d.stompTimer - dt);

    if (!d.airborne) {
      // 패들 위에서 조금씩 왔다 갔다
      d.offset += d.walkVel * dt;
      if (d.offset > DEVIL_WALK_RANGE) { d.offset = DEVIL_WALK_RANGE; d.walkVel = -Math.abs(d.walkVel); }
      if (d.offset < -DEVIL_WALK_RANGE) { d.offset = -DEVIL_WALK_RANGE; d.walkVel = Math.abs(d.walkVel); }
      d.facingLeft = d.walkVel < 0;
    }

    // 2초마다 점프. 모션은 3종 중 무작위
    if (!d.dropping) d.jumpTimer -= dt;
    if (!d.airborne && d.jumpTimer <= 0) {
      d.airborne = true;
      d.jumpKind = randInt(DevilSprite.JumpKinds);
      d.jumpSpeed = DEVIL_JUMP_SPEED;
      d.liftVel = DEVIL_JUMP_SPEED;
      d.jumpTimer += DEVIL_JUMP_EVERY;
    }

    if (d.airborne) {
      d.liftVel -= DEVIL_GRAVITY * dt;
      d.lift += d.liftVel * dt;
      if (d.lift <= 0) {   // 패들 위에 쿵 착지
        d.lift = 0;
        d.liftVel = 0;
        d.airborne = false;
        d.dropping = false;
        d.stompTimer = STOMP_TIME;
        this.events_.push('devilStomp');
      }
    }

    // 패들을 따라다님 (좌우 반전 시 몸통 위치가 달라 기준점을 다르게)
    const bodyX = this.paddle.bounds().centerX + d.offset;
    d.x = bodyX - (d.facingLeft ? 69 : 59);
    d.y = this.paddle.y - DevilSprite.Cell - d.lift;
  }

  private endGame(result: GameResult): void {
    this.lastResult_ = result;
    this.best_ = Math.max(this.best_, this.score_);
    this.balls = [];
    this.items = [];
    this.devil.active = false;
    this.state_ = 'menu';
    if (result === 'gameover') this.events_.push('gameOver');
  }
}

// 배치 글자에서 회색 벽('=') 사각형 만들기.
// 이어진 칸은 하나로 합쳐서 칸 사이 틈(4px)이 없게 한다. 이음매에서 공이 엉뚱한 방향으로 튀지 않게.
// 맨 왼쪽·오른쪽 칸의 벽은 화면 끝까지 늘려서 가장자리로 공이 빠져나가지 못하게 한다.
function buildWalls(layout: string[], cell: (r: number, c: number) => Rect): Rect[] {
  const isWall = (r: number, c: number) => layout[r]?.[c] === '=';
  const rows = layout.length;
  const cols = layout[0].length;
  const used = new Set<string>();
  const walls: Rect[] = [];
  const leftOf = (r: number, c: number) => (c === 0 ? 0 : cell(r, c).left);
  const rightOf = (r: number, c: number) => (c === cols - 1 ? World.Width : cell(r, c).right);

  // 세로로 두 칸 이상 이어지면 기둥 하나로
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (!isWall(r, c) || isWall(r - 1, c)) continue;
      let e = r;
      while (isWall(e + 1, c)) e++;
      if (e === r) continue;
      const top = cell(r, c);
      walls.push(new Rect(leftOf(r, c), top.y, rightOf(r, c) - leftOf(r, c), cell(e, c).bottom - top.y));
      for (let i = r; i <= e; i++) used.add(`${i},${c}`);
    }
  }

  // 나머지는 가로로 이어진 칸끼리 하나로. 옆에 기둥이 붙어 있으면 그 사이 틈까지 덮는다
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isWall(r, c) || used.has(`${r},${c}`)) continue;
      let e = c;
      while (isWall(r, e + 1) && !used.has(`${r},${e + 1}`)) e++;
      let left = leftOf(r, c);
      let right = rightOf(r, e);
      if (isWall(r, c - 1)) left = cell(r, c - 1).right;
      if (isWall(r, e + 1)) right = cell(r, e + 1).left;
      walls.push(new Rect(left, cell(r, c).top, right - left, cell(r, c).h));
      c = e;
    }
  }
  return walls;
}
