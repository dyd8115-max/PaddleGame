// 꼬마 모드: 떨어지는 테트리스 블록을 밟고 끝없이 올라가기 (용암 피하기 타임어택)
//
// - 하늘에서 테트리스 블록이 떨어져 바닥과 쌓인 블록 위에 쌓인다
// - 꼬마는 좌우로 걷고 점프해서(공중에서 한 번 더) 쌓인 블록을 밟고 올라간다. 블록은 부술 수 없다
// - 블록은 나올 때 칸이 정해지고 그대로 곧게 떨어진다 (꼬마를 따라가지 않음)
// - 아래에서 용암이 차오르고 시간이 지날수록 빨라진다. 화면은 꼬마를 따라 위로 올라간다
// - 목숨은 하나. 블록에 깔리거나(블록이 꼬마 자리에 굳으면) 용암에 닿으면 끝. 기록은 버틴 시간
// - 블록 모양은 무작위(같은 모양 연속 없음), 떨어지는 칸은 섞은 순서대로 돌아가며 골고루
//
// 좌표: 바닥 윗면이 y = 0, 위로 갈수록 y 가 작아진다(음수).
// 줄 번호 r 은 바닥 바로 위 줄이 0, 위로 갈수록 커진다. r 줄은 y ∈ [-(r+1)·CELL, -r·CELL)
import { Rect } from './geometry';
import { World } from './objects';

export interface ClimbHost {
  hurt(): void;
  land(): void;
  higher(): void;    // 가장 높이 올라간 줄이 늘어남
  gameOver(): void;
}

export const CELL = 48;                 // 칸 크기 (가로 10칸)
const COLS = World.Width / CELL;
export const KID_W = 30;                // 꼬마 판정 크기: 한 칸보다 작아서 한 칸짜리 틈에도 들어감
export const KID_H = 42;
const GRAVITY = 1800;
const JUMP_SPEED = 600;                 // 블록 두 칸쯤 뛰어오름
const WALK_SPEED = 230;
export const LAVA_DELAY = 8;            // 처음 몇 초는 용암이 안 올라옴
const CAMERA_AT = 0.45;                 // 꼬마가 화면 높이의 이 위치보다 위로 가면 화면이 따라 올라감
const LAVA_BELOW = 20;                  // 용암은 아무리 멀어도 화면 아래 끝 바로 밑까지 따라 올라옴

// 테트리스 블록 7종 (칸 좌표, cy 는 아래로 증가)과 색
const SHAPES: [number, number][][] = [
  [[0, 0], [1, 0], [2, 0], [3, 0]],   // I
  [[0, 0], [1, 0], [0, 1], [1, 1]],   // O
  [[1, 0], [0, 1], [1, 1], [2, 1]],   // T
  [[1, 0], [2, 0], [0, 1], [1, 1]],   // S
  [[0, 0], [1, 0], [1, 1], [2, 1]],   // Z
  [[0, 0], [0, 1], [1, 1], [2, 1]],   // J
  [[2, 0], [0, 1], [1, 1], [2, 1]],   // L
];
export const PIECE_COLORS = ['#4dd6e6', '#ffd84d', '#b26bff', '#4ddc7a', '#ff5a5a', '#5a8cff', '#ffa040'];

const randInt = (n: number) => Math.floor(Math.random() * n);

// 90도씩 돌리고 왼쪽 위로 붙임
function rotate(cells: [number, number][], times: number): [number, number][] {
  let out = cells;
  for (let t = 0; t < times; t++) out = out.map(([x, y]) => [-y, x] as [number, number]);
  const minX = Math.min(...out.map((c) => c[0])), minY = Math.min(...out.map((c) => c[1]));
  return out.map(([x, y]) => [x - minX, y - minY] as [number, number]);
}

export interface Piece {
  cells: [number, number][];   // 블록 안의 칸 (왼쪽 위 기준, cy 는 아래로)
  col: number;                 // 왼쪽 칸 위치
  y: number;                   // 위쪽 끝 (픽셀, 떨어지는 중)
  color: number;
}

