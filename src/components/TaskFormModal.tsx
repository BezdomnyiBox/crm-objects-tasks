import { Alert, Button, Group, Modal, Select, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useObjects } from '../api/objects'
import { useExecutors } from '../api/reference'
import { useSaveTask } from '../api/tasks'
import { getErrorMessage } from '../lib/errors'
import type { TaskWithRefs } from '../lib/types'

interface Props {
  opened: boolean
  onClose: () => void
  /** Если передана — форма редактирования, иначе — создания. */
  task?: TaskWithRefs
  /** При создании из карточки объекта объект зафиксирован. */
  objectId?: string
}

export function TaskFormModal({ opened, onClose, task, objectId }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={task ? 'Изменить задачу' : 'Новая задача'} centered size="lg">
      <TaskForm task={task} objectId={objectId} onDone={onClose} />
    </Modal>
  )
}

function TaskForm({ task, objectId, onDone }: { task?: TaskWithRefs; objectId?: string; onDone: () => void }) {
  const save = useSaveTask()
  const executors = useExecutors(true)
  const objects = useObjects()

  const form = useForm({
    initialValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      object_id: task?.object_id ?? objectId ?? '',
      executor_id: task?.executor_id ?? '',
    },
    validate: {
      title: (v) => (!v.trim() ? 'Введите название' : v.length > 200 ? 'Не длиннее 200 символов' : null),
      description: (v) => (v.length > 5000 ? 'Не длиннее 5000 символов' : null),
      object_id: (v) => (v ? null : 'Выберите объект'),
      executor_id: (v) => (v ? null : 'Выберите исполнителя'),
    },
  })

  const submit = form.onSubmit((values) => {
    save.mutate(
      { id: task?.id, ...values },
      {
        onSuccess: () => {
          notifications.show({ message: task ? 'Задача сохранена' : 'Задача создана', color: 'green' })
          onDone()
        },
      },
    )
  })

  const executorOptions = (executors.data ?? []).map((p) => ({ value: p.id, label: p.full_name || p.id }))
  const objectOptions = (objects.data ?? []).map((o) => ({ value: o.id, label: o.name }))

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Название" placeholder="Что нужно сделать" withAsterisk data-autofocus {...form.getInputProps('title')} />
        <Textarea
          label="Описание"
          placeholder="Подробности, требования, ссылки на документы"
          autosize
          minRows={3}
          maxRows={10}
          {...form.getInputProps('description')}
        />

        {/* Объект выбирается только при редактировании: при создании из карточки объекта он уже известен. */}
        {task && (
          <Select
            label="Объект"
            withAsterisk
            data={objectOptions}
            placeholder={objects.isPending ? 'Загрузка…' : 'Выберите объект'}
            {...form.getInputProps('object_id')}
          />
        )}

        <Select
          label="Исполнитель"
          withAsterisk
          data={executorOptions}
          placeholder={executors.isPending ? 'Загрузка…' : 'Выберите исполнителя'}
          nothingFoundMessage="Нет пользователей с ролью «Исполнитель»"
          {...form.getInputProps('executor_id')}
        />
        {executors.isError && <Text size="sm" c="red">{getErrorMessage(executors.error)}</Text>}
        {executors.data?.length === 0 && (
          <Text size="sm" c="dimmed">
            Исполнителей пока нет: роль выдаёт администратор базы.
          </Text>
        )}

        {save.isError && <Alert color="red">{getErrorMessage(save.error)}</Alert>}

        <Group justify="flex-end">
          <Button variant="default" onClick={onDone} disabled={save.isPending}>
            Отмена
          </Button>
          <Button type="submit" loading={save.isPending}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
