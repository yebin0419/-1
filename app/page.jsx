"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minesweeper } from "@/lib/game";

function escapeText(s) { return String(s ?? ""); }
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("ko-KR") +
    " " +
    d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
  );
}

async function apiGet(path) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("GET 실패:", path, e);
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
    return await res.json().catch(() => ({}));
  } catch (e) {
    console.error("POST 실패:", path, e);
    return null;
  }
}

// ---------- 로컬 백업: 서버 메모리 폴백이 날아가도 내 기록은 유지 ----------
const LOCAL_SCORES_KEY = "ms_scores_v1";
function readLocalScores() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LOCAL_SCORES_KEY) || "[]"); }
  catch { return []; }
}
function writeLocalScore(entry) {
  if (typeof window === "undefined") return;
  const data = readLocalScores();
  data.push(entry);
  localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(data));
}
function mergeScores(serverRows, localRows, difficulty) {
  const seen = new Set();
  const keyOf = (s) =>
    `${s.player_name}|${s.score}|${s.time_seconds}|${s.difficulty}|${s.created_at ?? ""}`;
  const result = [];
  for (const s of [...serverRows, ...localRows]) {
    if (s.difficulty !== difficulty) continue;
    const k = keyOf(s);
    if (seen.has(k)) continue;
    seen.add(k);
    result.push(s);
  }
  result.sort((a, b) => b.score - a.score || a.time_seconds - b.time_seconds);
  return result.slice(0, 20);
}
async function loadRanking(difficulty) {
  const server = await apiGet(`/api/scores?difficulty=${encodeURIComponent(difficulty)}`);
  const local = readLocalScores();
  return mergeScores(Array.isArray(server) ? server : [], local, difficulty);
}

// ---------- 리뷰도 로컬 백업 + 서버 머지 ----------
const LOCAL_REVIEWS_KEY = "ms_reviews_v1";
function readLocalReviews() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LOCAL_REVIEWS_KEY) || "[]"); }
  catch { return []; }
}
function writeLocalReview(entry) {
  if (typeof window === "undefined") return;
  const data = readLocalReviews();
  data.push(entry);
  localStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(data));
}
function mergeReviews(serverRows, localRows) {
  const seen = new Set();
  const keyOf = (r) =>
    `${r.player_name}|${r.rating}|${r.comment ?? ""}|${r.created_at ?? ""}`;
  const result = [];
  for (const r of [...serverRows, ...localRows]) {
    const k = keyOf(r);
    if (seen.has(k)) continue;
    seen.add(k);
    result.push(r);
  }
  result.sort(
    (a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0)
  );
  return result.slice(0, 50);
}
async function loadReviews() {
  const server = await apiGet("/api/reviews");
  const local = readLocalReviews();
  return mergeReviews(Array.isArray(server) ? server : [], local);
}

function diffLabel(d) {
  return d === "easy" ? "쉬움" : d === "medium" ? "보통" : d === "hard" ? "어려움" : d;
}

