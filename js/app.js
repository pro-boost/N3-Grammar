// ============================================================
// GLOBAL STATE & DATA
// ============================================================
let GRAMMAR = [];
let GRAMMAR_DETAIL = {};
let WEEK_TITLES = {};
let DAY_NAMES = [];
let EXAM_QS = [];

let PROGRESS = {
  fcKnownSet: [],
  fcUnsureSet: [],
  fcAgainSet: [],
  totalKnown: 0,
  quizBestScore: 0,
  quizBestPct: 0,
  gameBestStreak: 0,
  gameTotalAnswered: 0,
  badgesEarned: [],
  lastSaved: null,
};

const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbyRLVvOSBQp8Og-ybmZ-v1cmM_-bUtls1BYvoi36pF7atFUoDAYIP9u8IijEOZrqjX4Sw/exec";
let syncTimer = null;
let globalFilter = "all";
let filterDay = null; // {w, d}

// ============================================================
// DATA FETCHING
// ============================================================
async function initApp() {
  try {
    // Fetch grammar data
    const grammarRes = await fetch("data/grammar.json");
    const grammarData = await grammarRes.json();
    GRAMMAR = grammarData.GRAMMAR;
    GRAMMAR_DETAIL = grammarData.GRAMMAR_DETAIL;
    WEEK_TITLES = grammarData.WEEK_TITLES;
    DAY_NAMES = grammarData.DAY_NAMES;

    // Fetch exam data
    const examRes = await fetch("data/exams.json");
    EXAM_QS = await examRes.json();

    // Init progress
    if (!PROGRESS.startDate)
      PROGRESS.startDate = getLocalDateString(getStudyStart());

    // Load cloud data first, then render
    await loadProgress();
    renderSchedule();

    console.log("App initialized successfully");
  } catch (error) {
    console.error("Failed to initialize app:", error);
    showToast("Failed to load data. Please refresh.");
  }
}

// ============================================================
// TIME HELPERS
// ============================================================
function getLocalDateString(date) {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStudyStart() {
  if (PROGRESS.startDate)
    return new Date(PROGRESS.startDate.replace(/-/g, "/")); // Use / for cross-browser local date parsing
  const now = new Date();
  const dow = now.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + daysToMon);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function studyDay() {
  const start = getStudyStart();
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let day = 0,
    cur = new Date(start);
  while (cur <= now) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5) day++; // only weekdays count
    if (cur.getTime() === now.getTime()) break;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, day);
}

function studyWeek() {
  return Math.ceil(studyDay() / 5);
}
function gDayIdx(g) {
  return (g.w - 1) * 5 + g.d;
}
function isUnlocked(g) {
  return gDayIdx(g) <= studyDay();
}
function isToday(g) {
  return gDayIdx(g) === studyDay();
}
function isThisWeek(g) {
  return g.w === studyWeek();
}
function isThisMonth(g) {
  const d = gDayIdx(g);
  return d <= studyDay() + 20 && d >= Math.max(1, studyDay() - 15);
}

function applyFilter(pool) {
  switch (globalFilter) {
    case "today":
      return pool.filter((g) => isToday(g));
    case "week":
      return pool.filter((g) => isThisWeek(g));
    case "month":
      return pool.filter((g) => isThisMonth(g));
    case "reached":
      return pool.filter((g) => isUnlocked(g));
    case "srs_review":
      return pool.filter(
        (g) =>
          PROGRESS.fcUnsureSet.includes(g.g) ||
          PROGRESS.fcAgainSet.includes(g.g),
      );
    case "day":
      return pool.filter((g) => g.w === filterDay.w && g.d === filterDay.d);
    default:
      return pool;
  }
}

// ============================================================
// NAVIGATION
// ============================================================
let currentPage = "schedule";

