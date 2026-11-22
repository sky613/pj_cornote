-- Cornote 초기 스키마
-- 원칙
--  * 모든 개인 데이터 테이블에 RLS 적용, 소유권은 notes.user_id 를 기준으로 질문·복습 기록까지 검증
--  * version: 낙관적 잠금용. 클라이언트는 `where version = <기준 버전>` 으로 갱신하며 version+1 을 보낸다
--  * server_updated_at: 서버가 기록하는 변경 시각(동기화 pull 커서). 클라이언트 값은 무시된다
--  * 삭제는 deleted_at(tombstone)으로 동기화. 계정 삭제 시 auth.users → notes → cues/questions → review_logs 연쇄 삭제

create extension if not exists pgcrypto;

-- ── 공통 트리거 ─────────────────────────────────────────────

create or replace function public.tg_sync_row()
returns trigger
language plpgsql
as $$
begin
  new.server_updated_at := now();
  if tg_op = 'INSERT' then
    if new.version is null or new.version < 1 then
      new.version := 1;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.version <> old.version + 1 then
      raise exception 'version conflict on %.%: expected %, got %', tg_table_name, old.id, old.version + 1, new.version
        using errcode = '40001';
    end if;
    if new.id <> old.id then
      raise exception 'id is immutable';
    end if;
  end if;
  return new;
end;
$$;

-- ── notes ──────────────────────────────────────────────────

create table public.notes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title             text not null default '' check (char_length(title) <= 500),
  content_json      jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  user_summary      text not null default '',
  ai_summary_draft  text,
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  constraint notes_content_size check (pg_column_size(content_json) <= 1048576)
);

create index notes_user_sync_idx on public.notes (user_id, server_updated_at);

create or replace function public.tg_notes_owner_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'user_id is immutable';
  end if;
  return new;
end;
$$;

create trigger notes_sync before insert or update on public.notes
  for each row execute function public.tg_sync_row();
create trigger notes_owner before update on public.notes
  for each row execute function public.tg_notes_owner_immutable();

-- ── cues (핵심 키워드) ─────────────────────────────────────