export class Climb {
  time = 0;                    // 버틴 시간 (기록)
  grid: number[][] = [];       // [줄][칸] = 색 번호, -1 은 빈칸. 줄 0 이 바닥 바로 위, 위로 늘어남
  pieces: Piece[] = [];
  x = World.Width / 2 - KID_W / 2;   // 꼬마 판정 왼쪽 위
  y = -KID_H - 0.01;
  vx = 0;
  vy = 0;
  grounded = true;
  jumpsLeft = 2;               // 2단 점프
  keyDir = 0;                  // -1 왼쪽, 1 오른쪽
  viewTop = -World.Height;     // 화면 맨 위의 y (위로만 따라감)
  lavaY = LAVA_BELOW;          // 용암 윗면 (처음엔 바닥 바로 아래)
  best = 0;                    // 가장 높이 올라간 줄 수
  over = false;

  private spawnTimer = 0.6;
  private colBag: number[] = [];   // 떨어질 칸 순서 (섞어 두고 하나씩 꺼냄 → 한쪽에 몰리지 않음)
  private lastKind = -1;

  constructor(private host: ClimbHost) {}

  get moving(): boolean { return Math.abs(this.vx) > 1; }
  get fallSpeed(): number { return Math.min(260, 110 + this.time * 1.2); }
  get spawnEvery(): number { return Math.max(0.55, 1.3 - this.time * 0.006); }
  get lavaSpeed(): number { return this.time < LAVA_DELAY ? 0 : Math.min(32, 3 + (this.time - LAVA_DELAY) * 0.1); }
  get height(): number { return Math.max(0, Math.round(-(this.y + KID_H) / CELL)); }   // 꼬마 발 높이 (칸)
  get viewBottom(): number { return this.viewTop + World.Height; }

  kidRect(): Rect { return new Rect(this.x, this.y, KID_W, KID_H); }
  cellRect(c: number, r: number): Rect { return new Rect(c * CELL, -(r + 1) * CELL, CELL, CELL); }
  cellAt(p: Piece, cx: number, cy: number): Rect { return new Rect((p.col + cx) * CELL, p.y + cy * CELL, CELL, CELL); }

  private rowAt(y: number): number { return Math.floor(-y / CELL); }   // y 가 들어 있는 줄 (y 는 줄의 아래쪽 경계 제외)

  private solid(c: number, r: number): boolean {
    if (c < 0 || c >= COLS) return true;
    if (r < 0) return true;   // 바닥
    return (this.grid[r]?.[c] ?? -1) >= 0;
  }

  // ---------- 조작 ----------
  jump(): void {
    if (this.over) return;
    if (this.grounded) this.jumpsLeft = 2;
    if (this.jumpsLeft <= 0) return;
    this.jumpsLeft--;
    this.vy = -JUMP_SPEED;
    this.grounded = false;
  }

  // ---------- 매 프레임 ----------
  update(dt: number): void {
    if (this.over) return;
    this.time += dt;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnPiece(); this.spawnTimer = this.spawnEvery; }
    this.updatePieces(dt);
    if (this.over) return;
    this.moveKid(dt);
    if (this.height > this.best) { this.best = this.height; this.host.higher(); }

    // 화면은 위로만 따라감
    const want = this.y - World.Height * CAMERA_AT;
    if (want < this.viewTop) this.viewTop += (want - this.viewTop) * Math.min(1, dt * 6);

