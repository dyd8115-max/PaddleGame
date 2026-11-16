// 괴물 습격: 끝없이 몰려오는 괴물을 자동 공격으로 막으며 오래 버티기
//
// - 화면 어디든 누른 채 끌면 그 방향으로 걷는다 (끝없는 들판, 카메라가 따라감)
// - 공격은 자동. 캐릭터마다 기본 무기가 다르다
//   꼬마: 공(가까운 적에게 던지고 한 번 튕김) · 엘프: 화살(빠르고 꿰뚫음)
//   성녀: 빛 구슬(몸 주위를 돎) · 기사: 검(앞쪽을 넓게 벰)
// - 괴물을 잡으면 경험치 보석. 레벨이 오르면 스킬 3장 중 하나
// - 괴물에 닿으면 체력이 줄고, 0 이 되면 끝. 기록은 버틴 시간
// - 시간이 갈수록 괴물이 많고 단단해진다. 가끔 둥글게 에워싸는 무리, 2분마다 우두머리
import { Characters, World, type CharacterId } from './objects';

export interface RaidHost {
  hit(killed: boolean): void;
  hurt(): void;
  levelUp(): void;
  pickup(): void;
  gameOver(): void;
}

export type RaidSkillId = 'power' | 'haste' | 'multi' | 'speed' | 'heart' | 'magnet' | 'bolt' | 'aura' | 'heal';
const SKILL_BASE: Record<RaidSkillId, { name: string; desc: string; max: number }> = {
  power: { name: '힘', desc: '모든 공격 피해 +20%', max: 5 },
  haste: { name: '빠른 손', desc: '공격 간격 -12%', max: 5 },
  multi: { name: '', desc: '', max: 5 },            // 캐릭터마다 다름 (raidSkillInfo)
  speed: { name: '가벼운 신발', desc: '이동 속도 +10%', max: 5 },
  heart: { name: '튼튼한 몸', desc: '최대 체력 +20, 체력 20 회복', max: 5 },
  magnet: { name: '자석', desc: '보석 줍는 거리 +50%', max: 4 },
  bolt: { name: '번개', desc: '2초마다 몬스터에게 번개 (레벨마다 1마리 더)', max: 5 },
  aura: { name: '불꽃 고리', desc: '몸 주위 몬스터에게 계속 피해 (레벨마다 넓고 세짐)', max: 5 },
  heal: { name: '회복', desc: '체력 40% 회복', max: 99 },
};

export function raidSkillInfo(id: RaidSkillId, ch: CharacterId): { name: string; desc: string } {
  if (id !== 'multi') return SKILL_BASE[id];
  if (ch === 'saint') return { name: '빛 구슬 +1', desc: '몸 주위를 도는 빛 구슬이 하나 더' };
  if (ch === 'knight') return { name: '넓은 베기', desc: '베는 거리 +15%, 3레벨부터 뒤쪽도 함께 벰' };
  if (ch === 'elf') return { name: '화살 +1', desc: '화살을 한 발 더 쏴요' };
  return { name: '공 +1', desc: '공을 하나 더 던져요' };
}

export type RaidKind = 'slime' | 'bat' | 'eye' | 'brute' | 'boss';
const KINDS: Record<RaidKind, { r: number; speed: number; hp: number; dmg: number; xp: number }> = {
  slime: { r: 14, speed: 50, hp: 10, dmg: 8, xp: 1 },
  bat: { r: 11, speed: 98, hp: 6, dmg: 6, xp: 1 },
  eye: { r: 15, speed: 64, hp: 22, dmg: 10, xp: 2 },
  brute: { r: 26, speed: 38, hp: 80, dmg: 16, xp: 6 },
  boss: { r: 46, speed: 46, hp: 900, dmg: 26, xp: 40 },
};

