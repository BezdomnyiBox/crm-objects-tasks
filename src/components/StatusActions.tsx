import { Alert, Button, Group, Loader, Modal, Stack, Text, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'
import { useTransitions } from '../api/reference'
import { useChangeStatus } from '../api/tasks'
import { getErrorMessage } from '../lib/errors'
import { ACTION_COLOR, ACTION_LABEL, COMMENT_MAX_LENGTH, STATUS_LABEL } from '../lib/labels'
import type { Profile, TaskWithRefs, Transition } from '../lib/types'
import { getAvailableTransitions } from '../lib/workflow'
import { StatusBadge } from './StatusBadge'

interface Props {
  task: TaskWithRefs
  me: Profile
}

/** Показывает только те действия, которые текущему пользователю доступны в текущем статусе задачи. */
export function StatusActions({ task, me }: Props) {
  const transitions = useTransitions()
  const [selected, setSelected] = useState<Transition | null>(null)

  if (transitions.isPending) return <Loader size="sm" />
  if (transitions.isError) {
    return (
      <Text size="sm" c="red">
        {getErrorMessage(transitions.error)}
      </Text>
    )
  }

  const available = getAvailableTransitions(transitions.data, task, me)

  return (
    <>
      {available.length === 0 ? (
        <Text c="dimmed" size="sm">
          {noActionsHint(task, me)}
        </Text>
      ) : (
        <Group>
          {available.map((t) => (
            <Button key={`${t.from_status}>${t.to_status}`} color={ACTION_COLOR[t.to_status]} onClick={() => setSelected(t)}>
              {ACTION_LABEL[t.to_status]}
            </Button>
          ))}
        </Group>
      )}

      <Modal
        opened={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? ACTION_LABEL[selected.to_status] : ''}
        centered
      >
        {selected && <StatusChangeForm task={task} transition={selected} onDone={() => setSelected(null)} />}
      </Modal>
    </>
  )
}

function noActionsHint(task: TaskWithRefs, me: Profile): string {
  if (task.status === 'accepted') return 'Задача принята — дальнейших действий не требуется.'
  if (me.role === 'manager') return 'Сейчас ход за исполнителем — от вас действий не требуется.'
  if (task.status === 'in_review') return 'Задача на проверке у постановщика.'
  return 'Для вас нет доступных действий.'
}

function StatusChangeForm({
  task,
  transition,
  onDone,
}: {
  task: TaskWithRefs
  transition: Transition
  onDone: () => void
}) {
  const change = useChangeStatus()
  const required = transition.comment_required

  const form = useForm({
    initialValues: { comment: '' },
    validate: {
      comment: (v) =>
        required && !v.trim()
          ? 'Комментарий обязателен: объясните, что нужно доработать'
          : v.length > COMMENT_MAX_LENGTH
            ? `Не длиннее ${COMMENT_MAX_LENGTH} символов`
            : null,
    },
  })

  const submit = form.onSubmit(({ comment }) => {
    change.mutate(
      { taskId: task.id, to: transition.to_status, comment },
      {
        onSuccess: () => {
          notifications.show({ message: `Статус изменён: «${STATUS_LABEL[transition.to_status]}»`, color: 'green' })
          onDone()
        },
      },
    )
  })

  return (
    <form onSubmit={submit}>
      <Stack>
        <Group gap="xs">
          <StatusBadge status={transition.from_status} size="sm" />
          <Text size="sm" c="dimmed">
            →
          </Text>
          <StatusBadge status={transition.to_status} size="sm" />
        </Group>

        <Textarea
          label={required ? 'Комментарий (обязательно)' : 'Комментарий (необязательно)'}
          placeholder={required ? 'Что нужно исправить?' : 'Например: что сделано'}
          withAsterisk={required}
          autosize
          minRows={3}
          maxRows={8}
          maxLength={COMMENT_MAX_LENGTH}
          data-autofocus
          {...form.getInputProps('comment')}
        />

        {change.isError && <Alert color="red">{getErrorMessage(change.error)}</Alert>}

        <Group justify="flex-end">
          <Button variant="default" onClick={onDone} disabled={change.isPending}>
            Отмена
          </Button>
          <Button type="submit" color={ACTION_COLOR[transition.to_status]} loading={change.isPending}>
            {ACTION_LABEL[transition.to_status]}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
