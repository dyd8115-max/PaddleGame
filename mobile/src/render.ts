// 캔버스 그리기. 게임 상태를 읽기만 한다
import { images } from './assets';
import type { Game } from './game/game';
import { Rect } from './game/geometry';
import { Characters, Devil, DevilSprite, ITEM_INFO, World, menuTop, type GameMode } from './game/objects';
import { SKILLS } from './game/archer';
import { CELL, KID_H, KID_W, PIECE_COLORS } from './game/climb';

const ARROW_SPEED_DRAW = 720;   // 화살 꼬리 길이 계산용 (archer.ts 의 화살 빠르기)
import { TOSS_BUTTONS_W, type Layout, HUD_H } from './layout';
import { UI, type Overlay } from './ui';

const FONT = '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';

const ROW_COLORS = ['#e65050', '#f0963c', '#50c878', '#50a0f0', '#aa6ee6'];
const ITEM_COLOR = '#ffe65a';
const PADDLE_COLOR = '#dcdce6';
const BALL_COLOR: Record<string, string> = { white: '#ffffff', red: '#ff4d4d', green: '#4ddc7a' };
const ITEM_GOOD = '#3b82f6';        // 좋은 아이템 (공 늘리기, 패들 길게)
const ITEM_BAD = '#b23b3b';         // 나쁜 아이템 (공 줄이기, 패들 짧게)
const WALL_COLOR = '#7c8190';       // 회색 벽 (안 깨짐)
const WALL_LIGHT = '#a9aebb';
const WALL_DARK = '#3c404c';
const CARD = '#242838';
const CARD_SEL = '#465078';
const WHITE = '#ffffff';
const GRAY = '#aaafbe';

export interface View {
  overlay: Overlay;
  muted: boolean;
  rankingVisible: boolean;
  elfSaveRound: number;  // 엘프 중간 저장 라운드 (없으면 0)
  time: number;          // 화면 연출용 시계 (초)
}

type Ctx = CanvasRenderingContext2D;

function font(size: number, bold = false): string {
  return `${bold ? 700 : 500} ${size}px ${FONT}`;
}

function text(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, opts: { bold?: boolean; align?: CanvasTextAlign } = {}): void {
  ctx.font = font(size, opts.bold);
  ctx.fillStyle = color;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

function roundRect(ctx: Ctx, r: Rect, radius: number): void {
  const rr = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rr, r.y);
  ctx.arcTo(r.right, r.y, r.right, r.bottom, rr);
  ctx.arcTo(r.right, r.bottom, r.x, r.bottom, rr);
  ctx.arcTo(r.x, r.bottom, r.x, r.y, rr);
  ctx.arcTo(r.x, r.y, r.right, r.y, rr);
  ctx.closePath();
}

