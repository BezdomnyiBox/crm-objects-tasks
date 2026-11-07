import type { AppRole, Profile, Task, TaskStatus, Transition } from './types'

// В каком порядке показывать задачи: сверху — то, что требует внимания именно этой роли.
const ATTENTION_ORDER: Record<AppRole, TaskStatus[]> = {
  executor: ['rework', 'new', 'in_progress', 'in_review', 'accepted'],
  manager: ['in_review', 'rework', 'new', 'in_progress', 'accepted'],
}

/** Сортировка: сначала по «срочности» статуса для роли, внутри статуса — новые выше. */
export function sortByAttention<T extends Pick<Task, 'status' | 'created_at'>>(tasks: T[], role: AppRole): T[] {
  const rank = new Map(ATTENTION_ORDER[role].map((status, index) => [status, index]))
  return [...tasks].sort(
    (a, b) =>
      (rank.get(a.status) ?? 99) - (rank.get(b.status) ?? 99) || Date.parse(b.created_at) - Date.parse(a.created_at),
  )
}

/**
 * Какие переходы доступны пользователю для задачи — по той же таблице правил, что и в базе:
 *  • «manager»  — любой постановщик;
 *  • «assignee» — исполнитель, назначенный именно на эту задачу.
 *
 * Это только подсказка для интерфейса (показать нужные кнопки). Настоящая проверка
 * выполняется в базе при вызове change_task_status — подделать её из браузера нельзя.
 */
export function getAvailableTransitions(
  transitions: Transition[],
  task: Pick<Task, 'status' | 'executor_id'>,
  me: Pick<Profile, 'id' | 'role'>,
): Transition[] {
  return transitions.filter((t) => {
    if (t.from_status !== task.status) return false
    if (t.actor === 'manager') return me.role === 'manager'
    return me.role === 'executor' && task.executor_id === me.id
  })
}
