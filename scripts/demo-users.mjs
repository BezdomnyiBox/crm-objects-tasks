// Готовит демо-пользователей: случайные пароли и SQL для их создания.
//
//   node scripts/demo-users.mjs
//     → supabase/demo-users.local.sql   SQL для SQL Editor (в нём только bcrypt-хэши паролей)
//     → ДОСТУПЫ.local.md                email и пароли (только для себя; файл в .gitignore)
//
// Пароли в консоль не печатаются и в SQL не попадают — только их хэши.
//
// Штатный способ создания пользователей — панель Supabase (README, шаг 5). Скрипт — быстрая
// альтернатива: он добавляет строки в служебные таблицы auth.users и auth.identities так же, как
// это делает панель, поэтому SQL нужно выполнять от имени владельца базы (SQL Editor).
// Роль «постановщик» записывается в app_metadata — туда пользователь писать не может.

import { randomInt } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const DEMO_USERS = [
  { email: 'manager1@example.com', fullName: 'Анна Воронцова', role: 'manager' },
  { email: 'manager2@example.com', fullName: 'Сергей Лебедев', role: 'manager' },
  { email: 'executor1@example.com', fullName: 'Игорь Петров', role: 'executor' },
  { email: 'executor2@example.com', fullName: 'Мария Козлова', role: 'executor' },
]

// Без похожих символов (0/O, 1/l/I): пароль удобно переписывать и диктовать.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** Пароль вида Kp7w-Xt3q-Mn8s-Hy4d: 16 случайных символов (~93 бита энтропии). */
export function generatePassword() {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return [group(), group(), group(), group()].join('-')
}

/** bcrypt-хэш пароля в том же формате, который проверяет Supabase Auth ($2a$10$…). */
export async function hashPasswords(passwords) {
  const db = new PGlite({ extensions: { pgcrypto } })
  try {
    await db.exec('create extension if not exists pgcrypto')
    const hashes = []
    for (const password of passwords) {
      const { rows } = await db.query(`select crypt($1, gen_salt('bf', 10)) as hash`, [password])
      hashes.push(rows[0].hash)
    }
    return hashes
  } finally {
    await db.close()
  }
}

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`

/**
 * SQL создания пользователей. Каждый блок пропускает пользователя, если такой email уже есть,
 * поэтому скрипт безопасно запускать повторно. Профиль создаёт триггер on_auth_user_created.
 * users: [{ email, fullName, role, hash }]
 */
export function buildSql(users) {
  const blocks = users.map((u) => {
    const appMeta = { provider: 'email', providers: ['email'], ...(u.role === 'manager' ? { role: 'manager' } : {}) }
    const userMeta = { full_name: u.fullName }
    return `do $demo$
declare
  v_id uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where email = ${sqlString(u.email)}) then
    raise notice 'Пользователь % уже существует — пропущен', ${sqlString(u.email)};
    return;
  end if;

  -- Пустые строки в токенах нужны: Supabase Auth не умеет читать там NULL.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', ${sqlString(u.email)},
    ${sqlString(u.hash)}, now(),
    ${sqlString(JSON.stringify(appMeta))}::jsonb, ${sqlString(JSON.stringify(userMeta))}::jsonb,
    '', '', '', '',
    now(), now()
  );

  insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (
    v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', ${sqlString(u.email)}, 'email_verified', true, 'phone_verified', false),
    now(), now(), now()
  );
end
$demo$;`
  })

  return `-- Демо-пользователи (создано scripts/demo-users.mjs). Пароли здесь только в виде bcrypt-хэшей.
-- Выполнять в SQL Editor панели Supabase (от имени владельца базы).

${blocks.join('\n\n')}
`
}

async function main() {
  const passwords = DEMO_USERS.map(() => generatePassword())
  const hashes = await hashPasswords(passwords)
  const users = DEMO_USERS.map((u, i) => ({ ...u, hash: hashes[i] }))

  const sqlPath = path.join(ROOT, 'supabase', 'demo-users.local.sql')
  const credsPath = path.join(ROOT, 'ДОСТУПЫ.local.md')
  await writeFile(sqlPath, buildSql(users), 'utf8')

  const roleLabel = { manager: 'Постановщик', executor: 'Исполнитель' }
  const rows = DEMO_USERS.map((u, i) => `| ${roleLabel[u.role]} | ${u.fullName} | ${u.email} | ${passwords[i]} |`)
  await writeFile(
    credsPath,
    `# Доступы к демо-приложению

> Только для себя: файл в .gitignore и в репозиторий не попадает. В чат и в README пароли не вставляйте —
> отправляйте проверяющим личным сообщением.

Адрес приложения: _(вставьте после деплоя)_

| Роль | Имя | Email | Пароль |
| --- | --- | --- | --- |
${rows.join('\n')}
`,
    'utf8',
  )

  console.log('Создано (пароли не выводятся):')
  console.log(`  SQL:     ${path.relative(ROOT, sqlPath)}`)
  console.log(`  Доступы: ${path.relative(ROOT, credsPath)}`)
  for (const u of DEMO_USERS) console.log(`  - ${roleLabel[u.role].padEnd(11)} ${u.email}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
