// 인형 뽑기 그리기: 뽑기 기계 안쪽, 왼쪽 인형 통, 오른쪽 큰 상자, 위쪽 레일과 집게
import { images } from '../assets';
import { DOLLS, RAIL_Y, binR, type ClawGame } from '../game/claw';
import { World } from '../game/objects';
import { text, type Ctx } from '../gfx';

// 그림이 없을 때 대신 쓰는 색
const DOLL_COLORS = ['#7ed957', '#8a5cd0', '#b07ce8', '#c0303c', '#4f86d8', '#58b060', '#e8e4f4', '#d84040', '#8c8c94', '#7a1820'];

// 어둡게 칠한 인형 그림 (단계표·통 속 쌓인 인형용, 한 번만 만듦)
const dimCache = new Map<string, HTMLCanvasElement>();
function dimmed(img: HTMLImageElement, tier: number, dim: number): HTMLCanvasElement {
  const key = `${tier}|${dim}`;
  let c = dimCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = dim;
    g.fillStyle = '#1a0c22';
    g.fillRect(0, 0, c.width, c.height);
    dimCache.set(key, c);
  }
  return c;
}

export function drawDoll(ctx: Ctx, tier: number, x: number, y: number, r: number, ang = 0, dim = 0): void {
  const img = images.sprites[`doll_${DOLLS[tier].id}`];
  if (img) {
    const src = dim > 0 ? dimmed(img, tier, dim) : img;
    const s = (r * 2.12 * DOLLS[tier].art) / Math.max(img.width, img.height);
    const w = img.width * s, h = img.height * s;
    ctx.imageSmoothingEnabled = true;
    if (ang === 0) { ctx.drawImage(src, x - w / 2, y - h / 2, w, h); return; }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = DOLL_COLORS[tier];
  ctx.globalAlpha = 1 - dim * 0.7;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1020';
  ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.1, r * 0.1, 0, Math.PI * 2); ctx.arc(r * 0.3, -r * 0.1, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 움직이지 않는 것(배경, 통, 상자, 단계표, 레일)은 한 장으로 미리 그려 둠 (휴대폰 렉 줄이기)
let stat: HTMLCanvasElement | null = null, statKey = '';
function staticLayer(ctx: Ctx, g: ClawGame): HTMLCanvasElement | null {
  const W = World.Width, H = World.Height;
  const k = ctx.getTransform().a;   // 논리 1 = 기기 점 k 개
  const sp = images.sprites;
  const key = `${k.toFixed(4)}|${H}|${g.maxTier}|${g.topY}|${sp.claw_bg ? 1 : 0}${sp.doll_slime ? 1 : 0}${sp.claw_bin ? 1 : 0}${sp.claw_rail ? 1 : 0}${sp.claw_pillar ? 1 : 0}|${g.heap.length}`;
  if (stat && statKey === key) return stat;
  const cw = Math.max(1, Math.round(W * k)), ch = Math.max(1, Math.round(H * k));
  if (!stat || stat.width !== cw || stat.height !== ch) { stat = document.createElement('canvas'); stat.width = cw; stat.height = ch; }
  const c = stat.getContext('2d');
  if (!c) return null;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cw, ch);
  c.setTransform(k, 0, 0, k, 0, 0);
  // 뽑기 기계 안쪽 벽
  const bg = sp.claw_bg;
  if (bg) {
    const s = Math.max(W / bg.width, H / bg.height);
    c.imageSmoothingEnabled = true;
    c.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s);
    c.fillStyle = 'rgba(20,6,30,0.35)';
    c.fillRect(0, 0, W, H);
  } else {
    const gr = c.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#3a1648');
    gr.addColorStop(1, '#170a22');
    c.fillStyle = gr;
    c.fillRect(0, 0, W, H);
  }
  drawHeader(c, g);
  drawBin(c, g);
  drawBox(c, g);
  // 레일 (이미지 AI 그림을 가로로 이어 붙임)
  const rail = sp.claw_rail;
  if (rail) {
    const rh = 14, rw = rh * (rail.width / rail.height);
    c.imageSmoothingEnabled = false;
    for (let x = 0; x < W; x += rw) c.drawImage(rail, x, RAIL_Y - 8, rw + 0.5, rh);
  } else {
    c.fillStyle = '#8a8f9c';
    c.fillRect(0, RAIL_Y - 5, W, 8);
  }
  statKey = key;
  return stat;
}

