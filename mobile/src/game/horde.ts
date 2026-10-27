// 꼬마 모드: 사방에서 몰려오는 괴물 피하며 싸우기 (타임어택)
//
// - 화면 어디든 누른 채 끌면 꼬마가 그 방향으로 움직인다 (게임 화면 안에서 자유 이동)
// - 꼬마는 가장 가까운 괴물에게 공을 자동으로 던진다. 멈춰 있으면 두 배로 빨리 던진다
// - 괴물은 화면 네 변 밖에서 나타나 꼬마에게 다가온다. 시간이 지날수록 더 많이, 더 단단하게
//   슬라임(느림), 박쥐(빠르고 흔들림), 눈알(멀리서 탄을 쏨), 덩치(크고 단단함)
// - 괴물에 닿거나 탄에 맞으면 체력 -1, 잠깐 무적. 체력이 0 이 되면 끝
// - 괴물을 잡으면 경험치. 레벨이 오르면 스킬 3개 중 하나를 고른다 (궁수 모드와 같은 스킬)
// - 기록은 버틴 시간
import { Vec2 } from './geometry';
import { Characters, World } from './objects';
import { SKILLS, type SkillId } from './archer';

export interface HordeHost {
  hit(killed: boolean): void;
  hurt(): void;
  levelUp(): void;
  gameOver(): void;
}

export const KID_SCALE = 0.75;          // 꼬마 그림 크기 (캐릭터 칸 기준)
export const KID_DRAW_W = Characters.CellW * KID_SCALE;
export const KID_DRAW_H = Characters.CellH * KID_SCALE;
const KID_R = 14;                       // 꼬마 몸 판정 반지름
const MOVE_SPEED = 260;
const JOY_DEAD = 8;
const JOY_FULL = 44;
export const SHOT_SPEED = 620;
export const SHOT_R = 6;
const SHOT_LIFE = 1.1;                  // 던진 공은 이 시간이 지나면 사라짐 (화면이 공으로 뒤덮이지 않게)
const FIRE_EVERY = 0.55;                // 움직일 때 던지는 간격 (멈추면 절반)
const MULTI_GAP = 0.12;
const BULLET_R = 5;
const HURT_INVULN = 1.2;
const START_HP = 3;
const MAX_MONSTERS = 90;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export type MonsterKind = 'slime' | 'bat' | 'eye' | 'brute';
const KINDS: Record<MonsterKind, { r: number; speed: number; hp: number; xp: number }> = {
  slime: { r: 15, speed: 48, hp: 2, xp: 1 },
  bat: { r: 12, speed: 105, hp: 1, xp: 1 },
  eye: { r: 15, speed: 60, hp: 3, xp: 2 },
  brute: { r: 28, speed: 32, hp: 14, xp: 5 },
};

export class Monster {
  hp: number;
  maxHp: number;
  flash = 0;              // 맞으면 잠깐 하얗게
  fireTimer = rand(1.5, 3);
  phase = Math.random() * Math.PI * 2;
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
  hp = START_HP;
  maxHp = START_HP;
  level = 1;
  xp = 0;
  skills: Partial<Record<SkillId, number>> = {};
  choosing: SkillId[] | null = null;

  x = World.Width / 2;
  y = World.Height / 2;
  moving = false;
  vx = 0;
  invuln = 0;

  monsters: Monster[] = [];
  shots: Shot[] = [];
  bullets: Bullet[] = [];

  joyFrom: Vec2 | null = null;
  joyTo = new Vec2();

  private spawnTimer = 0.8;
  private fireTimer = 0.4;
  private multiLeft = 0;
  private multiTimer = 0;
  private multiDir = new Vec2(0, -1);
  private waveTimer = 20;

  constructor(private host: HordeHost) {}

  get xpNeed(): number { return 3 + this.level * 3; }
  get damage(): number { return 1 + (this.skills.power ?? 0); }
  // 시간에 따라: 나오는 간격은 짧아지고 체력은 늘어남
  get spawnEvery(): number { return Math.max(0.15, 1.1 - this.time * 0.012); }
  get hpMul(): number { return 1 + this.time / 25 + (this.time / 60) ** 2; }

  // ---------- 조작 ----------
  joyBegin(x: number, y: number): void { this.joyFrom = new Vec2(x, y); this.joyTo = new Vec2(x, y); }
  joyMove(x: number, y: number): void { if (this.joyFrom) this.joyTo = new Vec2(x, y); }
  joyEnd(): void { this.joyFrom = null; }
  keyDir = new Vec2();   // PC 방향키

  cardRect(i: number): { x: number; y: number; w: number; h: number; contains(x: number, y: number): boolean } {
    const w = 140, h = 170, gap = 10;
    const left = (World.Width - (w * 3 + gap * 2)) / 2;
    const r = { x: left + i * (w + gap), y: World.Height * 0.32, w, h };
    return { ...r, contains: (px: number, py: number) => px >= r.x && px <= r.x + w && py >= r.y && py <= r.y + h };
  }

