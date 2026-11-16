// 캔버스 그리기. 게임 상태를 읽기만 한다
import { ATTACK_FRAMES, characterAttackCell, images } from './assets';
import { GRAY, ITEM_COLOR, WHITE, button, drawCharacter, font, roundRect, text, wrapText, type Ctx } from './gfx';
import type { Game } from './game/game';
import { Rect } from './game/geometry';
import { Characters, Devil, DevilSprite, Games, ITEM_INFO, World, menuTop, type GameMode } from './game/objects';
import { SKILLS, type SkillId } from './game/archer';
import { KID_DRAW_H, KID_DRAW_W, SHOT_R, TILE_HP, hordeSkill, type Monster } from './game/horde';
import { CELL, KID_H, KID_W, LAVA_DELAY, PIECE_COLORS } from './game/climb';
import { CC, GOAL, KID, PLAYER_COLORS, type Claim, type Player } from './game/claim';
import { KNIGHT_SWING, raidSkillInfo, type RaidMonster } from './game/raid';
import { MINI_DRAW } from './draw/minis';
import { arcadeFloorY, drawArcadeHome, type ArcadeScreen } from './draw/arcade';
import { drawArrowFx, drawGlassBrickArt, drawOrbFx, drawRuneStoneArt, drawSparkleFx, drawSprite, groundPattern } from './draw/art';

const ARROW_SPEED_DRAW = 720;   // 화살 꼬리 길이 계산용 (archer.ts 의 화살 빠르기)
import { TOSS_BUTTONS_W, type Layout, HUD_H } from './layout';
import { UI, type Overlay } from './ui';


const WALL_COLOR = '#7c8190';       // 회색 벽 (안 깨짐)
const WALL_LIGHT = '#a9aebb';
const WALL_DARK = '#3c404c';

export interface View {
  overlay: Overlay;
  muted: boolean;
  rankingVisible: boolean;
  elfSaveRound: number;  // 룬 돌 깨기 중간 저장 라운드 (없으면 0)
  time: number;          // 화면 연출용 시계 (초)
  coins: number;         // 가진 코인
  adOffer: number;       // 판이 끝난 뒤 광고로 더 받을 수 있는 코인 (0 이면 버튼 없음)
  adReady: boolean;      // 광고를 바로 보여 줄 수 있는지
}



