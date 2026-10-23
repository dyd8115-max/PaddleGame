import type { CapacitorConfig } from '@capacitor/cli';

// 안드로이드 앱 설정 (npx cap sync android 로 android/ 폴더에 반영)
const config: CapacitorConfig = {
  appId: 'io.github.dyd8115.blockbreaker',
  appName: '블록 브레이커',
  webDir: 'dist',
  backgroundColor: '#14161f',
  android: {
    // 웹 내용 디버깅은 개발할 때만 (크롬 chrome://inspect)
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
  },
};

export default config;
