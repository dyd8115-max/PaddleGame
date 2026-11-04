// 상점: 캐릭터 해금, 광고 보고 코인, 현금으로 코인 사기
import { COIN_PACKS } from './adconfig';
import { rewardedReady, rewardedSupported, showRewarded } from './ads';
import { characterThumb } from './assets';
import { AD_COINS, wallet } from './economy';
import { Characters } from './game/objects';
import { buy, iapSupported, priceOf } from './iap';
import { closeSheet, el, isSheetOpen, openSheet } from './sheet';

export interface ShopHooks {
  selected: () => number;            // 지금 고른 캐릭터
  select: (i: number) => void;       // 캐릭터 고르기 (해금한 것만)
  reward: () => void;                // 코인을 받았을 때 (소리·진동)
}

const CSS = `
.coin-i{display:inline-block;width:1em;height:1em;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff3a8,#ffcf3a 45%,#d99a10);
  box-shadow:inset 0 0 0 2px #b97a00;vertical-align:-0.14em;margin-right:4px}
.shop-wallet{display:flex;align-items:center;justify-content:center;gap:6px;margin:2px 0 6px;font-size:22px;font-weight:800;color:#ffd84d}
.shop-item{display:flex;align-items:center;gap:12px;padding:10px 2px;border-bottom:1px solid rgba(255,255,255,.08)}
.shop-item:last-child{border-bottom:0}
.shop-item img{width:46px;height:55px;object-fit:contain;flex:none}
.shop-item .ic{width:46px;height:46px;flex:none;display:flex;align-items:center;justify-content:center;font-size:30px}
.shop-item .t{flex:1;min-width:0}
.shop-item .t b{display:block;font-size:16px}
.shop-item .t span{display:block;font-size:13px;color:#9aa0b4}
.shop-buy{flex:none;min-width:84px;height:40px;padding:0 12px;border-radius:12px;border:0;background:#ffd84d;color:#1e2232;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit}
.shop-buy.sub{background:#2a3046;color:#fff;border:1px solid rgba(255,255,255,.2)}
.shop-buy.off{background:#2a3046;color:#7d8296;border:1px solid rgba(255,255,255,.1);cursor:default}
.shop-note{font-size:12px;color:#9aa0b4;line-height:1.5;margin-top:12px}
.unlock-img{display:block;width:120px;height:144px;object-fit:contain;margin:0 auto 6px}
`;

