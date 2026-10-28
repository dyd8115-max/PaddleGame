// 꼬마 모드: 블록 뭉치 지키기 (타임어택)
//
// - 화면 가운데에 블록 뭉치가 떠 있고, 꼬마는 그 위에 서 있다. 블록 바깥은 낭떠러지
// - 화면 어디든 누른 채 끌면 꼬마가 그 방향으로 움직인다 (블록 위로만 다닐 수 있음)
// - 꼬마는 가장 가까운 괴물에게 공을 자동으로 던진다. 멈춰 있으면 1.5배 빨리 던진다
// - 괴물은 화면 네 변 밖에서 날아와 블록을 갉아먹는다. 꼬마를 직접 공격하지는 않는다
//   슬라임(느림), 박쥐(빠르고 흔들림, 꼬마가 선 블록을 노림), 눈알(멀리서 꼬마가 선 블록에 탄을 쏨), 덩치(크고 단단하고 많이 갉아먹음)
// - 꼬마가 서 있는 블록이 부서지면 떨어져서 끝. 기록은 버틴 시간
// - 괴물을 잡으면 경험치. 레벨이 오르면 스킬 3개 중 하나를 고른다 (궁수 모드 스킬, 체력 회복 대신 블록 복구)
import { Rect, Vec2 } from './geometry';
import { Characters, World } from './objects';
import { SKILLS, type SkillId } from './archer';

export interface HordeHost {
  hit(killed: boolean): void;
  tileBreak(): void;
  levelUp(): void;
  fall(): void;
  gameOver(): void;
}

export const KID_SCALE = 0.95;          // 꼬마 그림 크기 (캐릭터 칸 기준)
export const KID_DRAW_W = Characters.CellW * KID_SCALE;
export const KID_DRAW_H = Characters.CellH * KID_SCALE;
const MOVE_SPEED = 220;
const JOY_DEAD = 8;
const JOY_FULL = 44;
export const SHOT_SPEED = 620;
export const SHOT_R = 6;
const SHOT_LIFE = 1.1;                  // 던진 공은 이 시간이 지나면 사라짐
const FIRE_EVERY = 0.5;                 // 움직일 때 던지는 간격 (멈추면 1.5배 빨리)
const MULTI_GAP = 0.12;
const MAX_MONSTERS = 90;
const FALL_TIME = 0.8;                  // 떨어지는 모습 보여 주는 시간

export const TILE = 44;                 // 블록 한 칸
export const TILE_COLS = 7;
export const TILE_ROWS = 7;
export const TILE_HP = 10;
const BULLET_DMG = 2;
const REPAIR_COUNT = 8;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export type MonsterKind = 'slime' | 'bat' | 'eye' | 'brute';
const KINDS: Record<MonsterKind, { r: number; speed: number; hp: number; xp: number; bite: number }> = {
  slime: { r: 15, speed: 46, hp: 2, xp: 1, bite: 1.2 },
  bat: { r: 12, speed: 100, hp: 1, xp: 1, bite: 0.8 },
  eye: { r: 15, speed: 55, hp: 3, xp: 2, bite: 0 },
  brute: { r: 28, speed: 30, hp: 14, xp: 5, bite: 4 },
};

// 이 모드에서는 체력 회복 대신 블록 복구
export function hordeSkill(id: SkillId): { name: string; desc: string } {
  if (id === 'heal') return { name: '블록 복구', desc: `부서진 블록 ${REPAIR_COUNT}개를 되살리고 금 간 블록을 고쳐요` };
  const s = SKILLS[id];
  return { name: s.name.replace('화살', '공'), desc: s.desc.replace('화살', '공') };   // 꼬마는 화살 대신 공
}

export class Monster {
  hp: number;
  maxHp: number;
  flash = 0;              // 맞으면 잠깐 하얗게
  fireTimer = rand(1.5, 3);
  phase = Math.random() * Math.PI * 2;
  target = -1;            // 노리는 블록 번호
  biting = false;
  retarget = 0;
  constructor(public kind: MonsterKind, public pos: Vec2, hpMul: number) {
    this.hp = this.maxHp = Math.max(1, Math.round(KINDS[kind].hp * hpMul));
  }
  get r(): number { return KINDS[this.kind].r; }
}

export interface Shot {
  pos: Vec2; vel: Vec2; dmg: number; life: number;
  pierce: number; ricochet: number; wall: number;
  hit: Set<object>;
}

export interface Bullet { pos: Vec2; vel: Vec2; }

