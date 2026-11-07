import { Alert, Center, Code, Stack, Text, Title } from '@mantine/core'

/** Показывается вместо приложения, если не заданы (или заданы неверно) параметры Supabase. */
export function ConfigError({ message }: { message: string }) {
  return (
    <Center mih="100vh" p="md">
      <Stack maw={560}>
        <Title order={2}>Приложение не настроено</Title>
        <Alert color="red">{message}</Alert>
        <Text size="sm" c="dimmed">
          Создайте файл <Code>.env.local</Code> рядом с <Code>package.json</Code> по образцу <Code>.env.example</Code> и
          перезапустите <Code>npm run dev</Code>.
        </Text>
      </Stack>
    </Center>
  )
}
