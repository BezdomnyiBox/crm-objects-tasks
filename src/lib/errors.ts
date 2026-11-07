/**
 * Превращает ошибку Supabase / сети в понятное сообщение на русском.
 * Сообщения наших функций и триггеров в базе уже написаны по-русски — их показываем как есть.
 */
export function getErrorMessage(error: unknown): string {
  const e = (error ?? {}) as { message?: unknown; code?: unknown }
  const message = typeof e.message === 'string' ? e.message : ''
  const code = typeof e.code === 'string' ? e.code : ''

  if (/[А-Яа-яЁё]/.test(message)) return message
  if (code === '42501') return 'Недостаточно прав для этого действия.'
  if (code === '23514') return 'Проверьте введённые данные: обязательные поля не должны быть пустыми.'
  if (code === 'PGRST301' || /jwt/i.test(message)) return 'Сессия истекла. Войдите в систему заново.'
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Нет связи с сервером. Проверьте подключение к интернету и повторите.'
  }
  if (/timeout|timed out|aborted/i.test(message)) {
    return 'Сервер слишком долго не отвечает. Проверьте подключение к интернету и повторите.'
  }
  return message || 'Что-то пошло не так. Попробуйте ещё раз.'
}

/** Сообщения Supabase Auth при входе. */
export function getAuthErrorMessage(error: { message?: string; code?: string; status?: number }): string {
  const message = error.message ?? ''
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'Неверный email или пароль.'
  }
  if (error.code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return 'Email пользователя не подтверждён. Обратитесь к администратору.'
  }
  if (error.status === 429 || /rate limit|too many/i.test(message)) {
    return 'Слишком много попыток входа. Подождите немного и повторите.'
  }
  return getErrorMessage(error)
}
