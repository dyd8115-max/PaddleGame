# 배경 그림들을 GDI용 BMP 한 장으로 합친다.
#
# 결과: backgrounds.bmp
#   배경 하나 = 960 x 1280 (게임 논리 화면 480 x 640 의 2배)
#   세로로 차례대로 쌓음. 순서는 BACKGROUNDS 목록 순서 (GameObjects.h 의 Backgrounds::Count 와 개수가 같아야 함)
#
# 처리
#   1. 3:4 비율로 자름: 가로는 가운데 기준, 세로는 바닥(땅)을 살리고 위쪽을 자름
#   2. 960 x 1280 으로 크기 맞춤
#   3. 흰 공과 원색 벽돌이 잘 보이도록 전체를 어둡게 하고, 위쪽(벽돌 구역)은 조금 더 어둡게
#
# 사용: python build_backgrounds.py <배경 폴더> <출력 bmp 경로>
import sys
import numpy as np
from PIL import Image

BACKGROUNDS = [
    "desert_temple",
    "sky_towers",
    "forest_ruins",
    "snow_forest",
    "crystal_cave",
    "mushroom_forest",
]
OUT_W, OUT_H = 960, 1280
BRIGHTNESS_BOTTOM = 0.62   # 아래쪽 밝기 비율
BRIGHTNESS_TOP = 0.48      # 위쪽(벽돌 구역) 밝기 비율


def crop_to_3x4(im):
    w, h = im.size
    target = 3 / 4
    if w / h > target:            # 너무 넓음 → 가로 가운데만
        new_w = round(h * target)
        left = (w - new_w) // 2
        return im.crop((left, 0, left + new_w, h))
    new_h = round(w / target)     # 너무 김 → 바닥을 살리고 위를 자름
    return im.crop((0, h - new_h, w, h))


def process(path):
    im = Image.open(path).convert("RGB")
    im = crop_to_3x4(im).resize((OUT_W, OUT_H), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    ramp = np.linspace(BRIGHTNESS_TOP, BRIGHTNESS_BOTTOM, OUT_H, dtype=np.float32)[:, None, None]
    a = np.clip(a * ramp, 0, 255).astype(np.uint8)
    return Image.fromarray(a, "RGB")


def main():
    folder, out = sys.argv[1], sys.argv[2]
    sheet = Image.new("RGB", (OUT_W, OUT_H * len(BACKGROUNDS)))
    for i, name in enumerate(BACKGROUNDS):
        sheet.paste(process(f"{folder}/{name}.png"), (0, i * OUT_H))
    sheet.save(out)
    print(f"{len(BACKGROUNDS)} backgrounds, sheet {sheet.size}")


if __name__ == "__main__":
    main()
