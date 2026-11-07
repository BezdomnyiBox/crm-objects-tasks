import { Alert, Button, Group, Modal, Stack } from '@mantine/core'
import type { ReactNode } from 'react'

interface Props {
  opened: boolean
  title: string
  confirmLabel: string
  loading?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
  children: ReactNode
}

/** Подтверждение необратимого действия (удаление). */
export function ConfirmModal({ opened, title, confirmLabel, loading, error, onConfirm, onClose, children }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack>
        {children}
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Отмена
          </Button>
          <Button color="red" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
