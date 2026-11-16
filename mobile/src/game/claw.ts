// 인형 뽑기: 왼쪽 인형 통에서 집게로 인형을 뽑아, 오른쪽 큰 상자에 떨어뜨림
// - 화면을 누른 채 좌우로 끌면 집게가 따라오고, 손을 떼면 집게가 내려감
//   · 통 위에서 내리면: 그 자리 인형을 집어 올림 (통 맨 위 두 개 중 고르기)
//   · 상자 위에서 내리면: 집고 있던 인형을 놓음
// - 같은 인형끼리 닿으면 한 단계 큰 인형으로 합쳐짐 (수박 게임처럼). 가장 큰 마왕끼리 닿으면 사라지며 큰 점수
// - 인형이 빨간 선 위로 넘친 채 2초가 지나면 끝. 기록은 점수
import { World } from './objects';
import { MiniGame, type MiniHost } from './mini';

// 인형 단계: 작은 것부터. 그림 이름은 sprites.ts 의 doll_*
export const DOLLS = [
  { id: 'slime', name: '슬라임', r: 17, art: 1 },
  { id: 'bat', name: '박쥐', r: 22, art: 1.4 },          // art: 그림 배율 (날개·뿔이 있으면 몸통이 원에 맞게 크게)
  { id: 'imp', name: '꼬마 악마', r: 27, art: 1.08 },
  { id: 'eye', name: '눈알 괴물', r: 33, art: 1 },
  { id: 'kid', name: '꼬마', r: 40, art: 1.04 },
  { id: 'elf', name: '엘프', r: 48, art: 1.12 },
  { id: 'saint', name: '성녀', r: 57, art: 1.06 },
  { id: 'knight', name: '기사', r: 67, art: 1.02 },
  { id: 'brute', name: '거인', r: 78, art: 1 },
  { id: 'boss', name: '마왕', r: 90, art: 1.14 },
] as const;
export const TOP_TIER = DOLLS.length - 1;

export interface Doll { id: number; tier: number; x: number; y: number; vx: number; vy: number; ang: number; age: number; grow: number; }
export interface Pop { x: number; y: number; t: number; tier: number; pts: number; }
export type ClawState = 'idle' | 'down' | 'close' | 'up' | 'open';

const GRAVITY = 1500;
const CLAW_SPEED = 620;        // 좌우 (픽셀/초)
const ROPE_SPEED = 560;        // 오르내림
export const RAIL_Y = 58;
export const REST_Y = 118;     // 집게 손 높이 (쉴 때)
const DANGER_TIME = 2;

// 통 안 인형 높이를 이 크기로 맞춰 보여 줌 (통이 좁아서)
export const binR = (tier: number): number => Math.min(DOLLS[tier].r, 27);

export class ClawGame extends MiniGame {
  readonly hint = '끌어서 집게 옮기기 · 손을 떼면 집게가 내려가요';
  // 자리 (논리 좌표)
  readonly binL = 12;
  readonly binR = 134;
  readonly boxL = 150;
  readonly boxR = World.Width - 10;
  readonly floor = World.Height - 26;
  readonly topY: number;           // 빨간 선 (이 위로 넘치면 위험)
  readonly binTop: number;
  // 집게
  clawX = 73;
  hubY = REST_Y;                   // 집게 손 높이
  state: ClawState = 'idle';
  stateT = 0;
  open = 1;                        // 0 닫힘 ~ 1 열림
  holding = -1;                    // 집고 있는 인형 단계 (-1 없음)
  swing = 0;                       // 줄 흔들림 (라디안)
  private swingV = 0;
  private targetX = 73;
  private pendingDrop = false;
  private destY = REST_Y;
  private grabSlot = -1;
  private lastVx = 0;
  // 통: 맨 위 두 칸이 집을 수 있는 인형, 아래는 꾸밈으로 쌓인 인형들
  slots: number[] = [];
  slotPop = [0, 0];                // 새 인형이 올라오는 연출 (1 → 0)
  heap: { tier: number; x: number; y: number; ang: number }[] = [];
  // 상자
  dolls: Doll[] = [];
  pops: Pop[] = [];
  score = 0;
  maxTier = 0;
  danger = 0;                      // 넘친 채 흐른 시간
  shake = 0;                       // 통 위에서 놓을 수 없을 때 집게 흔들기
  private nextId = 1;

