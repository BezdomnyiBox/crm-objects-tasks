-- ============================================================================
-- Мини-CRM «Объекты и задачи» — миграция 1/4: структура данных.
--
-- Здесь только таблицы и ограничения целостности. Права доступа (RLS) — в
-- миграции 3, правила переходов статусов и журнал — в миграции 4.
-- ============================================================================

-- Роли пользователей: постановщик (manager) и исполнитель (executor).
create type public.app_role as enum ('manager', 'executor');

-- Статусы задачи. Русские названия показывает интерфейс:
-- new = Новая, in_progress = В работе, in_review = На проверке,
-- accepted = Принята, rework = На доработке.
create type public.task_status as enum ('new', 'in_progress', 'in_review', 'accepted', 'rework');

-- ----------------------------------------------------------------------------
-- Профили: роль и имя пользователя. Один профиль на одного пользователя Supabase Auth.
-- Роль хранится здесь, а не в данных, которые пользователь может поправить сам.
-- ----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  role        public.app_role not null default 'executor',
  created_at  timestamptz not null default now()
);
comment on table public.profiles is 'Профиль пользователя: имя и роль. Роль меняет только администратор базы.';

-- ----------------------------------------------------------------------------
-- Объекты (стройки)
-- ----------------------------------------------------------------------------
-- Во всех проверках «не пусто» обрезаются пробелы, табуляция, переводы строк и неразрывный пробел:
-- обычный btrim() убирает только пробелы, и строка из одних переводов строк считалась бы заполненной.
create table public.objects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name, ' ' || chr(9) || chr(10) || chr(13) || chr(160))) between 1 and 200),
  address     text not null check (char_length(btrim(address, ' ' || chr(9) || chr(10) || chr(13) || chr(160))) between 1 and 300),
  created_at  timestamptz not null default now()
);
comment on table public.objects is 'Объект — стройка: название и адрес.';

-- ----------------------------------------------------------------------------
-- Задачи по объектам
-- ----------------------------------------------------------------------------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title, ' ' || chr(9) || chr(10) || chr(13) || chr(160))) between 1 and 200),
  description  text not null default '' check (char_length(description) <= 5000),
  object_id    uuid not null,
  executor_id  uuid not null,
  status       public.task_status not null default 'new',
  -- Автор подставляется самой базой из текущего пользователя; клиент задать его не может.
  author_id    uuid not null default auth.uid(),
  created_at   timestamptz not null default now(),

  -- Удалили объект — удалились и его задачи. Журнал статусов при этом остаётся (см. ниже).
  constraint tasks_object_id_fkey   foreign key (object_id)   references public.objects (id)  on delete cascade,
  -- Пользователя, у которого есть задачи, удалить нельзя: сначала задачи нужно передать другому.
  constraint tasks_executor_id_fkey foreign key (executor_id) references public.profiles (id) on delete restrict,
  constraint tasks_author_id_fkey   foreign key (author_id)   references public.profiles (id) on delete restrict
);
comment on table public.tasks is 'Задача по объекту. Статус меняется только функцией change_task_status().';

create index tasks_object_id_idx          on public.tasks (object_id);
create index tasks_executor_id_status_idx on public.tasks (executor_id, status);
create index tasks_author_id_idx          on public.tasks (author_id);

-- ----------------------------------------------------------------------------
-- Правила переходов между статусами — данные, а не код: их читают и база
-- (функция change_task_status), и интерфейс (чтобы показать только нужные кнопки).
-- ----------------------------------------------------------------------------
create table public.task_transitions (
  from_status       public.task_status not null,
  to_status         public.task_status not null,
  -- Кто может выполнить переход: любой постановщик (manager)
  -- или исполнитель, назначенный на эту задачу (assignee).
  actor             text not null check (actor in ('manager', 'assignee')),
  comment_required  boolean not null default false,
  primary key (from_status, to_status)
);
comment on table public.task_transitions is 'Разрешённые переходы статусов задачи. Всё, чего здесь нет, запрещено.';

-- ----------------------------------------------------------------------------
-- Журнал смены статусов. Только дописывается — менять и удалять его нельзя.
-- ----------------------------------------------------------------------------
create table public.task_status_history (
  id           bigint generated always as identity primary key,
  -- Намеренно без внешнего ключа: если задачу удалили, запись о том, что с ней
  -- происходило, остаётся в базе. Никакой пользователь через API её не увидит и не сотрёт.
  task_id      uuid not null,
  from_status  public.task_status,              -- NULL = задача только что создана
  to_status    public.task_status not null,
  actor_id     uuid not null,                   -- кто выполнил действие
  actor_name   text not null,                   -- его имя на тот момент (журнал не зависит от переименований)
  comment      text check (comment is null or char_length(comment) between 1 and 2000),
  created_at   timestamptz not null default now()
);
comment on table public.task_status_history is 'Журнал смены статусов: кто, когда, из какого статуса в какой, комментарий. Неизменяемый.';

create index task_status_history_task_idx on public.task_status_history (task_id, created_at, id);