function showPage(p, btn) {
  currentPage = p;

  // Update active page
  document
    .querySelectorAll(".page")
    .forEach((e) => e.classList.remove("active"));
  const targetPage = document.getElementById("page-" + p);
  if (targetPage) targetPage.classList.add("active");

  // Update active tab
  document
    .querySelectorAll(".mode-tab")
    .forEach((e) => e.classList.remove("active"));
  if (btn) {
    btn.classList.add("active");
  } else {
    const tab = document.getElementById("tab-" + p);
    if (tab) tab.classList.add("active");
  }

  // Show/Hide filter selector
  const filterWrap = document.getElementById("global-filter-wrap");
  if (filterWrap) {
    filterWrap.style.display = p === "schedule" ? "none" : "block";
  }

  // Update Global Hero Strip
  const heroSub = document.getElementById("hero-sub");
  const heroMain = document.getElementById("hero-main");
  const hStat1 = document.getElementById("h-stat-1");
  const hLbl1 = document.getElementById("h-lbl-1");
  const hStat2 = document.getElementById("h-stat-2");
  const hLbl2 = document.getElementById("h-lbl-2");

  const pool = applyFilter(GRAMMAR);

  if (p === "schedule") {
    heroSub.textContent = "Weekly Schedule";
    heroMain.textContent = "学習計画";
    hStat1.textContent = PROGRESS.totalKnown;
    hLbl1.textContent = "Mastered";
    const days = studyDay();
    hStat2.textContent = days;
    hLbl2.textContent = days === 1 ? "Day" : "Days";
    renderSchedule();
  } else if (p === "lessons") {
    if (globalFilter === "day") {
      heroSub.textContent = `${DAY_NAMES[filterDay.d]} — Week ${filterDay.w}`;
    } else {
      heroSub.textContent =
        globalFilter === "all"
          ? "All Lessons"
          : globalFilter.charAt(0).toUpperCase() +
            globalFilter.slice(1) +
            " Lessons";
    }
    heroMain.textContent = "学習内容";
    hStat1.textContent = pool.length;
    hLbl1.textContent = pool.length === 1 ? "Item" : "Items";
    hStat2.textContent = PROGRESS.totalKnown;
    hLbl2.textContent = "Mastered";
    renderLesson(document.getElementById("lessons-body"), pool);
  } else if (p === "flashcards") {
    heroSub.textContent = "Flashcard Deck";
    heroMain.textContent = "フラッシュカード";
    hStat1.textContent = PROGRESS.totalKnown;
    hLbl1.textContent = "Mastered";
    hStat2.textContent = pool.length;
    hLbl2.textContent = "In Deck";
    renderFC(document.getElementById("fc-body"), pool);
  } else if (p === "quiz") {
    heroSub.textContent = "Multiple Choice";
    heroMain.textContent = "クイズ";
    hStat1.textContent =
      PROGRESS.quizBestPct > 0 ? PROGRESS.quizBestPct + "%" : "—";
    hLbl1.textContent = "Accuracy";
    hStat2.textContent = pool.length;
    hLbl2.textContent = "Pool";
    renderQuiz(document.getElementById("quiz-body"), pool, GRAMMAR);
  } else if (p === "exam") {
    heroSub.textContent = "JLPT N3 Style";
    heroMain.textContent = "試験モード";
    hStat1.textContent = PROGRESS.quizBestScore || 0;
    hLbl1.textContent = "High Score";
    hStat2.textContent = pool.length;
    hLbl2.textContent = "Pool";
    renderExam(document.getElementById("exam-body"), pool);
  } else if (p === "game") {
    heroSub.textContent = "Recall Training";
    heroMain.textContent = "タイピングゲーム";
    hStat1.textContent = PROGRESS.gameBestStreak || 0;
    hLbl1.textContent = "Best";
    hStat2.textContent = PROGRESS.gameTotalAnswered || 0;
    hLbl2.textContent = "Total";
    renderGame(document.getElementById("game-body"), pool);
  }

  // Scroll to top on page change
  window.scrollTo(0, 0);
}

function setGF(f) {
  globalFilter = f;

  // Update select value if not already set (e.g. when called from code)
  const select = document.getElementById("global-filter-select");
  if (select && select.value !== f) select.value = f;

  // Refresh current page with new filter
  showPage(currentPage);
}

