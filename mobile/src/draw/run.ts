// 장애물 달리기 그리기
import { Rect } from '../game/geometry';
import { Characters, World } from '../game/objects';
import { CRUMBLE_TIME, PLAYER_SX, type Run } from '../game/run';
import { drawCharacter, text, WHITE, type Ctx } from '../gfx';
import { images } from '../assets';
import { bakedLayer, drawSprite, spritePattern } from './art';
import type { PlayerView } from './common';

export function drawRun(ctx: Ctx, rn: Run, pl: PlayerView, t: number): void {
  const W = World.Width, H = World.Height;
  const skyImg = images.sprites.run_sky;
  if (skyImg) {   // 하늘·산 그림: 천천히 흘러감 (좌우 뒤집어 이어 붙여 끊김 없이). 구덩이 아래는 어둡게
    const sh = H * 0.86, sw = sh * (skyImg.width / skyImg.height);
    // 원본과 뒤집은 그림을 나란히 한 장으로 구워 두고, 보이는 부분만 잘라 붙임
    const pair = bakedLayer(ctx, 'runSky', `${sh}`, sw * 2, sh, (g) => {
      g.imageSmoothingEnabled = true;
      g.drawImage(skyImg, 0, 0, sw, sh);
      g.save(); g.translate(sw * 2, 0); g.scale(-1, 1); g.drawImage(skyImg, 0, 0, sw, sh); g.restore();
    });
    const k = pair.width / (sw * 2);
    let u = (rn.dist * 0.12) % (sw * 2);
    for (let x = 0; x < W;) {
      const w = Math.min(sw * 2 - u, W - x);
      ctx.drawImage(pair, u * k, 0, w * k, pair.height, x, 0, w, sh);
      x += w; u = 0;
    }
    ctx.fillStyle = '#2b1a33';
    ctx.fillRect(0, sh - 1, W, H - sh + 1);
  } else {
    ctx.fillStyle = '#ffd9a0';
    ctx.fillRect(0, 0, W, H);
  }

  ctx.save();
  ctx.translate(-Math.round(rn.dist), 0);
  // 땅 (이미지 AI 그림): 풀과 흙 띠를 가로로 깔고, 그 아래는 흙 무늬로 화면 끝까지
  const TILE = 384, BAND = 48, TOP = 5;   // 그림 768px = 384, 띠 높이 48, 풀 윗면이 발밑에 오게 5 올림
  // 풀+흙 한 토막(가로 384)을 화면 해상도로 한 번만 그려 두고, 땅마다 잘라 붙임 (무늬 채우기는 휴대폰에서 느림)
  const colH = Math.ceil(H + BAND);
  const col = images.sprites.run_ground && images.sprites.run_soil ? bakedLayer(ctx, 'runGround', `${colH}`, TILE, colH, (g) => {
    const bandPat = spritePattern(g, 'run_ground', TILE), soilPat = spritePattern(g, 'run_soil', TILE);
    g.fillStyle = soilPat ?? '#7a4e2e';
    g.fillRect(0, BAND, TILE, colH - BAND);
    g.fillStyle = bandPat ?? '#5fbf4a';
    g.fillRect(0, 0, TILE, BAND);
  }) : null;
  for (const gr of rn.grounds) {
    if (gr.x1 < rn.dist - 20 || gr.x0 > rn.dist + W + 20) continue;
    const x0 = Math.max(gr.x0, rn.dist - 20), x1 = Math.min(gr.x1, rn.dist + W + 20);
    // 무너지는 땅: 밟은 뒤 흔들리다 아래로 꺼짐
    const f = gr.fall ?? -1;
    const sink = f > CRUMBLE_TIME ? (f - CRUMBLE_TIME) * (f - CRUMBLE_TIME) * 1600 : 0;
    const jit = f >= 0 && f <= CRUMBLE_TIME ? Math.sin(t * 70) * 2.5 : 0;
    if (sink > H) continue;
    const top = gr.y - TOP + sink + jit, h = Math.min(colH, H + 4 - top);
    if (col && h > 0) {
      const k = col.width / TILE;
      // 땅의 세계 x 에 맞춰 무늬가 이어지게 토막 단위로 붙임
      for (let x = x0; x < x1;) {
        const u = ((x % TILE) + TILE) % TILE, w = Math.min(TILE - u, x1 - x);
        ctx.drawImage(col, u * k, 0, w * k, h * k, x, top, w, h);
        x += w;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      if (gr.x0 >= x0) ctx.fillRect(gr.x0, top + 27, 5, H - top);
      if (gr.x1 <= x1) ctx.fillRect(gr.x1 - 5, top + 27, 5, H - top);
      if (gr.crumble) {   // 금 간 땅: 붉은 기운 + 갈라진 금
        ctx.fillStyle = 'rgba(120,30,20,0.28)';
        ctx.fillRect(x0, top + 4, x1 - x0, H - top);
        ctx.strokeStyle = 'rgba(30,10,5,0.85)'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let cx = gr.x0 + 30; cx < gr.x1 - 10; cx += 52) { ctx.moveTo(cx, top + 6); ctx.lineTo(cx - 8, top + 22); ctx.lineTo(cx + 4, top + 38); ctx.lineTo(cx - 3, top + 60); }
        ctx.stroke();
      }
      continue;
    }
    ctx.fillStyle = '#7a4e2e';
    ctx.fillRect(x0, gr.y, x1 - x0, H - gr.y + 20);
    ctx.fillStyle = '#5fbf4a';
    ctx.fillRect(x0, gr.y, x1 - x0, 12);
  }
  // 보석
  for (const gm of rn.gems) {
    if (gm.got) continue;
    const bob = Math.sin(t * 5 + gm.x * 0.05) * 3;
    if (drawSprite(ctx, 'gem', gm.x - 11, gm.y - 11 + bob, 22, 22)) continue;
    ctx.fillStyle = '#5ad0ff';
    ctx.beginPath(); ctx.moveTo(gm.x, gm.y - 9 + bob); ctx.lineTo(gm.x + 7, gm.y + bob); ctx.lineTo(gm.x, gm.y + 9 + bob); ctx.lineTo(gm.x - 7, gm.y + bob); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(gm.x - 2, gm.y - 4 + bob, 3, 3);
  }
  // 장애물
  for (const o of rn.obstacles) {
    if (o.x > rn.dist + W + 40 || o.x + o.w < rn.dist - 40) continue;
    if (o.kind === 'spike' && drawSprite(ctx, 'thorns', o.x - 6, o.y - o.h - 10, o.w + 12, o.h + 12)) continue;
    if (o.kind === 'crate' && drawSprite(ctx, 'crate', o.x - 2, o.y - o.h - 2, o.w + 4, o.h + 4)) continue;
    if (o.kind === 'roller') {   // 굴러오는 바위: 돌면서 다가옴
      ctx.save(); ctx.translate(o.x + o.w / 2, o.y - o.h / 2); ctx.rotate(-o.phase);
      if (!drawSprite(ctx, 'boulder', -o.w / 2 - 3, -o.h / 2 - 3, o.w + 6, o.h + 6)) { ctx.fillStyle = '#8a8478'; ctx.beginPath(); ctx.arc(0, 0, o.w / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      continue;
    }
    if (o.kind === 'rock') {   // 떨어지는 바위: 땅에 그림자가 먼저 보이고 점점 짙어짐
      const fy = rn.rockY(o);
      const k = fy === null ? 0.25 : Math.min(1, 0.3 + (fy - (o.y - H * 0.85)) / (H * 0.85));
      ctx.fillStyle = `rgba(0,0,0,${(0.2 + 0.35 * k).toFixed(2)})`;
      ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y - 1, o.w * (0.35 + 0.3 * k), 6, 0, 0, Math.PI * 2); ctx.fill();
      if (fy === null) {
        if (Math.floor(t * 6) % 2 === 0) { ctx.fillStyle = '#ff5a3a'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', o.x + o.w / 2, o.y - 14); }
      } else if (!drawSprite(ctx, 'boulder', o.x - 3, fy - o.h - 3, o.w + 6, o.h + 6)) {
        ctx.fillStyle = '#8a8478'; ctx.beginPath(); ctx.arc(o.x + o.w / 2, fy - o.h / 2, o.w / 2, 0, Math.PI * 2); ctx.fill();
      }
      continue;
    }
    if (o.kind === 'bat') {
      const y = o.y + Math.sin(t * 5 + o.phase) * 6;
      const flap = 1 + Math.sin(t * 18 + o.phase) * 0.18;
      if (drawSprite(ctx, 'bat', o.x - 12, y - 18 * flap, o.w + 24, 36 * flap)) continue;
    }
    if (o.kind === 'spike') {
      ctx.fillStyle = '#c8ccd6';
      const n = Math.round(o.w / 14);
      for (let k = 0; k < n; k++) {
        const x = o.x + k * (o.w / n);
        ctx.beginPath(); ctx.moveTo(x, o.y); ctx.lineTo(x + o.w / n / 2, o.y - o.h); ctx.lineTo(x + o.w / n, o.y); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#7d8290';
      for (let k = 0; k < n; k++) { const x = o.x + k * (o.w / n); ctx.beginPath(); ctx.moveTo(x + o.w / n / 2, o.y - o.h); ctx.lineTo(x + o.w / n, o.y); ctx.lineTo(x + o.w / n * 0.6, o.y); ctx.closePath(); ctx.fill(); }
    } else if (o.kind === 'crate') {
      const y = o.y - o.h;
      ctx.fillStyle = '#b07a3e'; ctx.fillRect(o.x, y, o.w, o.h);
      ctx.strokeStyle = '#6e4620'; ctx.lineWidth = 3; ctx.strokeRect(o.x + 1.5, y + 1.5, o.w - 3, o.h - 3);
      ctx.beginPath();
      for (let yy = y; yy < o.y - 1; yy += 44) { ctx.moveTo(o.x + 3, yy + 3); ctx.lineTo(o.x + o.w - 3, Math.min(o.y, yy + 44) - 3); }
      ctx.stroke();
    } else {
      const y = o.y + Math.sin(t * 5 + o.phase) * 6, cx = o.x + o.w / 2;
      const flap = Math.sin(t * 18 + o.phase) * 0.6;
      ctx.fillStyle = '#5a2a8a';
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(cx + s * 5, y); ctx.lineTo(cx + s * 24, y - 10 - flap * 10); ctx.lineTo(cx + s * 18, y + 6); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#3a1a60'; ctx.beginPath(); ctx.arc(cx, y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.arc(cx - 3.5, y - 1, 2, 0, Math.PI * 2); ctx.arc(cx + 3.5, y - 1, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();

  // 캐릭터 (화면 고정 위치)
  const h = Characters.CellH * 1.2, w = Characters.CellW * 1.2, x = PLAYER_SX;
  const g = rn.groundAt(rn.px);
  if (g && g.y >= rn.y - 4) {
    const k = Math.max(0.3, 1 - (g.y - rn.y) / 200);
    ctx.fillStyle = `rgba(0,0,0,${0.25 * k})`;
    ctx.beginPath(); ctx.ellipse(x, g.y + 2, 16 * k, 4 * k, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (rn.dying) ctx.globalAlpha = 0.6;
  drawCharacter(ctx, pl.character, rn.grounded ? pl.frame : 5, false, new Rect(x - w / 2, rn.y + 4 - h, w, h));
  ctx.globalAlpha = 1;
  // 속도선
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  const sp = rn.speed;
  for (let k = 0; k < Math.floor(sp / 160); k++) {
    const yy = (k * 97 + 40) % (H * 0.5) + H * 0.15, xx = W - ((t * sp * 1.5 + k * 210) % (W + 80));
    ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 40, yy); ctx.stroke();
  }
  // 거리
  text(ctx, `${rn.meters}m`, W - 16, 26, 20, WHITE, { bold: true, align: 'right' });
  if (rn.time < 3.5) {
    ctx.globalAlpha = Math.min(1, (3.5 - rn.time) / 0.6);
    text(ctx, '누르면 점프!', W / 2, H * 0.25, 24, '#5a2a10', { bold: true });
    text(ctx, '공중에서 한 번 더 누르면 2단 점프', W / 2, H * 0.25 + 30, 15, '#5a2a10');
    ctx.globalAlpha = 1;
  }
}
