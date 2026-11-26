# 3분 데브

Hacker News와 GitHub 트렌딩에서 고른 해외 개발 소식을 3줄 요약과 한 줄 평으로 정리하는 정적 웹 피드입니다.
빌드 도구 없이 정적 파일만으로 GitHub Pages에 올라갑니다.

- 사이트: https://ijwoo.github.io/dev-morning/
- RSS: https://ijwoo.github.io/dev-morning/feed.xml
- 로컬 미리보기: `python3 -m http.server 8000`

## 구조

```
index.html            피드 한 장 (데이터를 읽어 그리는 껍데기)
styles.css            다크 그레이 스타일시트
app.js                data/*.json 을 fetch 해 렌더 (출처 필터·이전/다음 호·발행일 달력)
feed.xml              RSS 2.0 (build.py 가 생성)
site.json             서비스 이름·소개·배포 주소
data/
  index.json          발행된 날짜 목록 (build.py 가 생성, 달력은 이 목록만 믿는다)
  YYYY-MM-DD.json     하루치 원본 데이터
scripts/
  build.py            data/*.json → index.json + feed.xml 재생성
  qa_calendar.py      달력·이전/다음 호 동작 검증 스크린샷
vendor/
  PretendardVariable.woff2
```

## 새 호 내는 법

1. `data/YYYY-MM-DD.json` 작성 (형식은 기존 파일과 같습니다).
2. `python3 scripts/build.py` → `data/index.json`, `feed.xml` 갱신.
3. 커밋·푸시하면 GitHub Pages가 그대로 서빙합니다.
   `?issue=YYYY-MM-DD` 로 지난 날짜를 봅니다.

지난 호는 상단 날짜를 누르면 열리는 달력에서 고릅니다. 달력은 `data/index.json` 의
발행 날짜만 선택되고, 날짜 옆 `‹ ›` 로 하루씩 오갑니다. 주소는 `?issue=` 로 바뀌고
브라우저 뒤로가기도 그대로 따라갑니다. 새 호를 내면 `build.py` 만 돌리면 달력에도 바로 들어갑니다.

`items[]` 필드: `rank`, `source`(`hn`|`github`), `sourceName`, `title`(한국어 헤드라인),
`originalTitle`, `url`, `discussionUrl`(HN 토론, 없으면 null), `meta`(출처 수치·시각 배열),
`summary`(3줄), `take`(한 줄 평).

## 디자인

| 역할 | 값 |
| --- | --- |
| 배경 | `#111114` |
| 헤어라인 | `rgba(255,255,255,0.08)` |
| 본문 | `#ECECEF` / 보조 `#A2A2AC` / 흐림 `#74747E` |
| 포인트 | `#22C58B` (브랜드 점·출처 점·활성 탭에만) |
| 서체 | Pretendard Variable (로컬), `word-break: keep-all` |

카드·그라데이션·배지·이모지는 쓰지 않습니다. 한 단짜리 세로 피드이고 항목은 헤어라인으로만 구분합니다.
