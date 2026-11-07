import { Alert, Button, Card, Center, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { FullPageLoader } from '../components/PageState'
import { getErrorMessage } from '../lib/errors'

export function LoginPage() {
  const { loading, session, profile, signIn } = useAuth()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v.trim()) ? null : 'Введите email'),
      password: (v) => (v ? null : 'Введите пароль'),
    },
  })

  // Возвращаем туда, откуда пришли (адрес берётся из состояния роутера, а не из строки запроса).
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (loading) return <FullPageLoader />
  if (session && profile) return <Navigate to={from} replace />

  const submit = form.onSubmit(async ({ email, password }) => {
    setSubmitting(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <Center mih="100vh" p="md">
      <Card withBorder shadow="sm" padding="xl" radius="md" w="100%" maw={400}>
        <form onSubmit={submit}>
          <Stack>
            <div>
              <Title order={2}>Вход</Title>
              <Text c="dimmed" size="sm">
                Объекты и задачи
              </Text>
            </div>

            <TextInput
              label="Email"
              placeholder="name@company.ru"
              autoComplete="username"
              type="email"
              data-autofocus
              {...form.getInputProps('email')}
            />
            <PasswordInput label="Пароль" autoComplete="current-password" {...form.getInputProps('password')} />

            {error && <Alert color="red">{error}</Alert>}

            <Button type="submit" loading={submitting} fullWidth>
              Войти
            </Button>

            <Text size="xs" c="dimmed" ta="center">
              Самостоятельная регистрация отключена. Доступ выдаёт администратор.
            </Text>
          </Stack>
        </form>
      </Card>
    </Center>
  )
}
