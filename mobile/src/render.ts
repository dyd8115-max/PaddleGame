// 캔버스 그리기. 게임 상태를 읽기만 한다
import { images } from './assets';
import type { Game } from './game/game';
import { Rect } from './game/geometry';
import { Characters, Devil, DevilSprite, ITEM_INFO, World, menuTop, type GameMode } from './game/objects';
import { SKILLS, type SkillId } from './game/archer';
import { KID_DRAW_H, KID_DRAW_W, SHOT_R, TILE_HP, hordeSkill, type Monster } from './game/horde';
import { CELL, KID_H, KID_W, LAVA_DELAY, PIECE_COLORS } from './game/climb';
import { CC, GOAL, KID, PLAYER_COLORS, type Claim, type Player } from './game/claim';

const ARROW_SPEED_DRAW = 720;   // 화살 꼬리 길이 계산용 (archer.ts 의 화살 빠르기)
import { TOSS_BUTTONS_W, type Layout, HUD_H } from './layout';
import { UI, type Overlay } from './ui';

const FONT = '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';

const ITEM_COLOR = '#ffe65a';
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

// 기록 글자: 엘프는 라운드, 꼬마·성녀는 버틴 시간
function formatRecord(mode: GameMode, v: number): string {
  if (mode === 'swipe') return `ROUND ${v}`;
  if (mode === 'archer' || mode === 'claim') return `STAGE ${v}`;
  if (mode === 'survival' || mode === 'climb' || mode === 'horde') {
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

// ---------- 꼬마 땅따먹기 ----------
// 색을 밝게/어둡게
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// 맵 전체를 한 칸 = 1픽셀로 그린 그림 (작은 지도용). 땅 모양이 바뀔 때만 다시 그림
let claimMini: { canvas: HTMLCanvasElement; version: number; claim: Claim } | null = null;
function claimMiniCanvas(c: Claim): HTMLCanvasElement {
  if (claimMini && claimMini.claim === c && claimMini.version === c.version) return claimMini.canvas;
  const canvas = claimMini?.canvas ?? document.createElement('canvas');
  canvas.width = c.cols; canvas.height = c.rows;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(c.cols, c.rows);
  const rgb = PLAYER_COLORS.map((h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
  for (let i = 0; i < c.owner.length; i++) {
    const o = c.owner[i], t = c.trail[i];
    let col = [235, 236, 245], a = 210;
    if (o >= 0) { col = rgb[o % rgb.length]; a = 255; }
    if (t >= 0) { col = rgb[t % rgb.length].map((v) => Math.round(v + (255 - v) * 0.5)); a = 255; }
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = a;
  }
  g.putImageData(img, 0, 0);
  claimMini = { canvas, version: c.version, claim: c };
  return canvas;
}

// 악마: 동그란 몸에 뿔과 눈 (나중에 그림으로 바꿀 자리)
function drawClaimDevil(ctx: Ctx, c: Claim, p: Player, t: number): void {
  const x = c.headX(p), y = c.headY(p), R = 14;
  const col = PLAYER_COLORS[p.id % PLAYER_COLORS.length];
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x, y + R * 0.9, R * 0.9, R * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  const bob = Math.sin(t * 10 + p.id) * 1.5;
  ctx.fillStyle = shade(col, -0.35);
  for (const s of [-1, 1]) {   // 뿔
    ctx.beginPath();
    ctx.moveTo(x + s * R * 0.35, y - R * 0.75 + bob);
    ctx.lineTo(x + s * R * 0.8, y - R * 1.35 + bob);
    ctx.lineTo(x + s * R * 0.75, y - R * 0.55 + bob);
    ctx.closePath(); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(x, y + bob, R, 0, Math.PI * 2);
  ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = shade(col, -0.45); ctx.stroke();
  const dx = p.dir[0] * 2.5, dy = p.dir[1] * 2.5;
  for (const s of [-1, 1]) {
    ctx.fillStyle = WHITE;
    ctx.beginPath(); ctx.arc(x + s * 5 + dx, y - 2 + bob + dy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1020';
    ctx.beginPath(); ctx.arc(x + s * 5 + dx * 1.4, y - 2 + bob + dy * 1.4, 2, 0, Math.PI * 2); ctx.fill();
  }
  // 성격 표정: 공격형은 화난 눈썹, 겁쟁이는 땀방울, 욕심형은 씩 웃는 입
  const name = p.pers.name;
  ctx.strokeStyle = '#1a1020';
  ctx.lineWidth = 2;
  if (name === '공격형' || p.mode === 'hunt') {
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * 9, y - 9 + bob); ctx.lineTo(x + s * 2, y - 6 + bob); ctx.stroke(); }
  } else if (name === '겁쟁이') {
    ctx.fillStyle = '#8fd8ff';
    ctx.beginPath(); ctx.moveTo(x + 12, y - 12 + bob); ctx.quadraticCurveTo(x + 16, y - 5 + bob, x + 12, y - 4 + bob); ctx.quadraticCurveTo(x + 8, y - 5 + bob, x + 12, y - 12 + bob); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(x, y + 4 + bob, 5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
}

// 칸마다 정해진 0~1 값 (물감 번짐이 매 프레임 같은 모양이게)
function hash01(i: number): number {
  let h = (i * 2654435761) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; h ^= h >>> 16;
  return (h % 1000) / 1000;
}

// 땅을 물감처럼: 안쪽 칸은 네모로 채우고, 가장자리 칸은 조금씩 다른 동그라미로 번지게.
// 아래쪽 가장자리엔 그림자와 흘러내린 방울, 군데군데 반짝이는 윤기
function paintLand(ctx: Ctx, c: Claim, c0: number, c1: number, r0: number, r1: number, t: number): void {
  const C = c.cols;
  const own = (col: number, r: number) => (col < 0 || col >= C || r < 0 || r >= c.rows ? -2 : c.owner[r * C + col]);
  const edges: number[] = [];
  for (let r = Math.max(0, r0 - 1); r <= Math.min(c.rows - 1, r1 + 1); r++) {
    for (let col = Math.max(0, c0 - 1); col <= Math.min(C - 1, c1 + 1); col++) {
      const o = own(col, r);
      if (o < 0) continue;
      let edge = false;   // 둘레 8칸 중 하나라도 다르면 가장자리 (대각선 쪽 모서리도 둥글게)
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (own(col + dx, r + dy) !== o) { edge = true; break; }
      if (edge) edges.push(r * C + col);
    }
  }
  const blob = (i: number) => {
    const col = i % C, r = (i - col) / C, h = hash01(i), h2 = hash01(i + 7777);
    return { x: (col + 0.5) * CC + (h - 0.5) * 4, y: (r + 0.5) * CC + (h2 - 0.5) * 4, rad: CC * (0.72 + h * 0.22) };
  };
  // 그림자 (아래로 조금)
  for (const i of edges) {
    const o = c.owner[i], b = blob(i);
    ctx.fillStyle = shade(PLAYER_COLORS[o % PLAYER_COLORS.length], -0.4);
    ctx.beginPath(); ctx.arc(b.x, b.y + 4, b.rad, 0, Math.PI * 2); ctx.fill();
  }
  // 흘러내린 방울: 아래가 비어 있는 가장자리 칸 몇 군데
  for (const i of edges) {
    const col = i % C, r = (i - col) / C, o = c.owner[i];
    if (own(col, r + 1) === o) continue;
    const h = hash01(i + 333);
    if (h < 0.72) continue;
    const len = 6 + h * 14 + Math.sin(t * 1.5 + i) * 1.5;
    const x = (col + 0.5) * CC + (hash01(i + 5) - 0.5) * 6, y = (r + 0.5) * CC;
    ctx.fillStyle = shade(PLAYER_COLORS[o % PLAYER_COLORS.length], -0.12);
    ctx.fillRect(x - 3, y, 6, CC * 0.5 + len);
    ctx.beginPath(); ctx.arc(x, y + CC * 0.5 + len, 4.2, 0, Math.PI * 2); ctx.fill();
  }
  // 안쪽: 줄마다 같은 주인끼리 이어서 네모로
  for (let r = r0; r <= r1; r++) {
    let s0 = -1, cur = -1;
    for (let col = c0; col <= c1 + 1; col++) {
      const o = col <= c1 ? c.owner[r * C + col] : -1;
      if (o !== cur) {
        if (cur >= 0) { ctx.fillStyle = PLAYER_COLORS[cur % PLAYER_COLORS.length]; ctx.fillRect(s0 * CC - 0.5, r * CC - 0.5, (col - s0) * CC + 1, CC + 1); }   // 살짝 겹쳐 줄 사이 틈이 안 보이게
        cur = o; s0 = col;
      }
    }
  }
  // 가장자리: 동그라미로 번짐
  for (const i of edges) {
    const o = c.owner[i], b = blob(i);
    ctx.fillStyle = PLAYER_COLORS[o % PLAYER_COLORS.length];
    ctx.beginPath(); ctx.arc(b.x, b.y, b.rad, 0, Math.PI * 2); ctx.fill();
  }
  // 윤기: 몇몇 가장자리에 밝은 점
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (const i of edges) {
    if (hash01(i + 99) < 0.8) continue;
    const b = blob(i);
    ctx.beginPath(); ctx.ellipse(b.x - 3, b.y - 4, 4, 2.4, -0.5, 0, Math.PI * 2); ctx.fill();
  }
}

// 물감 붓질: 어두운 테두리 + 밝은 몸 + 가운데 윤기
function paintStroke(ctx: Ctx, pts: { x: number; y: number }[], hx: number, hy: number, color: string): void {
  if (pts.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const q of pts) ctx.lineTo(q.x, q.y);
    ctx.lineTo(hx, hy);
  };
  path(); ctx.strokeStyle = shade(color, -0.25); ctx.lineWidth = CC * 0.85; ctx.stroke();
  path(); ctx.strokeStyle = shade(color, 0.35); ctx.lineWidth = CC * 0.62; ctx.stroke();
  path(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = CC * 0.16; ctx.stroke();
  ctx.restore();
}

// 물감 방울 효과: 꼬마·악마가 움직이면 방울이 튀고, 땅을 차지하면 물감이 팍 튐
interface Drop { x: number; y: number; vx: number; vy: number; r: number; color: string; life: number; max: number; }
const paint = { claim: null as Claim | null, drops: [] as Drop[], lastT: 0, lastFlash: null as object | null };
function paintFx(ctx: Ctx, c: Claim, t: number): void {
  if (paint.claim !== c) { paint.claim = c; paint.drops = []; paint.lastT = t; paint.lastFlash = c.flash; }
  const dt = Math.min(0.05, Math.max(0, t - paint.lastT));
  paint.lastT = t;
  const add = (x: number, y: number, color: string, speed: number, r: number, life: number) => {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
    paint.drops.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3, r, color, life, max: life });
  };
  // 움직일 때 발밑에서 튀는 방울
  for (const p of c.players) {
    if (!p.alive) continue;
    const moving = p.id === KID ? c.moving : (p.dir[0] !== 0 || p.dir[1] !== 0);
    if (!moving || Math.random() > (p.id === KID ? 0.6 : 0.25)) continue;
    add(c.headX(p) + (Math.random() - 0.5) * 10, c.headY(p) + (Math.random() - 0.5) * 10, PLAYER_COLORS[p.id % PLAYER_COLORS.length], 40, 1.5 + Math.random() * 2.5, 0.45);
  }
  // 땅을 차지한 순간: 새 땅 곳곳에서 물감이 팍
  if (c.flash !== paint.lastFlash) {
    paint.lastFlash = c.flash;
    const idx = c.flash.idx;
    for (let k = 0; k < Math.min(40, idx.length); k++) {
      const i = idx[Math.floor(Math.random() * idx.length)];
      add((i % c.cols + 0.5) * CC, (Math.floor(i / c.cols) + 0.5) * CC, PLAYER_COLORS[KID], 140, 3 + Math.random() * 4, 0.7);
    }
    if (idx.length > 0) for (let k = 0; k < 16; k++) add(c.kidX, c.kidY, shade(PLAYER_COLORS[KID], 0.3), 220, 3 + Math.random() * 3, 0.6);
  }
  const keep: Drop[] = [];
  for (const d of paint.drops) {
    d.life -= dt;
    if (d.life <= 0) continue;
    d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 300 * dt; d.vx *= 0.96;
    const k = d.life / d.max;
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.fillStyle = d.color;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (0.6 + 0.4 * k), 0, Math.PI * 2); ctx.fill();
    keep.push(d);
  }
  ctx.globalAlpha = 1;
  paint.drops = keep.length > 400 ? keep.slice(-400) : keep;
}

function drawClaim(ctx: Ctx, game: Game, v: View): void {
  const c = game.claim!;
  ctx.save();
  ctx.translate(-Math.round(c.camX), -Math.round(c.camY));
  const c0 = Math.max(0, Math.floor(c.camX / CC)), c1 = Math.min(c.cols - 1, Math.ceil((c.camX + World.Width) / CC));
  const r0 = Math.max(0, Math.floor(c.camY / CC)), r1 = Math.min(c.rows - 1, Math.ceil((c.camY + World.Height) / CC));

  // 빈 땅: 밝은 바탕에 옅은 격자
  ctx.fillStyle = '#eceef6';
  ctx.fillRect(c0 * CC, r0 * CC, (c1 - c0 + 1) * CC, (r1 - r0 + 1) * CC);
  ctx.fillStyle = 'rgba(120,130,170,0.12)';
  for (let col = c0; col <= c1; col++) ctx.fillRect(col * CC, r0 * CC, 1, (r1 - r0 + 1) * CC);
  for (let r = r0; r <= r1; r++) ctx.fillRect(c0 * CC, r * CC, (c1 - c0 + 1) * CC, 1);

  // 땅과 선 (물감 느낌)
  paintLand(ctx, c, c0, c1, r0, r1, v.time);
  // 악마 선: 지나간 칸을 이어 굵은 물감 선
  for (const p of c.players) {
    if (p.id === KID || !p.alive || p.trail.length === 0) continue;
    paintStroke(ctx, p.trail.map((i) => ({ x: (i % c.cols + 0.5) * CC, y: (Math.floor(i / c.cols) + 0.5) * CC })), c.headX(p), c.headY(p), PLAYER_COLORS[p.id % PLAYER_COLORS.length]);
  }
  // 꼬마 선: 지나간 자리를 따라 부드러운 물감 선
  if (c.kidPath.length > 0) paintStroke(ctx, c.kidPath, c.kidX, c.kidY, PLAYER_COLORS[KID]);
  // 물감 방울
  paintFx(ctx, c, v.time);

  // 악마
  for (const p of c.players) {
    if (p.id === KID || !p.alive) continue;
    const x = c.headX(p), y = c.headY(p);
    if (x < c.camX - 40 || x > c.camX + World.Width + 40 || y < c.camY - 40 || y > c.camY + World.Height + 40) continue;
    drawClaimDevil(ctx, c, p, v.time);
  }
  // 꼬마 (칸 가운데에 발). 맞으면 깜빡임
  if (c.hurtTimer <= 0 || Math.floor(v.time * 12) % 2 === 0) {
    const pl = game.player;
    const kh = 60, kw = kh * (Characters.CellW / Characters.CellH);
    const fx = c.kidX, fy = c.kidY + CC * 0.45;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(fx, fy, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
    drawCharacter(ctx, pl.character, pl.frame(), pl.facingLeft, new Rect(fx - kw / 2, fy - kh + 4, kw, kh));
  }
  ctx.restore();

  // 차지한 비율 막대 (맨 위), 목표 표시
  const pct = c.percent;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, World.Width, 8);
  ctx.fillStyle = PLAYER_COLORS[KID];
  ctx.fillRect(0, 0, World.Width * Math.min(1, pct), 8);
  ctx.fillStyle = WHITE;
  ctx.fillRect(World.Width * GOAL - 1, 0, 2, 12);

  // 작은 지도 (오른쪽 위)
  const mw = 84, ms = mw / c.mapW, mh = c.mapH * ms, mx = World.Width - mw - 8, my0 = 16;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(mx - 3, my0 - 3, mw + 6, mh + 6);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(claimMiniCanvas(c), mx, my0, mw, mh);
  ctx.restore();
  ctx.strokeStyle = 'rgba(20,20,30,0.85)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + c.camX * ms, my0 + c.camY * ms, World.Width * ms, World.Height * ms);
  for (const p of c.players) {
    if (!p.alive) continue;
    ctx.fillStyle = p.id === KID ? (Math.floor(v.time * 4) % 2 ? '#ffffff' : '#1a1a2a') : shade(PLAYER_COLORS[p.id % PLAYER_COLORS.length], -0.4);
    ctx.fillRect(mx + c.headX(p) * ms - 2, my0 + c.headY(p) * ms - 2, 4, 4);
  }

  const my = World.Height * 0.4;
  if (c.clearTimer > 0) {
    text(ctx, 'STAGE CLEAR!', World.Width / 2, my, 32, ITEM_COLOR, { bold: true });
    text(ctx, '다음 스테이지는 악마가 하나 더', World.Width / 2, my + 40, 16, '#2a2a3a', { bold: true });
  } else if (c.stage === 1 && c.stageTime < 5 && v.overlay === 'none') {
    ctx.fillStyle = 'rgba(10,12,24,0.6)';
    ctx.fillRect(20, my - 26, World.Width - 40, 100);
    text(ctx, '끌어서 걷고, 선으로 둘러싸 땅을 차지!', World.Width / 2, my, 19, WHITE, { bold: true });
    text(ctx, '악마 선을 밟으면 악마가, 악마가 내 선을 밟으면 내가 당해요', World.Width / 2, my + 30, 14, '#dcdce6');
    text(ctx, `맵의 ${GOAL * 100}% 를 차지하면 클리어`, World.Width / 2, my + 54, 14, ITEM_COLOR);
  }
}

// 땅따먹기 조이스틱 (화면 픽셀)
function drawClaimJoy(ctx: Ctx, c: Claim): void {
  if (!c.joyFrom) return;
  const f = c.joyFrom, t = c.joyTo;
  const dx = t.x - f.x, dy = t.y - f.y, len = Math.hypot(dx, dy), k = len > 50 ? 50 / len : 1;
  ctx.beginPath();
  ctx.arc(f.x, f.y, 50, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(f.x + dx * k, f.y + dy * k, 20, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
}

function drawClimb(ctx: Ctx, game: Game, v: View): void {
  const c = game.climb!;
  ctx.save();
  ctx.translate(0, -c.viewTop);   // 화면이 꼬마를 따라 위로
  const top = c.viewTop, bottom = c.viewBottom;

  // 높이 눈금: 10칸마다
  for (let r = Math.ceil(-bottom / CELL / 10) * 10; r * CELL <= -top; r += 10) {
    if (r <= 0) continue;
    const y = -r * CELL;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, y - 1, World.Width, 2);
    text(ctx, `${r}칸`, World.Width - 22, y - 10, 12, 'rgba(255,255,255,0.45)', { bold: true });
  }

  // 바닥
  if (bottom > 0) { ctx.fillStyle = '#3a3346'; ctx.fillRect(0, 0, World.Width, bottom); }

  // 쌓인 블록 (화면에 보이는 줄만)
  const r0 = Math.max(0, Math.floor(-bottom / CELL)), r1 = Math.min(c.grid.length - 1, Math.ceil(-top / CELL));
  for (let r = r0; r <= r1; r++) {
    for (let col = 0; col < c.grid[r].length; col++) {
      const k = c.grid[r][col];
      if (k >= 0) drawBlock(ctx, c.cellRect(col, r), PIECE_COLORS[k]);
    }
  }
  // 떨어지기 전 경고: 떨어질 칸들에 빨간 띠가 깜빡이고, 떨어질 자리에 빨간 테두리 그림자
  for (const p of c.pieces) {
    if (p.warn <= 0) continue;
    const lr = c.landRow(p);
    const blink = 0.5 + 0.5 * Math.sin(v.time * 22);
    const cols = new Map<number, number>();   // 칸 → 그 칸에서 가장 아래 셀의 윗면
    for (const [cx, cy] of p.cells) {
      const cr = c.cellRect(p.col + cx, lr - cy);
      cols.set(p.col + cx, Math.max(cols.get(p.col + cx) ?? -Infinity, cr.y));
    }
    for (const [col, yBottom] of cols) {
      const g = ctx.createLinearGradient(0, top, 0, yBottom);
      g.addColorStop(0, `rgba(255,60,60,${0.35 + 0.25 * blink})`);
      g.addColorStop(1, 'rgba(255,60,60,0.06)');
      ctx.fillStyle = g;
      ctx.fillRect(col * CELL + 2, top, CELL - 4, yBottom - top);
    }
    for (const [cx, cy] of p.cells) {
      const r = c.cellRect(p.col + cx, lr - cy);
      drawBlock(ctx, r, PIECE_COLORS[p.color], 0.25);
      ctx.strokeStyle = `rgba(255,70,70,${0.6 + 0.4 * blink})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    }
    const mid = [...cols.keys()].reduce((a, b) => a + b, 0) / cols.size;
    text(ctx, '!', (mid + 0.5) * CELL, top + 22, 26, `rgba(255,90,90,${0.6 + 0.4 * blink})`, { bold: true });
  }
  // 떨어지는 블록과 그 그림자
  for (const p of c.pieces) {
    if (p.warn > 0) continue;
    const lr = c.landRow(p);
    for (const [cx, cy] of p.cells) drawBlock(ctx, c.cellRect(p.col + cx, lr - cy), PIECE_COLORS[p.color], 0.2);
    for (const [cx, cy] of p.cells) drawBlock(ctx, c.cellAt(p, cx, cy), PIECE_COLORS[p.color]);
  }

  // 꼬마: 판정 상자 아랫면에 맞춰 그림
  const p = game.player;
  const h = CELL * 1.05, w = h * (Characters.CellW / Characters.CellH);   // 한 칸 크기
  const shake = c.pushed > 0 ? Math.sin(v.time * 80) * 3 : 0;   // 블록에 밀려난 직후 흔들림
  drawCharacter(ctx, p.character, p.frame(), p.facingLeft, new Rect(c.x + KID_W / 2 - w / 2 + shake, c.y + KID_H - h + 2, w, h));

  // 용암: 윗면이 출렁이고 위로 붉은 빛
  const ly = c.lavaY;
  if (ly < bottom + 40) {
    const glow = ctx.createLinearGradient(0, ly - 70, 0, ly);
    glow.addColorStop(0, 'rgba(255,80,20,0)');
    glow.addColorStop(1, 'rgba(255,80,20,0.35)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, ly - 70, World.Width, 70);
    const lava = ctx.createLinearGradient(0, ly, 0, ly + 120);
    lava.addColorStop(0, '#ffb020');
    lava.addColorStop(0.25, '#ff5a10');
    lava.addColorStop(1, '#a01808');
    ctx.fillStyle = lava;
    ctx.beginPath();
    ctx.moveTo(0, bottom + 10);
    for (let x = 0; x <= World.Width; x += 12) ctx.lineTo(x, ly + Math.sin(x / 38 + v.time * 3) * 4 + Math.sin(x / 17 - v.time * 2) * 2);
    ctx.lineTo(World.Width, bottom + 10);
    ctx.closePath();
    ctx.fill();
    // 거품
    ctx.fillStyle = 'rgba(255,230,120,0.75)';
    for (let i = 0; i < 7; i++) {
      const bx = ((i * 73 + v.time * 20 * (i % 2 ? 1 : -1)) % World.Width + World.Width) % World.Width;
      const by = ly + 14 + ((i * 29) % 40) - ((v.time * 18 + i * 11) % 30);
      ctx.beginPath();
      ctx.arc(bx, Math.max(ly + 4, by), 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // 용암까지 거리 경고
  const gap = (ly - (c.y + KID_H)) / CELL;
  if (c.time > LAVA_DELAY && gap < 3) {
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(v.time * 12);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(World.Width / 2 - 90, World.Height * 0.18 - 16, 180, 32);
    text(ctx, '용암이 가까워요!', World.Width / 2, World.Height * 0.18, 18, '#ffb040', { bold: true });
    ctx.globalAlpha = 1;
  }

  const my = World.Height * 0.32;
  if (c.time < 4) {
    text(ctx, '블록을 밟고 위로! 용암이 차올라요', World.Width / 2, my, 19, WHITE, { bold: true });
    text(ctx, '꼬마는 혼자 달려요. 누르면 점프, 공중에서 한 번 더', World.Width / 2, my + 32, 15, '#dcdce6');
    text(ctx, '빨간 경고가 뜬 줄에는 블록이 떨어져요', World.Width / 2, my + 56, 15, '#ffb0b0');
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

  drawSkillCards(ctx, a);
}

// 레벨업: 스킬 카드 3장 (궁수·꼬마 공통)
interface SkillPicker {
  choosing: SkillId[] | null; level: number; skills: Partial<Record<SkillId, number>>;
  cardRect(i: number): { x: number; y: number; w: number; h: number };
}
function drawSkillCards(ctx: Ctx, a: SkillPicker, info_: (id: SkillId) => { name: string; desc: string } = (id) => SKILLS[id]): void {
  if (!a.choosing) return;
  ctx.fillStyle = 'rgba(8,10,16,0.75)';
  ctx.fillRect(0, 0, World.Width, World.Height);
  text(ctx, `레벨 업! Lv ${a.level}`, World.Width / 2, World.Height * 0.32 - 50, 28, ITEM_COLOR, { bold: true });
  text(ctx, '스킬을 하나 고르세요', World.Width / 2, World.Height * 0.32 - 18, 15, '#dcdce6');
  a.choosing.forEach((id, i) => {
    const c = a.cardRect(i);
    const r = new Rect(c.x, c.y, c.w, c.h);
    const info = info_(id);
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

// ---------- 꼬마 괴물 모드 ----------
function drawMonster(ctx: Ctx, m: Monster, kx: number, ky: number, t: number): void {
  const { x, y } = m.pos, r = m.r;
  const white = m.flash > 0;
  ctx.save();
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.85, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  const eyes = (ex: number, ey: number, gap: number, er: number) => {
    const dx = kx - x, dy = ky - y, d = Math.hypot(dx, dy) || 1;
    for (const s of [-1, 1]) {
      ctx.fillStyle = WHITE;
      ctx.beginPath(); ctx.arc(ex + s * gap, ey, er, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1020';
      ctx.beginPath(); ctx.arc(ex + s * gap + dx / d * er * 0.4, ey + dy / d * er * 0.4, er * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  };
  if (m.kind === 'slime') {
    const sq = 1 + Math.sin(t * 8 + m.phase) * 0.08;
    ctx.fillStyle = white ? WHITE : '#5ad66a';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.2, r * sq, r * 0.85 / sq, 0, Math.PI, 0);
    ctx.lineTo(x + r * sq, y + r * 0.6);
    ctx.lineTo(x - r * sq, y + r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(x - r * 0.4, y - r * 0.25, r * 0.18, 0, Math.PI * 2); ctx.fill();
    if (!white) eyes(x, y, r * 0.32, r * 0.22);
  } else if (m.kind === 'bat') {
    const flap = Math.sin(t * 18 + m.phase) * 0.6;
    ctx.fillStyle = white ? WHITE : '#9a5ae0';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * r * 0.4, y);
      ctx.lineTo(x + s * r * 1.9, y - r * (0.6 + flap));
      ctx.lineTo(x + s * r * 1.5, y + r * 0.3);
      ctx.lineTo(x + s * r * 1.1, y + r * 0.1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = white ? WHITE : '#6a32b0';
    ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0, Math.PI * 2); ctx.fill();
    if (!white) {
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath(); ctx.arc(x - r * 0.28, y - r * 0.1, r * 0.17, 0, Math.PI * 2); ctx.arc(x + r * 0.28, y - r * 0.1, r * 0.17, 0, Math.PI * 2); ctx.fill();
    }
  } else if (m.kind === 'eye') {
    ctx.fillStyle = white ? WHITE : '#7a2a8a';
    ctx.beginPath(); ctx.arc(x, y, r * 1.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.fill();
    const dx = kx - x, dy = ky - y, d = Math.hypot(dx, dy) || 1;
    const charge = Math.max(0, 1 - m.fireTimer / 0.6);   // 쏘기 직전에 빨갛게
    ctx.fillStyle = charge > 0 ? `rgb(${200 + 55 * charge},${60 - 40 * charge},40)` : '#d23c3c';
    ctx.beginPath(); ctx.arc(x + dx / d * r * 0.3, y + dy / d * r * 0.3, r * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1020';
    ctx.beginPath(); ctx.arc(x + dx / d * r * 0.38, y + dy / d * r * 0.38, r * 0.2, 0, Math.PI * 2); ctx.fill();
  } else {
    // 덩치: 뿔 달린 큰 몸
    ctx.fillStyle = white ? WHITE : '#c0392b';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * r * 0.35, y - r * 0.7);
      ctx.lineTo(x + s * r * 0.75, y - r * 1.25);
      ctx.lineTo(x + s * r * 0.8, y - r * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    roundRect(ctx, new Rect(x - r, y - r * 0.8, r * 2, r * 1.7), r * 0.6);
    ctx.fillStyle = white ? WHITE : '#d24a3a';
    ctx.fill();
    if (!white) {
      eyes(x, y - r * 0.2, r * 0.32, r * 0.2);
      ctx.fillStyle = '#5a1010';
      ctx.fillRect(x - r * 0.4, y + r * 0.3, r * 0.8, r * 0.14);
    }
  }
  // 다친 괴물은 체력 막대
  if (m.hp < m.maxHp && m.maxHp >= 3) {
    const w = Math.max(24, r * 1.8), bx = x - w / 2, by = y - r - (m.kind === 'brute' ? 22 : 10);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 1, by - 1, w + 2, 6);
    ctx.fillStyle = '#ff5a5a';
    ctx.fillRect(bx, by, w * Math.max(0, m.hp / m.maxHp), 4);
  }
  ctx.restore();
}

function drawHorde(ctx: Ctx, game: Game, v: View): void {
  const h = game.horde!;
  const t = v.time;

  // 블록 뭉치: 아래쪽 옆면을 그려 떠 있는 느낌. 금이 갈수록 어둡고 갈라짐
  const TILE_TOP = '#c9a46a', TILE_SIDE = '#7a5a34';
  // 블록 바깥은 낭떠러지: 배경을 어둡게 하고 블록 아래에 그림자
  ctx.fillStyle = 'rgba(5,6,12,0.45)';
  ctx.fillRect(0, 0, World.Width, World.Height);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < h.tiles.length; i++) {
    if (h.tiles[i] <= 0) continue;
    const r = h.tileRect(i);
    ctx.fillRect(r.x + 6, r.y + 18, r.w, r.h);
  }
  for (let i = 0; i < h.tiles.length; i++) {
    if (h.tiles[i] <= 0) continue;
    const r = h.tileRect(i);
    const below = h.tileAt(r.centerX, r.bottom + 2);
    if (below < 0 || h.tiles[below] <= 0) { ctx.fillStyle = TILE_SIDE; ctx.fillRect(r.x, r.bottom, r.w, 10); }
  }
  for (let i = 0; i < h.tiles.length; i++) {
    const hp = h.tiles[i];
    if (hp <= 0) continue;
    const r = h.tileRect(i);
    const k = hp / TILE_HP;
    ctx.fillStyle = h.tileFlash[i] > 0 ? '#ffffff' : TILE_TOP;
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 4);
    if (k < 1) {   // 금 간 정도
      ctx.fillStyle = `rgba(60,20,10,${(1 - k) * 0.55})`;
      ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.strokeStyle = 'rgba(40,20,10,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.x + r.w * 0.2, r.y + r.h * 0.3);
      ctx.lineTo(r.x + r.w * 0.5, r.y + r.h * 0.5);
      if (k < 0.66) ctx.lineTo(r.x + r.w * 0.4, r.y + r.h * 0.85);
      if (k < 0.33) { ctx.moveTo(r.x + r.w * 0.5, r.y + r.h * 0.5); ctx.lineTo(r.x + r.w * 0.85, r.y + r.h * 0.35); }
      ctx.stroke();
    }
  }

  // 괴물 탄
  for (const b of h.bullets) {
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff5a5a';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#2a0a0a';
    ctx.stroke();
  }

  // 꼬마 (발 위치 기준). 떨어질 때는 작아지며 사라짐
  const p = game.player;
  const fall = h.falling > 0 ? h.falling / 0.8 : 1;
  ctx.save();
  ctx.globalAlpha = fall;
  if (h.falling <= 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, 17, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const w = KID_DRAW_W * fall, kh = KID_DRAW_H * fall;
  drawCharacter(ctx, p.character, p.frame(), p.facingLeft, new Rect(h.x - w / 2, h.y - kh + 4 * fall + (1 - fall) * 30, w, kh));
  ctx.restore();

  // 괴물 (위쪽 것부터)
  const ms = [...h.monsters].sort((a, b) => a.pos.y - b.pos.y);
  for (const m of ms) drawMonster(ctx, m, h.x, h.y - KID_DRAW_H * 0.4, t);

  // 꼬마가 던진 공
  for (const s of h.shots) {
    ctx.fillStyle = 'rgba(255,240,150,0.35)';
    ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, SHOT_R + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff8d0';
    ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, SHOT_R, 0, Math.PI * 2); ctx.fill();
  }

  // 경험치 막대
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, World.Width, 6);
  ctx.fillStyle = '#4ddc7a';
  ctx.fillRect(0, 0, World.Width * Math.min(1, h.xp / h.xpNeed), 6);

  if (h.falling > 0) {
    text(ctx, '으악, 떨어졌어요!', World.Width / 2, h.boardTop - 40, 24, '#ff9a9a', { bold: true });
  } else if (h.time < 4) {
    const my = h.boardTop - 70;
    text(ctx, '괴물이 블록을 갉아먹어요!', World.Width / 2, my, 20, WHITE, { bold: true });
    text(ctx, '끌어서 움직이고, 공은 자동으로 던져요', World.Width / 2, my + 28, 15, '#dcdce6');
    text(ctx, '서 있는 블록이 부서지면 떨어져요', World.Width / 2, my + 50, 15, ITEM_COLOR);
  }
  drawSkillCards(ctx, h, hordeSkill);
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

// 엘프 모드 벽돌 색: 화면에서 숫자가 클수록 초록 → 노랑 → 주황 (빨강은 마지막 줄 표시용으로 남겨 둠)
function hpColor(hp: number, maxHp: number): string {
  const t = maxHp <= 1 ? 0 : Math.min(1, (hp - 1) / (maxHp - 1));
  return `hsl(${Math.round(135 - t * 105)}, 62%, 56%)`;
}

// 엘프 모드: 룬 돌을 마법 화살로 깨는 모습
const ELF_GREEN = '#7dffb0';
function drawSwipe(ctx: Ctx, game: Game, v: View): void {
  const s = game.swipe!;
  const floor = game.paddle.y + game.paddle.h;

  // 바닥: 풀 덩굴 선 (화살이 돌아오는 곳)
  ctx.fillStyle = 'rgba(60,170,90,0.8)';
  ctx.fillRect(0, floor, World.Width, 3);
  ctx.fillStyle = 'rgba(120,230,140,0.85)';
  for (let x = 6; x < World.Width; x += 18) {
    ctx.beginPath();
    ctx.ellipse(x, floor - 1, 5, 2.2, (x % 36 === 6 ? -0.6 : 0.6), 0, Math.PI * 2);
    ctx.fill();
  }

  const p = game.player;
  drawCharacter(ctx, p.character, p.frame(), p.facingLeft, p.bounds());

  // 룬 돌: 어두운 돌에 숫자가 빛남. 숫자가 클수록 초록 → 노랑 → 주황, 마지막 줄은 빨강
  const maxHp = s.bricks.reduce((m, k) => Math.max(m, k.hp), 1);
  const blink = 0.5 + 0.5 * Math.sin(v.time * 8);
  for (const k of s.bricks) {
    const r = s.drawRect(k.col, k.row);
    const last = k.row >= s.lastRow;
    const glow = last ? '#ff4d4d' : hpColor(k.hp, maxHp);
    // 돌 몸통 (모서리를 깎은 팔각형 느낌)
    const cut = 7;
    ctx.beginPath();
    ctx.moveTo(r.x + cut, r.y); ctx.lineTo(r.right - cut, r.y); ctx.lineTo(r.right, r.y + cut);
    ctx.lineTo(r.right, r.bottom - cut); ctx.lineTo(r.right - cut, r.bottom); ctx.lineTo(r.x + cut, r.bottom);
    ctx.lineTo(r.x, r.bottom - cut); ctx.lineTo(r.x, r.y + cut); ctx.closePath();
    const g = ctx.createLinearGradient(0, r.y, 0, r.bottom);
    g.addColorStop(0, last ? '#5a2026' : '#3a4058');
    g.addColorStop(1, last ? '#2e0e12' : '#1e2234');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = glow;
    ctx.stroke();
    // 다음 차례에 끝나는 돌: 테두리가 깜빡임
    if (s.phase === 'aim' && s.inDanger(k)) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgba(255,60,60,${0.4 + 0.6 * blink})`;
      ctx.stroke();
    }
    // +1 돌: 오른쪽 위 초록 보석
    if (k.bonus) {
      const gx = r.right - 9, gy = r.y + 9;
      ctx.fillStyle = '#3ddc84';
      ctx.beginPath(); ctx.moveTo(gx, gy - 7); ctx.lineTo(gx + 6, gy); ctx.lineTo(gx, gy + 7); ctx.lineTo(gx - 6, gy); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#d8ffe8'; ctx.stroke();
      text(ctx, '+1', r.x + 13, r.y + 9, 10, '#9dffc8', { bold: true });
    }
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 8;
    text(ctx, String(k.hp), r.centerX, r.centerY + 2, k.hp >= 100 ? 15 : 18, glow, { bold: true });
    ctx.restore();
  }

  // 마법 화살: 날아가는 방향으로 빛나는 꼬리
  ctx.lineCap = 'round';
  for (const b of s.balls) {
    const cx = b.pos.x + b.size / 2, cy = b.pos.y + b.size / 2;
    const l = Math.hypot(b.vel.x, b.vel.y) || 1, ux = b.vel.x / l, uy = b.vel.y / l;
    ctx.strokeStyle = 'rgba(125,255,176,0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(cx - ux * 18, cy - uy * 18); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.strokeStyle = ELF_GREEN;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx - ux * 12, cy - uy * 12); ctx.lineTo(cx + ux * 4, cy + uy * 4); ctx.stroke();
    ctx.fillStyle = '#eafff2';
    ctx.beginPath(); ctx.arc(cx + ux * 4, cy + uy * 4, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  drawDevil(ctx, game);   // 돌 위에 그려서 가림

  // 조준선: 반짝이는 점들이 두 번째로 부딪치는 곳까지, 끝에 화살촉
  const dir = s.aimDir();
  if (dir) {
    const pts = s.previewPath(dir);
    ctx.fillStyle = ELF_GREEN;
    let carry = (v.time * 60) % 14;   // 점이 앞으로 흘러가 보이게
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], q = pts[i + 1];
      const len = Math.hypot(q.x - a.x, q.y - a.y);
      for (let d = carry; d < len; d += 14) {
        const t = d / len;
        ctx.beginPath(); ctx.arc(a.x + (q.x - a.x) * t, a.y + (q.y - a.y) * t, 2.4, 0, Math.PI * 2); ctx.fill();
      }
      carry = (carry - len % 14 + 14) % 14;
    }
    const end = pts[pts.length - 1], prev = pts[pts.length - 2] ?? pts[0];
    const ang = Math.atan2(end.y - prev.y, end.x - prev.x);
    ctx.save();
    ctx.translate(end.x, end.y);
    ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 쏠 자리에 빛나는 화살 구슬과 남은 수
  if (s.phase !== 'shoot' || s.toLaunch > 0) {
    const lp = s.launchPos;
    const pulse = 1 + 0.15 * Math.sin(v.time * 6);
    const og = ctx.createRadialGradient(lp.x, lp.y, 1, lp.x, lp.y, 12 * pulse);
    og.addColorStop(0, '#eafff2');
    og.addColorStop(0.4, ELF_GREEN);
    og.addColorStop(1, 'rgba(125,255,176,0)');
    ctx.fillStyle = og;
    ctx.beginPath(); ctx.arc(lp.x, lp.y, 12 * pulse, 0, Math.PI * 2); ctx.fill();
    const n = s.phase === 'shoot' ? s.toLaunch : s.ballCount;
    const tx = lp.x + 30 > World.Width - 14 ? lp.x - 30 : lp.x + 30;
    text(ctx, `${n}발`, tx, lp.y, 15, ELF_GREEN, { bold: true });
  }

  if (s.round === 1 && s.phase === 'aim' && !s.aiming) {
    const my = World.Height * 0.55;
    text(ctx, '위쪽을 누른 채 아래로 당겨 조준', World.Width / 2, my, 20, WHITE, { bold: true });
    text(ctx, '손을 떼면 화살 발사! 풀밭 아래를 밀면 자리 이동', World.Width / 2, my + 32, 16, '#dcdce6');
  }
}

function drawPlaying(ctx: Ctx, game: Game, v: View): void {
  if (game.climb) { drawClimb(ctx, game, v); return; }
  if (game.claim) { drawClaim(ctx, game, v); return; }
  if (game.horde) { drawHorde(ctx, game, v); return; }
  if (game.archer) { drawArcher(ctx, game, v); return; }
  if (game.swipe) { drawSwipe(ctx, game, v); return; }
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
    const rr = new Rect(b.centerX - b.w * s / 2, b.centerY - b.h * s / 2, b.w * s, b.h * s);
    drawGlassBrick(ctx, rr, k.item ? 'gold' : GLASS_COLORS[k.row % GLASS_COLORS.length], k.item, (1 - r) * 0.7, k.row * 7 + Math.round(k.rect.x));
  }

  drawItems(ctx, game);

  const pad = game.paddle.bounds();
  pad.y += game.stompDip();
  drawHolyBarrier(ctx, pad, v.time);
  for (const b of game.balls) drawLightOrb(ctx, b.bounds(), b.kind, v.time);
  drawDevil(ctx, game);   // 공과 패들보다 나중에 그려서 공을 가림

  const my = World.Height * 0.5;   // 안내 문구는 세계 높이의 가운데쯤
  if (game.serving && game.mode === 'survival') {
    text(ctx, '준비!', World.Width / 2, my, 34, ITEM_COLOR, { bold: true });
    text(ctx, '3초마다 색유리가 한 줄씩 내려와요', World.Width / 2, my + 50, 16, '#dcdce6');
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
    // 축복(좋은 것)은 금빛 두루마리, 저주(나쁜 것)는 보랏빛 두루마리
    roundRect(ctx, new Rect(r.x - 2, r.y - 2, r.w + 4, r.h + 4), 6);
    ctx.fillStyle = info.good ? 'rgba(255,220,120,0.45)' : 'rgba(150,60,200,0.45)';
    ctx.fill();
    roundRect(ctx, r, 5);
    const g = ctx.createLinearGradient(0, r.y, 0, r.bottom);
    g.addColorStop(0, info.good ? '#fff4d0' : '#5a2a78');
    g.addColorStop(1, info.good ? '#e8c46a' : '#2e1240');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = info.good ? '#a87a20' : '#c890ff';
    ctx.stroke();
    text(ctx, info.label, r.centerX, r.centerY + 1, 13, info.good ? '#5a3a00' : '#f0dcff', { bold: true });
  }
}

// ---------- 성녀 모드 그림 ----------
// 스테인드글라스 색 (줄마다)
const GLASS_COLORS = ['#d23c5a', '#3a6ee0', '#2fae7a', '#9a4fd8', '#e08a2a'];

// 벽돌: 납 테두리 안에 색유리 조각, 위쪽에 빛 반사. 노란(아이템) 벽돌은 금빛 유리에 십자 별
function drawGlassBrick(ctx: Ctx, r: Rect, color: string, item: boolean, fade: number, seed: number): void {
  const base = item ? '#f2c94c' : color;
  ctx.fillStyle = '#231a2e';                               // 납 테두리
  ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
  const g = ctx.createLinearGradient(r.x, r.y, r.right, r.bottom);
  g.addColorStop(0, shade(base, 0.25));
  g.addColorStop(1, shade(base, -0.25));
  ctx.fillStyle = g;
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  if (fade > 0) { ctx.fillStyle = `rgba(255,255,255,${fade})`; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); }   // 나타나는 중엔 하얗게
  // 유리 조각 나누는 납 줄 (벽돌마다 조금 다르게)
  ctx.strokeStyle = 'rgba(35,26,46,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const k = (seed % 3) / 3;
  ctx.moveTo(r.x + r.w * (0.25 + k * 0.2), r.y + 1);
  ctx.lineTo(r.x + r.w * (0.45 + k * 0.1), r.bottom - 1);
  ctx.moveTo(r.x + r.w * (0.65 + k * 0.1), r.y + 1);
  ctx.lineTo(r.x + r.w * (0.8 - k * 0.1), r.bottom - 1);
  ctx.stroke();
  // 빛 반사
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, 3);
  if (item) {   // 십자 별
    const cx = r.centerX, cy = r.centerY;
    ctx.fillStyle = '#fffbe8';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 2, cy - 2); ctx.lineTo(cx + 7, cy); ctx.lineTo(cx + 2, cy + 2);
    ctx.lineTo(cx, cy + 7); ctx.lineTo(cx - 2, cy + 2); ctx.lineTo(cx - 7, cy); ctx.lineTo(cx - 2, cy - 2); ctx.closePath();
    ctx.fill();
  }
}

// 공: 빛 구슬. 하양은 금빛, 빠른 빨강은 장밋빛 불꽃, 느린 초록은 박하빛
const ORB_COLORS: Record<string, [string, string]> = { white: ['#fffbe6', '#ffd75a'], red: ['#ffe4e8', '#ff5a7a'], green: ['#eafff4', '#5ae0a0'] };
function drawLightOrb(ctx: Ctx, r: Rect, kind: string, t: number): void {
  const [inner, outer] = ORB_COLORS[kind] ?? ORB_COLORS.white;
  const cx = r.centerX, cy = r.centerY, R = r.w * 0.6;
  const glowR = R * (2.4 + 0.2 * Math.sin(t * 9 + cx));
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  g.addColorStop(0, outer + 'aa');
  g.addColorStop(1, outer + '00');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2); ctx.fill();
  const c = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R);
  c.addColorStop(0, '#ffffff');
  c.addColorStop(0.5, inner);
  c.addColorStop(1, outer);
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
}

