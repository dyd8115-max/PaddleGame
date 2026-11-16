// 시작점: 화면 크기 맞추기, 입력, 게임 루프, 소리, 저장, 앱인토스 이벤트
import { Audio, type SoundName } from './audio';
import { loadImages, loading } from './assets';
import { Game, type GameEvent } from './game/game';
import type { SwipeSave } from './game/swipe';
import { Vec2 } from './game/geometry';
import { Games, menuTop } from './game/objects';
import { makeLayout, toWorld, type Layout } from './layout';
import {
  closeApp, getInsets, haptic, keepScreenOn, leaderboardAvailable, loadUserKey, loadValue, onAppState, onBack, onInsetsChange,
  openLeaderboard, saveValue, submitScore, type Insets,
} from './platform';
import { hasTutorial, openSettings, openTutorial } from './appinfo';
import { isSheetOpen, sheetBack } from './sheet';
import type { GameMode } from './game/objects';
import { formatRecord, render, renderLoading } from './render';
import { initAds, rewardedReady, rewardedSupported, showRewarded } from './ads';
import { wallet } from './economy';
import { initIap } from './iap';
import { openCharacters, openGameList, openShop, type GameListHooks, type ShopHooks } from './shop';
import { UI, type Overlay } from './ui';
import { arcadeDrag, arcadePress, arcadeSwitch, arcadeTilt } from './draw/arcade';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const game = new Game();
const audio = new Audio();

let rawInsets: Insets = getInsets();
let rect = canvas.getBoundingClientRect();
// 화면 배율 상한: 기본 2배. 프레임이 계속 느리면 한 단계씩 낮춤 (2 → 1.5 → 1.25 → 1).
// 낮춘 값은 기억해 두되, 다음에 켤 때는 한 단계 위에서 다시 재 봄 (잠깐 버벅인 것 때문에 계속 흐리지 않게)
const DPR_STEPS = [2, 1.5, 1.25, 1];
let dprCap = 2;
try {
  const v = Number(localStorage.getItem('dprCap'));
  const i = DPR_STEPS.indexOf(v);
  if (i > 0) dprCap = DPR_STEPS[i - 1];
} catch { /* 저장소를 못 쓰면 기본값 */ }
let perfAvg = 16, perfSlow = 0, perfHold = 3;   // 평균 프레임 시간(ms), 느린 채로 흐른 시간, 재기 전 기다림
function watchPerf(rawDt: number): void {
  if (document.hidden || rawDt > 0.25 || isSheetOpen()) { perfHold = 1; return; }
  if (perfHold > 0) { perfHold -= rawDt; return; }
  perfAvg += (rawDt * 1000 - perfAvg) * 0.06;
  perfSlow = perfAvg > 24 ? perfSlow + rawDt : Math.max(0, perfSlow - rawDt * 2);
  const i = DPR_STEPS.indexOf(dprCap);
  if (perfSlow > 1.5 && i >= 0 && i < DPR_STEPS.length - 1 && (window.devicePixelRatio || 1) > DPR_STEPS[i + 1]) {
    dprCap = DPR_STEPS[i + 1];
    perfSlow = 0; perfAvg = 16; perfHold = 2;
    try { localStorage.setItem('dprCap', String(dprCap)); } catch { /* 무시 */ }
    resize();
  }
}
let layout: Layout = makeLayout(Math.max(1, rect.width), Math.max(1, rect.height), Math.min(window.devicePixelRatio || 1, dprCap), rawInsets);
let overlay: Overlay = 'none';
let clock = 0;

// ---------- 저장 ----------
// 게임별 최고 기록 키: 처음 네 게임은 예전 키 그대로, 나머지는 모드 이름으로 (게임을 빼거나 넣어도 안 밀리게)
const LEGACY_BEST: Partial<Record<GameMode, string>> = { claim: 'best0s', swipe: 'best1r', survival: 'best2', raid: 'best3' };
const KEY_BEST = (gi: number) => { const m = Games.List[gi].mode; return LEGACY_BEST[m] ?? `best_${m}`; };
const KEY_ELF_SAVE = 'swipeSave';   // 스와이프 모드(엘프) 중간 저장
let elfSave: SwipeSave | null = null;
let savedRound = 0;   // 마지막으로 저장한 라운드 (같은 라운드는 다시 저장하지 않음)

