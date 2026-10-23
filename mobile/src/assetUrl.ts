// 그림·소리 주소. 오프라인 한 파일 버전은 window.__ASSETS 에 data: 주소를 미리 넣어 두므로 그걸 쓴다
declare global {
  interface Window { __ASSETS?: Record<string, string>; }
}

export function assetUrl(path: string): string {
  return window.__ASSETS?.[path] ?? path;
}
