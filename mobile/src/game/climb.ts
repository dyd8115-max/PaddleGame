// 꼬마 모드: 떨어지는 테트리스 블록을 피하며 밟고 끝없이 올라가기 (용암 피하기 타임어택)
//
// - 꼬마는 혼자 좌우로 달리고, 벽이나 막힌 블록에 닿으면 방향을 바꾼다
// - 화면을 누르면 점프 (길게 누르면 높이, 짧게 누르면 낮게). 공중에서 한 번 더 뛸 수 있고,
//   공중에서 벽에 붙으면 천천히 미끄러지다가 누르면 벽차기 점프
// - 점프는 블록 끝에서 막 떨어진 직후나 착지 직전에 눌러도 된다. 머리가 모서리에 살짝 걸리면 옆으로 비켜 준다
// - 블록은 떨어질 줄에 빨간 경고가 잠깐 뜬 뒤 빠르게 내리꽂혀 쌓인다
// - 블록이 꼬마 몸 한가운데에 떨어지면 깔려서 끝. 몸 가장자리만 스치면 옆 빈칸으로 밀려나고, 빈칸이 없으면 끝
// - 아래에서 용암이 차오르고 시간이 지날수록 빨라진다. 화면은 꼬마를 따라 위로 올라간다. 용암에 닿아도 끝
// - 기록은 버틴 시간
//
// 좌표: 바닥 윗면이 y = 0, 위로 갈수록 y 가 작아진다(음수).
// 줄 번호 r 은 바닥 바로 위 줄이 0, 위로 갈수록 커진다. r 줄은 y ∈ [-(r+1)·CELL, -r·CELL)
import { Rect } from './geometry';
import { World } from './objects';

export interface ClimbHost {
  hurt(): void;
  land(): void;
  jump(): void;
  higher(): void;    // 가장 높이 올라간 줄이 늘어남
  gameOver(): void;
}

export const CELL = 48;                 // 칸 크기 (가로 10칸)
const COLS = World.Width / CELL;
export const KID_W = 30;                // 꼬마 판정 크기: 한 칸보다 작아서 한 칸짜리 틈에도 들어감
export const KID_H = 42;
const GRAVITY = 2000;
const JUMP_SPEED = 680;                 // 길게 누르면 블록 두 칸 넘게
const JUMP_CUT = 0.45;                  // 일찍 떼면 올라가는 빠르기를 이만큼으로 (낮은 점프)
const RUN_SPEED = 170;
const WALL_SLIDE = 110;                 // 벽에 붙어 미끄러지는 최대 빠르기
const COYOTE = 0.1;                     // 발판에서 떨어진 뒤에도 점프되는 시간
const JUMP_BUFFER = 0.13;               // 착지 직전에 누른 점프를 기억하는 시간
const CORNER_NUDGE = 14;                // 머리가 모서리에 이만큼 이하로 걸리면 옆으로 비켜 줌
export const WARN_TIME = 0.75;          // 블록이 떨어지기 전 경고 시간
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
  warn: number;                // 0 보다 크면 경고 중 (아직 안 떨어짐)
}

export class Climb {
  time = 0;                    // 버틴 시간 (기록)
  grid: number[][] = [];       // [줄][칸] = 색 번호, -1 은 빈칸. 줄 0 이 바닥 바로 위, 위로 늘어남
  pieces: Piece[] = [];
  x = World.Width / 2 - KID_W / 2;   // 꼬마 판정 왼쪽 위
  y = -KID_H - 0.01;
  vx = 0;
  vy = 0;
  dir = 1;                     // 달리는 방향
  grounded = true;
  wallSliding = false;
  airJump = true;              // 공중 점프 한 번
  viewTop = -World.Height;     // 화면 맨 위의 y (위로만 따라감)
  lavaY = LAVA_BELOW;          // 용암 윗면 (처음엔 바닥 바로 아래)
  best = 0;                    // 가장 높이 올라간 줄 수
  over = false;
  pushed = 0;                  // 밀려난 직후 (그림 흔들기)

  private spawnTimer = 1.2;
  private colBag: number[] = [];
  private lastKind = -1;
  private coyote = 0;
  private buffer = 0;
  private holding = false;

  constructor(private host: ClimbHost) {}

  get moving(): boolean { return Math.abs(this.vx) > 1; }
  get fallSpeed(): number { return Math.min(950, 560 + this.time * 3); }
  get spawnEvery(): number { return Math.max(0.6, 1.35 - this.time * 0.006); }
  get warnTime(): number { return Math.max(0.5, WARN_TIME - this.time * 0.002); }
  get lavaSpeed(): number { return this.time < LAVA_DELAY ? 0 : Math.min(32, 3 + (this.time - LAVA_DELAY) * 0.1); }
  get height(): number { return Math.max(0, Math.round(-(this.y + KID_H) / CELL)); }   // 꼬마 발 높이 (칸)
  get viewBottom(): number { return this.viewTop + World.Height; }

