# 악마 스프라이트 시트 4장을 GDI용 BMP 한 장으로 합친다.
#
# 결과: devil.bmp (1024 x 1024)
#   한 칸 128 x 128, 게임 화면에 1배로 그림
#   행 = 동작 번호 * 2 + 방향 (0: 오른쪽 보기, 1: 왼쪽 보기)
#        동작 번호: 0 걷기(8장), 1 점프(6장), 2 점프2(5장), 3 점프3(5장)
#   마젠타(255,0,255) = 투명색
#
# 사용: python build_devil.py <assets/devil 폴더> <출력 bmp 경로>
import sys
from PIL import Image

CELL = 128
ANIMS = [("walk", 8), ("jump", 6), ("jump2", 5), ("jump3", 5)]   # GameObjects.h 의 DevilSprite 와 같아야 함
KEY = (255, 0, 255)


def main():
    folder, out = sys.argv[1], sys.argv[2]
    cols = max(n for _, n in ANIMS)
    sheet = Image.new("RGB", (CELL * cols, CELL * len(ANIMS) * 2), KEY)
    for a, (name, count) in enumerate(ANIMS):
        src = Image.open(f"{folder}/{name}_sheet.png").convert("RGBA")
        for i in range(count):
            f = src.crop((i * CELL, 0, (i + 1) * CELL, CELL))
            alpha = f.split()[3].point(lambda v: 255 if v >= 128 else 0)
            rgb = f.convert("RGB")
            p = rgb.load()
            for y in range(CELL):
                for x in range(CELL):
                    if p[x, y] == KEY:
                        p[x, y] = (254, 0, 254)
            tile = Image.new("RGB", (CELL, CELL), KEY)
            tile.paste(rgb, (0, 0), alpha)
            sheet.paste(tile, (i * CELL, (a * 2) * CELL))
            sheet.paste(tile.transpose(Image.FLIP_LEFT_RIGHT), (i * CELL, (a * 2 + 1) * CELL))
    sheet.save(out)
    print(f"devil sheet {sheet.size}")


if __name__ == "__main__":
    main()
