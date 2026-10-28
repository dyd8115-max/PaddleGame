// 꼬마 모드: 땅따먹기 (자넥스 방식)
//
// - 맵은 화면보다 크고, 화면은 꼬마를 따라 움직인다. 오른쪽 위 작은 지도에 맵 전체가 보인다
// - 맵 가장자리 두 줄은 처음부터 꼬마 땅이다. 안쪽 빈 곳(바다)에는 악마들이 튕기며 날아다닌다
// - 화면 어디든 누른 채 상하좌우로 끌면 그쪽으로 걷고, 손을 떼면 멈춘다 (직접 조종)
// - 바다로 나가면 지나간 자리에 선이 그려진다. 다시 땅으로 돌아오면 선이 땅이 되고,
//   선으로 막혀서 악마가 하나도 없는 바다는 모두 꼬마 땅이 된다
// - 선을 긋는 중에 악마가 선이나 꼬마에 닿으면 목숨 -1 (선은 사라지고 출발한 땅으로 돌아감).
//   선을 긋다가 정반대로는 돌 수 없다
// - 3스테이지부터 땅 위를 돌아다니는 붉은 악마가 나온다. 땅 위의 꼬마에 닿아도 목숨 -1
// - 땅을 70% 차지하면 다음 스테이지. 스테이지마다 악마가 하나씩 늘고 조금 빨라진다
// - 목숨 3개, 기록은 도달한 스테이지
import { World } from './objects';

export interface ClaimHost {
  claim(cells: number): void;
  hurt(): void;
  stageClear(): void;
  gameOver(): void;
}

export const CC = 16;                  // 칸 크기
export const MAP_COLS = 56;            // 맵 크기 (칸). 화면보다 넓고 높음
export const MAP_ROWS = 84;
const BORDER = 2;
const KID_SPEED = 11;                  // 초당 칸 수
const START_LIVES = 3;
export const GOAL = 0.7;
const CLEAR_PAUSE = 1.6;
const HURT_PAUSE = 1.0;
export const DEVIL_R = 18;             // 악마 판정 반지름
export const DEVIL_DRAW = 100;         // 악마 그림 크기 (그림 칸 한 변)

export const SEA = 0, LAND = 1, TRAIL = 2;

export interface ClaimDevil { x: number; y: number; vx: number; vy: number; land: boolean; anim: number; }

export class Claim {
  stage = 1;
  lives = START_LIVES;
  readonly cols = MAP_COLS;
  readonly rows = MAP_ROWS;
  cells: Uint8Array = new Uint8Array(MAP_COLS * MAP_ROWS);
  version = 0;               // 땅 모양이 바뀔 때마다 +1 (그림 다시 그리기용)
  devils: ClaimDevil[] = [];
  kc = 0;                    // 꼬마 칸 위치
  kr = 0;
  dir: [number, number] = [0, 0];
  holdDir: [number, number] = [0, 0];   // 누르고 있는 방향 (없으면 멈춤)
  drawing = false;
  trail: number[] = [];
  clearTimer = 0;
  hurtTimer = 0;
  time = 0;
  stageTime = 0;
  camX = 0;                  // 화면 왼쪽 위의 맵 좌표
  camY = 0;
  flash: { idx: number[]; t: number } = { idx: [], t: 0 };

  private step = 0;
  private startC = 0;
  private startR = 0;
  private interior = 1;
  private landN = 0;

  constructor(private host: ClaimHost) { this.startStage(); }

  get percent(): number { return this.landN / this.interior; }
  get mapW(): number { return this.cols * CC; }
  get mapH(): number { return this.rows * CC; }
  get moving(): boolean { return this.dir[0] !== 0 || this.dir[1] !== 0; }
  get kidX(): number { return (this.kc + 0.5) * CC; }
  get kidY(): number { return (this.kr + 0.5) * CC; }

  at(c: number, r: number): number {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return LAND;
    return this.cells[r * this.cols + c];
  }
  cellIndex(x: number, y: number): number {
    const c = Math.floor(x / CC), r = Math.floor(y / CC);
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private startStage(): void {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const edge = r < BORDER || r >= this.rows - BORDER || c < BORDER || c >= this.cols - BORDER;
      this.cells[r * this.cols + c] = edge ? LAND : SEA;
    }
    this.interior = (this.rows - BORDER * 2) * (this.cols - BORDER * 2);
    this.landN = 0;
    this.version++;
    this.kc = Math.floor(this.cols / 2);
    this.kr = this.rows - 1;
    this.dir = [0, 0];
    this.drawing = false;
    this.trail = [];
    this.stageTime = 0;
    this.devils = [];
    const n = Math.min(8, this.stage + 1);
    const speed = Math.min(300, 150 + this.stage * 14);
    for (let i = 0; i < n; i++) this.devils.push(this.makeDevil(speed, false));
    if (this.stage >= 3) for (let i = 0; i < Math.min(3, Math.floor((this.stage - 1) / 2)); i++) this.devils.push(this.makeDevil(speed * 0.7, true));
    this.follow(1);
  }

