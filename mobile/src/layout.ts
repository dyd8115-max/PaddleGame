// 세로 휴대폰 화면 배치
//
//  ┌──────────────────────────┐
//  │ 상태바 (안전 영역)         │
//  │ [Ⅱ][♪] 점수 · 스테이지   (X)│  ← 위쪽 정보 줄. 오른쪽은 토스 닫기 버튼 자리라 비워 둔다
//  │┌────────────────────────┐│
//  ││ 게임 영역 480 x (640~960) ││  ← 화면 폭에 맞춰 확대, 세로는 남는 만큼 늘림
//  ││                        ││
//  │└────────────────────────┘│
//  │  손가락으로 미는 곳         │  ← 패들을 가리지 않고 조작
//  │ 홈 바 (안전 영역)          │
//  └──────────────────────────┘
import { Rect } from './game/geometry';
import { MENU_H, World } from './game/objects';
import type { Insets } from './platform';

export const HUD_H = 52;
const TOUCH_MIN = 64;            // 아래쪽 조작 공간 높이
const WORLD_H_MAX = 960;         // 아주 긴 화면에서도 게임 세계가 이보다 길어지지 않게
export const TOSS_BUTTONS_W = 120; // 오른쪽 위 토스 버튼(더보기, 닫기) 자리

export interface Layout {
  w: number;          // CSS 픽셀
  h: number;
  dpr: number;
  insets: Insets;
  hudTop: number;
  scale: number;      // 논리 좌표 1 = CSS 픽셀 scale
  worldH: number;     // 게임 세계 높이 (논리 좌표)
  gx: number;         // 게임 영역 왼쪽 위 (CSS 픽셀)
  gy: number;
  gw: number;
  gh: number;
  touch: Rect;        // 아래쪽 조작 공간
  pauseBtn: Rect;
  soundBtn: Rect;
}

export function makeLayout(w: number, h: number, dpr: number, insets: Insets): Layout {
  const hudTop = insets.top;
  const availW = w - insets.left - insets.right;
  const availH = h - insets.top - HUD_H - insets.bottom - TOUCH_MIN;
  const scale = Math.max(0.1, Math.min(availW / World.Width, availH / MENU_H));
  // 조작 공간을 빼고 남는 세로는 게임 세계를 늘려서 채움
  const worldH = Math.min(WORLD_H_MAX, Math.max(MENU_H, availH / scale));
  const gw = World.Width * scale;
  const gh = worldH * scale;
  const gx = insets.left + (availW - gw) / 2;
  const gy = hudTop + HUD_H;
  const touchTop = gy + gh;
  const touch = new Rect(0, touchTop, w, Math.max(0, h - insets.bottom - touchTop));
  const btn = 40;
  const by = hudTop + (HUD_H - btn) / 2;
  const left = insets.left + 10;
  return {
    w, h, dpr, insets, hudTop, scale, worldH, gx, gy, gw, gh, touch,
    pauseBtn: new Rect(left, by, btn, btn),
    soundBtn: new Rect(left + btn + 8, by, btn, btn),
  };
}

export function toWorld(l: Layout, x: number, y: number): { x: number; y: number } {
  return { x: (x - l.gx) / l.scale, y: (y - l.gy) / l.scale };
}