function readElfSave(raw: string | null): SwipeSave | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as SwipeSave;
    return Array.isArray(v.bricks) && typeof v.round === 'number' ? v : null;
  } catch { return null; }
}

function clearElfSave(): void {
  elfSave = null;
  void saveValue(KEY_ELF_SAVE, '');
}
const KEY_MUTED = 'muted';
const KEY_CHAR = 'character';    // 예전 버전: 캐릭터 = 게임
const KEY_GAME = 'gameSel';
const KEY_SKIN = 'charSel';
let adOffer = 0;   // 판이 끝난 뒤 광고로 한 번 더 받을 수 있는 코인
const KEY_VIB = 'vibration';
const KEY_TUT = (mode: GameMode) => `tut_${mode}`;   // 규칙 안내를 봤는지
let vibration = true;
const tutSeen = new Set<GameMode>();

async function loadSaved(): Promise<void> {
  // 토스 계정이 바뀌었으면 이전 계정의 기록은 지움 (같은 기기를 다른 사람이 쓸 때)
  const prevKey = await loadValue('userKey');
  const userKey = await loadUserKey();
  if (prevKey && userKey && prevKey !== userKey) await resetRecords();
  await wallet.load(userKey);
  const modes = Games.List.map((g) => g.mode);
  const [muted, oldCh, gSel, cSel, save, vib, ...rest] = await Promise.all([
    loadValue(KEY_MUTED), loadValue(KEY_CHAR), loadValue(KEY_GAME), loadValue(KEY_SKIN), loadValue(KEY_ELF_SAVE), loadValue(KEY_VIB),
    ...Games.List.map((_, i) => loadValue(KEY_BEST(i))), ...modes.map((m) => loadValue(KEY_TUT(m))),
  ]);
  const bests = rest.slice(0, Games.List.length);
  modes.forEach((m, i) => { if (rest[Games.List.length + i] === '1') tutSeen.add(m); });
  vibration = vib !== '0';
  elfSave = readElfSave(save);
  bests.forEach((v, i) => game.setBestRecord(i, Number(v) || 0));
  // 예전 버전에서 엘프·성녀로 해 본 사람은 그 캐릭터를 그대로 쓰게
  const free: string[] = [];
  if ((Number(bests[1]) || 0) > 0 || elfSave) free.push('elf');
  if ((Number(bests[2]) || 0) > 0) free.push('saint');
  wallet.grantFree(free);
  audio.setMuted(muted === '1');
  const gi = Number(gSel ?? oldCh);
  if (Number.isInteger(gi) && gi >= 0 && gi < Games.List.length) game.selectGame(gi);
  const ci = Number(cSel ?? 0);
  if (Number.isInteger(ci) && wallet.owns(ci)) game.selectCharacter(ci);
}

// ---------- 화면 크기 ----------
// 캔버스가 화면 전체가 아닐 수도 있어서(웹 미리보기 등) 캔버스 자체 크기를 기준으로 맞춘다
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);   // 3배 화면은 그릴 점이 너무 많아 느려짐 → 2배까지, 느린 기기는 더 낮춤
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
  // 꼬마 오르기는 아래 조작 공간을 넓혀서 큰 버튼을 둠
  const climbing = Games.List[game.state === 'playing' ? game.playingGame : game.selectedGame].mode === 'climb';
  layout = makeLayout(w, h, dpr, insets, climbing ? 72 : undefined);
  game.setWorldHeight(layout.worldH);
}
window.addEventListener('resize', resize);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(canvas);
onInsetsChange((v) => { rawInsets = v; resize(); });

// 캔버스 기준 좌표
const lx = (e: { clientX: number }) => e.clientX - rect.left;
const ly = (e: { clientY: number }) => e.clientY - rect.top;

