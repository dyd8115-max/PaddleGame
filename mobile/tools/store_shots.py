# 콘솔에 올릴 세로 스크린샷(636x1048) 3장을 찍는다.
# 개발 서버를 가짜 SDK 없이 띄운 상태에서 실행: NO_AIT=1 npx vite --port 5182
#
# 사용: python tools/store_shots.py <출력 폴더>
import asyncio
import sys

from PIL import Image
from playwright.async_api import async_playwright

URL = "http://localhost:5182/"
OUT = sys.argv[1]
W, H, DPR = 390, 643, 3          # 636x1048 과 거의 같은 비율로 크게 찍고 줄임

# 공을 따라가는 자동 조작 (스크린샷용)
AUTOPILOT = """
window.__auto = setInterval(() => {
  const g = window.__game;
  if (!g || g.state !== 'playing' || g.balls.length === 0) return;
  // 가장 낮은 곳에서 내려오는 공을 따라감
  let best = null;
  for (const b of g.balls) if (b.vel.y > 0 && (!best || b.pos.y > best.pos.y)) best = b;
  if (!best) best = g.balls[0];
  g.setPaddleTarget(best.pos.x + best.size / 2 + (Math.random() - 0.5) * 30);
}, 16);
"""


async def shot(page, name):
    path = f"{OUT}/{name}_raw.png"
    await page.screenshot(path=path)
    Image.open(path).convert("RGB").resize((636, 1048), Image.LANCZOS).save(f"{OUT}/{name}.png")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        page = await (await b.new_context(viewport={"width": W, "height": H}, device_scale_factor=DPR,
                                          has_touch=True, is_mobile=True)).new_page()
        await page.goto(URL)
        await page.wait_for_timeout(1500)
        L = await page.evaluate("(() => { const l = window.__layout(); return {scale: l.scale, gx: l.gx, gy: l.gy}; })()")
        sx = lambda x: L["gx"] + x * L["scale"]
        sy = lambda y: L["gy"] + y * L["scale"]

        # 1. 캐릭터 고르기 (성녀 선택, 능력 설명 보이게)
        await page.touchscreen.tap(sx(390), sy(225))
        await page.wait_for_timeout(700)
        await shot(page, "screenshot1_636x1048")

        # 2. 1스테이지: 꼬마로 공이 여러 개 나오는 장면
        await page.touchscreen.tap(sx(90), sy(225))
        await page.wait_for_timeout(200)
        await page.touchscreen.tap(sx(240), sy(428))
        await page.evaluate(AUTOPILOT)
        best = None
        for _ in range(60):
            await page.wait_for_timeout(250)
            n = await page.evaluate("window.__game.state === 'playing' ? window.__game.balls.length : -1")
            alive = await page.evaluate("window.__game.bricks.filter(k => k.alive).length")
            if n >= 3 and 12 < alive < 32:
                best = n
                break
        await shot(page, "screenshot2_636x1048")
        print("shot2 balls", best)

        # 3. 2스테이지: 악마가 패들을 밟는 장면
        await page.evaluate("window.__game.state === 'playing' || window.__game.startGame()")
        await page.evaluate("window.__game.bricks.forEach(k => k.alive = false)")
        for _ in range(40):
            await page.wait_for_timeout(200)
            ok = await page.evaluate("""(() => { const g = window.__game;
                return g.state === 'playing' && !g.serving && g.devil.active && g.devil.airborne && g.devil.lift > 25
                  && g.bricks.filter(k => k.alive).length > 20; })()""")
            if ok:
                break
        await shot(page, "screenshot3_636x1048")
        await b.close()


asyncio.run(main())