// 패들: 빛의 방벽. 금빛 막대 위로 은은한 빛, 가운데 십자
function drawHolyBarrier(ctx: Ctx, r: Rect, t: number): void {
  const glow = ctx.createLinearGradient(0, r.y - 16, 0, r.y);
  glow.addColorStop(0, 'rgba(255,230,140,0)');
  glow.addColorStop(1, `rgba(255,230,140,${0.35 + 0.1 * Math.sin(t * 3)})`);
  ctx.fillStyle = glow;
  ctx.fillRect(r.x + 4, r.y - 16, r.w - 8, 16);
  roundRect(ctx, new Rect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3), (r.h + 3) / 2);
  ctx.fillStyle = '#5a3a10';
  ctx.fill();
  roundRect(ctx, r, r.h / 2);
  const g = ctx.createLinearGradient(0, r.y, 0, r.bottom);
  g.addColorStop(0, '#fff6cf');
  g.addColorStop(0.5, '#f2c94c');
  g.addColorStop(1, '#b8892a');
  ctx.fillStyle = g;
  ctx.fill();
  const cx = r.centerX, cy = r.centerY;
  ctx.fillStyle = '#fffbe8';
  ctx.fillRect(cx - 1.5, cy - r.h * 0.35, 3, r.h * 0.7);
  ctx.fillRect(cx - 5, cy - 1.5, 10, 3);
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

  text(ctx, '레트로 오락실', World.Width / 2, 60, 38, WHITE, { bold: true });
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
    button(ctx, UI.howTo, '게임 방법', false, 17);
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

  // 메뉴: 설정 버튼 (톱니바퀴)
  if (!playing) {
    const g = l.soundBtn;
    iconBtn(g);
    const gx = g.centerX, gy = g.centerY;
    ctx.fillStyle = WHITE;
    for (let k = 0; k < 8; k++) {
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate((k * Math.PI) / 4);
      ctx.fillRect(-2.5, -11, 5, 6);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(gx, gy, 7.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(20,22,34,1)';
    ctx.beginPath(); ctx.arc(gx, gy, 3.2, 0, Math.PI * 2); ctx.fill();
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
    const sub = game.claim ? `${Math.floor(game.claim.percent * 100)}%/${GOAL * 100}% · ${'♥'.repeat(Math.max(0, game.claim.lives))} · 처치 ${game.claim.kills}`
      : game.horde ? `처치 ${game.horde.kills} · 블록 ${game.horde.tilesLeft}개${best > 0 ? ` · 최고 ${formatRecord(mode, best)}` : ''}`
      : game.climb ? `높이 ${game.climb.best}칸${best > 0 ? ` · 최고 ${formatRecord(mode, best)}` : ''}`
      : mode === 'mine' ? `체력 ${game.hearts}/3 · 지뢰 ${game.minesLeft}`
      : sw ? `화살 ${sw.ballCount}발 · 다음 ${sw.nextRows}줄 내려옴`
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
    const hint = game.claim ? '화면 어디든 누른 채 끌어서 걷기'
      : game.horde ? '화면 어디든 끌어서 이동'
      : game.climb ? '화면 어디든 누르면 점프 · 길게 누르면 높이'
      : game.archer ? '화면 어디든 끌어서 이동, 멈추면 자동 발사'
      : game.swipe ? '◀   풀밭 아래를 밀어 쏠 자리 옮기기   ▶' : '◀   여기를 좌우로 밀어 빛의 방벽 이동   ▶';
    text(ctx, hint, l.w / 2, y, 14, WHITE);
    ctx.globalAlpha = 1;
  }

  // 엘프 모드 조이스틱: 누른 곳에 큰 원, 끈 쪽에 작은 원 (화면 픽셀)
  if (game.claim && v.overlay === 'none') drawClaimJoy(ctx, game.claim);
  const ja = game.archer ?? game.horde;
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
