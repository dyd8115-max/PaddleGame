# 콘솔에 올릴 로고(600x600), 썸네일(1932x828), 공유 이미지(1200x600)를 만든다.
# 스크린샷은 tools/store_shots.py 로 먼저 찍어 둔다.
#
# 사용: python tools/store_art.py <PC 버전 저장소 폴더> <store 폴더>
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC, OUT = sys.argv[1], sys.argv[2]
TITLE = "블록 브레이커"
SUB = "캐릭터를 골라 벽돌을 깨부숴요"
FONT_TITLE = ("/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc", 1)
FONT_SUB = ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 1)

ROW_COLORS = [(230, 80, 80), (240, 150, 60), (80, 200, 120), (80, 160, 240), (170, 110, 230)]
ITEM = (255, 230, 90)


def font(spec, size):
    return ImageFont.truetype(spec[0], size, index=spec[1])


def character(name, frame, height):
    """480px 원본 걷기 프레임에서 한 장을 잘라 높이 height 로 (그림자 제거)"""
    sheet = Image.open(f"{SRC}/assets/{name}_walk_row.png").convert("RGBA")
    f = sheet.crop((frame * 480, 0, frame * 480 + 480, 480))
    a = np.asarray(f).copy()
    if name in ("elf", "saint"):
        r, g, b = (a[..., i].astype(int) for i in range(3))
        mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
        ys = np.arange(480)[:, None]
        if name == "elf":
            shadow = (ys >= 440) & ((mx - mn) < 25) & (mx >= 45) & (mx <= 135)
        else:
            shadow = (ys >= 452) & ((b - r) > 40)
        a[shadow, 3] = 0
    a[a[..., 3] < 128, 3] = 0
    f = Image.fromarray(a, "RGBA")
    f = f.crop(f.getbbox())
    w = round(f.width * height / f.height)
    return f.resize((w, height), Image.LANCZOS)


def shadowed_text(img, xy, text, fnt, fill, stroke=8, anchor="la"):
    d = ImageDraw.Draw(img)
    # 부드러운 그림자
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).text((xy[0] + 6, xy[1] + 8), text, font=fnt, fill=(0, 0, 0, 170), anchor=anchor,
                            stroke_width=stroke, stroke_fill=(0, 0, 0, 170))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)))
    d.text(xy, text, font=fnt, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=(20, 18, 40))


def brick(d, x, y, w, h, color):
    dark = tuple(int(c * 0.55) for c in color)
    light = tuple(min(255, int(c + (255 - c) * 0.45)) for c in color)
    d.rectangle([x - 3, y - 3, x + w + 3, y + h + 3], fill=(16, 16, 28))
    d.rectangle([x, y, x + w, y + h], fill=color)
    d.rectangle([x, y, x + w, y + 6], fill=light)          # 위쪽 밝은 면
    d.rectangle([x, y + h - 6, x + w, y + h], fill=dark)   # 아래쪽 어두운 면


def rounded_shot(path, height, radius=34, border=6):
    s = Image.open(path).convert("RGBA")
    w = round(s.width * height / s.height)
    s = s.resize((w, height), Image.LANCZOS)
    mask = Image.new("L", s.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, height - 1], radius, fill=255)
    framed = Image.new("RGBA", (w + border * 2, height + border * 2), (0, 0, 0, 0))
    ImageDraw.Draw(framed).rounded_rectangle([0, 0, framed.width - 1, framed.height - 1], radius + border,
                                             fill=(245, 245, 250, 255))
    framed.paste(s, (border, border), mask)
    return framed


def drop_shadow(canvas, im, xy, blur=22, offset=(0, 18), alpha=150):
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    a = im.split()[3].point(lambda v: alpha if v > 0 else 0)
    blk = Image.new("RGBA", im.size, (0, 0, 0, 255))
    blk.putalpha(a)
    sh.paste(blk, (xy[0] + offset[0], xy[1] + offset[1]), blk)
    canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))
    canvas.alpha_composite(im, xy)


def background_band(w, h, y0_ratio=0.28):
    bg = Image.open(f"{SRC}/assets/backgrounds/forest_ruins.png").convert("RGB")
    band_h = round(bg.width * h / w)
    y0 = round(bg.height * y0_ratio)
    bg = bg.crop((0, y0, bg.width, y0 + band_h)).resize((w, h), Image.LANCZOS)
    a = np.asarray(bg).astype(np.float32)
    # 왼쪽(글자 자리)을 더 어둡게
    ramp = np.linspace(0.38, 0.75, w, dtype=np.float32)[None, :, None]
    a = np.clip(a * ramp, 0, 255).astype(np.uint8)
    return Image.fromarray(a, "RGB").convert("RGBA")


