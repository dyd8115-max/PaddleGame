// 엘프 모드: 직접 조준해서 쏘는 스와이프 벽돌깨기
//
// - 아래쪽을 밀면 엘프가 걸어가 쏠 자리를 고르고, 위쪽을 누른 채 아래로 당기면 반대쪽으로 조준선이 보인다
// - 손을 떼면 가진 공을 차례로 쏜다. 기록은 도달한 라운드. 조준 단계마다 중간 저장
// - 벽돌의 숫자만큼 맞혀야 깨진다. 초록 동그라미(+1, 두 줄에 하나)를 지나가면 다음 차례부터 공이 하나 늘어난다
// - 공이 모두 바닥에 돌아오면 새 벽돌 줄이 1~3줄(50%, 30%, 20%) 생기면서 한꺼번에 내려온다. 바닥선에 닿으면 끝
// - 공 빠르기는 라운드와 상관없이 일정하다 (한 차례가 오래 걸리면 빨라지기만 함)
import { Rect, Vec2 } from './geometry';
import { Ball, World } from './objects';
import { bounceOff, collideBorders, nudge } from './collide';

export type SwipePhase = 'aim' | 'shoot' | 'advance';

export interface SwipeHost {
  floorY(): number;             // 공이 굴러와 멈추는 바닥 높이 (공 아랫면)
  brickHit(broken: boolean): void;
  pickup(): void;
  rowsAdded(): void;
  gameOver(): void;
}

const COLS = 7;
const SIDE = 8;               // 좌우 여백
const GAP = 4;
const TOP = 56;               // 맨 윗줄 위치
const CELL_H = 40;
const ROW_H = CELL_H + GAP;
export const CELL_W = (World.Width - SIDE * 2 - GAP * (COLS - 1)) / COLS;
const PICK_R = 13;            // +1 동그라미 반지름

const BALL_SIZE = 10;
const SPEED = 780;            // 공 빠르기 (픽셀/초). 라운드가 올라가도 그대로
const LAUNCH_GAP = 0.075;     // 공을 한 개씩 쏘는 간격 (초)
const FAST_AFTER = 8;         // 한 차례가 이 시간(초)보다 길어지면 공을 2배 빠르게
const MIN_AIM = 10 * Math.PI / 180;   // 너무 눕혀 쏘지 못하게
const PULL_MIN = 22;          // 이만큼은 당겨야 조준
const SLIDE_TIME = 0.22;      // 벽돌이 한 줄 내려오는 시간 (여러 줄이면 조금 더 길게)
const ROWS_CHANCE = [0.5, 0.3, 0.2];   // 한 차례 뒤 새로 생기는 줄 수 1, 2, 3 의 확률
const NUDGE_AFTER = 6;        // 벽돌을 못 맞히고 벽만 튕기는 시간이 길면 방향을 살짝 바꿈

const randInt = (n: number) => Math.floor(Math.random() * n);

export class SwipeBrick {
  constructor(public col: number, public row: number, public hp: number) {}
}

export class Pickup {
  constructor(public col: number, public row: number) {}
}

// 중간 저장: 조준 단계의 판 상태
export interface SwipeSave {
  round: number;
  ballCount: number;
  launchX: number;
  rowCount: number;
  bricks: [number, number, number][];   // 칸, 줄, 숫자
  pickups: [number, number][];          // 칸, 줄
}

export class Swipe {
  phase: SwipePhase = 'aim';
  round = 1;
  ballCount = 1;            // 가진 공 수
  launchX = World.Width / 2; // 쏠 자리 (공 가운데 x). 조준 단계에서 엘프가 걸어가 정한다
  rowCount = 0;              // 지금까지 만든 줄 수 (+1 은 두 줄에 하나)
  newRows = 1;               // 이번에 새로 생긴 줄 수 (내려오는 그림용)
  bricks: SwipeBrick[] = [];
  pickups: Pickup[] = [];
  balls: Ball[] = [];        // 날아가는 공
  toLaunch = 0;              // 아직 안 쏜 공 수
  collected = 0;             // 이번 차례에 먹은 +1
  slide = 1;                 // 줄 내려오기 진행 (0 → 1)

  private aiming_ = false;
  private aimFrom = new Vec2();
  private aimTo = new Vec2();
  private shotDir = new Vec2(0, -1);
  private launchTimer = 0;
  private turnTime = 0;
  private fast = false;

  constructor(private host: SwipeHost, save?: SwipeSave) {
    if (save) {
      this.round = save.round;
      this.ballCount = save.ballCount;
      this.launchX = save.launchX;
      this.rowCount = save.rowCount;
      this.bricks = save.bricks.map(([c, r, hp]) => new SwipeBrick(c, r, hp));
      this.pickups = save.pickups.map(([c, r]) => new Pickup(c, r));
    } else {
      this.spawnRow(0);
    }
  }

