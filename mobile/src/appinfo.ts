// 앱으로서 필요한 화면들: 처음 하는 사람을 위한 규칙 안내, 설정, 개인정보처리방침, 이용약관, 오픈소스 고지
import { assetUrl } from './assetUrl';
import type { GameMode } from './game/objects';
import { closeSheet, el, openSheet } from './sheet';

declare const __APP_VERSION__: string;
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
export const CONTACT_EMAIL = 'dyd8115@gmail.com';
const POLICY_DATE = '2026년 11월 4일';

// ---------- 규칙 안내 ----------
interface TutPage { title: string; lines: string[]; img?: string; }
const TUTORIALS: Partial<Record<GameMode, { name: string; pages: TutPage[] }>> = {
  claim: {
    name: '꼬마 · 땅따먹기',
    pages: [
      { title: '끌어서 걸어요', img: 'assets/tut_claim.jpg', lines: ['화면 어디든 누른 채 끌면 꼬마가 그쪽으로 걸어요.', '조금 끌면 천천히, 많이 끌면 빠르게. 손을 떼면 멈춰요.'] },
      { title: '선을 그어 땅 넓히기', lines: ['내 땅(파랑) 밖으로 나가면 지나간 자리에 선이 생겨요.', '다시 내 땅으로 돌아오면 선으로 둘러싼 곳이 모두 내 땅이 돼요.', '악마의 땅도 둘러싸면 빼앗을 수 있어요.'] },
      { title: '악마를 조심해요', lines: ['악마들도 선을 그으며 땅을 넓혀요.', '악마가 내 선을 밟으면 목숨이 하나 줄어요. 목숨은 3개예요.', '내가 악마의 선을 밟으면 그 악마를 물리쳐요.', '내가 그은 선을 내가 밟아도 안 돼요.'] },
      { title: '목표', lines: ['맵의 절반을 차지하면 다음 스테이지로 가요.', '맵은 화면보다 커요. 오른쪽 위 작은 지도로 전체를 볼 수 있어요.', '기록은 도달한 스테이지예요.'] },
    ],
  },
  swipe: {
    name: '엘프 · 룬 돌 깨기',
    pages: [
      { title: '당겨서 쏘아요', img: 'assets/tut_swipe.jpg', lines: ['풀밭 선 위를 누른 채 아래로 당기면 조준선이 보여요.', '손을 떼면 마법 화살을 차례로 쏴요.', '풀밭 선 아래를 좌우로 밀면 쏠 자리를 옮겨요.'] },
      { title: '룬 돌', lines: ['돌에 적힌 숫자만큼 화살을 맞히면 깨져요.', '초록 보석이 박힌 돌을 깨면 다음 차례부터 화살이 하나 늘어요.'] },
      { title: '끝나는 조건', lines: ['화살이 모두 돌아오면 돌이 1~3줄 내려와요. 몇 줄인지는 위에 미리 보여요.', '맨 아래 줄까지 내려온 돌은 빨갛게 변해요. 한 줄 더 내려오면 끝이에요.', '라운드마다 저장돼서, 나중에 이어서 할 수 있어요.'] },
    ],
  },
  survival: {
    name: '성녀 · 빛의 방벽',
    pages: [
      { title: '방벽으로 튕겨요', img: 'assets/tut_survival.jpg', lines: ['화면 아래쪽을 좌우로 밀어 빛의 방벽을 움직여요.', '공을 튕겨 색유리를 깨요. 공을 모두 놓치면 끝이에요.'] },
      { title: '내려오는 색유리', lines: ['3초마다 색유리가 한 줄씩 내려와요.', '빨간 점선에 닿으면 끝이에요.', '30초부터는 악마가 방벽 위에 올라타 공을 가려요.'] },
      { title: '두루마리', lines: ['색유리를 깨면 두루마리가 떨어질 때가 있어요. 방벽으로 받으면 효과가 나요.', '금빛(좋음): 공×2, 공×3, 방벽×1.5', '보랏빛(나쁨): 공÷2, 방벽÷3', '기록은 버틴 시간이에요.'] },
    ],
  },
};

export function hasTutorial(mode: GameMode): boolean { return !!TUTORIALS[mode]; }

