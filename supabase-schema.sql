-- Supabase SQL Editor에서 전체 복사해 실행하세요.

-- 점수 테이블

create table if not exists public.scores (
  id            bigserial primary key,
  player_name   text not null check (char_length(player_name) between 1 and 20),
  score         integer not null check (score >= 0),
  time_seconds  integer not null check (time_seconds >= 0),
  difficulty    text not null check (difficulty in ('easy','medium','hard')),
  created_at    timestamptz not null default now()
);
create index if not exists scores_diff_score_idx
  on public.scores (difficulty, score desc);

-- 리뷰 테이블
create table if not exists public.reviews (
  id           bigserial primary key,
  player_name  text not null check (char_length(player_name) between 1 and 20),
  rating       integer not null check (rating between 1 and 5),
  comment      text check (char_length(comment) <= 300),
  created_at   timestamptz not null default now()
);
create index if not exists reviews_created_at_idx
  on public.reviews (created_at desc);

-- RLS: 회원가입이 없으므로 anon 키로 읽기/쓰기 허용
alter table public.scores enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "scores read" on public.scores;
drop policy if exists "scores write" on public.scores;
drop policy if exists "reviews read" on public.reviews;
drop policy if exists "reviews write" on public.reviews;

create policy "scores read"  on public.scores  for select using (true);
create policy "scores write" on public.scores  for insert with check (true);
create policy "reviews read" on public.reviews for select using (true);
create policy "reviews write" on public.reviews for insert with check (true);
