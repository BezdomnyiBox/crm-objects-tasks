// Проверка правил доступа на уровне базы. Каждый тест — это «атака» или законное действие,
// выполненное тем же способом, что и обращение к Supabase API напрямую (роль + JWT), мимо интерфейса.
//
// Запуск: npm run test:db  (база поднимается в памяти, облако не нужно)

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ID, NAME, as, createDb, createUsers, forceStatus, ids, rejects } from './helpers.mjs';

const STATUSES = ['new', 'in_progress', 'in_review', 'accepted', 'rework'];

// Матрица из ТЗ: «из>в» → кто может выполнить переход.
const MATRIX = {
  'new>in_progress': 'assignee',
  'in_progress>in_review': 'assignee',
  'in_review>accepted': 'manager',
  'in_review>rework': 'manager',
  'rework>in_progress': 'assignee',
};

let db;
const O = {}; // объекты
const T = {}; // задачи

before(async () => {
  db = await createDb();
  await createUsers(db);

  // Данные создаём «как в жизни» — от имени постановщика и через функцию смены статуса.
  const m1 = as(db, ID.m1);
  const addObject = async (name, address) =>
    (await m1.exec(`insert into public.objects (name, address) values ($1, $2) returning id`, [name, address])).rows[0].id;
  const addTask = async (title, objectId, executorId) =>
    (
      await m1.exec(
        `insert into public.tasks (title, description, object_id, executor_id) values ($1, 'Описание', $2, $3) returning id`,
        [title, objectId, executorId],
      )
    ).rows[0].id;
  const step = (who, taskId, to, comment = null) =>
    as(db, who).exec(`select public.change_task_status($1::uuid, $2::public.task_status, $3)`, [taskId, to, comment]);

  O.o1 = await addObject('ЖК «Северный»', 'Москва, ул. Полярная, 25');
  O.o2 = await addObject('Склад в Домодедово', 'Домодедово, ул. Промышленная, 7');
  O.o3 = await addObject('Офис на Тверской', 'Москва, ул. Тверская, 12');

  T.t1 = await addTask('Залить плиту', O.o1, ID.e1); //        e1, «Новая»
  T.t2 = await addTask('Смонтировать опалубку', O.o1, ID.e2); // e2, «Новая»
  T.t3 = await addTask('Выровнять пол', O.o2, ID.e2); //        e2, «На проверке»
  T.t4 = await addTask('Демонтаж перегородок', O.o3, ID.e1); // e1, «В работе»

  await step(ID.e2, T.t3, 'in_progress');
  await step(ID.e2, T.t3, 'in_review');
  await step(ID.e1, T.t4, 'in_progress');
});

after(async () => {
  await db?.close();
});

// ---------------------------------------------------------------------------------------------
describe('Гость (без входа)', () => {
  for (const table of ['profiles', 'objects', 'tasks', 'task_status_history', 'task_transitions']) {
    it(`не может читать ${table}`, () =>
      rejects(as(db, null).query(`select * from public.${table}`), { code: '42501' }));
  }

  it('не может создать объект', () =>
    rejects(as(db, null).query(`insert into public.objects (name, address) values ('x', 'y')`), { code: '42501' }));

  it('не может вызвать смену статуса', () =>
    rejects(as(db, null).query(`select public.change_task_status($1::uuid, 'in_progress')`, [T.t1]), {
      code: '42501',
    }));

  it('не может обратиться к служебной схеме private', () =>
    rejects(as(db, null).query('select private.is_manager()'), { code: '42501' }));
});

