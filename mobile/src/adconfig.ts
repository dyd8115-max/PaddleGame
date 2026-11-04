// 광고·결제 상품 ID 모음. 콘솔에서 받은 값으로 바꾸는 곳은 여기 한 군데뿐이다
//
// 실제 ID 는 들어가 있고, 테스트 기간에는 테스트 광고를 쓴다 (ADMOB_TEST_ADS).
// 토스 광고 그룹 ID 는 아직 테스트 값 (앱인토스 콘솔에서 받으면 바꾼다).

// 준비가 덜 됐으면 false 로 꺼 두면 버튼이 숨겨진다 (코인은 게임으로만 모임)
export const ENABLE_ADS = true;
export const ENABLE_IAP = true;

// TEST_ADS 가 true 면 구글 공개 테스트 광고 (https://developers.google.com/admob/android/test-ads)
// 개발·테스트 중에 실제 광고를 보거나 누르면 부정 클릭으로 계정이 정지될 수 있어서, 정식 출시 때만 false 로
const ADMOB_TEST_ADS = true;
export const ADMOB = {
  TEST_ADS: ADMOB_TEST_ADS,
  // 보상형 광고 단위 ID: AdMob 콘솔 → 앱 → 레트로 오락실 → 광고 단위 → 코인 보상
  REWARDED: ADMOB_TEST_ADS ? 'ca-app-pub-3940256099942544/5224354917' : 'ca-app-pub-7096143948158843/9988659242',
};
// 앱 ID 는 안드로이드 설정(android/app/src/main/res/values/strings.xml 의 admob_app_id)에 있다

// 앱인토스 광고 그룹 ID: 앱인토스 콘솔 → 인앱 광고. 테스트 ID 는 토스 개발자센터 문서 값
export const TOSS_ADS = {
  REWARDED: 'ait-ad-test-rewarded-id',
};

// 코인 묶음 (현금 결제). sku 는 구글 플레이 콘솔과 앱인토스 콘솔에 똑같은 이름으로 만든다
// 둘 다 '소비성(여러 번 살 수 있는)' 상품
export interface CoinPack { sku: string; coins: number; bonus: string; }
export const COIN_PACKS: CoinPack[] = [
  { sku: 'coins_500', coins: 500, bonus: '' },
  { sku: 'coins_1500', coins: 1500, bonus: '+25%' },
  { sku: 'coins_4000', coins: 4000, bonus: '+60%' },
];
