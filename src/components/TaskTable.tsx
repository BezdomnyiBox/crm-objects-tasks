import { Anchor, Table, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import { formatDate } from '../lib/format'
import type { TaskWithRefs } from '../lib/types'
import { EmptyState } from './PageState'
import { StatusBadge } from './StatusBadge'

interface Props {
  tasks: TaskWithRefs[]
  showObject?: boolean
  showExecutor?: boolean
  emptyText: string
}

export function TaskTable({ tasks, showObject = false, showExecutor = false, emptyText }: Props) {
  if (tasks.length === 0) return <EmptyState>{emptyText}</EmptyState>

  return (
    <Table.ScrollContainer minWidth={560}>
      <Table highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Задача</Table.Th>
            {showObject && <Table.Th>Объект</Table.Th>}
            {showExecutor && <Table.Th>Исполнитель</Table.Th>}
            <Table.Th>Статус</Table.Th>
            <Table.Th>Создана</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tasks.map((task) => (
            <Table.Tr key={task.id}>
              <Table.Td>
                <Anchor component={Link} to={`/tasks/${task.id}`} fw={500}>
                  {task.title}
                </Anchor>
              </Table.Td>
              {showObject && (
                <Table.Td>
                  {task.object ? (
                    <Anchor component={Link} to={`/objects/${task.object.id}`} size="sm">
                      {task.object.name}
                    </Anchor>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )}
                </Table.Td>
              )}
              {showExecutor && <Table.Td>{task.executor?.full_name || '—'}</Table.Td>}
              <Table.Td>
                <StatusBadge status={task.status} />
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {formatDate(task.created_at)}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
