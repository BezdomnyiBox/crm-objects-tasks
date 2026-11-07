// Проверка скрипта scripts/demo-users.mjs: пароли случайные и не попадают в SQL, а SQL создаёт
// пользователей с правильными ролями (через app_metadata) и профилями (через триггер).

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { DEMO_USERS, buildSql, generatePassword, hashPasswords } from '../../scripts/demo-users.mjs'
import { createDb } from './helpers.mjs'

describe('scripts/demo-users.mjs', () => {
  let db
  let passwords
  let users

  before(async () => {
    db = await createDb()
    passwords = DEMO_USERS.map(() => generatePassword())
    const hashes = await hashPasswords(passwords)
    users = DEMO_USERS.map((u, i) => ({ ...u, hash: hashes[i] }))
  })

  after(async () => {
    await db?.close()
  })

  it('пароли: нужный формат, случайные, не повторяются', () => {
    assert.ok(passwords.every((p) => /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/.test(p)))
    assert.equal(new Set(passwords).size, passwords.length)
    assert.ok(!/[0OIl1]/.test(passwords.join('')), 'нет похожих символов')
  })

  it('хэши — bcrypt ($2a$10$…), проверяются, у одинаковых паролей разные соли', async () => {
    const [a, b] = await hashPasswords(['one-password', 'one-password'])
    assert.match(a, /^\$2a\$10\$/)
    assert.notEqual(a, b)

    const check = new PGlite({ extensions: { pgcrypto } })
    try {
      await check.exec('create extension if not exists pgcrypto')
      const ok = await check.query(`select crypt('one-password', $1) = $1 as ok`, [a])
      const bad = await check.query(`select crypt('wrong-password', $1) = $1 as ok`, [a])
      assert.equal(ok.rows[0].ok, true)
      assert.equal(bad.rows[0].ok, false)
    } finally {
      await check.close()
    }
  })

  it('SQL не содержит паролей — только хэши', () => {
    const sql = buildSql(users)
    for (const password of passwords) assert.ok(!sql.includes(password))
    for (const u of users) assert.ok(sql.includes(u.hash))
  })

  it('создаёт пользователей: роли из app_metadata, профили, идентичности, пустые токены', async () => {
    await db.exec(buildSql(users))

    const profiles = await db.query(
      `select u.email, p.role, p.full_name
       from auth.users u join public.profiles p on p.id = u.id
       order by u.email`,
    )
    assert.deepEqual(
      profiles.rows,
      DEMO_USERS.map(({ email, role, fullName }) => ({ email, role, full_name: fullName })).sort((a, b) =>
        a.email.localeCompare(b.email),
      ),
    )

    const identities = await db.query(
      `select count(*)::int as n,
              bool_and(i.provider_id = u.id::text) as linked,
              bool_and((i.identity_data ->> 'email') = u.email) as email_ok
       from auth.identities i join auth.users u on u.id = i.user_id`,
    )
    assert.deepEqual(identities.rows[0], { n: 4, linked: true, email_ok: true })

    const tokens = await db.query(
      `select count(*)::int as n from auth.users
       where confirmation_token = '' and recovery_token = '' and email_change_token_new = '' and email_change = ''
         and email_confirmed_at is not null and aud = 'authenticated' and role = 'authenticated'`,
    )
    assert.equal(tokens.rows[0].n, 4)
  })

  it('повторный запуск безопасен: уже существующие пользователи пропускаются', async () => {
    await db.exec(buildSql(users))
    assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n, 4)
    assert.equal((await db.query('select count(*)::int as n from auth.identities')).rows[0].n, 4)
    assert.equal((await db.query('select count(*)::int as n from public.profiles')).rows[0].n, 4)
  })

  it('demo-данные из seed.sql принимают этих пользователей (2 постановщика, 2 исполнителя)', async () => {
    const { readFile } = await import('node:fs/promises')
    const { ROOT } = await import('./helpers.mjs')
    const path = await import('node:path')
    await db.exec(await readFile(path.join(ROOT, 'supabase/seed.sql'), 'utf8'))
    const r = await db.query(
      `select count(distinct author_id)::int as authors, count(distinct executor_id)::int as executors from public.tasks`,
    )
    assert.deepEqual(r.rows[0], { authors: 2, executors: 2 })
  })
})