// ============================================================
// SCHEDULE
// ============================================================
// ============================================================
function renderSchedule() {
  const grid = document.getElementById("sched-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const today = studyDay();

  const hDay = document.getElementById("h-stat-2");
  if (hDay) hDay.textContent = today;

  const hKnow = document.getElementById("h-stat-1");
  if (hKnow) hKnow.textContent = PROGRESS.totalKnown;

  const fcKnownH = document.getElementById("fc-known-h");
  if (fcKnownH) fcKnownH.textContent = PROGRESS.totalKnown;

  for (let w = 1; w <= 10; w++) {
    const wStart = (w - 1) * 5 + 1,
      wEnd = w * 5;
    const wDone = wEnd < today,
      wCurrent = w === studyWeek(),
      wLocked = wStart > today;
    const block = document.createElement("div");
    block.className = "week-block";
    let badge = wDone
      ? '<span class="wb-status wbs-done">✓</span>'
      : wCurrent
        ? '<span class="wb-status wbs-current">Now</span>'
        : wLocked
          ? '<span class="wb-status wbs-locked">🔒</span>'
          : "";
    block.innerHTML = `<div class="wb-header"><span class="wb-num">${String(w).padStart(2, "0")}</span><span class="wb-title">${WEEK_TITLES[w] || "Review"}</span>${badge}</div><div class="day-list" id="dl-w${w}"></div>`;
    grid.appendChild(block);
    const dl = block.querySelector(".day-list");
    for (let d = 1; d <= 5; d++) {
      const pts = GRAMMAR.filter((g) => g.w === w && g.d === d);
      if (!pts.length) continue;
      const di = gDayIdx(pts[0]);
      const locked = di > today,
        isT = di === today,
        done = di < today;
      const mastered = pts.filter((g) =>
        PROGRESS.fcKnownSet.includes(g.g),
      ).length;
      const row = document.createElement("div");
      row.className =
        "day-row" +
        (locked ? " locked" : "") +
        (isT ? " today" : "") +
        (done ? " done" : "");
      row.innerHTML = `<span class="day-lbl">${DAY_NAMES[d]}</span><span class="day-pts">${pts.map((g) => g.g).join("、")}</span><span class="day-badge-icon">${locked ? "🔒" : done ? "✓" + mastered + "/" + pts.length : isT ? "▶" : ""}</span>`;
      if (!locked) row.onclick = () => openDay(w, d, pts);
      dl.appendChild(row);
    }
  }
}

function openDay(w, d, pts) {
  globalFilter = "day";
  filterDay = { w, d };

  // Hide filter wrap since we are in a specific day view
  const filterWrap = document.getElementById("global-filter-wrap");
  if (filterWrap) filterWrap.style.display = "none";

  // Show the lessons page for this day
  showPage("lessons");
}

function openLesson(grammarName) {
  const g = GRAMMAR.find((x) => x.g === grammarName);
  if (!g) return;
  openDay(g.w, g.d);
}

// ============================================================
// LESSON RENDERER
// ============================================================
function getDetail(g) {
  return (
    GRAMMAR_DETAIL[g.g] || {
      formation: g.r,
      note: null,
      examples: [
        {
          jp:
            g.ex.split(". ")[0] +
            (g.ex.split(". ")[0].endsWith("。") ? "" : "。"),
          furigana: null,
          en: g.ex.split(". ").slice(1).join(". ") || g.m,
        },
      ],
    }
  );
}

function renderLesson(container, pts) {
  if (!container) return;
  let html = "";
  pts.forEach((g, gi) => {
    const det = getDetail(g);
    const mastered = PROGRESS.fcKnownSet.includes(g.g);
    const unsure = PROGRESS.fcUnsureSet.includes(g.g);
    const statusBadge = mastered
      ? "<span style=\"font-size:10px;padding:2px 8px;border-radius:100px;background:#4caf82;color:#fff;font-family:'DM Mono',monospace;\">✓ mastered</span>"
      : unsure
        ? "<span style=\"font-size:10px;padding:2px 8px;border-radius:100px;background:var(--gold-l);color:var(--gold);font-family:'DM Mono',monospace;\">〜 review</span>"
        : "";

    html += `<div class="lesson-card">
      <div class="lesson-header">
        <div>
          <div class="lesson-glyph">${g.g}</div>
          <div class="lesson-romaji">${g.r}</div>
          <span class="lesson-tag">N3 Grammar #${gi + 1}</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
          <div class="lesson-meaning">${g.m}</div>
          ${statusBadge}
        </div>
      </div>
      <div class="lesson-formation"><strong>Formation: </strong>${det.formation}</div>
      ${det.note ? `<div class="lesson-note">${det.note}</div>` : ""}
      <div class="lesson-examples">`;

    det.examples.forEach((ex, ei) => {
      const uid = `ex-${gi}-${ei}`;
      html += `<div class="ex-block">
        <div class="ex-jp" id="${uid}-jp">${ex.jp}</div>
        ${ex.furigana ? `<div class="ex-furigana" id="${uid}-furi">${ex.furigana}</div>` : ""}
        <div class="ex-en" id="${uid}-en" style="display:none">${ex.en}</div>
        <div class="ex-toggle-row">
          ${ex.furigana ? `<button class="ex-toggle" onclick="toggleEl('${uid}-furi')">あ Furigana</button>` : ""}
          <button class="ex-toggle" onclick="toggleEl('${uid}-en')">🇬🇧 English</button>
        </div>
      </div>`;
    });

    html += `</div></div>`;
  });

  container.innerHTML =
    html ||
    '<div class="locked-overlay"><span class="locked-icon">📖</span><div class="locked-title">No lessons</div></div>';
}

window.toggleEl = function (id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === "none" ? "block" : "none";
};

// ============================================================
// FLASHCARDS / SRS
// ============================================================
function renderFC(container, pool) {
  if (!container) return;
  if (!pool || !pool.length) {
    container.innerHTML =
      '<div class="locked-overlay"><span class="locked-icon">🔒</span><div class="locked-title">No content available</div><div class="locked-sub">Change the filter or unlock more days.</div></div>';
    return;
  }
  const again = pool.filter((g) => PROGRESS.fcAgainSet.includes(g.g));
  const unsure = pool.filter(
    (g) =>
      PROGRESS.fcUnsureSet.includes(g.g) && !PROGRESS.fcAgainSet.includes(g.g),
  );
  const fresh = pool.filter(
    (g) =>
      !PROGRESS.fcKnownSet.includes(g.g) &&
      !PROGRESS.fcUnsureSet.includes(g.g) &&
      !PROGRESS.fcAgainSet.includes(g.g),
  );
  const known = pool.filter((g) => PROGRESS.fcKnownSet.includes(g.g));
  const deck = shuffle([...again, ...unsure, ...fresh, ...known]).slice(0, 20);
  let idx = 0,
    know = 0,
    unsureC = 0,
    againC = 0;
  const unsureBuf = [];

  function getCard() {
    if (unsureBuf.length && idx > 0 && idx % 5 === 0) return unsureBuf.shift();
    return idx < deck.length ? deck[idx++] : null;
  }

  function render() {
    const c = getCard();
    if (!c) {
      container.innerHTML = `<div style="text-align:center;padding:2rem">
        <div style="font-family:'Shippori Mincho',serif;font-size:26px;font-weight:700;margin-bottom:.5rem">完了！</div>
        <div style="font-size:13px;color:rgba(26,23,20,0.48);margin-bottom:1.25rem">✓ ${know} &nbsp; 〜 ${unsureC} &nbsp; ↺ ${againC}</div>
        <button class="btn-primary" id="fc-restart">Restart</button></div>`;
      container.querySelector("#fc-restart").onclick = () =>
        renderFC(container, pool);
      return;
    }
    const tag = PROGRESS.fcKnownSet.includes(c.g)
      ? "k"
      : PROGRESS.fcUnsureSet.includes(c.g)
        ? "u"
        : "";
    const total = deck.length;
    const cur = Math.min(idx, total);
    container.innerHTML = `
      <div class="prog-row">
        <span class="prog-counter">${cur}/${total}</span>
        <div class="prog-track"><div class="prog-fill" style="width:${Math.round((cur / total) * 100)}%"></div></div>
        <span class="srs-sc k">✓ ${know}</span>
        <span class="srs-sc u">〜 ${unsureC}</span>
        <span class="srs-sc a">↺ ${againC}</span>
      </div>
      <div class="card-scene" id="fc-scene" onclick="this.classList.toggle('flipped')">
        <!-- FRONT -->
        <div class="card-front-wrap">
          <div class="card-front card-side" style="min-height:180px;position:relative">
            <button class="lesson-link-icon" onclick="event.stopPropagation(); openLesson('${c.g}')" title="View full lesson">📖</button>
            <div class="card-glyph">${c.g}</div>
            <div class="card-romaji">${c.r}</div>
            <div class="card-tap">tap to reveal</div>
            ${tag ? `<span class="srs-tag ${tag}">${tag === "k" ? "mastered" : "unsure"}</span>` : ""}
          </div>
        </div>
        <!-- BACK -->
        <div class="card-back-wrap">
          <div onclick="event.stopPropagation()">
            <div style="font-size:10px;font-weight:500;color:rgba(26,23,20,0.28);letter-spacing:.1em;text-transform:uppercase;margin-bottom:.5rem">Meaning</div>
            <div style="font-family:'Shippori Mincho',serif;font-size:17px;font-weight:600;color:var(--ink);margin-bottom:.75rem;padding-bottom:.6rem;border-bottom:1px solid var(--border)">${c.m}</div>
            ${(() => {
              const det = getDetail(c);
              return det.examples
                .slice(0, 3)
                .map((ex, ei) => {
                  const furi = ex.furigana || ex.jp;
                  const eng = ex.en || "";
                  return `<div style="margin-bottom:${ei < 2 ? ".6rem" : "0"};padding-bottom:${ei < 2 ? ".6rem" : "0"};${ei < 2 ? "border-bottom:1px solid rgba(26,23,20,0.07)" : ""}">
                  <span style="font-family:'Shippori Mincho',serif;font-size:14px;line-height:2.3;color:var(--ink)">${furi}</span>
                  <span style="font-size:11px;font-style:italic;color:rgba(26,23,20,0.48);margin-left:6px">${eng}</span>
                </div>`;
                })
                .join("");
            })()}
          </div>
        </div>
      </div>
      <button class="btn-flip-fc" onclick="document.getElementById('fc-scene').classList.toggle('flipped')">Flip — show meaning & examples</button>
      <div class="srs-actions">
        <button class="btn-srs btn-again" id="srs-a">↺ Again</button>
        <button class="btn-srs btn-unsure" id="srs-u">〜 Not Sure</button>
        <button class="btn-srs btn-know" id="srs-k">✓ Know it</button>
      </div>`;

    container.querySelector("#srs-a").onclick = () => act("again");
    container.querySelector("#srs-u").onclick = () => act("unsure");
    container.querySelector("#srs-k").onclick = () => act("know");

    function act(r) {
      if (r === "know") {
        know++;
        if (!PROGRESS.fcKnownSet.includes(c.g)) {
          PROGRESS.fcKnownSet.push(c.g);
        }
        PROGRESS.fcUnsureSet = PROGRESS.fcUnsureSet.filter((k) => k !== c.g);
        PROGRESS.fcAgainSet = PROGRESS.fcAgainSet.filter((k) => k !== c.g);
      } else if (r === "unsure") {
        unsureC++;
        if (!PROGRESS.fcUnsureSet.includes(c.g)) PROGRESS.fcUnsureSet.push(c.g);
        PROGRESS.fcAgainSet = PROGRESS.fcAgainSet.filter((k) => k !== c.g);
        PROGRESS.fcKnownSet = PROGRESS.fcKnownSet.filter((k) => k !== c.g);
        unsureBuf.push(c);
      } else {
        againC++;
        if (!PROGRESS.fcAgainSet.includes(c.g)) PROGRESS.fcAgainSet.push(c.g);
        PROGRESS.fcKnownSet = PROGRESS.fcKnownSet.filter((k) => k !== c.g);
        deck.splice(Math.min(idx + 2, deck.length), 0, c);
      }
      PROGRESS.totalKnown = PROGRESS.fcKnownSet.length;
      ["h-stat-1", "fc-known-h"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = PROGRESS.totalKnown;
      });
      scheduleSave();
      render();
    }
  }
  render();
}