// ---------- 동작 ----------
// 엘프(스와이프)는 중간 저장이 있으면 이어서 (fresh 면 처음부터)
function start(fresh = false): void {
  if (game.state !== 'menu' || isSheetOpen()) return;
  // 처음 하는 게임이면 규칙 안내부터
  const mode = Games.List[game.selectedGame].mode;
  if (hasTutorial(mode) && !tutSeen.has(mode)) {
    openTutorial(mode, () => {
      tutSeen.add(mode);
      void saveValue(KEY_TUT(mode), '1');
      start(fresh);
    });
    return;
  }
  const isElf = mode === 'swipe';
  if (isElf && fresh) clearElfSave();
  resize();   // 캐릭터에 따라 아래 조작 공간 높이가 달라서, 시작 전에 화면 배치를 다시 계산
  game.startGame(isElf && elfSave ? elfSave : undefined);
  savedRound = game.swipe ? game.swipe.round : 0;
  adOffer = 0;
  void saveValue(KEY_GAME, String(game.selectedGame));
  void saveValue(KEY_SKIN, String(game.selectedChar));
}

function pause(): void {
  if (game.state === 'playing' && overlay === 'none') overlay = 'pause';
  game.swipe?.aimCancel();
  game.archer?.joyEnd();
  game.horde?.joyEnd();
  game.claim?.joyEnd();
  game.raid?.joyEnd();
  game.mini?.up(0, 0, false);
  if (game.horde) game.horde.keyDir = new Vec2();
  climbHeld.clear();
  game.climb?.release();
}

// 기록 초기화: 캐릭터별 최고 기록과 엘프 이어하기 저장
async function resetRecords(): Promise<void> {
  game.resetBestRecords();
  elfSave = null;
  await Promise.all([...Games.List.map((_, i) => saveValue(KEY_BEST(i), '0')), saveValue(KEY_ELF_SAVE, '')]);
}

function showSettings(): void {
  openSettings({
    muted: () => audio.muted,
    toggleSound: toggleMute,
    vibration: () => vibration,
    toggleVibration: () => {
      vibration = !vibration;
      void saveValue(KEY_VIB, vibration ? '1' : '0');
      if (vibration) haptic('tap');
    },
    howTo: (mode) => openTutorial(mode, showSettings, '확인'),
    resetRecords: () => { void resetRecords(); },
  });
}

function toggleMute(): void {
  audio.setMuted(!audio.muted);
  void saveValue(KEY_MUTED, audio.muted ? '1' : '0');
}

function finishGame(): void {
  // 게임이 끝날 때마다 최고 점수 저장, 리더보드 제출, 코인 지급
  const gi = game.playingGame;
  void saveValue(KEY_BEST(gi), String(game.bestRecord(gi)));
  void submitScore(game.score);
  const coins = game.lastCoins;
  if (coins > 0) {
    wallet.add(coins);
    adOffer = rewardedSupported() ? coins : 0;   // 광고를 보면 한 번 더
  }
}

// ---------- 상점, 캐릭터, 광고 ----------
const shopHooks: ShopHooks = {
  selected: () => game.selectedChar,
  select: (i) => {
    if (!wallet.owns(i)) return;
    game.selectCharacter(i);
    void saveValue(KEY_SKIN, String(i));
  },
  reward: () => { audio.play('clear'); if (vibration) haptic('success'); },
};

// 게임 고르기 (모두 무료)
function pickGame(i: number): void {
  if (i !== game.selectedGame) arcadeSwitch();   // 게임기 화면이 지지직
  game.selectGame(i);
  void saveValue(KEY_GAME, String(i));
  if (vibration) haptic('tickWeak');
}
// 조이스틱으로 옆 게임 (기울어지는 모습도)
function stepGame(dir: number): void {
  const n = Games.List.length;
  arcadeTilt(dir);
  pickGame((game.selectedGame + dir + n) % n);
}
const gameListHooks: GameListHooks = {
  selected: () => game.selectedGame,
  select: (i) => pickGame(i),
  best: (i) => { const b = game.bestRecord(i); return b > 0 ? formatRecord(Games.List[i].mode, b) : ''; },
};

