export type ConfigResult =
  | { ok: true; supabaseUrl: string; supabaseKey: string }
  | { ok: false; error: string }

/**
 * Читает поле `role` из JWT-ключа, не проверяя подпись, — нужно только чтобы отличить
 * публичный ключ (anon) от секретного (service_role).
 */
function jwtRole(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload: unknown = JSON.parse(atob(base64))
    if (payload && typeof payload === 'object' && 'role' in payload && typeof payload.role === 'string') {
      return payload.role
    }
    return null
  } catch {
    return null
  }
}

/**
 * Берёт адрес и публичный ключ проекта из переменных окружения.
 * Секретные ключи (service_role / sb_secret_…) во фронтенд попадать не должны,
 * поэтому, если такой ключ подставили по ошибке, приложение откажется запускаться.
 */
export function readConfig(): ConfigResult {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      error:
        'Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY. ' +
        'Скопируйте .env.example в .env.local и подставьте значения своего проекта Supabase.',
    }
  }

  if (!/^https?:\/\//.test(supabaseUrl)) {
    return { ok: false, error: 'VITE_SUPABASE_URL должен начинаться с https://' }
  }

  if (supabaseKey.startsWith('sb_secret_') || jwtRole(supabaseKey) === 'service_role') {
    return {
      ok: false,
      error:
        'В VITE_SUPABASE_PUBLISHABLE_KEY указан СЕКРЕТНЫЙ ключ (service_role / secret). ' +
        'Он даёт полный доступ к базе в обход всех правил и не должен попадать в браузер. ' +
        'Используйте публичный ключ (publishable / anon), а этот ключ считайте скомпрометированным и перевыпустите.',
    }
  }

  return { ok: true, supabaseUrl, supabaseKey }
}
