// 꼬마 모드: 떨어지는 테트리스 블록 피하며 올라가기
//
// - 하늘에서 테트리스 블록이 떨어져 바닥과 쌓인 블록 위에 쌓인다
// - 꼬마는 좌우로 걷고 점프해서 떨어지는 블록을 피하고, 쌓인 블록을 밟고 올라간다 (블록은 못 부숨)
// - 블록은 나올 때 칸이 정해지고 그대로 곧게 떨어진다 (꼬마를 따라가지 않음)
// - 맨 위 빨간 선에 머리가 닿으면 스테이지 클리어. 스테이지마다 블록이 빨리, 자주 떨어진다
// - 테트리스처럼 한 줄이 꽉 차면 그 줄이 사라진다
// - 공중에서 한 번 더 뛸 수 있다 (2단 점프)
// - 빨간 선 위로 삐져나온 칸은 사라진다
// - 떨어지는 블록에 맞으면 체력 -1 (3개)
// - 기록은 도달한 스테이지
import { Rect } from './geometry';
import { World } from './objects';

export interface ClimbHost {
  hurt(): void;
  land(): void;
  jump(): void;
  stageClear(): void;
  lineClear(n: number): void;
  gameOver(): void;
}

export const CELL = 48;                 // 칸 크기 (가로 10칸)
const COLS = World.Width / CELL;
const LINE_ROWS = 2;                    // 빨간 선 위로 남겨 두는 줄 수
export const KID_W = 28;                // 꼬마 판정 크기
export const KID_H = 52;
const GRAVITY = 1800;
const JUMP_SPEED = 600;                 // 블록 한 칸 반쯤 뛰어오름
const WALK_SPEED = 230;
const HURT_INVULN = 1.5;
const START_HEARTS = 3;
const CLEAR_PAUSE = 1.4;

// 테트리스 블록 7종 (칸 좌표)과 색
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
  cells: [number, number][];   // 블록 안의 칸 (왼쪽 위 기준)
  col: number;                 // 왼쪽 칸 위치
  y: number;                   // 위쪽 끝 (픽셀, 떨어지는 중)
  color: number;
}

export class Climb {
  stage = 1;
  hearts = START_HEARTS;
  grid: number[][] = [];       // [줄][칸] = 색 번호, -1 은 빈칸
  pieces: Piece[] = [];
  x = World.Width / 2 - KID_W / 2;   // 꼬마 판정 왼쪽 위
  y = 0;
  vx = 0;
  vy = 0;
  grounded = true;
  jumpsLeft = 2;               // 2단 점프
  invuln = 0;
  targetX: number | null = null;     // 누른 곳 (이리로 걸어감)
  keyDir = 0;                        // 키보드 좌우
  clearTimer = 0;
  time = 0;

  private spawnTimer = 0.6;

  constructor(private host: ClimbHost) {
    this.startStage();
  }

  get rows(): number { return Math.floor(World.Height / CELL); }
  get gridTop(): number { return World.Height - this.rows * CELL; }   // 바닥에 맞춰 격자를 둠
  get lineY(): number { return this.gridTop + LINE_ROWS * CELL; }     // 빨간 선
  get moving(): boolean { return Math.abs(this.vx) > 1; }
  get fallSpeed(): number { return Math.min(320, 110 + (this.stage - 1) * 25); }
  get spawnEvery(): number { return Math.max(0.55, 1.6 - (this.stage - 1) * 0.12); }

  kidRect(): Rect { return new Rect(this.x, this.y, KID_W, KID_H); }
  cellRect(c: number, r: number): Rect { return new Rect(c * CELL, this.gridTop + r * CELL, CELL, CELL); }

  private startStage(): void {
    this.grid = Array.from({ length: this.rows }, () => Array(COLS).fill(-1));
    this.pieces = [];
    this.x = World.Width / 2 - KID_W / 2;
    this.y = World.Height - KID_H;
    this.vx = this.vy = 0;
    this.grounded = true;
    this.time = 0;
    this.spawnTimer = 0.8;
  }

  // ---------- 조작 ----------
  setTarget(x: number | null): void { this.targetX = x; }
  jump(): void {
    if (this.clearTimer > 0) return;
    if (this.grounded) this.jumpsLeft = 2;
    if (this.jumpsLeft <= 0) return;
    this.jumpsLeft--;
    this.vy = -JUMP_SPEED;
    this.grounded = false;
    this.host.jump();
  }

