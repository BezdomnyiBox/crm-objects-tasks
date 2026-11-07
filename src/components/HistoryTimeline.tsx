import { Group, Text, Timeline } from '@mantine/core'
import { formatDateTime } from '../lib/format'
import type { HistoryEntry } from '../lib/types'
import { StatusBadge } from './StatusBadge'

/** История смены статусов: кто, когда, из какого статуса в какой, комментарий. */
export function HistoryTimeline({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        Записей пока нет.
      </Text>
    )
  }

  return (
    <Timeline active={entries.length - 1} bulletSize={18} lineWidth={2}>
      {entries.map((entry) => (
        <Timeline.Item key={entry.id} title={entry.actor_name || 'Неизвестный пользователь'}>
          <Group gap={8} mt={4}>
            {entry.from_status ? (
              <>
                <StatusBadge status={entry.from_status} size="sm" />
                <Text size="sm" c="dimmed">
                  →
                </Text>
              </>
            ) : (
              <Text size="sm" c="dimmed">
                Задача создана:
              </Text>
            )}
            <StatusBadge status={entry.to_status} size="sm" />
          </Group>
          {entry.comment && (
            <Text size="sm" mt={6} style={{ whiteSpace: 'pre-wrap' }}>
              «{entry.comment}»
            </Text>
          )}
          <Text size="xs" c="dimmed" mt={4}>
            {formatDateTime(entry.created_at)}
          </Text>
        </Timeline.Item>
      ))}
    </Timeline>
  )
}
