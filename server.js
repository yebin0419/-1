// Node.js + Express 서버
// - 정적 파일(index.html, style.css 등) 서빙
// - /api/scores, /api/reviews GET/POST 엔드포인트
// - Supabase 미설정 시 자동으로 메모리 저장소 폴백

const path = require("path");
const express = require("express");
try { require("dotenv").config(); } catch (_) {}

const { createClient } = require("@supabase/supabase-js");

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";

const sb = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  : null;

if (!sb) {
  console.warn("[warn] SUPABASE_URL / SUPABASE_ANON_KEY(또는 SERVICE_KEY)가 설정되지 않아 메모리 저장소로 동작합니다.");
}

// ---------- 메모리 폴백 ----------
const memory = { scores: [], reviews: [] };
let seq = 1;

// ---------- 유틸 ----------
const ALLOWED_DIFF = new Set(["easy", "medium", "hard"]);

function clampName(s) {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, 20);
}

function sendJson(res, status, body) {
  res.status(status).json(body);
}

// ---------- Express 앱 ----------
const app = express();
app.use(express.json({ limit: "16kb" }));

// 정적 파일: 루트 디렉토리 그대로 서빙
app.use(express.static(path.join(__dirname), {
  index: "index.html",
  extensions: ["html"],
}));

// ---------- GET /api/scores?difficulty=easy ----------
app.get("/api/scores", async (req, res) => {
  const difficulty = String(req.query.difficulty || "easy");
  if (!ALLOWED_DIFF.has(difficulty)) {
    return sendJson(res, 400, { error: "invalid difficulty" });
  }

  if (sb) {
    const { data, error } = await sb
      .from("scores")
      .select("*")
      .eq("difficulty", difficulty)
      .order("score", { ascending: false })
      .limit(20);
    if (error) return sendJson(res, 500, { error: error.message });
    return sendJson(res, 200, data);
  }

  const data = memory.scores
    .filter(s => s.difficulty === difficulty)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  sendJson(res, 200, data);
});

// ---------- POST /api/scores ----------
app.post("/api/scores", async (req, res) => {
  const player_name = clampName(req.body.player_name);
  const score = Number(req.body.score);
  const time_seconds = Number(req.body.time_seconds);
  const difficulty = String(req.body.difficulty || "");

  if (!player_name) return sendJson(res, 400, { error: "player_name required" });
  if (!Number.isFinite(score) || score < 0) return sendJson(res, 400, { error: "invalid score" });
  if (!Number.isFinite(time_seconds) || time_seconds < 0) return sendJson(res, 400, { error: "invalid time" });
  if (!ALLOWED_DIFF.has(difficulty)) return sendJson(res, 400, { error: "invalid difficulty" });

  const entry = { player_name, score, time_seconds, difficulty };

  if (sb) {
    const { data, error } = await sb.from("scores").insert(entry).select().single();
    if (error) return sendJson(res, 500, { error: error.message });
    return sendJson(res, 201, data);
  }

  const row = { id: seq++, ...entry, created_at: new Date().toISOString() };
  memory.scores.push(row);
  sendJson(res, 201, row);
});

// ---------- GET /api/reviews ----------
app.get("/api/reviews", async (_req, res) => {
  if (sb) {
    const { data, error } = await sb
      .from("reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return sendJson(res, 500, { error: error.message });
    return sendJson(res, 200, data);
  }
  const data = [...memory.reviews]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 50);
  sendJson(res, 200, data);
});

// ---------- POST /api/reviews ----------
app.post("/api/reviews", async (req, res) => {
  const player_name = clampName(req.body.player_name);
  const rating = Number(req.body.rating);
  const comment = typeof req.body.comment === "string" ? req.body.comment.slice(0, 300) : "";

  if (!player_name) return sendJson(res, 400, { error: "player_name required" });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return sendJson(res, 400, { error: "rating must be 1..5" });
  }

  const entry = { player_name, rating, comment };

  if (sb) {
    const { data, error } = await sb.from("reviews").insert(entry).select().single();
    if (error) return sendJson(res, 500, { error: error.message });
    return sendJson(res, 201, data);
  }

  const row = { id: seq++, ...entry, created_at: new Date().toISOString() };
  memory.reviews.push(row);
  sendJson(res, 201, row);
});

// ---------- 헬스체크 ----------
app.get("/api/health", (_req, res) => {
  sendJson(res, 200, { ok: true, supabase: !!sb });
});

// 로컬에서 직접 실행될 때만 listen (Vercel 서버리스에선 app만 export)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`지뢰게임 서버 실행 중: http://localhost:${PORT}`);
    console.log(`Supabase: ${sb ? "연결됨" : "미설정(메모리 폴백)"}`);
  });
}

module.exports = app;
