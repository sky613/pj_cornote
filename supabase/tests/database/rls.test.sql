-- RLS 격리 테스트 (pgTAP). 실행: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

-- 두 사용자 준비
insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com', 'authenticated', 'authenticated');

-- 헬퍼: 특정 사용자로 전환
create or replace function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- Alice 데이터 생성
select pg_temp.login('11111111-1111-1111-1111-111111111111');
insert into public.notes (id, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Alice note');
insert into public.cues (id, note_id, text) values ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-000000000001', 'cue');
insert into public.questions (id, note_id, question, reference_answer)
values ('aaaaaaaa-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Q?', 'A');
insert into public.review_logs (question_id, user_answer, rating)
values ('aaaaaaaa-0000-0000-0000-0000000000f1', 'my answer', 'good');

select is((select count(*)::int from public.notes), 1, 'Alice sees her note');
select is((select user_id from public.notes limit 1), '11111111-1111-1111-1111-111111111111'::uuid, 'user_id defaults to auth.uid()');

-- Bob 으로 전환
select pg_temp.login('22222222-2222-2222-2222-222222222222');

select is((select count(*)::int from public.notes), 0, 'Bob cannot see Alice notes');
select is((select count(*)::int from public.cues), 0, 'Bob cannot see Alice cues');
select is((select count(*)::int from public.questions), 0, 'Bob cannot see Alice questions');
select is((select count(*)::int from public.review_logs), 0, 'Bob cannot see Alice review logs');

select throws_ok(
  $$ insert into public.notes (title, user_id) values ('spoof', '11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'Bob cannot insert a note owned by Alice');

select throws_ok(
  $$ insert into public.cues (note_id, text) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'Bob cannot attach a cue to Alice note');

select throws_ok(
  $$ insert into public.questions (note_id, question) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'Bob cannot attach a question to Alice note');

select throws_ok(
  $$ insert into public.review_logs (question_id, rating) values ('aaaaaaaa-0000-0000-0000-0000000000f1', 'easy') $$,
  '42501', null, 'Bob cannot log a review for Alice question');

update public.notes set title = 'hacked', version = version + 1 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.questions where id = 'aaaaaaaa-0000-0000-0000-0000000000f1';

-- Alice 로 돌아와 변경되지 않았는지 확인
select pg_temp.login('11111111-1111-1111-1111-111111111111');
select is((select title from public.notes where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'Alice note', 'Bob update had no effect');
select is((select count(*)::int from public.questions), 1, 'Bob delete had no effect');

-- 낙관적 잠금: version 을 건너뛰면 실패
select throws_ok(
  $$ update public.notes set title = 't', version = 5 where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '40001', null, 'version must increase by exactly one');

update public.notes set title = 'v2', version = 2 where id = 'aaaaaaaa-0000-0000-0000-000000000001' and version = 1;
select is((select version from public.notes where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 2, 'version increments');

select throws_ok(
  $$ update public.notes set user_id = '22222222-2222-2222-2222-222222222222', version = 3 where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'P0001', 'user_id is immutable', 'owner cannot be changed');

-- 복습 기록은 수정 불가
update public.review_logs set rating = 'easy';
select is((select rating from public.review_logs limit 1), 'good', 'review logs are append-only');

-- 요청 한도
select is(public.consume_ai_quota(1), true, 'first AI request allowed');
select is(public.consume_ai_quota(1), false, 'second AI request over limit is rejected');

select * from finish();
rollback;
