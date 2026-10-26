// 엘프 모드: 궁수의 전설처럼
//
// - 화면 어디든 누른 채 끌면 엘프가 그 방향으로 움직인다 (화면 아래쪽 절반 안에서 자유 이동)
// - 멈춰 있으면 가장 가까운 적에게 화살을 자동으로 쏜다. 움직이는 동안은 쏘지 않는다
// - 적: 숫자(체력)가 있는 벽돌이 천천히 내려오고, 일부 벽돌은 엘프에게 탄을 쏜다. 5스테이지마다 악마 보스
// - 적을 모두 잡으면 다음 스테이지. 벽돌이 엘프 구역에 닿거나 탄에 맞으면 체력이 줄고, 0 이 되면 끝
// - 벽돌을 깨면 경험치. 레벨이 오르면 스킬 3개 중 하나를 고른다
// - 기록은 도달한 스테이지
import { Rect, Vec2 } from './geometry';
import { Characters, Devil, DevilSprite, World } from './objects';

export interface ArcherHost {
  brickHit(broken: boolean): void;
  hurt(): void;
  levelUp(): void;
  stageClear(): void;
  bossStomp(): void;
  gameOver(): void;
}

// ---------- 크기와 빠르기 ----------
const COLS = 7;
const SIDE = 8;
const GAP = 4;
const TOP = 36;               // 맨 윗줄 위치
const CELL_H = 30;
const ROW_H = CELL_H + GAP;
const ROWS = 6;
export const CELL_W = (World.Width - SIDE * 2 - GAP * (COLS - 1)) / COLS;

const ELF_SCALE = 1.1;        // 엘프 그림 크기 (캐릭터 칸 기준)
export const ELF_W = Characters.CellW * ELF_SCALE;
export const ELF_H = Characters.CellH * ELF_SCALE;
const HIT_R = 14;             // 엘프가 탄에 맞는 판정 반지름
const MOVE_SPEED = 300;       // 최대 이동 빠르기 (픽셀/초)
const JOY_DEAD = 8;           // 이만큼은 끌어야 움직임
const JOY_FULL = 44;          // 이만큼 끌면 최대 빠르기

const ARROW_SPEED = 720;
const FIRE_EVERY = 0.6;       // 기본 발사 간격 (초)
const MULTI_GAP = 0.12;       // 멀티샷 연속 발사 간격
const BULLET_R = 5;
const HURT_INVULN = 1.0;      // 맞은 뒤 무적 시간
const START_HP = 5;
const CLEAR_PAUSE = 1.3;      // 스테이지 클리어 뒤 다음 스테이지까지

const randInt = (n: number) => Math.floor(Math.random() * n);

// ---------- 스킬 ----------
export type SkillId = 'multi' | 'front' | 'diag' | 'ricochet' | 'wall' | 'pierce' | 'speed' | 'power' | 'heal';
export const SKILLS: Record<SkillId, { name: string; desc: string; max: number }> = {
  multi: { name: '멀티샷', desc: '한 번 더 연속으로 쏴요', max: 2 },
  front: { name: '앞쪽 화살 +1', desc: '나란히 한 발 더', max: 2 },
  diag: { name: '사선 화살', desc: '양옆 비스듬히 두 발 더', max: 1 },
  ricochet: { name: '튕기는 화살', desc: '맞히면 다른 적에게 튕겨요', max: 2 },
  wall: { name: '벽 반사', desc: '벽에 맞으면 튕겨 나가요', max: 2 },
  pierce: { name: '관통', desc: '적을 뚫고 지나가요', max: 2 },
  speed: { name: '공격 속도 +25%', desc: '더 자주 쏴요', max: 3 },
  power: { name: '공격력 +1', desc: '화살 한 발이 더 아파요', max: 4 },
  heal: { name: '체력 회복', desc: '최대 체력 +1, 체력을 모두 채워요', max: 99 },
};

export class ArcherBrick {
  constructor(public col: number, public row: number, public hp: number, public maxHp: number, public shooter: boolean,
    public fireTimer: number, public appearAt: number) {}
  y = 0;   // 위쪽 끝 (천천히 내려옴)
}

