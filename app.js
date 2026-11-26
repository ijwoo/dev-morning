/* 3분 데브 — data/*.json 을 읽어 정적으로 그린다. 빌드 없음. */

const SOURCE_ORDER = { hn: 0, github: 1 };
const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const state = {
  issues: [], // 최신 호가 앞
  byDate: new Map(),
  issue: null,
  filter: "all",
  calMonth: null, // { year, month }
  cache: new Map(),
  token: 0,
};

const $ = (id) => document.getElementById(id);

/* ── 날짜 도우미 ─────────────────────────── */

function formatDate(iso, weekday) {
  const [y, m, d] = iso.split("-").map(Number);
  const base = `${y}. ${String(m).padStart(2, "0")}. ${String(d).padStart(2, "0")}`;
  return weekday ? `${base} ${weekday}` : base;
}

function parts(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function isoOf(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthKey(year, month) {
  return year * 100 + month;
}

/* ── 렌더 도우미 ─────────────────────────── */

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
  updateStep();
  if (!calendarEl().hidden) renderCalendar();

  feed.classList.remove("enter");
  void feed.offsetWidth;
  feed.classList.add("enter");
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

/* ── 하단 지난 호 ────────────────────────── */

function renderArchive() {
  const box = $("archive");
  const others = state.issues.slice(1);
  box.textContent = "";
  box.hidden = !others.length;

  others.slice(0, 4).forEach((entry) => {
    const a = el("a", null, formatDate(entry.date, entry.weekday));
    a.href = urlFor(entry.date);
    a.dataset.date = entry.date;
    box.appendChild(a);
  });

  if (others.length > 4) {
    const all = el("button", "archive-all", `전체 ${state.issues.length}호`);
    all.type = "button";
    all.id = "archive-all";
    box.appendChild(all);
  }
}

/* ── 이전 · 다음 호 ──────────────────────── */

function updateStep() {
  const i = state.issues.findIndex((x) => x.date === (state.issue && state.issue.date));
  const older = i >= 0 ? state.issues[i + 1] : null;
  const newer = i >= 0 ? state.issues[i - 1] : null;

  const prev = $("prev-issue");
  const next = $("next-issue");

  prev.disabled = !older;
  next.disabled = !newer;
  prev.dataset.date = older ? older.date : "";
  next.dataset.date = newer ? newer.date : "";

  prev.title = older ? `이전 호 · ${formatDate(older.date, older.weekday)}` : "";
  next.title = newer ? `다음 호 · ${formatDate(newer.date, newer.weekday)}` : "";
  prev.setAttribute("aria-label", older ? `이전 호 ${formatDate(older.date)}` : "이전 호 없음");
  next.setAttribute("aria-label", newer ? `다음 호 ${formatDate(newer.date)}` : "다음 호 없음");
}

/* ── 달력 ───────────────────────────────── */

function calendarEl() {
  return $("calendar");
}

function renderCalendar() {
  const { year, month } = state.calMonth;
  $("cal-label").textContent = `${year}년 ${month}월`;

  const oldest = parts(state.issues[state.issues.length - 1].date);
  const newest = parts(state.issues[0].date);
  const current = monthKey(year, month);
  $("cal-prev").disabled = current <= monthKey(oldest.year, oldest.month);
  $("cal-next").disabled = current >= monthKey(newest.year, newest.month);

  const grid = $("cal-grid");
  grid.textContent = "";

  const startDow = new Date(year, month - 1, 1).getDay();
  const lastDay = new Date(year, month, 0).getDate();

  for (let i = 0; i < startDow; i += 1) {
    grid.appendChild(el("span", "cal-blank"));
  }

  for (let day = 1; day <= lastDay; day += 1) {
    const date = isoOf(year, month, day);
    const entry = state.byDate.get(date);
    const btn = el("button", "cal-day", String(day));
    btn.type = "button";

    if (entry) {
      btn.classList.add("is-available");
      btn.dataset.date = date;
      btn.setAttribute("aria-label", `${formatDate(date, entry.weekday)} 발행`);
      if (state.issue && state.issue.date === date) btn.setAttribute("aria-current", "date");
    } else {
      btn.disabled = true;
      btn.tabIndex = -1;
      btn.setAttribute("aria-label", `${month}월 ${day}일 발행 없음`);
    }
    grid.appendChild(btn);
  }
}

function openCalendar() {
  const panel = calendarEl();
  if (!panel.hidden) return;
  const base = parts(state.issue ? state.issue.date : state.issues[0].date);
  state.calMonth = { year: base.year, month: base.month };
  renderCalendar();
  panel.hidden = false;
  $("date-btn").setAttribute("aria-expanded", "true");

  const target =
    panel.querySelector('[aria-current="date"]') ||
    panel.querySelector(".cal-day.is-available") ||
    $("cal-prev");
  target.focus({ preventScroll: true });
}

function closeCalendar({ focus = true } = {}) {
  const panel = calendarEl();
  if (panel.hidden) return;
  panel.hidden = true;
  $("date-btn").setAttribute("aria-expanded", "false");
  if (focus) $("date-btn").focus({ preventScroll: true });
}

function shiftMonth(delta) {
  let { year, month } = state.calMonth;
  month += delta;
  if (month < 1) {
    month = 12;
    year -= 1;
  } else if (month > 12) {
    month = 1;
    year += 1;
  }
  state.calMonth = { year, month };
  renderCalendar();
}

/* ── 호 불러오기 · 이동 ──────────────────── */

function urlFor(date) {
  const newest = state.issues[0] && state.issues[0].date;
  return date === newest ? location.pathname : `${location.pathname}?issue=${date}`;
}

function dateFromUrl() {
  const wanted = new URLSearchParams(location.search).get("issue");
  return wanted && state.byDate.has(wanted) ? wanted : null;
}

async function fetchIssue(entry) {
  if (state.cache.has(entry.date)) return state.cache.get(entry.date);
  const res = await fetch(entry.path, { cache: "no-store" });
  if (!res.ok) throw new Error(`issue ${res.status}`);
  const data = await res.json();
  state.cache.set(entry.date, data);
  return data;
}

function prefetchNeighbors() {
  const i = state.issues.findIndex((x) => x.date === state.issue.date);
  [state.issues[i - 1], state.issues[i + 1]].forEach((entry) => {
    if (entry && !state.cache.has(entry.date)) fetchIssue(entry).catch(() => {});
  });
}

function scrollToTopIfNeeded() {
  const masthead = document.querySelector(".masthead");
  if (masthead && masthead.getBoundingClientRect().top < -8) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }
}

async function showIssue(date, { push = false, replace = false } = {}) {
  const entry = state.byDate.get(date);
  if (!entry) return false;

  closeCalendar({ focus: false });
  const token = (state.token += 1);

  let issue;
  try {
    issue = await fetchIssue(entry);
  } catch (err) {
    console.error(err);
    $("feed").innerHTML =
      '<p class="fallback">호를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>';
    return false;
  }
  if (token !== state.token) return false;

  renderIssue(issue);

  const url = urlFor(date);
  const here = location.pathname + location.search;
  if (push && url !== here) history.pushState({ date }, "", url);
  else if (replace && url !== here) history.replaceState({ date }, "", url);

  if (push) scrollToTopIfNeeded();
  prefetchNeighbors();
  return true;
}

/* ── 이벤트 ─────────────────────────────── */

$("prev-issue").addEventListener("click", () => {
  const date = $("prev-issue").dataset.date;
  if (date) showIssue(date, { push: true });
});

$("next-issue").addEventListener("click", () => {
  const date = $("next-issue").dataset.date;
  if (date) showIssue(date, { push: true });
});

$("date-btn").addEventListener("click", () => {
  if (calendarEl().hidden) openCalendar();
  else closeCalendar();
});

$("cal-prev").addEventListener("click", () => shiftMonth(-1));
$("cal-next").addEventListener("click", () => shiftMonth(1));

$("cal-grid").addEventListener("click", (event) => {
  const btn = event.target.closest(".cal-day.is-available");
  if (!btn) return;
  showIssue(btn.dataset.date, { push: true });
});

document.addEventListener("pointerdown", (event) => {
  if (calendarEl().hidden) return;
  if (calendarEl().contains(event.target) || $("date-btn").contains(event.target)) return;
  closeCalendar({ focus: false });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !calendarEl().hidden) {
    event.preventDefault();
    closeCalendar();
  }
});

