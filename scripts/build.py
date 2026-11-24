#!/usr/bin/env python3
"""3분 데브 정적 피드 빌더.

data/YYYY-MM-DD.json 이 호 하나의 원본이다. 이 스크립트는 그 파일들만 읽어서
data/index.json 과 feed.xml 을 다시 만든다. 새 호를 발행하려면:

    1) data/YYYY-MM-DD.json 작성 (형식은 2026-11-24.json 참고)
    2) python3 scripts/build.py
    3) 정적 파일 그대로 배포 (빌드 도구 없음)

site.json 의 baseUrl 은 배포 도메인으로 바꾼다.
"""
import json
import glob
import os
import html
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SITE = os.path.join(ROOT, "site.json")
KST = timezone(timedelta(hours=9))


def load_site():
    with open(SITE, encoding="utf-8") as f:
        return json.load(f)


def load_issues():
    issues = []
    for path in sorted(glob.glob(os.path.join(DATA, "20*.json"))):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        data["_path"] = os.path.relpath(path, ROOT).replace(os.sep, "/")
        issues.append(data)
    issues.sort(key=lambda d: d["date"], reverse=True)
    return issues


def build_index(site, issues):
    out = {
        "service": site["service"],
        "tagline": site["tagline"],
        "updatedAt": datetime.now(KST).replace(microsecond=0).isoformat(),
        "issues": [
            {
                "date": d["date"],
                "weekday": d.get("weekday", ""),
                "path": d["_path"],
            }
            for d in issues
        ],
    }
    with open(os.path.join(DATA, "index.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return out


def rfc822(date_str, hour=8):
    d = datetime.strptime(date_str, "%Y-%m-%d").replace(hour=hour, tzinfo=KST)
    return d.strftime("%a, %d %b %Y %H:%M:%S %z")


def build_feed(site, issues):
    base = site["baseUrl"].rstrip("/")
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "  <channel>",
        f"    <title>{html.escape(site['service'])} — {html.escape(site['tagline'])}</title>",
        f"    <link>{base}/</link>",
        f"    <description>{html.escape(site['description'])}</description>",
        "    <language>ko</language>",
        f"    <atom:link href=\"{base}/feed.xml\" rel=\"self\" type=\"application/rss+xml\" />",
        f"    <lastBuildDate>{rfc822(issues[0]['date'], 8)}</lastBuildDate>",
        "  </channel>",
        "</rss>",
    ]

    items = []
    for d in issues:
        for it in d["items"]:
            desc_bits = [f"<p>{html.escape(s)}</p>" for s in it["summary"]]
            desc_bits.append(f"<p><strong>한 줄 평</strong> {html.escape(it['take'])}</p>")
            desc_bits.append(
                f"<p>{html.escape(it['sourceName'])} · {html.escape(' · '.join(it['meta']))}</p>"
            )
            items.append(
                "\n".join(
                    [
                        "    <item>",
                        f"      <title>{html.escape(it['title'])}</title>",
                        f"      <link>{html.escape(it['url'])}</link>",
                        f"      <guid isPermaLink=\"false\">{html.escape(d['date'] + '-' + str(it['rank']) + '-' + it['url'])}</guid>",
                        f"      <category>{html.escape(it['sourceName'])}</category>",
                        f"      <pubDate>{rfc822(d['date'], 8)}</pubDate>",
                        f"      <description>{html.escape(''.join(desc_bits))}</description>",
                        "    </item>",
                    ]
                )
            )

    lines[-2:-2] = items
    xml = "\n".join(lines) + "\n"
    with open(os.path.join(ROOT, "feed.xml"), "w", encoding="utf-8") as f:
        f.write(xml)
    return xml


def main():
    site = load_site()
    issues = load_issues()
    if not issues:
        raise SystemExit("data/ 에 호 파일이 없다")
    index = build_index(site, issues)
    build_feed(site, issues)
    total = sum(len(i["items"]) for i in issues)
    print(f"발행 {len(index['issues'])}개 날짜 / 항목 {total}개")
    print("data/index.json, feed.xml 갱신 완료")


if __name__ == "__main__":
    main()