// ============================================================
// QUIZ
// ============================================================
function renderQuiz(container, pool, distractorPool) {
  if (!container) return;
  // Use distractorPool (full GRAMMAR) to check if we can actually build a quiz
  const actualDistractorPool = distractorPool || pool;
  if (!pool || pool.length === 0 || actualDistractorPool.length < 4) {
    container.innerHTML =
      '<div class="locked-overlay"><span class="locked-icon">📚</span><div class="locked-title">Not enough content</div><div class="locked-sub">Need at least 4 grammar points in total to generate distractors.</div></div>';
    return;
  }
  let score = 0,
    wrong = 0,
    qi = 0,
    answered = false;
  const set = shuffle([...pool]).slice(0, 10);

  function updateScore() {
    const t = score + wrong;
    container.querySelector("#qs").textContent = score;
    container.querySelector("#qw").textContent = wrong;
    const pct = t > 0 ? Math.round((score / t) * 100) : 0;
    container.querySelector("#qp").textContent = t > 0 ? pct + "%" : "—";
    if (pct > (PROGRESS.quizBestPct || 0)) {
      PROGRESS.quizBestPct = pct;
      const el = document.getElementById("qh-pct");
      if (el) el.textContent = pct + "%";
    }
  }

  function showQ() {
    const q = set[qi];
    answered = false;
    const type = Math.random() < 0.5 ? "meaning" : "usage";
    // Pull distractors from the distractorPool (full list) so we always have enough options
    const wrongs = shuffle(
      actualDistractorPool.filter((g) => g.g !== q.g),
    ).slice(0, 3);
    const opts = shuffle([q, ...wrongs]);
    container.innerHTML = `
      <div class="quiz-scorebar">
        <div class="qsc"><span class="qsc-num" id="qs" style="color:var(--green)">${score}</span><span class="qsc-lbl">correct</span></div>
        <div class="qsc"><span class="qsc-num" id="qw" style="color:var(--red)">${wrong}</span><span class="qsc-lbl">wrong</span></div>
        <div class="qsc"><span class="qsc-num" id="qp">${score + wrong > 0 ? Math.round((score / (score + wrong)) * 100) + "%" : "—"}</span><span class="qsc-lbl">accuracy</span></div>
      </div>
      <div class="quiz-num">Question ${qi + 1} of ${set.length}</div>
      <div class="quiz-q-text">${type === "meaning" ? "What does this grammar mean?" : "Which grammar fits this meaning?"}</div>
      <div class="quiz-q-sub">${type === "meaning" ? q.g + "　(" + q.r + ")" : q.m}</div>
      <div class="quiz-opts">${opts.map((o) => `<button class="quiz-opt" data-k="${o.g}">${type === "meaning" ? o.m : o.g + "　(" + o.r + ")"}</button>`).join("")}</div>
      <div class="quiz-fb" id="qfb"></div>
      <button class="btn-next" id="qnext">Next →</button>`;
    container.querySelectorAll(".quiz-opt").forEach((btn) => {
      btn.onclick = () => {
        if (answered) return;
        answered = true;
        const correct = btn.dataset.k === q.g;
        container.querySelectorAll(".quiz-opt").forEach((b) => {
          b.disabled = true;
          if (b.dataset.k === q.g) b.classList.add("correct");
        });
        if (!correct) {
          btn.classList.add("wrong");
          wrong++;
        } else score++;
        updateScore();
        scheduleSave();
        const fb = container.querySelector("#qfb");
        fb.className = "quiz-fb " + (correct ? "good" : "bad");
        fb.innerHTML =
          (correct
            ? "<strong>✓ Correct!</strong> "
            : "<strong>✗ Incorrect.</strong> ") +
          "<span style=\"font-family:'Shippori Mincho',serif\">" +
          q.g +
          "</span> (" +
          q.r +
          ") = " +
          q.m +
          '<div style="margin-top:6px;font-size:12px;font-style:italic;color:inherit;opacity:.8">🇯🇵 ' +
          q.ex.split(". ")[0] +
          "。 &nbsp; 🇬🇧 " +
          q.ex.split(". ").slice(1).join(". ") +
          "</div>";
        fb.style.display = "block";
        container.querySelector("#qnext").style.display = "block";
      };
    });
    container.querySelector("#qnext").onclick = () => {
      qi++;
      if (qi >= set.length) {
        const pct =
          score + wrong > 0 ? Math.round((score / (score + wrong)) * 100) : 0;
        container.innerHTML = `<div style="text-align:center;padding:2rem">
          <div style="font-family:'Shippori Mincho',serif;font-size:26px;font-weight:700;margin-bottom:.4rem">完了！</div>
          <div style="font-size:16px;font-weight:500;margin-bottom:.4rem">${score}/${set.length} — ${pct}%</div>
          <div style="font-size:12px;color:rgba(26,23,20,0.48);margin-bottom:1.25rem">${pct >= 80 ? "🎌 Excellent!" : pct >= 60 ? "👍 Good — keep going." : "📚 Review weak points."}</div>
          <button class="btn-primary" id="qrestart">Try again ↺</button></div>`;
        container.querySelector("#qrestart").onclick = () =>
          renderQuiz(container, pool, actualDistractorPool);
      } else showQ();
    };
  }
  showQ();
}

