# 구글 플레이 그래픽 이미지(1024x500)를 만든다. 스크린샷 3장과 캐릭터, 제목
# 사용: python tools/play_art.py  (store/screenshot*_636x1048.png 와 public/assets 를 씀)
from PIL import Image, ImageDraw, ImageFont, ImageFilter

TITLE = "레트로 오락실"
W, H = 1024, 500
bg = Image.open("public/assets/bg2.jpg").convert("RGB")
bw, bh = bg.size
s = max(W / bw, H / bh)
bg = bg.resize((int(bw * s) + 1, int(bh * s) + 1))
bg = bg.crop((0, (bg.size[1] - H) // 2, W, (bg.size[1] - H) // 2 + H))
bg = Image.blend(bg, Image.new("RGB", (W, H), (14, 16, 28)), 0.45)
img = bg.convert("RGBA")


def phone(path, h):
    sc = Image.open(path).convert("RGB")
    w = int(sc.size[0] * h / sc.size[1])
    sc = sc.resize((w, h), Image.LANCZOS)
    fr = Image.new("RGBA", (w + 10, h + 10), (0, 0, 0, 0))
    ImageDraw.Draw(fr).rounded_rectangle((0, 0, w + 9, h + 9), 16, fill=(240, 240, 250, 255))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), 12, fill=255)
    fr.paste(sc, (5, 5), mask)
    return fr


phs = [phone(f"store/screenshot{i}_636x1048.png", h) for i, h in [(1, 300), (2, 340), (3, 300)]]
total = sum(p.size[0] for p in phs) + 2 * 10
left = W - total - 18
x = left
for ph, dy in zip(phs, [100, 70, 100]):
    sh = Image.new("RGBA", ph.size, (0, 0, 0, 0))
    sh.paste((0, 0, 0, 150), (0, 0, ph.size[0], ph.size[1]), ph.split()[3])
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)), (x + 6, dy + 8))
    img.alpha_composite(ph, (x, dy))
    x += ph.size[0] + 10
ch = Image.open("public/assets/characters.png").convert("RGBA")
cw, chh = ch.size[0] // 16, ch.size[1] // 3
for i in range(3):
    c = ch.crop((0, i * chh, cw, (i + 1) * chh)).resize((int(cw * 0.95), int(chh * 0.95)), Image.LANCZOS)
    img.alpha_composite(c, (i * int((left - 170) / 2), H - c.size[1] - 2))
d = ImageDraw.Draw(img)
ft = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc", 56, index=1)
fs = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 20, index=1)
st = lambda xy, t, f, c: d.text(xy, t, font=f, fill=c, stroke_width=4, stroke_fill=(10, 12, 22))
st((26, 40), TITLE, ft, (255, 255, 255))
st((30, 122), "땅따먹기 · 룬 돌 깨기 · 빛의 방벽", fs, (255, 216, 77))
st((30, 154), "캐릭터마다 다른 게임 세 가지", fs, (220, 224, 240))
img.convert("RGB").save("store/play/feature_1024x500.png")
print("store/play/feature_1024x500.png")
