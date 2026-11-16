// 발판 점프 그리기
import { images } from '../assets';
import { Rect } from '../game/geometry';
import { Characters, World } from '../game/objects';
import { FLOOR_GAP, ghostFade, type Tower } from '../game/tower';
import { drawCharacter, roundRect, text, WHITE, type Ctx } from '../gfx';
import { bakedLayer, drawSprite, spritePattern } from './art';
import type { PlayerView } from './common';

const PAD_COLOR: Record<string, [string, string]> = {
  normal: ['#9aa3b8', '#6b7388'],
  moving: ['#6fb7ff', '#3d7cc2'],
  crumble: ['#c79a6a', '#8a6440'],
  spring: ['#9aa3b8', '#6b7388'],
  spike: ['#c86060', '#803030'],
  ghost: ['#c8a0ff', '#8060c0'],
};

// 버섯 그림이 없을 때: 빨간 버섯
function springFallback(ctx: Ctx, cx: number, y: number): boolean {
  ctx.fillStyle = '#f2ead8';
  ctx.fillRect(cx - 5, y - 12, 10, 12);
  ctx.fillStyle = '#e04a3a';
  ctx.beginPath(); ctx.ellipse(cx, y - 13, 15, 9, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx - 7, y - 18, 4, 3); ctx.fillRect(cx + 4, y - 16, 3, 3);
  return true;
}