// ============================================================
// EXAM MODE
// ============================================================
function renderExam(container, pool) {
  if (!container) return;
  let score = 0,
    total = 0,
    qi = 0;
  const qs = shuffle([...EXAM_QS]).slice(0, 8);

  function furiganaBtn(id) {
    return `<button onclick="toggleFurigana('${id}')" style="font-size:11px;padding:3px 9px;border:1px solid var(--border-s);border-radius:100px;background:transparent;cursor:pointer;font-family:'DM Sans',sans-serif;color:rgba(26,23,20,0.5);margin-left:6px">あ furigana</button>`;
  }
  function translationBtn(id) {
    return `<button onclick="toggleTranslation('${id}')" style="font-size:11px;padding:3px 9px;border:1px solid var(--border-s);border-radius:100px;background:transparent;cursor:pointer;font-family:'DM Sans',sans-serif;color:rgba(26,23,20,0.5);margin-left:4px">EN</button>`;
  }

  function showQ() {
    const q = qs[qi];
    if (!q) return;
    const typeLabel = {
      fill: "Fill in the blank",
      compose: "Sentence composition",
      text: "Text grammar",
      error: "Error identification",
    }[q.type];
    let html = `<div class="exam-type-bar">
      <span class="exam-pill">${typeLabel}</span>
      ${furiganaBtn("ex-furigana")}${translationBtn("ex-translation")}
    </div>
    <div class="quiz-scorebar">
      <div class="qsc"><span class="qsc-num" style="color:var(--green)">${score}</span><span class="qsc-lbl">correct</span></div>
      <div class="qsc"><span class="qsc-num">${qi + 1}/${qs.length}</span><span class="qsc-lbl">question</span></div>
      <div class="qsc"><span class="qsc-num">${total > 0 ? Math.round((score / total) * 100) + "%" : "—"}</span><span class="qsc-lbl">accuracy</span></div>
    </div>`;

    if (q.furigana) {
      html += `<div id="ex-furigana" style="display:none;font-family:'Shippori Mincho',serif;font-size:13px;background:var(--blue-l);border-radius:7px;padding:.65rem 1rem;margin-bottom:.75rem;line-height:2.2">${q.furigana}</div>`;
    }
    if (q.translation) {
      html += `<div id="ex-translation" style="display:none;font-size:12px;font-style:italic;color:rgba(26,23,20,0.55);background:var(--gold-l);border-radius:7px;padding:.6rem 1rem;margin-bottom:.75rem;line-height:1.6">${q.translation}</div>`;
    }

    if (q.type === "fill") {
      html += `<div class="quiz-q-text" style="margin-bottom:1rem;font-size:20px">${q.q.replace("___", '<span style="color:var(--red);font-weight:700;border-bottom:2px solid var(--red)">　　　</span>')}</div>
        <div class="quiz-opts">${q.opts.map((o) => `<button class="quiz-opt" data-a="${o}">${o}</button>`).join("")}</div>`;
    } else if (q.type === "compose") {
      html += `<div class="quiz-q-text" style="margin-bottom:.4rem">Arrange the parts in the correct order:</div>
        <div style="font-family:'Shippori Mincho',serif;font-size:17px;margin-bottom:.75rem;color:rgba(26,23,20,0.6)">${q.q}</div>
        <div id="ex-slots" class="sentence-slots"></div>
        <div id="ex-parts" class="sentence-parts">${shuffle([...q.parts])
          .map((p) => `<button class="part-chip" data-p="${p}">${p}</button>`)
          .join("")}</div>
        <div style="display:flex;gap:8px;margin-top:.6rem">
          <button class="btn-primary" id="ex-check" style="flex:1">Check</button>
          <button id="ex-clear" style="padding:10px 14px;border:1px solid var(--border-s);border-radius:7px;background:transparent;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif">Clear</button>
        </div>`;
    } else if (q.type === "text") {
      const parts = q.passage.split("___");
      let passageHtml =
        parts[0] +
        '<span style="color:var(--red);font-weight:700;border-bottom:2px solid var(--red)">（①）</span>';
      if (parts[1])
        passageHtml += parts[1].replace(
          "___",
          '<span style="color:var(--red);font-weight:700;border-bottom:2px solid var(--red)">（②）</span>',
        );
      html += `<div class="passage-box">${passageHtml}</div>
        <div class="quiz-q-text" style="margin-bottom:.5rem;font-size:14px">${q.q}</div>
        <div style="font-size:12px;color:rgba(26,23,20,0.45);margin-bottom:.75rem">Select the answer for ①:</div>
        <div class="quiz-opts" id="opts1">${q.opts1.map((o) => `<button class="quiz-opt" data-a="${o}">${o}</button>`).join("")}</div>`;
    } else if (q.type === "error") {
      html += `<div class="quiz-q-text" style="margin-bottom:.75rem">${q.q}</div>
        <div class="quiz-opts" style="grid-template-columns:1fr">${q.opts.map((o, i) => `<button class="quiz-opt" data-i="${i}">${o}</button>`).join("")}</div>`;
    }

    html += `<div class="quiz-fb" id="ex-fb" style="display:none"></div>
      <div id="ex-answer-box" style="display:none;margin-bottom:.9rem;padding:.9rem 1.1rem;border-radius:8px;border:1px solid var(--border-s);background:var(--paper2)"></div>
      <div style="display:flex;gap:8px">
        <button class="btn-next" id="ex-next" style="flex:1">Next →</button>
      </div>`;

    container.innerHTML = html;

    function showFb(ok, correctAns, explanation) {
      const fb = container.querySelector("#ex-fb");
      fb.className = "quiz-fb " + (ok ? "good" : "bad");
      fb.innerHTML =
        (ok
          ? "<strong>✓ Correct!</strong> "
          : "<strong>✗ Incorrect.</strong> ") + (ok ? "Well done." : "");
      fb.style.display = "block";

      const ab = container.querySelector("#ex-answer-box");
      let abHtml = "";
      if (!ok)
        abHtml += `<div style="font-size:13px;font-weight:500;margin-bottom:.5rem;color:var(--green)">✓ Correct answer: <span style="font-family:'Shippori Mincho',serif;font-size:16px">${correctAns}</span></div>`;
      if (q.furigana)
        abHtml += `<div style="font-family:'Shippori Mincho',serif;font-size:14px;line-height:2.2;margin-bottom:.4rem">${q.furigana}</div>`;
      if (q.translation)
        abHtml += `<div style="font-size:12px;font-style:italic;color:rgba(26,23,20,0.6);margin-bottom:.5rem">🇬🇧 ${q.translation}</div>`;
      if (explanation)
        abHtml += `<div style="font-size:12px;color:rgba(26,23,20,0.55);border-top:1px solid var(--border);padding-top:.5rem;margin-top:.5rem;line-height:1.6">💡 ${explanation}</div>`;
      ab.innerHTML = abHtml;
      ab.style.display = "block";

      container.querySelector("#ex-next").style.display = "block";
      const examH = document.getElementById("exam-h");
      if (examH) examH.textContent = score;
    }

    if (q.type === "fill") {
      container.querySelectorAll(".quiz-opt").forEach((btn) => {
        btn.onclick = () => {
          container.querySelectorAll(".quiz-opt").forEach((b) => {
            b.disabled = true;
            if (b.dataset.a === q.blank) b.classList.add("correct");
          });
          const ok = btn.dataset.a === q.blank;
          if (!ok) btn.classList.add("wrong");
          if (ok) score++;
          total++;
          const correctSentence = q.q.replace("___", q.blank);
          showFb(ok, q.blank + " → " + correctSentence, q.hint);
          scheduleSave();
        };
      });
    } else if (q.type === "compose") {
      const slots = container.querySelector("#ex-slots");
      const selected = [];
      container.querySelectorAll(".part-chip").forEach((chip) => {
        chip.onclick = () => {
          if (chip.classList.contains("used")) return;
          selected.push(chip.dataset.p);
          const s = document.createElement("span");
          s.className = "slot-chip";
          s.textContent = chip.dataset.p;
          s.onclick = () => {
            const idx = selected.indexOf(chip.dataset.p);
            if (idx > -1) selected.splice(idx, 1);
            s.remove();
            chip.classList.remove("used");
          };
          slots.appendChild(s);
          chip.classList.add("used");
        };
      });
      container.querySelector("#ex-clear").onclick = () => {
        selected.length = 0;
        slots.innerHTML = "";
        container
          .querySelectorAll(".part-chip")
          .forEach((c) => c.classList.remove("used"));
      };
      container.querySelector("#ex-check").onclick = () => {
        const ans = selected.join("");
        const ok = ans === q.answer;
        if (ok) score++;
        total++;
        container
          .querySelectorAll(".part-chip,#ex-check,#ex-clear")
          .forEach((b) => (b.disabled = true));
        const correctDisplay = q.correct_order
          ? q.correct_order.join(" → ")
          : q.answer;
        showFb(ok, correctDisplay, q.hint);
        scheduleSave();
      };
    } else if (q.type === "text") {
      container.querySelectorAll("#opts1 .quiz-opt").forEach((btn) => {
        btn.onclick = () => {
          container.querySelectorAll("#opts1 .quiz-opt").forEach((b) => {
            b.disabled = true;
            if (b.dataset.a === q.blanks[0]) b.classList.add("correct");
          });
          const ok = btn.dataset.a === q.blanks[0];
          if (!ok) btn.classList.add("wrong");
          if (ok) score++;
          total++;
          const correctAns = `① ${q.blanks[0]}、② ${q.blanks[1]}`;
          showFb(ok, correctAns, q.hint);
          scheduleSave();
        };
      });
    } else if (q.type === "error") {
      container.querySelectorAll(".quiz-opt").forEach((btn, i) => {
        btn.onclick = () => {
          container.querySelectorAll(".quiz-opt").forEach((b, j) => {
            b.disabled = true;
            if (j === q.wrong) b.classList.add("correct");
          });
          const ok = i === q.wrong;
          if (!ok) btn.classList.add("wrong");
          if (ok) score++;
          total++;
          const correctSentence = q.opts[q.wrong];
          const translationNote = q.translations ? q.translations[q.wrong] : "";
          showFb(
            ok,
            correctSentence +
              (translationNote ? " (" + translationNote + ")" : ""),
            q.hint,
          );
          scheduleSave();
        };
      });
    }

    container.querySelector("#ex-next").onclick = () => {
      qi++;
      if (qi >= qs.length) {
        const pct = total > 0 ? Math.round((score / total) * 100) : 0;
        container.innerHTML = `<div style="text-align:center;padding:2.5rem 1rem">
          <div style="font-family:'Shippori Mincho',serif;font-size:30px;font-weight:700;margin-bottom:.4rem">試験完了</div>
          <div style="font-size:18px;font-weight:500;margin-bottom:.4rem">${score}/${qs.length} — ${pct}%</div>
          <div style="font-size:13px;color:rgba(26,23,20,0.48);margin-bottom:1.25rem">${pct >= 80 ? "🎌 JLPT-ready!" : pct >= 60 ? "👍 Solid progress." : "📚 Keep reviewing."}</div>
          <button class="btn-primary" id="ex-restart">Try again</button></div>`;
        container.querySelector("#ex-restart").onclick = () =>
          renderExam(container, pool);
      } else showQ();
    };
  }
  showQ();
}

