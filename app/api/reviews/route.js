import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { store, nextId } from "@/lib/memoryStore";

export async function GET() {
  if (supabase) {
    const { data, error } = await supabase
      .from("reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }
  const data = [...store.reviews]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 50);
  return NextResponse.json(data);
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const player_name = String(body.player_name || "").trim().slice(0, 20);
  const rating = Number(body.rating);
  const comment = typeof body.comment === "string" ? body.comment.slice(0, 300) : "";

  if (!player_name) return NextResponse.json({ error: "player_name required" }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "rating must be 1..5" }, { status: 400 });
  }

  const entry = { player_name, rating, comment };

  if (supabase) {
    const { data, error } = await supabase.from("reviews").insert(entry).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  const row = { id: nextId(), ...entry, created_at: new Date().toISOString() };
  store.reviews.push(row);
  return NextResponse.json(row, { status: 201 });
}
