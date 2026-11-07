import { Alert, Button, Center, Stack } from '@mantine/core'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullPageLoader } from '../components/PageState'
import type { AppRole } from '../lib/types'
import { useAuth } from './AuthContext'

/** Пускает только вошедших пользователей с профилем; остальных отправляет на страницу входа. */
export function RequireAuth() {
  const { loading, session, profile, profileError, signOut } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  if (!profile) {
    return (
      <Center h="100vh" p="md">
        <Stack maw={420}>
          <Alert color="red" title="Не удалось войти в систему">
            {profileError}
          </Alert>
          <Button variant="default" onClick={() => void signOut()}>
            Выйти
          </Button>
        </Stack>
      </Center>
    )
  }

  return <Outlet />
}

/**
 * Скрывает экраны, не предназначенные для роли. Это удобство, а не защита:
 * данные всё равно закрыты правилами в базе, даже если открыть адрес вручную.
 */
export function RequireRole({ role }: { role: AppRole }) {
  const { profile } = useAuth()
  if (profile?.role !== role) return <Navigate to="/" replace />
  return <Outlet />
}

/** Главная страница зависит от роли: постановщик — объекты, исполнитель — «Мои задачи». */
export function HomeRedirect() {
  const { profile } = useAuth()
  return <Navigate to={profile?.role === 'executor' ? '/my-tasks' : '/objects'} replace />
}
