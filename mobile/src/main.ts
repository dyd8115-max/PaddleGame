// 시작점: 화면 크기 맞추기, 입력, 게임 루프, 소리, 저장, 앱인토스 이벤트
import { Audio, type SoundName } from './audio';
import { loadImages } from './assets';
import { Game, type GameEvent } from './game/game';
import { Characters } from './game/objects';
import { makeLayout, toWorld, type Layout } from './layout';
import {
  closeApp, getInsets, leaderboardAvailable, loadValue, onBack, onInsetsChange,
  openLeaderboard, saveValue, submitScore, type Insets,
} from './platform';
import { render } from './render';
import { UI, type Overlay } from './ui';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const game = new Game();
const audio = new Audio();

let rawInsets: Insets = getInsets();
let rect = canvas.getBoundingClientRect();
let layout: Layout = makeLayout(Math.max(1, rect.width), Math.max(1, rect.height), window.devicePixelRatio || 1, rawInsets);
let overlay: Overlay = 'none';
let clock = 0;

// ---------- 저장 ----------
const KEY_BEST = 'best';
const KEY_MUTED = 'muted';
const KEY_CHAR = 'character';

async function loadSaved(): Promise<void> {
  const [best, muted, ch] = await Promise.all([loadValue(KEY_BEST), loadValue(KEY_MUTED), loadValue(KEY_CHAR)]);
  game.setBestScore(Number(best) || 0);
  audio.setMuted(muted === '1');
  const c = Number(ch);
  if (Number.isInteger(c) && c >= 0 && c < Characters.List.length) game.selectCharacter(c);
}

// ---------- 화면 크기 ----------
// 캔버스가 화면 전체가 아닐 수도 있어서(웹 미리보기 등) 캔버스 자체 크기를 기준으로 맞춘다
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  rect = canvas.getBoundingClientRect();
  const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  // 안전 영역은 캔버스가 이미 비켜 앉은 만큼 빼고 적용
  const insets: Insets = {
    top: Math.max(0, rawInsets.top - rect.top),
    bottom: Math.max(0, rawInsets.bottom - (window.innerHeight - rect.bottom)),
    left: Math.max(0, rawInsets.left - rect.left),
    right: Math.max(0, rawInsets.right - (window.innerWidth - rect.right)),
  };
  layout = makeLayout(w, h, dpr, insets);
}
window.addEventListener('resize', resize);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(canvas);
onInsetsChange((v) => { rawInsets = v; resize(); });

// 캔버스 기준 좌표
const lx = (e: { clientX: number }) => e.clientX - rect.left;
const ly = (e: { clientY: number }) => e.clientY - rect.top;

// ---------- 동작 ----------
function start(): void {
  if (game.state !== 'menu') return;
  game.startGame();
  void saveValue(KEY_CHAR, String(game.selected));
}

function pause(): void {
  if (game.state === 'playing' && overlay === 'none') overlay = 'pause';
}

function toggleMute(): void {
  audio.setMuted(!audio.muted);
  void saveValue(KEY_MUTED, audio.muted ? '1' : '0');
}

function finishGame(): void {
  // 게임이 끝날 때마다 최고 점수 저장, 리더보드 제출
  void saveValue(KEY_BEST, String(game.bestScore));
  void submitScore(game.score);
}

function quit(): void {
  overlay = 'none';
  game.quitToMenu();
  finishGame();
}

const SOUND_OF: Record<GameEvent, SoundName> = {
  start: 'start',
  stageClear: 'clear',
  gameOver: 'over',
  brickBreak: 'brick',
  devilStomp: 'stomp',
  revive: 'start',
};

// ---------- 터치, 마우스 ----------
let downX = 0, downY = 0, downAt = 0, activePointer = -1;

function hudSoundRect() { return game.state === 'playing' ? layout.soundBtn : layout.pauseBtn; }

