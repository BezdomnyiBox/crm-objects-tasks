import { Anchor, Breadcrumbs, Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDeleteObject, useObject } from '../api/objects'
import { useObjectTasks } from '../api/tasks'
import { useAuth } from '../auth/AuthContext'
import { ConfirmModal } from '../components/ConfirmModal'
import { ObjectFormModal } from '../components/ObjectFormModal'
import { ErrorState, LoadingState, NotFoundState } from '../components/PageState'
import { TaskFormModal } from '../components/TaskFormModal'
import { TaskTable } from '../components/TaskTable'
import { getErrorMessage } from '../lib/errors'
import { sortByAttention } from '../lib/workflow'

export function ObjectPage() {
  const { objectId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const object = useObject(objectId)
  const tasks = useObjectTasks(objectId)
  const remove = useDeleteObject()

  const [editOpened, edit] = useDisclosure(false)
  const [taskOpened, newTask] = useDisclosure(false)
  const [deleteOpened, del] = useDisclosure(false)

  const role = profile?.role
  const sortedTasks = useMemo(() => (role && tasks.data ? sortByAttention(tasks.data, role) : []), [tasks.data, role])

  if (!profile) return null
  const isManager = profile.role === 'manager'

  if (object.isPending || tasks.isPending) return <LoadingState />
  if (object.isError) return <ErrorState error={object.error} onRetry={() => void object.refetch()} />
  if (!object.data) {
    return <NotFoundState title="Объект не найден" backTo="/objects" backLabel="К списку объектов" />
  }

  const site = object.data

  return (
    <Stack gap="lg">
      <Breadcrumbs>
        <Anchor component={Link} to="/objects">
          Объекты
        </Anchor>
        <Text span>{site.name}</Text>
      </Breadcrumbs>

      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{site.name}</Title>
          <Text c="dimmed">{site.address}</Text>
        </div>
        {isManager && (
          <Group gap="xs">
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
        <Group justify="space-between" mb="sm">
          <Title order={4}>Задачи объекта</Title>
          {isManager && <Button onClick={newTask.open}>Новая задача</Button>}
        </Group>

        {!isManager && (
          <Text c="dimmed" size="sm" mb="sm">
            Показаны только ваши задачи по этому объекту.
          </Text>
        )}

        {tasks.isError ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : (
          <TaskTable
            tasks={sortedTasks}
            showExecutor={isManager}
            emptyText={isManager ? 'По этому объекту задач пока нет.' : 'У вас нет задач по этому объекту.'}
          />
        )}
      </Card>

      <ObjectFormModal opened={editOpened} onClose={edit.close} object={site} />
      <TaskFormModal opened={taskOpened} onClose={newTask.close} objectId={site.id} />

      <ConfirmModal
        opened={deleteOpened}
        title="Удалить объект?"
        confirmLabel="Удалить"
        loading={remove.isPending}
        error={remove.isError ? getErrorMessage(remove.error) : null}
        onClose={() => {
          remove.reset()
          del.close()
        }}
        onConfirm={() =>
          remove.mutate(site.id, {
            onSuccess: () => {
              notifications.show({ message: 'Объект удалён', color: 'green' })
              void navigate('/objects')
            },
          })
        }
      >
        <Text size="sm">
          Объект «{site.name}» будет удалён
          {sortedTasks.length > 0 ? ` вместе со всеми его задачами (${sortedTasks.length})` : ''}. Действие необратимо.
        </Text>
      </ConfirmModal>
    </Stack>
  )
}
