// 그리기 도우미 (메뉴, 게임 화면, 미니게임이 같이 씀)
import { characterCell, characterStillCell } from './assets';
import { Rect } from './game/geometry';

export type Ctx = CanvasRenderingContext2D;
export const FONT = '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
export const ITEM_COLOR = '#ffe65a';
export const CARD = '#242838';
export const CARD_SEL = '#465078';
export const WHITE = '#ffffff';
export const GRAY = '#aaafbe';

export function font(size: number, bold = false): string {
  return `${bold ? 700 : 500} ${size}px ${FONT}`;
}

export function text(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, opts: { bold?: boolean; align?: CanvasTextAlign } = {}): void {
  ctx.font = font(size, opts.bold);
  ctx.fillStyle = color;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

export function roundRect(ctx: Ctx, r: Rect, radius: number): void {
  const rr = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rr, r.y);
  ctx.arcTo(r.right, r.y, r.right, r.bottom, rr);
  ctx.arcTo(r.right, r.bottom, r.x, r.bottom, rr);
  ctx.arcTo(r.x, r.bottom, r.x, r.y, rr);
  ctx.arcTo(r.x, r.y, r.right, r.y, rr);
  ctx.closePath();
}

// 캐릭터 그림 (dst 높이에 맞추고 가운데 기준)
export function drawCharacter(ctx: Ctx, character: number, frame: number, facingLeft: boolean, dst: Rect, still = false): void {
  const cell = still ? characterStillCell(character) : characterCell(character, frame);
  if (!cell) {
    ctx.fillStyle = '#78a06e';
    ctx.fillRect(dst.x + dst.w * 0.3, dst.y + dst.h * 0.3, dst.w * 0.4, dst.h * 0.7);
    return;
  }
  // 칸 비율이 다른 캐릭터(기사는 칼이 뒤로 길어서 넓음)는 높이를 맞추고 가운데 기준으로 넓게
  const w = dst.h * (cell.sw / cell.sh);
  const x = dst.centerX - w / 2;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if (facingLeft) {
    ctx.translate(x + w, dst.y);
    ctx.scale(-1, 1);
    ctx.drawImage(cell.img, cell.sx, cell.sy, cell.sw, cell.sh, 0, 0, w, dst.h);
  } else {
    ctx.drawImage(cell.img, cell.sx, cell.sy, cell.sw, cell.sh, x, dst.y, w, dst.h);
  }
  ctx.restore();
}

// 버튼: 검은 바탕에 흰 테두리 (옛날 게임 메뉴처럼). 주 버튼은 테두리가 더 두꺼움
export function button(ctx: Ctx, r: Rect, label: string, primary: boolean, size = 20): void {
  roundRect(ctx, r, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fill();
  ctx.lineWidth = primary ? 3 : 2;
  ctx.strokeStyle = primary ? '#ffffff' : 'rgba(255,255,255,0.8)';
  ctx.stroke();
  text(ctx, label, r.centerX, r.centerY + 1, size, WHITE, { bold: true });
}

export function wrapText(ctx: Ctx, s: string, cx: number, y: number, maxW: number, size: number, color: string): void {
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

// 작은 악마 (동그란 몸, 뿔, 눈). scared: 겁먹은 파란 모습, eyesOnly: 잡아먹혀 눈만 남음
export function drawImp(ctx: Ctx, x: number, y: number, r: number, color: string, t: number,
  look: { x: number; y: number } = { x: 0, y: 1 }, opt: { scared?: boolean; blink?: boolean; eyesOnly?: boolean } = {}): void {
  ctx.save();
  if (!opt.eyesOnly) {
    const body = opt.scared ? (opt.blink ? '#f0f0ff' : '#3a50d8') : color;
    // 뿔
    ctx.fillStyle = opt.scared ? body : '#2a1020';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * r * 0.35, y - r * 0.75);
      ctx.lineTo(x + s * r * 0.8, y - r * 1.3);
      ctx.lineTo(x + s * r * 0.75, y - r * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    // 몸 (아래는 꼬불꼬불)
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.05, r, Math.PI, 0);
    const wob = Math.sin(t * 10) * r * 0.08;
    ctx.lineTo(x + r, y + r * 0.75);
    for (let k = 4; k >= 0; k--) ctx.lineTo(x - r + k * r / 2, y + r * (k % 2 ? 0.5 : 0.85) + (k % 2 ? wob : -wob));
    ctx.closePath();
    ctx.fill();
    if (opt.scared) {   // 겁먹은 얼굴
      ctx.strokeStyle = opt.blink ? '#d03030' : '#ffe0e0';
      ctx.lineWidth = Math.max(1.5, r * 0.1);
      ctx.beginPath();
      for (let k = 0; k <= 4; k++) ctx.lineTo(x - r * 0.5 + k * r * 0.25, y + r * 0.35 + (k % 2 ? -r * 0.12 : 0));
      ctx.stroke();
      ctx.fillStyle = opt.blink ? '#d03030' : '#ffe0e0';
      ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.15, r * 0.13, 0, Math.PI * 2); ctx.arc(x + r * 0.32, y - r * 0.15, r * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
  }
  // 눈 (바라보는 쪽으로 눈동자)
  const d = Math.hypot(look.x, look.y) || 1, lx = look.x / d, ly = look.y / d;
  for (const s of [-1, 1]) {
    ctx.fillStyle = WHITE;
    ctx.beginPath(); ctx.ellipse(x + s * r * 0.34, y - r * 0.15, r * 0.25, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1020';
    ctx.beginPath(); ctx.arc(x + s * r * 0.34 + lx * r * 0.11, y - r * 0.15 + ly * r * 0.13, r * 0.13, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