export function drawClaw(ctx: Ctx, g: ClawGame, t: number): void {
  const W = World.Width, H = World.Height;
  const st = staticLayer(ctx, g);
  if (st) ctx.drawImage(st, 0, 0, W, H);
  // 깜빡이는 전구 줄
  for (let k = 0; k < 24; k++) {
    if ((k + Math.floor(t * 5)) % 3 !== 0) continue;
    ctx.fillStyle = '#ffd86a';
    ctx.fillRect(10 + k * 20 - 2.5, RAIL_Y - 14.5, 5, 5);
  }
  // 통 맨 위 두 인형
  for (let i = 0; i < 2; i++) {
    const tier = g.slots[i];
    const pop = g.slotPop[i];
    const y = g.slotY(i) + pop * 40 - Math.abs(Math.sin(pop * Math.PI)) * 10;
    drawDoll(ctx, tier, g.slotX(i), y + Math.sin(t * 2 + i) * 1.2, binR(tier), (i ? 0.12 : -0.12) * Math.sin(t * 1.3 + i));
  }
  // 상자 속 인형
  for (const d of g.dolls) drawDoll(ctx, d.tier, d.x, d.y, DOLLS[d.tier].r * (0.6 + 0.4 * d.grow), d.ang);
  // 넘칠 때 빨간 선 깜빡임
  if (g.danger > 0) {
    const warn = 0.5 + 0.5 * Math.sin(t * 14);
    ctx.save();
    ctx.strokeStyle = `rgba(255,40,50,${(0.5 + warn * 0.5).toFixed(2)})`;
    ctx.lineWidth = 3.5;
    ctx.setLineDash([10, 7]);
    ctx.beginPath(); ctx.moveTo(g.boxL, g.topY); ctx.lineTo(g.boxR, g.topY); ctx.stroke();
    ctx.restore();
  }
  if (g.state === 'idle' && g.holding < 0 && g.dolls.length === 0 && g.time < 6) {
    text(ctx, '왼쪽 통에서 인형을 집어 와요', (g.boxL + g.boxR) / 2, (g.topY + g.floor) / 2, 15, 'rgba(255,240,250,0.7)', { bold: true });
  }

  // 떨어뜨릴 자리 안내선 (상자 위에서 인형을 들고 있을 때)
  if (g.state === 'idle' && g.holding >= 0 && !g.overBin) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.setLineDash([4, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.hubX, g.heldY() + DOLLS[g.holding].r);
    ctx.lineTo(g.hubX, g.floor);
    ctx.stroke();
    ctx.restore();
  }
  // 통 위: 어느 인형을 집을지 화살표
  if (g.state === 'idle' && g.holding < 0 && g.overBin) {
    const i = g.clawX < (g.binL + g.binR) / 2 ? 0 : 1;
    const x = g.slotX(i), y = g.slotY(i) - binR(g.slots[i]) - 14 + Math.sin(t * 6) * 3;
    ctx.fillStyle = '#ffe65a';
    ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x - 8, y - 4); ctx.lineTo(x + 8, y - 4); ctx.closePath(); ctx.fill();
  }

  drawCrane(ctx, g);

  // 합쳐질 때: 퍼지는 고리와 점수
  for (const p of g.pops) {
    const k = p.t / 0.9;
    const r = DOLLS[p.tier].r * (1 + k * 0.8);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.strokeStyle = p.tier >= 5 ? '#ffe65a' : '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    for (let s = 0; s < 6; s++) {
      const a = s * 1.047 + p.tier, d = r * 0.9;
      ctx.fillStyle = '#fff6c0';
      ctx.fillRect(p.x + Math.cos(a) * d - 2, p.y + Math.sin(a) * d - 2, 4, 4);
    }
    text(ctx, `+${p.pts}`, p.x, p.y - 20 - k * 40, p.pts >= 50 ? 22 : 17, '#ffe65a', { bold: true });
    ctx.restore();
  }

  // 넘침 경고
  if (g.danger > 0) {
    const a = Math.min(1, g.danger / 0.4) * (0.5 + 0.5 * Math.sin(t * 14));
    ctx.fillStyle = `rgba(255,40,60,${(0.12 * a).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// 위쪽: 레일 덮개와 꺼진 전구, 인형 단계표 (고정 판에 그림)
function drawHeader(ctx: Ctx, g: ClawGame): void {
  const W = World.Width;
  ctx.fillStyle = 'rgba(14,6,20,0.82)';
  ctx.fillRect(0, 0, W, RAIL_Y - 8);
  ctx.fillStyle = '#6a3a50';
  for (let k = 0; k < 24; k++) ctx.fillRect(10 + k * 20 - 2.5, RAIL_Y - 14.5, 5, 5);
  // 단계표: 작은 것부터 큰 것까지 (얻은 것만 밝게)
  const n = DOLLS.length, step = 44, x0 = W / 2 - ((n - 1) * step) / 2, y = 22;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * step;
    if (i > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.moveTo(x - step / 2 + 3, y - 3); ctx.lineTo(x - step / 2 + 7, y); ctx.lineTo(x - step / 2 + 3, y + 3); ctx.fill();
    }
    drawDoll(ctx, i, x, y, 15, 0, i <= g.maxTier ? 0 : 0.7);
  }
}

// 왼쪽 인형 통: 아래는 쌓인 인형 (어둡게), 맨 위 두 개가 집을 수 있는 인형
function drawBin(ctx: Ctx, g: ClawGame): void {
  const L = g.binL - 6, R = g.binR + 6, top = g.binTop, F = g.floor;
  ctx.save();
  // 통 안쪽
  ctx.fillStyle = 'rgba(30,10,32,0.88)';
  ctx.fillRect(L, top, R - L, F - top + 10);
  for (const h of g.heap) drawDoll(ctx, h.tier, h.x, h.y, binR(h.tier), h.ang, 0.35);
  // 통 앞판 (아래쪽만 가림): 장난감 상자 그림
  const binImg = images.sprites.claw_bin;
  if (binImg) {
    const bw = R - L + 8, bh = bw * (binImg.height / binImg.width);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(binImg, L - 4, F + 10 - bh, bw, bh);
    ctx.restore();
    return;
  }
  const front = F - 46;
  ctx.fillStyle = '#c05a3a';
  ctx.fillRect(L, front, R - L, F - front + 10);
  // 테두리
  ctx.strokeStyle = 'rgba(255,200,170,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(L, top, R - L, F - top + 10);
  ctx.restore();
}

// 오른쪽 큰 상자: 유리벽, 빨간 선, 인형들
function drawBox(ctx: Ctx, g: ClawGame): void {
  const L = g.boxL, R = g.boxR, F = g.floor;
  // 상자 안쪽: 어둡게 (인형이 잘 보이게), 뒤판에 옅은 별 무늬
  const ig = ctx.createLinearGradient(0, g.topY - 40, 0, F);
  ig.addColorStop(0, 'rgba(26,8,36,0.72)');
  ig.addColorStop(1, 'rgba(14,4,22,0.9)');
  ctx.fillStyle = ig;
  ctx.fillRect(L, g.topY - 40, R - L, F - g.topY + 40);
  ctx.fillStyle = 'rgba(255,200,240,0.06)';
  for (let y = g.topY - 20, row = 0; y < F; y += 46, row++) {
    for (let x = L + 20 + (row % 2) * 23; x < R; x += 46) {
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + k * (Math.PI * 4 / 5);
        ctx.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
      }
      ctx.fill();
    }
  }
  // 빨간 선
  ctx.save();
  ctx.strokeStyle = 'rgba(255,70,90,0.75)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([10, 7]);
  ctx.beginPath(); ctx.moveTo(L, g.topY); ctx.lineTo(R, g.topY); ctx.stroke();
  ctx.restore();
  text(ctx, '넘치면 끝', R - 34, g.topY - 10, 11, 'rgba(255,120,130,0.85)', { bold: true });
  // 바닥과 벽
  ctx.fillStyle = '#2a1230';
  ctx.fillRect(L - 12, F, R - L + 24, World.Height - F);
  ctx.fillStyle = 'rgba(255,190,230,0.35)';
  ctx.fillRect(L - 12, F, R - L + 24, 2);
  const pil = images.sprites.claw_pillar;
  for (const x of [L - 12, R]) {
    if (pil) {
      const pw = 12, ph = pw * (pil.height / pil.width);
      ctx.imageSmoothingEnabled = false;
      for (let y = g.topY - 40; y < F; y += ph) {
        const hh = Math.min(ph, F - y);
        ctx.drawImage(pil, 0, 0, pil.width, pil.height * (hh / ph), x, y, pw, hh);
      }
    } else {
      ctx.fillStyle = 'rgba(200,230,255,0.3)';
      ctx.fillRect(x, g.topY - 40, 10, F - g.topY + 40);
    }
  }
  // 앞 유리 반사
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(L + 40, g.topY - 40); ctx.lineTo(L + 100, g.topY - 40); ctx.lineTo(L + 30, F); ctx.lineTo(L, F);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 레일, 줄, 집게 (들고 있는 인형 포함)
function drawCrane(ctx: Ctx, g: ClawGame): void {
  // 수레
  const shake = g.shake > 0 ? Math.sin(g.shake * 60) * 4 : 0;
  const cx = g.clawX + shake;
  const rail = images.sprites.claw_rail;
  if (rail) {   // 레일 그림 한 토막을 크게 그려 수레로
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(rail, 0, 0, rail.height * 2, rail.height, cx - 21, RAIL_Y - 12, 42, 22);
  } else {
    ctx.fillStyle = '#5c6070';
    ctx.fillRect(cx - 20, RAIL_Y - 9, 40, 18);
  }
  // 줄
  const hx = g.hubX + shake, hy = g.hubY;
  ctx.strokeStyle = '#d8dbe4';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, RAIL_Y + 9); ctx.lineTo(hx, hy - 16); ctx.stroke();
  // 들고 있는 인형
  if (g.holding >= 0) drawDoll(ctx, g.holding, hx, g.heldY(), DOLLS[g.holding].r, g.swing * 0.6);
  drawHand(ctx, hx, hy, g.open, g.swing);
}

function drawHand(ctx: Ctx, x: number, y: number, open: number, ang: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  // 이미지 AI 그림: 벌어진 집게와 오므린 집게 (줄 고리가 위 가운데)
  const img = open > 0.45 ? images.sprites.claw_open : images.sprites.claw_closed;
  if (img) {
    const h = 76, w = h * (img.width / img.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -w / 2, -30, w, h);
    ctx.restore();
    return;
  }
  ctx.fillStyle = '#c8ccd8';
  ctx.fillRect(-14, -18, 28, 18);
  ctx.fillRect(-16 - open * 8, 0, 5, 40);
  ctx.fillRect(11 + open * 8, 0, 5, 40);
  ctx.restore();
}
