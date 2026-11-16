// 미니게임 공통 틀
// 새 게임은 MiniGame 을 이어받아 update / record / 입력만 만들면, 메뉴·기록·코인·소리·진동은 공통으로 처리된다
import type { GameEvent } from './game';

export interface MiniHost {
  score(n: number): void;        // 랭킹 점수
  event(e: GameEvent): void;     // 소리·진동
  gameOver(): void;
}

export abstract class MiniGame {
  time = 0;              // 판이 시작된 뒤 흐른 시간 (초)
  moving = false;        // 캐릭터 걷기 그림을 움직일지
  facingLeft = false;
  over = false;
  protected ending = 0;  // 쓰러지는 연출 남은 시간

  constructor(protected host: MiniHost, readonly charIndex: number) {}

  abstract readonly hint: string;     // 화면 아래 조작 안내
  abstract record(): number;          // 기록 (단위는 Games.List 의 unit)
  abstract sub(): string;             // 위쪽 둘째 줄
  abstract coins(): number;           // 판이 끝날 때 받는 코인
  protected abstract step(dt: number): void;

  update(dt: number): void {
    if (this.over) return;
    if (this.ending > 0) {
      this.ending -= dt;
      if (this.ending <= 0) { this.over = true; this.host.gameOver(); }
      return;
    }
    this.time += dt;
    this.step(dt);
  }

  // 쓰러짐: 잠깐 연출 뒤 게임 오버
  protected die(delay = 0.9): void {
    if (this.ending > 0 || this.over) return;
    this.ending = delay;
    this.moving = false;
    this.host.event('hurt');
  }
  get dying(): boolean { return this.ending > 0; }

  // 입력: (x, y) 는 게임 영역 좌표, (sx, sy) 는 화면 픽셀 (조이스틱용)
  down(_x: number, _y: number, _sx: number, _sy: number): void { /* 필요한 게임만 */ }
  move(_x: number, _y: number, _sx: number, _sy: number): void { /* 필요한 게임만 */ }
  up(_x: number, _y: number, _tap: boolean): void { /* 필요한 게임만 */ }
  key(_key: string, _down: boolean): void { /* 필요한 게임만 */ }
}

// 손가락을 떼지 않고 끈 방향 (밀기). 일정 거리 넘으면 한 번만 알려 줌
export class Swipe {
  private from: { x: number; y: number } | null = null;
  private fired = false;
  begin(x: number, y: number): void { this.from = { x, y }; this.fired = false; }
  // 방향이 정해지면 'L' | 'R' | 'U' | 'D'
  move(x: number, y: number, min = 22): 'L' | 'R' | 'U' | 'D' | null {
    if (!this.from || this.fired) return null;
    const dx = x - this.from.x, dy = y - this.from.y;
    if (Math.hypot(dx, dy) < min) return null;
    this.fired = true;
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'L' : 'R') : (dy < 0 ? 'U' : 'D');
  }
  end(): boolean { const f = this.fired; this.from = null; return f; }
  get active(): boolean { return this.from !== null; }
  // 계속 끄는 게임: 한 번 정해진 뒤에도 다시 새 방향을 받게
  rebase(x: number, y: number): void { this.from = { x, y }; this.fired = false; }
}