window.toggleFurigana = function (id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === "none" ? "block" : "none";
};
window.toggleTranslation = function (id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === "none" ? "block" : "none";
};

// ============================================================
// GAME
// ============================================================
function renderGame(container, pool) {
  if (!container) return;
  if (!pool || !pool.length) {
    container.innerHTML =
      '<div class="locked-overlay"><span class="locked-icon">🔒</span><div class="locked-title">No content</div><div class="locked-sub">Change filter to see content.</div></div>';
    return;
  }
  let streak = 0,
    best = PROGRESS.gameBestStreak || 0,
    gtotal = 0,
    current = null,
    revealed = false;

  function next() {
    revealed = false;
    current = shuffle([...pool])[0];
    current._t = Math.random() < 0.5 ? "mtg" : "gtm";
    const pt = current._t === "mtg" ? current.m : current.g;
    const sub =
      current._t === "mtg" ? "TYPE THE GRAMMAR FORM" : "TYPE THE MEANING";
    const hint =
      current._t === "mtg"
        ? "Japanese or romaji accepted"
        : "Key word(s) in English";
    container.innerHTML = `
      <div class="game-header">
        <div><div class="streak-display" id="g-str">🔥 ${streak}</div><span class="streak-lbl">streak</span></div>
        <div style="text-align:right"><div class="streak-display">${gtotal}</div><span class="streak-lbl">answered</span></div>
      </div>
      <div class="game-prompt" style="position:relative">
        <button class="lesson-link-icon" onclick="openLesson('${current.g}')" title="View full lesson">📖</button>
        <div class="game-prompt-text">${pt}</div>
        <div class="game-prompt-sub">${sub}</div>
      </div>
      <div class="game-hint">${hint}</div>
      <div class="game-input-row">
        <input type="text" class="game-input" id="g-inp" placeholder="type your answer…"/>
        <button class="btn-check" id="g-chk">Check</button>
      </div>
      <div class="game-result" id="g-res"></div>
      <button class="btn-next" id="g-nx" style="margin-bottom:1rem">Next →</button>
      <div style="font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:rgba(26,23,20,0.32);margin-bottom:6px">Badges</div>
      <div class="badges-row">
        <span class="badge ${PROGRESS.badgesEarned.includes("b5") ? "earned" : ""}" id="gb5">🏅 5 streak</span>
        <span class="badge ${PROGRESS.badgesEarned.includes("b10") ? "earned" : ""}" id="gb10">🥈 10 streak</span>
        <span class="badge ${PROGRESS.badgesEarned.includes("b20") ? "earned" : ""}" id="gb20">🥇 20 streak</span>
        <span class="badge ${PROGRESS.badgesEarned.includes("b50") ? "earned" : ""}" id="gb50">⭐ 50 answered</span>
      </div>`;

    const inp = container.querySelector("#g-inp");
    inp.focus();
    inp.onkeydown = (e) => {
      if (e.key === "Enter") check();
    };
    container.querySelector("#g-chk").onclick = check;
    container.querySelector("#g-nx").onclick = next;

    function check() {
      if (revealed) {
        next();
        return;
      }
      const val = inp.value.trim().toLowerCase();
      if (!val) return;
      gtotal++;
      let ok = false;
      if (current._t === "mtg") {
        ok =
          val === current.g ||
          val === current.r ||
          (current.r.includes(val) && val.length > 3);
      } else {
        const words = current.m
          .toLowerCase()
          .replace(/[~;()]/g, "")
          .split(/[\s\/,\-]+/);
        ok =
          words.some((w) => w.length > 2 && val.includes(w)) ||
          val.includes(current.m.toLowerCase().slice(0, 6));
      }
      if (ok) {
        streak++;
        if (streak > best) {
          best = streak;
          PROGRESS.gameBestStreak = best;
          document.getElementById("gh-streak").textContent = best;
        }
      } else streak = 0;
      PROGRESS.gameTotalAnswered = (PROGRESS.gameTotalAnswered || 0) + 1;
      ["b5", "b10", "b20", "b50"].forEach((id) => {
        const thr = { b5: 5, b10: 10, b20: 20, b50: 50 }[id];
        if (
          (id === "b50" ? gtotal : streak) >= thr &&
          !PROGRESS.badgesEarned.includes(id)
        ) {
          PROGRESS.badgesEarned.push(id);
          const el = container.querySelector("#g" + id);
          if (el) el.classList.add("earned");
          showToast("🏅 Badge: " + id);
        }
      });
      scheduleSave();
      const res = container.querySelector("#g-res");
      res.style.display = "block";
      res.className = "game-result " + (ok ? "good" : "bad");
      res.textContent = ok
        ? "✓ Correct!"
        : "✗ " + current.g + " (" + current.r + ") = " + current.m;
      container.querySelector("#g-str").textContent = "🔥 " + streak;
      container.querySelector("#g-nx").style.display = "block";
      revealed = true;
    }
  }
  next();
}

