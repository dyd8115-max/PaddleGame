// 꼬마 모드: 땅따먹기 (악마들과 땅 뺏기)
//
// - 맵은 화면보다 크고, 화면은 꼬마를 따라 움직인다. 오른쪽 위 작은 지도에 맵 전체가 보인다
// - 꼬마와 악마들은 각자 작은 땅에서 시작한다. 자기 땅 밖으로 나가면 지나간 자리에 선이 남고,
//   다시 자기 땅으로 돌아오면 선과 선으로 둘러싼 곳이 모두 자기 땅이 된다 (남의 땅도 빼앗음)
// - 남의 선을 밟으면 그 선의 주인이 죽는다. 자기 선을 밟아도 죽는다
//   악마가 꼬마 선을 밟으면 꼬마 목숨 -1 (선은 사라지고 마지막으로 나간 자기 땅으로 돌아감)
//   꼬마가 악마 선을 밟으면 그 악마는 땅과 함께 사라지고, 잠시 뒤 다른 곳에서 새 악마가 나온다
// - 화면 어디든 누른 채 끌면 그 방향으로 자유롭게 걷고(끈 거리만큼 빠르게), 손을 떼면 멈춘다
//   땅은 칸으로 나뉘어 있고, 꼬마가 지나간 칸에 선이 남는다
// - 맵의 절반을 차지하면 다음 스테이지. 스테이지마다 악마가 하나씩 늘고 조금 빨라진다
// - 목숨 3개. 땅을 모두 빼앗겨도 끝. 기록은 도달한 스테이지
import { World } from './objects';

export interface ClaimHost {
  claim(cells: number): void;
  kill(): void;
  hurt(): void;
  stageClear(): void;
  gameOver(): void;
}

export const CC = 16;                  // 칸 크기
export const MAP_COLS = 60;
export const MAP_ROWS = 90;
const KID_SPEED = 10;                  // 초당 칸 수 (꼬마는 이 빠르기로 자유롭게 움직임)
const TURN_RATE = 9;                   // 선을 긋는 중 1초에 돌 수 있는 각도 (라디안). 급하게 꺾어 자기 선을 밟지 않게
const START_LIVES = 3;
export const GOAL = 0.5;
const CLEAR_PAUSE = 1.8;
const HURT_PAUSE = 1.0;
const RESPAWN = 3;
const KID_HOME = 4;                    // 시작 땅 반지름 (칸, 동그라미)
const DEVIL_HOME = 3;

export const KID = 0;
export const PLAYER_COLORS = ['#4aa8ff', '#ff5a5a', '#b26bff', '#ff9a3c', '#ff6fb5', '#3ccf8e', '#e6d23c', '#8a8aff'];

export interface Player {
  id: number;
  c: number; r: number;              // 머리 칸
  x: number; y: number;              // 그리는 위치 (꼬마는 실제 위치, 악마는 칸을 부드럽게 따라감)
  dir: [number, number];
  alive: boolean;
  respawn: number;
  trail: number[];
  leaveC: number; leaveR: number;    // 마지막으로 자기 땅에서 나간 칸
  step: number;
  speed: number;
  // 악마 생각
  plan: [number, number, number][];   // [dx, dy, 칸 수]
  mode: 'home' | 'out' | 'return' | 'hunt';
  wait: number;
  pers: Personality;
  zig: boolean;                       // 대각선 계획에서 가로·세로를 번갈아
  target: number;                     // 사냥 중 노리는 칸
}