export class RaidMonster {
  hp: number;
  maxHp: number;
  flash = 0;
  phase = Math.random() * Math.PI * 2;
  fireTimer = 99;          // 그리기 호환용 (눈알이 쏘지는 않음)
  kx = 0;                  // 밀려나는 속도
  ky = 0;
  orbCd = 0;               // 빛 구슬·불꽃 고리에 연달아 맞지 않게
  auraCd = 0;
  dead = false;
  constructor(public kind: RaidKind, public pos: { x: number; y: number }, hpMul: number) {
    this.hp = this.maxHp = Math.round(KINDS[kind].hp * hpMul);
  }
  get r(): number { return KINDS[this.kind].r; }
}

export interface RaidShot { x: number; y: number; vx: number; vy: number; dmg: number; life: number; pierce: number; bounce: number; kind: 'ball' | 'arrow'; hit: Set<RaidMonster>; }
export interface Gem { x: number; y: number; xp: number; pull: boolean; }
export interface Drop { x: number; y: number; kind: 'meat' | 'chest' | 'magnet'; }
export interface Slash { x: number; y: number; ang: number; range: number; arc: number; t: number; back: boolean; }
export interface Bolt { x: number; y: number; t: number; }
export interface DmgText { x: number; y: number; v: number; t: number; big?: boolean; }
// 연출: 맞은 자리 번쩍임·고리(fx), 튀는 불티(parts)
export type FxKind = 'hit' | 'kill' | 'boom' | 'bolt' | 'slash';
export interface Fx { x: number; y: number; t: number; life: number; kind: FxKind; size: number; color: string; ang: number; }
export interface Part { x: number; y: number; vx: number; vy: number; t: number; life: number; size: number; color: string; }
const KIND_COLOR: Record<RaidKind, string> = { slime: '#8cf06a', bat: '#b58cff', eye: '#ff6a7a', brute: '#c9a27a', boss: '#ff5a3a' };
const ATTACK_COLOR = { ball: '#fff1b0', arrow: '#9dffc8', orb: '#fff6a0', slash: '#bfe6ff', bolt: '#fff7a0', aura: '#ffab4a' };