// ---------------------------------------------------------------------------------------------
describe('Исполнитель: что он видит', () => {
  it('только свои задачи', async () => {
    const e1 = await as(db, ID.e1).query('select id from public.tasks');
    const e2 = await as(db, ID.e2).query('select id from public.tasks');
    assert.deepEqual(ids(e1.rows), [T.t1, T.t4].sort());
    assert.deepEqual(ids(e2.rows), [T.t2, T.t3].sort());
  });

  it('чужую задачу не получить и по прямому адресу', async () => {
    const r = await as(db, ID.e1).query('select * from public.tasks where id = $1', [T.t2]);
    assert.equal(r.rows.length, 0);
  });

  it('только объекты, в которых у него есть задачи', async () => {
    const e1 = await as(db, ID.e1).query('select id from public.objects');
    const e2 = await as(db, ID.e2).query('select id from public.objects');
    assert.deepEqual(ids(e1.rows), [O.o1, O.o3].sort());
    assert.deepEqual(ids(e2.rows), [O.o1, O.o2].sort());
  });

  it('журнал — только по своим задачам', async () => {
    const r = await as(db, ID.e1).query('select distinct task_id as id from public.task_status_history');
    assert.deepEqual(ids(r.rows), [T.t1, T.t4].sort());
  });

  it('профили: себя и постановщиков, но не других исполнителей', async () => {
    const r = await as(db, ID.e1).query('select id from public.profiles');
    assert.deepEqual(ids(r.rows), [ID.e1, ID.m1, ID.m2].sort());
  });

  it('исполнитель без задач не видит ничего', async () => {
    const e3 = as(db, ID.e3);
    assert.equal((await e3.query('select id from public.tasks')).rows.length, 0);
    assert.equal((await e3.query('select id from public.objects')).rows.length, 0);
    assert.equal((await e3.query('select id from public.task_status_history')).rows.length, 0);
  });

  it('справочник переходов виден (по нему рисуются кнопки)', async () => {
    const r = await as(db, ID.e1).query('select * from public.task_transitions');
    assert.equal(r.rows.length, 5);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Исполнитель: чего он не может', () => {
  const e1 = () => as(db, ID.e1);

  it('создать объект', () =>
    rejects(e1().query(`insert into public.objects (name, address) values ('x', 'y')`), { code: '42501' }));

  it('создать задачу', () =>
    rejects(
      e1().query(`insert into public.tasks (title, object_id, executor_id) values ('x', $1, $2)`, [O.o1, ID.e1]),
      { code: '42501' },
    ));

  it('переписать свою или чужую задачу (изменяется 0 строк)', async () => {
    const own = await e1().query(`update public.tasks set title = 'взлом', executor_id = $2 where id = $1`, [T.t1, ID.e2]);
    const foreign = await e1().query(`update public.tasks set title = 'взлом' where id = $1`, [T.t2]);
    assert.equal(own.affectedRows, 0);
    assert.equal(foreign.affectedRows, 0);

    const check = await db.query(`select title, executor_id from public.tasks where id in ($1, $2)`, [T.t1, T.t2]);
    assert.ok(check.rows.every((r) => r.title !== 'взлом'));
    assert.equal((await db.query('select executor_id from public.tasks where id = $1', [T.t1])).rows[0].executor_id, ID.e1);
  });

  it('удалить задачи и объекты (удаляется 0 строк)', async () => {
    const tasks = await e1().query('delete from public.tasks');
    const objects = await e1().query('delete from public.objects');
    assert.equal(tasks.affectedRows, 0);
    assert.equal(objects.affectedRows, 0);
    assert.ok((await db.query('select count(*)::int as n from public.tasks')).rows[0].n >= 4);
    assert.ok((await db.query('select count(*)::int as n from public.objects')).rows[0].n >= 3);
  });

  it('поменять статус своей задачи напрямую, минуя функцию', () =>
    rejects(e1().query(`update public.tasks set status = 'accepted' where id = $1`, [T.t1]), { code: '42501' }));

  it('поменять статус напрямую, даже подделав «пропуск» для триггера-стража', () =>
    rejects(
      e1().session(async (q) => {
        await q(`select set_config('app.task_status_rpc', 'on', true)`);
        await q(`update public.tasks set status = 'accepted' where id = $1`, [T.t1]);
      }),
      { code: '42501' },
    ));

  it('записать в журнал', () =>
    rejects(
      e1().query(
        `insert into public.task_status_history (task_id, from_status, to_status, actor_id, actor_name)
         values ($1, 'new', 'accepted', $2, 'подделка')`,
        [T.t1, ID.e1],
      ),
      { code: '42501' },
    ));

  it('изменить запись журнала', () =>
    rejects(e1().query(`update public.task_status_history set comment = 'правка'`), { code: '42501' }));

  it('удалить запись журнала', () =>
    rejects(e1().query('delete from public.task_status_history'), { code: '42501' }));

  it('повысить себя до постановщика', () =>
    rejects(e1().query(`update public.profiles set role = 'manager' where id = $1`, [ID.e1]), { code: '42501' }));

  it('создать или удалить профиль', async () => {
    await rejects(e1().query(`insert into public.profiles (id, role) values (gen_random_uuid(), 'manager')`), { code: '42501' });
    await rejects(e1().query('delete from public.profiles'), { code: '42501' });
  });

  it('изменить правила переходов', async () => {
    await rejects(
      e1().query(`insert into public.task_transitions (from_status, to_status, actor) values ('new', 'accepted', 'assignee')`),
      { code: '42501' },
    );
    await rejects(e1().query(`update public.task_transitions set actor = 'assignee'`), { code: '42501' });
    await rejects(e1().query('delete from public.task_transitions'), { code: '42501' });
  });

  it('сменить статус чужой задачи (ответ — «не найдена»)', () =>
    rejects(
      e1().query(`select public.change_task_status($1::uuid, 'in_progress')`, [T.t2]),
      { code: 'P0002', message: /не найдена/ },
    ));

  it('вызвать служебные функции напрямую', async () => {
    await rejects(e1().query('select private.handle_new_user()'), { code: '42501' });
    await rejects(e1().query('select private.tasks_guard()'), { code: '42501' });
  });
});

// ---------------------------------------------------------------------------------------------
describe('Переходы статусов: каждая пара «из → в» для трёх видов пользователей', () => {
  let tm; // отдельная задача для проверки матрицы: e1 — исполнитель

  before(async () => {
    tm = (
      await as(db, ID.m1).exec(
        `insert into public.tasks (title, object_id, executor_id) values ('Проверка матрицы', $1, $2) returning id`,
        [O.o1, ID.e1],
      )
    ).rows[0].id;
  });

  after(async () => {
    await db.query('delete from public.tasks where id = $1', [tm]); // чтобы не портить проверку целостности ниже
  });

  const call = (who, to, comment = 'комментарий') =>
    as(db, who).query(`select status from public.change_task_status($1::uuid, $2::public.task_status, $3)`, [tm, to, comment]);

  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const rule = MATRIX[`${from}>${to}`];
      const title = `${from} → ${to}: ${rule === 'assignee' ? 'разрешён исполнителю' : rule === 'manager' ? 'разрешён постановщику' : 'запрещён'}`;

      it(title, async () => {
        await forceStatus(db, tm, from);

        // Назначенный исполнитель (e1)
        if (rule === 'assignee') assert.equal((await call(ID.e1, to)).rows[0].status, to);
        else if (rule === 'manager') await rejects(call(ID.e1, to), { code: '42501' });
        else await rejects(call(ID.e1, to), { code: 'P0001', message: /запрещён/ });

        // Чужой исполнитель (e2): задачи для него «не существует» при любом переходе
        await rejects(call(ID.e2, to), { code: 'P0002' });

        // Постановщик
        if (rule === 'manager') assert.equal((await call(ID.m1, to)).rows[0].status, to);
        else if (rule === 'assignee') await rejects(call(ID.m1, to), { code: '42501' });
        else await rejects(call(ID.m1, to), { code: 'P0001', message: /запрещён/ });
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------
describe('Постановщик', () => {
  const m1 = () => as(db, ID.m1);

  it('видит все задачи, объекты и журнал', async () => {
    const tasks = await m1().query('select id from public.tasks');
    const objects = await m1().query('select id from public.objects');
    const history = await m1().query('select distinct task_id as id from public.task_status_history');
    for (const t of [T.t1, T.t2, T.t3, T.t4]) {
      assert.ok(ids(tasks.rows).includes(t));
      assert.ok(ids(history.rows).includes(t));
    }
    for (const o of [O.o1, O.o2, O.o3]) assert.ok(ids(objects.rows).includes(o));
  });

  it('создаёт, редактирует и удаляет объекты', async () => {
    await m1().session(async (q) => {
      const created = await q(`insert into public.objects (name, address) values ('Новый', 'Адрес') returning id`);
      const id = created.rows[0].id;
      assert.equal((await q(`update public.objects set name = 'Переименован' where id = $1`, [id])).affectedRows, 1);
      assert.equal((await q('delete from public.objects where id = $1', [id])).affectedRows, 1);
    });
  });

  it('не может создать объект или задачу с «пустым» названием', async () => {
    await rejects(m1().query(`insert into public.objects (name, address) values ('   ', 'Адрес')`), { code: '23514' });
    await rejects(m1().query(`insert into public.objects (name, address) values (E'\\n\\t', 'Адрес')`), { code: '23514' });
    await rejects(
      m1().query(`insert into public.tasks (title, object_id, executor_id) values (E' \\n ', $1, $2)`, [O.o1, ID.e1]),
      { code: '23514' },
    );
  });

  it('создаёт задачу: статус «Новая», автор — он сам, в журнале первая запись', async () => {
    await m1().session(async (q) => {
      const r = await q(
        `insert into public.tasks (title, object_id, executor_id) values ('Новая задача', $1, $2)
         returning id, status, author_id`,
        [O.o1, ID.e2],
      );
      const task = r.rows[0];
      assert.equal(task.status, 'new');
      assert.equal(task.author_id, ID.m1);

      const h = await q(
        'select from_status, to_status, actor_id, actor_name from public.task_status_history where task_id = $1',
        [task.id],
      );
      assert.deepEqual(h.rows, [{ from_status: null, to_status: 'new', actor_id: ID.m1, actor_name: NAME.m1 }]);
    });
  });

  it('редактирует название, описание, объект и исполнителя', async () => {
    const r = await m1().query(
      `update public.tasks set title = 'Новое название', description = 'Новое описание', object_id = $2, executor_id = $3
       where id = $1`,
      [T.t1, O.o2, ID.e2],
    );
    assert.equal(r.affectedRows, 1);
  });

  it('удаляет задачи', async () => {
    const r = await m1().query('delete from public.tasks where id = $1', [T.t2]);
    assert.equal(r.affectedRows, 1);
  });

  it('не может создать задачу сразу в другом статусе', () =>
    rejects(
      m1().query(`insert into public.tasks (title, object_id, executor_id, status) values ('x', $1, $2, 'accepted')`, [O.o1, ID.e1]),
      { code: '42501' },
    ));

  it('не может подставить чужого автора или дату создания', async () => {
    await rejects(
      m1().query(`insert into public.tasks (title, object_id, executor_id, author_id) values ('x', $1, $2, $3)`, [O.o1, ID.e1, ID.m2]),
      { code: '42501' },
    );
    await rejects(m1().query(`update public.tasks set created_at = now() where id = $1`, [T.t1]), { code: '42501' });
  });

  it('не может поменять статус напрямую, минуя функцию', () =>
    rejects(m1().query(`update public.tasks set status = 'accepted' where id = $1`, [T.t1]), { code: '42501' }));

  it('не может назначить исполнителем постановщика или несуществующего пользователя', async () => {
    await rejects(
      m1().query(`insert into public.tasks (title, object_id, executor_id) values ('x', $1, $2)`, [O.o1, ID.m2]),
      { code: '23514', message: /Исполнитель/ },
    );
    await rejects(
      m1().query(`update public.tasks set executor_id = gen_random_uuid() where id = $1`, [T.t1]),
      { code: '23514' },
    );
  });

  it('не может выполнить переход исполнителя (взять в работу)', () =>
    rejects(m1().query(`select public.change_task_status($1::uuid, 'in_progress')`, [T.t1]), {
      code: '42501',
      message: /исполнитель/,
    }));

  it('возвращает на доработку только с комментарием', async () => {
    const back = (comment) =>
      m1().query(`select status from public.change_task_status($1::uuid, 'rework', $2)`, [T.t3, comment]);
    await rejects(back(null), { code: '23514', message: /комментарий/ });
    await rejects(back(''), { code: '23514' });
    await rejects(back('   '), { code: '23514' });
    await rejects(back(' \n\t\r\n  '), { code: '23514' }); // одни переводы строк, табы и неразрывный пробел
    assert.equal((await back('Пол не по уровню')).rows[0].status, 'rework');
  });

  it('принимает задачу, и это попадает в журнал', async () => {
    await m1().session(async (q) => {
      await q(`select public.change_task_status($1::uuid, 'accepted')`, [T.t3]);
      const h = await q(
        `select from_status, to_status, actor_id from public.task_status_history
         where task_id = $1 order by created_at desc, id desc limit 1`,
        [T.t3],
      );
      assert.deepEqual(h.rows, [{ from_status: 'in_review', to_status: 'accepted', actor_id: ID.m1 }]);
    });
  });

  it('любой постановщик (не только автор) может принять задачу', async () => {
    const r = await as(db, ID.m2).query(`select status from public.change_task_status($1::uuid, 'accepted')`, [T.t3]);
    assert.equal(r.rows[0].status, 'accepted');
  });

  it('не может писать в журнал, менять и удалять его записи', async () => {
    await rejects(
      m1().query(
        `insert into public.task_status_history (task_id, from_status, to_status, actor_id, actor_name)
         values ($1, 'new', 'accepted', $2, 'подделка')`,
        [T.t1, ID.m1],
      ),
      { code: '42501' },
    );
    await rejects(m1().query(`update public.task_status_history set comment = 'правка'`), { code: '42501' });
    await rejects(m1().query('delete from public.task_status_history'), { code: '42501' });
  });

  it('не может менять роли пользователей через API', () =>
    rejects(m1().query(`update public.profiles set role = 'manager' where id = $1`, [ID.e1]), { code: '42501' }));

  it('видит всех пользователей (нужно для назначения исполнителей)', async () => {
    const r = await m1().query('select id from public.profiles');
    assert.deepEqual(ids(r.rows), [ID.e1, ID.e2, ID.e3, ID.m1, ID.m2].sort());
  });
});

// ---------------------------------------------------------------------------------------------
describe('Журнал статусов', () => {
  it('записывает весь путь задачи: кто, из какого статуса в какой, комментарий', async () => {
    const m1 = as(db, ID.m1);
    const taskId = (
      await m1.exec(`insert into public.tasks (title, object_id, executor_id) values ('Путь задачи', $1, $2) returning id`, [O.o1, ID.e1])
    ).rows[0].id;
    const step = (who, to, comment) =>
      as(db, who).exec(`select public.change_task_status($1::uuid, $2::public.task_status, $3)`, [taskId, to, comment ?? null]);

    await step(ID.e1, 'in_progress', '  Приступил к работе  ');
    await step(ID.e1, 'in_review');
    await step(ID.m2, 'rework', 'Нужно переделать узел');
    await step(ID.e1, 'in_progress');
    await step(ID.e1, 'in_review', 'Переделал');
    await step(ID.m1, 'accepted');

    const h = await db.query(
      `select from_status, to_status, actor_name, comment, created_at
       from public.task_status_history where task_id = $1 order by created_at, id`,
      [taskId],
    );
    assert.deepEqual(
      h.rows.map((r) => [r.from_status, r.to_status, r.actor_name, r.comment]),
      [
        [null, 'new', NAME.m1, null],
        ['new', 'in_progress', NAME.e1, 'Приступил к работе'], // пробелы по краям обрезаны
        ['in_progress', 'in_review', NAME.e1, null],
        ['in_review', 'rework', NAME.m2, 'Нужно переделать узел'],
        ['rework', 'in_progress', NAME.e1, null],
        ['in_progress', 'in_review', NAME.e1, 'Переделал'],
        ['in_review', 'accepted', NAME.m1, null],
      ],
    );
    const times = h.rows.map((r) => r.created_at.getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b), 'время записей не убывает');
  });

  it('исполнитель видит журнал своей задачи, постановщик — любой', async () => {
    const own = await as(db, ID.e1).query('select count(*)::int as n from public.task_status_history where task_id = $1', [T.t4]);
    assert.ok(own.rows[0].n >= 2);
    const foreign = await as(db, ID.e1).query('select count(*)::int as n from public.task_status_history where task_id = $1', [T.t3]);
    assert.equal(foreign.rows[0].n, 0);
  });

  it('запись нельзя изменить или удалить даже владельцу базы (триггер)', async () => {
    await rejects(db.query(`update public.task_status_history set comment = 'правка'`), {
      code: '42501',
      message: /нельзя изменять или удалять/,
    });
    await rejects(db.query('delete from public.task_status_history'), { code: '42501', message: /нельзя изменять или удалять/ });
  });

  it('статус нельзя поменять в обход функции даже владельцу базы (триггер-страж)', async () => {
    await rejects(db.query(`update public.tasks set status = 'accepted' where id = $1`, [T.t4]), {
      code: '42501',
      message: /change_task_status/,
    });
    await rejects(db.query(`update public.tasks set author_id = $2 where id = $1`, [T.t4, ID.m2]), { code: '42501' });
    await rejects(
      db.query(`insert into public.tasks (title, object_id, executor_id, author_id, status) values ('x', $1, $2, $3, 'accepted')`, [O.o1, ID.e1, ID.m1]),
      { code: 'P0001', message: /только в статусе/ },
    );
  });

  it('при удалении задачи журнал остаётся в базе, но исполнителю недоступен', async () => {
    const m1 = as(db, ID.m1);
    const taskId = (
      await m1.exec(`insert into public.tasks (title, object_id, executor_id) values ('Будет удалена', $1, $2) returning id`, [O.o1, ID.e1])
    ).rows[0].id;
    await as(db, ID.e1).exec(`select public.change_task_status($1::uuid, 'in_progress')`, [taskId]);

    assert.equal((await m1.exec('delete from public.tasks where id = $1', [taskId])).affectedRows, 1);

    const left = await db.query('select count(*)::int as n from public.task_status_history where task_id = $1', [taskId]);
    assert.equal(left.rows[0].n, 2, 'создание и «В работе» остались в журнале');
    const forExecutor = await as(db, ID.e1).query('select count(*)::int as n from public.task_status_history where task_id = $1', [taskId]);
    assert.equal(forExecutor.rows[0].n, 0);
  });

  it('при удалении объекта удаляются его задачи, а журнал сохраняется', async () => {
    const m1 = as(db, ID.m1);
    const objectId = (await m1.exec(`insert into public.objects (name, address) values ('Временный', 'Адрес') returning id`)).rows[0].id;
    const taskId = (
      await m1.exec(`insert into public.tasks (title, object_id, executor_id) values ('Задача объекта', $1, $2) returning id`, [objectId, ID.e1])
    ).rows[0].id;

    await m1.exec('delete from public.objects where id = $1', [objectId]);

    assert.equal((await db.query('select 1 from public.tasks where id = $1', [taskId])).rows.length, 0);
    assert.equal((await db.query('select 1 from public.task_status_history where task_id = $1', [taskId])).rows.length, 1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Профили и роли', () => {
  const addUser = async (id, email, appMeta, userMeta) => {
    await db.query(
      `insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3::jsonb, $4::jsonb)`,
      [id, email, JSON.stringify(appMeta), JSON.stringify(userMeta)],
    );
    return (await db.query('select role, full_name from public.profiles where id = $1', [id])).rows[0];
  };

  it('новый пользователь по умолчанию — исполнитель, имя берётся из почты', async () => {
    const p = await addUser('00000000-0000-4000-8000-000000000001', 'ivan.novikov@example.com', {}, {});
    assert.deepEqual(p, { role: 'executor', full_name: 'ivan.novikov' });
  });

  it('постановщиком делает только app_metadata (её задаёт администратор)', async () => {
    const p = await addUser('00000000-0000-4000-8000-000000000002', 'boss@example.com', { role: 'manager' }, { full_name: 'Босс' });
    assert.deepEqual(p, { role: 'manager', full_name: 'Босс' });
  });

  it('роль из user_metadata (её может задать сам пользователь при регистрации) игнорируется', async () => {
    const p = await addUser('00000000-0000-4000-8000-000000000003', 'sneaky@example.com', {}, { role: 'manager' });
    assert.equal(p.role, 'executor');
  });

  it('новый «самозванец» без задач не видит данных компании', async () => {
    const id = '00000000-0000-4000-8000-000000000003';
    const u = as(db, id);
    assert.equal((await u.query('select id from public.tasks')).rows.length, 0);
    assert.equal((await u.query('select id from public.objects')).rows.length, 0);
    assert.equal((await u.query('select id from public.task_status_history')).rows.length, 0);
  });

  it('пользователя с задачами нельзя удалить: сначала задачи нужно передать', () =>
    rejects(db.query('delete from auth.users where id = $1', [ID.e1]), { code: '23001', message: /tasks_executor_id_fkey/ }));
});

// ---------------------------------------------------------------------------------------------
describe('Целостность данных после всех сценариев', () => {
  it('статус каждой задачи совпадает с последней записью её журнала', async () => {
    const r = await db.query(
      `select t.id, t.status,
              (select h.to_status from public.task_status_history h
               where h.task_id = t.id order by h.created_at desc, h.id desc limit 1) as last_status
       from public.tasks t`,
    );
    assert.ok(r.rows.length > 0);
    for (const row of r.rows) assert.equal(row.status, row.last_status, `задача ${row.id}`);
  });

  it('в журнале только создание и разрешённые переходы', async () => {
    const r = await db.query(
      `select h.id from public.task_status_history h
       where h.task_id in (select id from public.tasks)
         and not (
           (h.from_status is null and h.to_status = 'new')
           or exists (select 1 from public.task_transitions r
                      where r.from_status = h.from_status and r.to_status = h.to_status)
         )`,
    );
    assert.equal(r.rows.length, 0);
  });

  it('у каждой задачи ровно одна запись о создании', async () => {
    const r = await db.query(
      `select t.id from public.tasks t
       where (select count(*) from public.task_status_history h where h.task_id = t.id and h.from_status is null) <> 1`,
    );
    assert.equal(r.rows.length, 0);
  });
});
