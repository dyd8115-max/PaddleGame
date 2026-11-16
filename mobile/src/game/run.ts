// 끝없이 달리기: 오른쪽으로 저절로 달리고, 누르면 점프 (공중에서 한 번 더)
// - 길게 누르면 더 높이. 구덩이에 빠지거나 가시·상자·박쥐에 부딪히면 끝
// - 12초부터 굴러오는 바위, 20초부터 밟으면 무너지는 땅, 25초부터 하늘에서 떨어지는 바위 (그림자로 미리 알림)
// - 점점 빨라짐. 기록은 달린 거리(m)
import { World } from './objects';
import { MiniGame, type MiniHost } from './mini';

export interface Ground { x0: number; x1: number; y: number; crumble?: boolean; fall?: number; }   // 땅 한 덩어리 (y 는 윗면). crumble: 밟으면 무너짐, fall: 밟은 뒤 흐른 시간
export type ObKind = 'spike' | 'crate' | 'bat' | 'roller' | 'rock';
export interface Obstacle { kind: ObKind; x: number; y: number; w: number; h: number; phase: number; drop?: number; }   // rock: drop = 떨어진 거리 (-1 이면 아직 매달림)
export interface RunGem { x: number; y: number; got: boolean; }

export const PX_PER_M = 40;
export const PLAYER_SX = 120;        // 캐릭터가 화면에서 서 있는 가로 위치
const GRAVITY = 2700;
const JUMP_V = 800;
const AIR_JUMP_V = 660;
const HOLD_TIME = 0.22;              // 누르고 있으면 이 시간 동안 덜 떨어짐 (더 높이)
const HIT_W = 22, HIT_H = 50;
export const CRUMBLE_TIME = 0.42;   // 무너지는 땅: 밟고 이만큼 뒤 꺼짐
const ROLL_SPEED = 170;             // 굴러오는 바위 (왼쪽으로)

export class Run extends MiniGame {
  readonly hint = '누르면 점프 · 공중에서 한 번 더 · 길게 누르면 높이';
  dist = 0;              // 달린 거리 (픽셀) = 카메라 왼쪽 끝
  y = 0;                 // 발 높이
  vy = 0;
  grounded = true;
  private airJumps = 1;
  private holdT = 0;
  private holding = false;
  grounds: Ground[] = [];
  obstacles: Obstacle[] = [];
  gems: RunGem[] = [];
  gemCount = 0;
  private genX = 0;

  constructor(host: MiniHost, charIndex: number) {
    super(host, charIndex);
    this.y = this.baseY;
    this.grounds.push({ x0: -200, x1: 900, y: this.baseY });
    this.genX = 900;
    this.moving = true;
  }

  get baseY(): number { return World.Height * 0.72; }
  get speed(): number { return Math.min(860, 380 + this.time * 10); }
  get px(): number { return this.dist + PLAYER_SX; }   // 캐릭터 월드 x
  get meters(): number { return Math.floor(this.dist / PX_PER_M); }
  record(): number { return this.meters; }
  sub(): string { return `보석 ${this.gemCount}개`; }
  coins(): number { return Math.floor(this.meters / 40) + Math.floor(this.gemCount / 5); }

  down(): void { this.jump(); }
  up(): void { this.holding = false; }
  key(k: string, d: boolean): void {
    if (k !== ' ' && k !== 'ArrowUp') return;
    if (d) this.jump(); else this.holding = false;
  }

  private jump(): void {
    if (this.dying) return;
    if (this.grounded) { this.vy = -JUMP_V; this.grounded = false; }
    else if (this.airJumps > 0) { this.airJumps--; this.vy = -AIR_JUMP_V; }
    else return;
    this.holding = true;
    this.holdT = HOLD_TIME;
    this.host.event('brickHit');
  }