  pick(x: number, y: number): boolean {
    if (!this.choosing) return false;
    for (let i = 0; i < this.choosing.length; i++) {
      if (!this.cardRect(i).contains(x, y)) continue;
      const id = this.choosing[i];
      this.skills[id] = (this.skills[id] ?? 0) + 1;
      if (id === 'heal') { this.maxHp++; this.hp = this.maxHp; }
      this.choosing = null;
      return true;
    }
    return false;
  }

  private offerSkills(): void {
    const pool = (Object.keys(SKILLS) as SkillId[]).filter((id) => (this.skills[id] ?? 0) < SKILLS[id].max);
    this.choosing = pool.sort(() => Math.random() - 0.5).slice(0, 3);
    this.joyFrom = null;
    this.host.levelUp();
  }

  // ---------- 매 프레임 ----------
  update(dt: number): void {
    if (this.choosing) return;
    this.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.moveKid(dt);
    this.spawn(dt);
    this.updateMonsters(dt);
    this.updateShooting(dt);
    this.updateShots(dt);
    this.updateBullets(dt);
    if (this.hp <= 0) this.host.gameOver();
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
    const mx = KID_DRAW_W / 2, top = KID_DRAW_H / 2 + 4;
    this.x = Math.max(mx, Math.min(World.Width - mx, this.x + vx * dt));
    this.y = Math.max(top, Math.min(World.Height - KID_DRAW_H / 2, this.y + vy * dt));
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
    if (t > 15 && r < 0.25) return 'eye';
    if (t > 5 && r < 0.5) return 'bat';
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

  private updateMonsters(dt: number): void {
    const kid = new Vec2(this.x, this.y);
    for (const m of this.monsters) {
      m.flash = Math.max(0, m.flash - dt);
      const k = KINDS[m.kind];
      const dx = kid.x - m.pos.x, dy = kid.y - m.pos.y, d = Math.hypot(dx, dy) || 1;
      let sp = k.speed * Math.min(2, 1 + this.time / 90);
      let ux = dx / d, uy = dy / d;
      if (m.kind === 'bat') {   // 지그재그
        m.phase += dt * 6;
        const s = Math.sin(m.phase) * 0.8;
        ux += -uy * s; uy += (dx / d) * s;
        const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
      }
      if (m.kind === 'eye') {   // 거리를 두고 탄을 쏨
        const inside = m.pos.x > 10 && m.pos.x < World.Width - 10 && m.pos.y > 10 && m.pos.y < World.Height - 10;
        if (d < 170 && inside) sp = -sp * 0.5; else if (d < 220 && inside) sp = 0;
        m.fireTimer -= dt;
        if (m.fireTimer <= 0 && inside) {
          m.fireTimer = rand(2.2, 3.2);
          const bs = Math.min(260, 170 + this.time * 0.6);
          this.bullets.push({ pos: new Vec2(m.pos.x, m.pos.y), vel: new Vec2(dx / d * bs, dy / d * bs) });
        }
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
    // 닿으면 체력 -1
    if (this.invuln <= 0) {
      for (const m of ms) {
        if (Math.hypot(m.pos.x - this.x, m.pos.y - this.y) < m.r + KID_R) { this.damageKid(); break; }
      }
    }
  }

  private updateShooting(dt: number): void {
    if (this.multiLeft > 0) {
      this.multiTimer -= dt;
      if (this.multiTimer <= 0) { this.volley(this.multiDir); this.multiLeft--; this.multiTimer = MULTI_GAP; }
    }
    this.fireTimer -= dt * (this.moving ? 1 : 2);   // 멈추면 두 배로 빨리
    if (this.fireTimer > 0) return;
    const t = this.nearest(new Vec2(this.x, this.y), null, 520);
    if (!t) return;
    const dx = t.pos.x - this.x, dy = t.pos.y - this.y, len = Math.hypot(dx, dy) || 1;
    const dir = new Vec2(dx / len, dy / len);
    this.volley(dir);
    this.multiDir = dir;
    this.multiLeft = this.skills.multi ?? 0;
    this.multiTimer = MULTI_GAP;
    this.fireTimer = FIRE_EVERY / (1 + 0.25 * (this.skills.speed ?? 0));
  }

  private volley(dir: Vec2): void {
    const from = new Vec2(this.x, this.y);
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
    // 맞으면 살짝 밀려남
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

  private updateBullets(dt: number): void {
    const keep: Bullet[] = [];
    for (const b of this.bullets) {
      b.pos = b.pos.add(b.vel.scale(dt));
      if (b.pos.x < -20 || b.pos.x > World.Width + 20 || b.pos.y < -20 || b.pos.y > World.Height + 20) continue;
      if (Math.hypot(b.pos.x - this.x, b.pos.y - this.y) < KID_R + BULLET_R && this.invuln <= 0) {
        this.damageKid();
        continue;
      }
      keep.push(b);
    }
    this.bullets = keep;
  }

  private damageKid(): void {
    if (this.invuln > 0) return;
    this.hp--;
    this.invuln = HURT_INVULN;
    this.host.hurt();
    // 맞으면 가까운 괴물을 조금 밀어냄 (연달아 맞지 않게)
    for (const m of this.monsters) {
      const dx = m.pos.x - this.x, dy = m.pos.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (d < 90) m.pos = new Vec2(m.pos.x + dx / d * (90 - d), m.pos.y + dy / d * (90 - d));
    }
  }
}
