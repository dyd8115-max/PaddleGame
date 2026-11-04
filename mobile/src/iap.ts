// 현금 결제로 코인 사기
// - 토스 앱: 앱인토스 인앱결제 (토스 콘솔에 같은 sku 로 상품 등록)
// - 안드로이드 앱: 구글 플레이 결제 (플레이 콘솔 → 수익 창출 → 인앱 상품에 같은 sku 로 등록)
//
// 코인은 '지급 → 저장 → 결제 마무리' 순서로 처리한다. 지급 전에 앱이 꺼지면 다음에 켤 때 미지급 결제를 찾아 지급한다.
// 결제 번호를 지갑에 기억해서 같은 결제로 두 번 지급하지 않는다.
import { IAP } from '@apps-in-toss/web-framework';
import { COIN_PACKS, ENABLE_IAP, type CoinPack } from './adconfig';
import { wallet } from './economy';
import { isInToss, isNative } from './platform';

type Backend = 'toss' | 'play' | 'none';
let backend: Backend = 'none';
const prices = new Map<string, string>();   // sku → 표시 가격 (예: ₩1,200)

export type BuyResult = 'ok' | 'pending' | 'cancel' | 'error';

const packOf = (sku: string): CoinPack | undefined => COIN_PACKS.find((p) => p.sku === sku);
const purchases = () => import('@capgo/native-purchases');

export function iapSupported(): boolean { return backend !== 'none'; }
export function priceOf(sku: string): string | undefined { return prices.get(sku); }

export async function initIap(): Promise<void> {
  if (!ENABLE_IAP) return;
  try {
    if (isInToss()) backend = IAP.createOneTimePurchaseOrder.isSupported() ? 'toss' : 'none';
    else if (isNative()) {
      const { NativePurchases } = await purchases();
      backend = (await NativePurchases.isBillingSupported()).isBillingSupported ? 'play' : 'none';
    }
  } catch { backend = 'none'; }
  if (backend === 'none') return;
  await loadPrices();
  await restorePending();
}

// 상점에 보여 줄 가격. 콘솔에 상품이 없으면 빈 채로 둔다 (그 상품은 상점에 안 보임)
async function loadPrices(): Promise<void> {
  try {
    if (backend === 'toss') {
      if (!IAP.getProductItemList.isSupported()) return;
      const r = await IAP.getProductItemList();
      for (const p of r.products) prices.set(p.sku, p.displayAmount);
    } else if (backend === 'play') {
      const { NativePurchases, PURCHASE_TYPE } = await purchases();
      const r = await NativePurchases.getProducts({ productIdentifiers: COIN_PACKS.map((p) => p.sku), productType: PURCHASE_TYPE.INAPP });
      for (const p of r.products) prices.set(p.identifier, p.priceString);
    }
  } catch { /* 가격을 못 받으면 상점에 결제 칸이 안 보임 */ }
}

// 결제는 끝났는데 코인을 못 받은 주문 찾아서 지급
export async function restorePending(): Promise<number> {
  let granted = 0;
  try {
    if (backend === 'toss') {
      if (!IAP.getPendingOrders.isSupported()) return 0;
      const r = await IAP.getPendingOrders();
      for (const o of r.orders) {
        const pack = packOf(o.sku);
        if (!pack) continue;
        if (wallet.grantOrder(`toss:${o.orderId}`, pack.coins)) granted += pack.coins;
        if (IAP.completeProductGrant.isSupported()) await IAP.completeProductGrant({ params: { orderId: o.orderId } });
      }
    } else if (backend === 'play') {
      const { NativePurchases, PURCHASE_TYPE } = await purchases();
      const r = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
      for (const t of r.purchases) {
        const pack = packOf(t.productIdentifier);
        if (!pack || t.purchaseState !== '1' || !t.purchaseToken) continue;   // '1' = 결제 완료 (대기 중은 건너뜀)
        if (wallet.grantOrder(`play:${t.orderId ?? t.purchaseToken}`, pack.coins)) granted += pack.coins;
        await NativePurchases.consumePurchase({ purchaseToken: t.purchaseToken });   // 다시 살 수 있게 소비
      }
    }
  } catch { /* 다음에 켤 때 다시 */ }
  return granted;
}

export async function buy(sku: string): Promise<BuyResult> {
  const pack = packOf(sku);
  if (!pack) return 'error';
  if (backend === 'toss') return tossBuy(pack);
  if (backend === 'play') return playBuy(pack);
  return 'error';
}

function tossBuy(pack: CoinPack): Promise<BuyResult> {
  return new Promise((resolve) => {
    let cleanup: (() => void) | null = null;
    let done = false;
    const finish = (r: BuyResult) => {
      if (done) return;
      done = true;
      try { cleanup?.(); } catch { /* 무시 */ }
      resolve(r);
    };
    try {
      cleanup = IAP.createOneTimePurchaseOrder({
        options: {
          sku: pack.sku,
          // 토스가 결제를 마친 뒤 부름: 여기서 코인을 주고 true 를 돌려주면 주문 완료
          processProductGrant: ({ orderId }) => {
            wallet.grantOrder(`toss:${orderId}`, pack.coins);
            return true;
          },
        },
        onEvent: (e) => { if (e.type === 'success') finish('ok'); },
        onError: (err) => {
          const code = (err as { code?: string } | null)?.code ?? '';
          finish(/cancel/i.test(String(code)) || /cancel/i.test(String(err)) ? 'cancel' : 'error');
        },
      });
    } catch { finish('error'); }
  });
}

async function playBuy(pack: CoinPack): Promise<BuyResult> {
  try {
    const { NativePurchases, PURCHASE_TYPE } = await purchases();
    const t = await NativePurchases.purchaseProduct({
      productIdentifier: pack.sku,
      productType: PURCHASE_TYPE.INAPP,
      isConsumable: false,              // 코인을 저장한 뒤 직접 소비한다
      autoAcknowledgePurchases: false,
    });
    if (t.purchaseState !== '1' || !t.purchaseToken) return 'pending';   // 편의점 결제 등 아직 안 끝난 결제
    wallet.grantOrder(`play:${t.orderId ?? t.purchaseToken}`, pack.coins);
    await NativePurchases.consumePurchase({ purchaseToken: t.purchaseToken });
    return 'ok';
  } catch (e) {
    return /cancel/i.test(String((e as { message?: string })?.message ?? e)) ? 'cancel' : 'error';
  }
}