  // 앞쪽 길 만들기
  private generate(): void {
    const ahead = this.dist + World.Width + 600;
    while (this.genX < ahead) {
      const sp = this.speed;
      const air = 2 * JUMP_V / GRAVITY;               // 한 번 점프로 떠 있는 시간
      const last = this.grounds[this.grounds.length - 1];
      const diff = Math.min(1, this.time / 70);
      // 구덩이 (한 번 점프로 넘을 수 있는 폭까지)
      const gap = Math.random() < 0.42 ? 0 : (0.25 + Math.random() * (0.25 + 0.25 * diff)) * air * sp;
      const len = 380 + Math.random() * 520 - diff * 140;
      // 구덩이 건너편은 높이가 달라도 되지만, 이어진 땅은 평평하거나 내리막만 (오르막 벽에 부딪히면 억울함)
      const dy = gap > 0 ? (Math.random() - 0.55) * 110 : (Math.random() < 0.3 ? 20 + Math.random() * 50 : 0);
      const y = Math.max(World.Height * 0.55, Math.min(World.Height * 0.8, last.y + dy));
      const x0 = this.genX + gap, x1 = x0 + len;
      // 무너지는 땅: 구덩이 뒤에 오는 짧은 땅 (달려서 빨리 지나가야 함)
      const crumble = this.time > 20 && gap > 0 && Math.random() < 0.3;
      this.grounds.push({ x0, x1: crumble ? x0 + Math.min(len, 170 + sp * 0.15) : x1, y: gap === 0 ? Math.max(last.y, y) : y, crumble });
      if (crumble) { this.genX = this.grounds[this.grounds.length - 1].x1; continue; }
      const gy = this.grounds[this.grounds.length - 1].y;
      // 장애물
      let ox = x0 + 160 + Math.random() * 120;
      while (ox < x1 - 140) {
        const r = Math.random();
        if (r < 0.42) {
          const w = 28 + Math.floor(Math.random() * (1 + 2 * diff)) * 28;
          this.obstacles.push({ kind: 'spike', x: ox, y: gy, w, h: 26, phase: 0 });
        } else if (r < 0.7) {
          const h = Math.random() < 0.5 ? 44 : 80;
          this.obstacles.push({ kind: 'crate', x: ox, y: gy, w: 44, h, phase: 0 });
        } else if (this.time > 12 && r < 0.8) {
          // 굴러오는 바위: 땅 위를 왼쪽으로 굴러옴 (뛰어넘기)
          this.obstacles.push({ kind: 'roller', x: ox + sp * 0.6, y: gy, w: 40, h: 40, phase: 0 });
        } else if (this.time > 25 && r < 0.9) {
          // 떨어지는 바위: 가까이 가면 위에서 떨어짐. 땅에 그림자로 미리 보임
          this.obstacles.push({ kind: 'rock', x: ox, y: gy, w: 46, h: 46, phase: 0, drop: -1 });
        } else if (this.time > 8) {
          // 박쥐: 낮게(뛰어넘기) 또는 높게(그냥 달리기, 뛰면 부딪힘)
          const high = Math.random() < 0.5;
          this.obstacles.push({ kind: 'bat', x: ox, y: gy - (high ? 118 : 58), w: 34, h: 24, phase: Math.random() * 6 });
        }
        // 보석 줄
        if (Math.random() < 0.4) for (let k = 0; k < 4; k++) this.gems.push({ x: ox + 60 + k * 34, y: gy - 120 - Math.sin(k / 3 * Math.PI) * 40, got: false });
        ox += sp * (0.75 + Math.random() * 0.8) * (1.1 - diff * 0.35);
      }
      this.genX = x1;
    }
    const left = this.dist - 200;
    this.grounds = this.grounds.filter((g) => g.x1 > left);
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > left);
    this.gems = this.gems.filter((g) => g.x > left && !g.got);
  }

  groundAt(x: number): Ground | null {
    for (const g of this.grounds) if (x >= g.x0 && x <= g.x1 && !(g.fall !== undefined && g.fall > CRUMBLE_TIME)) return g;
    return null;
  }

  // 떨어지는 바위의 바닥 높이 (아직 안 떨어졌으면 null). 땅에 닿으면 멈춤
  rockY(o: Obstacle): number | null {
    if (o.drop === undefined || o.drop < 0) return null;
    const startY = o.y - World.Height * 0.85;
    return Math.min(o.y, startY + o.drop);
  }

  protected step(dt: number): void {
    this.generate();
    const prevX = this.px;
    this.dist += this.speed * dt;
    const x = this.px;
    // 옆에서 땅 덩어리에 부딪힘 (더 높은 땅의 옆면)
    for (const g of this.grounds) {
      if (prevX <= g.x0 && x > g.x0 && this.y > g.y + 8) { this.die(); return; }
    }
    // 위아래
    let gScale = 1;
    if (this.holding && this.holdT > 0 && this.vy < 0) { this.holdT -= dt; gScale = 0.62; }
    const prevY = this.y;
    this.vy += GRAVITY * gScale * dt;
    this.y += this.vy * dt;
    const g = this.groundAt(x - 6) ?? this.groundAt(x + 6);
    if (g && this.vy >= 0 && prevY <= g.y + 2 && this.y >= g.y) {
      this.y = g.y; this.vy = 0;
      if (!this.grounded) this.airJumps = 1;
      this.grounded = true;
    } else if (!g || this.y < g.y - 1) this.grounded = false;
    if (this.y > World.Height + 80) { this.die(0.4); return; }

    // 무너지는 땅: 밟으면 시간이 흐르기 시작
    for (const gr of this.grounds) {
      if (gr.fall !== undefined) gr.fall += dt;
      else if (gr.crumble && this.grounded && g === gr) { gr.fall = 0; this.host.event('brickHit'); }
    }
    // 굴러오는 바위, 떨어지는 바위 움직이기
    for (const o of this.obstacles) {
      if (o.kind === 'roller') { o.x -= ROLL_SPEED * dt; o.phase += ROLL_SPEED * dt / 20; }
      else if (o.kind === 'rock') {
        if (o.drop! < 0 && o.x - x < this.speed * 0.55) o.drop = 0;
        if (o.drop! >= 0 && o.drop! < 900) o.drop! += (300 + o.drop! * 3.2) * dt;
      }
    }
    // 장애물
    const l = x - HIT_W / 2, r = x + HIT_W / 2, top = this.y - HIT_H, bot = this.y - 2;
    for (const o of this.obstacles) {
      let ox = o.x, oy = o.y - o.h, ow = o.w, oh = o.h;
      if (o.kind === 'bat') { oy = o.y + Math.sin(this.time * 5 + o.phase) * 6 - o.h / 2; }
      if (o.kind === 'spike') { ox += 4; ow -= 8; oy += 8; oh -= 8; }
      if (o.kind === 'roller') { ox += 6; ow -= 12; oy += 6; oh -= 6; }
      if (o.kind === 'rock') { const fy = this.rockY(o); if (fy === null) continue; oy = fy - o.h + 6; oh -= 10; ox += 5; ow -= 10; }
      if (r > ox && l < ox + ow && bot > oy && top < oy + oh) {
        // 상자는 위에서 내려오면 밟고 설 수 있음
        if (o.kind === 'crate' && this.vy >= 0 && prevY <= o.y - o.h + 4) {
          this.y = o.y - o.h; this.vy = 0; this.grounded = true; this.airJumps = 1;
          continue;
        }
        this.die();
        return;
      }
    }
    // 상자 위를 달리는 중이면 바닥 유지
    if (!this.grounded) {
      for (const o of this.obstacles) {
        if (o.kind === 'crate' && x > o.x - 6 && x < o.x + o.w + 6 && Math.abs(this.y - (o.y - o.h)) < 1 && this.vy >= 0) { this.grounded = true; this.vy = 0; }
      }
    }
    this.moving = this.grounded;
    // 보석
    for (const gm of this.gems) {
      if (!gm.got && Math.abs(gm.x - x) < 22 && gm.y > top - 10 && gm.y < bot + 10) {
        gm.got = true; this.gemCount++; this.host.score(5); this.host.event('pickup');
      }
    }
    // 100m 마다 효과음
    if (Math.floor((this.dist - this.speed * dt) / PX_PER_M / 100) < Math.floor(this.meters / 100)) this.host.event('stageClear');
  }
}
