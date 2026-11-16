// AI로 만든 꾸밈 그림을 그리는 도우미: 바닥 무늬, 룬 돌, 색유리 벽돌, 빛 효과
import { images } from '../assets';
import type { Rect } from '../game/geometry';
import type { Ctx } from '../gfx';

// ---------- 반복 무늬 ----------
interface PatternCache { src: HTMLImageElement | HTMLCanvasElement | null; pat: CanvasPattern | null; }
function pattern(ctx: Ctx, cache: PatternCache, src: HTMLImageElement | HTMLCanvasElement | null, tile: number): CanvasPattern | null {
  if (!src) return null;
  if (cache.src !== src) {
    cache.src = src;
    cache.pat = ctx.createPattern(src, 'repeat');
    if (cache.pat && typeof cache.pat.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
      cache.pat.setTransform(new DOMMatrix().scale(tile / src.width));
    }
  }
  return cache.pat;
}

// 땅따먹기 바닥 (돌바닥). 세계 좌표 256 마다 한 장
const groundCache: PatternCache = { src: null, pat: null };
export const groundPattern = (ctx: Ctx): CanvasPattern | null => pattern(ctx, groundCache, images.claimGround, 256);

// ---------- 룬 돌 (돌 2가지) ----------
export function drawRuneStoneArt(ctx: Ctx, r: Rect, variant: number): boolean {
  const img = images.runes;
  if (!img) return false;
  const cw = img.width / 2;
  ctx.drawImage(img, (variant % 2) * cw, 0, cw, img.height, r.x, r.y, r.w, r.h);
  return true;
}

// ---------- 색유리 벽돌 (색 6가지 × 모양 2가지, 마지막 색이 금빛 아이템) ----------
export function drawGlassBrickArt(ctx: Ctx, r: Rect, colorIndex: number, variant: number): boolean {
  const img = images.glass;
  if (!img) return false;
  const cw = img.width / 2, ch = img.height / 6;
  ctx.drawImage(img, (variant % 2) * cw, Math.max(0, Math.min(5, colorIndex)) * ch, cw, ch, r.x, r.y, r.w, r.h);
  return true;
}

// ---------- 빛 효과 (검은 바탕 그림, 더하기로 그림) ----------
// 빛 구슬 (0,0,256,256), 반짝이 (256,0,256,256), 화살 (512,64,512,128)
export function drawOrbFx(ctx: Ctx, x: number, y: number, size: number, alpha = 1): boolean {
  const img = images.fx;
  if (!img) return false;
  const prev = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pa * alpha;
  ctx.drawImage(img, 0, 0, 256, 256, x - size / 2, y - size / 2, size, size);
  ctx.globalCompositeOperation = prev; ctx.globalAlpha = pa;
  return true;
}
export function drawSparkleFx(ctx: Ctx, x: number, y: number, size: number, angle: number, alpha = 1): boolean {
  const img = images.fx;
  if (!img) return false;
  const prev = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pa * alpha;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, 256, 0, 256, 256, -size / 2, -size / 2, size, size);
  ctx.restore();
  ctx.globalCompositeOperation = prev; ctx.globalAlpha = pa;
  return true;
}
// 화살촉이 (x, y) 에 오도록, 길이 len 의 빛 화살. 'lighter' 는 부르는 쪽에서 켬
export function drawArrowFx(ctx: Ctx, x: number, y: number, angle: number, len: number): boolean {
  const img = images.fx;
  if (!img) return false;
  const h = len / 4;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, 512, 64, 512, 128, -len + 3, -h / 2, len, h);
  ctx.restore();
  return true;
}

// ---------- 미니게임 그림 (sprites.ts) ----------
// (x, y, w, h) 에 그림. 그림이 없으면 false (부르는 쪽이 직접 그림)
export function drawSprite(ctx: Ctx, name: string, x: number, y: number, w: number, h: number, flip = false): boolean {
  const img = images.sprites[name];
  if (!img) return false;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;   // 도트 그림은 또렷하게
  if (flip) {
    ctx.save();
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
  } else ctx.drawImage(img, x, y, w, h);
  ctx.imageSmoothingEnabled = smooth;
  return true;
}

// 바닥처럼 반복하는 그림: tile 크기로 깔리는 무늬 (그리는 판마다 따로 만들어 둠)
const spritePats = new WeakMap<Ctx, Map<string, { src: HTMLImageElement; tile: number; pat: CanvasPattern | null }>>();
export function spritePattern(ctx: Ctx, name: string, tile: number): CanvasPattern | null {
  const img = images.sprites[name];
  if (!img) return null;
  let m = spritePats.get(ctx);
  if (!m) { m = new Map(); spritePats.set(ctx, m); }
  const hit = m.get(name);
  if (hit && hit.src === img && hit.tile === tile) return hit.pat;
  const pat = ctx.createPattern(img, 'repeat');
  if (pat && typeof pat.setTransform === 'function' && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scale(tile / img.width));
  m.set(name, { src: img, tile, pat });
  return pat;
}

// ---------- 미리 그려 두는 판 ----------
// 움직이지 않는 그림(바닥, 벽, 블록)을 화면 해상도 그대로 한 장에 그려 두고, 내용(key)이 바뀔 때만 다시 그림.
// 돌려받은 판은 부르는 쪽이 ctx.drawImage(판, x, y, w, h) 로 한 번에 붙임 (w, h 는 논리 크기)
const layers = new Map<string, { cv: HTMLCanvasElement; key: string }>();
export function bakedLayer(ctx: Ctx, slot: string, key: string, w: number, h: number, draw: (g: Ctx) => void): HTMLCanvasElement {
  const k = Math.abs(ctx.getTransform().a) || 1;   // 논리 1 = 기기 점 k 개
  const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
  const full = `${key}|${cw}x${ch}`;
  let e = layers.get(slot);
  if (e && e.key === full) return e.cv;
  if (!e) { e = { cv: document.createElement('canvas'), key: '' }; layers.set(slot, e); }
  if (e.cv.width !== cw || e.cv.height !== ch) { e.cv.width = cw; e.cv.height = ch; }
  const g = e.cv.getContext('2d');
  if (g) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.setTransform(cw / w, 0, 0, ch / h, 0, 0);
    draw(g);
  }
  e.key = full;
  return e.cv;
}