function mix(hex: string, t: number): string {
  // 색을 흰색 쪽으로 t 만큼 섞음 (벽돌이 나타날 때 반짝임)
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// 배경: 화면 전체에 꽉 차게 (비율 유지), 게임 영역 바깥은 어둡게. 한 장으로 미리 그려 둠
// opaque: 게임이 영역을 다 덮는 모드 → 어차피 가려지는 가운데는 건너뛰고 위아래(옆) 띠만 붙임
let bgCv: HTMLCanvasElement | null = null, bgKey = '';
function drawBackground(ctx: Ctx, l: Layout, index: number, opaque: boolean): void {
  const img = images.backgrounds[index];
  const W = Math.max(1, Math.round(l.w * l.dpr)), H = Math.max(1, Math.round(l.h * l.dpr));
  const key = `${W}x${H}|${index}|${img ? 1 : 0}|${l.gx.toFixed(1)},${l.gy.toFixed(1)},${l.gw.toFixed(1)},${l.gh.toFixed(1)}`;
  if (!bgCv || bgKey !== key) {
    if (!bgCv || bgCv.width !== W || bgCv.height !== H) { bgCv = document.createElement('canvas'); bgCv.width = W; bgCv.height = H; }
    const g = bgCv.getContext('2d')!;
    g.setTransform(l.dpr, 0, 0, l.dpr, 0, 0);
    g.fillStyle = '#14161f';
    g.fillRect(0, 0, l.w, l.h);
    if (img) {
      const s = Math.max(l.w / img.width, l.h / img.height);
      const dw = img.width * s, dh = img.height * s;
      g.imageSmoothingEnabled = true;
      g.drawImage(img, (l.w - dw) / 2, (l.h - dh) / 2, dw, dh);
    }
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.fillRect(0, 0, l.w, l.gy);
    g.fillRect(0, l.gy + l.gh, l.w, l.h - l.gy - l.gh);
    g.fillRect(0, l.gy, l.gx, l.gh);
    g.fillRect(l.gx + l.gw, l.gy, l.w - l.gx - l.gw, l.gh);
    bgKey = key;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!opaque) ctx.drawImage(bgCv, 0, 0);
  else {
    const d = l.dpr;
    const strip = (x: number, y: number, w: number, h: number) => {
      const sx = Math.floor(x * d), sy = Math.floor(y * d), sw = Math.ceil((x + w) * d) - sx, sh = Math.ceil((y + h) * d) - sy;
      if (sw > 0 && sh > 0) ctx.drawImage(bgCv!, sx, sy, sw, sh, sx, sy, sw, sh);
    };
    strip(0, 0, l.w, l.gy + 1);
    strip(0, l.gy + l.gh - 1, l.w, l.h - l.gy - l.gh + 1);
    if (l.gx > 0.5) { strip(0, l.gy, l.gx + 1, l.gh); strip(l.gx + l.gw - 1, l.gy, l.w - l.gx - l.gw + 1, l.gh); }
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


// 기록 글자: 엘프는 라운드, 꼬마·성녀는 버틴 시간
export function formatRecord(mode: GameMode, v: number): string {
  const unit = Games.List.find((g) => g.mode === mode)?.unit ?? (mode === 'climb' || mode === 'horde' ? 'sec' : 'stage');
  switch (unit) {
    case 'round': return `ROUND ${v}`;
    case 'floor': return `${v}층`;
    case 'meter': return `${v.toLocaleString('ko-KR')}m`;
    case 'cells': return `${v}칸`;
    case 'point': return `${v.toLocaleString('ko-KR')}점`;
    case 'sec':
      if (v < 60) return `${v.toFixed(1)}초`;
      return `${Math.floor(v / 60)}분 ${(v % 60).toFixed(1).padStart(4, '0')}초`;
    default: return `STAGE ${v}`;
  }
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
  const x = c.headX(p), y = c.headY(p), R = 11;   // 화면에서는 확대돼서 20 안팎
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

// 칸마다 정해진 0~1 값 (가장자리 모양이 매 프레임 같게)
function hash01(i: number): number {
  let h = (i * 2654435761) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000;   // ^ 뒤엔 음수가 될 수 있어 부호 없는 수로
}

// 땅: 안쪽 칸은 네모로 채우고, 가장자리 칸은 동그라미로 둥글게. 아래로 살짝 어두운 그림자
function drawLand(ctx: Ctx, c: Claim, c0: number, c1: number, r0: number, r1: number): void {
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
  const rows = (fill: (o: number) => string, dy: number) => {
    for (let r = r0; r <= r1; r++) {
      let s0 = -1, cur = -1;
      for (let col = c0; col <= c1 + 1; col++) {
        const o = col <= c1 ? c.owner[r * C + col] : -1;
        if (o !== cur) {
          if (cur >= 0) { ctx.fillStyle = fill(cur); ctx.fillRect(s0 * CC - 0.5, r * CC - 0.5 + dy, (col - s0) * CC + 1, CC + 1); }   // 살짝 겹쳐 줄 사이 틈이 안 보이게
          cur = o; s0 = col;
        }
      }
    }
  };
  const blobs = (fill: (o: number) => string, dy: number) => {
    for (const i of edges) {
      const col = i % C, r = (i - col) / C, o = c.owner[i], h = hash01(i);
      ctx.fillStyle = fill(o);
      ctx.beginPath(); ctx.arc((col + 0.5) * CC + (h - 0.5) * 2, (r + 0.5) * CC + (hash01(i + 7777) - 0.5) * 2 + dy, CC * (0.76 + h * 0.1), 0, Math.PI * 2); ctx.fill();
    }
  };
  const color = (o: number) => PLAYER_COLORS[o % PLAYER_COLORS.length];
  const dark = (o: number) => shade(PLAYER_COLORS[o % PLAYER_COLORS.length], -0.42);
  rows(dark, 3); blobs(dark, 3);     // 그림자
  rows(color, 0); blobs(color, 0);   // 땅
}

// 선: 어두운 테두리 + 밝은 몸
function landStroke(ctx: Ctx, pts: { x: number; y: number }[], hx: number, hy: number, color: string): void {
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
  path(); ctx.strokeStyle = shade(color, -0.3); ctx.lineWidth = CC * 0.8; ctx.stroke();
  path(); ctx.strokeStyle = shade(color, 0.3); ctx.lineWidth = CC * 0.56; ctx.stroke();
  ctx.restore();
}

function drawOffscreenDevils(ctx: Ctx, c: Claim, t: number): void {
  const z = c.zoom, M = 18, RANGE = CC * 26;   // 26칸 안쪽만 표시
  for (const p of c.players) {
    if (p.id === KID || !p.alive) continue;
    const wx = c.headX(p), wy = c.headY(p);
    const sx = (wx - c.camX) * z, sy = (wy - c.camY) * z;
    if (sx >= -6 && sx <= World.Width + 6 && sy >= -6 && sy <= World.Height + 6) continue;   // 화면 안
    const d = Math.hypot(wx - c.kidX, wy - c.kidY);
    if (d > RANGE) continue;
    const cx = World.Width / 2, cy = World.Height / 2;
    const ang = Math.atan2(sy - cy, sx - cx);
    // 화면 가장자리로 밀어 붙이기
    const ex = Math.max(M, Math.min(World.Width - M, sx)), ey = Math.max(M + 16, Math.min(World.Height - M, sy));
    const near = 1 - d / RANGE;
    const pulse = p.mode === 'hunt' ? 0.75 + 0.25 * Math.sin(t * 12) : 1;
    ctx.save();
    ctx.globalAlpha = (0.35 + 0.6 * near) * pulse;
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    const s = 7 + 5 * near;
    ctx.fillStyle = PLAYER_COLORS[p.id % PLAYER_COLORS.length];
    ctx.strokeStyle = 'rgba(20,20,30,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.8, -s * 0.75);
    ctx.lineTo(-s * 0.4, 0);
    ctx.lineTo(-s * 0.8, s * 0.75);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
}

function drawClaim(ctx: Ctx, game: Game, v: View): void {
  const c = game.claim!;
  const z = c.zoom, vw = c.viewW, vh = c.viewH;
  ctx.save();
  // 가까이서 보기: 확대한 뒤 카메라만큼 옮김 (화면 화소 단위로 반올림해서 떨림 방지)
  ctx.scale(z, z);
  ctx.translate(-Math.round(c.camX * z) / z, -Math.round(c.camY * z) / z);
  const c0 = Math.max(0, Math.floor(c.camX / CC)), c1 = Math.min(c.cols - 1, Math.ceil((c.camX + vw) / CC));
  const r0 = Math.max(0, Math.floor(c.camY / CC)), r1 = Math.min(c.rows - 1, Math.ceil((c.camY + vh) / CC));

  // 빈 땅: 돌바닥 (그림이 아직 없으면 밝은 바탕에 옅은 격자)
  const gp = groundPattern(ctx);
  if (gp) {
    ctx.fillStyle = gp;
    ctx.fillRect(c0 * CC, r0 * CC, (c1 - c0 + 1) * CC, (r1 - r0 + 1) * CC);
  } else {
    ctx.fillStyle = '#eceef6';
    ctx.fillRect(c0 * CC, r0 * CC, (c1 - c0 + 1) * CC, (r1 - r0 + 1) * CC);
    ctx.fillStyle = 'rgba(120,130,170,0.12)';
    const gl = 1 / z;   // 격자선은 화면에서 1화소
    for (let col = c0; col <= c1; col++) ctx.fillRect(col * CC, r0 * CC, gl, (r1 - r0 + 1) * CC);
    for (let r = r0; r <= r1; r++) ctx.fillRect(c0 * CC, r * CC, (c1 - c0 + 1) * CC, gl);
  }

  // 땅과 선
  drawLand(ctx, c, c0, c1, r0, r1);
  for (const p of c.players) {
    if (p.id === KID || !p.alive || p.trail.length === 0) continue;
    landStroke(ctx, p.trail.map((i) => ({ x: (i % c.cols + 0.5) * CC, y: (Math.floor(i / c.cols) + 0.5) * CC })), c.headX(p), c.headY(p), PLAYER_COLORS[p.id % PLAYER_COLORS.length]);
  }
  if (c.kidPath.length > 0) landStroke(ctx, c.kidPath, c.kidX, c.kidY, PLAYER_COLORS[KID]);

  // 악마
  for (const p of c.players) {
    if (p.id === KID || !p.alive) continue;
    const x = c.headX(p), y = c.headY(p);
    if (x < c.camX - 40 || x > c.camX + vw + 40 || y < c.camY - 40 || y > c.camY + vh + 40) continue;
    drawClaimDevil(ctx, c, p, v.time);
    if (p.pers.name === '사냥꾼') {   // 사냥꾼: 머리 위 붉은 표시, 쫓아올 때 더 진하게
      const a = p.mode === 'hunt' ? 0.75 + 0.25 * Math.sin(v.time * 14) : 0.45;
      ctx.fillStyle = `rgba(255,50,40,${a.toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x - 6, y - 40); ctx.lineTo(x + 6, y - 40); ctx.closePath(); ctx.fill();
    }
  }
  // 방패 아이템 (맵에 나옴, 곧 사라지면 깜빡임)
  if (c.shieldItem && (c.shieldItem.t > 3 || Math.floor(v.time * 8) % 2 === 0)) {
    const ix = (c.shieldItem.c + 0.5) * CC, iy = (c.shieldItem.r + 0.5) * CC + Math.sin(v.time * 4) * 2;
    ctx.fillStyle = 'rgba(120,200,255,0.35)';
    ctx.beginPath(); ctx.arc(ix, iy, 13 + Math.sin(v.time * 6) * 2, 0, Math.PI * 2); ctx.fill();
    if (!drawSprite(ctx, 'item_shield', ix - 11, iy - 12, 22, 24)) { ctx.fillStyle = '#3a8ee0'; ctx.fillRect(ix - 7, iy - 8, 14, 16); }
  }
  // 꼬마 (칸 가운데에 발). 맞으면 깜빡임
  if (c.hurtTimer <= 0 || Math.floor(v.time * 12) % 2 === 0) {
    const pl = game.player;
    const kh = 58, kw = kh * (Characters.CellW / Characters.CellH);   // 확대되면 화면에서 90~100
    const fx = c.kidX, fy = c.kidY + CC * 0.45;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(fx, fy, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
    drawCharacter(ctx, pl.character, pl.frame(), pl.facingLeft, new Rect(fx - kw / 2, fy - kh + 4, kw, kh));
    if (c.shielded) {   // 방패를 지닌 동안: 몸 둘레 푸른 막
      ctx.strokeStyle = `rgba(120,200,255,${(0.55 + 0.2 * Math.sin(v.time * 5)).toFixed(2)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(fx, fy - kh * 0.45, kw * 0.5, kh * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (c.shieldPop > 0) {   // 방패가 막아 줌: 퍼지는 푸른 고리
    const k = 1 - c.shieldPop / 0.8;
    ctx.strokeStyle = `rgba(140,210,255,${(1 - k).toFixed(2)})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(c.kidX, c.kidY - 20, 20 + k * 60, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();

  // 화면 밖 가까운 악마: 가장자리에 화살표 (확대해서 시야가 좁아진 만큼)
  drawOffscreenDevils(ctx, c, v.time);

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
  ctx.strokeRect(mx + c.camX * ms, my0 + c.camY * ms, vw * ms, vh * ms);
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
interface SkillPicker<K extends string> {
  choosing: K[] | null; level: number; skills: Partial<Record<K, number>>;
  cardRect(i: number): { x: number; y: number; w: number; h: number };
}
function drawSkillCards<K extends string = SkillId>(ctx: Ctx, a: SkillPicker<K>, info_: (id: K) => { name: string; desc: string } = (id) => SKILLS[id as unknown as SkillId]): void {
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
    roundRect(ctx, r, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = WHITE;
    ctx.stroke();
    text(ctx, info.name, r.centerX, r.y + 40, 16, WHITE, { bold: true });
    wrapText(ctx, info.desc, r.centerX, r.y + 80, r.w - 16, 13, '#dcdce6');
    if (id !== 'heal') text(ctx, `${lv} → ${lv + 1}`, r.centerX, r.bottom - 22, 14, ITEM_COLOR, { bold: true });
  });
}

// ---------- 꼬마 괴물 모드 ----------
// 몬스터 그림 (이미지 AI): 키는 반지름의 몇 배, 발은 가운데에서 반지름의 몇 배 아래
const MONSTER_ART: Record<string, { name: string; h: number; foot: number }> = {
  slime: { name: 'raid_slime', h: 1.7, foot: 0.75 },
  bat: { name: 'bat', h: 2.2, foot: 1.0 },
  eye: { name: 'raid_eye', h: 2.6, foot: 1.2 },
  brute: { name: 'raid_brute', h: 2.6, foot: 1.0 },
  boss: { name: 'raid_boss', h: 2.8, foot: 1.0 },
};
interface MonsterLike { pos: { x: number; y: number }; r: number; kind: string; flash: number; phase: number; fireTimer: number; hp: number; maxHp: number; }
function drawMonster(ctx: Ctx, m: MonsterLike | Monster, kx: number, ky: number, t: number): void {
  const { x, y } = m.pos, r = m.r;
  const white = m.flash > 0;
  ctx.save();
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.85, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  // 그림이 있으면 그림으로 (맞으면 잠깐 밝게, 슬라임은 말랑하게, 박쥐는 날갯짓처럼 위아래로)
  const art = MONSTER_ART[m.kind];
  const artImg = art ? images.sprites[art.name] : null;
  if (art && artImg) {
    const h = r * art.h, w = h * (artImg.width / artImg.height);
    const sq = m.kind === 'slime' ? 1 + Math.sin(t * 8 + m.phase) * 0.08 : 1;
    const bob = m.kind === 'bat' || m.kind === 'eye' ? Math.sin(t * (m.kind === 'bat' ? 14 : 4) + m.phase) * r * 0.15 : 0;
    const flip = kx < x && m.kind !== 'eye';
    const bottom = y + r * art.foot + bob;
    if (m.kind === 'eye' && m.fireTimer < 0.6) {   // 쏘기 직전에 붉게 빛남
      const charge = Math.max(0, 1 - m.fireTimer / 0.6);
      ctx.fillStyle = `rgba(255,60,40,${0.45 * charge})`;
      ctx.beginPath(); ctx.arc(x, bottom - h / 2, r * 1.3, 0, Math.PI * 2); ctx.fill();
    }
    const dw = w * sq, dh = h / sq;
    drawSprite(ctx, art.name, x - dw / 2, bottom - dh, dw, dh, flip);
    if (white) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.75;
      drawSprite(ctx, art.name, x - dw / 2, bottom - dh, dw, dh, flip);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  } else {
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
    // 덩치: 뿔 달린 큰 몸 (우두머리는 금빛에 왕관)
    const boss = m.kind === 'boss';
    ctx.fillStyle = white ? WHITE : boss ? '#b8621b' : '#c0392b';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * r * 0.35, y - r * 0.7);
      ctx.lineTo(x + s * r * 0.75, y - r * 1.25);
      ctx.lineTo(x + s * r * 0.8, y - r * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    roundRect(ctx, new Rect(x - r, y - r * 0.8, r * 2, r * 1.7), r * 0.6);
    ctx.fillStyle = white ? WHITE : boss ? '#e8902c' : '#d24a3a';
    ctx.fill();
    if (boss && !white) {   // 왕관
      ctx.fillStyle = '#ffd84d';
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y - r * 0.95);
      for (let k = 0; k <= 4; k++) ctx.lineTo(x - r * 0.5 + k * r * 0.25, y - r * (k % 2 === 0 ? 1.45 : 1.15));
      ctx.lineTo(x + r * 0.5, y - r * 0.95);
      ctx.closePath();
      ctx.fill();
    }
    if (!white) {
      eyes(x, y - r * 0.2, r * 0.32, r * 0.2);
      ctx.fillStyle = '#5a1010';
      ctx.fillRect(x - r * 0.4, y + r * 0.3, r * 0.8, r * 0.14);
    }
  }
  }
  // 다친 괴물은 체력 막대
  if (m.hp < m.maxHp && m.maxHp >= 3) {
    const w = Math.max(24, r * 1.8), bx = x - w / 2, by = y - r - (m.kind === 'brute' ? 22 : m.kind === 'boss' ? 36 : 10);
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

// 엘프 모드 벽돌 색: 화면에서 숫자가 클수록 초록 → 노랑 → 주황 (빨강은 마지막 줄 표시용으로 남겨 둠)
function hpColor(hp: number, maxHp: number): string {
  const t = maxHp <= 1 ? 0 : Math.min(1, (hp - 1) / (maxHp - 1));
  return `hsl(${Math.round(135 - t * 105)}, 62%, 56%)`;
}

// 엘프 모드: 룬 돌을 마법 화살로 깨는 모습
const ELF_GREEN = '#7dffb0';
const runeVariant = new WeakMap<object, number>();   // 돌마다 그림 모양 하나 (줄이 내려가도 그대로)
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
    const hue = last ? 0 : Math.round(135 - (maxHp <= 1 ? 0 : Math.min(1, (k.hp - 1) / (maxHp - 1))) * 105);
    const glowA = (a: number) => `hsla(${hue}, ${last ? 100 : 62}%, ${last ? 65 : 56}%, ${a})`;
    // 돌 몸통 (모서리를 깎은 팔각형 느낌). 룬 돌 그림이 있으면 그림으로
    const cut = r.w * 0.098;   // 그림의 깎인 모서리와 맞춤
    const octa = (inset: number) => {
      const x0 = r.x + inset, y0 = r.y + inset, x1 = r.right - inset, y1 = r.bottom - inset, k = cut - inset * 0.4;
      ctx.beginPath();
      ctx.moveTo(x0 + k, y0); ctx.lineTo(x1 - k, y0); ctx.lineTo(x1, y0 + k);
      ctx.lineTo(x1, y1 - k); ctx.lineTo(x1 - k, y1); ctx.lineTo(x0 + k, y1);
      ctx.lineTo(x0, y1 - k); ctx.lineTo(x0, y0 + k); ctx.closePath();
    };
    // 바닥 그림자 (돌이 배경 위에 놓인 느낌)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.save(); ctx.translate(1.5, 3); octa(0); ctx.fill(); ctx.restore();
    let variant = runeVariant.get(k);
    if (variant === undefined) { variant = Math.floor(Math.random() * 2); runeVariant.set(k, variant); }
    if (drawRuneStoneArt(ctx, r, variant)) {
      if (last) {   // 마지막 줄: 붉게 달아오른 돌
        ctx.save(); octa(1); ctx.fillStyle = 'rgba(200,30,40,0.35)'; ctx.fill(); ctx.restore();
      }
      // 숫자 색으로 얇은 테두리만 (빛 번짐 없이)
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = glowA(0.55);
      octa(2.5); ctx.stroke();
      octa(0);   // 아래 깜빡임 테두리용 경로
    } else {
      octa(0);
      const g = ctx.createLinearGradient(0, r.y, 0, r.bottom);
      g.addColorStop(0, last ? '#5a2026' : '#3a4058');
      g.addColorStop(1, last ? '#2e0e12' : '#1e2234');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = glow;
      ctx.stroke();
    }
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
    ctx.shadowColor = 'rgba(0,0,0,0.9)';   // 돌 무늬 위에서도 읽히게 어두운 테두리 먼저
    ctx.shadowBlur = 4;
    text(ctx, String(k.hp), r.centerX, r.centerY + 2, k.hp >= 100 ? 16 : 19, glow, { bold: true });
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    text(ctx, String(k.hp), r.centerX, r.centerY + 2, k.hp >= 100 ? 16 : 19, `hsl(${hue}, 75%, 80%)`, { bold: true });
    ctx.restore();
  }

  // 마법 화살: 빛 화살 그림 (없으면 빛나는 꼬리 선)
  ctx.lineCap = 'round';
  if (images.fx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of s.balls) {
      const cx = b.pos.x + b.size / 2, cy = b.pos.y + b.size / 2;
      const l = Math.hypot(b.vel.x, b.vel.y) || 1;
      drawArrowFx(ctx, cx + (b.vel.x / l) * 7, cy + (b.vel.y / l) * 7, Math.atan2(b.vel.y, b.vel.x), 52);
    }
    ctx.restore();
  } else for (const b of s.balls) {
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

// ---------- 괴물 습격 ----------
// 풀밭 무늬: 한 번 그려 두고 반복 (카메라와 같이 움직임)
let grassPattern: CanvasPattern | null = null;
function grass(ctx: Ctx): CanvasPattern | string {
  if (grassPattern) return grassPattern;
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  if (!g) return '#3d6a3c';
  g.fillStyle = '#3d6a3c';
  g.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 26; i++) {   // 옅은 얼룩
    g.fillStyle = rnd() < 0.5 ? 'rgba(80,130,70,0.35)' : 'rgba(40,80,40,0.3)';
    g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 14 + rnd() * 26, 8 + rnd() * 14, rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(120,180,90,0.55)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 40; i++) {   // 풀 포기
    const x = rnd() * S, y = rnd() * S;
    g.beginPath();
    g.moveTo(x - 3, y); g.lineTo(x - 5, y - 6);
    g.moveTo(x, y); g.lineTo(x, y - 8);
    g.moveTo(x + 3, y); g.lineTo(x + 5, y - 6);
    g.stroke();
  }
  for (let i = 0; i < 7; i++) {   // 작은 꽃
    const x = rnd() * S, y = rnd() * S;
    g.fillStyle = ['#ffe680', '#ffffff', '#ff9ec7'][i % 3];
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 1.8, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#f0a020'; g.beginPath(); g.arc(x, y, 1.5, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 5; i++) {   // 돌
    const x = rnd() * S, y = rnd() * S;
    g.fillStyle = 'rgba(30,40,30,0.35)'; g.beginPath(); g.ellipse(x + 1, y + 2, 6, 3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8c9488'; g.beginPath(); g.ellipse(x, y, 5.5, 3.6, 0, 0, Math.PI * 2); g.fill();
  }
  grassPattern = ctx.createPattern(cv, 'repeat');
  return grassPattern ?? '#3d6a3c';
}

function drawRaid(ctx: Ctx, game: Game, v: View): void {
  const r = game.raid!;
  const t = v.time;
  // 화면 흔들림: 큰 몬스터를 잡거나 번개가 칠 때
  const sk = r.shake > 0 ? Math.min(1, r.shake / 0.3) * 6 : 0;
  const camX = r.x - World.Width / 2 + (sk ? Math.sin(t * 91) * sk : 0), camY = r.y - World.Height * 0.52 + (sk ? Math.cos(t * 77) * sk : 0);
  ctx.save();
  ctx.translate(-Math.round(camX), -Math.round(camY));
  ctx.fillStyle = grass(ctx);
  ctx.fillRect(camX - 2, camY - 2, World.Width + 4, World.Height + 4);

  // 불꽃 고리
  const ar = r.auraR;
  if (ar > 0) {
    const g = ctx.createRadialGradient(r.x, r.y - 10, ar * 0.3, r.x, r.y - 10, ar);
    g.addColorStop(0, 'rgba(255,140,40,0)');
    g.addColorStop(0.75, `rgba(255,120,30,${0.16 + 0.06 * Math.sin(t * 8)})`);
    g.addColorStop(1, 'rgba(255,90,20,0.35)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(r.x, r.y - 10, ar, 0, Math.PI * 2); ctx.fill();
    // 둘레를 도는 불꽃
    const n = Math.round(10 + ar / 12);
    for (let i = 0; i < n; i++) {
      const a = t * 2.4 + (i / n) * Math.PI * 2, rr = ar * (0.92 + 0.06 * Math.sin(t * 9 + i));
      const fx = r.x + Math.cos(a) * rr, fy = r.y - 10 + Math.sin(a) * rr, s = 4 + 2 * Math.sin(t * 13 + i * 2);
      ctx.fillStyle = 'rgba(255,200,80,0.85)';
      ctx.beginPath(); ctx.ellipse(fx, fy - s * 0.4, s * 0.7, s * 1.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,90,30,0.55)';
      ctx.beginPath(); ctx.arc(fx, fy, s * 1.1, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 보석 (이미지 AI 그림. 큰 보석은 크게)
  for (const g of r.gems) {
    const big = g.xp >= 5;
    const gh = big ? 22 : g.xp >= 2 ? 17 : 14, gw = gh * 0.73;
    if (drawSprite(ctx, 'raid_xp', g.x - gw / 2, g.y - gh / 2, gw, gh)) continue;
    ctx.fillStyle = big ? '#ff6ad5' : g.xp >= 2 ? '#5ad0ff' : '#7dffb0';
    const s = big ? 7 : 5;
    ctx.beginPath(); ctx.moveTo(g.x, g.y - s); ctx.lineTo(g.x + s * 0.7, g.y); ctx.lineTo(g.x, g.y + s); ctx.lineTo(g.x - s * 0.7, g.y); ctx.closePath(); ctx.fill();
  }
  // 아이템: 고기, 자석, 상자
  for (const d of r.drops) {
    const bob = Math.sin(t * 4 + d.x) * 2;
    if (d.kind === 'meat') {
      if (drawSprite(ctx, 'raid_meat', d.x - 14, d.y - 14 + bob, 28, 27)) continue;
      ctx.fillStyle = '#c0582c'; ctx.beginPath(); ctx.ellipse(d.x - 2, d.y + bob, 8, 6, -0.3, 0, Math.PI * 2); ctx.fill();
    } else if (d.kind === 'magnet') {
      if (drawSprite(ctx, 'raid_magnet', d.x - 11, d.y - 14 + bob, 22, 28)) continue;
      ctx.strokeStyle = '#e03030'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(d.x, d.y + bob, 8, Math.PI, 0); ctx.stroke();
    } else {
      if (drawSprite(ctx, 'raid_chest', d.x - 17, d.y - 18 + bob, 34, 31)) continue;
      ctx.fillStyle = '#8a5a2a'; ctx.fillRect(d.x - 12, d.y - 8 + bob, 24, 16);
    }
  }

  // 괴물과 캐릭터를 아래쪽이 앞으로 오게
  const vis: RaidMonster[] = [];
  for (const m of r.monsters) {
    if (m.pos.x < camX - 60 || m.pos.x > camX + World.Width + 60 || m.pos.y < camY - 60 || m.pos.y > camY + World.Height + 60) continue;
    vis.push(m);
  }
  vis.sort((a, b) => a.pos.y - b.pos.y);
  let drewPlayer = false;
  const drawPlayer = () => {
    drewPlayer = true;
    if (r.dying > 0) ctx.globalAlpha = Math.max(0, r.dying / 0.9);
    if (r.iframe > 0 && Math.floor(t * 20) % 2 === 0) ctx.globalAlpha *= 0.4;
    const pl = game.player, h = Characters.CellH * 1.22, w = Characters.CellW * 1.22;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(r.x, r.y + 2, 19, 6, 0, 0, Math.PI * 2); ctx.fill();
    const dst = new Rect(r.x - w / 2, r.y + 4 - h, w, h);
    const atk = r.swingT >= 0 ? characterAttackCell(pl.character, Math.floor(r.swingT / KNIGHT_SWING * ATTACK_FRAMES)) : null;
    if (atk) {
      const aw = dst.h * (atk.sw / atk.sh), ax = dst.centerX - aw / 2;
      ctx.save();
      if (r.facingLeft) { ctx.translate(ax + aw, dst.y); ctx.scale(-1, 1); ctx.drawImage(atk.img, atk.sx, atk.sy, atk.sw, atk.sh, 0, 0, aw, dst.h); }
      else ctx.drawImage(atk.img, atk.sx, atk.sy, atk.sw, atk.sh, ax, dst.y, aw, dst.h);
      ctx.restore();
    } else drawCharacter(ctx, pl.character, pl.frame(), pl.facingLeft, dst);
    ctx.globalAlpha = 1;
  };
  for (const m of vis) {
    if (!drewPlayer && m.pos.y > r.y) drawPlayer();
    drawMonster(ctx, m, r.x, r.y - 20, t);
  }
  if (!drewPlayer) drawPlayer();

  // 빛 구슬
  for (let i = 0; i < r.orbCount; i++) {
    const o = r.orbPos(i);
    for (let k = 1; k <= 3; k++) {   // 돌아온 길을 따라 옅은 꼬리
      const p = r.orbPos(i, -k * 0.045);
      ctx.fillStyle = `rgba(255,236,140,${(0.32 - k * 0.08).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 9 - k * 2, 0, Math.PI * 2); ctx.fill();
    }
    const g = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,240,160,0.9)');
    g.addColorStop(1, 'rgba(255,220,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(o.x, o.y, 16, 0, Math.PI * 2); ctx.fill();
  }
  // 공, 화살
  for (const s of r.shots) {
    // 날아온 길에 꼬리
    const sp = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / sp, uy = s.vy / sp;
    const tl = s.kind === 'arrow' ? 40 : 26;
    const tg = ctx.createLinearGradient(s.x, s.y, s.x - ux * tl, s.y - uy * tl);
    tg.addColorStop(0, s.kind === 'arrow' ? 'rgba(160,255,200,0.75)' : 'rgba(255,240,170,0.7)');
    tg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = tg; ctx.lineCap = 'round'; ctx.lineWidth = s.kind === 'arrow' ? 4 : 9;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - ux * tl, s.y - uy * tl); ctx.stroke();
    if (s.kind === 'arrow') {
      const a = Math.atan2(s.vy, s.vx);
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a);
      ctx.strokeStyle = '#d8c090'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(8, 0); ctx.stroke();
      ctx.fillStyle = '#e8eef8'; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(6, -4); ctx.lineTo(6, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7dffb0'; ctx.fillRect(-15, -3, 5, 6);
      ctx.restore();
    } else if (!drawSprite(ctx, 'raid_ball', s.x - 9, s.y - 9, 18, 18)) {
      ctx.fillStyle = '#fff4c8';
      ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 칼 궤적 (기사)
  for (const sl of r.slashes) {
    const k = sl.t / 0.22;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 1.5);
    ctx.lineCap = 'round';
    for (const a of sl.back ? [sl.ang, sl.ang + Math.PI] : [sl.ang]) {
      ctx.strokeStyle = 'rgba(140,200,255,0.35)'; ctx.lineWidth = 22 * k + 4;
      ctx.beginPath(); ctx.arc(sl.x, sl.y, sl.range * (0.75 + 0.25 * (1 - k)), a - sl.arc / 2, a + sl.arc / 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 10 * k + 2;
      ctx.beginPath(); ctx.arc(sl.x, sl.y, sl.range * (0.75 + 0.25 * (1 - k)), a - sl.arc / 2, a + sl.arc / 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(160,220,255,0.7)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(sl.x, sl.y, sl.range * 0.6, a - sl.arc / 2.4, a + sl.arc / 2.4); ctx.stroke();
    }
    ctx.restore();
  }
  // 번개: 하늘에서 지그재그 두 겹 (굵은 빛 + 하얀 심), 떨어진 자리에 번쩍임
  for (const b of r.bolts) {
    const k = Math.min(1, b.t / 0.15);
    const pts: [number, number][] = [];
    let seed = Math.floor(b.x * 7 + b.y * 13 + b.t * 40);
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) - 0.5; };
    for (let i = 0; i <= 8; i++) pts.push([b.x + (i === 8 ? 0 : rnd() * 34), b.y - 260 + i * (260 / 8)]);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [w, c] of [[14, `rgba(255,230,120,${(0.35 * k).toFixed(2)})`], [6, `rgba(255,250,190,${(0.9 * k).toFixed(2)})`], [2.5, `rgba(255,255,255,${k.toFixed(2)})`]] as const) {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
    // 곁가지
    ctx.strokeStyle = `rgba(255,250,190,${(0.7 * k).toFixed(2)})`; ctx.lineWidth = 2;
    for (const i of [3, 5]) { const p = pts[i]; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + rnd() * 50, p[1] + 26); ctx.stroke(); }
    ctx.restore();
  }
  // 맞은 자리·쓰러진 자리 연출
  for (const f of r.fx) {
    const k = 1 - f.t / f.life;   // 0 → 1
    ctx.save();
    if (f.kind === 'hit') {
      // 짧게 번쩍이는 별 모양 + 작은 고리
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ffffff';
      ctx.translate(f.x, f.y); ctx.rotate(f.ang);
      const s = f.size * (0.6 + k * 0.6);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = i % 2 ? s * 0.28 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.7); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = f.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.9, 0, Math.PI * 2); ctx.stroke();
    } else if (f.kind === 'kill' || f.kind === 'boom') {
      // 퍼지는 고리 + 가운데 연기
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = f.kind === 'boom' ? '#fff3c0' : f.color; ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, f.size * (0.3 + k * 0.7), f.size * (0.2 + k * 0.45), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.55;
      ctx.fillStyle = f.kind === 'boom' ? 'rgba(255,220,140,1)' : 'rgba(235,235,235,1)';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + f.x, d = f.size * 0.25 * k;
        ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.6 - k * 10, f.size * 0.16 * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
      }
    } else if (f.kind === 'bolt') {
      ctx.globalAlpha = 1 - k;
      const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.size);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,240,150,0.7)'); g.addColorStop(1, 'rgba(255,220,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.size, f.size * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff7a0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, f.size * (0.5 + k), f.size * (0.25 + k * 0.5), 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  // 튀는 불티
  for (const p of r.parts) {
    ctx.globalAlpha = Math.min(1, (p.t / p.life) * 1.5);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  // 피해 숫자
  ctx.font = font(14, true);
  ctx.textAlign = 'center';
  for (const d of r.texts) {
    ctx.globalAlpha = Math.min(1, d.t / 0.3);
    const pop = d.t > 0.5 ? 1 + (d.t - 0.5) * 4 : 1;   // 나올 때 살짝 커졌다 줄어듦
    ctx.font = font(Math.round((d.big ? 19 : 14) * pop), true);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(String(d.v), d.x, d.y);
    ctx.fillStyle = d.big ? '#ffd84d' : WHITE; ctx.fillText(String(d.v), d.x, d.y);
  }
  ctx.globalAlpha = 1;
  // 캐릭터 아래 체력 막대
  if (r.dying <= 0) {
    const bw = 52, bx = r.x - bw / 2, by = r.y + 10;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
    ctx.fillStyle = r.hp / r.maxHp > 0.35 ? '#4be07d' : '#ff5a5a';
    ctx.fillRect(bx, by, bw * Math.max(0, r.hp / r.maxHp), 5);
  }
  ctx.restore();

  // 경험치 막대 (맨 위)와 레벨
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, World.Width, 10);
  ctx.fillStyle = '#5ad0ff';
  ctx.fillRect(0, 0, World.Width * Math.min(1, r.xp / r.xpNeed), 10);
  text(ctx, `Lv ${r.level}`, World.Width - 8, 22, 14, WHITE, { bold: true, align: 'right' });
  // 우두머리 체력
  const boss = r.monsters.find((m) => m.kind === 'boss' && !m.dead);
  if (boss) {
    const bw = World.Width - 120, bx = 60, by = 36;
    text(ctx, '우두머리', World.Width / 2, by - 4, 13, '#ffd84d', { bold: true });
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 2, by + 4, bw + 4, 10);
    ctx.fillStyle = '#ff7a3a'; ctx.fillRect(bx, by + 6, bw * Math.max(0, boss.hp / boss.maxHp), 6);
  }
  // 처음 몇 초 안내
  if (r.time < 4 && !r.choosing) {
    ctx.globalAlpha = Math.min(1, (4 - r.time) / 0.8);
    text(ctx, '끌어서 피하기 · 공격은 자동!', World.Width / 2, World.Height * 0.3, 20, WHITE, { bold: true });
    text(ctx, '몬스터를 잡고 보석을 모아 레벨 업', World.Width / 2, World.Height * 0.3 + 28, 15, '#dcdce6');
    ctx.globalAlpha = 1;
  }
  if (r.joyFrom && !r.choosing) drawJoyStick(ctx, r.joyFrom, r.joyTo);
  const ch = Characters.List[game.player.character].id;
  drawSkillCards(ctx, r, (id) => raidSkillInfo(id, ch));
}

function drawJoyStick(ctx: Ctx, f: { x: number; y: number }, to: { x: number; y: number }): void {
  const dx = to.x - f.x, dy = to.y - f.y, len = Math.hypot(dx, dy), k = len > 50 ? 50 / len : 1;
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

function drawPlaying(ctx: Ctx, game: Game, v: View): void {
  if (game.mini) {
    const draw = MINI_DRAW[game.mode];
    const p = game.player;
    if (draw) draw(ctx, game.mini, { character: p.character, frame: p.frame(), facingLeft: p.facingLeft }, v.time);
    return;
  }
  if (game.raid) { drawRaid(ctx, game, v); return; }
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
  for (const b of game.balls) drawLightOrb(ctx, b.bounds(), b.kind, v.time, b.vel.x, b.vel.y);
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
    // 축복(좋은 것)은 금빛 캡슐, 저주(나쁜 것)는 보랏빛 캡슐 (이미지 AI 그림)
    if (!drawSprite(ctx, info.good ? 'cap_gold' : 'cap_purple', r.x - 5, r.y - 4, r.w + 10, r.h + 8)) {
      roundRect(ctx, r, 5);
      ctx.fillStyle = info.good ? '#e8c46a' : '#2e1240';
      ctx.fill();
    }
    text(ctx, info.label, r.centerX, r.centerY + 1, 13, info.good ? '#5a3a00' : '#f0dcff', { bold: true });
  }
}

// ---------- 성녀 모드 그림 ----------
// 스테인드글라스 색 (줄마다)
const GLASS_COLORS = ['#d23c5a', '#3a6ee0', '#2fae7a', '#9a4fd8', '#e08a2a'];

// 벽돌: 납 테두리 안에 색유리 조각, 위쪽에 빛 반사. 노란(아이템) 벽돌은 금빛 유리에 십자 별
function drawGlassBrick(ctx: Ctx, r: Rect, color: string, item: boolean, fade: number, seed: number): void {
  // 돌 틀에 끼운 색유리 그림 (바닥 그림자 → 그림 → 나타나는 중엔 하얗게)
  if (images.glass) {
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    roundRect(ctx, new Rect(r.x + 1.5, r.y + 2.5, r.w, r.h), 3);
    ctx.fill();
    const ci = item ? 5 : Math.max(0, GLASS_COLORS.indexOf(color));
    drawGlassBrickArt(ctx, r, ci, seed % 2);
    if (fade > 0) {
      ctx.fillStyle = `rgba(255,255,255,${fade})`;
      roundRect(ctx, r, 3);
      ctx.fill();
    }
    return;
  }
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
function drawLightOrb(ctx: Ctx, r: Rect, kind: string, t: number, vx = 0, vy = 0): void {
  const [inner, outer] = ORB_COLORS[kind] ?? ORB_COLORS.white;
  const cx = r.centerX, cy = r.centerY, R = r.w * 0.6;
  // 날아온 쪽으로 빛 꼬리
  const sp = Math.hypot(vx, vy);
  if (sp > 1) {
    const len = Math.min(46, sp * 0.06), ux = vx / sp, uy = vy / sp;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const tg = ctx.createLinearGradient(cx, cy, cx - ux * len, cy - uy * len);
    tg.addColorStop(0, outer + 'cc');
    tg.addColorStop(1, outer + '00');
    ctx.strokeStyle = tg;
    ctx.lineCap = 'round';
    ctx.lineWidth = R * 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - ux * len, cy - uy * len); ctx.stroke();
    ctx.restore();
  }
  // 그림: 금빛 구슬 + 돌아가는 반짝이 (하양 공만. 빨강·초록은 색이 달라 직접 그림)
  if (kind === 'white' && images.fx) {
    drawOrbFx(ctx, cx, cy, R * 4.6);
    drawSparkleFx(ctx, cx, cy, R * 5.5, t * 2.2 + cx * 0.01, 0.55 + 0.25 * Math.sin(t * 9 + cx));
    return;
  }
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

// 홈 화면: 오락실 게임기 화면에 들어갈 내용
function arcadeScreen(game: Game, v: View): ArcadeScreen {
  const gd = Games.List[game.selectedGame];
  const lines: { text: string; color: string }[] = [];
  if (game.lastResult === 'gameover' && game.playingGame === game.selectedGame) {
    const lm = Games.List[game.playingGame].mode;
    lines.push({ text: '게임 오버', color: '#ff7a6a' });
    lines.push({ text: `${formatRecord(lm, game.lastRecord)}${game.lastCoins > 0 ? `  +${game.lastCoins}코인` : ''}`, color: '#ffd0c0' });
  } else {
    const best = game.bestRecord(game.selectedGame);
    if (best > 0) {
      lines.push({ text: '최고 기록', color: '#9fb0d0' });
      lines.push({ text: formatRecord(gd.mode, best), color: '#ffe65a' });
    } else lines.push({ text: '아직 기록 없음', color: '#9fb0d0' });
  }
  const resume = gd.mode === 'swipe' && v.elfSaveRound > 0;
  const footer = resume ? `시작 버튼: 이어하기 (R${v.elfSaveRound})` : '시작 버튼을 누르세요';
  const footer2 = resume ? '처음부터 하기' : '';
  return {
    key: `${game.selectedGame}|${lines.map((x) => x.text).join(',')}|${footer}`,
    name: gd.name, ability: gd.ability, index: game.selectedGame, count: Games.List.length,
    thumb: images.thumbs[gd.mode] ?? null, lines, footer, footer2,
  };
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
    const best = game.bestRecord(game.playingGame);
    const sw = game.swipe;
    const ar = game.archer;
    const sub = game.mini ? `${game.mini.sub()}${best > 0 ? ` · 최고 ${formatRecord(mode, best)}` : ''}`
      : game.raid ? `Lv ${game.raid.level} · 처치 ${game.raid.kills}${best > 0 ? ` · 최고 ${formatRecord(mode, best)}` : ''}`
      : game.claim ? `${Math.floor(game.claim.percent * 100)}%/${GOAL * 100}% · ${'♥'.repeat(Math.max(0, game.claim.lives))} · 처치 ${game.claim.kills}`
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

// 로딩 화면: 제목과 칸으로 나뉜 진행 막대. alpha 로 사라지게 그릴 수 있음
export function renderLoading(ctx: Ctx, l: Layout, progress: number, t: number, alpha = 1): void {
  ctx.setTransform(l.dpr, 0, 0, l.dpr, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#14161f';
  ctx.fillRect(0, 0, l.w, l.h);
  const cx = l.w / 2, cy = l.h * 0.46;
  text(ctx, '레트로 오락실', cx, cy - 44, 30, WHITE, { bold: true });
  const n = 12, bw = Math.min(240, l.w - 80), bh = 12, gap = 3, x0 = cx - bw / 2, y = cy;
  ctx.strokeStyle = '#4a5170';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0 - 5, y - 5, bw + 10, bh + 10);
  const seg = (bw - gap * (n - 1)) / n, filled = Math.max(0, Math.min(1, progress)) * n;
  for (let k = 0; k < n; k++) {
    if (filled - k < 1) break;   // 칸은 다 차야 켜짐 (옛날 게임처럼)
    ctx.fillStyle = ITEM_COLOR;
    ctx.fillRect(x0 + k * (seg + gap), y, seg, bh);
  }
  const dots = '.'.repeat(1 + (Math.floor(t * 3) % 3));
  text(ctx, `불러오는 중${dots}`, cx - 2, y + 40, 13, GRAY);
  ctx.globalAlpha = 1;
}

export function render(ctx: Ctx, l: Layout, game: Game, v: View): void {
  ctx.setTransform(l.dpr, 0, 0, l.dpr, 0, 0);
  const playing = game.state === 'playing';
  if (playing) {
    drawBackground(ctx, l, game.background, !!(game.mini || game.claim || game.raid));
  } else {
    // 홈: 오락실 게임기 (아래 문짝은 게임 영역 밖 바닥까지 내려감)
    drawArcadeHome(ctx, l, arcadeScreen(game, v), {
      coins: v.coins, character: game.selectedChar, rankingVisible: v.rankingVisible, adOffer: v.adOffer, adReady: v.adReady,
      floorBox: (arcadeFloorY(l) - l.gy) / l.scale - menuTop(), boxTop: menuTop(),
    });
  }

  // 게임 영역
  ctx.save();
  ctx.translate(l.gx, l.gy);
  ctx.scale(l.scale, l.scale);
  ctx.beginPath();
  ctx.rect(0, 0, World.Width, World.Height);
  ctx.clip();
  if (playing) drawPlaying(ctx, game, v);
  drawOverlay(ctx, v.overlay);
  ctx.restore();

  if (playing) {
    // 벽 표시: 위, 왼쪽, 오른쪽 (아래는 열려 있음)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(l.gx + 0.5, l.gy + l.gh);
    ctx.lineTo(l.gx + 0.5, l.gy + 0.5);
    ctx.lineTo(l.gx + l.gw - 0.5, l.gy + 0.5);
    ctx.lineTo(l.gx + l.gw - 0.5, l.gy + l.gh);
    ctx.stroke();
  }

  // 아래 조작 공간 안내
  if (game.state === 'playing' && v.overlay === 'none' && l.touch.h > 30) {
    const y = l.touch.centerY;
    ctx.globalAlpha = 0.55;
    const hint = game.mini ? game.mini.hint
      : game.raid ? '화면 어디든 누른 채 끌어서 걷기 · 공격은 자동'
      : game.claim ? '화면 어디든 누른 채 끌어서 걷기'
      : game.horde ? '화면 어디든 끌어서 이동'
      : game.climb ? '화면 어디든 누르면 점프 · 길게 누르면 높이'
      : game.archer ? '화면 어디든 끌어서 이동, 멈추면 자동 발사'
      : game.swipe ? '◀   풀밭 아래를 밀어 쏠 자리 옮기기   ▶' : '◀   여기를 좌우로 밀어 막대 이동   ▶';
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
