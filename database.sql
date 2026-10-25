-- 과제 8: 새 Supabase 프로젝트에서 실행하는 재현용 스키마입니다.
-- 기존 프로젝트에는 이미 적용했습니다. 제출을 위해 다시 실행할 필요는 없습니다.
begin;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.private_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.passkeys (
  credential_id text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  public_key text not null,
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  device_type text,
  backed_up boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.auth_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge text not null unique,
  purpose text not null check (purpose in ('register','login','add_passkey')),
  account_id uuid references public.accounts(id) on delete cascade,
  browser_binding_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  used_at timestamptz,
  registration_data jsonb,
  check (expires_at > created_at)
);
alter table public.auth_challenges
  add column if not exists registration_data jsonb;
create table if not exists public.auth_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  check (expires_at > created_at)
);
create index if not exists private_items_account_id_idx on public.private_items(account_id);
create index if not exists passkeys_account_id_idx on public.passkeys(account_id);
create index if not exists auth_sessions_account_id_idx on public.auth_sessions(account_id);

alter table public.accounts enable row level security;
alter table public.private_items enable row level security;
alter table public.passkeys enable row level security;
alter table public.auth_challenges enable row level security;
alter table public.auth_sessions enable row level security;
revoke all privileges on table public.accounts, public.private_items,
  public.passkeys, public.auth_challenges, public.auth_sessions
  from public, anon, authenticated;
grant select, insert, update, delete on table public.accounts, public.private_items,
  public.passkeys, public.auth_challenges, public.auth_sessions to service_role;

