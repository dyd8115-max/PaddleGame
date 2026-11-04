// 코인과 해금한 캐릭터 (지갑). 한 덩어리로 저장해서 코인을 쓰고 캐릭터를 얻는 일이 반만 저장되는 일이 없게
import { Characters } from './game/objects';
import { loadValue, saveValue } from './platform';

export const AD_COINS = 30;      // 상점에서 광고 한 번 보면 받는 코인
export const AD_DAILY = 3;       // 하루에 광고로 받을 수 있는 횟수
const KEEP_ORDERS = 60;          // 이미 지급한 결제 번호를 몇 개까지 기억할지 (두 번 지급 막기)

interface WalletData {
  coins: number;
  owned: string[];       // 해금한 캐릭터 id
  adDay: string;         // 광고 코인을 받은 날 (YYYY-MM-DD)
  adCount: number;       // 그날 받은 횟수
  orders: string[];      // 이미 코인을 준 결제 번호
}

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

class Wallet {
  private d: WalletData = { coins: 0, owned: ['kid'], adDay: '', adCount: 0, orders: [] };
  private key = 'wallet';
  private listeners: (() => void)[] = [];

  get coins(): number { return this.d.coins; }

  // 토스는 계정마다 지갑을 따로 (같은 기기를 다른 토스 계정이 쓸 때 섞이지 않게)
  async load(userKey: string | null): Promise<void> {
    this.key = userKey ? `wallet_${userKey.slice(0, 16)}` : 'wallet';
    const raw = await loadValue(this.key);
    if (!raw) return;
    try {
      const v = JSON.parse(raw) as Partial<WalletData>;
      this.d = {
        coins: Math.max(0, Math.floor(Number(v.coins) || 0)),
        owned: Array.isArray(v.owned) ? [...new Set(['kid', ...v.owned.map(String)])] : ['kid'],
        adDay: typeof v.adDay === 'string' ? v.adDay : '',
        adCount: Number(v.adCount) || 0,
        orders: Array.isArray(v.orders) ? v.orders.map(String).slice(-KEEP_ORDERS) : [],
      };
    } catch { /* 깨진 저장은 무시 */ }
    this.changed(false);
  }

  onChange(cb: () => void): void { this.listeners.push(cb); }

  private changed(save = true): void {
    if (save) void saveValue(this.key, JSON.stringify(this.d));
    for (const cb of this.listeners) cb();
  }

  owns(charIndex: number): boolean {
    const c = Characters.List[charIndex];
    return !!c && (c.price === 0 || this.d.owned.includes(c.id));
  }

  add(n: number): void {
    if (n <= 0) return;
    this.d.coins += Math.floor(n);
    this.changed();
  }

  // 코인으로 캐릭터 해금. 코인이 모자라면 false
  unlock(charIndex: number): boolean {
    const c = Characters.List[charIndex];
    if (!c || this.owns(charIndex) || this.d.coins < c.price) return false;
    this.d.coins -= c.price;
    this.d.owned.push(c.id);
    this.changed();
    return true;
  }

  // 예전 버전에서 무료로 하던 캐릭터는 그대로 쓰게 (기록이 있으면 해금)
  grantFree(ids: string[]): void {
    const add = ids.filter((id) => !this.d.owned.includes(id));
    if (!add.length) return;
    this.d.owned.push(...add);
    this.changed();
  }

  // ---------- 광고 코인 ----------
  adLeft(): number {
    return this.d.adDay === today() ? Math.max(0, AD_DAILY - this.d.adCount) : AD_DAILY;
  }

  useAdReward(): void {
    const t = today();
    if (this.d.adDay !== t) { this.d.adDay = t; this.d.adCount = 0; }
    this.d.adCount++;
    this.d.coins += AD_COINS;
    this.changed();
  }

  // ---------- 결제 ----------
  // 결제 번호마다 한 번만 지급. 이미 준 번호면 false (앱이 중간에 꺼졌다 다시 켜질 때 두 번 주지 않게)
  grantOrder(orderId: string, coins: number): boolean {
    if (this.d.orders.includes(orderId)) return false;
    this.d.orders.push(orderId);
    if (this.d.orders.length > KEEP_ORDERS) this.d.orders.splice(0, this.d.orders.length - KEEP_ORDERS);
    this.d.coins += coins;
    this.changed();
    return true;
  }
}

export const wallet = new Wallet();