export interface Arrow {
  pos: Vec2; vel: Vec2; dmg: number;
  pierce: number; ricochet: number; wall: number;
  hit: Set<object>;   // 이미 맞힌 적 (관통·튕김 때 같은 적을 또 맞히지 않게)
}

export interface Bullet { pos: Vec2; vel: Vec2; }

export class Archer {
  stage = 1;
  hp = START_HP;
  maxHp = START_HP;
  level = 1;
  xp = 0;
  skills: Partial<Record<SkillId, number>> = {};
  choosing: SkillId[] | null = null;   // 레벨업 고르기 중이면 후보 3개

  x = World.Width / 2;       // 엘프 몸 가운데
  y = 0;
  moving = false;
  vx = 0;
  invuln = 0;

  bricks: ArcherBrick[] = [];
  boss: Devil | null = null;
  bossHp = 0;
  bossMaxHp = 0;
  arrows: Arrow[] = [];
  bullets: Bullet[] = [];
  time = 0;                  // 스테이지 시작 뒤 시간 (벽돌 톡 튀어나오기)
  clearTimer = 0;            // 0 보다 크면 'STAGE CLEAR' 보여 주는 중

  // 조이스틱 (누른 곳 기준으로 끈 방향과 거리)
  joyFrom: Vec2 | null = null;
  joyTo = new Vec2();

  private fireTimer = 0.3;
  private multiLeft = 0;
  private multiTimer = 0;
  private multiDir = new Vec2(0, -1);
  private bossFire = 2;
  private bossJumpTimer = 2;

  constructor(private host: ArcherHost) {
    this.y = this.zoneBottom - 10;
    this.startStage();
  }

  // ---------- 구역 ----------
  get zoneTop(): number { return World.Height * 0.5; }               // 엘프가 다닐 수 있는 맨 위
  get zoneBottom(): number { return World.Height - 8 - ELF_H / 2; }  // 엘프 몸 가운데의 맨 아래
  get xpNeed(): number { return 4 + this.level * 3; }   // 벽돌 하나에 경험치 1, 보스 10
  get damage(): number { return 1 + (this.skills.power ?? 0); }

  brickRect(k: ArcherBrick): Rect {
    return new Rect(SIDE + k.col * (CELL_W + GAP), k.y, CELL_W, CELL_H);
  }

  // 보스 몸통 판정 (악마 그림의 몸통 부분)
  bossRect(): Rect | null {
    const d = this.boss;
    if (!d) return null;
    const s = d.scale;
    return new Rect(d.x + 36 * s, d.y + 40 * s, 46 * s, 88 * s);
  }

  elfRect(): Rect { return new Rect(this.x - ELF_W / 2, this.y - ELF_H / 2, ELF_W, ELF_H); }

  // ---------- 스테이지 ----------
  private startStage(): void {
    const n = this.stage;
    this.bricks = [];
    this.arrows = [];
    this.bullets = [];
    this.time = 0;
    this.boss = null;
    const bossStage = n % 5 === 0;
    const count = bossStage ? 4 + randInt(3) : Math.min(COLS * ROWS - 4, 6 + Math.floor(n * 1.5));
    const shooters = bossStage ? 0 : Math.min(9, 1 + Math.floor(n / 2));
    const cells = [...Array(COLS * ROWS).keys()].sort(() => Math.random() - 0.5).slice(0, count);
    cells.forEach((c, i) => {
      const hp = Math.round(1 + n * 1.5 + Math.random() * n + n * n / 15);   // 뒤로 갈수록 더 빨리 단단해짐
      const k = new ArcherBrick(c % COLS, Math.floor(c / COLS), hp, hp, i < shooters, 1.5 + Math.random() * 2, Math.random() * 0.8);
      k.y = TOP + k.row * ROW_H;
      this.bricks.push(k);
    });
    if (bossStage) {
      const d = new Devil();
      d.active = true;
      d.scale = 1.8;
      d.bodyX = World.Width / 2;
      d.baseY = TOP + ROW_H * 2 + DevilSprite.Cell * d.scale * 0.55;
      d.walkVel = Math.random() < 0.5 ? 50 : -50;
      d.jumpSpeed = 380;
      this.boss = d;
      this.bossMaxHp = this.bossHp = 25 + n * 8;
      this.bossFire = 2;
      this.bossJumpTimer = 2.5;
      this.placeBoss();
    }
  }

