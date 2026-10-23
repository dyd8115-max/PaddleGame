// 그림 불러오기. 다 불러오기 전에는 그 그림만 빼고 그린다
import { BackgroundCount } from './game/objects';

export interface Images {
  characters: HTMLImageElement | null;
  devil: HTMLImageElement | null;
  backgrounds: (HTMLImageElement | null)[];
}

export const images: Images = {
  characters: null,
  devil: null,
  backgrounds: new Array(BackgroundCount).fill(null),
};

function load(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// 캐릭터와 악마를 먼저, 배경은 그 뒤에 (첫 화면을 빨리 띄우려고)
export async function loadImages(): Promise<void> {
  const [c, d] = await Promise.all([load('assets/characters.png'), load('assets/devil.png')]);
  images.characters = c;
  images.devil = d;
  await Promise.all(images.backgrounds.map(async (_, i) => {
    images.backgrounds[i] = await load(`assets/bg${i}.jpg`);
  }));
}
