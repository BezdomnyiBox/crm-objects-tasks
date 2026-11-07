import { Alert, Button, Group, Modal, Stack, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useSaveObject } from '../api/objects'
import { getErrorMessage } from '../lib/errors'
import type { SiteObject } from '../lib/types'

interface Props {
  opened: boolean
  onClose: () => void
  /** Если передан — форма редактирования, иначе — создания. */
  object?: SiteObject
}

export function ObjectFormModal({ opened, onClose, object }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={object ? 'Изменить объект' : 'Новый объект'} centered>
      {/* Форма живёт, пока окно открыто, поэтому при каждом открытии поля заполняются заново. */}
      <ObjectForm object={object} onDone={onClose} />
    </Modal>
  )
}

function ObjectForm({ object, onDone }: { object?: SiteObject; onDone: () => void }) {
  const save = useSaveObject()
  const form = useForm({
    initialValues: { name: object?.name ?? '', address: object?.address ?? '' },
    validate: {
      name: (v) => (!v.trim() ? 'Введите название' : v.length > 200 ? 'Не длиннее 200 символов' : null),
      address: (v) => (!v.trim() ? 'Введите адрес' : v.length > 300 ? 'Не длиннее 300 символов' : null),
    },
  })

  const submit = form.onSubmit((values) => {
    save.mutate(
      { id: object?.id, ...values },
      {
        onSuccess: () => {
          notifications.show({ message: object ? 'Объект сохранён' : 'Объект создан', color: 'green' })
          onDone()
        },
      },
    )
  })

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput
          label="Название"
          placeholder="ЖК «Северный», корпус 2"
          withAsterisk
          data-autofocus
          {...form.getInputProps('name')}
        />
        <TextInput label="Адрес" placeholder="Москва, ул. Полярная, 25" withAsterisk {...form.getInputProps('address')} />
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
