# 빌드 결과(dist)를 휴대폰 브라우저 미리보기용 한 페이지로 묶는다.
# JS 와 CSS 는 페이지 안에 넣고, 그림과 소리는 assets/ 에 둔다.
#
# 사용: python tools/make_web_preview.py <dist 폴더> <출력 폴더>
import os
import re
import shutil
import sys

dist, out = sys.argv[1], sys.argv[2]
html = open(f"{dist}/index.html", encoding="utf-8").read()
js_name = re.search(r'src="\./assets/(index-[^"]+\.js)"', html).group(1)
css_name = re.search(r'href="\./assets/(index-[^"]+\.css)"', html).group(1)
js = open(f"{dist}/assets/{js_name}", encoding="utf-8").read().replace("</script", "<\\/script")
css = open(f"{dist}/assets/{css_name}", encoding="utf-8").read()

page = f"""<title>블록 브레이커</title>
<meta name="theme-color" content="#14161f">
<style>{css}</style>
<canvas id="screen"></canvas>
<script type="module">{js}</script>
"""

shutil.rmtree(out, ignore_errors=True)
os.makedirs(f"{out}/assets")
for f in os.listdir(f"{dist}/assets"):
    if f.startswith("index-"):
        continue
    shutil.copy(f"{dist}/assets/{f}", f"{out}/assets/{f}")
open(f"{out}/index.html", "w", encoding="utf-8").write(page)
print("page", len(page) // 1024, "KB,", len(os.listdir(f"{out}/assets")), "asset files")
