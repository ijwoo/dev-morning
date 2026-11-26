#!/usr/bin/env python3
"""달력·이전/다음 호 동작 검증 + 스크린샷.

사용: python3 scripts/qa_calendar.py
결과: qa/cal_*.png, qa/report_calendar.json
"""
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
PORT = 8766

LIBS = "/workspace/tmp/libs/root/usr/lib/x86_64-linux-gnu"
SHELL_DIR = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64"
)
CHROME = os.path.join(SHELL_DIR, "chrome-headless-shell")


def launch_args():
    return dict(
        executable_path=CHROME,
        env={**os.environ, "LD_LIBRARY_PATH": LIBS + ":" + SHELL_DIR},
        args=["--no-sandbox", "--font-render-hinting=none"],
    )


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = partial(Quiet, directory=str(ROOT))
    return ThreadingHTTPServer(("127.0.0.1", PORT), handler)


def state(page):
    return page.evaluate(
        """() => {
          const q = (s) => document.querySelector(s);
          const cal = q('#calendar');
          const rect = cal && !cal.hidden ? cal.getBoundingClientRect() : null;
          return {
            url: location.href,
            date: q('#date').textContent.trim(),
            title: document.title,
            prevDisabled: q('#prev-issue').disabled,
            nextDisabled: q('#next-issue').disabled,
            calOpen: cal ? !cal.hidden : null,
            calLabel: q('#cal-label').textContent.trim(),
            calRect: rect ? {left: Math.round(rect.left), right: Math.round(rect.right),
                             top: Math.round(rect.top), bottom: Math.round(rect.bottom)} : null,
            viewport: document.documentElement.clientWidth,
            available: Array.from(document.querySelectorAll('.cal-day.is-available')).map(b => b.dataset.date),
            current: (q('.cal-day[aria-current="date"]') || {}).textContent || null,
            itemCount: document.querySelectorAll('.item').length,
            firstTitle: (q('.item-title') || {}).textContent || null,
            archive: Array.from(document.querySelectorAll('#archive a')).map(a => a.textContent.trim()),
            expanded: q('#date-btn').getAttribute('aria-expanded')
          };
        }"""
    )


def run(page, report, name):
    log = []
    page.goto(f"http://127.0.0.1:{PORT}/", wait_until="networkidle", timeout=60000)
    page.wait_for_selector(".item", timeout=30000)
    page.wait_for_timeout(500)

    s0 = state(page)
    log.append(("기본", s0))
    page.screenshot(path=str(QA / f"cal_{name}_default.png"))
    page.screenshot(path=str(QA / f"cal_{name}_default_full.png"), full_page=True)

    # 달력 열기
    page.click("#date-btn")
    page.wait_for_selector("#calendar:not([hidden])", timeout=5000)
    page.wait_for_timeout(320)
    s1 = state(page)
    log.append(("달력 열림", s1))
    page.screenshot(path=str(QA / f"cal_{name}_open.png"))

    # 발행되지 않은 날짜는 비활성
    disabled_days = page.eval_on_selector_all(
        ".cal-day:disabled", "els => els.map(e => e.textContent)"
    )
    log.append(("비활성 날짜 수", len(disabled_days)))

    # 과거 호 선택 (11-25)
    page.click('.cal-day[data-date="2026-11-25"]')
    page.wait_for_timeout(450)
    s2 = state(page)
    log.append(("11-25 선택", s2))
    page.screenshot(path=str(QA / f"cal_{name}_1125.png"))

    # 이전 호
    page.click("#prev-issue")
    page.wait_for_timeout(450)
    s3 = state(page)
    log.append(("이전 호 →", s3))

    # 가장 오래된 호에서 이전 비활성 확인
    page.click("#prev-issue", force=True)
    page.wait_for_timeout(250)
    s3b = state(page)
    log.append(("가장 오래된 호", s3b))
    page.screenshot(path=str(QA / f"cal_{name}_oldest.png"))

    # 다음 호 두 번
    page.click("#next-issue")
    page.wait_for_timeout(300)
    page.click("#next-issue")
    page.wait_for_timeout(400)
    s4 = state(page)
    log.append(("다음 호 → 최신", s4))

    # 뒤로가기
    page.go_back()
    page.wait_for_timeout(500)
    s5 = state(page)
    log.append(("뒤로가기", s5))

    # 달력 열고 ESC 닫기
    page.click("#date-btn")
    page.wait_for_timeout(260)
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    s6 = state(page)
    log.append(("ESC 닫기", s6))

    # 바깥 클릭 닫기
    page.click("#date-btn")
    page.wait_for_timeout(220)
    page.mouse.click(s6["viewport"] // 2, 700)
    page.wait_for_timeout(200)
    s7 = state(page)
    log.append(("바깥 클릭 닫기", s7))

    # 달력 열어 최신 호 선택 + 팝오버 겹침/넘침 확인
    page.click("#date-btn")
    page.wait_for_timeout(300)
    s8 = state(page)
    overlap = page.evaluate(
        """() => {
          const cal = document.querySelector('#calendar').getBoundingClientRect();
          const hits = [];
          document.querySelectorAll('.filters, .item, .masthead h1, .topbar').forEach(el => {
            const r = el.getBoundingClientRect();
            const ox = Math.min(cal.right, r.right) - Math.max(cal.left, r.left);
            const oy = Math.min(cal.bottom, r.bottom) - Math.max(cal.top, r.top);
            if (ox > 0 && oy > 0 && el.getBoundingClientRect().width > 0) {
              // 요소가 달력보다 뒤에 그려지는지(z-index 비교)
              const zc = parseInt(getComputedStyle(document.querySelector('#calendar')).zIndex) || 0;
              hits.push({cls: el.className.toString().slice(0,40), ox: Math.round(ox), oy: Math.round(oy), z: getComputedStyle(el).zIndex});
            }
          });
          return {overlaps: hits, zIndex: getComputedStyle(document.querySelector('#calendar')).zIndex};
        }"""
    )
    log.append(("달력 겹침 후보", overlap))
    page.screenshot(path=str(QA / f"cal_{name}_open2.png"))

    # 모바일 좌우 넘침 확인
    fits = s8["calRect"] and s8["calRect"]["left"] >= 0 and s8["calRect"]["right"] <= s8["viewport"]
    log.append(("팝오버 화면 안", fits))

    report[name] = log
    return log


def main():
    QA.mkdir(parents=True, exist_ok=True)
    httpd = serve()
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    time.sleep(0.5)

    report = {}
    console = []
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_args())
        for name, width, height, dsf in (("desktop", 1440, 900, 2), ("mobile", 390, 844, 3)):
            ctx = browser.new_context(
                viewport={"width": width, "height": height},
                device_scale_factor=dsf,
                locale="ko-KR",
                timezone_id="Asia/Seoul",
            )
            page = ctx.new_page()
            page.on("console", lambda m, bag=console: bag.append({"type": m.type, "text": m.text}))
            page.on("pageerror", lambda e, bag=console: bag.append({"type": "pageerror", "text": str(e)}))
            page.on("requestfailed", lambda r, bag=console: bag.append({"type": "requestfailed", "text": f"{r.url} {r.failure}"}))
            run(page, report, name)
            ctx.close()
        browser.close()

    httpd.shutdown()
    report["console"] = console
    (QA / "report_calendar.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    for name in ("desktop", "mobile"):
        print(f"=== {name} ===")
        for label, s in report[name]:
            print(f" [{label}]", json.dumps(s, ensure_ascii=False))
    print("=== console ===")
    for c in console:
        print(" ", c)


if __name__ == "__main__":
    main()
