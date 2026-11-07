// Ищет секретные ключи Supabase в файлах проекта и в сборке (dist).
//
//   node scripts/check-secrets.mjs               проверить рабочую папку проекта (вместе с dist, если она есть)
//   node scripts/check-secrets.mjs --history     дополнительно проверить всю историю git
//   node scripts/check-secrets.mjs --root <путь> проверить другую папку
//
// Что считается секретом: ключ sb_secret_…, JWT-ключ с ролью service_role, строка подключения к
// Postgres с паролем. Публичный ключ (publishable / anon) — не секрет: он по замыслу попадает в браузер.
// Найденные значения в отчёт целиком не выводятся. Код возврата 1 — секреты найдены.

import { spawnSync } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const rootIndex = args.indexOf('--root')
const ROOT = path.resolve(rootIndex >= 0 ? (args[rootIndex + 1] ?? '.') : '.')
const CHECK_HISTORY = args.includes('--history')

const SKIP_DIRS = new Set(['node_modules', '.git', '.vercel'])
const MAX_FILE_SIZE = 5 * 1024 * 1024

const PATTERNS = [
  { reason: 'секретный ключ Supabase (sb_secret_…)', re: /sb_secret_[A-Za-z0-9_-]{16,}/g },
  {
    reason: 'строка подключения к базе с паролем',
    re: /postgres(?:ql)?:\/\/[^\s:@/]+:([^\s@/]+)@[^\s/]+/g,
    // пример-заглушка вроде [YOUR-PASSWORD] или <пароль> секретом не считается
    ignore: (match) => /^(\[.*\]|<.*>|\*+|\$\{.*\}|password|пароль)$/i.test(match[1] ?? ''),
  },
]

const JWT_RE = /eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g

function jwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

const mask = (value) => `${value.slice(0, 8)}…(${value.length} симв.)`

/** Возвращает найденное в тексте: [{ line, reason, preview }] */
function scanText(text) {
  const findings = []
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    for (const { reason, re, ignore } of PATTERNS) {
      for (const match of line.matchAll(re)) {
        if (ignore?.(match)) continue
        findings.push({ line: index + 1, reason, preview: mask(match[0]) })
      }
    }
    for (const match of line.matchAll(JWT_RE)) {
      if (jwtRole(match[0]) === 'service_role') {
        findings.push({ line: index + 1, reason: 'JWT-ключ с ролью service_role', preview: mask(match[0]) })
      }
    }
  })
  return findings
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name))
    } else if (entry.isFile()) {
      yield path.join(dir, entry.name)
    }
  }
}

let filesScanned = 0
const problems = []

for await (const file of walk(ROOT)) {
  if ((await stat(file)).size > MAX_FILE_SIZE) continue
  const buffer = await readFile(file)
  if (buffer.subarray(0, 1024).includes(0)) continue // бинарный файл
  filesScanned += 1
  for (const f of scanText(buffer.toString('utf8'))) {
    problems.push({ where: `${path.relative(ROOT, file)}:${f.line}`, ...f })
  }
}

let historyNote = ''
if (CHECK_HISTORY) {
  const log = spawnSync('git', ['log', '--all', '-p', '--no-color'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  if (log.status !== 0) {
    console.error('Не удалось прочитать историю git:', (log.stderr || '').trim() || 'нет репозитория')
    process.exit(2)
  }
  for (const f of scanText(log.stdout)) problems.push({ where: 'история git', ...f })
  historyNote = ' и всей истории git'
}

if (problems.length > 0) {
  console.error(`НАЙДЕНЫ СЕКРЕТЫ (${problems.length}):`)
  for (const p of problems) console.error(`  ${p.where} — ${p.reason}: ${p.preview}`)
  console.error('\nЕсли ключ попал в репозиторий или сборку, считайте его скомпрометированным и перевыпустите в панели Supabase.')
  process.exit(1)
}

console.log(`Секретов нет: проверено файлов — ${filesScanned}${historyNote}.`)
