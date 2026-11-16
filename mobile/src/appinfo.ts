// 앱으로서 필요한 화면들: 처음 하는 사람을 위한 규칙 안내, 설정, 개인정보처리방침, 이용약관, 오픈소스 고지
import { assetUrl } from './assetUrl';
import { Games, type GameMode } from './game/objects';
import { closeSheet, el, openSheet } from './sheet';

declare const __APP_VERSION__: string;
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
export const CONTACT_EMAIL = 'dyd8115@gmail.com';
const POLICY_DATE = '2026년 11월 4일';

// ---------- 규칙 안내 ----------
interface TutPage { title: string; lines: string[]; img?: string; }
const TUTORIALS: Partial<Record<GameMode, { name: string; pages: TutPage[] }>> = {
  claim: {
    name: '땅따먹기',
    pages: [
      { title: '끌어서 걸어요', img: 'assets/tut_claim.jpg', lines: ['화면 어디든 누른 채 끌면 캐릭터가 그쪽으로 걸어요.', '조금 끌면 천천히, 많이 끌면 빠르게. 손을 떼면 멈춰요.'] },
      { title: '선을 그어 땅 넓히기', lines: ['내 땅(파랑) 밖으로 나가면 지나간 자리에 선이 생겨요.', '다시 내 땅으로 돌아오면 선으로 둘러싼 곳이 모두 내 땅이 돼요.', '악마의 땅도 둘러싸면 빼앗을 수 있어요.'] },
      { title: '악마를 조심해요', lines: ['악마들도 선을 그으며 땅을 넓혀요.', '악마가 내 선을 밟으면 목숨이 하나 줄어요. 목숨은 3개예요.', '내가 악마의 선을 밟으면 그 악마를 물리쳐요.', '내가 그은 선을 내가 밟아도 안 돼요.'] },
      { title: '목표', lines: ['맵의 절반을 차지하면 다음 스테이지로 가요.', '맵은 화면보다 커요. 오른쪽 위 작은 지도로 전체를 볼 수 있어요.', '기록은 도달한 스테이지예요.'] },
      { title: '갈수록 영리한 악마', lines: ['3판부터 머리 위에 붉은 표시가 있는 사냥꾼 악마가 나와요. 멀리서도 내 선을 노리고, 가까워지면 달려들어요.', '판이 오를수록 악마들이 더 멀리서, 더 과감하게 선을 끊으러 와요.', '가끔 맵에 방패가 나와요. 주우면 선이 한 번 끊겨도 목숨이 줄지 않아요.'] },
    ],
  },
  swipe: {
    name: '숫자 벽돌깨기',
    pages: [
      { title: '당겨서 쏘아요', img: 'assets/tut_swipe.jpg', lines: ['풀밭 선 위를 누른 채 아래로 당기면 조준선이 보여요.', '손을 떼면 화살을 차례로 쏴요.', '풀밭 선 아래를 좌우로 밀면 쏠 자리를 옮겨요.'] },
      { title: '숫자 벽돌', lines: ['벽돌에 적힌 숫자만큼 화살을 맞히면 깨져요.', '초록 보석이 박힌 벽돌을 깨면 다음 차례부터 화살이 하나 늘어요.'] },
      { title: '끝나는 조건', lines: ['화살이 모두 돌아오면 벽돌이 1~3줄 내려와요. 몇 줄인지는 위에 미리 보여요.', '맨 아래 줄까지 내려온 벽돌은 빨갛게 변해요. 한 줄 더 내려오면 끝이에요.', '라운드마다 저장돼서, 나중에 이어서 할 수 있어요.'] },
    ],
  },
  survival: {
    name: '벽돌깨기',
    pages: [
      { title: '막대로 튕겨요', img: 'assets/tut_survival.jpg', lines: ['화면 아래쪽을 좌우로 밀어 막대를 움직여요.', '공을 튕겨 벽돌을 깨요. 공을 모두 놓치면 끝이에요.'] },
      { title: '내려오는 벽돌', lines: ['3초마다 벽돌이 한 줄씩 내려오고, 갈수록 빨라져요.', '빨간 점선에 닿으면 끝이에요.', '20초부터는 악마가 막대 위에 올라타 공을 가려요.'] },
      { title: '아이템', lines: ['벽돌을 깨면 아이템이 떨어질 때가 있어요. 막대로 받으면 효과가 나요.', '금빛(좋음): 공×2, 공×3, 막대×1.5', '보랏빛(나쁨): 공÷2, 막대÷3', '기록은 버틴 시간이에요.'] },
    ],
  },
  tower: {
    name: '발판 점프',
    pages: [
      { title: '저절로 점프', lines: ['발판에 닿으면 저절로 뛰어올라요.', '화면을 누른 채 좌우로 끌어서 위쪽 발판으로 옮겨 가요.', '4초 뒤부터 화면이 저절로 올라가요. 화면 아래로 떨어지면 끝이에요.'] },
      { title: '여러 가지 발판', lines: ['파란 발판: 좌우로 움직여요 (12층부터).', '가시 발판: 밟으면 끝이에요 (15층부터).', '갈색 발판: 밟으면 부서져요 (25층부터).', '보랏빛 유령 발판: 깜빡이다 사라졌다 나타나요. 흐릴 때는 그냥 떨어져요 (30층부터).', '스프링: 아주 높이 뛰어요.'] },
      { title: '조심할 것', lines: ['15층부터 옆에서 박쥐가 날아와요. 닿으면 끝이에요.', '40층부터 가끔 옆바람이 불어서 몸이 밀려요. "바람이 불어와요!"가 뜨면 대비하세요.', '기록은 올라간 층수예요.'] },
    ],
  },
  run: {
    name: '장애물 달리기',
    pages: [
      { title: '누르면 점프', lines: ['캐릭터는 저절로 달려요. 화면을 누르면 점프!', '공중에서 한 번 더 누르면 2단 점프, 길게 누르면 더 높이 뛰어요.'] },
      { title: '조심할 것', lines: ['구덩이에 빠지거나 가시, 상자, 박쥐에 부딪히면 끝이에요.', '상자는 위에 올라탈 수 있어요. 높이 나는 박쥐는 뛰지 말고 그냥 지나가요.', '보석을 모으면 코인을 더 받아요. 기록은 달린 거리예요.'] },
      { title: '갈수록 새 위험', lines: ['굴러오는 바위: 마주 굴러와요. 뛰어넘으세요 (12초부터).', '금 간 땅: 밟으면 곧 꺼져요. 멈추지 말고 바로 뛰어서 건너세요 (20초부터).', '떨어지는 바위: 땅에 그림자와 느낌표가 보이면 가까이 갈 때 위에서 떨어져요 (25초부터).'] },
    ],
  },
  claw: {
    name: '인형 뽑기',
    pages: [
      { title: '집게로 인형 뽑기', lines: ['화면을 누른 채 좌우로 끌면 집게가 따라와요. 손을 떼면 집게가 내려가요.', '왼쪽 인형 통 위에서 내리면 맨 위 인형 둘 중 하나를 집어 올려요.', '오른쪽 상자 위에서 내리면 집고 있던 인형을 떨어뜨려요.'] },
      { title: '같은 인형끼리 합치기', lines: ['같은 인형끼리 닿으면 한 단계 큰 인형이 돼요. 위쪽 단계표에서 순서를 볼 수 있어요.', '슬라임 → 박쥐 → 꼬마 악마 → … → 기사 → 거인 → 마왕', '마왕끼리 합치면 사라지면서 큰 점수!'] },
      { title: '넘치면 끝', lines: ['상자 위 빨간 선 위로 인형이 넘친 채 2초가 지나면 끝이에요.', '통 속 두 인형 중 지금 필요한 걸 골라 집어 오세요.', '기록은 점수예요.'] },
    ],
  },
  raid: {
    name: '몬스터 버티기',
    pages: [
      { title: '끌어서 피하기', img: 'assets/tut_raid.jpg', lines: ['화면 어디든 누른 채 끌면 그쪽으로 걸어요.', '공격은 자동이에요. 몬스터에 닿으면 체력이 줄고, 다 줄면 끝이에요.'] },
      { title: '캐릭터마다 다른 공격', lines: ['꼬마·양뿔 모자·악마 소녀·좀비 소녀: 공을 던져요. 한 마리를 뚫고 지나가요.', '엘프: 빠른 화살이 꿰뚫어요.', '성녀: 빛 구슬이 몸 주위를 돌아요.', '기사: 앞쪽을 넓게 베요.'] },
      { title: '레벨 업', lines: ['몬스터가 떨어뜨린 보석을 모으면 레벨이 올라요.', '레벨이 오를 때마다 스킬 3장 중 하나를 골라요.', '고기는 체력 회복, 자석은 보석 모두 줍기, 우두머리 상자는 바로 레벨 업!', '기록은 버틴 시간이에요.'] },
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
  for (const g of Games.List) {
    const mode = g.mode;
    if (!hasTutorial(mode)) continue;
    const b = el('button', 'sheet-chip', g.name);
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
    body: '<p>모든 게임의 최고 기록과 숫자 벽돌깨기 이어하기 저장이 지워져요. 코인과 해금한 캐릭터는 그대로예요.</p><p>지운 기록은 되돌릴 수 없어요.</p>',
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
<h3>1. 개발자가 직접 수집하는 개인정보</h3>
<p>게임은 이름, 연락처, 이메일 등 이용자를 알아볼 수 있는 개인정보를 직접 수집하지 않습니다. 회원가입도 없고, 개발자가 운영하는 서버도 없습니다.</p>
<h3>2. 기기에 저장하는 정보</h3>
<ul>
<li>게임 기록: 게임별 최고 기록, 숫자 벽돌깨기 이어하기 저장</li>
<li>코인과 해금한 캐릭터, 이미 지급한 결제의 주문 번호(같은 결제로 두 번 지급하지 않기 위해)</li>
<li>설정: 소리, 진동, 마지막으로 고른 캐릭터와 게임, 규칙 안내를 봤는지 여부</li>
</ul>
<p>이 정보는 이용자의 기기(토스 앱에서는 토스 앱 안의 저장 공간)에만 저장되며, 개발자에게 전송되지 않습니다.</p>
<h3>3. 광고</h3>
<p>이용자가 원할 때 광고를 보고 코인을 받을 수 있습니다. 광고는 아래 회사가 제공하며, 광고를 보여 주고 성과를 측정하기 위해 광고 식별자, 기기 정보, 대략적인 위치(IP 주소 기준), 광고 상호작용 정보를 수집할 수 있습니다.</p>
<ul>
<li>안드로이드 앱: Google AdMob (Google LLC) · https://policies.google.com/privacy</li>
<li>토스 앱: 토스 광고 및 Google AdMob (비바리퍼블리카, Google LLC)</li>
</ul>
<p>유럽 등 동의가 필요한 지역에서는 광고 전에 동의를 묻습니다. 안드로이드 기기 설정에서 광고 ID를 삭제하거나 맞춤 광고를 끌 수 있습니다.</p>
<h3>4. 결제</h3>
<p>코인을 현금으로 살 때 결제는 구글 플레이(안드로이드 앱) 또는 토스(토스 앱)가 처리합니다. 카드 번호 등 결제 정보는 개발자가 받지 않으며, 각 회사의 개인정보처리방침이 적용됩니다. 게임은 결제가 끝났는지와 주문 번호만 확인합니다.</p>
<h3>5. 토스가 제공하는 익명 식별키</h3>
<p>토스 앱에서 실행하면 토스가 이 게임 전용으로 발급하는 익명 식별키를 기기에 저장합니다. 토스 계정마다 기록과 코인을 따로 보관하는 데에만 쓰며, 이 키로는 이용자가 누구인지 알 수 없습니다.</p>
<h3>6. 랭킹</h3>
<p>'랭킹 보기'(토스 게임센터)를 이용하면 게임 점수가 토스 게임센터로 전송되어 다른 이용자에게 보일 수 있습니다. 이 과정에는 토스(비바리퍼블리카)의 개인정보처리방침이 적용됩니다.</p>
<h3>7. 보관 기간과 파기</h3>
<p>기기에 저장한 기록은 설정의 '기록 초기화'로 언제든 지울 수 있고, 게임을 삭제하거나 앱 데이터를 지우면 코인을 포함해 모두 지워집니다. 광고 회사가 수집한 정보는 각 회사의 정책에 따라 보관·파기됩니다.</p>
<h3>8. 만 14세 미만 아동</h3>
<p>게임은 개발자가 직접 아동의 개인정보를 수집하지 않습니다. 광고는 아동 대상 맞춤 광고로 설정하지 않습니다.</p>
<h3>9. 이용자의 권리</h3>
<p>이용자는 기기에 저장된 정보를 언제든 지울 수 있고, 광고 동의를 바꿀 수 있습니다. 궁금한 점은 아래로 문의해 주세요.</p>
<h3>10. 개인정보 보호 담당</h3>
<p>레트로 오락실 개발자 · ${CONTACT_EMAIL}</p>
<h3>11. 방침의 변경</h3>
<p>이 방침이 바뀌면 게임 안에서 알려 드립니다.</p>
<p class="muted">시행일: ${POLICY_DATE}</p>`;
}

function termsHtml(): string {
  return `
<h3>제1조 (목적)</h3>
<p>이 약관은 레트로 오락실(이하 '게임')를 이용하는 데 필요한 사항을 정합니다.</p>
<h3>제2조 (서비스)</h3>
<p>게임은 무료로 할 수 있습니다. 게임 안 재화인 코인으로 캐릭터를 해금할 수 있으며, 코인은 게임을 하거나 광고를 보거나 현금으로 사서 얻을 수 있습니다. 게임의 내용은 더 나은 서비스를 위해 바뀔 수 있습니다.</p>
<h3>제3조 (유료 코인)</h3>
<ul>
<li>현금 결제는 구글 플레이 또는 토스의 결제 시스템으로 이루어지며, 가격은 결제 화면에 표시됩니다.</li>
<li>코인은 게임 안에서만 쓸 수 있고, 현금으로 바꾸거나 다른 사람에게 넘길 수 없습니다.</li>
<li>코인과 캐릭터는 이용자의 기기에 저장됩니다. 앱을 지우거나 앱 데이터를 지우거나 기기를 바꾸면 사라질 수 있으며, 개발자가 되살려 드릴 수 없습니다.</li>
</ul>
<h3>제4조 (청약철회와 환불)</h3>
<ul>
<li>산 코인을 전혀 쓰지 않았다면 결제한 날부터 7일 안에 청약철회(결제 취소)를 할 수 있습니다. 결제 취소와 환불은 구글 플레이 또는 토스의 환불 절차에 따릅니다.</li>
<li>코인을 일부라도 써서 캐릭터를 해금했거나, 결제와 함께 바로 지급되어 사용된 경우에는 전자상거래법에 따라 청약철회가 제한될 수 있습니다.</li>
<li>미성년자가 법정대리인의 동의 없이 결제한 경우, 미성년자 본인 또는 법정대리인이 결제를 취소할 수 있습니다.</li>
<li>결제가 됐는데 코인이 들어오지 않았다면 앱을 다시 켜 주세요. 그래도 들어오지 않으면 아래로 문의해 주세요.</li>
</ul>
<h3>제5조 (광고)</h3>
<p>이용자가 원할 때 광고를 보고 코인을 받을 수 있습니다. 하루에 받을 수 있는 횟수는 정해져 있으며, 광고를 끝까지 보지 않으면 코인이 지급되지 않습니다.</p>
<h3>제6조 (이용자의 의무)</h3>
<ul>
<li>게임을 변조하거나 비정상적인 방법으로 기록·랭킹·코인을 조작하면 안 됩니다.</li>
<li>다른 이용자의 이용을 방해하면 안 됩니다.</li>
</ul>
<h3>제7조 (게임 기록)</h3>
<p>게임 기록은 이용자의 기기에 저장됩니다. 기기를 바꾸거나 앱 데이터를 지우면 기록이 사라질 수 있으며, 개발자가 이를 되살려 드릴 수는 없습니다.</p>
<h3>제8조 (랭킹)</h3>
<p>랭킹은 토스 게임센터에서 제공되며, 비정상적인 기록은 예고 없이 지워질 수 있습니다.</p>
<h3>제9조 (서비스의 변경과 중단)</h3>
<p>개발자는 운영상·기술상 필요에 따라 게임의 전부 또는 일부를 바꾸거나 중단할 수 있습니다. 유료 코인을 쓸 수 없게 되는 경우 미리 알립니다.</p>
<h3>제10조 (책임의 제한)</h3>
<p>개발자의 고의나 중대한 과실이 없는 한, 게임 이용으로 생긴 손해에 대해 책임지지 않습니다.</p>
<h3>제11조 (문의)</h3>
<p>${CONTACT_EMAIL}</p>
<p class="muted">시행일: ${POLICY_DATE}</p>`;
}

function licensesHtml(): string {
  return `
<p>게임에는 아래 오픈소스 소프트웨어가 포함되어 있습니다.</p>
<h3>@apps-in-toss/web-framework</h3>
<p class="muted">Apache License 2.0 · © Viva Republica, Inc.</p>
<p class="muted">http://www.apache.org/licenses/LICENSE-2.0</p>
<h3>@capacitor/core, @capacitor/app, @capacitor-community/admob (안드로이드 앱)</h3>
<p class="muted">MIT License · © Ionic</p>
<p class="muted">Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.</p>
<h3>@capgo/native-purchases (안드로이드 앱)</h3>
<p class="muted">Mozilla Public License 2.0 · © Capgo · 소스 코드: https://github.com/Cap-go/native-purchases</p>
<p class="muted">https://www.mozilla.org/en-US/MPL/2.0/</p>
<h3>Google Mobile Ads SDK, Google Play Billing Library (안드로이드 앱)</h3>
<p class="muted">Google APIs Terms of Service · https://developers.google.com/terms</p>
<p>글꼴은 기기에 설치된 기본 글꼴을 씁니다.</p>`;
}
