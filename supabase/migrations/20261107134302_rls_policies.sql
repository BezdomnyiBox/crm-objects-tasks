-- ============================================================================
-- Миграция 3/4: права доступа на уровне базы (RLS).
--
-- Принцип: по умолчанию закрыто всё, дальше выдаём только необходимый минимум.
-- Эти правила действуют, даже если обращаться к API напрямую, минуя интерфейс.
--
-- Защита в два слоя:
--   1) GRANT — какие операции и над какими колонками вообще разрешены роли;
--   2) RLS-политики — какие именно строки видит и меняет каждый пользователь.
-- ============================================================================

-- ---- 1. RLS включён на всех таблицах ---------------------------------------
alter table public.profiles            enable row level security;
alter table public.objects             enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_status_history enable row level security;
alter table public.task_transitions    enable row level security;

-- ---- 2. Снимаем права, которые Supabase выдаёт новым таблицам «по умолчанию» -
-- Роль anon — это незалогиненный посетитель; authenticated — любой вошедший пользователь.
revoke all on table
  public.profiles,
  public.objects,
  public.tasks,
  public.task_status_history,
  public.task_transitions
from public, anon, authenticated;

revoke all on all sequences in schema public from public, anon, authenticated;

-- ---- 3. Выдаём минимум вошедшим пользователям ------------------------------
-- Профили, справочник переходов и журнал: только чтение.
-- Менять профили и роли через API нельзя. Писать в журнал через API нельзя вообще:
-- записи в него добавляет только база (триггер и функция change_task_status).
grant select on public.profiles            to authenticated;
grant select on public.task_transitions    to authenticated;
grant select on public.task_status_history to authenticated;

-- Объекты: читать/удалять строки + записывать только название и адрес.
grant select, delete on public.objects to authenticated;
grant insert (name, address), update (name, address) on public.objects to authenticated;

-- Задачи: читать/удалять строки + записывать только перечисленные поля.
-- Колонок status, author_id, created_at в списке нет — задать или изменить их напрямую нельзя:
-- статус меняется только через change_task_status(), автор и дата проставляются базой.
grant select, delete on public.tasks to authenticated;
grant insert (title, description, object_id, executor_id),
      update (title, description, object_id, executor_id)
  on public.tasks to authenticated;

-- ---- 4. Политики строк ------------------------------------------------------
-- (select ...) вокруг функций — приём Supabase: значение считается один раз на запрос, а не на каждую строку.

-- Профили: каждый видит себя и постановщиков (нужны, чтобы показать «автор задачи»);
-- постановщик видит всех (ему нужен список исполнителей). Исполнитель не видит других исполнителей.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or role = 'manager'
    or (select private.is_manager())
  );

-- Справочник переходов: читают все вошедшие (интерфейс по нему рисует кнопки).
create policy task_transitions_select on public.task_transitions
  for select to authenticated
  using (true);

-- Объекты: постановщик видит все; исполнитель — только те, где у него есть задачи.
create policy objects_select on public.objects
  for select to authenticated
  using (
    (select private.is_manager())
    or exists (
      select 1
      from public.tasks t
      where t.object_id = objects.id
        and t.executor_id = (select auth.uid())
    )
  );

-- Создавать, менять и удалять объекты может только постановщик.
create policy objects_insert on public.objects
  for insert to authenticated
  with check ((select private.is_manager()));

create policy objects_update on public.objects
  for update to authenticated
  using ((select private.is_manager()))
  with check ((select private.is_manager()));

create policy objects_delete on public.objects
  for delete to authenticated
  using ((select private.is_manager()));

-- Задачи: постановщик видит все; исполнитель — только назначенные на него.
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    (select private.is_manager())
    or executor_id = (select auth.uid())
  );

-- Создавать, редактировать и удалять задачи может только постановщик.
-- Автором можно быть только самому себе.
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    (select private.is_manager())
    and author_id = (select auth.uid())
  );

create policy tasks_update on public.tasks
  for update to authenticated
  using ((select private.is_manager()))
  with check ((select private.is_manager()));

create policy tasks_delete on public.tasks
  for delete to authenticated
  using ((select private.is_manager()));

-- Журнал: постановщик видит весь; исполнитель — только по своим задачам.
-- Политик на запись нет вообще — писать в журнал через API нельзя никому.
create policy task_status_history_select on public.task_status_history
  for select to authenticated
  using (
    (select private.is_manager())
    or exists (
      select 1
      from public.tasks t
      where t.id = task_status_history.task_id
        and t.executor_id = (select auth.uid())
    )
  );