export class Horde {
  time = 0;
  kills = 0;
  level = 1;
  xp = 0;
  skills: Partial<Record<SkillId, number>> = {};
  choosing: SkillId[] | null = null;
  tiles: number[] = Array(TILE_COLS * TILE_ROWS).fill(TILE_HP);   // 블록 체력, 0 이면 부서짐
  tileFlash: number[] = Array(TILE_COLS * TILE_ROWS).fill(0);

  x = World.Width / 2;       // 꼬마 발 위치
  y = World.Height / 2 + TILE * 0.3;
  moving = false;
  vx = 0;
  falling = 0;               // 0 보다 크면 떨어지는 중

  monsters: Monster[] = [];
  shots: Shot[] = [];
  bullets: Bullet[] = [];

  joyFrom: Vec2 | null = null;
  joyTo = new Vec2();
  keyDir = new Vec2();   // PC 방향키

  private spawnTimer = 0.8;
  private fireTimer = 0.4;
  private multiLeft = 0;
  private multiTimer = 0;
  private multiDir = new Vec2(0, -1);
  private waveTimer = 20;
  private over = false;

  constructor(private host: HordeHost) {}

  get xpNeed(): number { return 3 + this.level * 3; }
  get damage(): number { return 1 + (this.skills.power ?? 0); }
  get spawnEvery(): number { return Math.max(0.2, 1.2 - this.time * 0.011); }
  get hpMul(): number { return 1 + this.time / 25 + (this.time / 60) ** 2; }
  get tilesLeft(): number { return this.tiles.filter((h) => h > 0).length; }

  // ---------- 블록 ----------
  get boardLeft(): number { return (World.Width - TILE * TILE_COLS) / 2; }
  get boardTop(): number { return (World.Height - TILE * TILE_ROWS) / 2; }
  tileRect(i: number): Rect {
    return new Rect(this.boardLeft + (i % TILE_COLS) * TILE, this.boardTop + Math.floor(i / TILE_COLS) * TILE, TILE, TILE);
  }
  tileAt(x: number, y: number): number {
    const c = Math.floor((x - this.boardLeft) / TILE), r = Math.floor((y - this.boardTop) / TILE);
    if (c < 0 || c >= TILE_COLS || r < 0 || r >= TILE_ROWS) return -1;
    return r * TILE_COLS + c;
  }
  private solidAt(x: number, y: number): boolean {
    const i = this.tileAt(x, y);
    return i >= 0 && this.tiles[i] > 0;
  }

  // ---------- 조작 ----------
  joyBegin(x: number, y: number): void { this.joyFrom = new Vec2(x, y); this.joyTo = new Vec2(x, y); }
  joyMove(x: number, y: number): void { if (this.joyFrom) this.joyTo = new Vec2(x, y); }
  joyEnd(): void { this.joyFrom = null; }

  cardRect(i: number): Rect {
    const w = 140, h = 170, gap = 10;
    const left = (World.Width - (w * 3 + gap * 2)) / 2;
    return new Rect(left + i * (w + gap), World.Height * 0.32, w, h);
  }

  pick(x: number, y: number): boolean {
    if (!this.choosing) return false;
    for (let i = 0; i < this.choosing.length; i++) {
      if (!this.cardRect(i).contains(x, y)) continue;
      const id = this.choosing[i];
      this.skills[id] = (this.skills[id] ?? 0) + 1;
      if (id === 'heal') this.repair();
      this.choosing = null;
      return true;
    }
    return false;
  }

