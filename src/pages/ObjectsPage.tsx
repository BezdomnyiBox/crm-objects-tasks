import { Anchor, Badge, Button, Group, Stack, Table, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDeleteObject, useObjects } from '../api/objects'
import { useTaskSummaries } from '../api/tasks'
import { useAuth } from '../auth/AuthContext'
import { ConfirmModal } from '../components/ConfirmModal'
import { ObjectFormModal } from '../components/ObjectFormModal'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { getErrorMessage } from '../lib/errors'
import { pluralize } from '../lib/format'
import type { SiteObject } from '../lib/types'

const TASK_FORMS: [string, string, string] = ['задача', 'задачи', 'задач']

export function ObjectsPage() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'

  const objects = useObjects()
  const summaries = useTaskSummaries()
  const remove = useDeleteObject()

  const [createOpened, create] = useDisclosure(false)
  const [editing, setEditing] = useState<SiteObject | null>(null)
  const [deleting, setDeleting] = useState<SiteObject | null>(null)

  // Счётчики по объектам: исполнитель видит только свои задачи, постановщик — все.
  const stats = useMemo(() => {
    const map = new Map<string, { total: number; review: number }>()
    for (const task of summaries.data ?? []) {
      const entry = map.get(task.object_id) ?? { total: 0, review: 0 }
      entry.total += 1
      if (task.status === 'in_review') entry.review += 1
      map.set(task.object_id, entry)
    }
    return map
  }, [summaries.data])

  const deletingTasks = deleting ? (stats.get(deleting.id)?.total ?? 0) : 0

  let content
  if (objects.isPending) {
    content = <LoadingState />
  } else if (objects.isError) {
    content = <ErrorState error={objects.error} onRetry={() => void objects.refetch()} />
  } else if (objects.data.length === 0) {
    content = (
      <EmptyState>
        {isManager ? 'Объектов пока нет. Добавьте первый.' : 'У вас пока нет задач ни по одному объекту.'}
      </EmptyState>
    )
  } else {
    content = (
      <Table.ScrollContainer minWidth={560}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Объект</Table.Th>
              <Table.Th>Адрес</Table.Th>
              <Table.Th>{isManager ? 'Задачи' : 'Ваши задачи'}</Table.Th>
              {isManager && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {objects.data.map((object) => {
              const s = stats.get(object.id)
              return (
                <Table.Tr key={object.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/objects/${object.id}`} fw={600}>
                      {object.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{object.address}</Text>
                  </Table.Td>
                  <Table.Td>
                    {/* Бейдж не сжимается и не обрезается (у Mantine подпись по умолчанию режется многоточием):
                        колонка расширяется под него, а при нехватке места он переносится на новую строку. */}
                    <Group gap={6} wrap="wrap">
                      <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
                        {s?.total ?? 0} {pluralize(s?.total ?? 0, TASK_FORMS)}
                      </Text>
                      {isManager && s && s.review > 0 && (
                        <Badge
                          color="yellow"
                          variant="light"
                          styles={{
                            root: { flexShrink: 0, overflow: 'visible' },
                            label: { overflow: 'visible', textOverflow: 'clip' },
                          }}
                        >
                          на проверке: {s.review}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  {isManager && (
                    <Table.Td>
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        <Button size="xs" variant="default" onClick={() => setEditing(object)}>
                          Изменить
                        </Button>
                        <Button size="xs" variant="light" color="red" onClick={() => setDeleting(object)}>
                          Удалить
                        </Button>
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    )
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Объекты</Title>
        {isManager && <Button onClick={create.open}>Добавить объект</Button>}
      </Group>

      {!isManager && (
        <Text c="dimmed" size="sm">
          Показаны только объекты, по которым у вас есть задачи.
        </Text>
      )}

      {content}

      <ObjectFormModal opened={createOpened} onClose={create.close} />
      <ObjectFormModal opened={editing !== null} onClose={() => setEditing(null)} object={editing ?? undefined} />

      <ConfirmModal
        opened={deleting !== null}
        title="Удалить объект?"
        confirmLabel="Удалить"
        loading={remove.isPending}
        error={remove.isError ? getErrorMessage(remove.error) : null}
        onClose={() => {
          remove.reset()
          setDeleting(null)
        }}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, {
            onSuccess: () => {
              notifications.show({ message: 'Объект удалён', color: 'green' })
              setDeleting(null)
            },
          })
        }}
      >
        <Text size="sm">
          Объект «{deleting?.name}» будет удалён
          {deletingTasks > 0 ? ` вместе со всеми его задачами (${deletingTasks})` : ''}. Действие необратимо.
        </Text>
      </ConfirmModal>
    </Stack>
  )
}
