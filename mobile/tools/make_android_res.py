# 안드로이드 앱 아이콘과 시작 화면 그림을 store/logo_600.png 로 만든다.
# npx cap add android 뒤에 한 번 실행 (이미 있는 그림 파일을 같은 크기로 덮어씀)
#
# 사용: python tools/make_android_res.py <store 폴더> <android/app/src/main/res 폴더>
import glob
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

STORE, RES = sys.argv[1], sys.argv[2]
LOGO = Image.open(f"{STORE}/logo_600.png").convert("RGBA")
TOP, BOT = np.array([44, 52, 104]), np.array([14, 16, 36])   # 로고 배경 그라데이션과 같은 색
BG = (20, 22, 31)                                              # 게임 바탕색 #14161f
DENS = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def gradient(size, y0, y1):
    """세로 그라데이션. 로고가 y0~y1 에 놓일 때 이어지도록 그 바깥은 끝 색을 유지"""
    ys = np.arange(size)[:, None, None]
    t = np.clip((ys - y0) / max(1, (y1 - y0)), 0, 1)
    col = (TOP * (1 - t) + BOT * t).astype(np.uint8)
    return Image.fromarray(np.repeat(col, size, axis=1), "RGB").convert("RGBA")


def rounded(im, r):
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], r, fill=255)
    out = im.copy()
    out.putalpha(m)
    return out


def icons():
    for d, k in DENS.items():
        folder = f"{RES}/mipmap-{d}"
        n = round(48 * k)
        LOGO.resize((n, n), Image.LANCZOS).convert("RGB").save(f"{folder}/ic_launcher.png")
        circ = LOGO.resize((n, n), Image.LANCZOS)
        m = Image.new("L", (n, n), 0)
        ImageDraw.Draw(m).ellipse([0, 0, n - 1, n - 1], fill=255)
        circ.putalpha(m)
        circ.save(f"{folder}/ic_launcher_round.png")
        # 적응형 아이콘: 108dp 칸 가운데 72dp 에 로고, 배경은 이어지는 그라데이션
        a = round(108 * k)
        inner = round(72 * k)
        off = (a - inner) // 2
        fg = Image.new("RGBA", (a, a), (0, 0, 0, 0))
        fg.alpha_composite(LOGO.resize((inner, inner), Image.LANCZOS), (off, off))
        fg.save(f"{folder}/ic_launcher_foreground.png")
        gradient(a, off, off + inner).save(f"{folder}/ic_launcher_background.png")
    # 적응형 아이콘 배경을 단색 대신 그림으로
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        p = f"{RES}/mipmap-anydpi-v26/{name}"
        s = open(p, encoding="utf-8").read().replace("@color/ic_launcher_background", "@mipmap/ic_launcher_background")
        open(p, "w", encoding="utf-8").write(s)
    print("icons ok")


def splashes():
    font_path = "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc"
    for p in glob.glob(f"{RES}/drawable*/splash.png"):
        w, h = Image.open(p).size
        img = Image.new("RGBA", (w, h), BG + (255,))
        s = round(min(w, h) * 0.42)
        logo = rounded(LOGO.resize((s, s), Image.LANCZOS), round(s * 0.12))
        y = (h - s) // 2 - round(s * 0.15)
        img.alpha_composite(logo, ((w - s) // 2, y))
        f = ImageFont.truetype(font_path, max(12, round(s * 0.16)), index=1)
        ImageDraw.Draw(img).text((w / 2, y + s + round(s * 0.2)), "블록 브레이커", font=f, fill=(255, 255, 255), anchor="mm")
        img.convert("RGB").save(p)
    print("splash ok")


icons()
splashes()