let adBusy = false;
async function watchBonusAd(): Promise<void> {
  if (adBusy || adOffer <= 0 || !rewardedReady()) return;
  adBusy = true;
  const offer = adOffer;
  audio.setHidden(true);   // 광고 소리와 겹치지 않게
  const earned = await showRewarded();
  audio.setHidden(document.visibilityState === 'hidden');
  adBusy = false;
  if (earned && adOffer === offer) {
    wallet.add(offer);
    adOffer = 0;
    shopHooks.reward();
  }
}

function quit(): void {
  overlay = 'none';
  game.quitToMenu();
  finishGame();
}


// 진동: 너무 자주 울리지 않게 굵직한 순간에만
const HAPTIC_OF: Partial<Record<GameEvent, 'tickWeak' | 'basicMedium' | 'success' | 'error'>> = {
  brickBreak: 'tickWeak',
  hurt: 'basicMedium',
  devilStomp: 'basicMedium',
  stageClear: 'success',
  levelUp: 'success',
  gameOver: 'error',
};
let lastHaptic = -1;

const SOUND_OF: Record<GameEvent, SoundName> = {
  start: 'start',
  stageClear: 'clear',
  gameOver: 'over',
  brickBreak: 'brick',
  brickHit: 'brick',
  pickup: 'start',
  devilStomp: 'stomp',
  itemGood: 'start',
  itemBad: 'stomp',
  rowAdd: 'stomp',
  hurt: 'stomp',
  levelUp: 'start',
};

// ---------- 터치, 마우스 ----------
let downX = 0, downY = 0, downAt = 0, activePointer = -1;
let elfWalking = false;   // 엘프 모드: 지금 손가락이 자리 옮기기 중인지
let flagTap = false;      // 지뢰 모드: 이번 손가락은 깃발 꽂기라 패들을 움직이지 않음
// 꼬마 오르기: 화면 어디든 누르면 점프 (일시정지 버튼 빼고). 누르고 있는 손가락이 하나도 없으면 뗀 것
const climbHeld = new Set<number>();

function climbPress(e: PointerEvent): boolean {
  if (!(game.state === 'playing' && overlay === 'none' && game.climb)) return false;
  if (layout.pauseBtn.contains(lx(e), ly(e)) || hudSoundRect().contains(lx(e), ly(e))) return false;
  climbHeld.add(e.pointerId);
  game.climb.press();
  return true;
}

function climbRelease(e: PointerEvent): void {
  if (!climbHeld.delete(e.pointerId)) return;
  if (climbHeld.size === 0) game.climb?.release();
}

function hudSoundRect() { return game.state === 'playing' ? layout.soundBtn : layout.pauseBtn; }

function movePaddle(x: number): void {
  if (game.state !== 'playing' || overlay !== 'none' || game.swipe) return;
  game.setPaddleTarget(toWorld(layout, x, 0).x);
}

