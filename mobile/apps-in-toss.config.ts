import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // 콘솔에 등록한 appName 과 똑같아야 해요 (한 번 등록하면 못 바꿔요)
  appName: 'yonginu2022',
  brand: {
    primaryColor: '#E6A700',
  },
  permissions: [],
  // 게임은 내비게이션 바 배경을 투명하게 (토스 더보기·닫기 버튼만 오른쪽 위에 떠 있음)
  navigationBar: {
    transparentBackground: true,
    theme: 'dark',
  },
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
    allowsBackForwardNavigationGestures: false,
  },
  webBundleDir: 'dist',
});
