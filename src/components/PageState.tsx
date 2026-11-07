import { Alert, Button, Center, Loader, Stack, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '../lib/errors'

export function FullPageLoader() {
  return (
    <Center h="100vh">
      <Loader />
    </Center>
  )
}

export function LoadingState() {
  return (
    <Center py="xl">
      <Loader />
    </Center>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert color="red" title="Не удалось загрузить данные">
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{getErrorMessage(error)}</Text>
        {onRetry && (
          <Button size="xs" variant="light" color="red" onClick={onRetry}>
            Повторить
          </Button>
        )}
      </Stack>
    </Alert>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Text c="dimmed" ta="center" py="xl">
      {children}
    </Text>
  )
}

/**
 * «Не найдено» — и для несуществующих записей, и для чужих: база не показывает исполнителю
 * даже сам факт существования чужой задачи или объекта, поэтому текст одинаковый.
 */
export function NotFoundState({ title, backTo, backLabel }: { title: string; backTo: string; backLabel: string }) {
  return (
    <Stack align="center" py="xl" gap="sm">
      <Title order={3}>{title}</Title>
      <Text c="dimmed" ta="center">
        Возможно, запись удалена или у вас нет к ней доступа.
      </Text>
      <Button component={Link} to={backTo} variant="light">
        {backLabel}
      </Button>
    </Stack>
  )
}
