// 그림 불러오기. 다 불러오기 전에는 그 그림만 빼고 그린다
import { assetUrl } from './assetUrl';
import { BackgroundCount, Characters } from './game/objects';

export interface Images {
  characters: HTMLImageElement | null;
  knight: HTMLImageElement | null;
  devil: HTMLImageElement | null;
  backgrounds: (HTMLImageElement | null)[];
}

export const images: Images = {
  characters: null,
  knight: null,
  devil: null,
  backgrounds: new Array(BackgroundCount).fill(null),
};

const readyListeners: (() => void)[] = [];
export function onCharactersLoaded(cb: () => void): void { readyListeners.push(cb); }

function load(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = assetUrl(url);
  });
}

// 캐릭터와 악마를 먼저, 배경은 그 뒤에 (첫 화면을 빨리 띄우려고)
export async function loadImages(): Promise<void> {
  const [c, d, k] = await Promise.all([load('assets/characters.png'), load('assets/devil.png'), load('assets/char_knight.png')]);
  images.characters = c;
  images.devil = d;
  images.knight = k;
  for (const cb of readyListeners) cb();
  await Promise.all(images.backgrounds.map(async (_, i) => {
    images.backgrounds[i] = await load(`assets/bg${i}.jpg`);
  }));
}

// 캐릭터 그림 한 칸의 위치 (그림 파일, 잘라 낼 사각형)
export function characterCell(index: number, frame: number): { img: HTMLImageElement; sx: number; sy: number; sw: number; sh: number } | null {
  const c = Characters.List[index];
  if (!c) return null;
  const img = c.sheet === 'knight' ? images.knight : images.characters;
  if (!img) return null;
  const rows = c.sheet === 'characters' ? 3 : 1;
  const sw = img.width / c.frames, sh = img.height / rows;
  return { img, sx: (frame % c.frames) * sw, sy: c.row * sh, sw, sh };
}

// 상점 등 HTML 화면에 쓸 캐릭터 그림 (첫 장, 투명 배경 PNG 주소)
const thumbs = new Map<number, string>();
export function characterThumb(index: number): string | null {
  const hit = thumbs.get(index);
  if (hit) return hit;
  const cell = characterCell(index, 0);
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
