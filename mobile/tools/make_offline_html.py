# 빌드 결과(dist)를 인터넷 없이 열리는 HTML 파일 하나로 묶는다.
# 그림과 소리는 data: 주소로 바꿔 window.__ASSETS 에 넣는다 (src/assetUrl.ts 가 이걸 먼저 찾음).
#
# 사용: python tools/make_offline_html.py <dist 폴더> <출력 html 경로>
import base64
import json
import os
import re
import sys

MIME = {".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".wav": "audio/wav"}

dist, out = sys.argv[1], sys.argv[2]
html = open(f"{dist}/index.html", encoding="utf-8").read()
js_name = re.search(r'src="\./assets/(index-[^"]+\.js)"', html).group(1)
css_name = re.search(r'href="\./assets/(index-[^"]+\.css)"', html).group(1)
js = open(f"{dist}/assets/{js_name}", encoding="utf-8").read().replace("</script", "<\\/script")
css = open(f"{dist}/assets/{css_name}", encoding="utf-8").read()

assets = {}
for f in sorted(os.listdir(f"{dist}/assets")):
    ext = os.path.splitext(f)[1]
    if ext not in MIME:
        continue
    data = base64.b64encode(open(f"{dist}/assets/{f}", "rb").read()).decode()
    assets[f"assets/{f}"] = f"data:{MIME[ext]};base64,{data}"

page = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#14161f">
<title>블록 브레이커</title>
<style>{css}</style>
</head>
<body>
<canvas id="screen"></canvas>
<script>window.__ASSETS = {json.dumps(assets)};</script>
<script type="module">{js}</script>
</body>
</html>
"""
open(out, "w", encoding="utf-8").write(page)
print(out, round(len(page.encode()) / 1024 / 1024, 1), "MB,", len(assets), "assets")
