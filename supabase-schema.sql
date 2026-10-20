-- Supabase SQL Editor에서 전체 복사해 실행하세요. (여러 번 실행해도 안전)
-- 구성:
--   1) scores        : 매 플레이의 점수 로그 (append-only)
--   2) reviews       : 리뷰 로그 (append-only)
--   3) players       : 유저별 집계 테이블 (최초/최근 플레이, 플레이 수, 베스트 점수/시간)
--   4) 트리거        : scores/reviews INSERT 시 players 자동 upsert
--   5) v_player_stats: 플레이어 통계 뷰 (승률 포함)
--   6) RLS           : anon 키로 읽기/쓰기 허용 (회원가입 없음)

-- ============================================================
-- 1) 점수 테이블
-- ============================================================
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
create index if not exists scores_player_idx
  on public.scores (player_name);

-- ============================================================
-- 2) 리뷰 테이블
-- ============================================================
create table if not exists public.reviews (
  id           bigserial primary key,
  player_name  text not null check (char_length(player_name) between 1 and 20),
  rating       integer not null check (rating between 1 and 5),
  comment      text check (char_length(comment) <= 300),
  created_at   timestamptz not null default now()
);
create index if not exists reviews_created_at_idx
  on public.reviews (created_at desc);

-- ============================================================
-- 3) 플레이어 테이블 (유저별 누적 기록)
-- ============================================================
create table if not exists public.players (
  id                bigserial primary key,
  player_name       text unique not null check (char_length(player_name) between 1 and 20),
  first_played_at   timestamptz not null default now(),
  last_played_at    timestamptz not null default now(),
  games_played      integer not null default 0,  -- 승리한 게임 수(점수 기록 기준)
  games_won         integer not null default 0,  -- 현재는 games_played 와 동일. 패배 로그를 넣게 되면 분화됨
  reviews_count     integer not null default 0,
  best_score_easy   integer not null default 0,
  best_score_medium integer not null default 0,
  best_score_hard   integer not null default 0,
  best_time_easy    integer,  -- 초. null 이면 아직 클리어 기록 없음
  best_time_medium  integer,
  best_time_hard    integer
);
create index if not exists players_last_played_idx
  on public.players (last_played_at desc);

-- ============================================================
-- 4) 트리거: 점수가 들어오면 players 를 자동 upsert
-- ============================================================
create or replace function public.sync_player_on_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.players as p (
    player_name, first_played_at, last_played_at,
    games_played, games_won,
    best_score_easy, best_score_medium, best_score_hard,
    best_time_easy,  best_time_medium,  best_time_hard
  )
  values (
    new.player_name, now(), now(),
    1, 1,
    case when new.difficulty = 'easy'   then new.score else 0 end,
    case when new.difficulty = 'medium' then new.score else 0 end,
    case when new.difficulty = 'hard'   then new.score else 0 end,
    case when new.difficulty = 'easy'   then new.time_seconds end,
    case when new.difficulty = 'medium' then new.time_seconds end,
    case when new.difficulty = 'hard'   then new.time_seconds end
  )
  on conflict (player_name) do update set
    last_played_at = now(),
    games_played   = p.games_played + 1,
    games_won      = p.games_won + 1,
    best_score_easy = case when new.difficulty = 'easy'
                           then greatest(p.best_score_easy, new.score)
                           else p.best_score_easy end,
    best_score_medium = case when new.difficulty = 'medium'
                           then greatest(p.best_score_medium, new.score)
                           else p.best_score_medium end,
    best_score_hard   = case when new.difficulty = 'hard'
                           then greatest(p.best_score_hard, new.score)
                           else p.best_score_hard end,
    best_time_easy = case
      when new.difficulty = 'easy'
       and (p.best_time_easy is null or new.time_seconds < p.best_time_easy)
      then new.time_seconds else p.best_time_easy end,
    best_time_medium = case
      when new.difficulty = 'medium'
       and (p.best_time_medium is null or new.time_seconds < p.best_time_medium)
      then new.time_seconds else p.best_time_medium end,
    best_time_hard = case
      when new.difficulty = 'hard'
       and (p.best_time_hard is null or new.time_seconds < p.best_time_hard)
      then new.time_seconds else p.best_time_hard end;
  return new;
end;
$$;

drop trigger if exists trg_sync_player_on_score on public.scores;
create trigger trg_sync_player_on_score
after insert on public.scores
for each row execute function public.sync_player_on_score();

-- ============================================================
-- 4-b) 트리거: 리뷰가 들어오면 players.last_played_at / reviews_count 갱신
-- ============================================================
create or replace function public.sync_player_on_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.players as p (
    player_name, first_played_at, last_played_at, reviews_count
  )
  values (new.player_name, now(), now(), 1)
  on conflict (player_name) do update set
    last_played_at = now(),
    reviews_count  = p.reviews_count + 1;
  return new;
end;
$$;

drop trigger if exists trg_sync_player_on_review on public.reviews;
create trigger trg_sync_player_on_review
after insert on public.reviews
for each row execute function public.sync_player_on_review();

-- ============================================================
-- 5) 플레이어 통계 뷰
-- ============================================================
create or replace view public.v_player_stats as
select
  player_name,
  games_played,
  games_won,
  case when games_played > 0
       then round((games_won::numeric / games_played) * 100, 1)
       else 0 end                            as win_rate,
  reviews_count,
  best_score_easy,
  best_score_medium,
  best_score_hard,
  best_time_easy,
  best_time_medium,
  best_time_hard,
  first_played_at,
  last_played_at
from public.players;

-- ============================================================
-- 6) RLS 와 정책: anon 키로 읽기/쓰기 허용 (회원가입 없음)
--    players 는 트리거(SECURITY DEFINER)로만 갱신되도록 쓰기 미허용
-- ============================================================
alter table public.scores  enable row level security;
alter table public.reviews enable row level security;
alter table public.players enable row level security;

drop policy if exists "scores read"   on public.scores;
drop policy if exists "scores write"  on public.scores;
drop policy if exists "reviews read"  on public.reviews;
drop policy if exists "reviews write" on public.reviews;
drop policy if exists "players read"  on public.players;

create policy "scores read"   on public.scores  for select using (true);
create policy "scores write"  on public.scores  for insert with check (true);
create policy "reviews read"  on public.reviews for select using (true);
create policy "reviews write" on public.reviews for insert with check (true);
create policy "players read"  on public.players for select using (true);
-- players 의 INSERT/UPDATE 는 트리거 함수(SECURITY DEFINER)만 수행 → anon 쓰기 정책 없음

-- ============================================================
-- (선택) 기존에 쌓여있던 scores 로부터 players 초기 백필
-- 스키마만 새로 적용했는데 scores 는 이미 있는 경우 한 번 실행하세요.
-- ============================================================
-- insert into public.players (player_name, first_played_at, last_played_at,
--   games_played, games_won,
--   best_score_easy, best_score_medium, best_score_hard,
--   best_time_easy, best_time_medium, best_time_hard)
-- select
--   player_name,
--   min(created_at), max(created_at),
--   count(*), count(*),
--   coalesce(max(score) filter (where difficulty='easy'),   0),
--   coalesce(max(score) filter (where difficulty='medium'), 0),
--   coalesce(max(score) filter (where difficulty='hard'),   0),
--   min(time_seconds) filter (where difficulty='easy'),
--   min(time_seconds) filter (where difficulty='medium'),
--   min(time_seconds) filter (where difficulty='hard')
-- from public.scores
-- group by player_name
-- on conflict (player_name) do nothing;