// 악마 성격 (splix.io 봇들의 설정을 참고: 사냥 범위, 위험을 느끼는 여유, 최대 선 길이, 도는 크기)
export interface Personality {
  name: string;
  huntRange: number;    // 이 거리(칸) 안의 꼬마 선만 노림
  huntSlack: number;    // 꼬마가 집에 가는 시간보다 이만큼(초) 늦어도 쫓아감 (클수록 무모)
  fear: number;         // 밖에 있을 때 꼬마와의 시간 여유(초). 이보다 가까워지면 집으로
  maxTrail: number;     // 선이 이만큼 길어지면 집으로
  loop: number;         // 고리 크기 배수
  rest: number;         // 쉬는 시간 배수
}
const PERSONALITIES: Personality[] = [
  { name: '공격형', huntRange: 30, huntSlack: 0.5, fear: 0.4, maxTrail: 22, loop: 0.8, rest: 0.6 },
  { name: '욕심형', huntRange: 14, huntSlack: 0.1, fear: 0.8, maxTrail: 42, loop: 1.5, rest: 0.8 },
  { name: '겁쟁이', huntRange: 9, huntSlack: -0.1, fear: 1.5, maxTrail: 16, loop: 0.7, rest: 1.3 },
];

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));

export class Claim {
  stage = 1;
  lives = START_LIVES;
  kills = 0;
  readonly cols = MAP_COLS;
  readonly rows = MAP_ROWS;
  owner = new Int8Array(MAP_COLS * MAP_ROWS);    // 땅 주인 (-1 은 빈 땅)
  trail = new Int8Array(MAP_COLS * MAP_ROWS);    // 선 주인 (-1 은 없음)
  version = 0;
  players: Player[] = [];
  holdDir: [number, number] = [0, 0];
  kidPath: { x: number; y: number }[] = [];   // 꼬마가 선을 긋는 동안 지나간 실제 자리 (부드러운 선 그리기용)
  clearTimer = 0;
  hurtTimer = 0;
  time = 0;
  stageTime = 0;
  camX = 0;
  camY = 0;
  flash: { idx: number[]; t: number } = { idx: [], t: 0 };
  counts: number[] = [];                          // 주인별 땅 칸 수

  constructor(private host: ClaimHost) { this.startStage(); }

  get kid(): Player { return this.players[KID]; }
  get percent(): number { return (this.counts[KID] ?? 0) / (this.cols * this.rows); }
  get mapW(): number { return this.cols * CC; }
  get mapH(): number { return this.rows * CC; }
  get moving(): boolean { return this.kid.dir[0] !== 0 || this.kid.dir[1] !== 0; }
  get drawing(): boolean { return this.kid.trail.length > 0; }
  headX(p: Player): number { return p.x; }
  headY(p: Player): number { return p.y; }
  get kidX(): number { return this.headX(this.kid); }
  get kidY(): number { return this.headY(this.kid); }
  idx(c: number, r: number): number { return r * this.cols + c; }
  inside(c: number, r: number): boolean { return c >= 0 && c < this.cols && r >= 0 && r < this.rows; }

  // ---------- 스테이지 ----------
  private startStage(): void {
    this.owner.fill(-1);
    this.trail.fill(-1);
    const n = Math.min(7, this.stage + 2);
    this.players = [];
    this.players.push(this.newPlayer(KID, Math.floor(this.cols / 2), Math.floor(this.rows / 2), KID_HOME));
    for (let i = 1; i <= n; i++) {
      const spot = this.freeSpot(DEVIL_HOME + 3) ?? [randInt(4, this.cols - 5), randInt(4, this.rows - 5)];
      this.players.push(this.newPlayer(i, spot[0], spot[1], DEVIL_HOME));
    }
    this.stageTime = 0;
    this.recount();
    this.version++;
    this.follow(1);
  }

  private newPlayer(id: number, c: number, r: number, home: number): Player {
    // 시작 땅은 동그랗게
    for (let y = r - home; y <= r + home; y++) for (let x = c - home; x <= c + home; x++) {
      if (this.inside(x, y) && (x - c) ** 2 + (y - r) ** 2 <= (home + 0.5) ** 2) this.owner[this.idx(x, y)] = id;
    }
    const devilSpeed = Math.min(10, 7 + this.stage * 0.5);
    return {
      id, c, r, x: (c + 0.5) * CC, y: (r + 0.5) * CC, dir: [0, 0], alive: true, respawn: 0, trail: [], leaveC: c, leaveR: r, step: 0,
      speed: id === KID ? KID_SPEED : devilSpeed, plan: [], mode: 'home', wait: rand(0.2, 1.2),
      pers: PERSONALITIES[(id - 1 + PERSONALITIES.length) % PERSONALITIES.length], zig: false, target: -1,
    };
  }

