// ---------- 서버 API 호출 ----------
async function apiGet(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("API GET 실패:", path, e);
    return [];
  }
}

async function apiPost(path, body) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return true;
  } catch (e) {
    console.error("API POST 실패:", path, e);
    return false;
  }
}

async function fetchScores(difficulty) {
  return apiGet(`/api/scores?difficulty=${encodeURIComponent(difficulty)}`);
}
async function saveScore(entry) {
  return apiPost("/api/scores", entry);
}
async function fetchReviews() {
  return apiGet("/api/reviews");
}
async function saveReview(entry) {
  return apiPost("/api/reviews", entry);
}

// ---------- 앱 상태 ----------
let selectedDifficulty = "easy";
let playerName = "";
let game = null;
let timerInterval = null;
let currentRating = 0;
let reviewSubmitted = false;
let scoreSaved = false;

// ---------- 화면 전환 ----------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2000);
}

// ---------- 시작 화면 ----------
document.querySelectorAll(".diff-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedDifficulty = btn.dataset.diff;
  });
});

document.getElementById("start-btn").addEventListener("click", () => {
  const name = document.getElementById("player-name").value.trim();
  if (!name) { toast("이름을 입력해주세요"); return; }
  playerName = name;
  document.getElementById("current-player").textContent = playerName;
  startGame();
});

document.getElementById("view-ranking-btn").addEventListener("click", () => {
  renderRanking("easy");
  showScreen("ranking-screen");
});

document.getElementById("view-reviews-btn").addEventListener("click", () => {
  renderReviews();
  showScreen("reviews-screen");
});

document.querySelectorAll(".back-to-menu").forEach(btn => {
  btn.addEventListener("click", () => showScreen("start-screen"));
});

document.getElementById("back-btn").addEventListener("click", () => {
  stopTimer();
  showScreen("start-screen");
});

// ---------- 게임 시작 ----------
function startGame() {
  reviewSubmitted = false;
  scoreSaved = false;
  currentRating = 0;
  updateRatingStars();
  document.getElementById("review-text").value = "";
  document.getElementById("result-modal").classList.add("hidden");
  document.getElementById("save-score-box").classList.add("hidden");

  game = new Minesweeper(selectedDifficulty, renderBoard);
  renderBoard();
  stopTimer();
  document.getElementById("timer").textContent = "0";
  document.getElementById("reset-btn").textContent = "🙂";
  showScreen("game-screen");
}

document.getElementById("reset-btn").addEventListener("click", startGame);
document.getElementById("play-again-btn").addEventListener("click", startGame);
document.getElementById("to-menu-btn").addEventListener("click", () => {
  stopTimer();
  document.getElementById("result-modal").classList.add("hidden");
  showScreen("start-screen");
});

