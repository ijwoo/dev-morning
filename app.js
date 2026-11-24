/* 3분 데브 — data/*.json 을 읽어 정적으로 그린다. 빌드 없음. */

const SOURCE_ORDER = { hn: 0, github: 1 };

const state = {
  issues: [],
  issue: null,
  filter: "all",
};

const $ = (id) => document.getElementById(id);

function formatDate(iso, weekday) {
  const [y, m, d] = iso.split("-").map(Number);
  const base = `${y}. ${String(m).padStart(2, "0")}. ${String(d).padStart(2, "0")}`;
  return weekday ? `${base} ${weekday}` : base;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function externalLink(href, label, external, withMark = true) {
  const a = el("a", null);
  a.href = href;
  a.textContent = label;
  if (external) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    if (withMark) a.appendChild(el("span", "ext", "↗"));
  }
  return a;
}

function renderItem(item) {
  const article = el("article", "item");
  article.dataset.source = item.source;

  const head = el("p", "item-meta");
  const src = el("span", "src", item.sourceName);
  src.dataset.source = item.source;
  head.appendChild(src);
  item.meta.forEach((value) => {
    head.appendChild(el("span", "dot-sep", "·"));
    const strong = /^(포인트|별)/.test(value);
    head.appendChild(el("span", strong ? "strong" : null, value));
  });
  article.appendChild(head);

  const h2 = el("h2", "item-title");
  h2.appendChild(externalLink(item.url, item.title, true, false));
  article.appendChild(h2);

  if (item.originalTitle) {
    const origin = el("a", "origin");
    origin.href = item.url;
    origin.target = "_blank";
    origin.rel = "noopener noreferrer";
    origin.appendChild(el("span", null, item.originalTitle));
    origin.appendChild(el("span", "arrow", "↗"));
    article.appendChild(origin);
  }

  const list = el("ul", "summary");
  item.summary.forEach((line) => {
    list.appendChild(el("li", null, line));
  });
  article.appendChild(list);

  const take = el("div", "take");
  take.appendChild(el("span", "take-label", "한 줄 평"));
  take.appendChild(el("p", null, item.take));
  article.appendChild(take);

  const links = el("div", "links");
  links.appendChild(externalLink(item.url, item.source === "github" ? "저장소 열기" : "원문 보기", true));
  if (item.discussionUrl) {
    links.appendChild(externalLink(item.discussionUrl, "HN 토론 보기", true));
  }
  article.appendChild(links);

  return article;
}

function renderIssue(issue) {
  state.issue = issue;
  const dateText = formatDate(issue.date, issue.weekday);

  $("date").textContent = dateText;
  $("masthead-title").textContent = issue.title || "오늘의 해외 개발 소식";

  const feed = $("feed");
  feed.textContent = "";
  issue.items
    .slice()
    .sort((a, b) => (SOURCE_ORDER[a.source] ?? 9) - (SOURCE_ORDER[b.source] ?? 9) || a.rank - b.rank)
    .forEach((item) => feed.appendChild(renderItem(item)));

  document.title = `${dateText} — 3분 데브`;
  applyFilter(state.filter);
}

function applyFilter(filter) {
  state.filter = filter;
  document.querySelectorAll(".filter").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.filter === filter));
  });
  document.querySelectorAll(".item").forEach((node) => {
    node.hidden = !(filter === "all" || node.dataset.source === filter);
  });
}

function renderArchive(index) {
  const box = $("archive");
  const others = index.issues.slice(1);
  box.textContent = "";
  box.hidden = !others.length;
  others.slice(0, 5).forEach((entry) => {
    const a = el("a", null, formatDate(entry.date, entry.weekday));
    a.href = `?issue=${entry.date}`;
    box.appendChild(a);
  });
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const wanted = params.get("issue");

  try {
    const indexRes = await fetch("data/index.json", { cache: "no-store" });
    if (!indexRes.ok) throw new Error(`index ${indexRes.status}`);
    const index = await indexRes.json();
    state.issues = index.issues;
    renderArchive(index);

    const entry =
      (wanted && index.issues.find((i) => i.date === wanted)) || index.issues[0];
    if (!entry) throw new Error("발행된 호가 없습니다");

    const issueRes = await fetch(entry.path, { cache: "no-store" });
    if (!issueRes.ok) throw new Error(`issue ${issueRes.status}`);
    renderIssue(await issueRes.json());
  } catch (err) {
    $("feed").innerHTML =
      '<p class="fallback">피드를 불러오지 못했습니다. (python3 -m http.server 로 열어 확인)</p>';
    console.error(err);
  }
}

document.querySelectorAll(".filter").forEach((btn) => {
  btn.addEventListener("click", () => applyFilter(btn.dataset.filter));
});

boot();