  save(): SwipeSave {
    return {
      round: this.round, ballCount: this.ballCount, launchX: Math.round(this.launchX), rowCount: this.rowCount,
      bricks: this.bricks.map((k) => [k.col, k.row, k.hp] as [number, number, number]),
      pickups: this.pickups.map((p) => [p.col, p.row] as [number, number]),
    };
  }

  // ---------- 위치 ----------
  cellRect(col: number, row: number): Rect {
    return new Rect(SIDE + col * (CELL_W + GAP), TOP + row * ROW_H, CELL_W, CELL_H);
  }

  // 그릴 때: 줄이 내려오는 중이면 한 칸 위에서부터 미끄러져 내려온다
  drawRect(col: number, row: number): Rect {
    const r = this.cellRect(col, row);
    const t = 1 - Math.pow(1 - this.slide, 3);
    r.y -= (1 - t) * ROW_H * this.newRows;
    return r;
  }

  pickupCenter(p: Pickup): Vec2 {
    const r = this.cellRect(p.col, p.row);
    return new Vec2(r.centerX, r.centerY);
  }

  // 벽돌 맨 아랫줄의 아래 끝 (벽돌이 없으면 맨 윗줄 위치)
  get lowestBrickBottom(): number {
    let y = TOP;
    for (const k of this.bricks) y = Math.max(y, this.cellRect(k.col, k.row).bottom);
    return y;
  }

  get launchPos(): Vec2 { return new Vec2(this.launchX, this.host.floorY() - BALL_SIZE / 2); }

  // 이 줄까지 내려오면 끝 (바닥에서 공 두 개 높이 위)
  private get lastRow(): number {
    return Math.floor((this.host.floorY() - BALL_SIZE * 2 - TOP + GAP) / ROW_H) - 1;
  }

  // ---------- 조준 ----------
  get aiming(): boolean { return this.aiming_; }

  aimBegin(x: number, y: number): void {
    if (this.phase !== 'aim') return;
    this.aiming_ = true;
    this.aimFrom = new Vec2(x, y);
    this.aimTo = new Vec2(x, y);
  }

  aimMove(x: number, y: number): void {
    if (this.aiming_) this.aimTo = new Vec2(x, y);
  }

  aimCancel(): void { this.aiming_ = false; }

  aimRelease(): void {
    if (!this.aiming_) return;
    const d = this.aimDir();
    this.aiming_ = false;
    if (d) this.shoot(d);
  }

  // 당긴 반대 방향. 덜 당겼거나 위로 밀었으면 null
  aimDir(): Vec2 | null {
    if (!this.aiming_ || this.phase !== 'aim') return null;
    const dx = this.aimFrom.x - this.aimTo.x;
    const dy = this.aimFrom.y - this.aimTo.y;
    if (Math.hypot(dx, dy) < PULL_MIN || dy >= 0) return null;
    let a = Math.atan2(-dy, dx);   // 수평에서 잰 위쪽 각
    a = Math.max(MIN_AIM, Math.min(Math.PI - MIN_AIM, a));
    return new Vec2(Math.cos(a), -Math.sin(a));
  }

  // 조준선: 실제 공처럼 튕겨 보며 두 번째로 부딪치는 곳까지 (당구처럼 꺾이는 길을 미리 본다)
  previewPath(dir: Vec2): Vec2[] {
    const b = new Ball(new Vec2(this.launchX - BALL_SIZE / 2, this.host.floorY() - BALL_SIZE), dir.scale(1));
    b.size = BALL_SIZE;
    const pts = [new Vec2(this.launchX, this.host.floorY() - BALL_SIZE / 2)];
    const step = 3;
    let bounces = 0;
    for (let travelled = 0; travelled < 1600 && bounces < 2; travelled += step) {
      b.pos = b.pos.add(b.vel.scale(step));
      const before = new Vec2(b.vel.x, b.vel.y);
      collideBorders(b);
      for (const k of this.bricks) {
        const r = this.cellRect(k.col, k.row);
        if (r.intersects(b.bounds())) bounceOff(b, r);
      }
      if (b.vel.x !== before.x || b.vel.y !== before.y) {
        bounces++;
        pts.push(new Vec2(b.pos.x + BALL_SIZE / 2, b.pos.y + BALL_SIZE / 2));
      }
      if (b.pos.y + BALL_SIZE > this.host.floorY()) break;
    }
    const last = pts[pts.length - 1];
    const end = new Vec2(b.pos.x + BALL_SIZE / 2, b.pos.y + BALL_SIZE / 2);
    if (Math.hypot(end.x - last.x, end.y - last.y) > 1) pts.push(end);
    return pts;
  }