// ---------- 보드 렌더링 ----------
function renderBoard() {
  const board = document.getElementById("board");
  const { rows, cols } = game.config;
  board.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size, 30px))`;
  board.innerHTML = "";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = game.board[r][c];
      const el = document.createElement("div");
      el.className = "cell";
      el.dataset.r = r;
      el.dataset.c = c;

      if (cell.open) {
        el.classList.add("open");
        if (cell.mine) {
          el.classList.add("mine");
          el.textContent = "💣";
        } else if (cell.count > 0) {
          el.classList.add("n" + cell.count);
          el.textContent = cell.count;
        }
      } else if (cell.flag) {
        el.classList.add("flag");
        el.textContent = "🚩";
      }

      el.addEventListener("click", onCellClick);
      el.addEventListener("contextmenu", onCellRightClick);
      board.appendChild(el);
    }
  }

  document.getElementById("mine-count").textContent = game.getRemainingMines();

  if (game.state === "playing" && !timerInterval) startTimer();
  if (game.state === "won") {
    stopTimer();
    document.getElementById("reset-btn").textContent = "😎";
    onGameEnd(true);
  } else if (game.state === "lost") {
    stopTimer();
    document.getElementById("reset-btn").textContent = "😵";
    onGameEnd(false);
  }
}

function onCellClick(e) {
  const r = +e.currentTarget.dataset.r;
  const c = +e.currentTarget.dataset.c;
  game.open(r, c);
}

function onCellRightClick(e) {
  e.preventDefault();
  const r = +e.currentTarget.dataset.r;
  const c = +e.currentTarget.dataset.c;
  game.toggleFlag(r, c);
}

// ---------- 타이머 ----------
function startTimer() {
  timerInterval = setInterval(() => {
    document.getElementById("timer").textContent = game.getElapsedSeconds();
  }, 500);
}
function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

// ---------- 게임 종료 ----------
async function onGameEnd(won) {
  const modal = document.getElementById("result-modal");
  const title = document.getElementById("result-title");
  const detail = document.getElementById("result-detail");
  const scoreBox = document.getElementById("save-score-box");

  const time = game.getElapsedSeconds();
  const score = won ? game.computeScore() : 0;

  if (won) {
    title.textContent = "🎉 승리!";
    detail.textContent = `시간: ${time}초 · 점수: ${score}점`;
    if (!scoreSaved) {
      scoreSaved = true;
      const ok = await saveScore({
        player_name: playerName,
        score,
        time_seconds: time,
        difficulty: selectedDifficulty,
      });
      if (ok) scoreBox.classList.remove("hidden");
    }
  } else {
    title.textContent = "💥 패배...";
    detail.textContent = `지뢰를 밟았습니다. (${time}초)`;
  }
  modal.classList.remove("hidden");
}

// ---------- 별점 ----------
const stars = document.querySelectorAll("#rating-stars span");
stars.forEach(s => {
  s.addEventListener("click", () => {
    currentRating = +s.dataset.value;
    updateRatingStars();
  });
  s.addEventListener("mouseenter", () => {
    const v = +s.dataset.value;
    stars.forEach(x => x.classList.toggle("hover", +x.dataset.value <= v));
  });
  s.addEventListener("mouseleave", () => {
    stars.forEach(x => x.classList.remove("hover"));
  });
});

function updateRatingStars() {
  stars.forEach(s => s.classList.toggle("active", +s.dataset.value <= currentRating));
}

// ---------- 리뷰 등록 ----------
document.getElementById("submit-review-btn").addEventListener("click", async () => {
  if (reviewSubmitted) { toast("이미 리뷰를 등록하셨어요"); return; }
  if (currentRating === 0) { toast("별점을 선택해주세요"); return; }
  const text = document.getElementById("review-text").value.trim();
  const ok = await saveReview({
    player_name: playerName,
    rating: currentRating,
    comment: text,
  });
  if (ok) {
    reviewSubmitted = true;
    toast("리뷰가 등록되었습니다 ✨");
  } else {
    toast("리뷰 등록 실패");
  }
});

// ---------- 랭킹 렌더링 ----------
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    renderRanking(btn.dataset.tab);
  });
});

async function renderRanking(difficulty) {
  const list = document.getElementById("ranking-list");
  list.innerHTML = `<div class="empty">불러오는 중...</div>`;
  const scores = await fetchScores(difficulty);
  if (!scores.length) {
    list.innerHTML = `<div class="empty">아직 기록이 없어요 👀</div>`;
    return;
  }
  list.innerHTML = scores.map((s, i) => `
    <div class="list-item">
      <div class="rank">${i + 1}</div>
      <div class="name">${escapeHtml(s.player_name)}</div>
      <div class="score">${s.score}점 · ${s.time_seconds}초</div>
    </div>
  `).join("");
}

// ---------- 리뷰 렌더링 ----------
async function renderReviews() {
  const list = document.getElementById("reviews-list");
  list.innerHTML = `<div class="empty">불러오는 중...</div>`;
  const reviews = await fetchReviews();
  if (!reviews.length) {
    list.innerHTML = `<div class="empty">아직 리뷰가 없어요 💬</div>`;
    return;
  }
  list.innerHTML = reviews.map(r => `
    <div class="review-item">
      <div class="review-head">
        <span class="review-name">${escapeHtml(r.player_name)}</span>
        <span class="review-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
      </div>
      ${r.comment ? `<div class="review-text">${escapeHtml(r.comment)}</div>` : ""}
      <div class="review-date">${formatDate(r.created_at)}</div>
    </div>
  `).join("");
}

// ---------- 유틸 ----------
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR") + " " + d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}
