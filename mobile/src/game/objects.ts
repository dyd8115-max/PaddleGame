// 게임 오브젝트 (PC 버전 GameObjects.h 와 같음)
import { Rect, Vec2 } from './geometry';

// 논리 좌표계 크기. 가로는 480 고정, 세로는 휴대폰 화면 비율에 맞춰 640~960 사이로 늘어난다
export const World = { Width: 480, Height: 640 };

// 메뉴와 안내 창은 높이 640 상자 안에 그리고, 세로로 가운데 둔다
export const MENU_H = 640;
export const menuTop = (): number => (World.Height - MENU_H) / 2;

// 플레이 중 캐릭터를 메뉴 카드 그림보다 크게
export const PLAYER_SCALE = 1.5;

export interface CharacterDef {
  name: string;
  fps: number;        // 걷기 애니메이션 속도
  ability: string;    // 메뉴에 보이는 능력 설명
  startBalls: number; // 스테이지를 시작할 때 공 수
  skill: boolean;     // 버튼을 누르면 공 2배 (스테이지마다 한 번)
  paddleW: number;    // 패들 길이
  revives: number;    // 공을 모두 놓쳐도 다시 시작할 수 있는 횟수
}

export const Characters = {
  FrameCount: 16,
  CellW: 67,     // 그리기 크기 (논리 좌표). 그림 파일은 2배 크기
  CellH: 80,
  List: [
    { name: 'KID', fps: 15, ability: '버튼을 누르면 공이 2배 (스테이지마다 한 번)', startBalls: 1, skill: true, paddleW: 80, revives: 0 },
    { name: 'ELF', fps: 13, ability: '공 3개로 출발해요', startBalls: 3, skill: false, paddleW: 80, revives: 0 },
    { name: 'SAINT', fps: 16, ability: '공을 다 놓쳐도 한 번 부활해요', startBalls: 1, skill: false, paddleW: 80, revives: 1 },
  ] as CharacterDef[],

  // 시작 메뉴의 캐릭터 카드 위치 (논리 좌표)
  cardRect(i: number): Rect {
    const w = 120, h = 150, gap = 30, n = 3;
    const left = (World.Width - (w * n + gap * (n - 1))) * 0.5;
    return new Rect(left + i * (w + gap), 150, w, h);
  },
};

export const BackgroundCount = 6;

// 공 종류: 하양은 기본, 빨강은 2배 빠르고, 초록은 0.5배 느리다 (스테이지 빠르기에 곱함)
export type BallKind = 'white' | 'red' | 'green';
export const BALL_SPEED_MUL: Record<BallKind, number> = { white: 1, red: 2, green: 0.5 };

export class Ball {
  size = 10;
  kind: BallKind = 'white';
  idle = 0;   // 마지막으로 벽돌을 깬 뒤 지난 시간 (같은 길만 도는지 확인용)
  constructor(public pos = new Vec2(), public vel = new Vec2()) {}
  bounds(): Rect { return new Rect(this.pos.x, this.pos.y, this.size, this.size); }
}

export class Paddle {
  x = 0;
  y = 0;
  w = 80;
  h = 12;
  targetX = World.Width * 0.5;   // 입력이 지정하는 목표 중심 x
  bounds(): Rect { return new Rect(this.x, this.y, this.w, this.h); }
}

// 패들 아래에서 패들을 따라 걷는 캐릭터 (충돌 없음, 표시 전용)
export class Player {
  x = 0;
  y = 0;
  w = Characters.CellW * PLAYER_SCALE;
  h = Characters.CellH * PLAYER_SCALE;
  character = 0;
  facingLeft = false;
  walking = false;
  walkTimer = 0;   // 멈춘 뒤에도 잠깐 걷기 유지 (손가락 미세 떨림 대응)
  animTime = 0;

  frame(): number {
    if (!this.walking) return 0;
    const fps = Characters.List[this.character].fps;
    return Math.floor(this.animTime * fps) % Characters.FrameCount;
  }
  bounds(): Rect { return new Rect(this.x, this.y, this.w, this.h); }
}

// 악마 그림 정보 (devil.png 배치와 같아야 함)
export const DevilSprite = {
  Cell: 128,
  WalkFrames: 8,
  WalkFps: 10,
  JumpKinds: 3,
  jumpFrames(kind: number): number { return kind === 0 ? 6 : 5; },
};

// 2스테이지부터 패들 위에 올라타 짓밟고 서 있는 방해꾼. 공과 부딪히지 않고 공을 가린다
export class Devil {
  active = false;
  dropping = true;    // 등장할 때 위에서 떨어지는 중
  offset = 0;         // 패들 중심 기준 몸통 중심의 가로 위치
  walkVel = 0;
  lift = 0;           // 패들 윗면에서 발까지 높이 (0 이면 밟고 서 있음)
  liftVel = 0;        // 위쪽이 +
  facingLeft = false;
  airborne = false;
  jumpKind = 0;
  jumpSpeed = 0;
  jumpTimer = 0;
  animTime = 0;
  stompTimer = 0;     // 착지 직후 패들이 눌리는 연출 남은 시간
  x = 0;              // 그리기용 칸 좌상단 (매 프레임 계산)
  y = 0;

  bounds(): Rect { return new Rect(this.x, this.y, DevilSprite.Cell, DevilSprite.Cell); }

  anim(): number { return this.airborne ? 1 + this.jumpKind : 0; }   // 0 걷기, 1~3 점프

  frame(): number {
    if (!this.airborne) {
      return Math.floor(this.animTime * DevilSprite.WalkFps) % DevilSprite.WalkFrames;
    }
    // 올라감 → 꼭대기 → 내려옴: 위아래 속도에 맞춰 장을 고름
    const n = DevilSprite.jumpFrames(this.jumpKind);
    let p = (this.jumpSpeed - this.liftVel) / (2 * this.jumpSpeed);
    p = Math.min(0.999, Math.max(0, p));
    return Math.floor(p * n);
  }
}

export class Brick {
  alive = true;
  constructor(
    public rect: Rect,
    public row: number,
    public item: boolean,     // 노란 벽돌: 깨지면 아이템이 꼭 떨어짐
    public appearAt: number,  // 스테이지 시작 후 이 시각(초)에 나타남
  ) {}
}

// 벽돌에서 떨어지는 아이템. 패들로 받으면 효과가 난다
export type ItemKind = 'ballX2' | 'ballX3' | 'ballHalf' | 'padLong' | 'padShort';
export const ITEM_KINDS: ItemKind[] = ['ballX2', 'ballX3', 'ballHalf', 'padLong', 'padShort'];
export const ITEM_INFO: Record<ItemKind, { label: string; good: boolean }> = {
  ballX2: { label: '공×2', good: true },
  ballX3: { label: '공×3', good: true },
  ballHalf: { label: '공÷2', good: false },
  padLong: { label: '패들×1.5', good: true },
  padShort: { label: '패들÷3', good: false },
};

export class Item {
  w = 62;
  h = 22;
  constructor(public kind: ItemKind, public x: number, public y: number) {}   // x, y 는 왼쪽 위
  bounds(): Rect { return new Rect(this.x, this.y, this.w, this.h); }
}
