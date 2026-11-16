// 탑 오르기: 발판을 밟으면 저절로 뛰어오름. 좌우로 움직여 다음 발판에 올라 더 높이
// - 화면을 누른 채 좌우로 끌면 그쪽으로 (방향키도 됨)
// - 5초 뒤부터 화면이 저절로 올라가고 점점 빨라짐. 화면 아래로 떨어지면 끝
// - 12층부터 움직이는 발판, 25층부터 밟으면 부서지는 발판, 가끔 스프링(크게 점프)
// - 15층부터 가시 발판(밟으면 끝)과 옆에서 날아오는 박쥐, 30층부터 깜빡이며 사라지는 유령 발판,
//   40층부터 가끔 옆바람 (캐릭터가 밀림)
// - 기록은 올라간 층수
import { World } from './objects';
import { MiniGame, type MiniHost } from './mini';

export type PadKind = 'normal' | 'moving' | 'crumble' | 'spring' | 'spike' | 'ghost';
export interface Pad { i: number; x: number; w: number; kind: PadKind; vx: number; broken: number; phase: number; }
export interface TowerBat { x: number; y: number; vx: number; phase: number; }
const GHOST_PERIOD = 2.6, GHOST_ON = 0.58;   // 유령 발판: 2.6초마다 58% 동안만 밟힘
export const ghostSolid = (p: Pad, t: number): boolean => ((t + p.phase) % GHOST_PERIOD) / GHOST_PERIOD < GHOST_ON;
// 사라지기 직전 깜빡이는 정도 (0 = 또렷, 1 = 안 보임)
export function ghostFade(p: Pad, t: number): number {
  const k = ((t + p.phase) % GHOST_PERIOD) / GHOST_PERIOD;
  if (k < GHOST_ON - 0.12) return 0;
  if (k < GHOST_ON) return Math.floor(t * 16) % 2 ? 0.55 : 0.1;
  return 0.82;
}

export const FLOOR_GAP = 84;
const GRAVITY = 2300;
const JUMP_V = 990;
const SPRING_V = 1520;
const MOVE_SPEED = 520;
const WALL = 14;                 // 양옆 벽 두께
const SCROLL_DELAY = 4;

export class Tower extends MiniGame {
  readonly hint = '화면을 누른 채 좌우로 끌어서 발판 위로';
  x = World.Width / 2;
  y = 0;                 // 발 위치 (위로 갈수록 작아짐)
  vy = 0;
  camY = 0;              // 화면 맨 위의 월드 y
  floor = 0;             // 밟은 가장 높은 층
  pads: Pad[] = [];
  springT = 0;           // 스프링 연출
  private nextI = 1;
  private lastUnsafe = false;
  bats: TowerBat[] = [];
  private batTimer = 3;
  wind = 0;              // 지금 부는 옆바람 (픽셀/초, + 는 오른쪽)
  windWarn = 0;          // 바람 오기 전 알림 (초)
  private windDir = 1;
  private windTimer = 6;
  private targetX: number | null = null;
  private keyL = false;
  private keyR = false;

  constructor(host: MiniHost, charIndex: number) {
    super(host, charIndex);
    this.pads.push({ i: 0, x: WALL, w: World.Width - WALL * 2, kind: 'normal', vx: 0, broken: 0, phase: 0 });
    this.camY = -World.Height * 0.62;
    this.fill();
  }

  record(): number { return this.floor; }
  sub(): string { return `지금 ${this.floor}층`; }
  coins(): number { return Math.floor(this.floor / 4); }
  get scrollSpeed(): number { return this.time < SCROLL_DELAY ? 0 : Math.min(240, 40 + (this.time - SCROLL_DELAY) * 2.4); }
  padY(i: number): number { return -i * FLOOR_GAP; }

  down(x: number): void { this.targetX = x; }
  move(x: number): void { if (this.targetX !== null) this.targetX = x; }
  up(): void { this.targetX = null; }
  key(k: string, d: boolean): void {
    if (k === 'ArrowLeft') this.keyL = d;
    if (k === 'ArrowRight') this.keyR = d;
  }

  // 화면 위쪽까지 발판 채우기
  private fill(): void {
    while (this.padY(this.nextI) > this.camY - FLOOR_GAP * 2) {
      const i = this.nextI++;
      if (i % 50 === 0) {   // 50층마다 쉬는 바닥
        this.pads.push({ i, x: WALL, w: World.Width - WALL * 2, kind: 'normal', vx: 0, broken: 0, phase: 0 });
        continue;
      }
      const w = Math.max(64, 140 - i * 0.8);
      const r = Math.random();
      let kind: PadKind = 'normal';
      const r2 = Math.random();
      if (i > 8 && r < 0.06) kind = 'spring';
      else if (!this.lastUnsafe && i > 15 && r2 < Math.min(0.2, 0.06 + i * 0.0015)) kind = 'spike';     // 가시 (연달아 나오지 않게)
      else if (!this.lastUnsafe && i > 30 && r2 < Math.min(0.42, 0.26 + i * 0.001)) kind = 'ghost';
      else if (i > 25 && r < 0.26) kind = 'crumble';
      else if (i > 12 && r < 0.5) kind = 'moving';
      const x = WALL + Math.random() * (World.Width - WALL * 2 - w);
      const vx = kind === 'moving' ? (Math.random() < 0.5 ? -1 : 1) * Math.min(200, 80 + i * 1.3) : 0;
      this.pads.push({ i, x, w, kind, vx, broken: 0, phase: Math.random() * GHOST_PERIOD });
      this.lastUnsafe = kind === 'spike' || kind === 'ghost';
    }
    const bottom = this.camY + World.Height + 200;
    this.pads = this.pads.filter((p) => this.padY(p.i) < bottom);
  }

