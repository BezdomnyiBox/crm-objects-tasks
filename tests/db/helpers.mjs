// Общие помощники для тестов базы: поднимают Postgres в памяти (PGlite), применяют
// миграции из supabase/migrations и дают выполнять запросы «от имени» пользователя —
// так же, как это делает Supabase API (роль + JWT в настройках сессии).

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Тестовые пользователи: два постановщика и три исполнителя (e3 — без задач).
export const ID = {
  m1: '11111111-1111-4111-8111-111111111111',
  m2: '22222222-2222-4222-8222-222222222222',
  e1: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  e2: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  e3: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};

export const NAME = {
  m1: 'Анна Воронцова',
  m2: 'Сергей Лебедев',
  e1: 'Игорь Петров',
  e2: 'Мария Козлова',
  e3: 'Олег Зайцев',
};

/** Применяет заглушку Supabase и все миграции проекта по порядку имён файлов. */
export async function createDb() {
  const db = new PGlite();
  await db.exec(await readFile(path.join(ROOT, 'tests/db/supabase-stub.sql'), 'utf8'));

  const dir = path.join(ROOT, 'supabase/migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await db.exec(await readFile(path.join(dir, file), 'utf8'));
  }
  return db;
}

/** Создаёт пользователей так, как их создал бы администратор: роль — в app_metadata. */
export async function createUsers(db) {
  const users = [
    [ID.m1, 'manager1@example.com', { role: 'manager' }, { full_name: NAME.m1 }],
    [ID.m2, 'manager2@example.com', { role: 'manager' }, { full_name: NAME.m2 }],
    [ID.e1, 'executor1@example.com', {}, { full_name: NAME.e1 }],
    [ID.e2, 'executor2@example.com', {}, { full_name: NAME.e2 }],
    [ID.e3, 'executor3@example.com', {}, { full_name: NAME.e3 }],
  ];
  for (const [id, email, appMeta, userMeta] of users) {
    await db.query(
      `insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
       values ($1, $2, $3::jsonb, $4::jsonb)`,
      [id, email, JSON.stringify(appMeta), JSON.stringify(userMeta)],
    );
  }
}

/**
 * Выполняет SQL от имени пользователя (userId) или гостя (null): тот же механизм, что у Supabase API —
 * роль authenticated/anon и JWT с sub в настройках сессии. Политики RLS и права действуют полностью.
 */
export function as(db, userId) {
  const role = userId ? 'authenticated' : 'anon';
  const claims = JSON.stringify(userId ? { sub: userId, role } : { role });

  /** Одна транзакция под ролью пользователя; внутри можно выполнить несколько запросов подряд. */
  async function session(fn, commit) {
    await db.exec('begin');
    try {
      await db.exec(`set local role ${role}`);
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      return await fn((sql, params = []) => db.query(sql, params));
    } finally {
      await db.exec(commit ? 'commit' : 'rollback');
    }
  }

  return {
    /** Выполнить и откатить: проверка «что увидит / сможет», данные не меняются. */
    query: (sql, params = []) => session((q) => q(sql, params), false),
    /** Выполнить и зафиксировать результат. */
    exec: (sql, params = []) => session((q) => q(sql, params), true),
    /** Несколько запросов в одной транзакции (по умолчанию — с откатом в конце). */
    session: (fn, { commit = false } = {}) => session(fn, commit),
  };
}

/** Ожидает ошибку базы; при необходимости сверяет код SQLSTATE и текст сообщения. */
export async function rejects(promise, { code, message } = {}) {
  let error;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  assert.ok(error, 'ожидалась ошибка, но запрос выполнился');
  if (code) assert.equal(error.code, code, `код ошибки ${error.code}, сообщение: ${error.message}`);
  if (message) assert.match(error.message, message);
  return error;
}

/**
 * Служебный обход для тестов: выставляет статус задачи «от администратора базы», минуя журнал.
 * Нужен только чтобы быстро поставить задачу в нужное исходное состояние для проверки переходов.
 */
export async function forceStatus(db, taskId, status) {
  await db.query(`select set_config('app.task_status_rpc', 'on', false)`);
  try {
    await db.query(`update public.tasks set status = $2::public.task_status where id = $1::uuid`, [taskId, status]);
  } finally {
    await db.query(`select set_config('app.task_status_rpc', 'off', false)`);
  }
}

export const ids = (rows, key = 'id') => rows.map((r) => r[key]).sort();
