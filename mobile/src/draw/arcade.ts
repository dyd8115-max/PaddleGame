// 홈 화면: 먼지 낀 옛날 오락실의 게임기 한 대
//
//  ┌──────────────────────────┐
//  │ 코인            (거미줄)  │
//  │   ┌──────────────────┐   │  ← 간판 (불 들어온 판, 이름은 코드로 씀)
//  │   │  낡은 브라운관 화면  │   │  ← 게임 고르기 (낮은 화질로 그려서 키움)
//  │   └──────────────────┘   │
//  │  캐릭터  ●│   (시작)(목록) │  ← 조작판: 캐릭터, 조이스틱, 버튼
//  │   [광고 보고 코인]        │  ← 아래 문짝
//  │▒▒▒▒▒▒ 먼지 낀 바닥 ▒▒▒▒▒▒│
//  └──────────────────────────┘
// 방·게임기·거미줄·조이스틱은 이미지 AI 그림 (sprites.ts), 버튼과 화면 효과는 코드로 그림
import { images } from '../assets';
import { FONT, drawCharacter, roundRect, type Ctx } from '../gfx';
import { Rect } from '../game/geometry';
import type { Layout } from '../layout';

// ---------- 게임기 그림 자리 (640 높이 상자 기준) ----------
const K = 0.55;                 // 게임기 그림(832×1216) → 논리 좌표
const CX0 = 11.2, CY0 = 26;     // 그림 왼쪽 위
const px = (x: number) => CX0 + x * K;
const py = (y: number) => CY0 + y * K;
const BODY_L = px(40), BODY_R = px(792);
export const ARC = {
  screen: new Rect(px(106), py(256), 626 * K, 448 * K),   // 브라운관
  marquee: new Rect(px(70), py(50), 692 * K, 130 * K),    // 간판 안쪽
  joy: { x: 172, y: 480 },                                // 조이스틱 막대 뿌리
  start: { x: 282, y: 476, r: 22 },
  list: { x: 346, y: 478, r: 17 },
  rank: { x: 402, y: 479, r: 15 },
  label: 516,                                             // 버튼 아래 글자 줄
  char: { x: 78, y: 494, h: 100 },                        // 캐릭터 받침 가운데와 키
  door: py(948),                                          // 아래 문짝 시작
};

// ---------- 눌림·기울임 연출 ----------
const now = () => performance.now() / 1000;
const fx = { tiltDir: 0, tiltAt: -9, drag: 0, press: '', pressAt: -9, switchAt: -9 };
export function arcadeTilt(dir: number): void { fx.tiltDir = dir; fx.tiltAt = now(); fx.switchAt = now(); }
export function arcadeDrag(v: number): void { fx.drag = Math.max(-1, Math.min(1, v)); }
export function arcadePress(name: 'start' | 'list' | 'rank'): void { fx.press = name; fx.pressAt = now(); }
export function arcadeSwitch(): void { fx.switchAt = now(); }
const pressed = (name: string) => fx.press === name && now() - fx.pressAt < 0.16;
function tilt(): number {
  if (fx.drag !== 0) return fx.drag;
  const k = 1 - (now() - fx.tiltAt) / 0.3;
  return k > 0 ? fx.tiltDir * Math.min(1, k * 1.6) : 0;
}

// 바닥선 (화면 픽셀): 아래 안전 영역 위로 바닥이 조금 보이게
export const arcadeFloorY = (l: Layout): number => l.h - Math.max(46, l.insets.bottom + 38);

// ---------- 방 (화면 전체, 화면 픽셀) ----------
function drawArcadeRoom(ctx: Ctx, l: Layout): void {
  ctx.fillStyle = '#1b140c';
  ctx.fillRect(0, 0, l.w, l.h);
  const img = images.sprites.arcade_room;
  if (img) {
    const s = Math.max(l.w / img.width, l.h / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, (l.w - dw) / 2, l.h - dh, dw, dh);   // 바닥이 아래에 오게
  }
  // 바닥 먼지 (게임기 뒤쪽 바닥)
  const fy = arcadeFloorY(l);
  const dust = floorDust(l.w, Math.ceil(l.h - fy + 30));
  if (dust) ctx.drawImage(dust, 0, fy - 30);
}

