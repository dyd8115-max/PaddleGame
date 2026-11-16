// 그림 불러오기. 다 불러오기 전에는 그 그림만 빼고 그린다
import { assetUrl } from './assetUrl';
import { BackgroundCount, Characters, Games, type GameMode } from './game/objects';
import { SPRITE_FILES } from './sprites';

export interface Images {
  characters: HTMLImageElement | null;
  knight: HTMLImageElement | null;
  knightAttack: HTMLImageElement | null;
  knightIdle: HTMLImageElement | null;   // 기사 서 있는 자세 (캐릭터 고르기 그림)
  charSheets: Record<string, HTMLImageElement | null>;   // 한 줄짜리 걷기 그림 (양뿔 모자, 악마 소녀, 좀비 소녀)
  charIdle: Record<string, HTMLImageElement | null>;     // 그 캐릭터들의 서 있는 자세
  thumbs: Partial<Record<GameMode, HTMLImageElement | null>>;   // 게임 고르기 미리보기
  sprites: Record<string, HTMLImageElement | null>;              // 미니게임 그림 (sprites.ts)
  devil: HTMLImageElement | null;
  backgrounds: (HTMLImageElement | null)[];
  // 게임 꾸밈 그림 (AI로 만든 것): 땅따먹기 돌바닥, 룬 돌, 색유리 벽돌, 빛 효과
  claimGround: HTMLImageElement | null;
  runes: HTMLImageElement | null;
  glass: HTMLImageElement | null;
  fx: HTMLImageElement | null;
}

export const images: Images = {
  characters: null,
  knight: null,
  knightAttack: null,
  knightIdle: null,
  charSheets: {},
  charIdle: {},
  thumbs: {},
  sprites: {},
  devil: null,
  backgrounds: new Array(BackgroundCount).fill(null),
  claimGround: null,
  runes: null,
  glass: null,
  fx: null,
};

const readyListeners: (() => void)[] = [];
export function onCharactersLoaded(cb: () => void): void { readyListeners.push(cb); }

// 불러오기 진행 (로딩 화면용). 실패한 그림도 끝난 것으로 셈
export const loading = { done: 0, total: 0 };

function load(url: string, _optional = false): Promise<HTMLImageElement | null> {
  loading.total++;
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    const finish = (v: HTMLImageElement | null) => { loading.done++; resolve(v); };
    img.onload = () => {
      // 그리기 전에 미리 풀어 둠 (처음 그릴 때 멈칫하지 않게)
      if (typeof img.decode === 'function') img.decode().then(() => finish(img), () => finish(img));
      else finish(img);
    };
    img.onerror = () => finish(null);
    img.src = assetUrl(url);
  });
}

// 그림을 모두 불러옴 (로딩 화면이 이걸 기다림)
export async function loadImages(): Promise<void> {
  const art: [keyof Images, string][] = [['claimGround', 'claim_ground.jpg'], ['runes', 'rune_stones.png'], ['glass', 'glass_bricks.png'], ['fx', 'light_fx.jpg']];
  const set = (key: keyof Images, img: HTMLImageElement | null) => { (images as unknown as Record<string, HTMLImageElement | null>)[key] = img; };
  const jobs: Promise<unknown>[] = [
    load('assets/characters.png').then((i) => set('characters', i)),
    load('assets/devil.png').then((i) => set('devil', i)),
    load('assets/char_knight.png').then((i) => set('knight', i)),
    load('assets/char_knight_attack.png').then((i) => set('knightAttack', i)),
    load('assets/char_knight_idle.png').then((i) => set('knightIdle', i)),
    ...EXTRA_SHEETS.flatMap((id) => [
      load(`assets/char_${id}.png`).then((i) => { images.charSheets[id] = i; }),
      load(`assets/char_${id}_idle.png`).then((i) => { images.charIdle[id] = i; }),
    ]),
    ...Games.List.map((g) => load(gameThumbUrl(g.mode)).then((i) => { images.thumbs[g.mode] = i; })),
    ...Object.entries(SPRITE_FILES).map(([name, file]) => load(`assets/sp/${file}`, true).then((i) => { images.sprites[name] = i; })),
    ...art.map(([key, file]) => load(`assets/${file}`).then((i) => set(key, i))),
    ...images.backgrounds.map((_, i) => load(`assets/bg${i}.jpg`).then((img) => { images.backgrounds[i] = img; })),
  ];
  await Promise.all(jobs);
  for (const cb of readyListeners) cb();
}

const EXTRA_SHEETS = ['horn', 'demon', 'zombie'];

// 캐릭터 그림 한 칸의 위치 (그림 파일, 잘라 낼 사각형)
// 가만히 서 있는 그림: 기사는 따로 그린 서 있는 자세, 나머지는 첫 장
export function characterStillCell(index: number): { img: HTMLImageElement; sx: number; sy: number; sw: number; sh: number } | null {
  const c = Characters.List[index];
  if (c?.sheet === 'knight' && images.knightIdle) {
    const img = images.knightIdle;
    return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
  }
  const idle = c ? images.charIdle[c.sheet] : null;
  if (idle) return { img: idle, sx: 0, sy: 0, sw: idle.width, sh: idle.height };
  return characterCell(index, 0);
}

export function characterCell(index: number, frame: number): { img: HTMLImageElement; sx: number; sy: number; sw: number; sh: number } | null {
  const c = Characters.List[index];
  if (!c) return null;
  const img = c.sheet === 'knight' ? images.knight : c.sheet === 'characters' ? images.characters : images.charSheets[c.sheet];
  if (!img) return null;
  const rows = c.sheet === 'characters' ? 3 : 1;
  const sw = img.width / c.frames, sh = img.height / rows;
  return { img, sx: (frame % c.frames) * sw, sy: c.row * sh, sw, sh };
}

export const gameThumbUrl = (mode: GameMode): string => `assets/thumb_${mode}.jpg`;

// 상점 등 HTML 화면에 쓸 캐릭터 그림 (서 있는 자세, 투명 배경 PNG 주소)
const thumbs = new Map<number, string>();
export function characterThumb(index: number): string | null {
  const hit = thumbs.get(index);
  if (hit) return hit;
  const cell = characterStillCell(index);
  if (!cell) return null;
  const cv = document.createElement('canvas');
  cv.width = Math.round(cell.sw / 2);
  cv.height = Math.round(cell.sh / 2);
  const g = cv.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = true;
  g.drawImage(cell.img, cell.sx, cell.sy, cell.sw, cell.sh, 0, 0, cv.width, cv.height);
  try {
    const url = cv.toDataURL('image/png');
    thumbs.set(index, url);
    return url;
  } catch { return null; }
}

// 기사 공격(가로 베기) 그림 한 칸. 기사가 아니거나 그림이 아직 없으면 null
export const ATTACK_FRAMES = 16;
export function characterAttackCell(index: number, frame: number): { img: HTMLImageElement; sx: number; sy: number; sw: number; sh: number } | null {
  const c = Characters.List[index];
  const img = images.knightAttack;
  if (!c || c.id !== 'knight' || !img) return null;
  const sw = img.width / ATTACK_FRAMES, sh = img.height;
  return { img, sx: Math.min(ATTACK_FRAMES - 1, Math.max(0, frame)) * sw, sy: 0, sw, sh };
}
