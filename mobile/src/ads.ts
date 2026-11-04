// 보상형 광고: 끝까지 보면 코인
// - 토스 앱: 앱인토스 통합 광고 (토스 광고 + AdMob)
// - 안드로이드 앱: AdMob (유럽 등 동의가 필요한 곳은 먼저 동의 창)
// - 개발 서버: 3초짜리 가짜 광고로 흐름만 확인
// 광고는 미리 불러 두고(load), 누르면 바로 보여 준다(show). 보여 준 뒤에는 다음 광고를 다시 불러 둔다
import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';
import { ADMOB, ENABLE_ADS, TOSS_ADS } from './adconfig';
import { isInToss, isNative } from './platform';
import { closeSheet, el, openSheet } from './sheet';

type Backend = 'toss' | 'admob' | 'dev' | 'none';
let backend: Backend = 'none';
let ready = false;          // 바로 보여 줄 광고가 있는지
let loading = false;
let retryTimer = 0;
const listeners: (() => void)[] = [];

const notify = () => { for (const cb of listeners) cb(); };
export function onAdReady(cb: () => void): void { listeners.push(cb); }

// 이 환경에서 보상형 광고를 쓸 수 있는지 (버튼을 보여 줄지)
export function rewardedSupported(): boolean { return backend !== 'none'; }
export function rewardedReady(): boolean { return ready; }

function setReady(v: boolean): void {
  if (ready === v) return;
  ready = v;
  notify();
}

// 실패하면 조금 기다렸다 다시 (인터넷이 잠깐 끊긴 경우)
function retryLater(ms = 30000): void {
  clearTimeout(retryTimer);
  retryTimer = window.setTimeout(preload, ms);
}

// ---------- 토스 ----------
function tossPreload(): void {
  loading = true;
  try {
    loadFullScreenAd({
      options: { adGroupId: TOSS_ADS.REWARDED },
      onEvent: (e) => { if (e.type === 'loaded') { loading = false; setReady(true); } },
      onError: () => { loading = false; setReady(false); retryLater(); },
    });
  } catch { loading = false; retryLater(); }
}

function tossShow(): Promise<boolean> {
  return new Promise((resolve) => {
    let earned = false;
    let done = false;
    let started = false;
    const finish = () => {
      if (done) return;
      done = true;
      setReady(false);
      resolve(earned);
      preload();   // 다음 광고 미리
    };
    // 광고가 아예 뜨지 않으면 기다리지 않음
    setTimeout(() => { if (!started) finish(); }, 8000);
    try {
      showFullScreenAd({
        options: { adGroupId: TOSS_ADS.REWARDED },
        onEvent: (e) => {
          started = true;
          if (e.type === 'userEarnedReward') earned = true;
          else if (e.type === 'dismissed' || e.type === 'failedToShow') finish();
        },
        onError: () => finish(),
      });
    } catch { finish(); }
  });
}

// ---------- AdMob (안드로이드 앱) ----------
const admob = () => import('@capacitor-community/admob');
let admobInit: Promise<boolean> | null = null;

// 처음 한 번: 동의 확인(필요한 지역만 창이 뜸) → 광고 SDK 시작
function admobStart(): Promise<boolean> {
  admobInit ??= (async () => {
    try {
      const { AdMob, AdmobConsentStatus } = await admob();
      const info = await AdMob.requestConsentInfo();
      if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
        await AdMob.showConsentForm();
      }
      await AdMob.initialize({ initializeForTesting: ADMOB.TEST_ADS });
      return true;
    } catch { return false; }
  })();
  return admobInit;
}

async function admobPreload(): Promise<void> {
  loading = true;
  try {
    if (!(await admobStart())) throw new Error('init');
    const { AdMob } = await admob();
    await AdMob.prepareRewardVideoAd({ adId: ADMOB.REWARDED, isTesting: ADMOB.TEST_ADS });
    loading = false;
    setReady(true);
  } catch {
    loading = false;
    setReady(false);
    retryLater();
  }
}

async function admobShow(): Promise<boolean> {
  const { AdMob, RewardAdPluginEvents } = await admob();
  return new Promise((resolve) => {
    let earned = false;
    let done = false;
    const handles: { remove: () => Promise<void> }[] = [];
    const finish = () => {
      if (done) return;
      done = true;
      for (const h of handles) void h.remove();
      setReady(false);
      resolve(earned);
      void admobPreload();
    };
    void Promise.all([
      AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { earned = true; }),
      AdMob.addListener(RewardAdPluginEvents.Dismissed, finish),
      AdMob.addListener(RewardAdPluginEvents.FailedToShow, finish),
    ]).then((hs) => {
      handles.push(...hs);
      if (done) for (const h of hs) void h.remove();
      AdMob.showRewardVideoAd().then(() => { earned = true; }, finish);
    }, finish);
  });
}

// ---------- 개발용 가짜 광고 ----------
function devShow(): Promise<boolean> {
  return new Promise((resolve) => {
    const body = el('div');
    const p = el('p', undefined, '광고 3');
    body.append(el('p', 'muted', '개발 서버에서만 보이는 가짜 광고예요.'), p);
    let n = 3;
    let earned = false;
    openSheet({ title: '광고', body, onClose: () => resolve(earned) });
    const t = setInterval(() => {
      n--;
      p.textContent = n > 0 ? `광고 ${n}` : '다 봤어요!';
      if (n <= 0) { clearInterval(t); earned = true; setTimeout(() => { closeSheet(true); }, 400); }
    }, 1000);
  });
}

// ---------- 공통 ----------
export function initAds(): void {
  if (!ENABLE_ADS) return;
  try {
    if (import.meta.env.DEV) backend = 'dev';   // 개발 서버의 토스 흉내 환경은 광고 이벤트가 오지 않아서
    else if (isInToss()) backend = loadFullScreenAd.isSupported() && showFullScreenAd.isSupported() ? 'toss' : 'none';
    else if (isNative()) backend = 'admob';
  } catch { backend = 'none'; }
  preload();
}

export function preload(): void {
  if (ready || loading) return;
  if (backend === 'toss') tossPreload();
  else if (backend === 'admob') void admobPreload();
  else if (backend === 'dev') setReady(true);
}

// 광고를 보여 주고, 끝까지 봐서 보상을 받을 수 있으면 true
export async function showRewarded(): Promise<boolean> {
  if (!ready) { preload(); return false; }
  if (backend === 'toss') return tossShow();
  if (backend === 'admob') return admobShow();
  if (backend === 'dev') return devShow();
  return false;
}