function mix(hex: string, t: number): string {
  // 색을 흰색 쪽으로 t 만큼 섞음 (벽돌이 나타날 때 반짝임)
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// 배경을 화면 전체에 꽉 차게 (비율 유지, 넘치는 부분은 잘라냄)
function drawBackground(ctx: Ctx, l: Layout, index: number): void {
  const img = images.backgrounds[index];
  ctx.fillStyle = '#14161f';
  ctx.fillRect(0, 0, l.w, l.h);
  if (!img) return;
  const s = Math.max(l.w / img.width, l.h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, (l.w - dw) / 2, (l.h - dh) / 2, dw, dh);
}

function drawCharacter(ctx: Ctx, character: number, frame: number, facingLeft: boolean, dst: Rect): void {
  const img = images.characters;
  if (!img) {
    ctx.fillStyle = '#78a06e';
    ctx.fillRect(dst.x, dst.y, dst.w, dst.h);
    return;
  }
  const cw = img.width / Characters.FrameCount;
  const ch = img.height / Characters.List.length;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if (facingLeft) {
    ctx.translate(dst.x + dst.w, dst.y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, frame * cw, character * ch, cw, ch, 0, 0, dst.w, dst.h);
  } else {
    ctx.drawImage(img, frame * cw, character * ch, cw, ch, dst.x, dst.y, dst.w, dst.h);
  }
  ctx.restore();
}

function drawDevil(ctx: Ctx, game: Game): void {
  const d = game.devil;
  if (!d.active) return;
  drawDevilSprite(ctx, d, d.airborne ? 0 : game.stompDip());   // 밟고 있으면 패들과 같이 눌림
}

function drawDevilSprite(ctx: Ctx, d: Devil, dip: number): void {
  const b = d.bounds();
  const img = images.devil;
  if (!img) {
    ctx.fillStyle = '#781e28';
    ctx.fillRect(b.x + 36 * d.scale, b.y + 40 * d.scale + dip, 46 * d.scale, 88 * d.scale);
    return;
  }
  const c = DevilSprite.Cell;
  const dc = c * d.scale;   // 그리는 크기 (엘프 모드는 2배)
  ctx.save();
  ctx.imageSmoothingEnabled = false;   // 도트 그림은 또렷하게
  if (d.facingLeft) {
    ctx.translate(b.x + dc, b.y + dip);
    ctx.scale(-1, 1);
    ctx.drawImage(img, d.frame() * c, d.anim() * c, c, c, 0, 0, dc, dc);
  } else {
    ctx.drawImage(img, d.frame() * c, d.anim() * c, c, c, b.x, b.y + dip, dc, dc);
  }
  ctx.restore();
}

// 밝은 배경에서도 보이도록 어두운 테두리를 두른 사각형
function outlinedRect(ctx: Ctx, r: Rect, color: string): void {
  ctx.fillStyle = '#0f0f19';
  ctx.fillRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

function button(ctx: Ctx, r: Rect, label: string, primary: boolean, size = 20): void {
  roundRect(ctx, r, 14);
  if (primary) {
    ctx.fillStyle = ITEM_COLOR;
    ctx.fill();
    text(ctx, label, r.centerX, r.centerY + 1, size, '#1e2232', { bold: true });
  } else {
    ctx.fillStyle = 'rgba(36,40,56,0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    text(ctx, label, r.centerX, r.centerY + 1, size, WHITE, { bold: true });
  }
}

// 기록 글자: 꼬마는 스테이지, 엘프는 쏜 공 수, 성녀는 버틴 시간
function formatRecord(mode: GameMode, v: number): string {
  if (mode === 'swipe') return `ROUND ${v}`;
  if (mode === 'archer' || mode === 'climb') return `STAGE ${v}`;
  if (mode === 'survival') {
    if (v < 60) return `${v.toFixed(1)}초`;
    return `${Math.floor(v / 60)}분 ${(v % 60).toFixed(1).padStart(4, '0')}초`;
  }
  return `STAGE ${v}`;
}

// ---------- 게임 영역 (논리 좌표) ----------
// ---------- 꼬마 오르기 모드 ----------
function drawBlock(ctx: Ctx, r: Rect, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(r.x + 1, r.bottom - 5, r.w - 2, 4);
  ctx.globalAlpha = 1;
}

function drawClimb(ctx: Ctx, game: Game, v: View): void {
  const c = game.climb!;

  // 빨간 선: 머리가 닿으면 클리어
  ctx.save();
  ctx.setLineDash([12, 8]);
  ctx.strokeStyle = 'rgba(255,80,80,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, c.lineY);
  ctx.lineTo(World.Width, c.lineY);
  ctx.stroke();
  ctx.restore();
  text(ctx, '도착', World.Width - 26, c.lineY - 12, 13, '#ff8080', { bold: true });

  // 쌓인 블록
  for (let r = 0; r < c.grid.length; r++) {
    for (let col = 0; col < c.grid[r].length; col++) {
      const k = c.grid[r][col];
      if (k >= 0) drawBlock(ctx, c.cellRect(col, r), PIECE_COLORS[k]);
    }
  }
  // 떨어질 자리 그림자, 떨어지는 블록
  for (const p of c.pieces) {
    const lr = c.landRow(p);
    for (const [cx, cy] of p.cells) drawBlock(ctx, c.cellRect(p.col + cx, lr + cy), PIECE_COLORS[p.color], 0.22);
  }
  for (const p of c.pieces) {
    for (const [cx, cy] of p.cells) drawBlock(ctx, c.cellAt(p, cx, cy), PIECE_COLORS[p.color]);
  }

  // 꼬마: 판정 상자 아랫면에 맞춰 그림 (맞은 직후 깜빡임)
  const p = game.player;
  if (c.invuln <= 0 || Math.floor(v.time * 12) % 2 === 0) {
    const w = CELL * 1.15, h = w * (Characters.CellH / Characters.CellW);
    const dst = new Rect(c.x + KID_W / 2 - w / 2, c.y + KID_H - h + 2, w, h);
    drawCharacter(ctx, p.character, p.frame(), p.facingLeft, dst);
  }

  const my = World.Height * 0.42;
  if (c.clearTimer > 0) {
    text(ctx, 'STAGE CLEAR!', World.Width / 2, my, 32, ITEM_COLOR, { bold: true });
    text(ctx, '다음 스테이지는 블록이 더 빨라요', World.Width / 2, my + 42, 16, '#dcdce6');
  } else if (c.stage === 1 && c.time < 3.5) {
    text(ctx, '블록을 피해 밟고 올라 빨간 선까지!', World.Width / 2, my, 19, WHITE, { bold: true });
    text(ctx, '누른 쪽으로 걷고, 톡 치면 점프', World.Width / 2, my + 32, 15, '#dcdce6');
  }
}

// ---------- 꼬마 지뢰 모드 ----------
const MINE_NUM_COLOR = ['', '#5aa9ff', '#4ddc7a', '#ff6b6b', '#c38bff', '#ffb347', '#4dd6d6', '#ffffff', '#aaaaaa'];

function drawMineBoard(ctx: Ctx, game: Game): void {
  // 깬 칸: 어두운 바탕에 주변 지뢰 수
  for (const m of game.mineNumbers) {
    ctx.fillStyle = 'rgba(10,12,20,0.55)';
    ctx.fillRect(m.rect.x, m.rect.y, m.rect.w, m.rect.h);
    if (m.n > 0) text(ctx, String(m.n), m.rect.centerX, m.rect.centerY + 1, 17, MINE_NUM_COLOR[m.n], { bold: true });
  }
  // 터진 지뢰
  for (const r of game.exploded) {
    ctx.fillStyle = 'rgba(120,20,20,0.75)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.beginPath();
    ctx.arc(r.centerX, r.centerY, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    ctx.strokeStyle = '#ffcf5a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(r.centerX + Math.cos(a) * 8, r.centerY + Math.sin(a) * 8);
      ctx.lineTo(r.centerX + Math.cos(a) * 12, r.centerY + Math.sin(a) * 12);
      ctx.stroke();
    }
  }
  // 아직 안 깬 벽돌: 모두 같은 색 (지뢰인지 모름), 깃발 벽돌은 빨간 깃발
  for (const k of game.bricks) {
    if (!k.alive) continue;
    const t = game.brickReveal(k);
    if (t <= 0) continue;
    const b = k.rect;
    ctx.fillStyle = mix('#6a7896', (1 - t) * 0.7);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(b.x, b.y, b.w, 3);
    if (k.flag) {
      const x = b.centerX - 4, y = b.y + 4;
      ctx.fillStyle = '#e6e6e6';
      ctx.fillRect(x, y, 2, b.h - 8);
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + 14, y + 5);
      ctx.lineTo(x + 2, y + 10);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ---------- 엘프 궁수 모드 ----------
function drawArcher(ctx: Ctx, game: Game, v: View): void {
  const a = game.archer!;

  // 엘프 구역 경계: 벽돌이 여기 닿으면 체력 -1
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = 'rgba(255,90,90,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, a.zoneTop);
  ctx.lineTo(World.Width, a.zoneTop);
  ctx.stroke();
  ctx.restore();

  const maxHp = a.bricks.reduce((m, k) => Math.max(m, k.maxHp), 1);
  for (const k of a.bricks) {
    const t = Math.max(0, Math.min(1, (a.time - k.appearAt) / 0.16));
    if (t <= 0) continue;
    const r = a.brickRect(k);
    const s = 0.6 + 0.4 * t;
    const rr = new Rect(r.centerX - r.w * s / 2, r.centerY - r.h * s / 2, r.w * s, r.h * s);
    roundRect(ctx, rr, 6);
    ctx.fillStyle = k.shooter ? '#7a3cc8' : hpColor(k.hp, maxHp);
    ctx.fill();
    if (k.shooter) {   // 쏘는 벽돌: 보라색에 눈
      ctx.fillStyle = '#ffe65a';
      ctx.beginPath();
      ctx.arc(rr.x + 10, rr.centerY, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    text(ctx, String(k.hp), rr.centerX, rr.centerY + 1, 16, k.shooter ? WHITE : '#1e2232', { bold: true });
  }

  if (a.boss) {
    const br = a.bossRect()!;
    roundRect(ctx, br, 10);
    ctx.fillStyle = '#8a1c2b';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffb0b0';
    ctx.stroke();
    text(ctx, String(Math.max(0, a.bossHp)), br.centerX, br.centerY + 1, 24, WHITE, { bold: true });
    const w = 120, x = br.centerX - w / 2, y = br.y - 14;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 1, y - 1, w + 2, 8);
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(x, y, w * Math.max(0, a.bossHp / a.bossMaxHp), 6);
  }

  // 화살
  ctx.strokeStyle = '#fff3b0';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const ar of a.arrows) {
    const len = 14 / ARROW_SPEED_DRAW;
    ctx.beginPath();
    ctx.moveTo(ar.pos.x, ar.pos.y);
    ctx.lineTo(ar.pos.x - ar.vel.x * len, ar.pos.y - ar.vel.y * len);
    ctx.stroke();
  }

  // 적 탄
  for (const b of a.bullets) {
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff5a5a';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#2a0a0a';
    ctx.stroke();
  }

  // 엘프 (맞은 직후에는 깜빡임)
  const p = game.player;
  if (a.invuln <= 0 || Math.floor(v.time * 12) % 2 === 0) {
    drawCharacter(ctx, p.character, p.frame(), p.facingLeft, a.elfRect());
  }

  // 경험치 막대 (맨 위)
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, World.Width, 6);
  ctx.fillStyle = '#4ddc7a';
  ctx.fillRect(0, 0, World.Width * Math.min(1, a.xp / a.xpNeed), 6);

  const my = World.Height * 0.4;
  if (a.clearTimer > 0) {
    text(ctx, 'STAGE CLEAR!', World.Width / 2, my, 32, ITEM_COLOR, { bold: true });
    text(ctx, (a.stage + 1) % 5 === 0 ? '다음은 보스!' : '체력 1 회복', World.Width / 2, my + 42, 16, '#dcdce6');
  } else if (a.stage === 1 && a.time < 3) {
    text(ctx, '끌어서 움직이고, 멈추면 자동 발사!', World.Width / 2, World.Height * 0.62, 18, WHITE, { bold: true });
  } else if (a.boss && a.time < 2) {
    text(ctx, '보스 등장!', World.Width / 2, World.Height * 0.62, 28, '#ff9a9a', { bold: true });
  }

  // 레벨업: 스킬 카드 3장
  if (a.choosing) {
    ctx.fillStyle = 'rgba(8,10,16,0.75)';
    ctx.fillRect(0, 0, World.Width, World.Height);
    text(ctx, `레벨 업! Lv ${a.level}`, World.Width / 2, World.Height * 0.32 - 50, 28, ITEM_COLOR, { bold: true });
    text(ctx, '스킬을 하나 고르세요', World.Width / 2, World.Height * 0.32 - 18, 15, '#dcdce6');
    a.choosing.forEach((id, i) => {
      const r = a.cardRect(i);
      const info = SKILLS[id];
      const lv = a.skills[id] ?? 0;
      roundRect(ctx, r, 12);
      ctx.fillStyle = CARD_SEL;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ITEM_COLOR;
      ctx.stroke();
      text(ctx, info.name, r.centerX, r.y + 40, 16, WHITE, { bold: true });
      wrapText(ctx, info.desc, r.centerX, r.y + 80, r.w - 16, 13, '#dcdce6');
      if (id !== 'heal') text(ctx, `${lv} → ${lv + 1}`, r.centerX, r.bottom - 22, 14, ITEM_COLOR, { bold: true });
    });
  }
}

// 짧은 설명을 칸 너비에 맞춰 줄바꿈 (공백 기준)
function wrapText(ctx: Ctx, s: string, cx: number, y: number, maxW: number, size: number, color: string): void {
  ctx.font = `${size}px ${FONT}`;
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  lines.forEach((ln, i) => text(ctx, ln, cx, y + i * (size + 5), size, color));
}

// 엘프 모드 벽돌 색: 화면에서 숫자가 클수록 초록 → 노랑 → 빨강
function hpColor(hp: number, maxHp: number): string {
  const t = maxHp <= 1 ? 0 : Math.min(1, (hp - 1) / (maxHp - 1));
  return `hsl(${Math.round(135 - t * 135)}, 62%, 56%)`;
}

function drawSwipe(ctx: Ctx, game: Game): void {
  const s = game.swipe!;
  const floor = game.paddle.y + game.paddle.h;

  // 바닥선: 벽돌이 여기 닿으면 끝
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(0, floor, World.Width, 1.5);

  const p = game.player;
  drawCharacter(ctx, p.character, p.frame(), p.facingLeft, p.bounds());

  const maxHp = s.bricks.reduce((m, k) => Math.max(m, k.hp), 1);
  for (const k of s.bricks) {
    const r = s.drawRect(k.col, k.row);
    roundRect(ctx, r, 6);
    ctx.fillStyle = hpColor(k.hp, maxHp);
    ctx.fill();
    if (k.bonus) {   // +1 벽돌: 초록 테두리와 작은 +1
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#4ddc7a';
      ctx.stroke();
      ctx.fillStyle = '#1e7a3e';
      ctx.fillRect(r.right - 20, r.y + 2, 18, 13);
      text(ctx, '+1', r.right - 11, r.y + 9, 10, WHITE, { bold: true });
    }
    text(ctx, String(k.hp), r.centerX, r.centerY + 2, k.hp >= 100 ? 15 : 18, '#1e2232', { bold: true });
  }

  for (const b of s.balls) outlinedRect(ctx, b.bounds(), WHITE);
  drawDevil(ctx, game);   // 벽돌 위에 그려서 가림

  // 조준선: 점선으로 두 번째로 부딪치는 곳까지
  const dir = s.aimDir();
  if (dir) {
    const pts = s.previewPath(dir);
    ctx.save();
    ctx.setLineDash([2, 9]);
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y);
    ctx.stroke();
    ctx.restore();
    const end = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(end.x, end.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  }

  // 쏠 자리에 공과 남은 수
  if (s.phase !== 'shoot' || s.toLaunch > 0) {
    const lp = s.launchPos;
    outlinedRect(ctx, new Rect(lp.x - 5, lp.y - 5, 10, 10), WHITE);
    const n = s.phase === 'shoot' ? s.toLaunch : s.ballCount;
    const tx = Math.max(22, Math.min(World.Width - 22, lp.x));   // 화면 끝에서도 글자가 잘리지 않게
    text(ctx, `×${n}`, tx, lp.y - 17, 15, WHITE, { bold: true });
  }

  if (s.round === 1 && s.phase === 'aim' && !s.aiming) {
    const my = World.Height * 0.55;
    text(ctx, '위쪽을 누른 채 아래로 당겨 조준', World.Width / 2, my, 20, WHITE, { bold: true });
    text(ctx, '손을 떼면 발사! 흰 선 아래를 밀면 자리 이동', World.Width / 2, my + 32, 16, '#dcdce6');
  }
}

function drawPlaying(ctx: Ctx, game: Game, v: View): void {
  if (game.climb) { drawClimb(ctx, game, v); return; }
  if (game.archer) { drawArcher(ctx, game, v); return; }
  if (game.swipe) { drawSwipe(ctx, game); return; }
  const p = game.player;
  drawCharacter(ctx, p.character, p.frame(), p.facingLeft, p.bounds());

  drawWalls(ctx, game);

  // 성녀: 벽돌이 닿으면 끝나는 선
  if (game.mode === 'survival') {
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = 'rgba(255,90,90,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, game.dangerY);
    ctx.lineTo(World.Width, game.dangerY);
    ctx.stroke();
    ctx.restore();
  }

  if (game.mode === 'mine') drawMineBoard(ctx, game);

  const shift = game.brickShift();   // 성녀: 한 줄 내려오는 중
  for (const k of game.bricks) {
    if (game.mode === 'mine') break;   // 지뢰 모드는 위에서 따로 그림
    if (!k.alive) continue;
    const r = game.brickReveal(k);
    if (r <= 0) continue;
    // 톡 튀어나오는 크기 변화: 0 → 살짝 크게 → 원래 크기
    const c1 = 1.70158, c3 = c1 + 1, u = r - 1;
    const s = 1 + c3 * u * u * u + c1 * u * u;
    const b = new Rect(k.rect.x, k.rect.y + shift, k.rect.w, k.rect.h);
    const color = k.item ? ITEM_COLOR : ROW_COLORS[k.row % ROW_COLORS.length];
    ctx.fillStyle = mix(color, (1 - r) * 0.7);
    ctx.fillRect(b.centerX - b.w * s / 2, b.centerY - b.h * s / 2, b.w * s, b.h * s);
  }

  drawItems(ctx, game);

  const pad = game.paddle.bounds();
  pad.y += game.stompDip();
  outlinedRect(ctx, pad, PADDLE_COLOR);
  for (const b of game.balls) outlinedRect(ctx, b.bounds(), BALL_COLOR[b.kind]);
  drawDevil(ctx, game);   // 공과 패들보다 나중에 그려서 공을 가림

  const my = World.Height * 0.5;   // 안내 문구는 세계 높이의 가운데쯤
  if (game.serving && game.mode === 'survival') {
    text(ctx, '준비!', World.Width / 2, my, 34, ITEM_COLOR, { bold: true });
    text(ctx, '3초마다 벽돌이 한 줄씩 내려와요', World.Width / 2, my + 50, 16, '#dcdce6');
  } else if (game.serving && game.mode === 'mine') {
    text(ctx, `STAGE ${game.stage}`, World.Width / 2, my, 34, ITEM_COLOR, { bold: true });
    text(ctx, game.stage === 1 ? '지뢰 같은 벽돌은 톡 쳐서 깃발!' : `지뢰가 늘어요 · 남은 체력 ${game.hearts}`, World.Width / 2, my + 50, 16, '#dcdce6');
  } else if (game.serving) {
    text(ctx, `STAGE ${game.stage}`, World.Width / 2, my, 34, ITEM_COLOR, { bold: true });
    const sub = game.stage === 1 ? '준비!'
      : game.stage === 2 ? '악마가 패들 위에 올라탔어요! 공을 잘 보세요'
      : '클리어! 공이 더 빨라져요';
    text(ctx, sub, World.Width / 2, my + 50, 16, '#dcdce6');
  }
}

// 떨어지는 아이템: 둥근 알약 모양에 효과 글자. 좋은 건 파랑, 나쁜 건 빨강
function drawItems(ctx: Ctx, game: Game): void {
  for (const it of game.items) {
    const r = it.bounds();
    const info = ITEM_INFO[it.kind];
    roundRect(ctx, new Rect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3), (r.h + 3) / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fill();
    roundRect(ctx, r, r.h / 2);
    ctx.fillStyle = info.good ? ITEM_GOOD : ITEM_BAD;
    ctx.fill();
    text(ctx, info.label, r.centerX, r.centerY + 1, 13, WHITE, { bold: true });
  }
}

// 회색 벽: 테두리와 위쪽 밝은 줄로 돌처럼. 스테이지 시작 때 짧게 나타난다
function drawWalls(ctx: Ctx, game: Game): void {
  const a = game.wallReveal();
  if (a <= 0 || game.walls.length === 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  for (const r of game.walls) {
    ctx.fillStyle = WALL_DARK;
    ctx.fillRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
    ctx.fillStyle = WALL_COLOR;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = WALL_LIGHT;
    ctx.fillRect(r.x, r.y, r.w, 3);
    ctx.fillRect(r.x, r.y, 3, r.h);
  }
  ctx.restore();
}

function drawMenu(ctx: Ctx, game: Game, v: View): void {
  ctx.fillStyle = 'rgba(10,12,20,0.45)';
  ctx.fillRect(0, 0, World.Width, World.Height);
  ctx.save();
  ctx.translate(0, menuTop());   // 메뉴 내용은 640 높이 상자로 가운데에

  text(ctx, '블록 브레이커', World.Width / 2, 60, 38, WHITE, { bold: true });
  text(ctx, '캐릭터를 고르세요', World.Width / 2, 112, 16, GRAY);

  for (let i = 0; i < Characters.List.length; i++) {
    const card = Characters.cardRect(i);
    const sel = i === game.selected;
    roundRect(ctx, card, 12);
    ctx.fillStyle = sel ? CARD_SEL : CARD;
    ctx.fill();
    if (sel) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = ITEM_COLOR;
      ctx.stroke();
    }
    const sw = Characters.CellW * 1.4, sh = Characters.CellH * 1.4;
    const dst = new Rect(card.centerX - sw / 2, card.bottom - 30 - sh, sw, sh);
    const frame = sel ? Math.floor(game.menuTime * Characters.List[i].fps) % Characters.FrameCount : 0;
    drawCharacter(ctx, i, frame, false, dst);
    text(ctx, Characters.List[i].name, card.centerX, card.bottom - 16, 15, sel ? ITEM_COLOR : WHITE, { bold: true });
  }

  // 고른 캐릭터의 능력
  text(ctx, Characters.List[game.selected].ability, World.Width / 2, 322, 16, ITEM_COLOR, { bold: true });

  if (game.lastResult === 'gameover') {
    const lastMode = Characters.List[game.player.character].mode;
    text(ctx, `게임 오버  ·  ${Characters.List[game.player.character].name}  ${formatRecord(lastMode, game.lastRecord)}`,
      World.Width / 2, 350, 17, '#f06e6e', { bold: true });
  }
  const selMode = Characters.List[game.selected].mode;
  const selBest = game.bestRecord(game.selected);
  text(ctx, selBest > 0 ? `최고 기록 ${formatRecord(selMode, selBest)}` : '아직 기록이 없어요', World.Width / 2, 376, 15, GRAY);

  // 시작 버튼은 살짝 숨쉬듯 커졌다 작아짐
  const pulse = 1 + 0.03 * Math.sin(v.time * 4);
  const s = UI.start;
  const big = new Rect(s.centerX - s.w * pulse / 2, s.centerY - s.h * pulse / 2, s.w * pulse, s.h * pulse);
  const resume = selMode === 'swipe' && v.elfSaveRound > 0;
  button(ctx, big, resume ? `이어하기 (R${v.elfSaveRound})` : '시작하기', true, resume ? 20 : 24);
  if (resume) button(ctx, UI.newGame, '처음부터', false, 15);
  if (v.rankingVisible) button(ctx, UI.ranking, '랭킹 보기', false, 17);

  const hints = Characters.List[game.selected].hints;
  text(ctx, hints[0], World.Width / 2, 566, 15, GRAY);
  text(ctx, hints[1], World.Width / 2, 592, 15, GRAY);
  ctx.restore();
}

function drawOverlay(ctx: Ctx, overlay: Overlay): void {
  if (overlay === 'none') return;
  ctx.fillStyle = 'rgba(8,10,16,0.72)';
  ctx.fillRect(0, 0, World.Width, World.Height);
  ctx.save();
  ctx.translate(0, menuTop());
  if (overlay === 'pause') {
    text(ctx, '일시정지', World.Width / 2, 230, 30, WHITE, { bold: true });
    button(ctx, UI.resume, '계속하기', true, 22);
    button(ctx, UI.quit, '그만하기', false, 20);
  } else {
    text(ctx, '게임을 종료할까요?', World.Width / 2, 280, 24, WHITE, { bold: true });
    button(ctx, UI.exitCancel, '취소', false, 20);
    button(ctx, UI.exitOk, '종료', true, 20);
  }
  ctx.restore();
}

// ---------- 화면 테두리 정보 (CSS 픽셀) ----------
function drawHud(ctx: Ctx, l: Layout, game: Game, v: View): void {
  const playing = game.state === 'playing';
  const iconBtn = (r: Rect) => {
    roundRect(ctx, r, 10);
    ctx.fillStyle = 'rgba(20,22,34,0.75)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.stroke();
  };

  if (playing) {
    const r = l.pauseBtn;
    iconBtn(r);
    ctx.fillStyle = WHITE;
    ctx.fillRect(r.centerX - 7, r.centerY - 8, 5, 16);
    ctx.fillRect(r.centerX + 2, r.centerY - 8, 5, 16);
  }

  // 소리 버튼: 스피커 모양, 꺼져 있으면 X
  const s = playing ? l.soundBtn : l.pauseBtn;
  iconBtn(s);
  const cx = s.centerX - 4, cy = s.centerY;
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy - 4);
  ctx.lineTo(cx - 4, cy - 4);
  ctx.lineTo(cx + 2, cy - 9);
  ctx.lineTo(cx + 2, cy + 9);
  ctx.lineTo(cx - 4, cy + 4);
  ctx.lineTo(cx - 9, cy + 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (v.muted) {
    ctx.moveTo(cx + 6, cy - 4); ctx.lineTo(cx + 13, cy + 4);
    ctx.moveTo(cx + 13, cy - 4); ctx.lineTo(cx + 6, cy + 4);
  } else {
    ctx.arc(cx + 3, cy, 6, -0.9, 0.9);
    ctx.moveTo(cx + 3 + 10 * Math.cos(-0.9), cy + 10 * Math.sin(-0.9));
    ctx.arc(cx + 3, cy, 10, -0.9, 0.9);
  }
  ctx.stroke();

  if (playing) {
    // 지금 기록과 보조 정보. 오른쪽 끝은 토스 버튼 자리라 비워 둠
    const x = l.soundBtn.right + 14;
    const maxW = l.w - l.insets.right - TOSS_BUTTONS_W - x;
    const y = l.hudTop + HUD_H / 2;
    const mode = game.mode;
    const best = game.bestRecord(game.player.character);
    const sw = game.swipe;
    const ar = game.archer;
    const sub = game.climb ? `체력 ${game.climb.hearts}/3`
      : mode === 'mine' ? `체력 ${game.hearts}/3 · 지뢰 ${game.minesLeft}`
      : sw ? `공 ${sw.ballCount}개`
      : ar ? `Lv ${ar.level} · 체력 ${Math.max(0, ar.hp)}/${ar.maxHp}`
      : best > 0 ? `최고 ${formatRecord(mode, best)}` : '첫 도전';
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, l.hudTop, Math.max(0, maxW), HUD_H);
    ctx.clip();
    text(ctx, formatRecord(mode, game.record), x, y - 8, 20, WHITE, { bold: true, align: 'left' });
    text(ctx, sub, x, y + 12, 12, ITEM_COLOR, { bold: true, align: 'left' });
    ctx.restore();
  }
}

export function render(ctx: Ctx, l: Layout, game: Game, v: View): void {
  ctx.setTransform(l.dpr, 0, 0, l.dpr, 0, 0);
  drawBackground(ctx, l, game.background);

  // 게임 영역 바깥은 어둡게
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, l.w, l.gy);
  ctx.fillRect(0, l.gy + l.gh, l.w, l.h - l.gy - l.gh);
  ctx.fillRect(0, l.gy, l.gx, l.gh);
  ctx.fillRect(l.gx + l.gw, l.gy, l.w - l.gx - l.gw, l.gh);

  // 게임 영역
  ctx.save();
  ctx.translate(l.gx, l.gy);
  ctx.scale(l.scale, l.scale);
  ctx.beginPath();
  ctx.rect(0, 0, World.Width, World.Height);
  ctx.clip();
  if (game.state === 'playing') drawPlaying(ctx, game, v);
  else drawMenu(ctx, game, v);
  drawOverlay(ctx, v.overlay);
  ctx.restore();

  // 벽 표시: 위, 왼쪽, 오른쪽 (아래는 열려 있음)
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(l.gx + 0.5, l.gy + l.gh);
  ctx.lineTo(l.gx + 0.5, l.gy + 0.5);
  ctx.lineTo(l.gx + l.gw - 0.5, l.gy + 0.5);
  ctx.lineTo(l.gx + l.gw - 0.5, l.gy + l.gh);
  ctx.stroke();

  // 아래 조작 공간 안내
  if (game.state === 'playing' && v.overlay === 'none' && l.touch.h > 30) {
    const y = l.touch.centerY;
    ctx.globalAlpha = 0.55;
    const hint = game.climb ? '누른 쪽으로 걷기 · 톡 치거나 위로 튕기면 점프'
      : game.archer ? '화면 어디든 끌어서 이동, 멈추면 자동 발사'
      : game.swipe ? '◀   흰 선 아래를 밀어 쏠 자리 옮기기   ▶' : '◀   여기를 좌우로 밀어 패들 이동   ▶';
    text(ctx, hint, l.w / 2, y, 14, WHITE);
    ctx.globalAlpha = 1;
  }

  // 엘프 모드 조이스틱: 누른 곳에 큰 원, 끈 쪽에 작은 원 (화면 픽셀)
  const ja = game.archer;
  if (ja && ja.joyFrom && v.overlay === 'none' && !ja.choosing) {
    const f = ja.joyFrom, t = ja.joyTo;
    const dx = t.x - f.x, dy = t.y - f.y, len = Math.hypot(dx, dy), k = len > 44 ? 44 / len : 1;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 44, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(f.x + dx * k, f.y + dy * k, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  }

  drawHud(ctx, l, game, v);
}