document.querySelectorAll(".filter").forEach((btn) => {
  btn.addEventListener("click", () => applyFilter(btn.dataset.filter));
});

$("archive").addEventListener("click", (event) => {
  const all = event.target.closest(".archive-all");
  if (all) {
    document.querySelector(".masthead").scrollIntoView({ block: "start", behavior: "smooth" });
    openCalendar();
    return;
  }

  const link = event.target.closest("a[data-date]");
  if (!link) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  showIssue(link.dataset.date, { push: true });
});

window.addEventListener("popstate", () => {
  const date = dateFromUrl() || (state.issues[0] && state.issues[0].date);
  if (!date || (state.issue && state.issue.date === date)) return;
  showIssue(date, {});
});

/* ── 시작 ───────────────────────────────── */

async function boot() {
  try {
    const indexRes = await fetch("data/index.json", { cache: "no-store" });
    if (!indexRes.ok) throw new Error(`index ${indexRes.status}`);
    const index = await indexRes.json();

    state.issues = index.issues;
    state.byDate = new Map(index.issues.map((entry) => [entry.date, entry]));
    renderArchive();

    const raw = new URLSearchParams(location.search).get("issue");
    const wanted = raw && state.byDate.has(raw) ? raw : null;
    const entry = (wanted && state.byDate.get(wanted)) || state.issues[0];
    if (!entry) throw new Error("발행된 호가 없습니다");

    const issue = await fetchIssue(entry);
    renderIssue(issue);

    if (raw && raw !== entry.date) {
      history.replaceState({ date: entry.date }, "", urlFor(entry.date));
    }
    prefetchNeighbors();
  } catch (err) {
    $("feed").innerHTML =
      '<p class="fallback">피드를 불러오지 못했습니다. (python3 -m http.server 로 열어 확인)</p>';
    $("prev-issue").disabled = true;
    $("next-issue").disabled = true;
    console.error(err);
  }
}

boot();