  protected step(dt: number): void {
    // 좌우
    let vx = 0;
    if (this.keyL !== this.keyR) vx = this.keyL ? -MOVE_SPEED : MOVE_SPEED;
    else if (this.targetX !== null) {
      const d = this.targetX - this.x;
      if (Math.abs(d) > 4) vx = Math.sign(d) * Math.min(MOVE_SPEED, Math.abs(d) * 12);
    }
    // 옆바람: 알림 1초 뒤 2.5초 동안 붊
    if (this.floor >= 40) {
      this.windTimer -= dt;
      if (this.windTimer <= 0 && this.windWarn <= 0 && this.wind === 0) { this.windDir = Math.random() < 0.5 ? -1 : 1; this.windWarn = 1; }
      if (this.windWarn > 0) { this.windWarn -= dt; if (this.windWarn <= 0) { this.wind = this.windDir * Math.min(300, 170 + this.floor); this.windTimer = 2.5; } }
      else if (this.wind !== 0 && this.windTimer <= 0) { this.wind = 0; this.windTimer = 5 + Math.random() * 4; }
    }
    this.x = Math.max(WALL + 12, Math.min(World.Width - WALL - 12, this.x + (vx + this.wind) * dt));
    this.moving = Math.abs(vx) > 20;
    if (this.moving) this.facingLeft = vx < 0;

    // 발판 움직이기, 부서지기
    for (const p of this.pads) {
      if (p.vx) {
        p.x += p.vx * dt;
        if (p.x < WALL) { p.x = WALL; p.vx = Math.abs(p.vx); }
        if (p.x + p.w > World.Width - WALL) { p.x = World.Width - WALL - p.w; p.vx = -Math.abs(p.vx); }
      }
      if (p.broken > 0) p.broken += dt;
    }
    this.pads = this.pads.filter((p) => p.broken < 0.6);

    // 위아래 (내려올 때만 발판에 내려앉음)
    const prevY = this.y;
    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.vy > 0) {
      for (const p of this.pads) {
        if (p.broken > 0.12) continue;
        if (p.kind === 'ghost' && !ghostSolid(p, this.time)) continue;
        const py = this.padY(p.i);
        if (prevY <= py && this.y >= py && this.x >= p.x - 10 && this.x <= p.x + p.w + 10) {
          this.y = py;
          if (p.kind === 'spike') { this.vy = -JUMP_V * 0.4; this.die(0.6); break; }
          this.vy = p.kind === 'spring' ? -SPRING_V : -JUMP_V;
          if (p.kind === 'spring') { this.springT = 0.5; this.host.event('pickup'); }
          if (p.kind === 'crumble' && p.broken === 0) p.broken = 0.001;
          if (p.i > this.floor) {
            this.host.score((p.i - this.floor) * 10);
            if (Math.floor(p.i / 10) > Math.floor(this.floor / 10)) this.host.event('stageClear');
            else this.host.event('brickHit');
            this.floor = p.i;
          }
          break;
        }
      }
    }
    this.springT = Math.max(0, this.springT - dt);

    // 화면: 캐릭터가 위쪽 40% 위로 가면 따라 올라가고, 시간이 지나면 저절로 올라감
    const want = this.y - World.Height * 0.42;
    if (want < this.camY) this.camY = want;
    this.camY -= this.scrollSpeed * dt;
    this.fill();
    // 박쥐: 15층부터 화면 옆에서 가로질러 날아옴, 닿으면 끝
    if (this.floor >= 15) {
      this.batTimer -= dt;
      if (this.batTimer <= 0) {
        this.batTimer = Math.max(1.3, 4.2 - this.floor * 0.025) * (0.7 + Math.random() * 0.6);
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.bats.push({ x: dir > 0 ? -30 : World.Width + 30, y: this.camY + World.Height * (0.18 + Math.random() * 0.45), vx: dir * (110 + Math.min(150, this.floor * 1.2) + Math.random() * 60), phase: Math.random() * 6 });
      }
    }
    for (const b of this.bats) {
      b.x += b.vx * dt;
      const by = b.y + Math.sin(this.time * 4 + b.phase) * 14;
      if (!this.dying && Math.hypot(b.x - this.x, by - (this.y - 30)) < 26) this.die(0.6);
    }
    this.bats = this.bats.filter((b) => b.x > -60 && b.x < World.Width + 60 && b.y < this.camY + World.Height + 80);
    if (this.y > this.camY + World.Height + 30) this.die(0.6);
  }
}
