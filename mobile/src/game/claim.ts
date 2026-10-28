// 꼬마 모드: 땅따먹기 (자넥스 방식)
//
// - 판은 작은 칸들로 나뉘고, 가장자리 두 줄은 처음부터 꼬마 땅이다. 안쪽 빈 곳(바다)에는 공들이 튀어 다닌다
// - 화면을 상하좌우로 밀면 꼬마가 그 방향으로 계속 달린다. 땅 위에서는 판 끝에 닿으면 멈춘다
// - 바다로 나가면 지나간 자리에 선이 그려진다. 다시 땅으로 돌아오면 선이 땅이 되고,
//   선으로 막혀서 공이 하나도 없는 바다는 모두 꼬마 땅이 된다
// - 선을 긋는 중에 공이 선이나 꼬마에 닿으면 목숨 -1 (선은 사라지고 출발한 땅으로 돌아감). 선을 그리다 되돌아가 자기 선을 밟아도 같음
// - 3스테이지부터 땅 위를 굴러다니는 검은 공이 나온다. 땅 위의 꼬마에 닿으면 목숨 -1
// - 땅을 75% 차지하면 다음 스테이지. 스테이지마다 공이 하나씩 늘고 조금 빨라진다
// - 목숨 3개, 기록은 도달한 스테이지
import { World } from './objects';

export interface ClaimHost {
  claim(cells: number): void;
  hurt(): void;
  stageClear(): void;
  gameOver(): void;
}

export const CC = 12;                  // 칸 크기
export const COLS = World.Width / CC;  // 40칸
const BORDER = 2;
const KID_SPEED = 15;                  // 초당 칸 수
const START_LIVES = 3;
export const GOAL = 0.75;
const CLEAR_PAUSE = 1.6;
const HURT_PAUSE = 1.0;
export const BALL_R = 5;

export const SEA = 0, LAND = 1, TRAIL = 2;

export interface ClaimBall { x: number; y: number; vx: number; vy: number; land: boolean; }

export class Claim {
  stage = 1;
  lives = START_LIVES;
  rows = 0;
  cells: Uint8Array = new Uint8Array(0);
  balls: ClaimBall[] = [];
  kc = 0;                    // 꼬마 칸 위치
  kr = 0;
  dir: [number, number] = [0, 0];
  wantDir: [number, number] = [0, 0];
  drawing = false;
  trail: number[] = [];
  clearTimer = 0;
  hurtTimer = 0;             // 0 보다 크면 맞은 직후 (잠깐 멈춤, 깜빡임)
  time = 0;
  stageTime = 0;
  flash: { idx: number[]; t: number } = { idx: [], t: 0 };   // 방금 차지한 칸 반짝임

  private step = 0;
  private startC = 0;        // 선 긋기를 시작한 땅 칸
  private startR = 0;
  private interior = 1;

  constructor(private host: ClaimHost) { this.startStage(); }

  get percent(): number {
    let n = 0;
    for (let r = BORDER; r < this.rows - BORDER; r++) for (let c = BORDER; c < COLS - BORDER; c++) if (this.cells[r * COLS + c] === LAND) n++;
    return n / this.interior;
  }
  get boardH(): number { return this.rows * CC; }
  get top(): number { return (World.Height - this.boardH) / 2; }   // 판 위쪽 (가운데 맞춤)
  get moving(): boolean { return this.dir[0] !== 0 || this.dir[1] !== 0; }

  at(c: number, r: number): number {
    if (c < 0 || c >= COLS || r < 0 || r >= this.rows) return LAND;
    return this.cells[r * COLS + c];
  }