export function drawTower(ctx: Ctx, tw: Tower, pl: PlayerView, t: number): void {
  const W = World.Width, H = World.Height;
  // 탑 안쪽 벽: 높이 따라 색이 조금씩 바뀌고, 벽돌 무늬는 천천히 따라 움직임 (깊이감)
  if (images.sprites.tower_wall) {   // 탑 벽 그림: 천천히 따라 움직임 (깊이감), 위로 갈수록 어둡게. 무늬+어둠을 한 장으로 구워 한 번에 붙임
    const dim = Math.round(Math.min(0.55, 0.25 + tw.floor * 0.002) * 20) / 20;
    const wall = bakedLayer(ctx, 'tower', `${dim}|${H}`, W, H + 160, (g) => {
      g.fillStyle = spritePattern(g, 'tower_wall', 160) ?? '#1a1c2e';
      g.fillRect(0, 0, W, H + 160);
      g.fillStyle = `rgba(10,8,24,${dim})`;
      g.fillRect(0, 0, W, H + 160);
    });
    const off = ((-tw.camY * 0.4) % 160 + 160) % 160;
    ctx.drawImage(wall, 0, off - 160, W, H + 160);
  } else {
    ctx.fillStyle = '#1a1c2e';
    ctx.fillRect(0, 0, W, H);
    const off = (-tw.camY * 0.4) % 40;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = -40 + off; y < H; y += 40) {
      const row = Math.floor((y - off + tw.camY * 0.4) / 40);
      for (let x = (row % 2) * 40 - 40; x < W; x += 80) ctx.fillRect(x + 2, y + 2, 76, 36);
    }
  }

  ctx.save();
  ctx.translate(0, -Math.round(tw.camY));
  // 발판
  for (const p of tw.pads) {
    const y = -p.i * FLOOR_GAP;
    if (y < tw.camY - 40 || y > tw.camY + H + 40) continue;
    const [top, side] = PAD_COLOR[p.kind];
    ctx.save();
    if (p.broken > 0) { ctx.globalAlpha = Math.max(0, 1 - p.broken / 0.6); ctx.translate(0, p.broken * 120); }
    if (p.kind === 'ghost') ctx.globalAlpha = 1 - ghostFade(p, tw.time);   // 유령 발판: 깜빡이다 흐려짐
    const art = p.kind === 'moving' || p.kind === 'ghost' ? 'plat_crystal' : p.kind === 'crumble' ? 'plat_wood' : 'plat_stone';
    if (p.kind === 'spike') {   // 가시 발판: 위에 가시덤불, 붉게
      drawSprite(ctx, 'plat_stone', p.x - 6, y - 6, p.w + 12, 30);
      ctx.fillStyle = 'rgba(200,30,40,0.35)'; ctx.fillRect(p.x, y - 2, p.w, 12);
      if (!drawSprite(ctx, 'thorns', p.x - 4, y - 24, p.w + 8, 26)) {
        ctx.fillStyle = '#c8ccd6';
        for (let x = p.x; x < p.x + p.w - 6; x += 12) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6, y - 14); ctx.lineTo(x + 12, y); ctx.fill(); }
      }
      ctx.restore();
      continue;
    }
    if (drawSprite(ctx, art, p.x - 6, y - 6, p.w + 12, 30)) {
      if (p.kind === 'ghost') { ctx.fillStyle = 'rgba(190,140,255,0.45)'; ctx.fillRect(p.x, y - 2, p.w, 14); }   // 보랏빛 유령 발판
      if (p.kind === 'spring') drawSprite(ctx, 'mushroom', p.x + p.w / 2 - 17, y - 30, 34, 32) || springFallback(ctx, p.x + p.w / 2, y);
      if (p.i > 0 && p.i % 10 === 0) text(ctx, `${p.i}층`, p.x + p.w / 2, y + 36, 13, '#ffd84d', { bold: true });
      ctx.restore();
      continue;
    }
    roundRect(ctx, new Rect(p.x, y, p.w, 16), 5);
    ctx.fillStyle = side;
    ctx.fill();
    roundRect(ctx, new Rect(p.x, y, p.w, 9), 5);
    ctx.fillStyle = top;
    ctx.fill();
    if (p.kind === 'crumble') {   // 금
      ctx.strokeStyle = 'rgba(60,30,10,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 1; k < 4; k++) { const cx = p.x + p.w * k / 4; ctx.moveTo(cx, y + 1); ctx.lineTo(cx - 4, y + 8); ctx.lineTo(cx + 2, y + 15); }
      ctx.stroke();
    }
    if (p.kind === 'spring') springFallback(ctx, p.x + p.w / 2, y);
    if (p.i > 0 && p.i % 10 === 0) {   // 10층마다 번호
      text(ctx, `${p.i}층`, p.x + p.w / 2, y + 30, 13, '#ffd84d', { bold: true });
    }
    ctx.restore();
  }
  // 캐릭터
  const h = Characters.CellH * 1.08, w = Characters.CellW * 1.08;
  if (tw.springT > 0) {
    ctx.fillStyle = `rgba(255,216,77,${tw.springT})`;
    ctx.beginPath(); ctx.arc(tw.x, tw.y - h / 2, 30 + (0.5 - tw.springT) * 60, 0, Math.PI * 2); ctx.fill();
  }
  const frame = tw.vy < -200 ? 3 : tw.vy > 200 ? 9 : pl.frame;   // 뛰어오를 때와 내려올 때 다른 자세
  drawCharacter(ctx, pl.character, tw.moving ? pl.frame : frame, pl.facingLeft, new Rect(tw.x - w / 2, tw.y + 3 - h, w, h));
  // 박쥐
  for (const b of tw.bats) {
    const by = b.y + Math.sin(tw.time * 4 + b.phase) * 14, flap = 1 + Math.sin(tw.time * 18 + b.phase) * 0.18;
    if (!drawSprite(ctx, 'bat', b.x - 26, by - 16 * flap, 52, 32 * flap, b.vx < 0)) {
      ctx.fillStyle = '#3a1a60'; ctx.beginPath(); ctx.arc(b.x, by, 11, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();

  // 옆바람: 줄무늬가 흘러가고, 오기 전엔 화살표 알림
  if (tw.wind !== 0 || tw.windWarn > 0) {
    const dir = tw.wind !== 0 ? Math.sign(tw.wind) : 0;
    if (dir) {
      ctx.strokeStyle = 'rgba(220,235,255,0.45)'; ctx.lineWidth = 2;
      for (let k = 0; k < 14; k++) {
        const yy = (k * 71) % H, xx = ((t * 700 * dir + k * 137) % (W + 120) + W + 120) % (W + 120) - 60;
        ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - dir * 46, yy); ctx.stroke();
      }
    } else if (Math.floor(t * 6) % 2 === 0) {
      text(ctx, '바람이 불어와요!', W / 2, H * 0.16, 18, '#bfe6ff', { bold: true });
    }
  }
  // 양옆 벽
  ctx.fillStyle = '#1e2030';
  ctx.fillRect(0, 0, 14, H);
  ctx.fillRect(W - 14, 0, 14, H);
  // 아래에서 차오르는 위험 표시 (화면이 저절로 올라가는 중)
  const sp = tw.scrollSpeed;
  if (sp > 0) {
    const g = ctx.createLinearGradient(0, H - 70, 0, H);
    g.addColorStop(0, 'rgba(255,60,40,0)');
    g.addColorStop(1, `rgba(255,60,40,${0.25 + 0.15 * Math.sin(t * 6)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, H - 70, W, 70);
  }
  if (tw.time < 4) {
    ctx.globalAlpha = Math.min(1, (4 - tw.time) / 0.6);
    text(ctx, '좌우로 끌어서 위쪽 발판으로!', W / 2, H * 0.22, 21, WHITE, { bold: true });
    text(ctx, '점프는 저절로 해요', W / 2, H * 0.22 + 28, 15, '#dcdce6');
    ctx.globalAlpha = 1;
  }
}