  // 부서진 블록 몇 개 되살리기 (꼬마와 가까운 것부터), 금 간 블록은 모두 고침
  private repair(): void {
    const broken = this.tiles.map((_, i) => i).filter((i) => this.tiles[i] <= 0)
      .sort((a, b) => this.distToTile(a) - this.distToTile(b)).slice(0, REPAIR_COUNT);
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] > 0) this.tiles[i] = TILE_HP;
    for (const i of broken) this.tiles[i] = TILE_HP;
  }

  private distToTile(i: number): number {
    const r = this.tileRect(i);
    return Math.hypot(r.centerX - this.x, r.centerY - this.y);
  }

  private offerSkills(): void {
    const pool = (Object.keys(SKILLS) as SkillId[]).filter((id) => (this.skills[id] ?? 0) < SKILLS[id].max);
    this.choosing = pool.sort(() => Math.random() - 0.5).slice(0, 3);
    this.joyFrom = null;
    this.host.levelUp();
  }

  // ---------- 매 프레임 ----------
  update(dt: number): void {
    if (this.over) return;
    if (this.falling > 0) {   // 떨어지는 중: 다른 건 멈춤
      this.falling -= dt;
      if (this.falling <= 0) { this.over = true; this.host.gameOver(); }
      return;
    }
    if (this.choosing) return;
    this.time += dt;
    for (let i = 0; i < this.tileFlash.length; i++) this.tileFlash[i] = Math.max(0, this.tileFlash[i] - dt);
    this.moveKid(dt);
    this.spawn(dt);
    this.updateMonsters(dt);
    this.updateShooting(dt);
    this.updateShots(dt);
    this.updateBullets(dt);
    if (!this.solidAt(this.x, this.y)) {   // 발 밑 블록이 부서짐 → 떨어짐
      this.falling = FALL_TIME;
      this.joyFrom = null;
      this.host.fall();
    }
  }

  private moveKid(dt: number): void {
    let vx = 0, vy = 0;
    if (this.joyFrom) {
      const dx = this.joyTo.x - this.joyFrom.x, dy = this.joyTo.y - this.joyFrom.y;
      const len = Math.hypot(dx, dy);
      if (len > JOY_DEAD) {
        const sp = MOVE_SPEED * Math.min(1, (len - JOY_DEAD) / (JOY_FULL - JOY_DEAD));
        vx = dx / len * sp; vy = dy / len * sp;
      }
    } else if (this.keyDir.x !== 0 || this.keyDir.y !== 0) {
      const len = Math.hypot(this.keyDir.x, this.keyDir.y);
      vx = this.keyDir.x / len * MOVE_SPEED; vy = this.keyDir.y / len * MOVE_SPEED;
    }
    this.moving = vx !== 0 || vy !== 0;
    this.vx = vx;
    // 블록 위로만: 가려는 곳이 낭떠러지면 그 방향으로는 안 감 (가장자리에서 조금 안쪽까지만)
    const m = 6;
    const ok = (x: number, y: number) => this.solidAt(x + m, y) && this.solidAt(x - m, y) && this.solidAt(x, y + m) && this.solidAt(x, y - m);
    const nx = this.x + vx * dt;
    if (ok(nx, this.y)) this.x = nx;
    const ny = this.y + vy * dt;
    if (ok(this.x, ny)) this.y = ny;
  }

  // 네 변 중 한 곳, 화면 바로 바깥에서 나옴
  private edgePoint(): Vec2 {
    const W = World.Width, H = World.Height, m = 30;
    switch (Math.floor(Math.random() * 4)) {
      case 0: return new Vec2(rand(0, W), -m);
      case 1: return new Vec2(rand(0, W), H + m);
      case 2: return new Vec2(-m, rand(0, H));
      default: return new Vec2(W + m, rand(0, H));
    }
  }

  private pickKind(): MonsterKind {
    const t = this.time, r = Math.random();
    if (t > 40 && r < 0.08) return 'brute';
    if (t > 15 && r < 0.2) return 'eye';
    if (t > 5 && r < 0.45) return 'bat';
    return 'slime';
  }

  private spawn(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.monsters.length < MAX_MONSTERS) {
      this.spawnTimer = this.spawnEvery * rand(0.7, 1.3);
      this.monsters.push(new Monster(this.pickKind(), this.edgePoint(), this.hpMul));
    }
    // 20초마다 한쪽 변에서 무리가 한꺼번에 몰려옴
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.waveTimer = 20;
      const n = 6 + Math.floor(this.time / 15);
      const side = Math.floor(Math.random() * 4);
      const W = World.Width, H = World.Height;
      for (let i = 0; i < n && this.monsters.length < MAX_MONSTERS; i++) {
        const u = (i + 0.5) / n;
        const p = side === 0 ? new Vec2(u * W, -30 - (i % 2) * 24) : side === 1 ? new Vec2(u * W, H + 30 + (i % 2) * 24)
          : side === 2 ? new Vec2(-30 - (i % 2) * 24, u * H) : new Vec2(W + 30 + (i % 2) * 24, u * H);
        this.monsters.push(new Monster(this.time > 30 && i % 3 === 0 ? 'bat' : 'slime', p, this.hpMul));
      }
    }
  }

  // 괴물에게서 가장 가까운 살아 있는 블록
  private nearestTile(p: Vec2): number {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i] <= 0) continue;
      const r = this.tileRect(i);
      const d = Math.hypot(r.centerX - p.x, r.centerY - p.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  private damageTile(i: number, dmg: number, flash = false): void {
    if (i < 0 || this.tiles[i] <= 0) return;
    this.tiles[i] -= dmg;
    if (flash) this.tileFlash[i] = 0.12;
    if (this.tiles[i] <= 0) { this.tiles[i] = 0; this.host.tileBreak(); }
  }

  private updateMonsters(dt: number): void {
    for (const m of this.monsters) {
      m.flash = Math.max(0, m.flash - dt);
      const k = KINDS[m.kind];
      m.retarget -= dt;
      if (m.target < 0 || this.tiles[m.target] <= 0 || m.retarget <= 0) {
        // 박쥐와 눈알은 꼬마가 서 있는 블록을 노리고, 나머지는 가장 가까운 블록을 갉아먹음
        const under = this.tileAt(this.x, this.y);
        m.target = (m.kind === 'bat' || m.kind === 'eye') && under >= 0 && this.tiles[under] > 0 ? under : this.nearestTile(m.pos);
        m.retarget = m.kind === 'bat' ? 0.4 : 1;
      }
      if (m.target < 0) continue;
      const tr = this.tileRect(m.target);
      // 블록 가장자리의 가장 가까운 점을 향해
      const gx = Math.max(tr.left, Math.min(tr.right, m.pos.x)), gy = Math.max(tr.top, Math.min(tr.bottom, m.pos.y));
      const dx = gx - m.pos.x, dy = gy - m.pos.y, d = Math.hypot(dx, dy);
      let sp = k.speed * Math.min(1.8, 1 + this.time / 100);
      let ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : 0;
      m.biting = false;

      if (m.kind === 'eye') {   // 거리를 두고 블록에 탄을 쏨
        const inside = m.pos.x > 10 && m.pos.x < World.Width - 10 && m.pos.y > 10 && m.pos.y < World.Height - 10;
        if (d < 110 && inside) sp = -sp * 0.5; else if (d < 160 && inside) sp = 0;
        m.fireTimer -= dt;
        if (m.fireTimer <= 0 && inside) {
          m.fireTimer = rand(2.2, 3.2);
          const cx = tr.centerX - m.pos.x, cy = tr.centerY - m.pos.y, cd = Math.hypot(cx, cy) || 1;
          const bs = Math.min(240, 160 + this.time * 0.5);
          this.bullets.push({ pos: new Vec2(m.pos.x, m.pos.y), vel: new Vec2(cx / cd * bs, cy / cd * bs) });
        }
      } else if (d < m.r * 0.6) {   // 블록에 붙어서 갉아먹음
        sp = 0;
        m.biting = true;
        this.damageTile(m.target, k.bite * dt * Math.min(2, 1 + this.time / 120));
      } else if (m.kind === 'bat') {   // 지그재그
        m.phase += dt * 6;
        const s = Math.sin(m.phase) * 0.7;
        const ox = ux;
        ux += -uy * s; uy += ox * s;
        const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
      }
      m.pos = new Vec2(m.pos.x + ux * sp * dt, m.pos.y + uy * sp * dt);
    }
    // 괴물끼리 겹치지 않게 살짝 밀어냄
    const ms = this.monsters;
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i], b = ms[j];
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, min = (a.r + b.r) * 0.85, d = Math.hypot(dx, dy);
      if (d > 0 && d < min) {
        const push = (min - d) / 2, ux = dx / d, uy = dy / d;
        a.pos = new Vec2(a.pos.x - ux * push, a.pos.y - uy * push);
        b.pos = new Vec2(b.pos.x + ux * push, b.pos.y + uy * push);
      }
    }
  }

  private updateShooting(dt: number): void {
    if (this.multiLeft > 0) {
      this.multiTimer -= dt;
      if (this.multiTimer <= 0) { this.volley(this.multiDir); this.multiLeft--; this.multiTimer = MULTI_GAP; }
    }
    this.fireTimer -= dt * (this.moving ? 1 : 1.5);   // 멈추면 1.5배 빨리
    if (this.fireTimer > 0) return;
    const t = this.nearest(this.shotOrigin(), null, 560);
    if (!t) return;
    const o = this.shotOrigin();
    const dx = t.pos.x - o.x, dy = t.pos.y - o.y, len = Math.hypot(dx, dy) || 1;
    const dir = new Vec2(dx / len, dy / len);
    this.volley(dir);
    this.multiDir = dir;
    this.multiLeft = this.skills.multi ?? 0;
    this.multiTimer = MULTI_GAP;
    this.fireTimer = FIRE_EVERY / (1 + 0.25 * (this.skills.speed ?? 0));
  }

  shotOrigin(): Vec2 { return new Vec2(this.x, this.y - KID_DRAW_H * 0.45); }

  private volley(dir: Vec2): void {
    const from = this.shotOrigin();
    const front = 1 + (this.skills.front ?? 0);
    const px = -dir.y, py = dir.x;
    for (let i = 0; i < front; i++) {
      const off = (i - (front - 1) / 2) * 12;
      this.addShot(new Vec2(from.x + px * off, from.y + py * off), dir);
    }
    const diag = this.skills.diag ?? 0;
    const base = Math.atan2(dir.y, dir.x);
    for (let lv = 1; lv <= diag; lv++) {
      for (const s of [-1, 1]) {
        const a = base + s * (lv === 1 ? 0.45 : 0.8);
        this.addShot(from, new Vec2(Math.cos(a), Math.sin(a)));
      }
    }
  }

  private addShot(pos: Vec2, dir: Vec2): void {
    this.shots.push({
      pos: new Vec2(pos.x, pos.y), vel: dir.scale(SHOT_SPEED), dmg: this.damage, life: SHOT_LIFE,
      pierce: this.skills.pierce ?? 0, ricochet: this.skills.ricochet ?? 0, wall: this.skills.wall ?? 0,
      hit: new Set(),
    });
  }

  // 화면 안(조금 바깥까지)의 가장 가까운 괴물
  private nearest(from: Vec2, skip: Set<object> | null, maxD = Infinity): Monster | null {
    let best: Monster | null = null, bd = maxD;
    for (const m of this.monsters) {
      if (skip?.has(m)) continue;
      if (m.pos.x < -10 || m.pos.x > World.Width + 10 || m.pos.y < -10 || m.pos.y > World.Height + 10) continue;
      const d = Math.hypot(m.pos.x - from.x, m.pos.y - from.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  private updateShots(dt: number): void {
    const keep: Shot[] = [];
    for (const s of this.shots) {
      s.life -= dt;
      let alive = s.life > 0;
      const steps = Math.max(1, Math.ceil(s.vel.length() * dt / 10));
      for (let i = 0; i < steps && alive; i++) {
        s.pos = s.pos.add(s.vel.scale(dt / steps));
        const outX = s.pos.x < 0 || s.pos.x > World.Width, outY = s.pos.y < 0 || s.pos.y > World.Height;
        if (outX || outY) {
          if (s.wall > 0) {
            s.wall--;
            if (outX) s.vel.x = -s.vel.x;
            if (outY) s.vel.y = -s.vel.y;
            s.pos.x = Math.max(0, Math.min(World.Width, s.pos.x));
            s.pos.y = Math.max(0, Math.min(World.Height, s.pos.y));
          } else { alive = false; break; }
        }
        alive = this.shotHits(s);
      }
      if (alive) keep.push(s);
    }
    this.shots = keep;
  }

  private shotHits(s: Shot): boolean {
    const m = this.monsters.find((q) => !s.hit.has(q) && Math.hypot(q.pos.x - s.pos.x, q.pos.y - s.pos.y) < q.r + SHOT_R);
    if (!m) return true;
    s.hit.add(m);
    m.hp -= s.dmg;
    m.flash = 0.08;
    const l = s.vel.length() || 1;
    const kb = m.kind === 'brute' ? 4 : 10;
    m.pos = new Vec2(m.pos.x + s.vel.x / l * kb, m.pos.y + s.vel.y / l * kb);
    const killed = m.hp <= 0;
    if (killed) {
      this.monsters = this.monsters.filter((q) => q !== m);
      this.kills++;
      this.gainXp(KINDS[m.kind].xp);
    }
    this.host.hit(killed);
    if (s.pierce > 0) { s.pierce--; return true; }
    if (s.ricochet > 0) {
      const t = this.nearest(s.pos, s.hit);
      if (t) {
        s.ricochet--;
        const dx = t.pos.x - s.pos.x, dy = t.pos.y - s.pos.y, len = Math.hypot(dx, dy) || 1;
        s.vel = new Vec2(dx / len * SHOT_SPEED, dy / len * SHOT_SPEED);
        return true;
      }
    }
    return false;
  }

  private gainXp(n: number): void {
    this.xp += n;
    if (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.offerSkills();
    }
  }

  // 눈알 탄: 처음 닿는 블록에 피해
  private updateBullets(dt: number): void {
    const keep: Bullet[] = [];
    for (const b of this.bullets) {
      b.pos = b.pos.add(b.vel.scale(dt));
      if (b.pos.x < -20 || b.pos.x > World.Width + 20 || b.pos.y < -20 || b.pos.y > World.Height + 20) continue;
      const i = this.tileAt(b.pos.x, b.pos.y);
      if (i >= 0 && this.tiles[i] > 0) { this.damageTile(i, BULLET_DMG, true); continue; }
      keep.push(b);
    }
    this.bullets = keep;
  }
}
