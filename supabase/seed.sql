-- ============================================================================
-- Демо-данные: 3 объекта и 10 задач во всех статусах, с историей смены статусов.
--
-- Запуск: после применения миграций и создания пользователей (см. README, шаги 3–5).
-- Нужен минимум 1 постановщик и 2 исполнителя — берутся первые по дате создания (при равной дате — по имени).
-- Паролей и ключей в этом файле нет.
--
-- Скрипт выполняется от имени владельца базы (SQL Editor в панели Supabase или psql).
-- Чтобы история получила реальные даты «из прошлого», на время загрузки отключаются
-- пользовательские триггеры (создание записи журнала и страж статуса); после загрузки
-- они включаются обратно. Всё происходит в одной транзакции: при ошибке откатывается целиком.
-- Повторный запуск ничего не дублирует: если объекты уже есть, скрипт ничего не делает.
-- ============================================================================

do $seed$
declare
  managers   uuid[];
  executors  uuid[];
  m1 uuid;
  m2 uuid;
  e1 uuid;
  e2 uuid;
  obj_ids    uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];

  -- by: executor = исполнитель задачи, m1/m2 = первый/второй постановщик.
  objs jsonb := $json$[
    {"name": "ЖК «Северный», корпус 2", "address": "Москва, ул. Полярная, 25", "days_ago": 40},
    {"name": "Складской комплекс «Домодедово»", "address": "Московская обл., г. Домодедово, ул. Промышленная, 7", "days_ago": 25},
    {"name": "Реконструкция офиса на Тверской", "address": "Москва, ул. Тверская, 12, 4 этаж", "days_ago": 18}
  ]$json$;

  tasks jsonb := $json$[
    {"object": 1, "executor": 1, "days_ago": 12,
     "title": "Залить фундаментную плиту секции Б",
     "description": "Бетон B25, толщина плиты 400 мм. Перед заливкой проверить арматурный каркас и закладные. Отобрать контрольные образцы.",
     "steps": [
       {"to": "in_progress", "by": "executor", "after_hours": 5},
       {"to": "in_review",   "by": "executor", "after_hours": 30, "comment": "Плита залита, образцы бетона отправлены в лабораторию."},
       {"to": "accepted",    "by": "m2",       "after_hours": 20, "comment": "Принято, протокол испытаний приложен к акту."}
     ]},
    {"object": 1, "executor": 1, "days_ago": 9,
     "title": "Смонтировать опалубку перекрытия 3 этажа",
     "description": "Оси 1–8, отметка +9.600. Проверить геометрию и жёсткость стоек перед армированием.",
     "steps": [
       {"to": "in_progress", "by": "executor", "after_hours": 4},
       {"to": "in_review",   "by": "executor", "after_hours": 27},
       {"to": "rework",      "by": "m1",       "after_hours": 9,  "comment": "Не хватает подпорок в осях 4–6, прогиб больше допустимого. Доработать."},
       {"to": "in_progress", "by": "executor", "after_hours": 6},
       {"to": "in_review",   "by": "executor", "after_hours": 20, "comment": "Подпорки добавлены, прогиб в норме. Замеры в приложении."}
     ]},
    {"object": 1, "executor": 2, "days_ago": 7,
     "title": "Устранить протечки в кровле секции А",
     "description": "Протечки у парапета и в районе водосточных воронок. Переклеить швы мембраны, проверить примыкания.",
     "steps": [
       {"to": "in_progress", "by": "executor", "after_hours": 6},
       {"to": "in_review",   "by": "executor", "after_hours": 22, "comment": "Швы переклеены, воронки промазаны."},
       {"to": "rework",      "by": "m1",       "after_hours": 10, "comment": "Две зоны у парапета проклеены не до конца. Переделать и приложить фото после ливня или проливки."}
     ]},
    {"object": 1, "executor": 2, "days_ago": 6,
     "title": "Проверить армирование колонн 2 этажа",
     "description": "Сверить шаг хомутов и защитный слой с проектом, составить акт скрытых работ.",
     "steps": [
       {"to": "in_progress", "by": "executor", "after_hours": 3}
     ]},
    {"object": 1, "executor": 1, "days_ago": 2,
     "title": "Подготовить акт скрытых работ по гидроизоляции",
     "description": "Собрать фото, паспорта материалов и исполнительную схему. Акт нужен до закрытия слоя.",
     "steps": []},

    {"object": 2, "executor": 2, "days_ago": 8,
     "title": "Выровнять бетонное основание пола в зоне А",
     "description": "Допуск по ровности — 3 мм на 2 м. После шлифовки проверить рейкой и записать замеры.",
     "steps": [
       {"to": "in_progress", "by": "executor", "after_hours": 10}
     ]},
    {"object": 2, "executor": 2, "days_ago": 5,
     "title": "Согласовать поставку секционных ворот",
     "description": "Сравнить два коммерческих предложения, уточнить сроки изготовления и условия монтажа.",
     "steps": [
       {"to": "in_progress", "by": "executor", "after_hours": 3},
       {"to": "in_review",   "by": "executor", "after_hours": 40, "comment": "Выбрал второе предложение: на 12 дней быстрее, цена сопоставима. Сравнение во вложении."}
     ]},
    {"object": 2, "executor": 2, "days_ago": 1, "author": 2,
     "title": "Смонтировать стеллажи в зоне хранения",
     "description": "Схема расстановки в проекте, лист АР-14. Крепление к полу анкерами.",
     "steps": []},

    {"object": 3, "executor": 1, "days_ago": 14, "author": 2,
     "title": "Демонтировать перегородки на 4 этаже",
     "description": "Снести перегородки между помещениями 401–405, несущие стены не трогать. Вывезти мусор.",
     "steps": [
       {"to": "in_progress", "by": "executor", "after_hours": 8},
       {"to": "in_review",   "by": "executor", "after_hours": 52, "comment": "Демонтаж завершён, мусор вывезен, акт вывоза приложен."},
       {"to": "accepted",    "by": "m1",       "after_hours": 18}
     ]},
    {"object": 3, "executor": 1, "days_ago": 3,
     "title": "Согласовать проект вентиляции с эксплуатацией",
     "description": "Отправить проект в службу эксплуатации здания, собрать замечания и внести правки.",
     "steps": []}
  ]$json$;

  o record;
  t record;
  s record;
  v_task_id    uuid;
  v_executor   uuid;
  v_author     uuid;
  v_actor      uuid;
  v_actor_name text;
  v_created    timestamptz;
  v_time       timestamptz;
  v_status     public.task_status;
  v_to         public.task_status;
