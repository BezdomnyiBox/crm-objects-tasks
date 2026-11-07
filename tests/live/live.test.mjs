// Проверка защиты на ЖИВОМ проекте Supabase «чёрным ящиком»: настоящие HTTP-запросы к Auth и REST API
// с публичным ключом — так, как это сделал бы любой посторонний клиент, минуя интерфейс.
//
//   npm run test:live
//
// Данные не меняются: разрешённые операции — только чтение, а запрещённые должны быть отклонены
// или затронуть 0 строк (в конце проверяется, что данные остались прежними).
//
// Что нужно:
//   • адрес и публичный ключ проекта: .env.local (как для приложения) или переменные окружения
//     VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY;
//   • доступы постановщика и исполнителя: файл ДОСТУПЫ.local.md (его создаёт `npm run demo-users`)
//     или переменные LIVE_MANAGER_EMAIL / LIVE_MANAGER_PASSWORD / LIVE_EXECUTOR_EMAIL / LIVE_EXECUTOR_PASSWORD;
//   • в проекте загружены демо-данные (supabase/seed.sql).
// Пароли нигде не выводятся. Если настроек нет — проверка пропускается.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { before, describe, it } from 'node:test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

async function readEnvFile(file) {
  try {
    const text = await readFile(file, 'utf8')
    const entries = text
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, '')])
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

/** Первая строка «Постановщик» и первая «Исполнитель» из таблицы в ДОСТУПЫ.local.md. */
async function readCredentialsFile() {
  try {
    const text = await readFile(path.join(ROOT, 'ДОСТУПЫ.local.md'), 'utf8')
    const rows = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith('|'))
      .map((line) =>
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      )
      .filter((cells) => cells.length >= 4)
    const manager = rows.find((r) => r[0] === 'Постановщик')
    const executor = rows.find((r) => r[0] === 'Исполнитель')
    return {
      managerEmail: manager?.[2],
      managerPassword: manager?.[3],
      executorEmail: executor?.[2],
      executorPassword: executor?.[3],
    }
  } catch {
    return {}
  }
}

const envFile = await readEnvFile(path.join(ROOT, '.env.local'))
const creds = await readCredentialsFile()
const env = (name) => process.env[name] || envFile[name]

const URL_ = (env('VITE_SUPABASE_URL') || '').replace(/\/$/, '')
const KEY = env('VITE_SUPABASE_PUBLISHABLE_KEY') || ''
const MANAGER = {
  email: process.env.LIVE_MANAGER_EMAIL || creds.managerEmail,
  password: process.env.LIVE_MANAGER_PASSWORD || creds.managerPassword,
}
const EXECUTOR = {
  email: process.env.LIVE_EXECUTOR_EMAIL || creds.executorEmail,
  password: process.env.LIVE_EXECUTOR_PASSWORD || creds.executorPassword,
}

const missing = [
  !URL_ && 'VITE_SUPABASE_URL',
  !KEY && 'VITE_SUPABASE_PUBLISHABLE_KEY',
  (!MANAGER.email || !MANAGER.password) && 'доступы постановщика',
  (!EXECUTOR.email || !EXECUTOR.password) && 'доступы исполнителя',
].filter(Boolean)

/** HTTP-запрос к API проекта так, как его сделал бы любой клиент. */
async function api(pathAndQuery, { method = 'GET', token, body, prefer } = {}) {
  const headers = { apikey: KEY }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${URL_}${pathAndQuery}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, json }
}

async function signIn({ email, password }) {
  const res = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })
  assert.equal(res.status, 200, `вход ${email}: HTTP ${res.status} ${res.json?.error_code ?? ''}`)
  return { token: res.json.access_token, id: res.json.user.id }
}

const rpc = (token, taskId, status, comment) =>
  api('/rest/v1/rpc/change_task_status', {
    method: 'POST',
    token,
    body: { p_task_id: taskId, p_new_status: status, ...(comment === undefined ? {} : { p_comment: comment }) },
  })

/** Доступ отклонён базой: 401/403 и код 42501 («недостаточно прав»). */
function assertDenied(res, what) {
  assert.ok([401, 403].includes(res.status), `${what}: ожидался отказ 401/403, получен HTTP ${res.status}`)
  assert.equal(res.json?.code, '42501', `${what}: код ошибки ${res.json?.code}`)
}

