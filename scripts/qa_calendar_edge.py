#!/usr/bin/env python3
"""달력 엣지 케이스: 딥링크·잘못된 날짜·키보드·하단 링크."""
import json
import os
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / "qa"
PORT = 8767
LIBS = "/workspace/tmp/libs/root/usr/lib/x86_64-linux-gnu"
SHELL_DIR = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64"
)
CHROME = os.path.join(SHELL_DIR, "chrome-headless-shell")


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    handler = partial(Quiet, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    time.sleep(0.4)
    base = f"http://127.0.0.1:{PORT}/"
    out = []
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROME,
            env={**os.environ, "LD_LIBRARY_PATH": LIBS + ":" + SHELL_DIR},
            args=["--no-sandbox", "--font-render-hinting=none"],
        )
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR", timezone_id="Asia/Seoul")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)

        # 1) 딥링크: 과거 호
        page.goto(base + "?issue=2026-11-24", wait_until="networkidle")
        page.wait_for_selector(".item")
        out.append(("deep 11-24", page.eval_on_selector("#date", "e => e.textContent.trim()"),
                    page.eval_on_selector("#prev-issue", "e => e.disabled"),
                    page.eval_on_selector("#next-issue", "e => e.disabled")))

        # 2) 없는 날짜 → 최신 호로 정리
        page.goto(base + "?issue=2026-11-20", wait_until="networkidle")
        page.wait_for_selector(".item")
        page.wait_for_timeout(200)
        out.append(("bad date", page.eval_on_selector("#date", "e => e.textContent.trim()"), page.url))

        # 3) 키보드: Tab → Enter 로 달력 열고 ESC 로 닫기, 포커스 복귀
        page.goto(base, wait_until="networkidle")
        page.wait_for_selector(".item")
        page.focus("#date-btn")
        page.keyboard.press("Enter")
        page.wait_for_timeout(250)
        opened = page.eval_on_selector("#calendar", "e => !e.hidden")
        focused = page.evaluate("() => document.activeElement.getAttribute('aria-label') || document.activeElement.id")
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        closed = page.eval_on_selector("#calendar", "e => e.hidden")
        back = page.evaluate("() => document.activeElement.id")
        out.append(("keyboard", opened, focused, closed, back))

        # 4) 하단 지난 호 링크
        page.click("#archive a")
        page.wait_for_timeout(400)
        out.append(("archive link", page.url, page.eval_on_selector("#date", "e => e.textContent.trim()"),
                    page.eval_on_selector_all("#archive a", "els => els.map(a => a.getAttribute('href'))")))

        # 5) 달력에서 월 이동 버튼 (이번 달이 유일 → 양쪽 비활성)
        page.click("#date-btn")
        page.wait_for_timeout(250)
        out.append(("month arrows", page.eval_on_selector("#cal-prev", "e => e.disabled"),
                    page.eval_on_selector("#cal-next", "e => e.disabled")))
        # 6) 포커스 트랩 없음 확인: Tab 이동이 가능한지
        page.keyboard.press("Tab")
        out.append(("tab inside", page.evaluate("() => document.activeElement.className")))

        # 7) 너무 좁은 화면 (320px)
        ctx2 = browser.new_context(viewport={"width": 320, "height": 720}, locale="ko-KR", timezone_id="Asia/Seoul")
        p2 = ctx2.new_page()
        p2.goto(base, wait_until="networkidle")
        p2.wait_for_selector(".item")
        p2.click("#date-btn")
        p2.wait_for_timeout(300)
        rect = p2.eval_on_selector("#calendar", "e => { const r = e.getBoundingClientRect(); return {l: Math.round(r.left), r: Math.round(r.right), vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth}; }")
        out.append(("320px", rect))
        p2.screenshot(path=str(QA / "cal_320_open.png"))
        ctx2.close()
        ctx.close()
        browser.close()

    httpd.shutdown()
    for row in out:
        print(json.dumps(row, ensure_ascii=False))
    print("errors:", errors)


if __name__ == "__main__":
    main()