  // 빈 땅에서 사방 m 칸이 다 비어 있는 곳 (꼬마와는 떨어지게)
  private freeSpot(m: number): [number, number] | null {
    for (let t = 0; t < 200; t++) {
      const c = randInt(m, this.cols - 1 - m), r = randInt(m, this.rows - 1 - m);
      if (this.players.length > 0 && Math.hypot(c - this.kid.c, r - this.kid.r) < 14) continue;
      let ok = true;
      for (let y = r - m; y <= r + m && ok; y++) for (let x = c - m; x <= c + m; x++) {
        const i = this.idx(x, y);
        if (this.owner[i] !== -1 || this.trail[i] !== -1) { ok = false; break; }
      }
      if (ok) return [c, r];
    }
    return null;
  }

  private recount(): void {
    this.counts = new Array(this.players.length).fill(0);
    for (const o of this.owner) if (o >= 0) this.counts[o]++;
  }

  // ---------- 조작 ----------
  // 가고 싶은 방향과 세기 (길이 0~1). [0,0] 이면 멈춤
  hold(dx: number, dy: number): void { this.holdDir = [dx, dy]; }
  private heading = -Math.PI / 2;
  joyFrom: { x: number; y: number } | null = null;
  joyTo = { x: 0, y: 0 };
  joyBegin(x: number, y: number): void { this.joyFrom = { x, y }; this.joyTo = { x, y }; this.hold(0, 0); }
  joyMove(x: number, y: number): void {
    if (!this.joyFrom) return;
    this.joyTo = { x, y };
    let dx = x - this.joyFrom.x, dy = y - this.joyFrom.y;
    const len = Math.hypot(dx, dy), max = 50;
    if (len > max) { this.joyFrom = { x: x - dx / len * max, y: y - dy / len * max }; dx = x - this.joyFrom.x; dy = y - this.joyFrom.y; }
    const l = Math.hypot(dx, dy);
    if (l < 10) this.hold(0, 0);
    else { const m = Math.min(1, 0.55 + (l - 10) / 60); this.hold(dx / l * m, dy / l * m); }   // 조금만 끌어도 꽤 빠르게
  }
  joyEnd(): void { this.joyFrom = null; this.hold(0, 0); }

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
    if (this.hurtTimer > 0) this.hurtTimer -= dt;

    this.moveKid(dt);