  private makeDevil(speed: number, land: boolean): ClaimDevil {
    const a = (Math.floor(Math.random() * 4) * Math.PI) / 2 + Math.PI / 4 + (Math.random() - 0.5) * 0.5;
    if (land) {   // 땅 악마: 위쪽 가장자리 땅에서 출발
      return { x: (6 + Math.random() * (this.cols - 12)) * CC, y: CC, vx: Math.cos(a) * speed, vy: Math.abs(Math.sin(a)) * speed, land, anim: Math.random() };
    }
    const x = (BORDER + 4 + Math.random() * (this.cols - BORDER * 2 - 8)) * CC;
    const y = (BORDER + 4 + Math.random() * (this.rows * 0.55)) * CC;
    return { x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, land, anim: Math.random() };
  }

  // ---------- 조작 ----------
  // 누르고 있는 방향. [0,0] 이면 멈춤
  hold(dx: number, dy: number): void { this.holdDir = [dx, dy]; }

  // 화면 조이스틱 (화면 픽셀): 누른 곳 기준으로 끈 방향의 큰 쪽으로 걸음. 너무 멀리 끌면 기준점이 따라옴
  joyFrom: { x: number; y: number } | null = null;
  joyTo = { x: 0, y: 0 };
  joyBegin(x: number, y: number): void { this.joyFrom = { x, y }; this.joyTo = { x, y }; this.hold(0, 0); }
  joyMove(x: number, y: number): void {
    if (!this.joyFrom) return;
    this.joyTo = { x, y };
    let dx = x - this.joyFrom.x, dy = y - this.joyFrom.y;
    const len = Math.hypot(dx, dy), max = 50;
    if (len > max) { this.joyFrom = { x: x - dx / len * max, y: y - dy / len * max }; dx = x - this.joyFrom.x; dy = y - this.joyFrom.y; }
    if (len < 12) this.hold(0, 0);
    else if (Math.abs(dx) > Math.abs(dy)) this.hold(Math.sign(dx), 0);
    else this.hold(0, Math.sign(dy));
  }
  joyEnd(): void { this.joyFrom = null; this.hold(0, 0); }

  // ---------- 매 프레임 ----------
  update(dt: number): void {
    this.time += dt;
    this.stageTime += dt;
    this.flash.t = Math.max(0, this.flash.t - dt);
    for (const d of this.devils) d.anim += dt;
    if (this.clearTimer > 0) {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) { this.stage++; this.startStage(); }
      return;
    }
    if (this.hurtTimer > 0) { this.hurtTimer -= dt; this.moveDevils(dt); this.follow(dt); return; }