  private startStage(): void {
    this.rows = Math.floor(World.Height / CC);
    this.cells = new Uint8Array(this.rows * COLS);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < COLS; c++) {
      const edge = r < BORDER || r >= this.rows - BORDER || c < BORDER || c >= COLS - BORDER;
      this.cells[r * COLS + c] = edge ? LAND : SEA;
    }
    this.interior = (this.rows - BORDER * 2) * (COLS - BORDER * 2);
    this.kc = Math.floor(COLS / 2);
    this.kr = this.rows - 1;
    this.dir = [0, 0];
    this.wantDir = [0, 0];
    this.drawing = false;
    this.trail = [];
    this.stageTime = 0;
    this.balls = [];
    const n = Math.min(8, this.stage + 1);
    const speed = Math.min(330, 170 + this.stage * 16);
    for (let i = 0; i < n; i++) this.balls.push(this.makeBall(speed, false));
    if (this.stage >= 3) for (let i = 0; i < Math.min(3, Math.floor((this.stage - 1) / 2)); i++) this.balls.push(this.makeBall(speed * 0.7, true));
  }

  private makeBall(speed: number, land: boolean): ClaimBall {
    const a = (Math.floor(Math.random() * 4) * Math.PI) / 2 + Math.PI / 4 + (Math.random() - 0.5) * 0.5;
    if (land) {   // 땅 공: 위쪽 가장자리 땅에서 출발
      return { x: (4 + Math.random() * (COLS - 8)) * CC, y: CC, vx: Math.cos(a) * speed, vy: Math.abs(Math.sin(a)) * speed, land };
    }
    const x = (BORDER + 2 + Math.random() * (COLS - BORDER * 2 - 4)) * CC;
    const y = (BORDER + 2 + Math.random() * (this.rows * 0.6)) * CC;
    return { x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, land };
  }

  // ---------- 조작 ----------
  setDir(dx: number, dy: number): void {
    // 선을 긋는 중에 정반대로 돌면 자기 선을 밟으니 무시
    if (this.drawing && dx === -this.dir[0] && dy === -this.dir[1]) return;
    this.wantDir = [dx, dy];
  }

  // ---------- 매 프레임 ----------
  update(dt: number): void {
    this.time += dt;
    this.stageTime += dt;
    this.flash.t = Math.max(0, this.flash.t - dt);
    if (this.clearTimer > 0) {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) { this.stage++; this.startStage(); }
      return;
    }
    if (this.hurtTimer > 0) { this.hurtTimer -= dt; this.moveBalls(dt); return; }

    this.dir = this.wantDir;
    if (this.moving) {
      this.step += dt * KID_SPEED;
      while (this.step >= 1 && this.hurtTimer <= 0 && this.clearTimer <= 0) { this.step -= 1; this.stepKid(); }
    } else this.step = 0;
    this.moveBalls(dt);
  }

  private stepKid(): void {
    const nc = this.kc + this.dir[0], nr = this.kr + this.dir[1];
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= this.rows) { this.wantDir = [0, 0]; this.dir = [0, 0]; return; }   // 판 끝
    const cell = this.at(nc, nr);
    if (cell === TRAIL) { this.hit(); return; }   // 자기 선 밟음
    if (!this.drawing && cell === SEA) {   // 바다로 나감: 선 긋기 시작
      this.drawing = true;
      this.startC = this.kc; this.startR = this.kr;
    }
    this.kc = nc; this.kr = nr;
    if (this.drawing) {
      if (cell === SEA) {
        this.cells[nr * COLS + nc] = TRAIL;
        this.trail.push(nr * COLS + nc);
      } else this.closeTrail();   // 땅으로 돌아옴
    }
  }

  // 선을 땅으로 만들고, 공이 없는 바다를 모두 채움
  private closeTrail(): void {
    const before = this.landCount();
    for (const i of this.trail) this.cells[i] = LAND;
    this.trail = [];
    this.drawing = false;
    this.wantDir = [0, 0];   // 땅에 닿으면 멈춤 (다음 방향을 고를 시간)
    this.dir = [0, 0];
    // 공이 있는 바다에서 퍼져 나가며 표시
    const seen = new Uint8Array(this.cells.length);
    const stack: number[] = [];
    for (const b of this.balls) {
      if (b.land) continue;
      const i = this.cellIndex(b.x, b.y);
      if (i >= 0 && this.cells[i] === SEA && !seen[i]) { seen[i] = 1; stack.push(i); }
    }
    while (stack.length) {
      const i = stack.pop()!;
      const c = i % COLS, r = (i - c) / COLS;
      const nb = [c > 0 ? i - 1 : -1, c < COLS - 1 ? i + 1 : -1, r > 0 ? i - COLS : -1, r < this.rows - 1 ? i + COLS : -1];
      for (const j of nb) if (j >= 0 && !seen[j] && this.cells[j] === SEA) { seen[j] = 1; stack.push(j); }
    }
    const filled: number[] = [];
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] !== LAND && !seen[i]) { this.cells[i] = LAND; filled.push(i); }
    const gained = this.landCount() - before;
    this.flash = { idx: filled, t: 0.35 };
    // 땅 공이 새 땅 안쪽에 갇히지 않게: 바다 공이 묻히면 없앰
    this.balls = this.balls.filter((b) => b.land || this.cells[this.cellIndex(b.x, b.y)] !== LAND);
    if (gained > 0) this.host.claim(gained);
    if (this.percent >= GOAL) {
      this.clearTimer = CLEAR_PAUSE;
      this.host.stageClear();
    }
  }

  private landCount(): number { let n = 0; for (const v of this.cells) if (v === LAND) n++; return n; }

  cellIndex(x: number, y: number): number {
    const c = Math.floor(x / CC), r = Math.floor(y / CC);
    if (c < 0 || c >= COLS || r < 0 || r >= this.rows) return -1;
    return r * COLS + c;
  }

  // 공: 바다 공은 땅에서, 땅 공은 바다에서 튕김. 판 좌표 (top 빼고)
  private moveBalls(dt: number): void {
    for (const b of this.balls) {
      const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 4));
      for (let s = 0; s < steps; s++) {
        const sdt = dt / steps;
        const wall = (x: number, y: number) => {
          const v = this.at(Math.floor(x / CC), Math.floor(y / CC));
          return b.land ? v !== LAND || x < 0 || y < 0 || x >= World.Width || y >= this.boardH : v === LAND;
        };
        const nx = b.x + b.vx * sdt;
        if (wall(nx + Math.sign(b.vx) * BALL_R, b.y)) b.vx = -b.vx; else b.x = nx;
        const ny = b.y + b.vy * sdt;
        if (wall(b.x, ny + Math.sign(b.vy) * BALL_R)) b.vy = -b.vy; else b.y = ny;
        if (this.hurtTimer > 0 || this.clearTimer > 0) continue;
        // 선이나 선 긋는 꼬마에 닿음
        if (!b.land) {
          for (const [ox, oy] of [[0, 0], [BALL_R, 0], [-BALL_R, 0], [0, BALL_R], [0, -BALL_R]]) {
            const i = this.cellIndex(b.x + ox, b.y + oy);
            if (i >= 0 && this.cells[i] === TRAIL) { this.hit(); break; }
          }
        }
        if (this.hurtTimer > 0) continue;
        const kx = (this.kc + 0.5) * CC, ky = (this.kr + 0.5) * CC;
        if (Math.hypot(b.x - kx, b.y - ky) < BALL_R + CC * 0.6) {
          if (b.land || this.drawing) this.hit();   // 바다 공은 선 긋는 중일 때만, 땅 공은 언제나
        }
      }
    }
  }

  private hit(): void {
    if (this.hurtTimer > 0) return;
    this.lives--;
    this.host.hurt();
    for (const i of this.trail) this.cells[i] = SEA;
    this.trail = [];
    if (this.drawing) { this.kc = this.startC; this.kr = this.startR; }
    this.drawing = false;
    this.dir = [0, 0];
    this.wantDir = [0, 0];
    this.hurtTimer = HURT_PAUSE;
    if (this.lives <= 0) { this.hurtTimer = 0; this.host.gameOver(); }
  }
}
