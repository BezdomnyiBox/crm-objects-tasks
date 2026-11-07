import type { AppRole, TaskStatus } from './types'

/** Статусы в порядке жизненного цикла задачи. */
export const STATUS_ORDER: TaskStatus[] = ['new', 'in_progress', 'in_review', 'rework', 'accepted']

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  in_review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
}

export const STATUS_COLOR: Record<TaskStatus, string> = {
  new: 'gray',
  in_progress: 'blue',
  in_review: 'yellow',
  accepted: 'green',
  rework: 'red',
}

export const ROLE_LABEL: Record<AppRole, string> = {
  manager: 'Постановщик',
  executor: 'Исполнитель',
}

/** Подписи кнопок действий — по статусу, В КОТОРЫЙ переходит задача. */
export const ACTION_LABEL: Record<TaskStatus, string> = {
  new: 'Создать',
  in_progress: 'Взять в работу',
  in_review: 'Отправить на проверку',
  accepted: 'Принять',
  rework: 'Вернуть на доработку',
}

/** Цвет кнопки действия: принять — зелёная, вернуть — красная. */
export const ACTION_COLOR: Record<TaskStatus, string> = {
  new: 'blue',
  in_progress: 'blue',
  in_review: 'yellow',
  accepted: 'green',
  rework: 'red',
}

/** Максимальная длина комментария — совпадает с ограничением в базе. */
export const COMMENT_MAX_LENGTH = 2000