-- 등록 결과 검증은 api/register-verify.js가 먼저 수행합니다.
create or replace function public.finish_passkey_registration(
  p_challenge_id uuid, p_binding_hash text, p_credential_id text,
  p_public_key text, p_counter bigint, p_transports text[],
  p_device_type text, p_backed_up boolean, p_session_hash text
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare v_data jsonb; v_account_id uuid;
begin
  update public.auth_challenges set used_at = now()
  where id = p_challenge_id and purpose = 'register'
    and browser_binding_hash = p_binding_hash
    and used_at is null and expires_at > now()
  returning registration_data into v_data;
  if not found or v_data is null then raise exception 'CHALLENGE_INVALID'; end if;
  v_account_id := (v_data ->> 'accountId')::uuid;
  insert into public.accounts(id, display_name)
    values (v_account_id, v_data ->> 'displayName');
  insert into public.passkeys(credential_id, account_id, name, public_key,
    counter, transports, device_type, backed_up)
  values (p_credential_id, v_account_id, v_data ->> 'passkeyName',
    p_public_key, p_counter, p_transports, p_device_type, p_backed_up);
  insert into public.auth_sessions(token_hash, account_id)
    values (p_session_hash, v_account_id);
  -- 실제 개인정보가 없는 과제용 가상 내용입니다.
  insert into public.private_items(account_id, title, content) values
    (v_account_id, '가상 프로젝트 메모',
      (v_data ->> 'displayName') || '의 연습 자료: 작은 탐험 게임의 배경을 구상한다.'),
    (v_account_id, '가상 지원 예정 목록',
      (v_data ->> 'displayName') || '의 연습 자료: 가상의 별빛 스튜디오를 조사한다.'),
    (v_account_id, '가상 회고',
      (v_data ->> 'displayName') || '의 연습 자료: 오늘은 문제를 작은 단계로 나누어 해결했다.');
  return v_account_id;
end;
$$;

create or replace function public.finish_passkey_login(
  p_challenge_id uuid, p_binding_hash text, p_credential_id text,
  p_expected_counter bigint, p_new_counter bigint, p_session_hash text
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare v_key public.passkeys%rowtype;
begin
  select * into v_key from public.passkeys
    where credential_id = p_credential_id for update;
  if not found then raise exception 'CREDENTIAL_REJECTED'; end if;
  if p_expected_counter is distinct from v_key.counter
    or p_new_counter is null or p_new_counter < 0 then
    raise exception 'COUNTER_REJECTED';
  end if;
  if (v_key.counter > 0 or p_new_counter > 0)
    and p_new_counter <= v_key.counter then
    raise exception 'COUNTER_REJECTED';
  end if;
  update public.auth_challenges set used_at = now()
  where id = p_challenge_id and purpose = 'login'
    and browser_binding_hash = p_binding_hash
    and used_at is null and expires_at > now();
  if not found then raise exception 'CHALLENGE_INVALID'; end if;
  update public.passkeys set counter = p_new_counter
    where credential_id = p_credential_id;
  insert into public.auth_sessions(token_hash, account_id)
    values (p_session_hash, v_key.account_id);
  return v_key.account_id;
end;
$$;

create or replace function public.finish_add_passkey(
  p_session_hash text, p_challenge_id uuid, p_binding_hash text,
  p_credential_id text, p_public_key text, p_counter bigint,
  p_transports text[], p_device_type text, p_backed_up boolean
) returns text language plpgsql security invoker set search_path = ''
as $$
declare v_account_id uuid; v_data jsonb;
begin
  select account_id into v_account_id from public.auth_sessions
    where token_hash = p_session_hash and expires_at > now() for update;
  if not found then raise exception 'SESSION_INVALID'; end if;
  update public.auth_challenges set used_at = now()
  where id = p_challenge_id and purpose = 'add_passkey'
    and account_id = v_account_id
    and browser_binding_hash = p_binding_hash
    and used_at is null and expires_at > now()
  returning registration_data into v_data;
  if not found or v_data is null then raise exception 'CHALLENGE_INVALID'; end if;
  insert into public.passkeys(credential_id, account_id, name, public_key,
    counter, transports, device_type, backed_up)
  values (p_credential_id, v_account_id, v_data ->> 'passkeyName',
    p_public_key, p_counter, p_transports, p_device_type, p_backed_up);
  return p_credential_id;
end;
$$;

create or replace function public.remove_passkey(
  p_session_hash text, p_credential_id text
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_account_id uuid; v_count bigint; v_name text;
begin
  select account_id into v_account_id from public.auth_sessions
    where token_hash = p_session_hash and expires_at > now() for update;
  if not found then raise exception 'SESSION_INVALID'; end if;
  perform id from public.accounts where id = v_account_id for no key update;
  select name into v_name from public.passkeys
    where credential_id = p_credential_id and account_id = v_account_id;
  if not found then raise exception 'CREDENTIAL_NOT_FOUND'; end if;
  select count(*) into v_count from public.passkeys where account_id = v_account_id;
  if v_count <= 1 then raise exception 'LAST_PASSKEY'; end if;
  delete from public.passkeys
    where credential_id = p_credential_id and account_id = v_account_id;
  return jsonb_build_object('deleted',true,'name',v_name,'remaining',v_count - 1);
end;
$$;

revoke all privileges on function
  public.finish_passkey_registration(uuid,text,text,text,bigint,text[],text,boolean,text)
  from public, anon, authenticated;
revoke all privileges on function
  public.finish_passkey_login(uuid,text,text,bigint,bigint,text)
  from public, anon, authenticated;
revoke all privileges on function
  public.finish_add_passkey(text,uuid,text,text,text,bigint,text[],text,boolean)
  from public, anon, authenticated;
revoke all privileges on function public.remove_passkey(text,text)
  from public, anon, authenticated;
grant execute on function
  public.finish_passkey_registration(uuid,text,text,text,bigint,text[],text,boolean,text)
  to service_role;
grant execute on function public.finish_passkey_login(uuid,text,text,bigint,bigint,text)
  to service_role;
grant execute on function
  public.finish_add_passkey(text,uuid,text,text,text,bigint,text[],text,boolean)
  to service_role;
grant execute on function public.remove_passkey(text,text) to service_role;

commit;