const PLAYER_R = 16;
const BASE_SPEED = 190;
const MAX_MONSTERS = 170;
const MAX_GEMS = 260;
const SURGE_EVERY = 45;     // 둥글게 에워싸는 무리
const BOSS_EVERY = 90;     // 우두머리
const KNIGHT_HIT_AT = 0.12; // 휘두르기 시작 뒤 칼이 닿는 때 (공격 그림 4장째)
export const KNIGHT_SWING = 16 / 36;   // 공격 그림 한 번 길이

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Raid {
  // 꼬마(플레이어)
  x = 0;
  y = 0;
  hp = 100;
  maxHp = 100;
  iframe = 0;
  facingLeft = false;
  moving = false;
  swingT = -1;                 // 기사: 휘두르는 중이면 0 부터 증가 (-1 이면 아님)
  private swingDir = 0;
  private swingHit = false;

  time = 0;
  kills = 0;
  level = 1;
  xp = 0;
  skills: Partial<Record<RaidSkillId, number>> = {};
  choosing: RaidSkillId[] | null = null;
  private pendingLevels = 0;
  over = false;
  dying = 0;                   // 쓰러지는 연출 시간

  monsters: RaidMonster[] = [];
  shots: RaidShot[] = [];
  gems: Gem[] = [];
  drops: Drop[] = [];
  slashes: Slash[] = [];
  bolts: Bolt[] = [];
  texts: DmgText[] = [];
  fx: Fx[] = [];
  parts: Part[] = [];
  shake = 0;                   // 화면 흔들림 (초)
  orbAngle = 0;

  private fireTimer = 0.4;
  private boltTimer = 2;
  private spawnAcc = 0;
  private nextSurge = 40;
  private nextBoss = BOSS_EVERY;
  private grid = new Map<number, RaidMonster[]>();

  // 조이스틱 (화면 좌표)
  joyFrom: { x: number; y: number } | null = null;
  joyTo = { x: 0, y: 0 };
  private hold: [number, number] = [0, 0];
  keyDir: [number, number] = [0, 0];

  constructor(private host: RaidHost, readonly charId: CharacterId) {}

  get xpNeed(): number { return 5 + (this.level - 1) * 3; }
  lv(id: RaidSkillId): number { return this.skills[id] ?? 0; }
  get dmgMul(): number { return 1 + 0.2 * this.lv('power'); }
  get magnetR(): number { return 70 * (1 + 0.5 * this.lv('magnet')); }
  get auraR(): number { return this.lv('aura') > 0 ? 50 + 12 * this.lv('aura') : 0; }
  get orbCount(): number { return this.charId === 'saint' ? 3 + this.lv('multi') : 0; }
  get orbRadius(): number { return 80; }
  get swordRange(): number { return 100 * (1 + 0.15 * this.lv('multi')); }

  // ---------- 조작 ----------
  joyBegin(x: number, y: number): void { this.joyFrom = { x, y }; this.joyTo = { x, y }; this.hold = [0, 0]; }
  joyMove(x: number, y: number): void {
    if (!this.joyFrom) return;
    this.joyTo = { x, y };
    let dx = x - this.joyFrom.x, dy = y - this.joyFrom.y;
    const len = Math.hypot(dx, dy), max = 50;
    if (len > max) { this.joyFrom = { x: x - dx / len * max, y: y - dy / len * max }; dx = x - this.joyFrom.x; dy = y - this.joyFrom.y; }
    const l = Math.hypot(dx, dy);
    if (l < 8) this.hold = [0, 0];
    else { const m = Math.min(1, 0.55 + (l - 8) / 50); this.hold = [dx / l * m, dy / l * m]; }
  }
  joyEnd(): void { this.joyFrom = null; this.hold = [0, 0]; }

  // 레벨 업 카드 (화면 가운데 3장)
  cardRect(i: number): { x: number; y: number; w: number; h: number } {
    const w = 140, h = 170, gap = 10;
    const left = (World.Width - (w * 3 + gap * 2)) / 2;
    return { x: left + i * (w + gap), y: World.Height * 0.32, w, h };
  }

  pick(x: number, y: number): boolean {
    if (!this.choosing) return false;
    for (let i = 0; i < this.choosing.length; i++) {
      const c = this.cardRect(i);
      if (x < c.x || x > c.x + c.w || y < c.y || y > c.y + c.h) continue;
      this.apply(this.choosing[i]);
      this.choosing = null;
      if (this.pendingLevels > 0) { this.pendingLevels--; this.offer(); }
      return true;
    }
    return false;
  }

  private apply(id: RaidSkillId): void {
    this.skills[id] = this.lv(id) + 1;
    if (id === 'heart') { this.maxHp += 20; this.hp = Math.min(this.maxHp, this.hp + 20); }
    if (id === 'heal') this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.4);
  }

  private offer(): void {
    const pool = (Object.keys(SKILL_BASE) as RaidSkillId[]).filter((id) => id !== 'heal' && this.lv(id) < SKILL_BASE[id].max);
    const pick = pool.sort(() => Math.random() - 0.5).slice(0, 3);
    while (pick.length < 3) pick.push('heal');
    if (this.hp < this.maxHp * 0.35 && !pick.includes('heal')) pick[2] = 'heal';   // 위험할 땐 회복을 꼭 보여 줌
    this.choosing = pick;
    this.joyEnd();
    this.host.levelUp();
  }

  // ---------- 매 프레임 ----------
  update(dt: number): void {
    if (this.over) return;
    if (this.dying > 0) {
      this.dying -= dt;
      if (this.dying <= 0) { this.over = true; this.host.gameOver(); }
      return;
    }
    if (this.choosing) return;
    this.time += dt;
    this.iframe = Math.max(0, this.iframe - dt);
    this.movePlayer(dt);
    this.spawn(dt);
    this.buildGrid();
    this.updateMonsters(dt);
    this.attack(dt);
    this.updateShots(dt);
    this.updateGems(dt);
    this.updateFx(dt);
    this.monsters = this.monsters.filter((m) => !m.dead);
  }

  private movePlayer(dt: number): void {
    let [hx, hy] = this.hold;
    if (hx === 0 && hy === 0 && (this.keyDir[0] || this.keyDir[1])) {
      const l = Math.hypot(this.keyDir[0], this.keyDir[1]);
      hx = this.keyDir[0] / l; hy = this.keyDir[1] / l;
    }
    const sp = BASE_SPEED * (1 + 0.1 * this.lv('speed'));
    this.moving = hx !== 0 || hy !== 0;
    this.x += hx * sp * dt;
    this.y += hy * sp * dt;
    if (this.swingT < 0 && Math.abs(hx) > 0.15) this.facingLeft = hx < 0;
  }

  // 화면 바로 바깥 한 점
  private edgePoint(): { x: number; y: number } {
    const hw = World.Width / 2 + 40, hh = World.Height / 2 + 40;
    const per = 2 * (hw + hh);
    let t = Math.random() * per * 2;
    if (t < hw * 2) return { x: this.x - hw + t, y: this.y - hh };
    t -= hw * 2;
    if (t < hh * 2) return { x: this.x + hw, y: this.y - hh + t };
    t -= hh * 2;
    if (t < hw * 2) return { x: this.x + hw - t, y: this.y + hh };
    t -= hw * 2;
    return { x: this.x - hw, y: this.y + hh - t };
  }

  private get hpMul(): number { return 1 + this.time / 55 + Math.pow(this.time / 220, 2); }

  private pickKind(): RaidKind {
    const t = this.time, r = Math.random();
    if (t > 40 && r < 0.11) return 'brute';
    if (t > 18 && r < 0.3) return 'eye';
    return r < 0.62 ? 'slime' : 'bat';
  }

  private add(kind: RaidKind, p: { x: number; y: number }): void {
    if (this.monsters.length >= MAX_MONSTERS && kind !== 'boss') return;
    this.monsters.push(new RaidMonster(kind, p, this.hpMul));
  }

  private spawn(dt: number): void {
    const rate = Math.min(11, 1.6 + this.time * 0.042);
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) { this.spawnAcc -= 1; this.add(this.pickKind(), this.edgePoint()); }
    // 둥글게 에워싸는 무리
    if (this.time >= this.nextSurge) {
      this.nextSurge += SURGE_EVERY;
      const n = 22 + Math.floor(this.time / 30) * 2, R = Math.max(World.Width, World.Height) * 0.55;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.add(this.time > 90 ? 'eye' : 'slime', { x: this.x + Math.cos(a) * R, y: this.y + Math.sin(a) * R });
      }
    }
    if (this.time >= this.nextBoss) {
      this.nextBoss += BOSS_EVERY;
      this.add('boss', this.edgePoint());
    }
  }

  // ---------- 괴물 ----------
  private key(cx: number, cy: number): number { return (cx + 4096) * 8192 + (cy + 4096); }
  private buildGrid(): void {
    this.grid.clear();
    for (const m of this.monsters) {
      const k = this.key(Math.floor(m.pos.x / 48), Math.floor(m.pos.y / 48));
      const list = this.grid.get(k);
      if (list) list.push(m); else this.grid.set(k, [m]);
    }
  }
  // 한 점 근처 괴물 (반지름 r 안쪽 칸들)
  near(x: number, y: number, r: number, cb: (m: RaidMonster) => void): void {
    const c0 = Math.floor((x - r) / 48), c1 = Math.floor((x + r) / 48);
    const r0 = Math.floor((y - r) / 48), r1 = Math.floor((y + r) / 48);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const list = this.grid.get(this.key(cx, cy));
      if (list) for (const m of list) if (!m.dead) cb(m);
    }
  }

  private updateMonsters(dt: number): void {
    const far = Math.max(World.Width, World.Height) * 1.4;
    for (const m of this.monsters) {
      m.flash = Math.max(0, m.flash - dt);
      m.orbCd = Math.max(0, m.orbCd - dt);
      m.auraCd = Math.max(0, m.auraCd - dt);
      const k = KINDS[m.kind];
      let dx = this.x - m.pos.x, dy = this.y - m.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      // 너무 멀어진 괴물은 화면 바로 밖으로 다시 데려옴 (계속 쫓아오게)
      if (d > far && m.kind !== 'boss') { const p = this.edgePoint(); m.pos.x = p.x; m.pos.y = p.y; continue; }
      dx /= d; dy /= d;
      let sp = k.speed * (1.08 + Math.min(0.5, this.time / 300));
      if (m.kind === 'bat') { const w = Math.sin(this.time * 6 + m.phase) * 0.6; const ox = -dy * w, oy = dx * w; dx += ox; dy += oy; }
      if (m.flash > 0.05) sp *= 0.4;   // 맞으면 잠깐 느려짐
      m.pos.x += (dx * sp + m.kx) * dt;
      m.pos.y += (dy * sp + m.ky) * dt;
      m.kx *= Math.pow(0.02, dt); m.ky *= Math.pow(0.02, dt);
      // 서로 겹치지 않게 살짝 밀기
      this.near(m.pos.x, m.pos.y, m.r + 14, (o) => {
        if (o === m) return;
        const ex = m.pos.x - o.pos.x, ey = m.pos.y - o.pos.y, ed = Math.hypot(ex, ey), min = (m.r + o.r) * 0.85;
        if (ed > 0 && ed < min) { const push = (min - ed) * 0.5; m.pos.x += ex / ed * push; m.pos.y += ey / ed * push; }
      });
      // 닿으면 아픔
      if (d < m.r + PLAYER_R && this.iframe <= 0) {
        this.hp -= k.dmg;
        this.iframe = 0.45;
        this.host.hurt();
        if (this.hp <= 0) { this.hp = 0; this.dying = 0.9; this.joyEnd(); return; }
      }
    }
  }

  // 연출 넣기 (너무 많으면 오래된 것부터 버림)
  private addFx(kind: FxKind, x: number, y: number, size: number, color: string, life: number, ang = 0): void {
    if (this.fx.length > 70) this.fx.shift();
    this.fx.push({ kind, x, y, size, color, life, t: life, ang });
  }
  private sparks(x: number, y: number, n: number, color: string, speed: number, ang?: number): void {
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 220) this.parts.shift();
      const a = ang === undefined ? Math.random() * Math.PI * 2 : ang + rand(-0.7, 0.7);
      const sp = speed * rand(0.4, 1);
      const life = rand(0.25, 0.5);
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.25, t: life, life, size: rand(2, 4.5), color });
    }
  }

  damage(m: RaidMonster, dmg: number, fromX: number, fromY: number, push = 60, src: keyof typeof ATTACK_COLOR = 'ball'): void {
    if (m.dead) return;
    // 치명타: 10% 확률로 두 배 (불꽃 고리는 제외). 숫자가 크고 노랗게, 불티도 더 튐
    const crit = src !== 'aura' && Math.random() < 0.1;
    const v = Math.max(1, Math.round(crit ? dmg * 2 : dmg));
    m.hp -= v;
    m.flash = 0.1;
    const dx = m.pos.x - fromX, dy = m.pos.y - fromY, d = Math.hypot(dx, dy) || 1;
    const kb = m.kind === 'boss' ? push * 0.15 : m.kind === 'brute' ? push * 0.4 : push;
    m.kx += dx / d * kb; m.ky += dy / d * kb;
    if (this.texts.length < 40) this.texts.push({ x: m.pos.x + rand(-6, 6), y: m.pos.y - m.r, v, t: 0.6, big: crit });
    // 맞은 자리: 공격 색 번쩍임 + 맞은 반대쪽으로 튀는 불티
    const hx = m.pos.x - (dx / d) * m.r * 0.6, hy = m.pos.y - 12 - (dy / d) * m.r * 0.6;
    const col = ATTACK_COLOR[src];
    this.addFx('hit', hx, hy, (10 + m.r * 0.6) * (crit ? 1.6 : 1), crit ? '#ffd84d' : col, crit ? 0.26 : 0.18, Math.atan2(dy, dx));
    this.sparks(hx, hy, crit ? 6 : 3, col, 160, Math.atan2(dy, dx));
    if (m.hp > 0) { this.host.hit(false); return; }
    m.dead = true;
    // 쓰러질 때: 몸 색 연기 고리 + 조각이 사방으로, 큰 놈은 화면이 흔들림
    const big = m.kind === 'boss' ? 2.6 : m.kind === 'brute' ? 1.6 : 1;
    this.addFx('kill', m.pos.x, m.pos.y - m.r * 0.6, m.r * 1.6 * big, KIND_COLOR[m.kind], 0.35 * Math.sqrt(big));
    this.sparks(m.pos.x, m.pos.y - m.r * 0.6, Math.round(7 * big), KIND_COLOR[m.kind], 190 * Math.sqrt(big));
    if (m.kind === 'boss') { this.shake = Math.max(this.shake, 0.5); this.addFx('boom', m.pos.x, m.pos.y - 30, 160, '#ffd27a', 0.6); }
    else if (m.kind === 'brute') this.shake = Math.max(this.shake, 0.15);
    this.kills++;
    this.host.hit(true);
    const k = KINDS[m.kind];
    this.gems.push({ x: m.pos.x, y: m.pos.y, xp: k.xp, pull: false });
    if (m.kind === 'boss') this.drops.push({ x: m.pos.x, y: m.pos.y, kind: 'chest' });
    else if (m.kind === 'brute' && Math.random() < 0.25) this.drops.push({ x: m.pos.x + 10, y: m.pos.y, kind: 'meat' });
    else if (Math.random() < 0.004) this.drops.push({ x: m.pos.x, y: m.pos.y, kind: 'magnet' });
  }

  private nearest(x: number, y: number, maxD: number, skip?: Set<RaidMonster>): RaidMonster | null {
    let best: RaidMonster | null = null, bd = maxD;
    for (const m of this.monsters) {
      if (m.dead || (skip && skip.has(m))) continue;
      const d = Math.hypot(m.pos.x - x, m.pos.y - y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  // ---------- 공격 ----------
  private get interval(): number {
    const base = this.charId === 'knight' ? 0.95 : this.charId === 'elf' ? 0.55 : 0.7;
    return base * Math.pow(0.88, this.lv('haste'));
  }

  private attack(dt: number): void {
    const range = Math.max(World.Width, World.Height) * 0.6;
    if (this.charId === 'saint') this.orbs(dt);
    else {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        const target = this.nearest(this.x, this.y, this.charId === 'knight' ? this.swordRange * 1.6 : range);
        if (target) {
          this.fireTimer = this.interval;
          // 던지는 자리(가슴 높이)에서 재야 곧게 맞음
          const a = Math.atan2(target.pos.y - (this.y - 20), target.pos.x - this.x);
          if (this.charId === 'knight') this.startSwing(a);
          else this.throw(a);
        } else this.fireTimer = 0.1;
      }
    }
    if (this.swingT >= 0) this.updateSwing(dt);
    // 번개
    if (this.lv('bolt') > 0) {
      this.boltTimer -= dt;
      if (this.boltTimer <= 0) {
        this.boltTimer = 2;
        const vis = this.monsters.filter((m) => !m.dead && Math.abs(m.pos.x - this.x) < World.Width / 2 && Math.abs(m.pos.y - this.y) < World.Height / 2);
        vis.sort(() => Math.random() - 0.5);
        for (const m of vis.slice(0, this.lv('bolt'))) {
          this.bolts.push({ x: m.pos.x, y: m.pos.y, t: 0.3 });
          this.addFx('bolt', m.pos.x, m.pos.y - 6, 46, ATTACK_COLOR.bolt, 0.3);
          this.sparks(m.pos.x, m.pos.y - 8, 8, ATTACK_COLOR.bolt, 230);
          this.shake = Math.max(this.shake, 0.08);
          this.damage(m, (18 + 8 * this.lv('bolt')) * this.dmgMul, m.pos.x, m.pos.y - 10, 20, 'bolt');
        }
      }
    }
    // 불꽃 고리
    const ar = this.auraR;
    if (ar > 0) {
      this.near(this.x, this.y, ar + 30, (m) => {
        if (m.auraCd > 0 || Math.hypot(m.pos.x - this.x, m.pos.y - this.y) > ar + m.r) return;
        m.auraCd = 0.35;
        this.damage(m, (3 + 2 * this.lv('aura')) * this.dmgMul, this.x, this.y, 25, 'aura');
      });
    }
  }

  private throw(a: number): void {
    const n = 1 + this.lv('multi');
    const arrow = this.charId === 'elf';
    const spread = arrow ? 0.14 : 0.22;
    for (let i = 0; i < n; i++) {
      const aa = a + (i - (n - 1) / 2) * spread;
      const sp = arrow ? 720 : 430;
      this.shots.push({
        x: this.x, y: this.y - 20, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp,
        dmg: (arrow ? 9 : 12) * this.dmgMul, life: arrow ? 0.9 : 1.2,
        pierce: arrow ? 2 : 1, bounce: 0, kind: arrow ? 'arrow' : 'ball', hit: new Set(),   // 공도 꺾이지 않고 곧게 하나 더 뚫고 지나감
      });
    }
    this.facingLeft = Math.cos(a) < 0;
  }

  private startSwing(a: number): void {
    this.swingT = 0;
    this.swingDir = a;
    this.swingHit = false;
    this.facingLeft = Math.cos(a) < 0;
  }

  private updateSwing(dt: number): void {
    this.swingT += dt;
    if (!this.swingHit && this.swingT >= KNIGHT_HIT_AT) {
      this.swingHit = true;
      const range = this.swordRange, back = this.lv('multi') >= 3;
      // 바라보는 쪽(좌우)으로 넓게 벰. 3레벨부터 뒤쪽도
      const face = this.facingLeft ? Math.PI : 0;
      const ang = Math.abs(Math.sin(this.swingDir)) > 0.85 ? this.swingDir : face;   // 위아래 적이면 그쪽으로
      this.slashes.push({ x: this.x, y: this.y - 18, ang, range, arc: Math.PI * 0.85, t: 0.22, back });
      const dmg = 20 * this.dmgMul;
      this.near(this.x, this.y, range + 50, (m) => {
        const dx = m.pos.x - this.x, dy = m.pos.y - (this.y - 18), d = Math.hypot(dx, dy);
        if (d > range + m.r) return;
        let diff = Math.abs(Math.atan2(dy, dx) - ang);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff <= Math.PI * 0.45 + Math.atan2(m.r, Math.max(1, d)) || back) this.damage(m, dmg, this.x, this.y, 140, 'slash');
      });
    }
    if (this.swingT >= KNIGHT_SWING) this.swingT = -1;
  }

  private orbs(dt: number): void {
    const n = this.orbCount;
    this.orbAngle += dt * (3.4 + 0.35 * this.lv('haste'));
    const R = this.orbRadius, dmg = 12 * this.dmgMul, cd = 0.4 * Math.pow(0.88, this.lv('haste'));
    for (let i = 0; i < n; i++) {
      const a = this.orbAngle + (i / n) * Math.PI * 2;
      const ox = this.x + Math.cos(a) * R, oy = this.y - 18 + Math.sin(a) * R;
      this.near(ox, oy, 30, (m) => {
        if (m.orbCd > 0 || Math.hypot(m.pos.x - ox, m.pos.y - oy) > m.r + 12) return;
        m.orbCd = cd;
        this.damage(m, dmg, this.x, this.y, 40, 'orb');
      });
    }
  }

  orbPos(i: number, back = 0): { x: number; y: number } {   // back: 그만큼 뒤로 돌린 자리 (꼬리 그리기)
    const n = this.orbCount, a = this.orbAngle + back * 3 + (i / n) * Math.PI * 2;
    return { x: this.x + Math.cos(a) * this.orbRadius, y: this.y - 18 + Math.sin(a) * this.orbRadius };
  }

  private updateShots(dt: number): void {
    const keep: RaidShot[] = [];
    for (const s of this.shots) {
      s.life -= dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      let alive = s.life > 0;
      if (alive) {
        this.near(s.x, s.y, 40, (m) => {
          if (!alive || s.hit.has(m) || Math.hypot(m.pos.x - s.x, m.pos.y - s.y) > m.r + 7) return;
          s.hit.add(m);
          this.damage(m, s.dmg, s.x - s.vx * 0.02, s.y - s.vy * 0.02, s.kind === 'arrow' ? 50 : 80, s.kind);
          if (s.pierce > 0) { s.pierce--; return; }
          if (s.bounce > 0) {   // 공: 가까운 다른 괴물에게 튕김
            s.bounce--;
            const n2 = this.nearest(s.x, s.y, 200, s.hit);
            if (n2) {
              const a = Math.atan2(n2.pos.y - s.y, n2.pos.x - s.x), sp = Math.hypot(s.vx, s.vy);
              s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; s.life = 0.6;
              return;
            }
          }
          alive = false;
        });
      }
      if (alive) keep.push(s);
    }
    this.shots = keep;
  }

  // ---------- 보석, 아이템 ----------
  private updateGems(dt: number): void {
    const R = this.magnetR;
    const keep: Gem[] = [];
    for (const g of this.gems) {
      const dx = this.x - g.x, dy = this.y - 10 - g.y, d = Math.hypot(dx, dy);
      if (d < R) g.pull = true;
      if (g.pull) {
        const sp = 260 + 900 * Math.max(0, 1 - d / 300);
        g.x += dx / (d || 1) * sp * dt; g.y += dy / (d || 1) * sp * dt;
        if (d < 16) { this.gainXp(g.xp); continue; }
      }
      keep.push(g);
    }
    // 너무 많으면 오래된 것끼리 합침
    while (keep.length > MAX_GEMS) { const a = keep.shift()!; keep[0].xp += a.xp; }
    this.gems = keep;
    this.drops = this.drops.filter((it) => {
      if (Math.hypot(this.x - it.x, this.y - 10 - it.y) > 26) return true;
      if (it.kind === 'meat') this.hp = Math.min(this.maxHp, this.hp + 30);
      else if (it.kind === 'magnet') for (const g of this.gems) g.pull = true;
      else this.queueLevel();   // 상자: 바로 레벨 업
      this.host.pickup();
      return false;
    });
  }

  private gainXp(n: number): void {
    this.xp += n;
    while (this.xp >= this.xpNeed) { this.xp -= this.xpNeed; this.queueLevel(); }
  }

  // 레벨 하나 올리고 카드 고르기 (고르는 중이면 다음 차례로)
  private queueLevel(): void {
    this.level++;
    if (this.choosing) this.pendingLevels++;
    else this.offer();
  }

  private updateFx(dt: number): void {
    for (const s of this.slashes) s.t -= dt;
    this.slashes = this.slashes.filter((s) => s.t > 0);
    for (const b of this.bolts) b.t -= dt;
    this.bolts = this.bolts.filter((b) => b.t > 0);
    for (const f of this.fx) f.t -= dt;
    this.fx = this.fx.filter((f) => f.t > 0);
    for (const p of this.parts) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 4 * dt; p.vy = p.vy * (1 - 4 * dt) + 260 * dt; }
    this.parts = this.parts.filter((p) => p.t > 0);
    this.shake = Math.max(0, this.shake - dt);
    for (const t of this.texts) { t.t -= dt; t.y -= 40 * dt; }
    this.texts = this.texts.filter((t) => t.t > 0);
  }
}

export const RAID_PLAYER_H = Characters.CellH * 1.22;
