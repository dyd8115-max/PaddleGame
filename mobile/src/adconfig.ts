// 광고·결제 상품 ID 모음. 콘솔에서 받은 값으로 바꾸는 곳은 여기 한 군데뿐이다
//
// 지금 값은 전부 '테스트용'이라 광고를 봐도 수익이 생기지 않는다.
// 출시 전에 실제 ID 로 바꾸고 TEST_ADS 를 false 로.

// 준비가 덜 됐으면 false 로 꺼 두면 버튼이 숨겨진다 (코인은 게임으로만 모임)
export const ENABLE_ADS = true;
export const ENABLE_IAP = true;

// 구글이 공개한 테스트 ID (https://developers.google.com/admob/android/test-ads)
export const ADMOB = {
  TEST_ADS: true,
  // 보상형 광고 단위 ID: AdMob 콘솔 → 앱 → 광고 단위 → 보상형
  REWARDED: 'ca-app-pub-3940256099942544/5224354917',
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