    // 선을 긋는 중에 정반대로 돌면 자기 선을 밟으니 그 방향은 무시
    const [hx, hy] = this.holdDir;
    const reverse = this.drawing && this.trail.length > 0 && hx === -this.dir[0] && hy === -this.dir[1] && (hx !== 0 || hy !== 0);
    if (!reverse) this.dir = [hx, hy];
    if (this.moving) {
      this.step += dt * KID_SPEED;
      while (this.step >= 1 && this.hurtTimer <= 0 && this.clearTimer <= 0) { this.step -= 1; this.stepKid(); }
    } else this.step = Math.min(this.step, 0.6);   // 다시 누르면 바로 한 칸 가게
    this.moveDevils(dt);
    this.follow(dt);
  }

  // 화면이 꼬마를 따라감 (맵 끝에서는 멈춤)
  private follow(dt: number): void {
    const tx = Math.max(0, Math.min(this.mapW - World.Width, this.kidX - World.Width / 2));
    const ty = Math.max(0, Math.min(this.mapH - World.Height, this.kidY - World.Height * 0.55));
    const k = Math.min(1, dt * 8);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    if (this.mapH < World.Height) this.camY = (this.mapH - World.Height) / 2;
  }

  private stepKid(): void {
    const nc = this.kc + this.dir[0], nr = this.kr + this.dir[1];
    if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) return;   // 맵 끝
    const cell = this.at(nc, nr);
    if (cell === TRAIL) { this.hit(); return; }
    if (!this.drawing && cell === SEA) {
      this.drawing = true;
      this.startC = this.kc; this.startR = this.kr;
    }
    this.kc = nc; this.kr = nr;
    if (this.drawing) {
      if (cell === SEA) {
        this.cells[nr * this.cols + nc] = TRAIL;
        this.trail.push(nr * this.cols + nc);
        this.version++;
      } else this.closeTrail();
    }
  }

  // 선을 땅으로 만들고, 악마가 없는 바다를 모두 채움
  private closeTrail(): void {
    for (const i of this.trail) this.cells[i] = LAND;
    const gainedTrail = this.trail.length;
    this.trail = [];
    this.drawing = false;
    const seen = new Uint8Array(this.cells.length);
    const stack: number[] = [];
    for (const d of this.devils) {
      if (d.land) continue;
      const i = this.cellIndex(d.x, d.y);
      if (i >= 0 && this.cells[i] === SEA && !seen[i]) { seen[i] = 1; stack.push(i); }
    }
    const C = this.cols;
    while (stack.length) {
      const i = stack.pop()!;
      const c = i % C, r = (i - c) / C;
      if (c > 0 && !seen[i - 1] && this.cells[i - 1] === SEA) { seen[i - 1] = 1; stack.push(i - 1); }
      if (c < C - 1 && !seen[i + 1] && this.cells[i + 1] === SEA) { seen[i + 1] = 1; stack.push(i + 1); }
      if (r > 0 && !seen[i - C] && this.cells[i - C] === SEA) { seen[i - C] = 1; stack.push(i - C); }
      if (r < this.rows - 1 && !seen[i + C] && this.cells[i + C] === SEA) { seen[i + C] = 1; stack.push(i + C); }
    }
    const filled: number[] = [];
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === SEA && !seen[i]) { this.cells[i] = LAND; filled.push(i); }
    const gained = gainedTrail + filled.length;
    this.landN += gained;
    this.version++;
    this.flash = { idx: filled, t: 0.35 };
    this.devils = this.devils.filter((d) => d.land || this.cells[this.cellIndex(d.x, d.y)] !== LAND);
    if (gained > 0) this.host.claim(gained);
    if (this.percent >= GOAL) {
      this.clearTimer = CLEAR_PAUSE;
      this.host.stageClear();
    }
  }

  // 악마: 바다 악마는 땅에서, 땅 악마는 바다에서 튕김
  private moveDevils(dt: number): void {
    for (const d of this.devils) {
      const steps = Math.max(1, Math.ceil(Math.hypot(d.vx, d.vy) * dt / 4));
      const wall = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= this.mapW || y >= this.mapH) return true;
        const v = this.at(Math.floor(x / CC), Math.floor(y / CC));
        return d.land ? v !== LAND : v === LAND;
      };
      const R = d.land ? CC * 0.45 : DEVIL_R * 0.6;   // 벽 판정은 조금 작게 (좁은 바다에도 들어가게)
      for (let s = 0; s < steps; s++) {
        const sdt = dt / steps;
        const nx = d.x + d.vx * sdt;
        if (wall(nx + Math.sign(d.vx) * R, d.y)) d.vx = -d.vx; else d.x = nx;
        const ny = d.y + d.vy * sdt;
        if (wall(d.x, ny + Math.sign(d.vy) * R)) d.vy = -d.vy; else d.y = ny;
        if (this.hurtTimer > 0 || this.clearTimer > 0) continue;
        if (!d.land && this.trail.length > 0) {
          for (const [ox, oy] of [[0, 0], [DEVIL_R, 0], [-DEVIL_R, 0], [0, DEVIL_R], [0, -DEVIL_R]]) {
            const i = this.cellIndex(d.x + ox, d.y + oy);
            if (i >= 0 && this.cells[i] === TRAIL) { this.hit(); break; }
          }
        }
        if (this.hurtTimer > 0) continue;
        if ((d.land || this.drawing) && Math.hypot(d.x - this.kidX, d.y - this.kidY) < DEVIL_R + CC * 0.6) this.hit();
      }
    }
  }

  private hit(): void {
    if (this.hurtTimer > 0) return;
    this.lives--;
    this.host.hurt();
    for (const i of this.trail) this.cells[i] = SEA;
    this.trail = [];
    this.version++;
    if (this.drawing) { this.kc = this.startC; this.kr = this.startR; }
    this.drawing = false;
    this.dir = [0, 0];
    this.hurtTimer = HURT_PAUSE;
    if (this.lives <= 0) { this.hurtTimer = 0; this.host.gameOver(); }
  }
}
