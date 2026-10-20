import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { store, nextId } from "@/lib/memoryStore";

const ALLOWED = new Set(["easy", "medium", "hard"]);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const difficulty = searchParams.get("difficulty") || "easy";
  if (!ALLOWED.has(difficulty)) {
    return NextResponse.json({ error: "invalid difficulty" }, { status: 400 });
  }

  if (supabase) {
    const { data, error } = await supabase
      .from("scores")
      .select("*")
      .eq("difficulty", difficulty)
      .order("score", { ascending: false })
      .limit(20);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const data = store.scores
    .filter((s) => s.difficulty === difficulty)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  return NextResponse.json(data);
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const player_name = String(body.player_name || "").trim().slice(0, 20);
  const score = Number(body.score);
  const time_seconds = Number(body.time_seconds);
  const difficulty = String(body.difficulty || "");

  if (!player_name) return NextResponse.json({ error: "player_name required" }, { status: 400 });
  if (!Number.isFinite(score) || score < 0) return NextResponse.json({ error: "invalid score" }, { status: 400 });
  if (!Number.isFinite(time_seconds) || time_seconds < 0) return NextResponse.json({ error: "invalid time" }, { status: 400 });
  if (!ALLOWED.has(difficulty)) return NextResponse.json({ error: "invalid difficulty" }, { status: 400 });

  const entry = { player_name, score, time_seconds, difficulty };

  if (supabase) {
    const { data, error } = await supabase.from("scores").insert(entry).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  const row = { id: nextId(), ...entry, created_at: new Date().toISOString() };
  store.scores.push(row);
  return NextResponse.json(row, { status: 201 });
}
