import aitDevtools from '@apps-in-toss/devtools/unplugin';
import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },   // 설정 화면에 보이는 버전
  // 개발 서버에서만 앱인토스 SDK 를 가짜(mock)로 바꾸고, 오른쪽 아래 AIT 패널을 띄워요. 배포 빌드에는 들어가지 않아요
  // NO_AIT=1 이면 가짜 SDK 없이 띄움 (스토어 스크린샷 찍을 때)
  plugins: process.env.NO_AIT ? [] : [aitDevtools.vite()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    target: 'es2019',
  },
});
