// 게임 오브젝트 (PC 버전 GameObjects.h 와 같음)
import { Rect, Vec2 } from './geometry';

// 논리 좌표계 크기. 가로는 480 고정, 세로는 휴대폰 화면 비율에 맞춰 640~960 사이로 늘어난다
export const World = { Width: 480, Height: 640 };

// 메뉴와 안내 창은 높이 640 상자 안에 그리고, 세로로 가운데 둔다
export const MENU_H = 640;
export const menuTop = (): number => (World.Height - MENU_H) / 2;

// 플레이 중 캐릭터를 메뉴 카드 그림보다 크게
export const PLAYER_SCALE = 1.5;

// 캐릭터마다 게임 방식과 기록이 다르다 (특수 능력은 없음)
// climb:    떨어지는 테트리스 블록을 피해 쌓인 블록을 밟고 빨간 선까지. 몇 스테이지까지 갔나 (꼬마)
// mine:     지뢰 벽돌깨기 (지금은 쓰지 않음)
// swipe:    직접 조준해서 쏘는 스와이프 벽돌깨기. 몇 라운드까지 갔나 (엘프)
// archer:   궁수의 전설처럼 움직이다 멈추면 자동 발사 (지금은 쓰지 않음)
// survival: 3초마다 벽돌 줄이 위에서 생겨 내려온다. 몇 초 버텼나 (성녀)
// stage:    패들로 받아 벽돌을 깨고 다음 맵으로 (지금은 쓰지 않음)
export type GameMode = 'stage' | 'climb' | 'mine' | 'swipe' | 'archer' | 'survival';

export interface CharacterDef {
  name: string;
  fps: number;        // 걷기 애니메이션 속도
  mode: GameMode;
  ability: string;    // 메뉴에 보이는 한 줄 설명
  hints: [string, string];   // 메뉴 아래 안내 두 줄
  speedMul: number;   // 공 빠르기 배율
  paddleW: number;    // 패들 길이
}

export const Characters = {
  FrameCount: 16,
  CellW: 67,     // 그리기 크기 (논리 좌표). 그림 파일은 2배 크기
  CellH: 80,
  List: [
    {
      name: 'KID', fps: 15, mode: 'climb', speedMul: 1, paddleW: 80,
      ability: '블록 피해 오르기 · 몇 스테이지까지 갈까',
      hints: ['왼쪽 아래 ◀ ▶ 로 걷고, 오른쪽 아래 버튼으로 점프', '떨어지는 블록을 피해 밟고 올라 빨간 선까지 (2단 점프)'],
    },
    {
      name: 'ELF', fps: 13, mode: 'swipe', speedMul: 1, paddleW: 80,
      ability: '스와이프 벽돌깨기 · 몇 라운드까지 갈까',
      hints: ['흰 선 아래를 밀어 자리 고르고, 위를 당겨 조준', '숫자만큼 맞히면 깨져요. 바닥선에 닿으면 끝'],
    },
    {
      name: 'SAINT', fps: 16, mode: 'survival', speedMul: 1.5, paddleW: 80,
      ability: '빠른 공 · 내려오는 벽돌을 몇 초 버틸까',
      hints: ['화면 아래쪽을 좌우로 밀어 패들을 움직여요', '3초마다 벽돌이 한 줄씩 내려와요. 선에 닿으면 끝'],
    },
  ] as CharacterDef[],

  // 시작 메뉴의 캐릭터 카드 위치 (논리 좌표)
  cardRect(i: number): Rect {
    const w = 120, h = 150, gap = 30, n = 3;
    const left = (World.Width - (w * n + gap * (n - 1))) * 0.5;
    return new Rect(left + i * (w + gap), 150, w, h);
  },
};

export const BackgroundCount = 6;

// 공 종류: 하양은 기본, 빨강은 1.5배 빠르고, 초록은 0.5배 느리다 (스테이지 빠르기에 곱함)
export type BallKind = 'white' | 'red' | 'green';
export const BALL_SPEED_MUL: Record<BallKind, number> = { white: 1, red: 1.5, green: 0.5 };

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
  bodyX = 240;        // 엘프 모드: 몸통 가운데 x (패들 대신 화면 위쪽을 걸어다님)
  baseY = 0;          // 엘프 모드: 발 높이 (벽돌 맨 아랫줄을 따라 오르내림)
  scale = 1;          // 그리기 배율 (엘프 모드에서는 크게 그려서 벽돌을 더 가림)

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
  col = 0;          // 지뢰 모드: 격자 칸
  mine = false;     // 지뢰 모드: 지뢰
  flag = false;     // 지뢰 모드: 깃발 (공이 맞아도 안 깨짐)
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
