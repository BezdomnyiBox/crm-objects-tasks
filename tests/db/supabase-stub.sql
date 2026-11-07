-- Минимальная имитация окружения Supabase для локальных тестов миграций (PGlite).
-- Воспроизводит только то, на что опираются миграции: роли API, схему auth с auth.uid()
-- и права «по умолчанию», которые Supabase выдаёт всем новым объектам в схеме public
-- (миграции должны эти права забрать — тесты проверяют, что так и есть).

create role anon          nologin;
create role authenticated nologin;
create role service_role  nologin bypassrls;

create schema auth;

create table auth.users (
  instance_id            uuid,
  id                     uuid primary key default gen_random_uuid(),
  aud                    varchar,
  role                   varchar,
  email                  text,
  encrypted_password     varchar,
  email_confirmed_at     timestamptz,
  confirmation_token     varchar,
  recovery_token         varchar,
  email_change_token_new varchar,
  email_change           varchar,
  raw_app_meta_data      jsonb not null default '{}'::jsonb,
  raw_user_meta_data     jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz
);

create table auth.identities (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  provider_id     text not null,
  provider        text not null,
  identity_data   jsonb not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz
);

-- Как в Supabase: текущий пользователь берётся из JWT, который PostgREST кладёт в настройку сессии.
create function auth.uid()
returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role()
returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant usage on schema auth   to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Права по умолчанию для всего нового в public — как в свежем проекте Supabase.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
