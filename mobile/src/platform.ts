// 앱인토스 SDK 연결부. 일반 브라우저(개발 중)에서는 SDK 호출이 실패하므로 브라우저 기능으로 대신한다.
import { Game, SafeArea, Screen, Storage, getOperationalEnvironment, graniteEvent } from '@apps-in-toss/web-framework';

export interface Insets { top: number; bottom: number; left: number; right: number; }

// 토스 앱(또는 샌드박스 앱) 안에서 실행 중인지
let inToss = false;
try {
  const env = getOperationalEnvironment();
  inToss = env === 'toss' || env === 'sandbox';
} catch {
  inToss = false;
}
export const isInToss = (): boolean => inToss;

// 너무 오래 걸리는 SDK 호출은 실패로 본다
function withTimeout<T>(p: Promise<T>, ms = 1500): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// ---------- 저장 ----------
export async function loadValue(key: string): Promise<string | null> {
  if (inToss) {
    try { return await withTimeout(Storage.getItem(key)); } catch { /* 아래로 */ }
  }
  try { return localStorage.getItem(key); } catch { return null; }
}

export async function saveValue(key: string, value: string): Promise<void> {
  if (inToss) {
    try { await withTimeout(Storage.setItem(key, value)); return; } catch { /* 아래로 */ }
  }
  try { localStorage.setItem(key, value); } catch { /* 저장 못 해도 게임은 계속 */ }
}

// ---------- 화면 안전 영역 ----------
// 토스 앱에서는 SDK 값, 브라우저에서는 CSS env(safe-area-inset-*) 값
function cssInsets(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);' +
    'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);';
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const v: Insets = {
    top: parseFloat(s.paddingTop) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
    right: parseFloat(s.paddingRight) || 0,
  };
  probe.remove();
  return v;
}

export function getInsets(): Insets {
  if (inToss) {
    try {
      const v = SafeArea.get();
      if (v) return { top: v.top, bottom: v.bottom, left: v.left, right: v.right };
    } catch { /* 아래로 */ }
  }
  return cssInsets();
}

export function onInsetsChange(cb: (v: Insets) => void): void {
  if (!inToss) return;
  try {
    SafeArea.subscribe({ onEvent: (v) => cb({ top: v.top, bottom: v.bottom, left: v.left, right: v.right }) });
  } catch { /* 지원 안 하면 무시 */ }
}

// ---------- 뒤로가기 ----------
// 안드로이드 뒤로가기를 게임이 직접 처리한다 (플레이 중이면 일시정지 등)
export function onBack(cb: () => void): void {
  if (!inToss) return;
  try {
    graniteEvent.addEventListener('backEvent', { onEvent: cb });
  } catch { /* 무시 */ }
}

export async function closeApp(): Promise<void> {
  if (!inToss) return;
  try { await Screen.close(); } catch { /* 무시 */ }
}

// ---------- 게임센터 리더보드 ----------
export function leaderboardAvailable(): boolean {
  if (!inToss) return false;
  try { return Game.setLeaderboardScore.isSupported(); } catch { return false; }
}

export async function submitScore(score: number): Promise<void> {
  if (!leaderboardAvailable() || score <= 0) return;
  try { await withTimeout(Game.setLeaderboardScore({ score: String(score) }), 5000); } catch { /* 실패해도 게임은 계속 */ }
}

export async function openLeaderboard(): Promise<void> {
  if (!inToss) return;
  try {
    if (Game.openLeaderboard.isSupported()) await Game.openLeaderboard();
  } catch { /* 무시 */ }
}