    // 용암: 꾸준히 차오르고, 너무 멀리 아래 있으면 화면 아래쪽까지 따라 올라옴
    this.lavaY -= this.lavaSpeed * dt;
    this.lavaY = Math.min(this.lavaY, this.viewBottom + LAVA_BELOW);
    if (this.y + KID_H > this.lavaY + 6) this.die();
  }

  private die(): void {
    if (this.over) return;
    this.over = true;
    this.host.hurt();
    this.host.gameOver();
  }

  private spawnPiece(): void {
    let kind = randInt(SHAPES.length);
    if (kind === this.lastKind) kind = (kind + 1 + randInt(SHAPES.length - 1)) % SHAPES.length;   // 같은 모양 연속 없음
    this.lastKind = kind;
    const cells = rotate(SHAPES[kind], randInt(4));
    const w = Math.max(...cells.map((c) => c[0])) + 1;
    const h = Math.max(...cells.map((c) => c[1])) + 1;
    // 양 끝 칸은 옆 블록에 덜 덮이니까 주머니에 두 번씩 넣어 골고루 쌓이게
    if (this.colBag.length === 0) this.colBag = [...Array(COLS).keys(), 0, COLS - 1].sort(() => Math.random() - 0.5);
    const center = this.colBag.pop()!;   // 꺼낸 칸을 블록 가운데로 (너비 때문에 한쪽에 몰리지 않게)
    const col = Math.max(0, Math.min(COLS - w, center - Math.floor(Math.random() * w)));
    // 화면 바로 위에서 나옴 (칸 경계에 맞춰서)
    const top = Math.floor(this.viewTop / CELL) * CELL - h * CELL;
    this.pieces.push({ cells, col, y: top, color: kind });
  }

  // 맨 윗칸이 r 줄일 때 들어갈 자리가 있는지
  private fits(p: Piece, r: number): boolean {
    return !p.cells.some(([cx, cy]) => this.solid(p.col + cx, r - cy));
  }

  // 지금 자리에서 곧게 떨어지면 멈출 때의 맨 윗칸 줄 번호 (그림자용)
  landRow(p: Piece): number {
    let r = this.rowAt(p.y + 0.01);   // 지금 맨 윗칸이 걸친 줄 (아직 칸에 딱 맞지 않으면 아래쪽 줄)
    if (-(r + 1) * CELL < p.y - 0.01) r--;
    while (this.fits(p, r - 1)) r--;
    return r;
  }

  private updatePieces(dt: number): void {
    const keep: Piece[] = [];
    for (const p of this.pieces) {
      const top = this.landRow(p);
      const stop = -(top + 1) * CELL;
      p.y = Math.min(stop, p.y + this.fallSpeed * dt);
      if (p.y >= stop) {   // 착지: 쌓인 블록이 됨. 꼬마 자리에 굳으면 깔림 → 끝
        if (p.cells.some(([cx, cy]) => this.cellAt(p, cx, cy).intersects(this.kidRect()))) { this.die(); return; }
        for (const [cx, cy] of p.cells) {
          const r = top - cy;
          while (this.grid.length <= r) this.grid.push(Array(COLS).fill(-1));
          this.grid[r][p.col + cx] = p.color;
        }
        this.host.land();
        continue;
      }
      if (p.y < this.lavaY + CELL * 4) keep.push(p);   // 용암 속 깊이 빠진 블록은 버림
    }
    this.pieces = keep;
  }

  private overlapsGrid(): boolean {
    const r = this.kidRect();
    const c0 = Math.floor(r.left / CELL), c1 = Math.floor((r.right - 0.01) / CELL);
    const rTop = this.rowAt(r.top), rBot = this.rowAt(r.bottom - 0.01);
    for (let rr = rBot; rr <= rTop; rr++) for (let cc = c0; cc <= c1; cc++) if (this.solid(cc, rr)) return true;
    return false;
  }

  private moveKid(dt: number): void {
    this.vx = this.keyDir * WALK_SPEED;
    this.x += this.vx * dt;
    if (this.overlapsGrid()) {   // 옆 벽에 막힘
      const r = this.kidRect();
      if (this.vx > 0) this.x = Math.floor(r.right / CELL) * CELL - KID_W - 0.01;
      else if (this.vx < 0) this.x = Math.floor(r.left / CELL) * CELL + CELL + 0.01;
      if (this.overlapsGrid()) this.x -= this.vx * dt;
    }

    this.vy = Math.min(this.vy + GRAVITY * dt, 1500);
    this.y += this.vy * dt;
    this.grounded = false;
    if (this.overlapsGrid()) {
      const r = this.kidRect();
      if (this.vy > 0) {   // 착지: 발이 들어간 줄의 윗면에 세움
        const row = this.rowAt(r.bottom - 0.01);
        this.y = -(row + 1) * CELL - KID_H - 0.01;
        this.grounded = true;
        this.jumpsLeft = 2;
      } else {             // 머리 부딪힘 (블록은 깨지지 않음): 머리가 들어간 줄의 아랫면 밑으로
        const row = this.rowAt(r.top);
        this.y = -row * CELL + 0.01;
      }
      this.vy = 0;
      for (let i = 0; i < 4 && this.overlapsGrid(); i++) this.y -= CELL;   // 혹시 끼면 위로 빼 줌
    }
  }
}