// 엘프 모드(스와이프): 누른 채 당겨서 조준
function swipeActive(): boolean { return game.state === 'playing' && overlay === 'none' && game.swipe !== null; }
// 엘프 모드: 끌어서 이동, 레벨업 카드 고르기
// 꼬마 땅따먹기: 방향키는 여러 개를 같이 누르면 대각선
const claimKeys = new Set<string>();
function claimKeyDir(): void {
  const x = (claimKeys.has('ArrowRight') ? 1 : 0) - (claimKeys.has('ArrowLeft') ? 1 : 0);
  const y = (claimKeys.has('ArrowDown') ? 1 : 0) - (claimKeys.has('ArrowUp') ? 1 : 0);
  const l = Math.hypot(x, y) || 1;
  game.claim?.hold(x / l, y / l);
}
// 꼬마 땅따먹기: 끌어서 움직이기
function claimActive(): boolean { return game.state === 'playing' && overlay === 'none' && game.claim !== null; }
// 미니게임: 입력을 그대로 넘김
function miniActive(): boolean { return game.state === 'playing' && overlay === 'none' && game.mini !== null; }
// 괴물 습격: 끌어서 걷기, 레벨 업 카드는 눌러서 고르기
function raidActive(): boolean { return game.state === 'playing' && overlay === 'none' && game.raid !== null; }
const raidKeys = new Set<string>();
function raidKeyDir(): void {
  if (!game.raid) return;
  game.raid.keyDir = [(raidKeys.has('ArrowRight') ? 1 : 0) - (raidKeys.has('ArrowLeft') ? 1 : 0), (raidKeys.has('ArrowDown') ? 1 : 0) - (raidKeys.has('ArrowUp') ? 1 : 0)];
}
// 꼬마 모드(괴물)도 같은 조작
let joyGrab = false;   // 홈: 조이스틱을 잡고 있는지
function joyMode() { return game.archer ?? game.horde; }
function archerActive(): boolean { return game.state === 'playing' && overlay === 'none' && joyMode() !== null; }

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();   // 휴대폰은 첫 터치 뒤에야 소리를 낼 수 있음
  if (!booted) return;
  if (climbPress(e)) return;
  if (activePointer !== -1 && e.pointerType === 'touch') return;   // 두 번째 손가락은 무시
  activePointer = e.pointerId;
  downX = lx(e); downY = ly(e); downAt = performance.now();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* 무시 */ }

  // 위쪽 버튼은 누르는 즉시 반응
  if (game.state === 'playing' && overlay === 'none' && layout.pauseBtn.contains(lx(e), ly(e))) {
    pause();
    return;
  }
  flagTap = false;
  // 메뉴: 오른쪽 위 톱니바퀴 = 설정
  if (game.state === 'menu' && overlay === 'none' && layout.soundBtn.contains(lx(e), ly(e))) { showSettings(); return; }
  if (game.state === 'menu') {
    const p = toWorld(layout, lx(e), ly(e)), my = p.y - menuTop();
    joyGrab = overlay === 'none' && (UI.gamePrev.contains(p.x, my) || UI.gameNext.contains(p.x, my));
  }
  if (claimActive()) {
    if (hudSoundRect().contains(lx(e), ly(e))) { toggleMute(); return; }
    game.claim!.joyBegin(lx(e), ly(e));
    return;
  }
  if (miniActive()) {
    if (hudSoundRect().contains(lx(e), ly(e))) { toggleMute(); return; }
    const p = toWorld(layout, lx(e), ly(e));
    game.mini!.down(p.x, p.y, lx(e), ly(e));
    return;
  }
  if (raidActive()) {
    if (hudSoundRect().contains(lx(e), ly(e))) { toggleMute(); return; }
    const r = game.raid!;
    if (r.choosing) { const p = toWorld(layout, lx(e), ly(e)); r.pick(p.x, p.y); }
    else r.joyBegin(lx(e), ly(e));
    return;
  }

  if (game.state === 'playing' && overlay === 'none' && game.mode === 'mine') {
    const p = toWorld(layout, lx(e), ly(e));
    if (game.toggleFlag(p.x, p.y)) { flagTap = true; return; }   // 벽돌을 누르면 깃발
  }
  if (archerActive()) {
    const p = toWorld(layout, lx(e), ly(e));
    const a = joyMode()!;
    if (a.choosing) a.pick(p.x, p.y);
    else a.joyBegin(lx(e), ly(e));   // 조이스틱은 화면 픽셀 기준
    return;
  }
  if (swipeActive()) {
    // 엘프: 흰 바닥선 아래는 걸어서 자리 옮기기, 그 위는 당겨서 조준
    const p = toWorld(layout, lx(e), ly(e));
    elfWalking = p.y >= game.paddle.y + game.paddle.h;   // 흰 바닥선 아래는 걷기, 위는 조준
    if (elfWalking) game.setPaddleTarget(p.x);
    else game.swipe!.aimBegin(p.x, p.y);
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
  if (game.state === 'menu' && joyGrab && e.pointerId === activePointer) { arcadeDrag((lx(e) - downX) / (44 * layout.scale)); return; }
  if (claimActive()) {
    // 땅따먹기: 누른 채 끌면 그 방향으로 걷고, 떼면 멈춤
    if (e.pointerId === activePointer) game.claim!.joyMove(lx(e), ly(e));
    return;
  }
  if (miniActive()) {
    if (e.pointerId === activePointer) { const p = toWorld(layout, lx(e), ly(e)); game.mini!.move(p.x, p.y, lx(e), ly(e)); }
    return;
  }
  if (raidActive()) {
    if (e.pointerId === activePointer) game.raid!.joyMove(lx(e), ly(e));
    return;
  }
  if (archerActive()) {
    if (e.pointerId === activePointer) joyMode()!.joyMove(lx(e), ly(e));
    return;
  }
  if (flagTap && e.pointerId === activePointer) return;

  if (swipeActive()) {
    if (e.pointerId === activePointer) {
      const p = toWorld(layout, lx(e), ly(e));
      if (elfWalking) game.setPaddleTarget(p.x);
      else game.swipe!.aimMove(p.x, p.y);
    }
    return;
  }
  movePaddle(lx(e));
});

