# 캐릭터 걷기 시트(480x480 x 16프레임, 가로 한 줄) 3개를 GDI용 BMP 한 장으로 합친다.
#
# 결과: characters.bmp
#   행 = 캐릭터 번호 * 2 + 방향 (0: 오른쪽 보기, 1: 왼쪽 보기)
#   열 = 프레임 번호 (0~15)
#   마젠타(255,0,255) = 투명색
#
# 사용: python build_sprites.py <assets 폴더> <출력 bmp 경로>
import sys
from PIL import Image

FRAMES = 16
SRC = 480
CHARS = ["kid", "elf", "saint"]   # Game.cpp 의 캐릭터 순서와 같아야 함
TALLEST_PX = 80                    # 가장 큰 캐릭터의 출력 높이 (상대 크기는 유지)
KEY = (255, 0, 255)


def is_baked_shadow(name, x, y, r, g, b):
    """원본에 그려진 바닥 그림자 픽셀 판정"""
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
        px = f.load()
        for y in range(SRC):
            for x in range(SRC):
                r, g, b, a = px[x, y]
                if a < 128 or is_baked_shadow(name, x, y, r, g, b):
                    px[x, y] = (0, 0, 0, 0)
                else:
                    px[x, y] = (r, g, b, 255)
        frames.append(f)
    return frames


def union_bbox(frames):
    x0 = y0 = 10 ** 9
    x1 = y1 = 0
    for f in frames:
        b = f.getbbox()
        x0, y0 = min(x0, b[0]), min(y0, b[1])
        x1, y1 = max(x1, b[2]), max(y1, b[3])
    return x0, y0, x1, y1


def main():
    folder, out = sys.argv[1], sys.argv[2]
    data = {n: load_frames(folder, n) for n in CHARS}
    boxes = {n: union_bbox(data[n]) for n in CHARS}

    scale = TALLEST_PX / max(b[3] - b[1] for b in boxes.values())
    sizes = {n: (round((b[2] - b[0]) * scale), round((b[3] - b[1]) * scale)) for n, b in boxes.items()}
    cell_w = max(s[0] for s in sizes.values())
    cell_h = max(s[1] for s in sizes.values())

    sheet = Image.new("RGB", (cell_w * FRAMES, cell_h * len(CHARS) * 2), KEY)
    for ci, n in enumerate(CHARS):
        w, h = sizes[n]
        for fi, f in enumerate(data[n]):
            c = f.crop(boxes[n]).resize((w, h), Image.LANCZOS)
            alpha = c.split()[3].point(lambda v: 255 if v >= 140 else 0)
            rgb = c.convert("RGB")
            p = rgb.load()
            for y in range(h):
                for x in range(w):
                    if p[x, y] == KEY:
                        p[x, y] = (254, 0, 254)
            # 셀 안에서 가로 중앙, 발은 셀 바닥에 맞춤
            tile = Image.new("RGB", (cell_w, cell_h), KEY)
            tile.paste(rgb, ((cell_w - w) // 2, cell_h - h), alpha)
            sheet.paste(tile, (fi * cell_w, (ci * 2) * cell_h))
            sheet.paste(tile.transpose(Image.FLIP_LEFT_RIGHT), (fi * cell_w, (ci * 2 + 1) * cell_h))

    sheet.save(out)
    print(f"cell {cell_w}x{cell_h}, sizes {sizes}, sheet {sheet.size}")


if __name__ == "__main__":
    main()