  constructor(host: MiniHost, charIndex: number) {
    super(host, charIndex);
    const boxH = Math.min(500, this.floor - 230);
    this.topY = this.floor - boxH;
    this.binTop = this.floor - 250;
    this.slots = [this.rollTier(), this.rollTier()];
    // 통 아래쪽에 쌓인 인형 (꾸밈)
    let seed = 3;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < 14; k++) {
      const tier = Math.floor(rnd() * 4);
      this.heap.push({ tier, x: this.binL + 16 + rnd() * (this.binR - this.binL - 32), y: this.floor - 40 - rnd() * 100, ang: (rnd() - 0.5) * 1.6 });
    }
    this.heap.sort((a, b) => a.y - b.y);
  }

  record(): number { return this.score; }
  sub(): string { return `가장 큰 인형: ${DOLLS[this.maxTier].name}`; }
  coins(): number { return Math.floor(this.score / 40); }

  // 통 맨 위 두 칸 자리
  slotX(i: number): number { return i === 0 ? this.binL + 31 : this.binR - 31; }
  slotY(i: number): number { return this.floor - 142 - binR(this.slots[i]); }
  // 집게에 매달린 인형 가운데
  heldY(): number { return this.hubY + (this.holding >= 0 ? DOLLS[this.holding].r * 0.75 + 10 : 0); }
  get hubX(): number { return this.clawX + Math.sin(this.swing) * (this.hubY - RAIL_Y); }
  get overBin(): boolean { return this.clawX < this.binR + 6; }

  // 통에 새로 들어오는 인형: 처음엔 작은 것만, 점점 넷째 단계까지
  private rollTier(): number {
    const r = Math.random();
    if (r < 0.34) return 0;
    if (r < 0.64) return 1;
    if (r < 0.86) return 2;
    return 3;
  }

  private clampX(x: number): number {
    const r = this.holding >= 0 ? DOLLS[this.holding].r : 20;
    return Math.max(this.binL + 22, Math.min(this.boxR - Math.max(20, r), x));
  }

  down(x: number): void { if (this.state === 'idle') { this.targetX = this.clampX(x); this.pendingDrop = false; } }
  move(x: number): void { if (this.state === 'idle') this.targetX = this.clampX(x); }
  up(x: number): void {
    if (this.state !== 'idle' || this.dying) return;
    this.targetX = this.clampX(x);
    this.pendingDrop = true;
  }
  key(k: string, d: boolean): void {
    if (!d || this.state !== 'idle') return;
    if (k === 'ArrowLeft') this.targetX = this.clampX(this.targetX - 40);
    else if (k === 'ArrowRight') this.targetX = this.clampX(this.targetX + 40);
    else if (k === ' ' || k === 'ArrowDown' || k === 'Enter') this.pendingDrop = true;
  }

  private setState(s: ClawState): void { this.state = s; this.stateT = 0; }

  // 손을 뗀 곳에서 집게를 내림
  private startDrop(): void {
    this.pendingDrop = false;
    if (this.overBin) {
      if (this.holding >= 0) { this.shake = 0.4; return; }   // 들고 있으면 통에는 못 놓음
      this.grabSlot = this.clawX < (this.binL + this.binR) / 2 ? 0 : 1;
      this.clawX = this.targetX = this.slotX(this.grabSlot);
      this.destY = this.slotY(this.grabSlot) - binR(this.slots[this.grabSlot]) * 0.55;
    } else {
      this.grabSlot = -1;
      this.destY = this.topY - 30 - (this.holding >= 0 ? DOLLS[this.holding].r * 0.75 + 10 : 0);
    }
    this.destY = Math.max(REST_Y, this.destY);
    this.setState('down');
  }

  protected step(dt: number): void {
    this.stateT += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    for (let i = 0; i < 2; i++) this.slotPop[i] = Math.max(0, this.slotPop[i] - dt * 3);

    // 집게 좌우: 일정한 빠르기로 따라감, 줄은 움직임 반대로 살짝 흔들림
    const prevX = this.clawX;
    if (this.state === 'idle') {
      const d = this.targetX - this.clawX;
      const stepX = Math.sign(d) * Math.min(Math.abs(d), CLAW_SPEED * dt);
      this.clawX += stepX;
      this.moving = Math.abs(stepX) > 0.1;
      if (this.pendingDrop && Math.abs(this.targetX - this.clawX) < 0.5) this.startDrop();
    }
    const vx = (this.clawX - prevX) / Math.max(dt, 1e-4);
    const ax = (vx - this.lastVx) / Math.max(dt, 1e-4);
    this.lastVx = vx;
    this.swingV += (-ax * 0.00022 - this.swing * 26) * dt;
    this.swingV *= Math.exp(-3.2 * dt);
    this.swing = Math.max(-0.35, Math.min(0.35, this.swing + this.swingV * dt));

    switch (this.state) {
      case 'down':
        this.open = Math.min(1, this.open + dt * 5);
        this.hubY = Math.min(this.destY, this.hubY + ROPE_SPEED * dt);
        if (this.hubY >= this.destY) {
          if (this.grabSlot >= 0) this.setState('close');
          else if (this.holding >= 0) this.setState('open');
          else this.setState('up');
        }
        break;
      case 'close':
        this.open = Math.max(0, 1 - this.stateT / 0.22);
        if (this.stateT >= 0.25) {
          // 인형을 집고, 그 칸에는 아래에서 새 인형이 올라옴
          this.holding = this.slots[this.grabSlot];
          this.slots[this.grabSlot] = this.rollTier();
          this.slotPop[this.grabSlot] = 1;
          this.host.event('pickup');
          this.setState('up');
        }
        break;
      case 'open':
        this.open = Math.min(1, this.stateT / 0.15);
        if (this.stateT >= 0.08 && this.holding >= 0) {
          const t = this.holding;
          this.dolls.push({ id: this.nextId++, tier: t, x: this.hubX, y: this.heldY(), vx: this.swingV * 90, vy: 30, ang: 0, age: 0, grow: 1 });
          this.holding = -1;
          this.host.event('brickHit');
        }
        if (this.stateT >= 0.2) this.setState('up');
        break;
      case 'up':
        if (this.holding < 0 && this.grabSlot < 0) this.open = Math.max(0.35, this.open - dt * 3);
        this.hubY = Math.max(REST_Y, this.hubY - ROPE_SPEED * dt);
        if (this.hubY <= REST_Y) {
          this.setState('idle');
          this.open = this.holding >= 0 ? 0 : 0.6;
          this.targetX = this.clawX;
        }
        break;
      case 'idle':
        if (this.holding < 0) this.open += (0.6 - this.open) * Math.min(1, dt * 6);
        break;
    }

    this.physics(dt);

    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.9);

    // 넘침: 자리 잡은 인형이 빨간 선 위로 나와 있으면
    const over = this.dolls.some((d) => d.age > 1.2 && d.y - DOLLS[d.tier].r < this.topY && Math.abs(d.vy) < 120);
    this.danger = over ? this.danger + dt : Math.max(0, this.danger - dt * 2);
    if (this.danger >= DANGER_TIME) this.die(1.2);
  }

  // 공처럼 굴러가는 인형들: 작은 걸음으로 나눠 밀어내기
  private physics(dt: number): void {
    const SUB = 4, h = dt / SUB;
    const L = this.boxL, R = this.boxR, F = this.floor;
    for (let s = 0; s < SUB; s++) {
      for (const d of this.dolls) {
        d.age += h;
        d.grow = Math.min(1, d.grow + h * 7);
        d.vy += GRAVITY * h;
        d.x += d.vx * h;
        d.y += d.vy * h;
        d.vx *= 0.9995;
      }
      const merged = new Set<number>();
      const born: Doll[] = [];
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < this.dolls.length; i++) {
          const a = this.dolls[i];
          if (merged.has(a.id)) continue;
          const ra = DOLLS[a.tier].r * (0.6 + 0.4 * a.grow);
          for (let j = i + 1; j < this.dolls.length; j++) {
            const b = this.dolls[j];
            if (merged.has(b.id)) continue;
            const rb = DOLLS[b.tier].r * (0.6 + 0.4 * b.grow);
            let dx = b.x - a.x, dy = b.y - a.y;
            const dist2 = dx * dx + dy * dy, rr = ra + rb;
            if (dist2 >= rr * rr) continue;
            // 같은 인형끼리 닿으면 합치기
            if (a.tier === b.tier) {
              merged.add(a.id); merged.add(b.id);
              born.push(this.merge(a, b));
              break;
            }
            let dist = Math.sqrt(dist2);
            if (dist < 1e-3) { dx = 0.01; dy = -1; dist = 1; }
            const nx = dx / dist, ny = dy / dist, ov = rr - dist;
            const ma = ra * ra, mb = rb * rb, inv = 1 / (ma + mb);
            a.x -= nx * ov * mb * inv; a.y -= ny * ov * mb * inv;
            b.x += nx * ov * ma * inv; b.y += ny * ov * ma * inv;
            const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (vn < 0) {
              const jn = (-(1 + 0.12) * vn) / (1 / ma + 1 / mb);
              a.vx -= (jn / ma) * nx; a.vy -= (jn / ma) * ny;
              b.vx += (jn / mb) * nx; b.vy += (jn / mb) * ny;
              // 미끄럼 줄이기 (천 인형이라 잘 안 미끄러짐)
              const tx = -ny, ty = nx;
              const vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
              const jt = (-vt * 0.18) / (1 / ma + 1 / mb);
              a.vx -= (jt / ma) * tx; a.vy -= (jt / ma) * ty;
              b.vx += (jt / mb) * tx; b.vy += (jt / mb) * ty;
            }
          }
        }
        // 벽과 바닥
        for (const d of this.dolls) {
          const r = DOLLS[d.tier].r * (0.6 + 0.4 * d.grow);
          if (d.x - r < L) { d.x = L + r; if (d.vx < 0) d.vx = -d.vx * 0.2; }
          if (d.x + r > R) { d.x = R - r; if (d.vx > 0) d.vx = -d.vx * 0.2; }
          if (d.y + r > F) { d.y = F - r; if (d.vy > 0) d.vy = -d.vy * 0.15; d.vx *= 0.985; }
        }
      }
      if (merged.size) this.dolls = this.dolls.filter((d) => !merged.has(d.id)).concat(born.filter((d) => d.tier <= TOP_TIER));
      for (const d of this.dolls) d.ang += (d.vx / DOLLS[d.tier].r) * h * 0.8;
    }
  }

  // 두 인형 → 한 단계 큰 인형 (마왕 둘은 사라짐)
  private merge(a: Doll, b: Doll): Doll {
    const tier = a.tier + 1;
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    const pts = tier > TOP_TIER ? 200 : tier * (tier + 1);
    this.score += pts;
    this.host.score(pts);
    this.pops.push({ x, y, t: 0, tier: Math.min(tier, TOP_TIER), pts });
    if (tier <= TOP_TIER && tier > this.maxTier) { this.maxTier = tier; this.host.event(tier >= 5 ? 'levelUp' : 'brickBreak'); }
    else this.host.event('brickBreak');
    return { id: this.nextId++, tier, x, y, vx: (a.vx + b.vx) / 2, vy: Math.min(0, (a.vy + b.vy) / 2), ang: (a.ang + b.ang) / 2, age: Math.max(a.age, b.age), grow: 0 };
  }
}