create table public.cues (
  id                uuid primary key default gen_random_uuid(),
  note_id           uuid not null references public.notes (id) on delete cascade,
  text              text not null default '' check (char_length(text) <= 500),
  sort_order        double precision not null default 0,
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

create index cues_note_idx on public.cues (note_id);
create index cues_sync_idx on public.cues (server_updated_at);

create trigger cues_sync before insert or update on public.cues
  for each row execute function public.tg_sync_row();

-- ── questions ─────────────────────────────────────────────

create table public.questions (
  id                uuid primary key default gen_random_uuid(),
  note_id           uuid not null references public.notes (id) on delete cascade,
  question          text not null check (char_length(question) <= 2000),
  reference_answer  text not null default '' check (char_length(reference_answer) <= 8000),
  source_excerpt    text not null default '' check (char_length(source_excerpt) <= 4000),
  difficulty        text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  origin            text not null default 'manual' check (origin in ('ai', 'manual')),
  next_review_at    timestamptz,
  interval_days     integer not null default 0,
  review_count      integer not null default 0,
  last_rating       text check (last_rating in ('again', 'hard', 'good', 'easy')),
  last_reviewed_at  timestamptz,
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now()
);

create index questions_note_idx on public.questions (note_id);
create index questions_due_idx on public.questions (next_review_at) where deleted_at is null;
create index questions_sync_idx on public.questions (server_updated_at);

create trigger questions_sync before insert or update on public.questions
  for each row execute function public.tg_sync_row();

-- ── review_logs (추가 전용) ─────────────────────────────────

create table public.review_logs (
  id                uuid primary key default gen_random_uuid(),
  question_id       uuid not null references public.questions (id) on delete cascade,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_answer       text not null default '' check (char_length(user_answer) <= 8000),
  ai_score          integer check (ai_score between 0 and 100),
  confidence        smallint check (confidence between 1 and 3),
  rating            text not null check (rating in ('again', 'hard', 'good', 'easy')),
  feedback_json     jsonb,
  reviewed_at       timestamptz not null default now(),
  version           integer not null default 1,
  server_updated_at timestamptz not null default now()
);

create index review_logs_user_sync_idx on public.review_logs (user_id, server_updated_at);
create index review_logs_question_idx on public.review_logs (question_id);

create trigger review_logs_sync before insert or update on public.review_logs
  for each row execute function public.tg_sync_row();

-- ── AI 사용량 (사용자별 일일 요청 횟수 제한) ────────────────

create table public.ai_usage (
  user_id    uuid not null references auth.users (id) on delete cascade,
  usage_date date not null default current_date,
  count      integer not null default 0,
  primary key (user_id, usage_date)
);

-- ── 소유권 헬퍼 ────────────────────────────────────────────
-- security definer 로 RLS 재귀 없이 노트 소유 여부를 판단한다. 호출자 본인(auth.uid())만 검사.

create or replace function public.owns_note(p_note_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.notes n
    where n.id = p_note_id and n.user_id = (select auth.uid())
  );
$$;

create or replace function public.owns_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.questions q
    join public.notes n on n.id = q.note_id
    where q.id = p_question_id and n.user_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_note(uuid) from public, anon;
revoke all on function public.owns_question(uuid) from public, anon;
grant execute on function public.owns_note(uuid) to authenticated;
grant execute on function public.owns_question(uuid) to authenticated;

-- ── RLS ────────────────────────────────────────────────────

alter table public.notes enable row level security;
alter table public.cues enable row level security;
alter table public.questions enable row level security;
alter table public.review_logs enable row level security;
alter table public.ai_usage enable row level security;

-- notes
create policy notes_select on public.notes for select to authenticated
  using (user_id = (select auth.uid()));
create policy notes_insert on public.notes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notes_update on public.notes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notes_delete on public.notes for delete to authenticated
  using (user_id = (select auth.uid()));

-- cues
create policy cues_select on public.cues for select to authenticated
  using (public.owns_note(note_id));
create policy cues_insert on public.cues for insert to authenticated
  with check (public.owns_note(note_id));
create policy cues_update on public.cues for update to authenticated
  using (public.owns_note(note_id))
  with check (public.owns_note(note_id));
create policy cues_delete on public.cues for delete to authenticated
  using (public.owns_note(note_id));

-- questions
create policy questions_select on public.questions for select to authenticated
  using (public.owns_note(note_id));
create policy questions_insert on public.questions for insert to authenticated
  with check (public.owns_note(note_id));
create policy questions_update on public.questions for update to authenticated
  using (public.owns_note(note_id))
  with check (public.owns_note(note_id));
create policy questions_delete on public.questions for delete to authenticated
  using (public.owns_note(note_id));

-- review_logs: 본인 기록이면서, 질문도 본인 노트에 속해야 한다
create policy review_logs_select on public.review_logs for select to authenticated
  using (user_id = (select auth.uid()));
create policy review_logs_insert on public.review_logs for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns_question(question_id));
create policy review_logs_delete on public.review_logs for delete to authenticated
  using (user_id = (select auth.uid()));
-- 복습 기록은 수정 불가(추가 전용): update 정책 없음

-- ai_usage: 조회만 허용, 증가는 consume_ai_quota() 로만
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));

-- anon 역할은 개인 데이터 테이블에 접근하지 않는다
revoke all on public.notes, public.cues, public.questions, public.review_logs, public.ai_usage from anon;

-- ── RPC ────────────────────────────────────────────────────

-- 오늘 사용량을 1 증가시키고 한도 이내이면 true
create or replace function public.consume_ai_quota(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    return false;
  end if;
  insert into public.ai_usage (user_id, usage_date, count)
  values (v_uid, current_date, 1)
  on conflict (user_id, usage_date) do update set count = public.ai_usage.count + 1
  returning count into v_count;
  return v_count <= greatest(p_limit, 0);
end;
$$;

revoke all on function public.consume_ai_quota(integer) from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;

-- 본인 데이터 전체 삭제 (계정 삭제 전 단계 / "클라우드 데이터 지우기")
create or replace function public.delete_my_data()
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.notes where user_id = (select auth.uid());
  delete from public.review_logs where user_id = (select auth.uid());
  -- ai_usage 는 지우지 않는다 (요청 한도 우회 방지). 계정 삭제 시 cascade 로 제거된다.
$$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