function onTap(x: number, y: number): void {
  const p = toWorld(layout, x, y);
  const w = { x: p.x, y: p.y - menuTop() };   // 메뉴와 안내 창은 가운데 640 상자 기준
  if (overlay === 'pause') {
    if (UI.resume.contains(w.x, w.y)) overlay = 'none';
    else if (UI.quit.contains(w.x, w.y)) quit();
    else if (UI.howTo.contains(w.x, w.y)) openTutorial(game.mode, () => undefined, '확인');
    return;
  }
  if (overlay === 'exit') {
    if (UI.exitCancel.contains(w.x, w.y)) overlay = 'none';
    else if (UI.exitOk.contains(w.x, w.y)) void closeApp();
    return;
  }
  if (game.state === 'menu') {
    if (UI.charBtn.contains(w.x, w.y)) { openCharacters(shopHooks); return; }
    if (UI.gamePrev.contains(w.x, w.y)) { stepGame(-1); return; }
    if (UI.gameNext.contains(w.x, w.y)) { stepGame(1); return; }
    if (elfSave && Games.List[game.selectedGame].mode === 'swipe' && UI.newGame(adOffer > 0).contains(w.x, w.y)) { start(true); return; }
    if (UI.gameBox.contains(w.x, w.y)) { openGameList(gameListHooks); return; }
    const ranking = leaderboardAvailable();
    if (UI.start.contains(w.x, w.y)) { arcadePress('start'); window.setTimeout(() => start(), 140); }   // 버튼이 눌리는 게 보이고 나서 시작
    else if (UI.listBtn.contains(w.x, w.y)) { arcadePress('list'); openGameList(gameListHooks); }
    else if (UI.coin.contains(w.x, w.y)) openShop(shopHooks);
    else if (adOffer > 0 && UI.adBonus.contains(w.x, w.y)) void watchBonusAd();
    else if (ranking && UI.ranking.contains(w.x, w.y)) { arcadePress('rank'); void openLeaderboard(); }
  }
}