  // ---------- 조작 ----------
  joyBegin(x: number, y: number): void { this.joyFrom = new Vec2(x, y); this.joyTo = new Vec2(x, y); }
  joyMove(x: number, y: number): void { if (this.joyFrom) this.joyTo = new Vec2(x, y); }
  joyEnd(): void { this.joyFrom = null; }

  // 레벨업 카드 위치 (논리 좌표)
  cardRect(i: number): Rect {
    const w = 140, h = 170, gap = 10;
    const left = (World.Width - (w * 3 + gap * 2)) / 2;
    return new Rect(left + i * (w + gap), World.Height * 0.32, w, h);
  }

  // 레벨업 카드 누르기. 골랐으면 true
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
    if (this.choosing) return;   // 스킬 고르는 동안 멈춤
    this.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);

    if (this.clearTimer > 0) {
      this.clearTimer -= dt;
      this.moveElf(dt);
      if (this.clearTimer <= 0) { this.stage++; this.startStage(); }
      return;
    }

    this.moveElf(dt);
    this.updateBricks(dt);
    this.updateBoss(dt);
    this.updateShooting(dt);
    this.updateArrows(dt);
    this.updateBullets(dt);
    if (this.hp <= 0) { this.host.gameOver(); return; }

    if (this.bricks.length === 0 && !this.boss) {
      this.clearTimer = CLEAR_PAUSE;
      this.bullets = [];
      this.arrows = [];
      this.hp = Math.min(this.maxHp, this.hp + 1);   // 스테이지를 깨면 체력 1 회복
      this.host.stageClear();
    }
  }

  private moveElf(dt: number): void {
    let vx = 0, vy = 0;
    if (this.joyFrom) {
      const dx = this.joyTo.x - this.joyFrom.x, dy = this.joyTo.y - this.joyFrom.y;
      const len = Math.hypot(dx, dy);
      if (len > JOY_DEAD) {
        const sp = MOVE_SPEED * Math.min(1, (len - JOY_DEAD) / (JOY_FULL - JOY_DEAD));
        vx = dx / len * sp; vy = dy / len * sp;
      }
    }
    this.moving = vx !== 0 || vy !== 0;
    this.vx = vx;
    this.x = Math.max(ELF_W / 2, Math.min(World.Width - ELF_W / 2, this.x + vx * dt));
    this.y = Math.max(this.zoneTop + ELF_H / 2, Math.min(this.zoneBottom, this.y + vy * dt));
  }

  private updateBricks(dt: number): void {
    const fall = Math.min(8, 2 + this.stage * 0.3);   // 천천히 내려옴 (스테이지마다 조금씩 빠르게)
    const keep: ArcherBrick[] = [];
    for (const k of this.bricks) {
      k.y += fall * dt;
      if (k.y + CELL_H >= this.zoneTop) {   // 엘프 구역에 닿으면 부서지며 체력 -1
        this.damageElf(true);
        continue;
      }
      if (k.shooter && this.time > k.appearAt + 0.5) {
        k.fireTimer -= dt;
        if (k.fireTimer <= 0) {
          k.fireTimer = 2.0 + Math.random() * 0.8;
          const r = this.brickRect(k);
          const from = new Vec2(r.centerX, r.bottom);
          this.fireAt(from, 0);
          if (this.stage >= 10) { this.fireAt(from, -0.3); this.fireAt(from, 0.3); }   // 10스테이지부터 세 갈래
        }
      }
      keep.push(k);
    }
    this.bricks = keep;
  }

  // 엘프를 향해 탄 한 발 (spread 라디안만큼 틀어서)
  private fireAt(from: Vec2, spread: number): void {
    const speed = Math.min(360, 220 + this.stage * 10);
    const a = Math.atan2(this.y - from.y, this.x - from.x) + spread;
    this.bullets.push({ pos: from, vel: new Vec2(Math.cos(a) * speed, Math.sin(a) * speed) });
  }

  private placeBoss(): void {
    const d = this.boss!;
    d.x = d.bodyX - (d.facingLeft ? 69 : 59) * d.scale;
    d.y = d.baseY - DevilSprite.Cell * d.scale - d.lift;
  }

  private updateBoss(dt: number): void {
    const d = this.boss;
    if (!d) return;
    d.animTime += dt;
    d.bodyX += d.walkVel * dt;
    const edge = 40 * d.scale;
    if (d.bodyX > World.Width - edge) { d.bodyX = World.Width - edge; d.walkVel = -Math.abs(d.walkVel); }
    if (d.bodyX < edge) { d.bodyX = edge; d.walkVel = Math.abs(d.walkVel); }
    d.facingLeft = d.walkVel < 0;
    this.bossJumpTimer -= dt;
    if (!d.airborne && this.bossJumpTimer <= 0) {
      d.airborne = true;
      d.jumpKind = randInt(DevilSprite.JumpKinds);
      d.liftVel = d.jumpSpeed;
      this.bossJumpTimer = 3 + Math.random() * 2;
    }
    if (d.airborne) {
      d.liftVel -= 1000 * dt;
      d.lift += d.liftVel * dt;
      if (d.lift <= 0) {   // 쿵 착지하며 사방으로 탄
        d.lift = 0; d.liftVel = 0; d.airborne = false;
        this.host.bossStomp();
        const r = this.bossRect()!;
        for (let i = -2; i <= 2; i++) this.fireAt(new Vec2(r.centerX, r.bottom - 10), i * 0.28);
      }
    }
    this.bossFire -= dt;
    if (this.bossFire <= 0) {
      this.bossFire = 1.6;
      const r = this.bossRect()!;
      this.fireAt(new Vec2(r.centerX, r.bottom - 10), 0);
    }
    this.placeBoss();
  }

  // 멈춰 있으면 가장 가까운 적에게 자동 발사
  private updateShooting(dt: number): void {
    if (this.multiLeft > 0) {
      this.multiTimer -= dt;
      if (this.multiTimer <= 0) { this.volley(this.multiDir); this.multiLeft--; this.multiTimer = MULTI_GAP; }
    }
    this.fireTimer -= dt;
    if (this.moving || this.fireTimer > 0) return;
    const target = this.nearestTarget(new Vec2(this.x, this.y), null);
    if (!target) return;
    const from = this.arrowOrigin();
    const dx = target.x - from.x, dy = target.y - from.y, len = Math.hypot(dx, dy) || 1;
    const dir = new Vec2(dx / len, dy / len);
    this.volley(dir);
    this.multiDir = dir;
    this.multiLeft = this.skills.multi ?? 0;
    this.multiTimer = MULTI_GAP;
    this.fireTimer = FIRE_EVERY / (1 + 0.25 * (this.skills.speed ?? 0));
  }

  private arrowOrigin(): Vec2 { return new Vec2(this.x, this.y - ELF_H * 0.3); }

  // 한 번 쏘기: 앞쪽 여러 발 + 사선
  private volley(dir: Vec2): void {
    const from = this.arrowOrigin();
    const front = 1 + (this.skills.front ?? 0);
    const px = -dir.y, py = dir.x;   // 진행 방향에 수직
    for (let i = 0; i < front; i++) {
      const off = (i - (front - 1) / 2) * 12;
      this.addArrow(new Vec2(from.x + px * off, from.y + py * off), dir);
    }
    const diag = this.skills.diag ?? 0;
    const base = Math.atan2(dir.y, dir.x);
    for (let lv = 1; lv <= diag; lv++) {
      for (const s of [-1, 1]) {
        const a = base + s * (lv === 1 ? 0.45 : 0.8);
        this.addArrow(from, new Vec2(Math.cos(a), Math.sin(a)));
      }
    }
  }

  private addArrow(pos: Vec2, dir: Vec2): void {
    this.arrows.push({
      pos: new Vec2(pos.x, pos.y), vel: dir.scale(ARROW_SPEED), dmg: this.damage,
      pierce: this.skills.pierce ?? 0, ricochet: this.skills.ricochet ?? 0, wall: (this.skills.wall ?? 0) * 2,
      hit: new Set(),
    });
  }

  private nearestTarget(from: Vec2, skip: Set<object> | null): Vec2 | null {
    let best: Vec2 | null = null, bd = Infinity;
    for (const k of this.bricks) {
      if (skip?.has(k)) continue;
      const r = this.brickRect(k);
      const d = Math.hypot(r.centerX - from.x, r.centerY - from.y);
      if (d < bd) { bd = d; best = new Vec2(r.centerX, r.centerY); }
    }
    const br = this.bossRect();
    if (br && !skip?.has(this.boss!)) {
      const d = Math.hypot(br.centerX - from.x, br.centerY - from.y);
      if (d < bd) { bd = d; best = new Vec2(br.centerX, br.centerY); }
    }
    return best;
  }

  private updateArrows(dt: number): void {
    const keep: Arrow[] = [];
    for (const a of this.arrows) {
      let alive = true;
      const steps = Math.max(1, Math.ceil(a.vel.length() * dt / 10));
      for (let s = 0; s < steps && alive; s++) {
        a.pos = a.pos.add(a.vel.scale(dt / steps));
        // 벽: 반사 스킬이 있으면 튕기고, 없으면 사라짐
        const out = a.pos.x < 0 || a.pos.x > World.Width || a.pos.y < 0;
        if (out) {
          if (a.wall > 0) {
            a.wall--;
            if (a.pos.x < 0 || a.pos.x > World.Width) a.vel.x = -a.vel.x;
            if (a.pos.y < 0) a.vel.y = -a.vel.y;
            a.pos.x = Math.max(0, Math.min(World.Width, a.pos.x));
            a.pos.y = Math.max(0, a.pos.y);
          } else { alive = false; break; }
        }
        if (a.pos.y > World.Height) { alive = false; break; }
        alive = this.arrowHits(a);
      }
      if (alive) keep.push(a);
    }
    this.arrows = keep;
  }

  // 화살이 적에 맞았는지. 계속 날아가면 true
  private arrowHits(a: Arrow): boolean {
    let victim: object | null = null;
    for (const k of this.bricks) {
      if (!a.hit.has(k) && this.brickRect(k).contains(a.pos.x, a.pos.y)) { victim = k; break; }
    }
    const br = this.bossRect();
    if (!victim && br && !a.hit.has(this.boss!) && br.contains(a.pos.x, a.pos.y)) victim = this.boss;
    if (!victim) return true;

    a.hit.add(victim);
    if (victim === this.boss) {
      this.bossHp -= a.dmg;
      this.host.brickHit(false);
      if (this.bossHp <= 0) { this.boss = null; this.gainXp(10); this.host.brickHit(true); }
    } else {
      const k = victim as ArcherBrick;
      k.hp -= a.dmg;
      if (k.hp <= 0) {
        this.bricks = this.bricks.filter((q) => q !== k);
        this.gainXp(1);
      }
      this.host.brickHit(k.hp <= 0);
    }

    if (a.pierce > 0) { a.pierce--; return true; }
    if (a.ricochet > 0) {
      const t = this.nearestTarget(a.pos, a.hit);
      if (t) {
        a.ricochet--;
        const dx = t.x - a.pos.x, dy = t.y - a.pos.y, len = Math.hypot(dx, dy) || 1;
        a.vel = new Vec2(dx / len * ARROW_SPEED, dy / len * ARROW_SPEED);
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
      if (Math.hypot(b.pos.x - this.x, b.pos.y - this.y) < HIT_R + BULLET_R && this.invuln <= 0) {
        this.damageElf(false);
        continue;
      }
      keep.push(b);
    }
    this.bullets = keep;
  }

  // 벽돌이 구역에 닿은 것은 무적과 상관없이 깎인다 (안 그러면 여러 개가 한꺼번에 닿을 때 그냥 지나감)
  private damageElf(fromBrick: boolean): void {
    if (!fromBrick && this.invuln > 0) return;
    this.hp--;
    this.invuln = HURT_INVULN;
    this.host.hurt();
  }
}
