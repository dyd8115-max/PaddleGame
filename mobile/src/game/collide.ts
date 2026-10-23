// 공과 사각형의 충돌, 같은 길만 도는 공의 방향 바꾸기 (일반 모드와 엘프 모드가 함께 씀)
import { Rect, Vec2 } from './geometry';
import { World, type Ball } from './objects';

export const MIN_ANGLE = 30 * Math.PI / 180;   // 방향을 바꿀 때 공이 수평에 가까워지지 않게
const NUDGE_MIN = 8 * Math.PI / 180;
const NUDGE_MAX = 20 * Math.PI / 180;

// 공을 사각형 밖으로 밀어내고, 부딪친 면 쪽으로 튕긴다 (입사각 = 반사각)
export function bounceOff(b: Ball, r: Rect): void {
  const br = b.bounds();
  const overlapX = Math.min(br.right, r.right) - Math.max(br.left, r.left);
  const overlapY = Math.min(br.bottom, r.bottom) - Math.max(br.top, r.top);
  // 겹친 폭이 작은 축이 실제로 부딪친 면
  if (overlapX < overlapY) {
    const fromLeft = br.centerX < r.centerX;
    b.vel.x = fromLeft ? -Math.abs(b.vel.x) : Math.abs(b.vel.x);
    b.pos.x += fromLeft ? -overlapX - 0.01 : overlapX + 0.01;
  } else {
    const fromTop = br.centerY < r.centerY;
    b.vel.y = fromTop ? -Math.abs(b.vel.y) : Math.abs(b.vel.y);
    b.pos.y += fromTop ? -overlapY - 0.01 : overlapY + 0.01;
  }
}

// 같은 길만 계속 도는 공의 방향을 8~20° 돌린다. 너무 눕지 않게 30°~150° 안에서
export function nudge(b: Ball): void {
  b.idle = 0;
  const speed = b.vel.length();
  const ySign = b.vel.y < 0 ? -1 : 1;
  const a0 = Math.atan2(Math.abs(b.vel.y), b.vel.x);   // 수평에서 잰 각 (0~180°)
  const d = (NUDGE_MIN + Math.random() * (NUDGE_MAX - NUDGE_MIN)) * (Math.random() < 0.5 ? -1 : 1);
  let a = a0 + d;
  if (a < MIN_ANGLE || a > Math.PI - MIN_ANGLE) a = a0 - d;
  a = Math.max(MIN_ANGLE, Math.min(Math.PI - MIN_ANGLE, a));
  b.vel = new Vec2(Math.cos(a) * speed, ySign * Math.sin(a) * speed);
}

// 좌우 벽과 천장 (아래는 열려 있음)
export function collideBorders(b: Ball): boolean {
  let hit = false;
  if (b.pos.x < 0) { b.pos.x = 0; b.vel.x = Math.abs(b.vel.x); hit = true; }
  else if (b.pos.x + b.size > World.Width) { b.pos.x = World.Width - b.size; b.vel.x = -Math.abs(b.vel.x); hit = true; }
  if (b.pos.y < 0) { b.pos.y = 0; b.vel.y = Math.abs(b.vel.y); hit = true; }
  return hit;
}