function endPointer(e: PointerEvent): void {
  climbRelease(e);
  if (e.pointerId !== activePointer) return;
  activePointer = -1;

  if (claimActive()) { game.claim!.joyEnd(); return; }
  if (raidActive()) { game.raid!.joyEnd(); return; }
  if (miniActive()) {
    const p = toWorld(layout, lx(e), ly(e));
    const tap = e.type === 'pointerup' && Math.hypot(lx(e) - downX, ly(e) - downY) < 12 && performance.now() - downAt < 400;
    game.mini!.up(p.x, p.y, tap);
    return;
  }
  if (archerActive()) { joyMode()!.joyEnd(); return; }
  if (swipeActive()) {
    if (e.type === 'pointerup') game.swipe!.aimRelease();
    else game.swipe!.aimCancel();
    return;
  }
  const moved = Math.hypot(lx(e) - downX, ly(e) - downY);
  if (game.state === 'menu') {
    arcadeDrag(0);
    const dx = lx(e) - downX, dy = ly(e) - downY;
    // 조이스틱을 잡고 밀면 민 쪽으로, 다른 곳은 넘기듯 (왼쪽으로 밀면 다음)
    if (e.type === 'pointerup' && overlay === 'none' && !isSheetOpen() && Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.4) { stepGame((joyGrab ? dx > 0 : dx < 0) ? 1 : -1); joyGrab = false; return; }
    joyGrab = false;
  }
  if (e.type === 'pointerup' && moved < 12 && performance.now() - downAt < 600) onTap(lx(e), ly(e));
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// 키보드 (PC 브라우저에서 확인할 때)
window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (!booted) return;
  if (isSheetOpen()) { if (e.key === 'Escape') sheetBack(); return; }
  if (e.key === 'm' || e.key === 'M') toggleMute();
  else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (overlay === 'pause') overlay = 'none'; else pause();
  } else if (game.state === 'menu' && overlay === 'none') {
    if (e.key === ' ' || e.key === 'Enter') start();
    else if (e.key === 'ArrowLeft') stepGame(-1);
    else if (e.key === 'ArrowRight') stepGame(1);
    else if (e.key === 'c' || e.key === 'C') openCharacters(shopHooks);
  } else if (overlay === 'pause' && (e.key === ' ' || e.key === 'Enter')) overlay = 'none';
  else if (game.claim && overlay === 'none') {   // 땅따먹기: 방향키를 누르고 있는 동안 걸음
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { claimKeys.add(e.key); claimKeyDir(); }
  }
  else if (game.mini && overlay === 'none') { if (!e.repeat) game.mini.key(e.key, true); }
  else if (game.raid && overlay === 'none') {   // 괴물 습격: 방향키로 걷기, 1~3 으로 카드 고르기
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { raidKeys.add(e.key); raidKeyDir(); }
    else if (game.raid.choosing && e.key >= '1' && e.key <= '3') { const c = game.raid.cardRect(Number(e.key) - 1); game.raid.pick(c.x + 1, c.y + 1); }
  }
  else if (game.horde && overlay === 'none') {   // 꼬마: 방향키로 이동
    const k = game.horde.keyDir;
    if (e.key === 'ArrowLeft') k.x = -1;
    else if (e.key === 'ArrowRight') k.x = 1;
    else if (e.key === 'ArrowUp') k.y = -1;
    else if (e.key === 'ArrowDown') k.y = 1;
  }
  else if (game.climb && overlay === 'none') {   // 꼬마 오르기: 방향키로 방향 바꾸고 위/스페이스로 점프
    if (e.key === 'ArrowLeft') game.climb.setDir(-1);
    else if (e.key === 'ArrowRight') game.climb.setDir(1);
    else if ((e.key === 'ArrowUp' || e.key === ' ') && !e.repeat) game.climb.press();
  }
});
window.addEventListener('keyup', (e) => {
  if (game.claim && claimKeys.delete(e.key)) claimKeyDir();
  if (game.raid && raidKeys.delete(e.key)) raidKeyDir();
  game.mini?.key(e.key, false);
  if (game.horde) {
    const k = game.horde.keyDir;
    if ((e.key === 'ArrowLeft' && k.x < 0) || (e.key === 'ArrowRight' && k.x > 0)) k.x = 0;
    if ((e.key === 'ArrowUp' && k.y < 0) || (e.key === 'ArrowDown' && k.y > 0)) k.y = 0;
  }
  if (game.climb && (e.key === 'ArrowUp' || e.key === ' ')) game.climb.release();
});

// ---------- 앱 전환, 뒤로가기 ----------
// 앱을 내리면 소리를 멈추고 게임은 일시정지. 돌아오면 소리는 바로 다시 나고, 게임은 '계속하기'를 누르면 이어짐
document.addEventListener('visibilitychange', () => {
  const hidden = document.visibilityState === 'hidden';
  audio.setHidden(hidden);
  if (hidden) pause();
});

onAppState((active) => {
  audio.setHidden(!active);
  if (!active) pause();
});