  // ---------- 진행 ----------
  private shoot(dir: Vec2): void {
    this.phase = 'shoot';
    this.shotDir = dir;
    this.toLaunch = this.ballCount;
    this.launchTimer = 0;
    this.collected = 0;
    this.turnTime = 0;
    this.fast = false;
  }

  update(dt: number): void {
    if (this.phase === 'advance') {
      this.slide = Math.min(1, this.slide + dt / (SLIDE_TIME * (1 + 0.5 * (this.newRows - 1))));
      if (this.slide >= 1) {
        this.phase = 'aim';
        if (this.bricks.some((k) => k.row > this.lastRow)) this.host.gameOver();
      }
      return;
    }
    if (this.phase !== 'shoot') return;

    this.turnTime += dt;
    if (!this.fast && this.turnTime > FAST_AFTER) {
      this.fast = true;
      for (const b of this.balls) b.vel = b.vel.scale(2);
    }

    // 공을 한 개씩 차례로 쏜다
    this.launchTimer -= dt;
    while (this.toLaunch > 0 && this.launchTimer <= 0) {
      const b = new Ball(new Vec2(this.launchX - BALL_SIZE / 2, this.host.floorY() - BALL_SIZE), this.shotDir.scale(SPEED * (this.fast ? 2 : 1)));
      b.size = BALL_SIZE;
      this.balls.push(b);
      this.toLaunch--;
      this.launchTimer += LAUNCH_GAP;
    }

    const floor = this.host.floorY();
    const keep: Ball[] = [];
    for (const b of this.balls) {
      if (!this.moveBall(b, dt, floor)) keep.push(b);
    }
    this.balls = keep;

    if (this.toLaunch === 0 && this.balls.length === 0) this.endTurn();
  }

  // 바닥에 닿으면 true
  private moveBall(b: Ball, dt: number, floor: number): boolean {
    b.idle += dt;
    const dist = b.vel.length() * dt;
    const steps = Math.max(1, Math.ceil(dist / (b.size * 0.5)));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      b.pos = b.pos.add(b.vel.scale(sdt));
      if (collideBorders(b) && b.idle > NUDGE_AFTER) nudge(b);
      this.collideBricks(b);
      this.collectPickups(b);
      if (b.vel.y > 0 && b.pos.y + b.size >= floor) return true;
    }
    return false;
  }

  private collideBricks(b: Ball): void {
    const br = b.bounds();
    const i = this.bricks.findIndex((k) => this.cellRect(k.col, k.row).intersects(br));
    if (i < 0) return;
    const k = this.bricks[i];
    bounceOff(b, this.cellRect(k.col, k.row));
    b.idle = 0;
    k.hp--;
    if (k.hp <= 0) this.bricks.splice(i, 1);
    this.host.brickHit(k.hp <= 0);
  }

  private collectPickups(b: Ball): void {
    const c = new Vec2(b.pos.x + b.size / 2, b.pos.y + b.size / 2);
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickupCenter(this.pickups[i]);
      if (Math.hypot(p.x - c.x, p.y - c.y) < PICK_R + b.size / 2) {
        this.pickups.splice(i, 1);
        this.collected++;
        this.host.pickup();
      }
    }
  }

  private endTurn(): void {
    this.ballCount += this.collected;
    this.round++;
    // 새 줄 수: 1줄 50%, 2줄 30%, 3줄 20%
    let r = Math.random(), k = 1;
    for (let i = 0; i < ROWS_CHANCE.length; i++) {
      if (r < ROWS_CHANCE[i]) { k = i + 1; break; }
      r -= ROWS_CHANCE[i];
    }
    for (const b of this.bricks) b.row += k;
    for (const p of this.pickups) p.row += k;
    this.pickups = this.pickups.filter((p) => p.row <= this.lastRow);   // 바닥까지 온 +1 은 사라짐
    for (let row = 0; row < k; row++) this.spawnRow(row);
    this.newRows = k;
    this.slide = 0;
    this.phase = 'advance';
    this.host.rowsAdded();
  }

  // 새 줄: 벽돌 수는 1~6개 무작위, 숫자는 라운드 (가끔 2배), 빈칸 하나에 +1
  private spawnRow(row: number): void {
    const n = this.round;
    const count = 1 + randInt(COLS - 1);
    const cols = [...Array(COLS).keys()].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const hp = n >= 5 && Math.random() < 0.2 ? n * 2 : n;
      this.bricks.push(new SwipeBrick(cols[i], row, hp));
    }
    // +1 은 두 줄에 하나만
    if (this.rowCount % 2 === 0) this.pickups.push(new Pickup(cols[count], row));
    this.rowCount++;
  }
}