  kidRect(): Rect { return new Rect(this.x, this.y, KID_W, KID_H); }
  cellRect(c: number, r: number): Rect { return new Rect(c * CELL, -(r + 1) * CELL, CELL, CELL); }
  cellAt(p: Piece, cx: number, cy: number): Rect { return new Rect((p.col + cx) * CELL, p.y + cy * CELL, CELL, CELL); }
  pieceWidth(p: Piece): number { return Math.max(...p.cells.map((c) => c[0])) + 1; }

  private rowAt(y: number): number { return Math.floor(-y / CELL); }

  private solid(c: number, r: number): boolean {
    if (c < 0 || c >= COLS) return true;
    if (r < 0) return true;   // 바닥
    return (this.grid[r]?.[c] ?? -1) >= 0;
  }

  // ---------- 조작 ----------
  press(): void {
    if (this.over) return;
    this.holding = true;
    this.buffer = JUMP_BUFFER;
    this.tryJump();
  }
  release(): void {
    this.holding = false;
    if (this.vy < 0) this.vy *= JUMP_CUT;   // 일찍 떼면 낮게
  }
  setDir(d: number): void { if (d !== 0) this.dir = d; }   // PC 방향키

  private tryJump(): void {
    if (this.buffer <= 0) return;
    if (this.grounded || this.coyote > 0) {
      this.vy = -JUMP_SPEED;
    } else if (this.wallSliding) {   // 벽차기: 반대쪽으로 튕겨 나감
      this.dir = -this.dir;
      this.vy = -JUMP_SPEED * 0.95;
      this.wallSliding = false;
    } else if (this.airJump) {
      this.airJump = false;
      this.vy = -JUMP_SPEED * 0.85;
    } else return;
    this.grounded = false;
    this.coyote = 0;
    this.buffer = 0;
    this.host.jump();
    if (!this.holding) this.vy *= JUMP_CUT;
  }