    for (const p of this.players) {
      if (p.id === KID) continue;
      if (!p.alive) {
        p.respawn -= dt;
        if (p.respawn <= 0) this.respawnDevil(p);
        continue;
      }
      this.think(p, dt);
      if (p.dir[0] !== 0 || p.dir[1] !== 0) {
        p.step += dt * p.speed;
        while (p.step >= 1 && p.alive && this.clearTimer <= 0) {
          p.step -= 1;
          this.think(p, 0);
          this.stepPlayer(p);
        }
      } else p.step = Math.min(p.step, 0.6);
      // 그리는 위치는 칸 가운데를 부드럽게 따라감
      // 그리는 위치: 지금 칸 가운데를 향해 일정한 빠르기로 미끄러지듯 (칸을 건너뛰는 느낌 없이)
      const tx = (p.c + 0.5) * CC, ty = (p.r + 0.5) * CC, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      const mv = p.speed * CC * 1.15 * dt;
      if (d <= mv || d > CC * 3) { p.x = tx; p.y = ty; } else { p.x += dx / d * mv; p.y += dy / d * mv; }
    }
    this.follow(dt);
  }

  private follow(dt: number): void {
    const tx = Math.max(0, Math.min(this.mapW - World.Width, this.kidX - World.Width / 2));
    const ty = Math.max(0, Math.min(this.mapH - World.Height, this.kidY - World.Height * 0.55));
    const k = Math.min(1, dt * 8);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
  }

  // 꼬마: 바라는 방향으로 돌면서(선을 긋는 중엔 천천히) 자유롭게 이동. 칸이 바뀔 때마다 칸 규칙 적용
  private moveKid(dt: number): void {
    const kid = this.kid;
    const [hx, hy] = this.holdDir;
    const m = Math.hypot(hx, hy);
    if (this.hurtTimer > 0 || m === 0) { kid.dir = [0, 0]; return; }
    const want = Math.atan2(hy, hx);
    if (kid.trail.length > 0) {
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const maxTurn = TURN_RATE * dt;
      this.heading += Math.max(-maxTurn, Math.min(maxTurn, d));
    } else this.heading = want;
    const ux = Math.cos(this.heading), uy = Math.sin(this.heading);
    kid.dir = [Math.abs(ux) > 0.2 ? Math.sign(ux) : 0, Math.abs(uy) > 0.2 ? Math.sign(uy) : 0];
    let dist = KID_SPEED * CC * m * dt;
    while (dist > 0 && kid.alive && this.hurtTimer <= 0 && this.clearTimer <= 0) {
      const s = Math.min(3, dist);
      dist -= s;
      kid.x = Math.max(1, Math.min(this.mapW - 1, kid.x + ux * s));
      kid.y = Math.max(1, Math.min(this.mapH - 1, kid.y + uy * s));
      const nc = Math.floor(kid.x / CC), nr = Math.floor(kid.y / CC);
      if (nc !== kid.c || nr !== kid.r) this.enterCell(kid, nc, nr);
      if (kid.trail.length > 0) {
        const last = this.kidPath[this.kidPath.length - 1];
        if (!last || Math.hypot(last.x - kid.x, last.y - kid.y) > 4) this.kidPath.push({ x: kid.x, y: kid.y });
      } else this.kidPath = [];
    }
  }

  private stepPlayer(p: Player): void {
    const nc = p.c + p.dir[0], nr = p.r + p.dir[1];
    if (!this.inside(nc, nr)) { p.plan = []; return; }
    this.enterCell(p, nc, nr);
  }

  private enterCell(p: Player, nc: number, nr: number): void {
    const i = this.idx(nc, nr);
    // 꼬마가 막 지나온 선 칸에 다시 들어가는 건 봐줌 (칸 모서리에서 흔들릴 때)
    if (p.id === KID && this.trail[i] === KID && p.trail.slice(-3).includes(i)) { p.c = nc; p.r = nr; return; }
    const t = this.trail[i];
    if (t >= 0) {   // 선을 밟음: 그 선의 주인이 죽음 (자기 선이면 자기)
      this.killPlayer(t, p.id);
      if (!p.alive || (p.id === KID && this.hurtTimer > 0)) return;
    }
    const wasHome = this.owner[this.idx(p.c, p.r)] === p.id;
    if (wasHome && this.owner[i] !== p.id) { p.leaveC = p.c; p.leaveR = p.r; }
    p.c = nc; p.r = nr;
    if (this.owner[i] !== p.id) {
      this.trail[i] = p.id;
      p.trail.push(i);
      this.version++;
    } else if (p.trail.length > 0) this.close(p);
  }

  // 선을 자기 땅으로 만들고, 둘러싼 곳을 모두 차지
  private close(p: Player): void {
    const id = p.id;
    for (const i of p.trail) { this.owner[i] = id; this.trail[i] = -1; }
    p.trail = [];
    // 맵 가장자리에서 자기 땅이 아닌 칸을 따라 퍼져 나가며 표시. 못 닿은 곳은 둘러싸인 곳
    const C = this.cols, R = this.rows, N = C * R;
    const seen = new Uint8Array(N);
    const stack: number[] = [];
    const push = (i: number) => { if (!seen[i] && this.owner[i] !== id) { seen[i] = 1; stack.push(i); } };
    for (let c = 0; c < C; c++) { push(c); push((R - 1) * C + c); }
    for (let r = 0; r < R; r++) { push(r * C); push(r * C + C - 1); }
    while (stack.length) {
      const i = stack.pop()!;
      const c = i % C, r = (i - c) / C;
      if (c > 0) push(i - 1);
      if (c < C - 1) push(i + 1);
      if (r > 0) push(i - C);
      if (r < R - 1) push(i + C);
    }
    const filled: number[] = [];
    let gained = 0;
    for (let i = 0; i < N; i++) {
      if (seen[i] || this.owner[i] === id) continue;
      this.owner[i] = id;
      gained++;
      if (id === KID) filled.push(i);
      // 둘러싼 곳 안에 다른 이의 선이 있으면 그 주인은 죽음
      const t = this.trail[i];
      if (t >= 0 && t !== id) this.killPlayer(t, id);
    }
    this.version++;
    this.recount();
    if (id === KID) {
      this.flash = { idx: filled, t: 0.35 };
      this.host.claim(gained);
      if (this.percent >= GOAL) { this.clearTimer = CLEAR_PAUSE; this.host.stageClear(); }
    }
    // 땅을 모두 빼앗긴 악마는 사라짐, 꼬마는 끝
    for (const q of this.players) {
      if (!q.alive || q.id === id) continue;
      if ((this.counts[q.id] ?? 0) === 0 && q.trail.length === 0) {
        if (q.id === KID) { this.lives = 0; this.host.gameOver(); return; }
        this.killPlayer(q.id, id);
      }
    }
  }

  private clearTrail(p: Player): void {
    if (p.id === KID) this.kidPath = [];
    for (const i of p.trail) if (this.trail[i] === p.id) this.trail[i] = -1;
    p.trail = [];
    this.version++;
  }

  private killPlayer(id: number, by: number): void {
    const p = this.players[id];
    if (!p || !p.alive) return;
    if (id === KID) {
      if (this.hurtTimer > 0) return;
      this.lives--;
      this.host.hurt();
      this.clearTrail(p);
      p.c = p.leaveC; p.r = p.leaveR;
      p.dir = [0, 0];
      p.x = (p.c + 0.5) * CC; p.y = (p.r + 0.5) * CC;
      this.hurtTimer = HURT_PAUSE;
      // 돌아간 칸이 이미 남의 땅이면 남은 내 땅 아무 곳으로
      if (this.owner[this.idx(p.c, p.r)] !== KID) {
        const mine = this.owner.findIndex((o) => o === KID);
        if (mine >= 0) { p.c = mine % this.cols; p.r = Math.floor(mine / this.cols); p.x = (p.c + 0.5) * CC; p.y = (p.r + 0.5) * CC; }
      }
      if (this.lives <= 0 || (this.counts[KID] ?? 0) === 0) { this.lives = 0; this.host.gameOver(); }
      return;
    }
    // 악마: 선과 땅이 함께 사라짐
    this.clearTrail(p);
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === id) this.owner[i] = -1;
    p.alive = false;
    p.respawn = RESPAWN;
    this.recount();
    this.version++;
    if (by === KID) { this.kills++; this.host.kill(); }
  }

  private respawnDevil(p: Player): void {
    const spot = this.freeSpot(DEVIL_HOME + 2);
    if (!spot) { p.respawn = 1; return; }
    const q = this.newPlayer(p.id, spot[0], spot[1], DEVIL_HOME);
    this.players[p.id] = q;
    this.recount();
    this.version++;
  }

  // ---------- 악마 생각 ----------
  private think(p: Player, dt: number): void {
    p.wait -= dt;
    // 무거운 판단은 칸을 옮기기 직전(dt = 0)이나 멈춰 있을 때만
    if (dt > 0 && (p.dir[0] !== 0 || p.dir[1] !== 0)) return;
    if (p.wait > 0 && p.trail.length === 0 && p.mode === 'home') { this.wander(p); return; }
    this.decide(p);
  }

  // 악마 판단 (성격마다 숫자가 다름)
  // 1) 사냥: 꼬마가 집에 돌아가기 전에 꼬마 선에 닿을 수 있으면 끊으러 감.
  //    다른 악마가 이미 노리는 곳과 먼 쪽을 노려서 여럿이 앞뒤에서 같이 노림
  // 2) 밖에 나와 있으면: 꼬마가 내 선에 닿는 시간과 내가 집에 가는 시간을 견줘서 위험하면 바로 집으로
  // 3) 집에 있으면: 빈 곳(또는 꼬마 땅) 쪽으로 네모·대각선·지그재그 고리를 세워 나감. 쉬는 동안엔 자기 땅 안을 어슬렁
  private decide(p: Player): void {
    const kid = this.kid;
    const outside = p.trail.length > 0;
    const P = p.pers;

    if (kid.trail.length > 0 && this.hurtTimer <= 0) {
      // 다른 사냥꾼이 노리는 칸 근처는 피함
      const taken = this.players.filter((q) => q !== p && q.alive && q.mode === 'hunt' && q.target >= 0).map((q) => q.target);
      const goal = (i: number) => this.trail[i] === KID && !taken.some((t) => Math.abs(t % this.cols - i % this.cols) + Math.abs(Math.floor(t / this.cols) - Math.floor(i / this.cols)) < 6);
      let hunt = this.bfs(p, goal, P.huntRange);
      if (!hunt.dir) hunt = this.bfs(p, (i) => this.trail[i] === KID, P.huntRange);
      if (hunt.dir) {
        const iGet = hunt.dist / p.speed, kidGets = this.kidHomeTime();
        const safe = !outside || this.threat(p) / KID_SPEED > this.bfs(p, (i) => this.owner[i] === p.id, 90).dist / p.speed;
        if (iGet < kidGets + P.huntSlack && safe) { p.mode = 'hunt'; p.target = hunt.target; p.dir = hunt.dir; return; }
      }
    }
    if (p.mode === 'hunt') { p.mode = outside ? 'return' : 'home'; p.plan = []; p.target = -1; }

    if (outside) {
      const home = this.bfs(p, (i) => this.owner[i] === p.id, 120);
      const tHome = home.dist / p.speed, tKid = this.threat(p) / KID_SPEED;
      const tooLong = p.trail.length > P.maxTrail + this.stage * 3;
      if (p.mode !== 'out' || !p.plan.length || tKid < tHome + P.fear || tooLong) {
        p.mode = 'return';
        p.plan = [];
        p.dir = home.dir ?? this.anySafeDir(p);
        return;
      }
      this.followPlan(p);
      return;
    }

    // 집에 있음. 막 돌아왔으면 잠깐 쉼 (스테이지가 오를수록 짧게)
    if (p.mode === 'return') {
      p.mode = 'home';
      p.wait = rand(0.6, 1.4) * P.rest * Math.max(0.25, 1 - 0.15 * (this.stage - 1));
    }
    if (p.mode !== 'out' || !p.plan.length) {
      if (p.wait > 0) { p.mode = 'home'; this.wander(p); return; }
      // 꼬마가 너무 가까우면(겁쟁이일수록 멀리서도) 나가지 않고 어슬렁
      const kd = Math.hypot(kid.c - p.c, kid.r - p.r);
      if (kd < 3 + P.fear * 4 && kid.trail.length === 0) { p.wait = 0.4; this.wander(p); return; }
      this.makePlan(p);
    }
    this.followPlan(p);
  }

  // 자기 땅 안에서 어슬렁 (땅 밖으로는 안 나감, 되도록 직진)
  private wander(p: Player): void {
    const ok = (d: [number, number]) => {
      const nc = p.c + d[0], nr = p.r + d[1];
      return this.inside(nc, nr) && this.owner[this.idx(nc, nr)] === p.id;
    };
    if ((p.dir[0] !== 0 || p.dir[1] !== 0) && ok(p.dir) && Math.random() < 0.8) return;
    const opts = DIRS.filter(ok);
    p.dir = opts.length ? [...opts[Math.floor(Math.random() * opts.length)]] as [number, number] : [0, 0];
  }

  private followPlan(p: Player): void {
    while (p.plan.length && p.plan[0][2] <= 0) p.plan.shift();
    if (!p.plan.length) {
      const home = this.bfs(p, (i) => this.owner[i] === p.id, 120);
      p.mode = p.trail.length > 0 ? 'return' : 'home';
      p.dir = p.trail.length > 0 ? (home.dir ?? this.anySafeDir(p)) : [0, 0];
      return;
    }
    const leg = p.plan[0];
    // 대각선 다리: 가로·세로를 번갈아
    let d: [number, number] = [leg[0], leg[1]];
    if (leg[0] !== 0 && leg[1] !== 0) { d = p.zig ? [leg[0], 0] : [0, leg[1]]; }
    const nc = p.c + d[0], nr = p.r + d[1];
    if (!this.inside(nc, nr) || this.trail[this.idx(nc, nr)] === p.id) { p.plan.shift(); this.followPlan(p); return; }
    if (leg[0] !== 0 && leg[1] !== 0) p.zig = !p.zig;
    if (this.owner[this.idx(nc, nr)] !== p.id) leg[2]--;   // 밖으로 나간 칸만 셈
    p.dir = d;
    p.mode = 'out';
  }

  // 나갈 방향과 모양, 크기 정하기
  private makePlan(p: Player): void {
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === p.id) { sx += i % this.cols; sy += Math.floor(i / this.cols); n++; }
    const cx = n ? sx / n : p.c, cy = n ? sy / n : p.r;
    const kid = this.kid;
    let best: [number, number] = DIRS[0], bs = -Infinity;
    for (const d of DIRS) {
      let open = 0, steal = 0, edge = false;
      for (let k = 1; k <= 8; k++) {
        const c = p.c + d[0] * k, r = p.r + d[1] * k;
        if (!this.inside(c, r)) { edge = true; break; }
        const o = this.owner[this.idx(c, r)];
        if (o !== p.id) open++;
        if (o === KID) steal++;
      }
      const away = d[0] * (p.c - cx) + d[1] * (p.r - cy);
      const toKid = d[0] * Math.sign(kid.c - p.c) + d[1] * Math.sign(kid.r - p.r);
      const greedy = p.pers.loop > 1 ? 1.5 : 0.8;
      const score = open * 1.2 + steal * greedy + away * 0.4 + (edge ? -6 : 0) + toKid * (this.stage >= 2 ? 0.6 : 0) + Math.random() * 3;
      if (score > bs) { bs = score; best = d; }
    }
    const kidDist = Math.hypot(kid.c - p.c, kid.r - p.r);
    const bold = Math.max(0.25, Math.min(1, (kidDist - 6) / 22)) * p.pers.loop;
    const a = Math.max(2, Math.round(2 + (2 + this.stage) * bold * rand(0.6, 1.2)));
    const b = Math.max(2, Math.round(3 + (3 + this.stage) * bold * rand(0.6, 1.2)));
    const side: [number, number] = best[0] === 0 ? [Math.random() < 0.5 ? 1 : -1, 0] : [0, Math.random() < 0.5 ? 1 : -1];
    const shape = Math.random();
    if (shape < 0.45) {          // 네모
      p.plan = [[best[0], best[1], a], [side[0], side[1], b], [-best[0], -best[1], a + 2]];
    } else if (shape < 0.75) {   // 대각선으로 나갔다가 옆으로
      p.plan = [[best[0] + side[0], best[1] + side[1], a * 2], [side[0], side[1], Math.ceil(b / 2)], [-best[0], -best[1], a + 2]];
    } else {                     // 지그재그로 옆으로 훑기
      p.plan = [[best[0], best[1], a], [side[0], side[1], 2], [best[0], best[1], 2], [side[0], side[1], 2], [-best[0], -best[1], 2], [side[0], side[1], b], [-best[0], -best[1], a + 2]];
    }
    p.zig = Math.random() < 0.5;
    p.mode = 'out';
  }

  // 꼬마가 내 선(또는 머리)에 닿기까지 걸리는 칸 수 (꼬마는 자유롭게 움직이니 직선 거리)
  private threat(p: Player): number {
    const kid = this.kid;
    if (this.hurtTimer > 0) return 99;
    let d = Math.hypot(kid.c - p.c, kid.r - p.r);
    for (const i of p.trail) d = Math.min(d, Math.hypot(kid.c - i % this.cols, kid.r - Math.floor(i / this.cols)));
    return d;
  }

  // 꼬마가 지금 자기 땅에 들어가기까지 걸리는 시간 (초, 직선 거리로 어림)
  private kidHomeTime(): number {
    const kid = this.kid;
    let bd = 999;
    for (let i = 0; i < this.owner.length; i++) {
      if (this.owner[i] !== KID) continue;
      const d = Math.hypot(i % this.cols - kid.c, Math.floor(i / this.cols) - kid.r);
      if (d < bd) bd = d;
    }
    return bd / KID_SPEED;
  }

  // 길 찾기: 자기 선을 피해서 goal 칸까지 가장 짧은 길의 첫 걸음과 거리
  private bfsQueue = new Int32Array(MAP_COLS * MAP_ROWS);
  private bfsFirst = new Int8Array(MAP_COLS * MAP_ROWS);
  private bfsDist = new Int16Array(MAP_COLS * MAP_ROWS);
  private bfs(p: Player, goal: (i: number) => boolean, maxDist: number): { dir: [number, number] | null; dist: number; target: number } {
    const C = this.cols, R = this.rows;
    const first = this.bfsFirst, dist = this.bfsDist, q = this.bfsQueue;
    dist.fill(-1);
    const s = this.idx(p.c, p.r);
    dist[s] = 0;
    let head = 0, tail = 0;
    q[tail++] = s;
    while (head < tail) {
      const i = q[head++];
      if (i !== s && goal(i)) { const d = DIRS[first[i]]; return { dir: [d[0], d[1]], dist: dist[i], target: i }; }
      if (dist[i] >= maxDist) continue;
      const c = i % C, r = (i - c) / C;
      for (let k = 0; k < 4; k++) {
        const nc = c + DIRS[k][0], nr = r + DIRS[k][1];
        if (nc < 0 || nc >= C || nr < 0 || nr >= R) continue;
        const j = nr * C + nc;
        if (dist[j] >= 0 || this.trail[j] === p.id) continue;
        if (i === s && p.trail.length > 0 && DIRS[k][0] === -p.dir[0] && DIRS[k][1] === -p.dir[1]) continue;
        dist[j] = dist[i] + 1;
        first[j] = i === s ? k : first[i];
        q[tail++] = j;
      }
    }
    return { dir: null, dist: 999, target: -1 };
  }

  // 갈 곳이 없을 때: 자기 선만 피해서 아무 쪽으로
  private anySafeDir(p: Player): [number, number] {
    for (const d of [...DIRS].sort(() => Math.random() - 0.5)) {
      const nc = p.c + d[0], nr = p.r + d[1];
      if (this.inside(nc, nr) && this.trail[this.idx(nc, nr)] !== p.id) return [d[0], d[1]];
    }
    return [0, 0];
  }
}