# ---------- 로고 600x600 ----------
def logo():
    S = 600
    img = Image.new("RGBA", (S, S))
    top, bot = np.array([44, 52, 104]), np.array([14, 16, 36])
    t = np.linspace(0, 1, S)[:, None, None]
    grad = (top * (1 - t) + bot * t).astype(np.uint8)
    img = Image.fromarray(np.repeat(grad, S, axis=1), "RGB").convert("RGBA")
    d = ImageDraw.Draw(img)

    # 벽돌 3줄 (한 칸은 깨지는 중)
    cols, bw, bh, gap, left, y0 = 4, 112, 42, 16, 44, 64
    for r in range(3):
        for c in range(cols):
            x, y = left + c * (bw + gap), y0 + r * (bh + gap)
            if r == 2 and c == 2:
                # 깨진 조각
                for (dx, dy, s) in [(10, 8, 26), (52, 18, 20), (84, -2, 16), (30, 40, 14), (70, 44, 12)]:
                    d.rectangle([x + dx, y + dy, x + dx + s, y + dy + s], fill=ITEM)
                continue
            color = ITEM if (r, c) == (1, 1) else ROW_COLORS[r]
            brick(d, x, y, bw, bh, color)

    # 공과 꼬리
    bx, by, bs = 392, 232, 34
    for i, a in enumerate([40, 70, 110, 160]):
        k = 4 - i
        tx, ty = bx - k * 30, by + k * 34
        ts = bs - k * 4
        trail = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(trail).rectangle([tx, ty, tx + ts, ty + ts], fill=(255, 255, 255, a))
        img.alpha_composite(trail)
    d = ImageDraw.Draw(img)
    d.rectangle([bx - 4, by - 4, bx + bs + 4, by + bs + 4], fill=(16, 16, 28))
    d.rectangle([bx, by, bx + bs, by + bs], fill=(255, 255, 255))

    # 패들과 캐릭터
    pw, ph, py = 220, 30, 396
    px = (S - pw) // 2
    d.rectangle([px - 4, py - 4, px + pw + 4, py + ph + 4], fill=(16, 16, 28))
    d.rectangle([px, py, px + pw, py + ph], fill=(222, 222, 232))
    d.rectangle([px, py, px + pw, py + 7], fill=(255, 255, 255))
    kid = character("kid", 3, 140)
    img.alpha_composite(kid, ((S - kid.width) // 2, py + ph + 6))
    img.convert("RGB").save(f"{OUT}/logo_600.png")
    print("logo_600.png")


# ---------- 썸네일 1932x828 ----------
def thumbnail():
    W, H = 1932, 828
    img = background_band(W, H)
    shadowed_text(img, (90, 120), TITLE, font(FONT_TITLE, 150), (255, 255, 255))
    shadowed_text(img, (96, 316), SUB, font(FONT_SUB, 54), (255, 230, 90), stroke=6)
    x = 110
    for name, frame in [("kid", 3), ("elf", 5), ("saint", 2)]:
        c = character(name, frame, 300)
        drop_shadow(img, c, (x, H - 40 - c.height), blur=14, offset=(0, 10), alpha=120)
        x += c.width + 40
    p1 = rounded_shot(f"{OUT}/screenshot2_636x1048.png", 690)
    p2 = rounded_shot(f"{OUT}/screenshot3_636x1048.png", 690)
    gap, right = 30, 56
    x2 = W - right - p2.width
    x1 = x2 - gap - p1.width
    y = (H - p1.height) // 2 - 6
    drop_shadow(img, p1, (x1, y))
    drop_shadow(img, p2, (x2, y))
    img.convert("RGB").save(f"{OUT}/thumbnail_1932x828.png")
    print("thumbnail_1932x828.png")


# ---------- 공유 이미지 1200x600 ----------
def og():
    W, H = 1200, 600
    img = background_band(W, H)
    shadowed_text(img, (60, 90), TITLE, font(FONT_TITLE, 104), (255, 255, 255), stroke=6)
    shadowed_text(img, (64, 226), SUB, font(FONT_SUB, 38), (255, 230, 90), stroke=5)
    x = 70
    for name, frame in [("kid", 3), ("elf", 5), ("saint", 2)]:
        c = character(name, frame, 210)
        drop_shadow(img, c, (x, H - 30 - c.height), blur=10, offset=(0, 8), alpha=120)
        x += c.width + 28
    p = rounded_shot(f"{OUT}/screenshot2_636x1048.png", 520, radius=26, border=5)
    drop_shadow(img, p, (W - p.width - 70, 34))
    img.convert("RGB").save(f"{OUT}/share_1200x600.png")
    print("share_1200x600.png")


logo()
thumbnail()
og()