// 규칙 안내 창. 마지막 장에서 '시작하기'(또는 '확인')를 누르면 onDone
export function openTutorial(mode: GameMode, onDone: () => void, startLabel = '시작하기'): void {
  const t = TUTORIALS[mode];
  if (!t) { onDone(); return; }
  let page = 0;
  const show = () => {
    const p = t.pages[page];
    const body = el('div');
    if (p.img) {
      const img = el('img', 'tut-img');
      img.src = assetUrl(p.img);
      img.alt = '';
      body.appendChild(img);
    }
    body.appendChild(el('h3', undefined, p.title));
    const ul = el('ul');
    for (const l of p.lines) ul.appendChild(el('li', undefined, l));
    body.appendChild(ul);
    const dots = el('div', 'tut-dots');
    t.pages.forEach((_, i) => dots.appendChild(el('i', i === page ? 'on' : '')));
    body.appendChild(dots);
    const last = page === t.pages.length - 1;
    openSheet({
      title: `게임 방법 · ${t.name}`,
      body,
      onClose: onDone,
      buttons: [
        ...(page > 0 ? [{ label: '이전', onClick: () => { page--; show(); } }] : []),
        last
          ? { label: startLabel, primary: true, onClick: () => { closeSheet(false); onDone(); } }
          : { label: '다음', primary: true, onClick: () => { page++; show(); } },
      ],
    });
  };
  show();
}

// ---------- 설정 ----------
export interface SettingsHooks {
  muted: () => boolean;
  toggleSound: () => void;
  vibration: () => boolean;
  toggleVibration: () => void;
  howTo: (mode: GameMode) => void;
  resetRecords: () => void;
}

export function openSettings(h: SettingsHooks): void {
  const body = el('div');
  const row = (label: string, right: HTMLElement | string, onClick: () => void) => {
    const r = el('div', 'sheet-row');
    r.appendChild(el('span', undefined, label));
    r.appendChild(typeof right === 'string' ? el('span', 'go', right) : right);
    r.onclick = onClick;
    body.appendChild(r);
    return r;
  };
  const toggle = (on: boolean) => el('span', 'sheet-toggle' + (on ? ' on' : ''));

  body.appendChild(el('div', 'sheet-sec', '게임'));
  row('소리', toggle(!h.muted()), () => { h.toggleSound(); openSettings(h); });
  row('진동', toggle(h.vibration()), () => { h.toggleVibration(); openSettings(h); });
  const how = el('div');
  how.appendChild(el('div', 'sheet-row', '게임 방법'));
  (how.firstChild as HTMLElement).style.cursor = 'default';
  (how.firstChild as HTMLElement).style.borderBottom = '0';
  const chips = el('div', 'sheet-chips');
  for (const [mode, name] of [['claim', '꼬마'], ['swipe', '엘프'], ['survival', '성녀']] as [GameMode, string][]) {
    const b = el('button', 'sheet-chip', name);
    b.onclick = () => h.howTo(mode);
    chips.appendChild(b);
  }
  how.appendChild(chips);
  body.appendChild(how);
  row('기록 초기화', '›', () => confirmReset(h));

  body.appendChild(el('div', 'sheet-sec', '정보'));
  row('개인정보처리방침', '›', () => openDoc('개인정보처리방침', privacyHtml(), () => openSettings(h)));
  row('이용약관', '›', () => openDoc('이용약관', termsHtml(), () => openSettings(h)));
  row('오픈소스 라이선스', '›', () => openDoc('오픈소스 라이선스', licensesHtml(), () => openSettings(h)));
  const mail = el('span', 'val', CONTACT_EMAIL);
  row('문의', mail, () => undefined).style.cursor = 'default';
  row('버전', el('span', 'val', APP_VERSION), () => undefined).style.cursor = 'default';

  openSheet({ title: '설정', body });
}

function confirmReset(h: SettingsHooks): void {
  openSheet({
    title: '기록 초기화',
    body: '<p>모든 캐릭터의 최고 기록과 엘프 이어하기 저장이 지워져요.</p><p>지운 기록은 되돌릴 수 없어요.</p>',
    onClose: () => openSettings(h),
    buttons: [
      { label: '취소', onClick: () => { closeSheet(false); openSettings(h); } },
      { label: '지우기', primary: true, onClick: () => { h.resetRecords(); closeSheet(false); openDoc('기록 초기화', '<p>기록을 모두 지웠어요.</p>', () => openSettings(h)); } },
    ],
  });
}

function openDoc(title: string, html: string, back: () => void): void {
  openSheet({ title, body: html, onClose: back, buttons: [{ label: '닫기', onClick: () => { closeSheet(false); back(); } }] });
}