  // ---------- 매 프레임 ----------
  update(dt: number): void {
    if (this.over) return;
    this.time += dt;
    this.pushed = Math.max(0, this.pushed - dt);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnPiece(); this.spawnTimer = this.spawnEvery * (0.8 + Math.random() * 0.4); }
    this.updatePieces(dt);
    if (this.over) return;
    this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.moveKid(dt);
    this.tryJump();
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
    const center = this.colBag.pop()!;
    const col = Math.max(0, Math.min(COLS - w, center - Math.floor(Math.random() * w)));
    const top = Math.floor(this.viewTop / CELL) * CELL - h * CELL;   // 화면 바로 위 (칸 경계)
    this.pieces.push({ cells, col, y: top, color: kind, warn: this.warnTime });
  }

  private fits(p: Piece, r: number): boolean {
    return !p.cells.some(([cx, cy]) => this.solid(p.col + cx, r - cy));
  }

  // 지금 자리에서 곧게 떨어지면 멈출 때의 맨 윗칸 줄 번호
  landRow(p: Piece): number {
    let r = this.rowAt(p.y + 0.01);
    if (-(r + 1) * CELL < p.y - 0.01) r--;
    while (this.fits(p, r - 1)) r--;
    return r;
  }

  private updatePieces(dt: number): void {
    const keep: Piece[] = [];
    for (const p of this.pieces) {
      if (p.warn > 0) {   // 경고 중: 화면 위에서 기다림 (화면이 올라가도 그 위에 붙어 있음)
        p.warn -= dt;
        const h = Math.max(...p.cells.map((c) => c[1])) + 1;
        p.y = Math.min(p.y, Math.floor(this.viewTop / CELL) * CELL - h * CELL);
        keep.push(p);
        continue;
      }
      const top = this.landRow(p);
      const stop = -(top + 1) * CELL;
      p.y = Math.min(stop, p.y + this.fallSpeed * dt);
      if (p.y >= stop) {   // 착지: 쌓인 블록이 됨
        // 꼬마 몸 한가운데에 떨어지면 깔림. 가장자리만 스치면 옆으로 밀려남
        const k = this.kidRect(), mid = k.centerX;
        const squash = p.cells.some(([cx, cy]) => {
          const r = this.cellAt(p, cx, cy);
          return mid > r.left && mid < r.right && r.bottom > k.top + 4 && r.top < k.bottom - 4;
        });
        if (squash) { this.die(); return; }
        for (const [cx, cy] of p.cells) {
          const r = top - cy;
          while (this.grid.length <= r) this.grid.push(Array(COLS).fill(-1));
          this.grid[r][p.col + cx] = p.color;
        }
        this.host.land();
        if (this.overlapsGrid() && !this.pushOut()) { this.die(); return; }   // 꼬마 자리에 굳음 → 밀려나거나 깔림
        continue;
      }
      if (p.y < this.lavaY + CELL * 4) keep.push(p);
    }
    this.pieces = keep;
  }

  // 블록에 낀 꼬마를 가장 가까운 빈자리로 밀어냄 (옆 칸 → 위 칸 순). 못 빼면 false
  private pushOut(): boolean {
    const x0 = this.x, y0 = this.y;
    const col = Math.floor((x0 + KID_W / 2) / CELL);
    const footRow = this.rowAt(y0 + KID_H - 0.01);
    const tries: [number, number][] = [];
    for (const dc of [0, -1, 1, -2, 2]) for (const dr of [0, 1]) tries.push([dc, dr]);
    tries.sort((a, b) => (Math.abs(a[0]) + a[1] * 1.5) - (Math.abs(b[0]) + b[1] * 1.5));
    for (const [dc, dr] of tries) {
      const c = col + dc;
      if (c < 0 || c >= COLS) continue;
      if (dr > 0 && dc === 0) continue;   // 바로 위로 올려 주는 건 아님 (깔린 것)
      this.x = c * CELL + (CELL - KID_W) / 2;
      this.y = -(footRow + dr + 1) * CELL + CELL - KID_H - 0.01;
      if (!this.overlapsGrid()) {
        if (dc !== 0) this.dir = Math.sign(dc);
        this.pushed = 0.25;
        return true;
      }
    }
    this.x = x0; this.y = y0;
    return false;
  }

  private overlapsGrid(): boolean {
    const r = this.kidRect();
    const c0 = Math.floor(r.left / CELL), c1 = Math.floor((r.right - 0.01) / CELL);
    const rTop = this.rowAt(r.top), rBot = this.rowAt(r.bottom - 0.01);
    for (let rr = rBot; rr <= rTop; rr++) for (let cc = c0; cc <= c1; cc++) if (this.solid(cc, rr)) return true;
    return false;
  }

  private moveKid(dt: number): void {
    // 가로: 늘 달림. 막히면 땅에서는 뒤돌고, 공중에서는 벽에 붙음
    this.vx = this.dir * RUN_SPEED;
    this.x += this.vx * dt;
    let blocked = false;
    if (this.overlapsGrid()) {
      const r = this.kidRect();
      if (this.vx > 0) this.x = Math.floor(r.right / CELL) * CELL - KID_W - 0.01;
      else this.x = Math.floor(r.left / CELL) * CELL + CELL + 0.01;
      if (this.overlapsGrid()) this.x -= this.vx * dt;
      blocked = true;
    }

    // 세로
    const wasGrounded = this.grounded;
    this.vy = Math.min(this.vy + GRAVITY * dt, 1400);
    this.wallSliding = blocked && !wasGrounded && this.vy > 0;
    if (this.wallSliding) this.vy = Math.min(this.vy, WALL_SLIDE);
    this.y += this.vy * dt;
    this.grounded = false;
    if (this.overlapsGrid()) {
      const r = this.kidRect();
      if (this.vy > 0) {   // 착지
        const row = this.rowAt(r.bottom - 0.01);
        this.y = -(row + 1) * CELL - KID_H - 0.01;
        this.grounded = true;
        this.airJump = true;
        this.vy = 0;
      } else if (!this.nudgeCorner()) {   // 머리 부딪힘: 모서리에 살짝 걸린 거면 비켜 주고, 아니면 멈춤
        const row = this.rowAt(r.top);
        this.y = -row * CELL + 0.01;
        this.vy = 0;
      }
      for (let i = 0; i < 4 && this.overlapsGrid(); i++) this.y -= CELL;
    }
    if (this.grounded) this.coyote = COYOTE;
    else if (wasGrounded && this.vy >= 0) this.coyote = COYOTE;   // 막 발판에서 떨어짐
    if (this.grounded && blocked) this.dir = -this.dir;   // 땅에서 막히면 뒤돌기
  }

  // 머리가 모서리에 조금만 걸렸으면 옆으로 밀어서 계속 올라가게
  private nudgeCorner(): boolean {
    const x0 = this.x;
    for (let d = 1; d <= CORNER_NUDGE; d++) {
      for (const s of [-1, 1]) {
        this.x = x0 + s * d;
        if (!this.overlapsGrid()) return true;
      }
    }
    this.x = x0;
    return false;
  }
}