begin
  if exists (select 1 from public.objects) then
    raise notice 'В базе уже есть объекты — демо-данные не добавлены.';
    return;
  end if;

  select array_agg(p.id order by p.created_at, p.full_name, p.id) into managers  from public.profiles p where p.role = 'manager';
  select array_agg(p.id order by p.created_at, p.full_name, p.id) into executors from public.profiles p where p.role = 'executor';

  if coalesce(array_length(managers, 1), 0) < 1 or coalesce(array_length(executors, 1), 0) < 2 then
    raise exception 'Для демо-данных нужен минимум 1 постановщик и 2 исполнителя. Сначала создайте пользователей (README, шаг 5).';
  end if;

  m1 := managers[1];
  m2 := coalesce(managers[2], managers[1]);
  e1 := executors[1];
  e2 := executors[2];

  -- На время загрузки отключаем триггеры (журнал пишем сами, с историческими датами).
  alter table public.tasks               disable trigger user;
  alter table public.task_status_history disable trigger user;

  for o in select value, ordinality from jsonb_array_elements(objs) with ordinality loop
    insert into public.objects (id, name, address, created_at)
    values (
      obj_ids[o.ordinality::int],
      o.value ->> 'name',
      o.value ->> 'address',
      now() - make_interval(days => (o.value ->> 'days_ago')::int)
    );
  end loop;

  for t in select value from jsonb_array_elements(tasks) loop
    v_task_id  := gen_random_uuid();
    v_executor := case (t.value ->> 'executor')::int when 1 then e1 else e2 end;
    v_author   := case coalesce((t.value ->> 'author')::int, 1) when 2 then m2 else m1 end;
    v_created  := now() - make_interval(days => (t.value ->> 'days_ago')::int);
    v_time     := v_created;
    v_status   := 'new';

    -- Первая запись журнала — создание задачи.
    select p.full_name into v_actor_name from public.profiles p where p.id = v_author;
    insert into public.task_status_history (task_id, from_status, to_status, actor_id, actor_name, created_at)
    values (v_task_id, null, 'new', v_author, coalesce(v_actor_name, ''), v_time);

    -- Дальше — шаги жизненного цикла, каждый со своим временем.
    for s in select value from jsonb_array_elements(coalesce(t.value -> 'steps', '[]'::jsonb)) loop
      v_time  := least(v_time + make_interval(hours => (s.value ->> 'after_hours')::int), now());
      v_to    := (s.value ->> 'to')::public.task_status;
      v_actor := case s.value ->> 'by' when 'executor' then v_executor when 'm2' then m2 else m1 end;

      select p.full_name into v_actor_name from public.profiles p where p.id = v_actor;
      insert into public.task_status_history (task_id, from_status, to_status, actor_id, actor_name, comment, created_at)
      values (v_task_id, v_status, v_to, v_actor, coalesce(v_actor_name, ''), nullif(s.value ->> 'comment', ''), v_time);

      v_status := v_to;
    end loop;

    insert into public.tasks (id, title, description, object_id, executor_id, status, author_id, created_at)
    values (
      v_task_id,
      t.value ->> 'title',
      t.value ->> 'description',
      obj_ids[(t.value ->> 'object')::int],
      v_executor,
      v_status,
      v_author,
      v_created
    );
  end loop;

  alter table public.tasks               enable trigger user;
  alter table public.task_status_history enable trigger user;

  raise notice 'Демо-данные добавлены: объектов — 3, задач — 10.';
end
$seed$;