export default function Page() {
  const [screen, setScreen] = useState("start"); // start | game | ranking | reviews
  const [playerName, setPlayerName] = useState("");
  const [difficulty, setDifficulty] = useState("easy");
  const [, setTick] = useState(0);
  const forceRerender = useCallback(() => setTick((t) => t + 1), []);
  const [elapsed, setElapsed] = useState(0);
  const [toastMsg, setToastMsg] = useState("");
  const [resultOpen, setResultOpen] = useState(false);
  const [resultWon, setResultWon] = useState(false);
  const [resultScore, setResultScore] = useState(0);
  const [resultTime, setResultTime] = useState(0);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState("");

  const [rankingDiff, setRankingDiff] = useState("easy");
  const [rankingData, setRankingData] = useState(null); // null = loading
  const [reviewsData, setReviewsData] = useState(null);

  // 시작 화면용 미리보기
  const [previewScores, setPreviewScores] = useState([]);
  const [previewReviews, setPreviewReviews] = useState([]);

  const gameRef = useRef(null);
  const timerRef = useRef(null);
  const toastTimerRef = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(""), 2000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      const g = gameRef.current;
      if (g) setElapsed(g.getElapsedSeconds());
    }, 500);
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  // 시작 화면에 들어올 때마다 최근 기록/리뷰 자동 로드
  const refreshPreview = useCallback(async () => {
    const [easy, medium, hard] = await Promise.all([
      loadRanking("easy"),
      loadRanking("medium"),
      loadRanking("hard"),
    ]);
    const recent = [...easy, ...medium, ...hard]
      .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
      .slice(0, 5);
    setPreviewScores(recent);
    const r = await loadReviews();
    setPreviewReviews(r.slice(0, 3));
  }, []);

  useEffect(() => {
    if (screen === "start") refreshPreview();
  }, [screen, refreshPreview]);

  const startGame = useCallback(() => {
    const game = new Minesweeper(difficulty);
    gameRef.current = game;
    setElapsed(0);
    setResultOpen(false);
    setScoreSaved(false);
    setReviewSubmitted(false);
    setRating(0);
    setReviewText("");
    stopTimer();
    setScreen("game");
    forceRerender();
  }, [difficulty, stopTimer, forceRerender]);

  const onStart = () => {
    const name = playerName.trim();
    if (!name) { toast("이름을 입력해주세요"); return; }
    setPlayerName(name);
    startGame();
  };

  const handleCellOpen = async (r, c) => {
    const g = gameRef.current;
    if (!g) return;
    const wasReady = g.state === "ready";
    g.open(r, c);
    if (wasReady && g.state === "playing") startTimer();
    forceRerender();
    if (g.state === "won" || g.state === "lost") await handleGameEnd();
  };

  const handleCellFlag = (e, r, c) => {
    e.preventDefault();
    const g = gameRef.current;
    if (!g) return;
    g.toggleFlag(r, c);
    forceRerender();
  };

  const handleGameEnd = async () => {
    const g = gameRef.current;
    if (!g) return;
    stopTimer();
    const won = g.state === "won";
    const time = g.getElapsedSeconds();
    const score = won ? g.computeScore() : 0;
    setResultWon(won);
    setResultTime(time);
    setResultScore(score);
    setResultOpen(true);
    if (won && !scoreSaved) {
      const entry = {
        player_name: playerName,
        score,
        time_seconds: time,
        difficulty,
      };
      const saved = await apiPost("/api/scores", entry);
      // 서버 저장이 실패했거나 서버 메모리 폴백에 있어도 날아갈 수 있으니
      // localStorage에 반드시 백업해 둔다.
      const backup = (saved && typeof saved === "object" && saved.created_at)
        ? saved
        : { ...entry, created_at: new Date().toISOString() };
      writeLocalScore(backup);
      setScoreSaved(true);
    }
  };

  const submitReview = async () => {
    if (reviewSubmitted) { toast("이미 리뷰를 등록하셨어요"); return; }
    if (rating === 0) { toast("별점을 선택해주세요"); return; }
    const entry = {
      player_name: playerName,
      rating,
      comment: reviewText.trim(),
    };
    const saved = await apiPost("/api/reviews", entry);
    const backup = (saved && typeof saved === "object" && saved.created_at)
      ? saved
      : { ...entry, created_at: new Date().toISOString() };
    writeLocalReview(backup);
    setReviewSubmitted(true);
    toast("리뷰가 등록되었습니다 ✨");
  };

  const openRanking = async () => {
    // 방금 플레이한 난이도를 기본 탭으로
    const initial = difficulty || "easy";
    setScreen("ranking");
    setRankingDiff(initial);
    setRankingData(null);
    const data = await loadRanking(initial);
    setRankingData(data);
  };
  const changeRankingDiff = async (d) => {
    setRankingDiff(d);
    setRankingData(null);
    const data = await loadRanking(d);
    setRankingData(data);
  };
  const openReviews = async () => {
    setScreen("reviews");
    setReviewsData(null);
    const data = await loadReviews();
    setReviewsData(data);
  };

  const backToMenu = () => {
    stopTimer();
    setResultOpen(false);
    setScreen("start");
  };

  // ---------- 렌더 ----------
  const g = gameRef.current;

  if (screen === "start") {
    return (
      <main className="screen">
        <div className="hero">
          <h1 className="title">💣 지뢰게임</h1>
          <p className="author">made by <strong>김예빈</strong></p>

          <div className="player-input">
            <label htmlFor="player-name">플레이어 이름</label>
            <input
              id="player-name"
              type="text"
              maxLength={12}
              placeholder="이름을 입력하세요"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onStart(); }}
            />
          </div>

          <div className="difficulty">
            <h3>난이도 선택</h3>
            <div className="diff-buttons">
              {[
                { k: "easy",   label: "쉬움",  sub: "9×9 · 지뢰 10개" },
                { k: "medium", label: "보통",  sub: "16×16 · 지뢰 40개" },
                { k: "hard",   label: "어려움",sub: "16×30 · 지뢰 99개" },
              ].map(({ k, label, sub }) => (
                <button
                  key={k}
                  className={"diff-btn" + (difficulty === k ? " selected" : "")}
                  onClick={() => setDifficulty(k)}
                >
                  {label}<br /><small>{sub}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="start-actions">
            <button className="primary-btn" onClick={onStart}>게임 시작</button>
            <button className="secondary-btn" onClick={openRanking}>🏆 전체 랭킹</button>
            <button className="secondary-btn" onClick={openReviews}>💬 전체 리뷰</button>
          </div>

          <div className="preview-sections">
            <div className="preview-card">
              <div className="preview-head">
                <h3>📜 최근 기록</h3>
                <button className="preview-more" onClick={openRanking}>전체 보기 →</button>
              </div>
              {previewScores.length === 0 ? (
                <p className="empty-small">아직 기록이 없어요. 지금 플레이해보세요!</p>
              ) : (
                previewScores.map((s, i) => {
                  const mine = playerName && s.player_name === playerName;
                  return (
                    <div className={"preview-row" + (mine ? " mine" : "")} key={"ps-" + i}>
                      <span className="preview-name">
                        {escapeText(s.player_name)}
                        {mine && <span className="me-badge">나</span>}
                      </span>
                      <span className="preview-diff">{diffLabel(s.difficulty)}</span>
                      <span className="preview-score">
                        {s.score}점 · {s.time_seconds}초
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="preview-card">
              <div className="preview-head">
                <h3>💬 최근 리뷰</h3>
                <button className="preview-more" onClick={openReviews}>전체 보기 →</button>
              </div>
              {previewReviews.length === 0 ? (
                <p className="empty-small">아직 리뷰가 없어요. 첫 리뷰를 남겨보세요!</p>
              ) : (
                previewReviews.map((r, i) => {
                  const mine = playerName && r.player_name === playerName;
                  return (
                    <div className={"preview-review" + (mine ? " mine" : "")} key={"pr-" + i}>
                      <div className="preview-review-head">
                        <span className="preview-name">
                          {escapeText(r.player_name)}
                          {mine && <span className="me-badge">나</span>}
                        </span>
                        <span className="preview-stars">{"★".repeat(r.rating)}</span>
                      </div>
                      {r.comment && (
                        <div className="preview-review-text">{escapeText(r.comment)}</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        {toastMsg && <div className="toast">{toastMsg}</div>}
      </main>
    );
  }

  if (screen === "ranking") {
    return (
      <main className="screen">
        <div className="panel-header">
          <button className="icon-btn" onClick={() => setScreen("start")}>← 메뉴</button>
          <h2>🏆 랭킹</h2>
        </div>
        <div className="tab-bar">
          {["easy", "medium", "hard"].map((d) => (
            <button
              key={d}
              className={"tab-btn" + (rankingDiff === d ? " selected" : "")}
              onClick={() => changeRankingDiff(d)}
            >
              {d === "easy" ? "쉬움" : d === "medium" ? "보통" : "어려움"}
            </button>
          ))}
        </div>
        <div className="list">
          {rankingData === null
            ? <div className="empty">불러오는 중...</div>
            : rankingData.length === 0
              ? <div className="empty">아직 기록이 없어요 👀</div>
              : rankingData.map((s, i) => {
                const isMine = playerName && s.player_name === playerName;
                return (
                  <div
                    className={"list-item" + (isMine ? " mine" : "")}
                    key={(s.id ?? "l") + "-" + i}
                  >
                    <div className="rank">{i + 1}</div>
                    <div className="name">
                      {escapeText(s.player_name)}
                      {isMine && <span className="me-badge">나</span>}
                    </div>
                    <div className="score">{s.score}점 · {s.time_seconds}초</div>
                  </div>
                );
              })}
        </div>
      </main>
    );
  }

  if (screen === "reviews") {
    return (
      <main className="screen">
        <div className="panel-header">
          <button className="icon-btn" onClick={() => setScreen("start")}>← 메뉴</button>
          <h2>💬 리뷰</h2>
        </div>
        <div className="list">
          {reviewsData === null
            ? <div className="empty">불러오는 중...</div>
            : reviewsData.length === 0
              ? <div className="empty">아직 리뷰가 없어요 💬</div>
              : reviewsData.map((r) => (
                <div className="review-item" key={r.id}>
                  <div className="review-head">
                    <span className="review-name">{escapeText(r.player_name)}</span>
                    <span className="review-stars">
                      {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                    </span>
                  </div>
                  {r.comment && <div className="review-text">{escapeText(r.comment)}</div>}
                  <div className="review-date">{formatDate(r.created_at)}</div>
                </div>
              ))}
        </div>
      </main>
    );
  }

  // 게임 화면
  const face = g?.state === "won" ? "😎" : g?.state === "lost" ? "😵" : "🙂";
  return (
    <main className="screen">
      <div className="game-header">
        <button className="icon-btn" onClick={backToMenu}>← 메뉴</button>
        <div className="status-bar">
          <div className="stat">💣 <span>{g?.getRemainingMines() ?? 0}</span></div>
          <button className="face-btn" onClick={startGame}>{face}</button>
          <div className="stat">⏱ <span>{elapsed}</span>s</div>
        </div>
        <div className="player-tag">👤 <span>{playerName}</span></div>
      </div>

      <div className="board-wrap">
        {g && (
          <div
            className="board"
            style={{ gridTemplateColumns: `repeat(${g.config.cols}, 30px)` }}
          >
            {g.board.map((row, r) =>
              row.map((cell, c) => {
                const cls = ["cell"];
                let content = "";
                if (cell.open) {
                  cls.push("open");
                  if (cell.mine) { cls.push("mine"); content = "💣"; }
                  else if (cell.count > 0) { cls.push("n" + cell.count); content = cell.count; }
                } else if (cell.flag) {
                  cls.push("flag"); content = "🚩";
                }
                return (
                  <div
                    key={`${r}-${c}`}
                    className={cls.join(" ")}
                    onClick={() => handleCellOpen(r, c)}
                    onContextMenu={(e) => handleCellFlag(e, r, c)}
                  >
                    {content}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {resultOpen && (
        <div className="modal">
          <div className="modal-content">
            <h2>{resultWon ? "🎉 승리!" : "💥 패배..."}</h2>
            <p>
              {resultWon
                ? `시간: ${resultTime}초 · 점수: ${resultScore}점`
                : `지뢰를 밟았습니다. (${resultTime}초)`}
            </p>
            {resultWon && scoreSaved && (
              <div className="modal-score"><p>점수가 저장되었습니다.</p></div>
            )}
            <div className="review-box">
              <h3>💬 게임 리뷰 남기기</h3>
              <div className="rating">
                {[1, 2, 3, 4, 5].map((v) => (
                  <span
                    key={v}
                    className={
                      (hoverRating ? v <= hoverRating : v <= rating) ? "active" : ""
                    }
                    onClick={() => setRating(v)}
                    onMouseEnter={() => setHoverRating(v)}
                    onMouseLeave={() => setHoverRating(0)}
                  >★</span>
                ))}
              </div>
              <textarea
                className="review-text-input"
                maxLength={300}
                placeholder="이 게임에 대한 후기를 남겨주세요 (선택)"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
              />
              <button className="primary-btn" onClick={submitReview}>리뷰 등록</button>
            </div>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={startGame}>다시 하기</button>
              <button className="secondary-btn" onClick={backToMenu}>메뉴로</button>
            </div>
          </div>
        </div>
      )}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </main>
  );
}
