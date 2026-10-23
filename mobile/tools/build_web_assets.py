# PC 버전의 원본 그림과 소리를 웹(휴대폰)용으로 바꾼다.
#
# 결과 (public/assets/)
#   characters.png  세 캐릭터 걷기 16프레임, 오른쪽 보기만 (왼쪽은 그릴 때 뒤집음)
#                   한 칸 = 논리 크기(67x80)의 2배. 행 = 캐릭터 번호
#   devil.png       악마 128x128 칸, 행 = 동작 (0 걷기 8장, 1~3 점프 6/5/5장), 오른쪽 보기만
#   bg0.jpg ~ bg5.jpg  배경 6종. 세로 1600px, 위쪽(벽돌 구역)을 조금 더 어둡게
#   bgm.wav         배경음악. MP3 는 앞뒤에 빈 구간이 생겨 반복할 때 끊기므로 WAV 그대로 쓴다
#   *.mp3           효과음
#
# 사용: python tools/build_web_assets.py <PC 버전 저장소 폴더> <출력 폴더>
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image

FRAMES = 16
SRC = 480
CHARS = ["kid", "elf", "saint"]       # game/objects.ts 의 캐릭터 순서와 같아야 함
LOGICAL_TALLEST = 80                  # 가장 큰 캐릭터의 논리 높이 (PC 버전과 같음)
SCALE = 2                             # 휴대폰 고해상도 화면용 배율
BACKGROUNDS = ["desert_temple", "sky_towers", "forest_ruins", "snow_forest", "crystal_cave", "mushroom_forest"]
BG_H = 1600
SOUNDS = ["start", "clear", "over", "brick", "stomp"]


def is_baked_shadow(name, x, y, r, g, b):
    """원본에 그려진 바닥 그림자 픽셀 판정 (PC 버전 build_sprites.py 와 같음)"""
    if name == "elf" and y >= 440:
        sat = max(r, g, b) - min(r, g, b)
        return sat < 25 and 45 <= max(r, g, b) <= 135
    if name == "saint" and y >= 452:
        return b - r > 40
    return False


def load_frames(folder, name):
    sheet = Image.open(f"{folder}/{name}_walk_row.png").convert("RGBA")
    frames = []
    for i in range(FRAMES):
        f = sheet.crop((i * SRC, 0, (i + 1) * SRC, SRC))
        a = np.asarray(f).copy()
        if name in ("elf", "saint"):
            ys, xs = np.nonzero(a[..., 3] >= 128)
            for y, x in zip(ys, xs):
                r, g, b = (int(v) for v in a[y, x, :3])
                if is_baked_shadow(name, x, y, r, g, b):
                    a[y, x, 3] = 0
        a[a[..., 3] < 128, 3] = 0
        frames.append(Image.fromarray(a, "RGBA"))
    return frames


def union_bbox(frames):
    boxes = [f.getbbox() for f in frames]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def build_characters(src, out):
    data = {n: load_frames(f"{src}/assets", n) for n in CHARS}
    boxes = {n: union_bbox(data[n]) for n in CHARS}
    k = LOGICAL_TALLEST / max(b[3] - b[1] for b in boxes.values())
    # 논리 크기는 PC 버전과 같게 계산하고, 실제 그림은 SCALE 배로 만든다
    logical = {n: (round((b[2] - b[0]) * k), round((b[3] - b[1]) * k)) for n, b in boxes.items()}
    cell_w = max(s[0] for s in logical.values())
    cell_h = max(s[1] for s in logical.values())
    cw, ch = cell_w * SCALE, cell_h * SCALE
    sheet = Image.new("RGBA", (cw * FRAMES, ch * len(CHARS)), (0, 0, 0, 0))
    for ci, n in enumerate(CHARS):
        w, h = logical[n][0] * SCALE, logical[n][1] * SCALE
        for fi, f in enumerate(data[n]):
            c = f.crop(boxes[n]).resize((w, h), Image.LANCZOS)
            sheet.alpha_composite(c, (fi * cw + (cw - w) // 2, ci * ch + ch - h))
    sheet.save(f"{out}/characters.png", optimize=True)
    print(f"characters.png  logical cell {cell_w}x{cell_h}, sheet {sheet.size}")


def build_devil(src, out):
    anims = [("walk", 8), ("jump", 6), ("jump2", 5), ("jump3", 5)]
    cell = 128
    sheet = Image.new("RGBA", (cell * 8, cell * len(anims)), (0, 0, 0, 0))
    for r, (name, count) in enumerate(anims):
        s = Image.open(f"{src}/assets/devil/{name}_sheet.png").convert("RGBA")
        sheet.alpha_composite(s.crop((0, 0, cell * count, cell)), (0, r * cell))
    sheet.save(f"{out}/devil.png", optimize=True)
    print("devil.png", sheet.size)


def build_backgrounds(src, out):
    for i, name in enumerate(BACKGROUNDS):
        im = Image.open(f"{src}/assets/backgrounds/{name}.png").convert("RGB")
        w, h = im.size
        im = im.resize((round(w * BG_H / h), BG_H), Image.LANCZOS)
        a = np.asarray(im).astype(np.float32)
        ramp = np.linspace(0.50, 0.66, BG_H, dtype=np.float32)[:, None, None]
        a = np.clip(a * ramp, 0, 255).astype(np.uint8)
        Image.fromarray(a, "RGB").save(f"{out}/bg{i}.jpg", quality=82, optimize=True, progressive=True)
        print(f"bg{i}.jpg ({name})", im.size, os.path.getsize(f"{out}/bg{i}.jpg") // 1024, "KB")


def build_sounds(src, out):
    shutil.copyfile(f"{src}/resources/bgm.wav", f"{out}/bgm.wav")
    for name in SOUNDS:
        rate = "96k"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                        "-i", f"{src}/resources/{name}.wav", "-c:a", "libmp3lame", "-b:a", rate,
                        f"{out}/{name}.mp3"], check=True)
        print(f"{name}.mp3", os.path.getsize(f"{out}/{name}.mp3") // 1024, "KB")


def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    build_characters(src, out)
    build_devil(src, out)
    build_backgrounds(src, out)
    build_sounds(src, out)


if __name__ == "__main__":
    main()