function movePaddle(x: number): void {
  if (game.state !== 'playing' || overlay !== 'none') return;
  game.setPaddleTarget(toWorld(layout, x, 0).x);
}

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();   // 휴대폰은 첫 터치 뒤에야 소리를 낼 수 있음
  if (activePointer !== -1 && e.pointerType === 'touch') return;   // 두 번째 손가락은 무시
  activePointer = e.pointerId;
  downX = lx(e); downY = ly(e); downAt = performance.now();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* 무시 */ }

  // 위쪽 버튼은 누르는 즉시 반응
  if (game.state === 'playing' && overlay === 'none' && layout.pauseBtn.contains(lx(e), ly(e))) {
    pause();
    return;
  }
  if (hudSoundRect().contains(lx(e), ly(e))) {
    toggleMute();
    return;
  }
  movePaddle(lx(e));
});

canvas.addEventListener('pointermove', (e) => {
  // 마우스는 누르지 않아도 따라오고, 터치는 누른 손가락만
  if (e.pointerType === 'touch' && e.pointerId !== activePointer) return;
  movePaddle(lx(e));
});

function onTap(x: number, y: number): void {
  const w = toWorld(layout, x, y);
  if (overlay === 'pause') {
    if (UI.resume.contains(w.x, w.y)) overlay = 'none';
    else if (UI.quit.contains(w.x, w.y)) quit();
    return;
  }
  if (overlay === 'exit') {
    if (UI.exitCancel.contains(w.x, w.y)) overlay = 'none';
    else if (UI.exitOk.contains(w.x, w.y)) void closeApp();
    return;
  }
  if (game.state === 'menu') {
    if (game.tapCard(w.x, w.y)) return;
    if (UI.start.contains(w.x, w.y)) start();
    else if (leaderboardAvailable() && UI.ranking.contains(w.x, w.y)) void openLeaderboard();
  }
}

function endPointer(e: PointerEvent): void {
  if (e.pointerId !== activePointer) return;
  activePointer = -1;
  const moved = Math.hypot(lx(e) - downX, ly(e) - downY);
  if (e.type === 'pointerup' && moved < 12 && performance.now() - downAt < 600) onTap(lx(e), ly(e));
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// 키보드 (PC 브라우저에서 확인할 때)
window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.key === 'm' || e.key === 'M') toggleMute();
  else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (overlay === 'pause') overlay = 'none'; else pause();
  } else if (game.state === 'menu' && overlay === 'none') {
    if (e.key === ' ' || e.key === 'Enter') start();
    else if (e.key === 'ArrowLeft') game.moveSelection(-1);
    else if (e.key === 'ArrowRight') game.moveSelection(1);
    else if (e.key >= '1' && e.key <= '3') game.selectCharacter(Number(e.key) - 1);
  } else if (overlay === 'pause' && (e.key === ' ' || e.key === 'Enter')) overlay = 'none';
});

// ---------- 앱 전환, 뒤로가기 ----------
// 앱을 내리면 소리를 멈추고 게임은 일시정지. 돌아오면 소리는 바로 다시 나고, 게임은 '계속하기'를 누르면 이어짐
document.addEventListener('visibilitychange', () => {
  const hidden = document.visibilityState === 'hidden';
  audio.setHidden(hidden);
  if (hidden) pause();
});

// 안드로이드 뒤로가기: 플레이 중 → 일시정지, 창이 떠 있으면 닫기, 메뉴 → 종료 확인
onBack(() => {
  if (overlay !== 'none') overlay = 'none';
  else if (game.state === 'playing') pause();
  else overlay = 'exit';
});

// ---------- 게임 루프 ----------
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  clock += dt;

  if (overlay === 'none') game.update(dt);
  else if (game.state === 'menu') game.update(dt);   // 메뉴 카드 움직임은 계속

  for (const e of game.takeEvents()) {
    audio.play(SOUND_OF[e]);
    if (e === 'gameOver') finishGame();
  }

  render(ctx, layout, game, {
    overlay,
    muted: audio.muted,
    rankingVisible: leaderboardAvailable(),
    time: clock,
  });
  requestAnimationFrame(frame);
}

// 개발 서버에서만: 브라우저 자동 확인용으로 게임 상태를 노출
if (import.meta.env.DEV) {
  const w = window as unknown as { __game: Game; __layout: () => Layout; __audio: Audio };
  w.__game = game;
  w.__audio = audio;
  w.__layout = () => layout;
}

resize();
void loadSaved();
void loadImages();
requestAnimationFrame((t) => { last = t; frame(t); });
