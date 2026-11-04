// 게임 화면 위에 뜨는 창 (규칙 안내, 설정, 약관 같은 글이 많은 화면)
// 캔버스 대신 HTML 로 그려서 글자가 또렷하고 길면 스크롤된다. 한 번에 하나만 뜬다
export interface SheetButton { label: string; primary?: boolean; onClick: () => void; }
export interface SheetOptions {
  title: string;
  body: HTMLElement | string;          // 문자열이면 HTML 로 넣음 (앱 안에서 만든 글만)
  buttons?: SheetButton[];
  onClose?: () => void;                // 오른쪽 위 X, 바깥 누르기, 뒤로가기로 닫을 때
  closable?: boolean;                  // false 면 X 없이 버튼으로만 닫음
}

let current: { root: HTMLElement; opts: SheetOptions } | null = null;

const CSS = `
.sheet-back{position:fixed;inset:0;z-index:20;background:rgba(8,10,16,.72);display:flex;align-items:center;justify-content:center;
  padding:calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 16px);animation:sheetIn .18s ease-out}
.sheet{width:100%;max-width:440px;max-height:100%;display:flex;flex-direction:column;background:#1e2232;border:1px solid rgba(255,255,255,.12);
  border-radius:18px;color:#e8e8f0;font-family:"Pretendard",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;
  box-shadow:0 12px 40px rgba(0,0,0,.5);overflow:hidden;user-select:text;-webkit-user-select:text}
.sheet-head{display:flex;align-items:center;padding:16px 16px 10px 20px;gap:8px}
.sheet-title{flex:1;font-size:19px;font-weight:700;color:#fff}
.sheet-x{width:36px;height:36px;border:0;border-radius:10px;background:rgba(255,255,255,.08);color:#fff;font-size:20px;line-height:36px;cursor:pointer}
.sheet-body{padding:4px 20px 16px;overflow-y:auto;-webkit-overflow-scrolling:touch;font-size:15px;line-height:1.6}
.sheet-body h3{font-size:15px;margin:16px 0 4px;color:#ffd84d}
.sheet-body p{margin:6px 0}
.sheet-body ul{margin:6px 0;padding-left:20px}
.sheet-body li{margin:3px 0}
.sheet-body .muted{color:#9aa0b4;font-size:13px}
.sheet-foot{display:flex;gap:10px;padding:12px 16px 16px}
.sheet-btn{flex:1;height:50px;border-radius:14px;border:1px solid rgba(255,255,255,.2);background:#2a3046;color:#fff;font-size:17px;font-weight:700;cursor:pointer;font-family:inherit}
.sheet-btn.primary{background:#ffd84d;border-color:#ffd84d;color:#1e2232}
.sheet-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 2px;border-bottom:1px solid rgba(255,255,255,.08);font-size:16px;cursor:pointer}
.sheet-row:last-child{border-bottom:0}
.sheet-row .val{color:#9aa0b4;font-size:14px}
.sheet-row .go{color:#9aa0b4}
.sheet-sec{margin:14px 0 2px;font-size:13px;color:#9aa0b4}
.sheet-toggle{width:50px;height:30px;border-radius:15px;background:#3a4058;position:relative;flex:none;transition:background .15s}
.sheet-toggle::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:12px;background:#fff;transition:left .15s}
.sheet-toggle.on{background:#3ccf8e}.sheet-toggle.on::after{left:23px}
.sheet-chips{display:flex;gap:8px;margin:6px 0 4px}
.sheet-chip{flex:1;height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:#2a3046;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
.tut-img{width:100%;border-radius:12px;display:block;margin:4px 0 10px;aspect-ratio:636/600;object-fit:cover;object-position:top;background:#14161f}
.tut-dots{display:flex;justify-content:center;gap:6px;margin-top:8px}
.tut-dots i{width:7px;height:7px;border-radius:4px;background:#3a4058}.tut-dots i.on{background:#ffd84d;width:18px}
@keyframes sheetIn{from{opacity:0}to{opacity:1}}
`;

function injectCss(): void {
  if (document.getElementById('sheet-css')) return;
  const st = document.createElement('style');
  st.id = 'sheet-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

export function isSheetOpen(): boolean { return current !== null; }

export function openSheet(opts: SheetOptions): void {
  injectCss();
  closeSheet(false);
  const back = document.createElement('div');
  back.className = 'sheet-back';
  const box = document.createElement('div');
  box.className = 'sheet';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const head = document.createElement('div');
  head.className = 'sheet-head';
  const title = document.createElement('div');
  title.className = 'sheet-title';
  title.textContent = opts.title;
  head.appendChild(title);
  if (opts.closable !== false) {
    const x = document.createElement('button');
    x.className = 'sheet-x';
    x.setAttribute('aria-label', '닫기');
    x.textContent = '×';
    x.onclick = () => closeSheet(true);
    head.appendChild(x);
  }
  const body = document.createElement('div');
  body.className = 'sheet-body';
  if (typeof opts.body === 'string') body.innerHTML = opts.body; else body.appendChild(opts.body);
  box.append(head, body);
  if (opts.buttons?.length) {
    const foot = document.createElement('div');
    foot.className = 'sheet-foot';
    for (const b of opts.buttons) {
      const btn = document.createElement('button');
      btn.className = 'sheet-btn' + (b.primary ? ' primary' : '');
      btn.textContent = b.label;
      btn.onclick = () => b.onClick();
      foot.appendChild(btn);
    }
    box.appendChild(foot);
  }
  back.appendChild(box);
  // 바깥을 눌러 닫기. 창을 연 손가락의 클릭이 바로 닫지 않게 잠깐은 무시
  const openedAt = performance.now();
  if (opts.closable !== false) back.addEventListener('click', (e) => { if (e.target === back && performance.now() - openedAt > 350) closeSheet(true); });
  // 창 안의 터치가 게임으로 새지 않게
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove'] as const) back.addEventListener(ev, (e) => e.stopPropagation());
  document.body.appendChild(back);
  current = { root: back, opts };
}

// 닫기. byUser 면 onClose 도 부름. 열린 창이 있었으면 true
export function closeSheet(byUser = true): boolean {
  if (!current) return false;
  const { root, opts } = current;
  current = null;
  root.remove();
  if (byUser) opts.onClose?.();
  return true;
}

// 뒤로가기: 닫을 수 있는 창이면 닫음
export function sheetBack(): boolean {
  if (!current) return false;
  if (current.opts.closable === false) return true;   // 버튼으로만 닫는 창은 그대로
  return closeSheet(true);
}

// 작은 도우미: 태그 만들기
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