// ============================================================
// SYNC
// ============================================================
function setSyncStatus(s, l) {
  const syncDot = document.getElementById("sync-dot");
  if (syncDot) syncDot.className = "sync-dot " + s;
  const syncLabel = document.getElementById("sync-label");
  if (syncLabel) syncLabel.textContent = l;
}
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = "_gs_" + Date.now();
    const s = document.createElement("script");
    const to = setTimeout(() => {
      delete window[cb];
      s.remove();
      reject(new Error("timeout"));
    }, 8000);
    window[cb] = (data) => {
      clearTimeout(to);
      delete window[cb];
      s.remove();
      resolve(data);
    };
    s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
    s.onerror = () => {
      clearTimeout(to);
      delete window[cb];
      s.remove();
      reject();
    };
    document.head.appendChild(s);
  });
}
async function loadProgress() {
  setSyncStatus("syncing", "loading…");
  try {
    const data = await jsonp(SHEET_URL + "?action=load");
    if (data && data.totalKnown !== undefined) {
      PROGRESS = { ...PROGRESS, ...data };
      if (!PROGRESS.startDate) {
        PROGRESS.startDate = getLocalDateString(getStudyStart());
      }
      setSyncStatus("ok", "synced");
      ["h-stat-1", "fc-known-h"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = PROGRESS.totalKnown;
      });
      const ghStreak = document.getElementById("gh-streak");
      if (ghStreak) ghStreak.textContent = PROGRESS.gameBestStreak || 0;
      if (PROGRESS.quizBestPct > 0) {
        const el = document.getElementById("qh-pct");
        if (el) el.textContent = PROGRESS.quizBestPct + "%";
      }
      if (document.getElementById("page-schedule").classList.contains("active"))
        renderSchedule();
      showToast("✓ Progress loaded");
    } else setSyncStatus("ok", "new save");
  } catch (e) {
    setSyncStatus("error", "offline");
  }
}
async function saveProgress() {
  setSyncStatus("syncing", "saving…");
  PROGRESS.lastSaved = new Date().toISOString();
  try {
    await jsonp(
      SHEET_URL +
        "?action=save&data=" +
        encodeURIComponent(JSON.stringify(PROGRESS)),
    );
    setSyncStatus(
      "ok",
      "saved " +
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
    );
  } catch (e) {
    setSyncStatus("error", "save failed");
  }
}
function scheduleSave() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(saveProgress, 1200);
}

// ============================================================
// UTILS
// ============================================================
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", initApp);