function injectCss(): void {
  if (document.getElementById('shop-css')) return;
  const st = document.createElement('style');
  st.id = 'shop-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

const fmt = (n: number) => n.toLocaleString('ko-KR');
function coinText(n: number): HTMLElement {
  const s = el('span');
  s.append(el('i', 'coin-i'), document.createTextNode(fmt(n)));
  return s;
}

function thumb(i: number): HTMLElement {
  const url = characterThumb(i);
  if (!url) return el('div', 'ic', '🙂');
  const img = el('img');
  img.src = url;
  img.alt = Characters.List[i].name;
  return img;
}

function message(title: string, text: string, back?: () => void): void {
  openSheet({
    title, body: `<p>${text}</p>`, onClose: back,
    buttons: [{ label: '확인', primary: true, onClick: () => { closeSheet(false); back?.(); } }],
  });
}

// ---------- 상점 ----------
export function openShop(h: ShopHooks): void {
  injectCss();
  const body = el('div');
  const top = el('div', 'shop-wallet');
  top.appendChild(coinText(wallet.coins));
  body.appendChild(top);

  // 캐릭터
  body.appendChild(el('div', 'sheet-sec', '캐릭터'));
  Characters.List.forEach((c, i) => {
    const row = el('div', 'shop-item');
    const t = el('div', 't');
    t.append(el('b', undefined, c.name), el('span', undefined, c.desc));
    let btn: HTMLButtonElement;
    if (wallet.owns(i)) {
      const using = h.selected() === i;
      btn = el('button', 'shop-buy ' + (using ? 'off' : 'sub'), using ? '사용 중' : '고르기');
      if (!using) btn.onclick = () => { h.select(i); openShop(h); };
    } else {
      btn = el('button', 'shop-buy');
      btn.appendChild(coinText(c.price));
      btn.onclick = () => openUnlock(i, h, () => openShop(h));
    }
    row.append(thumb(i), t, btn);
    body.appendChild(row);
  });

  // 광고 보고 코인
  if (rewardedSupported()) {
    body.appendChild(el('div', 'sheet-sec', '무료 코인'));
    const row = el('div', 'shop-item');
    const t = el('div', 't');
    const left = wallet.adLeft();
    t.append(el('b', undefined, `광고 보고 ${AD_COINS} 코인`), el('span', undefined, left > 0 ? `오늘 ${left}번 더 받을 수 있어요` : '오늘은 다 받았어요. 내일 다시 와요'));
    const ok = left > 0 && rewardedReady();
    const btn = el('button', 'shop-buy' + (ok ? '' : ' off'), left > 0 && !rewardedReady() ? '준비 중' : '받기');
    if (ok) {
      btn.onclick = async () => {
        btn.disabled = true;
        const earned = await showRewarded();
        if (earned) { wallet.useAdReward(); h.reward(); }
        if (!isSheetOpen() || earned) openShop(h);
      };
    }
    row.append(el('div', 'ic', '🎬'), t, btn);
    body.appendChild(row);
  }

  // 현금으로 코인 사기 (가격을 받아 온 상품만)
  const packs = iapSupported() ? COIN_PACKS.filter((p) => priceOf(p.sku)) : [];
  if (packs.length) {
    body.appendChild(el('div', 'sheet-sec', '코인 충전'));
    for (const p of packs) {
      const row = el('div', 'shop-item');
      const t = el('div', 't');
      const name = el('b');
      name.appendChild(coinText(p.coins));
      t.append(name, el('span', undefined, p.bonus ? `보너스 ${p.bonus}` : '기본'));
      const btn = el('button', 'shop-buy', priceOf(p.sku)!);
      btn.onclick = async () => {
        btn.disabled = true;
        const r = await buy(p.sku);
        if (r === 'ok') { h.reward(); message('충전 완료', `${fmt(p.coins)} 코인을 받았어요.`, () => openShop(h)); }
        else if (r === 'pending') message('결제 대기 중', '결제가 끝나면 다음에 앱을 켤 때 코인이 들어와요.', () => openShop(h));
        else if (r === 'error') message('결제하지 못했어요', '잠시 뒤에 다시 해 주세요. 돈이 빠져나갔는데 코인이 없으면 앱을 다시 켜 주세요.', () => openShop(h));
        else openShop(h);
      };
      row.append(el('div', 'ic', '💰'), t, btn);
      body.appendChild(row);
    }
    body.appendChild(el('p', 'shop-note',
      '코인과 캐릭터는 이 기기에 저장돼요. 앱을 지우거나 앱 데이터를 지우면 사라지고 되살릴 수 없어요. ' +
      '사용하지 않은 코인의 결제 취소와 환불은 결제한 곳(구글 플레이 또는 토스)의 환불 절차를 따라요. ' +
      '미성년자가 법정대리인의 동의 없이 결제한 경우 취소할 수 있어요.'));
  }

  openSheet({ title: '상점', body });
}

// ---------- 캐릭터 해금 ----------
export function openUnlock(i: number, h: ShopHooks, back?: () => void): void {
  injectCss();
  const c = Characters.List[i];
  const body = el('div');
  const url = characterThumb(i);
  if (url) {
    const img = el('img', 'unlock-img');
    img.src = url;
    body.appendChild(img);
  }
  const enough = wallet.coins >= c.price;
  const p = el('p');
  p.style.textAlign = 'center';
  p.append(el('b', undefined, c.name), el('br'), document.createTextNode(c.desc));
  body.appendChild(p);
  const need = el('p');
  need.style.textAlign = 'center';
  need.append(coinText(c.price), document.createTextNode(enough ? ' 코인으로 해금할까요?' : ` 코인이 필요해요 (지금 ${fmt(wallet.coins)})`));
  body.appendChild(need);
  const cancel = () => { closeSheet(false); back?.(); };
  openSheet({
    title: `${c.name} 해금`, body, onClose: back,
    buttons: enough
      ? [{ label: '취소', onClick: cancel },
        { label: '해금하기', primary: true, onClick: () => {
          if (wallet.unlock(i)) { h.select(i); h.reward(); }
          closeSheet(false);
          message('해금 완료', `이제 ${c.name}(으)로 할 수 있어요!`, back);
        } }]
      : [{ label: '닫기', onClick: cancel },
        { label: '상점 가기', primary: true, onClick: () => { closeSheet(false); openShop(h); } }],
  });
}