// ---------- 게임기 (논리 좌표, 메뉴 상자 기준) ----------
export interface ArcadeScreen {
  key: string;              // 내용이 바뀌었는지 알아보는 값
  name: string;
  ability: string;
  index: number;
  count: number;
  thumb: HTMLImageElement | null;
  lines: { text: string; color: string }[];   // 기록 줄
  footer: string;           // 깜빡이는 안내
  footer2: string;          // 그 아래 작은 줄 (없으면 '')
}
export interface ArcadeView {
  coins: number;
  character: number;
  rankingVisible: boolean;
  adOffer: number;
  adReady: boolean;
  floorBox: number;         // 바닥선 (메뉴 상자 기준 논리 좌표)
  boxTop: number;           // 메뉴 상자 위치 (menuTop)
}

// 매 프레임 그리는 건 움직이는 것만: 방·게임기·글자·공기는 한 장으로 미리 그려 둠 (휴대폰에서 렉 줄이기)
let back: Cv | null = null, backKey = '';
export function drawArcadeHome(ctx: Ctx, l: Layout, s: ArcadeScreen, v: ArcadeView): void {
  const t = now();
  const sp = images.sprites;
  const key = `${l.w}x${l.h}@${l.dpr}|${l.gx.toFixed(2)},${l.gy.toFixed(2)},${l.scale.toFixed(4)}|${v.boxTop}|${v.floorBox.toFixed(1)}|${v.coins}|${v.rankingVisible ? 1 : 0}|${sp.arcade_room ? 1 : 0}${sp.arcade_cabinet ? 1 : 0}${sp.arcade_web ? 1 : 0}${sp.arcade_base ? 1 : 0}${sp.coin ? 1 : 0}`;
  if (!back || backKey !== key) { back = bakeBack(l, v, back); backKey = key; }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(back, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(l.gx, l.gy);
  ctx.scale(l.scale, l.scale);
  ctx.translate(0, v.boxTop);
  marqueeFlicker(ctx, t);
  drawCrt(ctx, s, t);
  drawControlsLive(ctx, v, t);
  if (v.adOffer > 0) drawAdSign(ctx, v, t);
  ctx.restore();
  drawMotes(ctx, l, t);
}

function bakeBack(l: Layout, v: ArcadeView, prev: Cv | null): Cv {
  const W = Math.max(1, Math.round(l.w * l.dpr)), H = Math.max(1, Math.round(l.h * l.dpr));
  const c = prev && prev.width === W && prev.height === H ? prev : mk(W, H);
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.setTransform(l.dpr, 0, 0, l.dpr, 0, 0);
  drawArcadeRoom(g, l);
  g.save();
  g.translate(l.gx, l.gy);
  g.scale(l.scale, l.scale);
  g.translate(0, v.boxTop);
  drawCabinetStatic(g, v);
  g.restore();
  drawAirStatic(g, l);
  return c;
}

function drawCabinetStatic(ctx: Ctx, v: ArcadeView): void {
  const img = images.sprites.arcade_cabinet;
  const floor = v.floorBox;
  // 바닥 그림자
  const sh = ctx.createRadialGradient(240, floor, 20, 240, floor, 300);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(-60, floor - 40, 600, 80);

  if (img) {
    const sw = img.width / 832;   // 그림 크기가 달라도 맞게
    const bottom = py(1216);
    ctx.imageSmoothingEnabled = true;
    if (floor <= bottom) {
      const srcH = ((floor - CY0) / K) * sw;
      ctx.drawImage(img, 0, 0, img.width, srcH, CX0, CY0, 832 * K, floor - CY0);
    } else {
      ctx.drawImage(img, CX0, CY0, 832 * K, 1216 * K);
      // 화면이 길면 아래 문짝을 늘려서 바닥까지
      const sy = 1150 * sw, sh2 = 66 * sw, dh = 66 * K;
      for (let y = bottom; y < floor; y += dh) {
        const h = Math.min(dh, floor - y);
        ctx.drawImage(img, 40 * sw, sy, 752 * sw, sh2 * (h / dh), BODY_L, y, BODY_R - BODY_L, h);
      }
    }
  } else {
    ctx.fillStyle = '#1e1c22';
    ctx.fillRect(BODY_L, CY0 + 16, BODY_R - BODY_L, floor - CY0 - 16);
  }
  // 발판 (바닥에 닿는 검은 띠)
  ctx.fillStyle = '#0b090c';
  ctx.fillRect(BODY_L, floor - 9, BODY_R - BODY_L, 9);
  ctx.fillStyle = 'rgba(160,130,90,0.25)';   // 발판 위 먼지
  ctx.fillRect(BODY_L, floor - 10, BODY_R - BODY_L, 1.5);

  drawMarquee(ctx);
  drawControlsStatic(ctx, v);
  drawCoinChip(ctx, v.coins);

  // 게임기 오른쪽 위 모서리에 작은 거미줄
  const web = images.sprites.arcade_web;
  if (web) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(BODY_R + 4, CY0 + 6);
    ctx.scale(-1, 1);
    ctx.drawImage(web, 0, 0, 70, 68);
    ctx.restore();
  }
}