// 안드로이드 뒤로가기: 플레이 중 → 일시정지, 창이 떠 있으면 닫기, 메뉴 → 종료 확인
onBack(() => {
  if (sheetBack()) return;   // 떠 있는 창부터 닫음
  if (overlay !== 'none') overlay = 'none';
  else if (game.state === 'playing') pause();
  else overlay = 'exit';
});

// ---------- 게임 루프 ----------
let last = performance.now();
let lastBrickSound = -1;
// 로딩: 그림과 저장값을 다 불러올 때까지 로딩 화면, 끝나면 홈으로 살짝 사라지며 넘어감
let bootDone = false, booted = false, bootFade = 0, bootShown = 0;
const BOOT_FADE = 0.3;
function frame(now: number): void {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.1, rawDt);
  last = now;
  clock += dt;

  if (!booted) {
    const target = bootDone ? 1 : loading.total > 0 ? loading.done / loading.total * 0.95 : 0;
    bootShown += (target - bootShown) * Math.min(1, dt * 12);
    if (bootDone && bootShown > 0.97 && clock > 0.4) { booted = true; bootFade = BOOT_FADE; }
    renderLoading(ctx, layout, bootShown, clock);
    requestAnimationFrame(frame);
    return;
  }

  watchPerf(rawDt);
  if (overlay === 'none') game.update(dt);
  else if (game.state === 'menu') game.update(dt);   // 메뉴 카드 움직임은 계속

  for (const e of game.takeEvents()) {
    const name = SOUND_OF[e];
    // 공이 많을 때 같은 소리가 한꺼번에 겹치지 않게
    if (name === 'brick' && clock - lastBrickSound < 0.04) continue;
    if (name === 'brick') lastBrickSound = clock;
    audio.play(name);
    if (vibration) {
      const h = HAPTIC_OF[e];
      if (h && (h !== 'tickWeak' || clock - lastHaptic > 0.08)) { haptic(h); lastHaptic = clock; }
    }
    if (e === 'gameOver') {
      if (game.mode === 'swipe') clearElfSave();   // 끝난 판은 저장 지움 (룬 돌 깨기)
      finishGame();
    }
  }

  // 엘프(스와이프): 새 라운드 조준 단계가 될 때마다 중간 저장
  const sw = game.swipe;
  if (sw && sw.phase === 'aim' && sw.round !== savedRound) {
    savedRound = sw.round;
    elfSave = sw.save();
    void saveValue(KEY_ELF_SAVE, JSON.stringify(elfSave));
  }

  keepScreenOn(game.state === 'playing' && overlay === 'none');   // 게임 중엔 화면이 꺼지지 않게

  render(ctx, layout, game, {
    overlay,
    muted: audio.muted,
    rankingVisible: leaderboardAvailable(),
    elfSaveRound: elfSave ? elfSave.round : 0,
    time: clock,
    coins: wallet.coins,
    adOffer,
    adReady: rewardedReady(),
  });
  if (bootFade > 0) { renderLoading(ctx, layout, 1, clock, bootFade / BOOT_FADE); bootFade -= dt; }
  requestAnimationFrame(frame);
}

// 개발 서버에서만: 브라우저 자동 확인용으로 게임 상태를 노출
if (import.meta.env.DEV) {
  const w = window as unknown as { __game: Game; __layout: () => Layout; __audio: Audio; __menuTop: () => number; __wallet: typeof wallet };
  w.__menuTop = menuTop;
  w.__wallet = wallet;
  w.__game = game;
  w.__audio = audio;
  w.__layout = () => layout;
  (window as unknown as { __games: typeof Games.List }).__games = Games.List;
}

resize();
const saved = loadSaved();
void saved.then(() => { initAds(); return initIap(); });
void Promise.all([saved.catch(() => undefined), loadImages()]).then(() => { bootDone = true; });
setTimeout(() => { bootDone = true; }, 10000);   // 너무 오래 걸리면 그냥 시작 (없는 그림은 대신 그림)
requestAnimationFrame((t) => { last = t; frame(t); });
