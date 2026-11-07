import { createClient } from '@supabase/supabase-js'
import { readConfig } from './config'
import type { Database } from './database.types'

const config = readConfig()
if (!config.ok) {
  // main.tsx проверяет конфигурацию заранее и показывает понятную страницу; сюда не дойдёт.
  throw new Error(config.error)
}

const REQUEST_TIMEOUT_MS = 20_000

/** fetch с ограничением по времени: при плохой сети пользователь получит ошибку, а не вечный спиннер. */
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  return fetch(input, { ...init, signal })
}

/**
 * Единственный клиент Supabase во фронтенде. Работает с ПУБЛИЧНЫМ ключом:
 * всё, что он может прочитать или изменить, определяют правила доступа (RLS) в самой базе.
 */
export const supabase = createClient<Database>(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: { fetch: fetchWithTimeout },
})