/** Запрос принят, но ни одна строка не затронута (политики безопасности отфильтровали всё). */
function assertNoRows(res, what) {
  assert.equal(res.status, 200, `${what}: HTTP ${res.status}`)
  assert.deepEqual(res.json, [], `${what}: затронуты строки`)
}

/** Ошибка из функции смены статуса: код SQLSTATE и фрагмент русского сообщения. */
function assertRpcError(res, code, message, what) {
  assert.ok(res.status >= 400, `${what}: ожидалась ошибка, получен HTTP ${res.status}`)
  assert.equal(res.json?.code, code, `${what}: код ${res.json?.code}, сообщение: ${res.json?.message}`)
  assert.match(res.json?.message ?? '', message, what)
}

describe(
  'Живой проект Supabase: защита «чёрным ящиком»',
  { skip: missing.length ? `нет настроек: ${missing.join(', ')}` : false },
  () => {
    let manager
    let executor
    let before_ // снимок данных до проверок
    let ownTasks
    let foreign
    let ownNew
    let ownReview
    let reviewTask
    let newTaskOfOther

    const listTasks = async (token) => {
      const res = await api('/rest/v1/tasks?select=id,title,status,executor_id&order=id.asc', { token })
      assert.equal(res.status, 200)
      return res.json
    }

    before(async () => {
      manager = await signIn(MANAGER)
      executor = await signIn(EXECUTOR)
      before_ = await listTasks(manager.token)
      ownTasks = before_.filter((t) => t.executor_id === executor.id)
      foreign = before_.find((t) => t.executor_id !== executor.id)
      ownNew = ownTasks.find((t) => t.status === 'new')
      ownReview = ownTasks.find((t) => t.status === 'in_review')
      reviewTask = before_.find((t) => t.status === 'in_review')
      newTaskOfOther = before_.find((t) => t.status === 'new')
      assert.ok(
        before_.length >= 4 && ownTasks.length >= 1 && foreign && ownNew && ownReview && reviewTask,
        'нужны демо-данные (supabase/seed.sql): задачи у разных исполнителей, в том числе «Новая» и «На проверке»',
      )
    })

    describe('Регистрация и вход', () => {
      it('открытая регистрация отключена в настройках проекта', async () => {
        const res = await api('/auth/v1/settings')
        assert.equal(
          res.json?.disable_signup,
          true,
          'Регистрация ОТКРЫТА. Выключите «Allow new users to sign up» (Authentication → Sign In / Providers) — README, шаг 4',
        )
      })

      it('самостоятельная регистрация отклоняется', async (t) => {
        const settings = await api('/auth/v1/settings')
        if (settings.json?.disable_signup !== true) {
          // Не пробуем: при открытой регистрации запрос создал бы в проекте лишнего пользователя.
          return t.skip('регистрация открыта — проверка пропущена, чтобы не создавать пользователя')
        }
        const res = await api('/auth/v1/signup', {
          method: 'POST',
          body: { email: `intruder-${Date.now()}@example.com`, password: 'Str0ng-Intruder-Passw0rd' },
        })
        assert.ok(res.status >= 400 && res.status < 500, `HTTP ${res.status}`)
        assert.equal(res.json?.error_code, 'signup_disabled')
      })

      it('неверный пароль отклоняется', async () => {
        const res = await api('/auth/v1/token?grant_type=password', {
          method: 'POST',
          body: { email: MANAGER.email, password: 'definitely-wrong-password' },
        })
        assert.equal(res.status, 400)
        assert.equal(res.json?.error_code, 'invalid_credentials')
      })
    })

    describe('Гость (только публичный ключ, без входа)', () => {
      for (const table of ['profiles', 'objects', 'tasks', 'task_status_history', 'task_transitions']) {
        it(`не читает ${table}`, async () => {
          assertDenied(await api(`/rest/v1/${table}?select=*&limit=1`), `GET ${table}`)
        })
      }

      it('не создаёт объекты', async () => {
        assertDenied(await api('/rest/v1/objects', { method: 'POST', body: { name: 'x', address: 'y' } }), 'POST objects')
      })

      it('не вызывает смену статуса', async () => {
        assertDenied(await rpc(undefined, foreign.id, 'in_progress'), 'rpc change_task_status')
      })
    })

    describe('Исполнитель', () => {
      it('получает только свои задачи', async () => {
        const mine = await listTasks(executor.token)
        assert.ok(mine.length >= 1)
        assert.ok(mine.every((t) => t.executor_id === executor.id), 'в выдаче есть чужие задачи')
        assert.deepEqual(
          mine.map((t) => t.id),
          ownTasks.map((t) => t.id),
        )
        assert.ok(mine.length < before_.length, 'исполнитель видит не всё')
      })

      it('чужую задачу по прямому адресу не получает', async () => {
        const res = await api(`/rest/v1/tasks?select=*&id=eq.${foreign.id}`, { token: executor.token })
        assert.equal(res.status, 200)
        assert.deepEqual(res.json, [])
      })

      it('видит только объекты со своими задачами', async () => {
        const mineObjects = await api('/rest/v1/objects?select=id', { token: executor.token })
        const allObjects = await api('/rest/v1/objects?select=id', { token: manager.token })
        const withOwnTasks = await api('/rest/v1/tasks?select=object_id', { token: executor.token })
        assert.deepEqual(
          mineObjects.json.map((o) => o.id).sort(),
          [...new Set(withOwnTasks.json.map((t) => t.object_id))].sort(),
        )
        assert.ok(mineObjects.json.length < allObjects.json.length)
      })

      it('видит себя и постановщиков, но не других исполнителей', async () => {
        const res = await api('/rest/v1/profiles?select=id,role', { token: executor.token })
        assert.equal(res.status, 200)
        const executors = res.json.filter((p) => p.role === 'executor')
        assert.deepEqual(
          executors.map((p) => p.id),
          [executor.id],
        )
        assert.ok(res.json.some((p) => p.role === 'manager'))
      })

      it('видит журнал только своих задач', async () => {
        const res = await api('/rest/v1/task_status_history?select=task_id', { token: executor.token })
        assert.equal(res.status, 200)
        assert.ok(res.json.length > 0)
        const ownIds = new Set(ownTasks.map((t) => t.id))
        assert.ok(res.json.every((h) => ownIds.has(h.task_id)))
      })

      it('не меняет статус своей задачи напрямую', async () => {
        const res = await api(`/rest/v1/tasks?id=eq.${ownNew.id}`, {
          method: 'PATCH',
          token: executor.token,
          body: { status: 'accepted' },
        })
        assertDenied(res, 'PATCH status')
      })

      it('не правит и не удаляет ни свои, ни чужие задачи (0 строк)', async () => {
        const ret = 'return=representation'
        assertNoRows(
          await api(`/rest/v1/tasks?id=eq.${ownNew.id}`, { method: 'PATCH', token: executor.token, body: { title: 'взлом' }, prefer: ret }),
          'PATCH своей',
        )
        assertNoRows(
          await api(`/rest/v1/tasks?id=eq.${foreign.id}`, { method: 'PATCH', token: executor.token, body: { title: 'взлом' }, prefer: ret }),
          'PATCH чужой',
        )
        assertNoRows(await api(`/rest/v1/tasks?id=eq.${ownNew.id}`, { method: 'DELETE', token: executor.token, prefer: ret }), 'DELETE своей')
        assertNoRows(await api(`/rest/v1/tasks?id=eq.${foreign.id}`, { method: 'DELETE', token: executor.token, prefer: ret }), 'DELETE чужой')
      })

      it('не создаёт объекты и задачи', async () => {
        assertDenied(await api('/rest/v1/objects', { method: 'POST', token: executor.token, body: { name: 'x', address: 'y' } }), 'POST objects')
        assertDenied(
          await api('/rest/v1/tasks', {
            method: 'POST',
            token: executor.token,
            body: { title: 'x', object_id: foreign.id, executor_id: executor.id },
          }),
          'POST tasks',
        )
      })

      it('не пишет, не правит и не удаляет журнал', async () => {
        const entry = { task_id: ownNew.id, to_status: 'accepted', actor_id: executor.id, actor_name: 'подделка' }
        assertDenied(await api('/rest/v1/task_status_history', { method: 'POST', token: executor.token, body: entry }), 'POST history')
        assertDenied(await api('/rest/v1/task_status_history?id=gt.0', { method: 'PATCH', token: executor.token, body: { comment: 'x' } }), 'PATCH history')
        assertDenied(await api('/rest/v1/task_status_history?id=gt.0', { method: 'DELETE', token: executor.token }), 'DELETE history')
      })

      it('не повышает себя до постановщика и не правит правила переходов', async () => {
        assertDenied(
          await api(`/rest/v1/profiles?id=eq.${executor.id}`, { method: 'PATCH', token: executor.token, body: { role: 'manager' } }),
          'PATCH profiles',
        )
        assertDenied(
          await api('/rest/v1/task_transitions', {
            method: 'POST',
            token: executor.token,
            body: { from_status: 'new', to_status: 'accepted', actor: 'assignee' },
          }),
          'POST task_transitions',
        )
      })

      it('чужая задача для функции смены статуса «не найдена»', async () => {
        assertRpcError(await rpc(executor.token, foreign.id, 'in_progress'), 'P0002', /не найдена/, 'rpc чужая задача')
      })

      it('запрещённые переходы своей задачи отклоняются', async () => {
        assertRpcError(await rpc(executor.token, ownNew.id, 'in_review'), 'P0001', /запрещён/, 'Новая → На проверке')
        assertRpcError(await rpc(executor.token, ownNew.id, 'accepted'), 'P0001', /запрещён/, 'Новая → Принята')
      })

      it('принять свою работу исполнитель не может', async () => {
        assertRpcError(await rpc(executor.token, ownReview.id, 'accepted'), '42501', /только постановщик/, 'На проверке → Принята')
      })
    })

    describe('Постановщик', () => {
      it('видит все задачи, объекты и журнал', async () => {
        const tasks = await listTasks(manager.token)
        const objects = await api('/rest/v1/objects?select=id', { token: manager.token })
        const history = await api('/rest/v1/task_status_history?select=id', { token: manager.token })
        assert.equal(tasks.length, before_.length)
        assert.ok(objects.json.length >= 1)
        assert.ok(history.json.length >= tasks.length)
      })

      it('не меняет статус напрямую, минуя функцию', async () => {
        assertDenied(
          await api(`/rest/v1/tasks?id=eq.${reviewTask.id}`, { method: 'PATCH', token: manager.token, body: { status: 'accepted' } }),
          'PATCH status',
        )
      })

      it('не создаёт задачу сразу в другом статусе', async () => {
        assertDenied(
          await api('/rest/v1/tasks', {
            method: 'POST',
            token: manager.token,
            body: { title: 'x', object_id: foreign.id, executor_id: executor.id, status: 'accepted' },
          }),
          'POST tasks со статусом',
        )
      })

      it('не пишет в журнал', async () => {
        const entry = { task_id: reviewTask.id, to_status: 'accepted', actor_id: manager.id, actor_name: 'подделка' }
        assertDenied(await api('/rest/v1/task_status_history', { method: 'POST', token: manager.token, body: entry }), 'POST history')
      })

      it('не выполняет переходы исполнителя', async () => {
        assertRpcError(
          await rpc(manager.token, newTaskOfOther.id, 'in_progress'),
          '42501',
          /назначенный исполнитель/,
          'Новая → В работе',
        )
      })

      it('возврат на доработку без комментария невозможен', async () => {
        assertRpcError(await rpc(manager.token, reviewTask.id, 'rework'), '23514', /нужен комментарий/, 'без комментария')
        assertRpcError(await rpc(manager.token, reviewTask.id, 'rework', '  \n\t  '), '23514', /нужен комментарий/, 'из одних пробелов')
      })

      it('несуществующий переход отклоняется', async () => {
        const accepted = before_.find((t) => t.status === 'accepted')
        assert.ok(accepted, 'нужна задача в статусе «Принята»')
        assertRpcError(await rpc(manager.token, accepted.id, 'new'), 'P0001', /запрещён/, 'Принята → Новая')
      })
    })

    describe('Итог', () => {
      it('после всех попыток данные не изменились', async () => {
        const after = await listTasks(manager.token)
        assert.deepEqual(after, before_)
      })
    })
  },
)
