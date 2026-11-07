-- ============================================================================
-- Миграция 4/4: жизненный цикл задачи и неизменяемый журнал.
--
-- Статус задачи можно изменить ТОЛЬКО одним способом — вызвать функцию
-- public.change_task_status(). Она проверяет, кто вызывает, назначен ли он на задачу,
-- разрешён ли переход и нужен ли комментарий, а затем в одной транзакции меняет статус
-- и дописывает запись в журнал.
--
-- Три независимых замка, чтобы обойти правила было нечем:
--   1) у ролей API нет права записи в колонку status (см. миграцию 3);
--   2) триггер tasks_guard блокирует любое изменение статуса мимо функции;
--   3) сама функция проверяет переход по таблице task_transitions.
-- ============================================================================

-- ---- Матрица переходов (из ТЗ) ---------------------------------------------
insert into public.task_transitions (from_status, to_status, actor, comment_required) values
  ('new',         'in_progress', 'assignee', false),  -- Новая → В работе: назначенный исполнитель
  ('in_progress', 'in_review',   'assignee', false),  -- В работе → На проверке: назначенный исполнитель
  ('in_review',   'accepted',    'manager',  false),  -- На проверке → Принята: постановщик
  ('in_review',   'rework',      'manager',  true),   -- На проверке → На доработке: постановщик, комментарий обязателен
  ('rework',      'in_progress', 'assignee', false);  -- На доработке → В работе: назначенный исполнитель
-- Создание («— → Новая») обрабатывает триггер ниже. Любые другие переходы запрещены.

-- Русские названия статусов — для понятных сообщений об ошибках.
create function private.status_label(s public.task_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'new'         then 'Новая'
    when 'in_progress' then 'В работе'
    when 'in_review'   then 'На проверке'
    when 'accepted'    then 'Принята'
    when 'rework'      then 'На доработке'
  end;
$$;

-- ---- Триггер: исполнителем можно назначить только исполнителя ---------------
create function private.tasks_check_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.executor_id and p.role = 'executor'
  ) then
    raise exception 'Исполнителем можно назначить только пользователя с ролью «Исполнитель»'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tasks_check_assignee
  before insert or update of executor_id on public.tasks
  for each row execute function private.tasks_check_assignee();

-- ---- Триггер-страж: статус — только через функцию; автор и дата — неизменны --
create function private.tasks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'new' then
      raise exception 'Задача создаётся только в статусе «Новая»' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.id <> old.id or new.author_id <> old.author_id or new.created_at <> old.created_at then
    raise exception 'Идентификатор, автора и дату создания задачи менять нельзя' using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and coalesce(current_setting('app.task_status_rpc', true), '') <> 'on' then
    raise exception 'Статус задачи меняется только через change_task_status()' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger tasks_guard
  before insert or update on public.tasks
  for each row execute function private.tasks_guard();

-- ---- Триггер: создание задачи — первая запись журнала ----------------------
create function private.tasks_log_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select p.full_name into v_name from public.profiles p where p.id = new.author_id;

  insert into public.task_status_history (task_id, from_status, to_status, actor_id, actor_name)
  values (new.id, null, new.status, new.author_id, coalesce(v_name, ''));

  return new;
end;
$$;

create trigger tasks_log_created
  after insert on public.tasks
  for each row execute function private.tasks_log_created();

-- ---- Триггер: журнал нельзя менять и удалять — ни через API, ни напрямую ----
create function private.history_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Журнал статусов нельзя изменять или удалять' using errcode = '42501';
end;
$$;

create trigger history_immutable
  before update or delete on public.task_status_history
  for each row execute function private.history_immutable();

-- ---- Функция смены статуса — единственная «дверь» ---------------------------
create function public.change_task_status(
  p_task_id     uuid,
  p_new_status  public.task_status,
  p_comment     text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_role     public.app_role;
  v_name     text;
  v_task     public.tasks;
  v_rule     public.task_transitions;
  -- Комментарий из одних пробелов, табов и переводов строк считается пустым.
  v_comment  text := nullif(btrim(coalesce(p_comment, ''), ' ' || chr(9) || chr(10) || chr(13) || chr(160)), '');
begin
  -- 1. Кто вызывает.
  if v_uid is null then
    raise exception 'Требуется вход в систему' using errcode = '28000';
  end if;

  select p.role, p.full_name into v_role, v_name
  from public.profiles p
  where p.id = v_uid;

  if v_role is null then
    raise exception 'Профиль пользователя не найден' using errcode = '42501';
  end if;

  -- 2. Находим задачу и блокируем строку: два одновременных нажатия не обгонят друг друга.
  select t.* into v_task
  from public.tasks t
  where t.id = p_task_id
  for update;

  -- Исполнитель не должен даже узнать, что чужая задача существует:
  -- для него ответ тот же, что и для несуществующей.
  if not found or (v_role = 'executor' and v_task.executor_id <> v_uid) then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;

  -- 3. Есть ли такой переход в таблице разрешённых.
  select r.* into v_rule
  from public.task_transitions r
  where r.from_status = v_task.status
    and r.to_status = p_new_status;

  if not found then
    raise exception 'Переход из «%» в «%» запрещён',
      private.status_label(v_task.status), private.status_label(p_new_status)
      using errcode = 'P0001';
  end if;

  -- 4. Имеет ли право именно этот пользователь.
  if v_rule.actor = 'manager' and v_role <> 'manager' then
    raise exception 'Этот переход может выполнить только постановщик' using errcode = '42501';
  end if;

  if v_rule.actor = 'assignee' and (v_role <> 'executor' or v_task.executor_id <> v_uid) then
    raise exception 'Этот переход может выполнить только назначенный исполнитель' using errcode = '42501';
  end if;

  -- 5. Комментарий там, где он обязателен.
  if v_rule.comment_required and v_comment is null then
    raise exception 'Для этого перехода нужен комментарий' using errcode = '23514';
  end if;

  -- 6. Меняем статус (стражу сообщаем, что это санкционированный путь) и пишем в журнал.
  perform set_config('app.task_status_rpc', 'on', true);

  update public.tasks t
  set status = v_rule.to_status
  where t.id = p_task_id
  returning t.* into v_task;

  perform set_config('app.task_status_rpc', 'off', true);

  insert into public.task_status_history (task_id, from_status, to_status, actor_id, actor_name, comment)
  values (p_task_id, v_rule.from_status, v_rule.to_status, v_uid, v_name, v_comment);

  return v_task;
end;
$$;

comment on function public.change_task_status(uuid, public.task_status, text) is
  'Единственный способ сменить статус задачи: проверяет права и переход, пишет в журнал.';

-- Вызывать функцию могут только вошедшие пользователи; гостям — нет.
revoke all on function public.change_task_status(uuid, public.task_status, text) from public, anon;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;

-- Служебные функции — только для самой базы.
revoke all on function private.status_label(public.task_status) from public;
revoke all on function private.tasks_check_assignee() from public;
revoke all on function private.tasks_guard() from public;
revoke all on function private.tasks_log_created() from public;
revoke all on function private.history_immutable() from public;
