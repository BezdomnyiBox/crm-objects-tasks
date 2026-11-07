import { Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { useMemo, useState } from 'react'
import { useTasks } from '../api/tasks'
import { useAuth } from '../auth/AuthContext'
import { ErrorState, LoadingState } from '../components/PageState'
import { TaskTable } from '../components/TaskTable'
import { STATUS_LABEL, STATUS_ORDER } from '../lib/labels'
import type { TaskStatus } from '../lib/types'
import { sortByAttention } from '../lib/workflow'

type Filter = TaskStatus | 'all'

/**
 * Один экран для двух ролей: исполнитель видит «Мои задачи», постановщик — «Все задачи».
 * Что именно попадёт в список, решает база: исполнитель физически получает только свои задачи.
 */
export function TasksPage({ mode }: { mode: 'mine' | 'all' }) {
  const { profile } = useAuth()
  const tasks = useTasks()
  const [filter, setFilter] = useState<Filter>('all')

  const role = profile?.role
  const sorted = useMemo(() => (role && tasks.data ? sortByAttention(tasks.data, role) : []), [tasks.data, role])

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: sorted.length, new: 0, in_progress: 0, in_review: 0, rework: 0, accepted: 0 }
    for (const t of sorted) result[t.status] += 1
    return result
  }, [sorted])

  const visible = filter === 'all' ? sorted : sorted.filter((t) => t.status === filter)
  const title = mode === 'mine' ? 'Мои задачи' : 'Все задачи'

  return (
    <Stack>
      <div>
        <Title order={2}>{title}</Title>
        <Text c="dimmed" size="sm">
          {mode === 'mine'
            ? 'Только задачи, назначенные на вас. Сверху — те, что требуют вашего внимания.'
            : 'Задачи по всем объектам. Сверху — те, что ждут вашей проверки.'}
        </Text>
      </div>

      <Group gap="xs">
        {(['all', ...STATUS_ORDER] as Filter[]).map((key) => (
          <Button
            key={key}
            size="xs"
            variant={filter === key ? 'filled' : 'default'}
            onClick={() => setFilter(key)}
            disabled={key !== 'all' && counts[key] === 0 && filter !== key}
          >
            {key === 'all' ? 'Все' : STATUS_LABEL[key]} · {counts[key]}
          </Button>
        ))}
      </Group>

      <Card withBorder>
        {tasks.isPending ? (
          <LoadingState />
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : (
          <TaskTable
            tasks={visible}
            showObject
            showExecutor={mode === 'all'}
            emptyText={
              filter === 'all'
                ? mode === 'mine'
                  ? 'Вам пока не назначено ни одной задачи.'
                  : 'Задач пока нет.'
                : 'Нет задач с таким статусом.'
            }
          />
        )}
      </Card>
    </Stack>
  )
}