// ---------- 문서 ----------
function privacyHtml(): string {
  return `
<p>레트로 오락실(이하 '게임')는 이용자의 개인정보를 소중히 다루며, 개인정보 보호법 등 관련 법령을 지킵니다.</p>
<h3>1. 수집하는 개인정보</h3>
<p>게임은 이름, 연락처, 이메일, 위치 등 이용자를 알아볼 수 있는 개인정보를 수집하지 않습니다. 회원가입도 없습니다.</p>
<h3>2. 기기에 저장하는 정보</h3>
<ul>
<li>게임 기록: 캐릭터별 최고 기록, 엘프 모드 이어하기 저장</li>
<li>설정: 소리, 진동, 마지막으로 고른 캐릭터, 규칙 안내를 봤는지 여부</li>
</ul>
<p>이 정보는 이용자의 기기(토스 앱 안의 저장 공간)에만 저장되며, 개발자의 서버로 보내지 않습니다.</p>
<h3>3. 토스가 제공하는 익명 식별키</h3>
<p>토스 앱에서 실행하면 토스가 이 게임 전용으로 발급하는 익명 식별키를 기기에 저장합니다. 토스 계정이 바뀌었을 때 이전 계정의 기록이 섞이지 않게 하는 데에만 쓰며, 이 키로는 이용자가 누구인지 알 수 없습니다.</p>
<h3>4. 랭킹</h3>
<p>'랭킹 보기'(토스 게임센터)를 이용하면 게임 점수가 토스 게임센터로 전송되어 다른 이용자에게 보일 수 있습니다. 이 과정에는 토스(비바리퍼블리카)의 개인정보처리방침이 적용됩니다.</p>
<h3>5. 제3자 제공과 처리 위탁</h3>
<p>개인정보를 제3자에게 제공하거나 처리를 위탁하지 않습니다. 광고와 이용 분석 도구도 쓰지 않습니다.</p>
<h3>6. 보관 기간과 파기</h3>
<p>기기에 저장한 정보는 설정의 '기록 초기화'로 언제든 지울 수 있고, 게임을 삭제하거나 토스 앱의 데이터를 지우면 함께 지워집니다.</p>
<h3>7. 만 14세 미만 아동</h3>
<p>게임은 아동을 포함한 누구의 개인정보도 수집하지 않습니다.</p>
<h3>8. 이용자의 권리</h3>
<p>이용자는 기기에 저장된 정보를 언제든 지울 수 있습니다. 궁금한 점은 아래로 문의해 주세요.</p>
<h3>9. 개인정보 보호 담당</h3>
<p>레트로 오락실 개발자 · ${CONTACT_EMAIL}</p>
<h3>10. 방침의 변경</h3>
<p>이 방침이 바뀌면 게임 안에서 알려 드립니다.</p>
<p class="muted">시행일: ${POLICY_DATE}</p>`;
}

function termsHtml(): string {
  return `
<h3>제1조 (목적)</h3>
<p>이 약관은 레트로 오락실(이하 '게임')를 이용하는 데 필요한 사항을 정합니다.</p>
<h3>제2조 (서비스)</h3>
<p>게임은 무료로 제공되며, 유료 결제나 광고가 없습니다. 게임의 내용은 더 나은 서비스를 위해 바뀔 수 있습니다.</p>
<h3>제3조 (이용자의 의무)</h3>
<ul>
<li>게임을 변조하거나 비정상적인 방법으로 기록·랭킹을 조작하면 안 됩니다.</li>
<li>다른 이용자의 이용을 방해하면 안 됩니다.</li>
</ul>
<h3>제4조 (게임 기록)</h3>
<p>게임 기록은 이용자의 기기에 저장됩니다. 기기를 바꾸거나 앱 데이터를 지우면 기록이 사라질 수 있으며, 개발자가 이를 되살려 드릴 수는 없습니다.</p>
<h3>제5조 (랭킹)</h3>
<p>랭킹은 토스 게임센터에서 제공되며, 비정상적인 기록은 예고 없이 지워질 수 있습니다.</p>
<h3>제6조 (서비스의 변경과 중단)</h3>
<p>개발자는 운영상·기술상 필요에 따라 게임의 전부 또는 일부를 바꾸거나 중단할 수 있습니다.</p>
<h3>제7조 (책임의 제한)</h3>
<p>게임은 무료로 '있는 그대로' 제공됩니다. 개발자의 고의나 중대한 과실이 없는 한, 게임 이용으로 생긴 손해에 대해 책임지지 않습니다.</p>
<h3>제8조 (문의)</h3>
<p>${CONTACT_EMAIL}</p>
<p class="muted">시행일: ${POLICY_DATE}</p>`;
}

function licensesHtml(): string {
  return `
<p>게임에는 아래 오픈소스 소프트웨어가 포함되어 있습니다.</p>
<h3>@apps-in-toss/web-framework</h3>
<p class="muted">Apache License 2.0 · © Viva Republica, Inc.</p>
<p class="muted">http://www.apache.org/licenses/LICENSE-2.0</p>
<h3>@capacitor/core, @capacitor/app (안드로이드 앱)</h3>
<p class="muted">MIT License · © Ionic</p>
<p class="muted">Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.</p>
<p>글꼴은 기기에 설치된 기본 글꼴을 씁니다.</p>`;
}
