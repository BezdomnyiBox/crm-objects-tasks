// Проверка демо-данных: seed.sql должен давать согласованные данные, которые выглядят так, как задумано.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { ID, ROOT, as, createDb, createUsers, rejects } from './helpers.mjs';

let db;
let seedSql;

before(async () => {
  seedSql = await readFile(path.join(ROOT, 'supabase/seed.sql'), 'utf8');
  db = await createDb();
});

after(async () => {
  await db?.close();
});

describe('seed.sql', () => {
  it('без пользователей не работает и объясняет почему', async () => {
    await rejects(db.exec(seedSql), { message: /минимум 1 постановщик и 2 исполнителя/ });
    assert.equal((await db.query('select count(*)::int as n from public.objects')).rows[0].n, 0);
  });

  it('добавляет 3 объекта и 10 задач во всех пяти статусах', async () => {
    await createUsers(db);
    await db.exec(seedSql);

    assert.equal((await db.query('select count(*)::int as n from public.objects')).rows[0].n, 3);
    assert.equal((await db.query('select count(*)::int as n from public.tasks')).rows[0].n, 10);

    const statuses = await db.query('select distinct status from public.tasks order by status');
    assert.deepEqual(statuses.rows.map((r) => r.status).sort(), ['accepted', 'in_progress', 'in_review', 'new', 'rework']);
  });

  it('триггеры после загрузки снова включены', async () => {
    const r = await db.query(
      `select tgname, tgenabled from pg_trigger
       where tgrelid in ('public.tasks'::regclass, 'public.task_status_history'::regclass) and not tgisinternal`,
    );
    assert.deepEqual(
      r.rows.map((row) => row.tgname).sort(),
      ['history_immutable', 'tasks_check_assignee', 'tasks_guard', 'tasks_log_created'],
    );
    for (const row of r.rows) assert.equal(row.tgenabled, 'O', `триггер ${row.tgname} должен быть включён`);
  });

  it('статус каждой задачи = последняя запись журнала, переходы только разрешённые', async () => {
    const last = await db.query(
      `select t.id, t.status,
              (select h.to_status from public.task_status_history h
               where h.task_id = t.id order by h.created_at desc, h.id desc limit 1) as last_status
       from public.tasks t`,
    );
    for (const row of last.rows) assert.equal(row.status, row.last_status);

    const bad = await db.query(
      `select h.id from public.task_status_history h
       where not (
         (h.from_status is null and h.to_status = 'new')
         or exists (select 1 from public.task_transitions r where r.from_status = h.from_status and r.to_status = h.to_status)
       )`,
    );
    assert.equal(bad.rows.length, 0);

    // цепочка внутри задачи непрерывна: «в» предыдущей записи = «из» следующей
    const chain = await db.query(
      `select count(*)::int as n from (
         select h.from_status, lag(h.to_status) over (partition by h.task_id order by h.created_at, h.id) as prev_to, h.id
         from public.task_status_history h
       ) x where x.prev_to is not null and x.from_status is distinct from x.prev_to`,
    );
    assert.equal(chain.rows[0].n, 0);
  });

  it('история с реальными датами из прошлого, время не убывает, ничего «из будущего»', async () => {
    const r = await db.query(
      `select count(*)::int as future from public.task_status_history where created_at > now() + interval '1 minute'`,
    );
    assert.equal(r.rows[0].future, 0);
    const spread = await db.query(
      `select (max(created_at) - min(created_at)) > interval '5 days' as wide from public.task_status_history`,
    );
    assert.equal(spread.rows[0].wide, true);
  });

  it('каждый исполнитель видит только свои задачи и два объекта из трёх', async () => {
    const [e1, e2] = (
      await db.query(`select id from public.profiles where role = 'executor' order by created_at, full_name, id limit 2`)
    ).rows.map((r) => r.id);

    for (const who of [e1, e2]) {
      const tasks = await as(db, who).query('select executor_id from public.tasks');
      assert.ok(tasks.rows.length > 0);
      assert.ok(tasks.rows.every((r) => r.executor_id === who));
      assert.equal((await as(db, who).query('select id from public.objects')).rows.length, 2);
    }

    const manager = await as(db, ID.m1).query('select id from public.objects');
    assert.equal(manager.rows.length, 3);
  });

  it('демо-данные работают с живой функцией: задачу «На доработке» можно вернуть в работу', async () => {
    const task = (await db.query(`select id, executor_id from public.tasks where status = 'rework' limit 1`)).rows[0];
    const r = await as(db, task.executor_id).exec(
      `select status from public.change_task_status($1::uuid, 'in_progress')`,
      [task.id],
    );
    assert.equal(r.rows[0].status, 'in_progress');
  });

  it('повторный запуск ничего не дублирует', async () => {
    await db.exec(seedSql);
    assert.equal((await db.query('select count(*)::int as n from public.objects')).rows[0].n, 3);
    assert.equal((await db.query('select count(*)::int as n from public.tasks')).rows[0].n, 10);
  });
});
