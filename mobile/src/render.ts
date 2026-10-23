// 캔버스 그리기. 게임 상태를 읽기만 한다
import { images } from './assets';
import type { Game } from './game/game';
import { Rect } from './game/geometry';
import { Characters, DevilSprite, World, menuTop } from './game/objects';
import { TOSS_BUTTONS_W, type Layout, HUD_H } from './layout';
import { UI, type Overlay } from './ui';

const FONT = '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';

const ROW_COLORS = ['#e65050', '#f0963c', '#50c878', '#50a0f0', '#aa6ee6'];
const ITEM_COLOR = '#ffe65a';
const PADDLE_COLOR = '#dcdce6';
const BALL_COLOR: Record<string, string> = { white: '#ffffff', red: '#ff4d4d', green: '#4ddc7a' };
const CARD = '#242838';
const CARD_SEL = '#465078';
const WHITE = '#ffffff';
const GRAY = '#aaafbe';

export interface View {
  overlay: Overlay;
  muted: boolean;
  rankingVisible: boolean;
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
  const b = d.bounds();
  const dip = d.airborne ? 0 : game.stompDip();   // 밟고 있으면 패들과 같이 눌림
  const img = images.devil;
  if (!img) {
    ctx.fillStyle = '#781e28';
    ctx.fillRect(b.x + 36, b.y + 40 + dip, 46, 88);
    return;
  }
  const c = DevilSprite.Cell;
  ctx.save();
  ctx.imageSmoothingEnabled = false;   // 도트 그림은 또렷하게
  if (d.facingLeft) {
    ctx.translate(b.x + c, b.y + dip);
    ctx.scale(-1, 1);
    ctx.drawImage(img, d.frame() * c, d.anim() * c, c, c, 0, 0, c, c);
  } else {
    ctx.drawImage(img, d.frame() * c, d.anim() * c, c, c, b.x, b.y + dip, c, c);
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

// ---------- 게임 영역 (논리 좌표) ----------
function drawPlaying(ctx: Ctx, game: Game): void {
  const p = game.player;
  drawCharacter(ctx, p.character, p.frame(), p.facingLeft, p.bounds());

  for (const k of game.bricks) {
    if (!k.alive) continue;
    const r = game.brickReveal(k);
    if (r <= 0) continue;
    // 톡 튀어나오는 크기 변화: 0 → 살짝 크게 → 원래 크기
    const c1 = 1.70158, c3 = c1 + 1, u = r - 1;
    const s = 1 + c3 * u * u * u + c1 * u * u;
    const b = k.rect;
    const color = k.item ? ITEM_COLOR : ROW_COLORS[k.row % ROW_COLORS.length];
    ctx.fillStyle = mix(color, (1 - r) * 0.7);
    ctx.fillRect(b.centerX - b.w * s / 2, b.centerY - b.h * s / 2, b.w * s, b.h * s);
  }

  const pad = game.paddle.bounds();
  pad.y += game.stompDip();
  outlinedRect(ctx, pad, PADDLE_COLOR);
  for (const b of game.balls) outlinedRect(ctx, b.bounds(), BALL_COLOR[b.kind]);
  drawDevil(ctx, game);   // 공과 패들보다 나중에 그려서 공을 가림

  const my = World.Height * 0.5;   // 안내 문구는 세계 높이의 가운데쯤
  if (game.reviving) {
    text(ctx, '부활!', World.Width / 2, my, 34, '#fff3b0', { bold: true });
    text(ctx, '성녀의 힘으로 한 번 더 도전해요', World.Width / 2, my + 50, 16, '#dcdce6');
  } else if (game.serving) {
    text(ctx, `STAGE ${game.stage}`, World.Width / 2, my, 34, ITEM_COLOR, { bold: true });
    const sub = game.stage === 1 ? '준비!'
      : game.stage === 2 ? '악마가 패들 위에 올라탔어요! 공을 잘 보세요'
      : '클리어! 공이 더 빨라져요';
    text(ctx, sub, World.Width / 2, my + 50, 16, '#dcdce6');
  }
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
    text(ctx, `게임 오버  ·  스테이지 ${game.stage}  ·  점수 ${game.score}`, World.Width / 2, 350, 17, '#f06e6e', { bold: true });
  }
  text(ctx, `최고 점수 ${game.bestScore}`, World.Width / 2, 376, 15, GRAY);

  // 시작 버튼은 살짝 숨쉬듯 커졌다 작아짐
  const pulse = 1 + 0.03 * Math.sin(v.time * 4);
  const s = UI.start;
  const big = new Rect(s.centerX - s.w * pulse / 2, s.centerY - s.h * pulse / 2, s.w * pulse, s.h * pulse);
  button(ctx, big, '시작하기', true, 24);
  if (v.rankingVisible) button(ctx, UI.ranking, '랭킹 보기', false, 17);

  text(ctx, '화면 아래쪽을 좌우로 밀어 패들을 움직여요', World.Width / 2, 566, 15, GRAY);
  text(ctx, '노란 벽돌을 깨면 공이 하나 더 생겨요', World.Width / 2, 592, 15, GRAY);
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
    // 점수와 스테이지. 오른쪽 끝은 토스 버튼 자리라 비워 둠
    const x = l.soundBtn.right + 14;
    const maxW = l.w - l.insets.right - TOSS_BUTTONS_W - x;
    const y = l.hudTop + HUD_H / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, l.hudTop, Math.max(0, maxW), HUD_H);
    ctx.clip();
    text(ctx, `${game.score}`, x, y - 8, 20, WHITE, { bold: true, align: 'left' });
    const extra = Characters.List[game.player.character].revives > 0 ? `   부활 ${game.revivesLeft}` : '';
    text(ctx, `STAGE ${game.stage}${extra}`, x, y + 12, 12, ITEM_COLOR, { bold: true, align: 'left' });
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
  if (game.state === 'playing') drawPlaying(ctx, game);
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
    text(ctx, '◀   여기를 좌우로 밀어 패들 이동   ▶', l.w / 2, y, 14, WHITE);
    ctx.globalAlpha = 1;
  }

  drawHud(ctx, l, game, v);
}
