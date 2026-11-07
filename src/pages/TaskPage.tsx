import { Anchor, Breadcrumbs, Button, Card, Divider, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useHistory } from '../api/reference'
import { useDeleteTask, useTask } from '../api/tasks'
import { useAuth } from '../auth/AuthContext'
import { ConfirmModal } from '../components/ConfirmModal'
import { HistoryTimeline } from '../components/HistoryTimeline'
import { ErrorState, LoadingState, NotFoundState } from '../components/PageState'
import { StatusActions } from '../components/StatusActions'
import { StatusBadge } from '../components/StatusBadge'
import { TaskFormModal } from '../components/TaskFormModal'
import { getErrorMessage } from '../lib/errors'
import { formatDateTime } from '../lib/format'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      {children}
    </div>
  )
}

export function TaskPage() {
  const { taskId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const task = useTask(taskId)
  const history = useHistory(taskId)
  const remove = useDeleteTask()

  const [editOpened, edit] = useDisclosure(false)
  const [deleteOpened, del] = useDisclosure(false)

  if (!profile) return null
  const isManager = profile.role === 'manager'

  if (task.isPending) return <LoadingState />
  if (task.isError) return <ErrorState error={task.error} onRetry={() => void task.refetch()} />
  if (!task.data) {
    return (
      <NotFoundState
        title="Задача не найдена"
        backTo={isManager ? '/tasks' : '/my-tasks'}
        backLabel={isManager ? 'Ко всем задачам' : 'К моим задачам'}
      />
    )
  }

  const t = task.data

  return (
    <Stack gap="lg">
      <Breadcrumbs>
        <Anchor component={Link} to="/objects">
          Объекты
        </Anchor>
        {t.object && (
          <Anchor component={Link} to={`/objects/${t.object.id}`}>
            {t.object.name}
          </Anchor>
        )}
        <Text span>{t.title}</Text>
      </Breadcrumbs>

      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap="xs">
          <Title order={2}>{t.title}</Title>
          <div>
            <StatusBadge status={t.status} size="lg" />
          </div>
        </Stack>
        {isManager && (
          <Group gap="xs" wrap="nowrap">
            <Button variant="default" onClick={edit.open}>
              Изменить
            </Button>
            <Button variant="light" color="red" onClick={del.open}>
              Удалить
            </Button>
          </Group>
        )}
      </Group>

      <Card withBorder>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Field label="Объект">
            {t.object ? (
              <>
                <Anchor component={Link} to={`/objects/${t.object.id}`}>
                  {t.object.name}
                </Anchor>
                <Text size="sm" c="dimmed">
                  {t.object.address}
                </Text>
              </>
            ) : (
              <Text>—</Text>
            )}
          </Field>
          <Field label="Исполнитель">
            <Text>{t.executor?.full_name || '—'}</Text>
          </Field>
          <Field label="Постановщик (автор)">
            <Text>{t.author?.full_name || '—'}</Text>
          </Field>
          <Field label="Создана">
            <Text>{formatDateTime(t.created_at)}</Text>
          </Field>
        </SimpleGrid>

        <Divider my="md" label="Описание" labelPosition="left" />
        <Text style={{ whiteSpace: 'pre-wrap' }} c={t.description ? undefined : 'dimmed'}>
          {t.description || 'Описание не указано.'}
        </Text>
      </Card>

      <Card withBorder>
        <Title order={4} mb="sm">
          Действия
        </Title>
        <StatusActions task={t} me={profile} />
      </Card>

      <Card withBorder>
        <Title order={4} mb="md">
          История
        </Title>
        {history.isPending ? (
          <LoadingState />
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => void history.refetch()} />
        ) : (
          <HistoryTimeline entries={history.data} />
        )}
      </Card>

      <TaskFormModal opened={editOpened} onClose={edit.close} task={t} />

      <ConfirmModal
        opened={deleteOpened}
        title="Удалить задачу?"
        confirmLabel="Удалить"
        loading={remove.isPending}
        error={remove.isError ? getErrorMessage(remove.error) : null}
        onClose={() => {
          remove.reset()
          del.close()
        }}
        onConfirm={() =>
          remove.mutate(t.id, {
            onSuccess: () => {
              notifications.show({ message: 'Задача удалена', color: 'green' })
              void navigate(t.object ? `/objects/${t.object.id}` : '/objects')
            },
          })
        }
      >
        <Text size="sm">Задача «{t.title}» будет удалена. Действие необратимо.</Text>
      </ConfirmModal>
    </Stack>
  )
}