  // ---------- 매 프레임 ----------
  update(dt: number): void {
    this.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.clearTimer > 0) {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) { this.stage++; this.startStage(); }
      return;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnPiece(); this.spawnTimer = this.spawnEvery; }
    this.updatePieces(dt);
    this.moveKid(dt);

    if (this.y < this.lineY) {   // 머리가 빨간 선에 닿음
      this.clearTimer = CLEAR_PAUSE;
      this.pieces = [];
      this.host.stageClear();
    }
  }

  private solid(c: number, r: number): boolean {
    if (c < 0 || c >= COLS) return true;
    if (r >= this.rows) return true;
    if (r < 0) return false;
    return this.grid[r][c] >= 0;
  }

  private spawnPiece(): void {
    const kind = randInt(SHAPES.length);
    const cells = rotate(SHAPES[kind], randInt(4));
    const w = Math.max(...cells.map((c) => c[0])) + 1;
    const h = Math.max(...cells.map((c) => c[1])) + 1;
    this.pieces.push({ cells, col: randInt(COLS - w + 1), y: this.gridTop - h * CELL, color: kind });
  }

  // 지금 칸 위치에서 아래로 떨어지면 멈출 줄 (위쪽 칸 줄 번호). 그림자용
  landRow(p: Piece): number {
    let r = Math.floor((p.y - this.gridTop) / CELL);
    while (!p.cells.some(([cx, cy]) => this.solid(p.col + cx, r + cy + 1))) r++;
    return r;
  }

  private updatePieces(dt: number): void {
    const keep: Piece[] = [];
    for (const p of this.pieces) {
      const stop = this.gridTop + this.landRow(p) * CELL;
      p.y = Math.min(stop, p.y + this.fallSpeed * dt);
      // 떨어지는 블록에 맞으면 체력 -1
      if (this.invuln <= 0 && p.cells.some(([cx, cy]) => this.cellAt(p, cx, cy).intersects(this.kidRect()))) {
        this.hearts--;
        this.invuln = HURT_INVULN;
        this.host.hurt();
        if (this.hearts <= 0) { this.host.gameOver(); return; }
      }
      if (p.y >= stop) {   // 착지: 격자에 굳힘
        const r0 = Math.round((p.y - this.gridTop) / CELL);
        for (const [cx, cy] of p.cells) {
          const r = r0 + cy;
          if (r >= LINE_ROWS && r < this.rows) this.grid[r][p.col + cx] = p.color;   // 빨간 선 위 칸은 버림
        }
        this.host.land();
        this.clearLines();
        this.unstickKid();
        continue;
      }
      keep.push(p);
    }
    this.pieces = keep;
  }

  // 꽉 찬 줄을 지우고 위 줄들을 내림
  private clearLines(): void {
    let n = 0;
    for (let r = this.rows - 1; r >= 0; r--) {
      if (this.grid[r].every((x) => x >= 0)) {
        this.grid.splice(r, 1);
        this.grid.unshift(Array(COLS).fill(-1));
        n++;
        r++;   // 같은 줄 번호를 다시 검사
      }
    }
    if (n > 0) this.host.lineClear(n);
  }

  cellAt(p: Piece, cx: number, cy: number): Rect {
    return new Rect((p.col + cx) * CELL, p.y + cy * CELL, CELL, CELL);
  }

  // 블록이 꼬마 자리에 굳으면 그 칸 위로 올려 줌
  private unstickKid(): void {
    for (let i = 0; i < this.rows + 2 && this.overlapsGrid(); i++) {
      const bottomRow = Math.floor((this.y + KID_H - 0.02 - this.gridTop) / CELL);
      this.y = this.gridTop + bottomRow * CELL - KID_H - 0.01;   // 지금 발 있는 칸의 윗면으로
      this.vy = 0;
    }
  }

  private overlapsGrid(): boolean {
    const r = this.kidRect();
    const c0 = Math.floor(r.left / CELL), c1 = Math.floor((r.right - 0.01) / CELL);
    const r0 = Math.floor((r.top - this.gridTop) / CELL), r1 = Math.floor((r.bottom - 0.01 - this.gridTop) / CELL);
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) if (this.solid(cc, rr)) return true;
    return false;
  }

  private moveKid(dt: number): void {
    // 좌우: 누른 곳 쪽으로 (가까우면 멈춤), 키보드가 있으면 키보드
    let dir = this.keyDir;
    if (dir === 0 && this.targetX !== null) {
      const d = this.targetX - (this.x + KID_W / 2);
      dir = Math.abs(d) < 6 ? 0 : Math.sign(d);
    }
    this.vx = dir * WALK_SPEED;
    this.x += this.vx * dt;
    if (this.overlapsGrid()) {   // 옆 벽에 막힘
      const r = this.kidRect();
      if (this.vx > 0) this.x = Math.floor(r.right / CELL) * CELL - KID_W - 0.01;
      else if (this.vx < 0) this.x = Math.floor(r.left / CELL) * CELL + CELL + 0.01;
      if (this.overlapsGrid()) this.x -= this.vx * dt;
    }

    // 위아래: 중력
    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;
    this.grounded = false;
    if (this.overlapsGrid()) {
      const r = this.kidRect();
      if (this.vy > 0) {   // 착지
        this.y = this.gridTop + Math.floor((r.bottom - this.gridTop) / CELL) * CELL - KID_H - 0.01;
        this.grounded = true;
        this.jumpsLeft = 2;
      } else {             // 머리 부딪힘 (블록은 깨지지 않음)
        const row = Math.floor((r.top - this.gridTop) / CELL);
        this.y = this.gridTop + row * CELL + CELL + 0.01;
      }
      this.vy = 0;
      if (this.overlapsGrid()) this.unstickKid();
    }
  }
}