// 광고 보고 코인 더 받기: 문짝에 불 들어온 안내판 (깜빡이는 전구)
function drawAdSign(ctx: Ctx, v: ArcadeView, t: number): void {
  const r = AD_RECT;
  roundRect(ctx, r, 4);
  ctx.fillStyle = '#1a0f06';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#a8742c';
  ctx.stroke();
  const n = 14;
  for (let k = 0; k < n; k++) {
    const on = (Math.floor(t * 4) + k) % 2 === 0;
    ctx.fillStyle = on ? '#ffd56a' : '#5a3a18';
    ctx.fillRect(r.x + 6 + (k * (r.w - 12)) / (n - 1) - 1.5, r.y - 1.5, 3, 3);
    ctx.fillRect(r.x + 6 + (k * (r.w - 12)) / (n - 1) - 1.5, r.bottom - 1.5, 3, 3);
  }
  glowText(ctx, v.adReady ? `광고 보고 +${v.adOffer} 코인 더 받기` : '광고 불러오는 중…', r.centerX, r.centerY + 1, v.adReady ? 14 : 12, v.adReady ? '#ffd56a' : '#9a8a70');
}
export const AD_RECT = new Rect(84, 556, 312, 30);

// 간판: 불 들어온 판에 이름. 가끔 형광등이 깜빡임
function drawMarquee(ctx: Ctx): void {
  const r = ARC.marquee;
  ctx.save();
  // 가운데가 밝고 가장자리가 어두운 불빛
  const g = ctx.createRadialGradient(r.centerX, r.centerY, 10, r.centerX, r.centerY, r.w * 0.6);
  g.addColorStop(0, 'rgba(255,240,200,0.25)');
  g.addColorStop(1, 'rgba(90,50,10,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.font = `900 34px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#3a1a0c';
  ctx.strokeText('레트로 오락실', r.centerX, r.centerY + 2);
  const tg = ctx.createLinearGradient(0, r.y + 14, 0, r.bottom - 14);
  tg.addColorStop(0, '#e8432e');
  tg.addColorStop(1, '#b8221c');
  ctx.fillStyle = tg;
  ctx.fillText('레트로 오락실', r.centerX, r.centerY + 2);
  // 빛바랜 글자
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#f6e3b0';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}
// 형광등 깜빡임: 7초에 한 번쯤, 잠깐
function marqueeFlicker(ctx: Ctx, t: number): void {
  const c = t % 7.3;
  if (c < 0.35 && Math.sin(c * 90) > -0.2) {
    const r = ARC.marquee;
    ctx.fillStyle = 'rgba(26,16,6,0.42)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}

// ---------- 브라운관 ----------
const SW = 240, SH = 172;        // 화면 속 해상도 (낮게 그려서 키움)
const PW = 688, PH = 492;        // 효과를 입혀 둔 그림 크기
type Cv = HTMLCanvasElement;
const mk = (w: number, h: number): Cv => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const cache = new Map<string, Cv>();
let low: Cv | null = null, tiny: Cv | null = null, glass: Cv | null = null, noise: Cv | null = null;

// 화면 속 '처음부터 하기' 줄 (논리 좌표)
export function arcadeFooter2Rect(): Rect {
  const r = ARC.screen, ky = r.h / SH;
  return new Rect(r.x + r.w * 0.25, r.y + 154 * ky, r.w * 0.5, 18 * ky);
}

function drawCrt(ctx: Ctx, s: ArcadeScreen, t: number): void {
  const r = ARC.screen;
  const blink = Math.floor(t / 0.62) % 2 === 0;
  const key = `${s.key}|${blink ? 1 : 0}`;
  let pic = cache.get(key);
  if (!pic) {
    pic = bakeScreen(s, blink);
    if (cache.size > 6) cache.delete(cache.keys().next().value as string);
    cache.set(key, pic);
  }
  const sw = t - fx.switchAt;
  const switching = sw >= 0 && sw < 0.32;
  ctx.save();
  roundRect(ctx, r, 16);
  ctx.clip();
  ctx.fillStyle = '#020305';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  // 오래된 화면: 살짝 떨림, 바꿀 때는 옆으로 흔들림
  const dx = switching ? (Math.random() - 0.5) * 14 * (1 - sw / 0.32) : 0;
  const flick = 0.94 + 0.04 * Math.sin(t * 61) + 0.02 * Math.sin(t * 13.7);
  ctx.globalAlpha = flick;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(pic, r.x + dx, r.y, r.w, r.h);
  ctx.globalAlpha = 1;
  // 천천히 내려가는 밝은 띠
  const by = r.y + (((t * 0.22) % 1.4) - 0.2) * r.h;
  const bg = ctx.createLinearGradient(0, by - 26, 0, by + 26);
  bg.addColorStop(0, 'rgba(255,250,230,0)');
  bg.addColorStop(0.5, 'rgba(255,250,230,0.06)');
  bg.addColorStop(1, 'rgba(255,250,230,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(r.x, by - 26, r.w, 52);
  // 채널 바꿀 때 지지직
  if (switching) {
    const n = noiseCanvas();
    ctx.globalAlpha = 0.85 * (1 - sw / 0.32);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(n, Math.random() * 40, Math.random() * 30, 160, 116, r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // 유리: 반사, 먼지, 긁힘, 안쪽 그림자
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(glassCanvas(), r.x - 6, r.y - 6, r.w + 12, r.h + 12);
}

function bakeScreen(s: ArcadeScreen, blink: boolean): Cv {
  low ??= mk(SW, SH);
  const g = low.getContext('2d')!;
  drawScreenContent(g, s, blink);
  const out = mk(PW, PH);
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = true;
  o.drawImage(low, 0, 0, PW, PH);
  // 번짐: 글자가 옆으로 살짝 끌림
  o.globalCompositeOperation = 'lighter';
  o.globalAlpha = 0.12;
  o.drawImage(low, 6, 0, PW, PH);
  o.globalAlpha = 0.06;
  o.drawImage(low, -4, 1, PW, PH);
  // 빛 퍼짐: 아주 작게 줄였다 키우면 흐려짐
  tiny ??= mk(48, 34);
  const tg = tiny.getContext('2d')!;
  tg.imageSmoothingEnabled = true;
  tg.clearRect(0, 0, 48, 34);
  tg.drawImage(low, 0, 0, 48, 34);
  o.globalAlpha = 0.38;
  o.drawImage(tiny, 0, 0, PW, PH);
  o.globalAlpha = 1;
  // 누렇게 바랜 색
  o.globalCompositeOperation = 'multiply';
  o.fillStyle = 'rgb(255,234,198)';
  o.fillRect(0, 0, PW, PH);
  // 한쪽이 어두운 낡은 화면
  const side = o.createLinearGradient(0, 0, PW, 0);
  side.addColorStop(0, 'rgb(205,205,205)');
  side.addColorStop(0.35, 'rgb(255,255,255)');
  side.addColorStop(1, 'rgb(225,225,225)');
  o.fillStyle = side;
  o.fillRect(0, 0, PW, PH);
  o.globalCompositeOperation = 'source-over';
  // 주사선
  o.fillStyle = 'rgba(0,0,0,0.3)';
  for (let y = 0; y < PH; y += 4) o.fillRect(0, y + 2, PW, 2);
  // 가장자리 어둡게
  const vg = o.createRadialGradient(PW / 2, PH / 2, PW * 0.3, PW / 2, PH / 2, PW * 0.68);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.72)');
  o.fillStyle = vg;
  o.fillRect(0, 0, PW, PH);
  return out;
}

// 화면 속 내용 (240×172)
function drawScreenContent(g: CanvasRenderingContext2D, s: ArcadeScreen, blink: boolean): void {
  const bg = g.createLinearGradient(0, 0, 0, SH);
  bg.addColorStop(0, '#0f2658');
  bg.addColorStop(1, '#06112e');
  g.fillStyle = bg;
  g.fillRect(0, 0, SW, SH);
  const txt = (str: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', weight = 700) => {
    g.font = `${weight} ${size}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(str, x, y);
  };
  // 위 줄: 제목과 몇 번째
  txt('게임 고르기', 8, 10, 10, '#8fb2f0');
  txt(`◀ ${s.index + 1} / ${s.count} ▶`, SW - 8, 10, 10, '#cfe0ff', 'right');
  g.fillStyle = 'rgba(140,180,255,0.35)';
  g.fillRect(6, 18, SW - 12, 1);
  // 미리보기 그림
  const tx = 8, ty = 24, tw = 96, th = 115;
  g.fillStyle = '#000';
  g.fillRect(tx, ty, tw, th);
  if (s.thumb) {
    g.imageSmoothingEnabled = true;
    g.drawImage(s.thumb, tx, ty, tw, th);
  }
  g.strokeStyle = 'rgba(210,225,255,0.9)';
  g.lineWidth = 1;
  g.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
  // 이름 (길면 글자를 줄임)
  const colX = 113, colW = SW - colX - 6;
  let size = 17;
  g.font = `900 ${size}px ${FONT}`;
  while (size > 11 && g.measureText(s.name).width > colW) { size--; g.font = `900 ${size}px ${FONT}`; }
  txt(s.name, colX, 34, size, '#ffe65a', 'left', 900);
  // 설명: ' · ' 앞뒤를 나눠서 줄바꿈
  let y = 56;
  for (const part of s.ability.split(' · ')) {
    for (const ln of wrap(g, part, colW, 11)) {
      if (y > 112) break;
      txt(ln, colX, y, 11, '#e6ecfa', 'left', 500);
      y += 14;
    }
    y += 3;
  }
  // 기록
  s.lines.forEach((ln, i) => txt(ln.text, colX, 120 + i * 14, 11, ln.color, 'left', 700));
  // 아래: 깜빡이는 안내
  if (s.footer2) {
    if (blink) txt(s.footer, SW / 2, 148, 11, '#ffffff', 'center', 700);
    txt(s.footer2, SW / 2, 163, 10, '#9fb0d0', 'center', 500);
    g.font = `500 10px ${FONT}`;
    const w = g.measureText(s.footer2).width;
    g.fillStyle = 'rgba(159,176,208,0.7)';
    g.fillRect(SW / 2 - w / 2, 169, w, 1);
  } else if (blink) txt(s.footer, SW / 2, 157, 11, '#ffffff', 'center', 700);
}

function wrap(g: CanvasRenderingContext2D, s: string, maxW: number, size: number): string[] {
  g.font = `500 ${size}px ${FONT}`;
  const out: string[] = [];
  let cur = '';
  for (const w of s.split(' ')) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}

function noiseCanvas(): Cv {
  noise ??= mk(200, 146);
  const g = noise.getContext('2d')!;
  const d = g.createImageData(200, 146);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255;
    d.data[i] = v; d.data[i + 1] = v; d.data[i + 2] = v * 0.95; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return noise;
}

// 유리 위: 위쪽 반사, 먼지 점, 긁힘, 테두리 안쪽 그림자 (한 번만 그려 둠)
function glassCanvas(): Cv {
  if (glass) return glass;
  const W = 712, H = 516, m = 12;   // 바깥 여백 m (화면보다 조금 크게)
  glass = mk(W, H);
  const g = glass.getContext('2d')!;
  const iw = W - m * 2, ih = H - m * 2;
  // 반사
  const rg = g.createLinearGradient(m, m, m + iw * 0.6, m + ih * 0.7);
  rg.addColorStop(0, 'rgba(255,250,235,0.10)');
  rg.addColorStop(0.45, 'rgba(255,250,235,0.03)');
  rg.addColorStop(0.46, 'rgba(255,250,235,0)');
  g.fillStyle = rg;
  g.fillRect(m, m, iw, ih);
  // 먼지 점과 긁힘 (늘 같은 자리)
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 140; k++) {
    const x = m + rnd() * iw, y = m + rnd() * ih, a = 0.08 + rnd() * 0.18;
    g.fillStyle = `rgba(230,215,180,${a.toFixed(3)})`;
    g.fillRect(x, y, 1.5 + rnd() * 2, 1.5 + rnd() * 2);
  }
  g.strokeStyle = 'rgba(235,225,200,0.12)';
  g.lineWidth = 1.2;
  for (let k = 0; k < 5; k++) {
    const x = m + rnd() * iw, y = m + rnd() * ih, len = 40 + rnd() * 120, a = -0.4 + rnd() * 0.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // 아래쪽에 쌓인 먼지
  const dg = g.createLinearGradient(0, m + ih - 40, 0, m + ih);
  dg.addColorStop(0, 'rgba(190,165,120,0)');
  dg.addColorStop(1, 'rgba(190,165,120,0.22)');
  g.fillStyle = dg;
  g.fillRect(m, m + ih - 40, iw, 40);
  // 테두리 안쪽 그림자
  g.lineWidth = 14;
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  roundRect(g, new Rect(m - 4, m - 4, iw + 8, ih + 8), 34);
  g.stroke();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(0,0,0,0.9)';
  roundRect(g, new Rect(m + 1, m + 1, iw - 2, ih - 2), 30);
  g.stroke();
  return glass;
}

// ---------- 조작판 ----------
const JOY_S = 0.46;
function drawControlsStatic(ctx: Ctx, v: ArcadeView): void {
  // 캐릭터 받침
  const c = ARC.char;
  ctx.fillStyle = '#0d0b0f';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 30, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 1.5, 26, 4.5, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  label(ctx, '캐릭터', c.x, ARC.label);
  // 조이스틱 받침
  const base = images.sprites.arcade_base, j = ARC.joy, s = JOY_S;
  if (base) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, j.x - 59.75 * s, j.y - 143.5 * s + 129.5 * s, base.width * s, base.height * s);
  } else {
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(j.x, j.y + 4, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
  }
  label(ctx, '◀  게임  ▶', j.x, ARC.label);
  label(ctx, '시작', ARC.start.x, ARC.label, true);
  label(ctx, '목록', ARC.list.x, ARC.label);
  if (v.rankingVisible) label(ctx, '랭킹', ARC.rank.x, ARC.label);
}

function drawControlsLive(ctx: Ctx, v: ArcadeView, t: number): void {
  // 캐릭터: 받침 위에서 살짝 숨쉬듯
  const c = ARC.char;
  const bob = Math.sin(t * 2.2) * 0.8;
  drawCharacter(ctx, v.character, 0, false, new Rect(c.x - 44, c.y - c.h - 2 + bob, 88, c.h), true);
  // 조이스틱 막대: 기울여서
  const stick = images.sprites.arcade_stick, j = ARC.joy, s = JOY_S;
  const tl = tilt();
  if (stick) {
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(j.x, j.y);
    ctx.rotate(tl * 0.42);
    ctx.drawImage(stick, -59.75 * s, -143.5 * s, stick.width * s, stick.height * s);
    ctx.restore();
  } else {
    const bx = j.x + Math.sin(tl * 0.42) * 50, byy = j.y - Math.cos(tl * 0.42) * 50;
    ctx.strokeStyle = '#555'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(j.x, j.y); ctx.lineTo(bx, byy); ctx.stroke();
    ctx.fillStyle = '#c81e24'; ctx.beginPath(); ctx.arc(bx, byy, 15, 0, Math.PI * 2); ctx.fill();
  }
  arcadeButton(ctx, ARC.start.x, ARC.start.y, ARC.start.r, '#d42a2a', '#7a1010', '#ff9a8a', pressed('start'), 'arcade_btn_red');
  arcadeButton(ctx, ARC.list.x, ARC.list.y, ARC.list.r, '#2a5ed4', '#10287a', '#9ab8ff', pressed('list'), 'arcade_btn_blue');
  if (v.rankingVisible) arcadeButton(ctx, ARC.rank.x, ARC.rank.y, ARC.rank.r, '#e0b020', '#7a5a08', '#fff0a0', pressed('rank'), 'arcade_btn_yellow');
}

// 둥근 오락실 버튼: 검은 테 + 옆면 + 볼록한 윗면
function arcadeButton(ctx: Ctx, x: number, y: number, r: number, top: string, side: string, hi: string, down: boolean, art = ''): void {
  // 이미지 AI 그림: 누르면 살짝 납작해짐
  const img = art ? images.sprites[art] : null;
  if (img) {
    const w = r * 2.9, h = w * (img.height / img.width), bottom = y + r * 0.95;
    const hh = down ? h * 0.88 : h;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x - w / 2, bottom - hh, w, hh);
    return;
  }
  const lift = down ? 1 : 4.5;
  ctx.fillStyle = '#070608';
  ctx.beginPath(); ctx.ellipse(x, y + 4, r * 1.32, r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath(); ctx.ellipse(x, y + 2.5, r * 1.24, r * 0.66, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  // 옆면
  ctx.fillStyle = side;
  ctx.beginPath();
  ctx.ellipse(x, y + 3, r, r * 0.6, 0, 0, Math.PI);
  ctx.lineTo(x - r, y + 3 - lift);
  ctx.ellipse(x, y + 3 - lift, r, r * 0.6, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  // 윗면
  const g = ctx.createRadialGradient(x - r * 0.35, y - lift - r * 0.25, r * 0.1, x, y - lift + 2, r * 1.1);
  g.addColorStop(0, hi);
  g.addColorStop(0.45, top);
  g.addColorStop(1, side);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y + 3 - lift, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.38, y + 3 - lift - r * 0.22, r * 0.26, r * 0.12, -0.3, 0, Math.PI * 2); ctx.fill();
  // 오래 써서 닳은 자국
  ctx.fillStyle = 'rgba(40,20,10,0.18)';
  ctx.beginPath(); ctx.ellipse(x + r * 0.15, y + 3 - lift + r * 0.12, r * 0.4, r * 0.18, 0.2, 0, Math.PI * 2); ctx.fill();
}

function label(ctx: Ctx, s: string, x: number, y: number, strong = false): void {
  ctx.font = `${strong ? 800 : 700} ${strong ? 13 : 11}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = strong ? '#f4e6c8' : '#cbbfa6';
  ctx.fillText(s, x, y);
}

function glowText(ctx: Ctx, s: string, x: number, y: number, size: number, color: string): void {
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25;
  for (const [dx, dy] of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]]) ctx.fillText(s, x + dx, y + dy);
  ctx.globalAlpha = 1;
  ctx.fillText(s, x, y);
  ctx.restore();
}

// 코인: 놋쇠 테 계수기
export const COIN_RECT = new Rect(10, 6, 132, 32);
function drawCoinChip(ctx: Ctx, coins: number): void {
  const r = COIN_RECT;
  roundRect(ctx, r, 4);
  ctx.fillStyle = 'rgba(16,11,6,0.86)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#a88440';
  ctx.stroke();
  // 동전 (이미지 AI 그림)
  const cx = r.x + 17, cy = r.centerY, cr = 9.5;
  const coin = images.sprites.coin;
  if (coin) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(coin, cx - cr, cy - cr, cr * 2, cr * 2);
  } else {
    ctx.fillStyle = '#f0c23a';
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = `800 16px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd75a';
  ctx.fillText(coins.toLocaleString('ko-KR'), r.x + 31, cy + 1);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8dcc0';
  ctx.font = `800 18px ${FONT}`;
  ctx.fillText('+', r.right - 13, cy);
}

// ---------- 공기 (화면 전체, 화면 픽셀): 누런 먼지 기운, 떠다니는 먼지, 구석 거미줄 ----------
const MOTES = Array.from({ length: 28 }, (_, i) => {
  const h = (n: number) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };
  return { x: h(1), y: h(2), vx: (h(3) - 0.5) * 6, vy: -2 - h(4) * 5, r: 1 + h(5) * 1.4, ph: h(6) * 6.28, a: 0.25 + h(7) * 0.4 };
});
function drawAirStatic(ctx: Ctx, l: Layout): void {
  // 누런 먼지 기운: 전체에 옅게 + 위에서 내려오는 빛줄기
  ctx.save();
  ctx.fillStyle = 'rgba(196,150,80,0.07)';
  ctx.fillRect(0, 0, l.w, l.h);
  ctx.globalCompositeOperation = 'lighter';
  const bx = l.w * 0.62;
  const beam = ctx.createLinearGradient(bx, 0, bx - l.w * 0.35, l.h);
  beam.addColorStop(0, 'rgba(255,214,140,0.055)');
  beam.addColorStop(1, 'rgba(255,214,140,0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(bx - l.w * 0.1, 0);
  ctx.lineTo(bx + l.w * 0.12, 0);
  ctx.lineTo(bx - l.w * 0.18, l.h);
  ctx.lineTo(bx - l.w * 0.62, l.h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // 구석 거미줄
  const web = images.sprites.arcade_web;
  if (web) {
    const sz = Math.min(170, l.w * 0.42);
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.drawImage(web, 0, 0, sz, sz * (web.height / web.width));
    ctx.translate(l.w, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(web, 0, 0, sz * 0.8, sz * 0.8 * (web.height / web.width));
    ctx.restore();
  }
}
// 떠다니는 먼지 알갱이 (화면 픽셀)
function drawMotes(ctx: Ctx, l: Layout, t: number): void {
  ctx.fillStyle = '#ffe8b4';
  for (const m of MOTES) {
    const x = (((m.x * l.w + m.vx * t + Math.sin(t * 0.4 + m.ph) * 14) % l.w) + l.w) % l.w;
    const y = (((m.y * l.h + m.vy * t) % l.h) + l.h) % l.h;
    ctx.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(t * 1.3 + m.ph));
    ctx.fillRect(x, y, m.r, m.r);
  }
  ctx.globalAlpha = 1;
}

// 바닥 먼지 (크기마다 한 번 그려 둠): 회색 가루, 먼지 뭉치, 떨어진 동전 하나
let dustCv: Cv | null = null, dustKey = '';
function floorDust(w: number, h: number): Cv | null {
  if (w <= 0 || h <= 0) return null;
  const key = `${Math.round(w)}x${h}`;
  if (dustCv && dustKey === key) return dustCv;
  dustKey = key;
  dustCv = mk(Math.round(w), h);
  const g = dustCv.getContext('2d')!;
  const fade = g.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(150,128,96,0)');
  fade.addColorStop(0.35, 'rgba(150,128,96,0.18)');
  fade.addColorStop(1, 'rgba(120,102,76,0.32)');
  g.fillStyle = fade;
  g.fillRect(0, 0, w, h);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < w * h * 0.02; k++) {
    const y = 20 + rnd() * (h - 20);
    g.fillStyle = `rgba(${200 + rnd() * 40 | 0},${180 + rnd() * 40 | 0},${140 + rnd() * 30 | 0},${(0.1 + rnd() * 0.25).toFixed(2)})`;
    g.fillRect(rnd() * w, y, 1 + rnd() * 1.5, 1);
  }
  // 먼지 뭉치
  for (const [fx2, fy] of [[0.06, 0.6], [0.93, 0.55], [0.8, 0.85]]) {
    const x = fx2 * w, y = 26 + fy * (h - 30);
    for (let k = 0; k < 26; k++) {
      g.fillStyle = `rgba(190,175,150,${(0.12 + rnd() * 0.2).toFixed(2)})`;
      g.beginPath();
      g.arc(x + (rnd() - 0.5) * 14, y + (rnd() - 0.5) * 6, 1.5 + rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // 떨어진 동전
  const cx = w * 0.17, cy = 30 + (h - 34) * 0.7;
  g.fillStyle = '#b8892a';
  g.beginPath(); g.ellipse(cx, cy, 6, 2.6, 0.1, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,230,140,0.7)';
  g.beginPath(); g.ellipse(cx - 1, cy - 0.6, 3.5, 1.2, 0.1, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(160,140,110,0.35)';   // 동전 위에도 먼지
  g.fillRect(cx - 4, cy - 1, 6, 1);
  return dustCv;
}
