import { Anchor, AppShell, Badge, Button, Container, Group, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { Link, Outlet, useMatch } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABEL } from '../lib/labels'

/**
 * Пункт меню. По умолчанию подсвечивается и для вложенных адресов (карточка объекта — «Объекты»);
 * `exact` — только для самого адреса: иначе «Все задачи» горели бы и на карточке задачи (/tasks/…).
 */
function NavItem({ to, exact = false, children }: { to: string; exact?: boolean; children: ReactNode }) {
  const active = useMatch({ path: to, end: exact }) !== null
  return (
    <Anchor component={Link} to={to} fw={active ? 700 : 500} c={active ? 'blue.7' : 'dark.5'} underline="never">
      {children}
    </Anchor>
  )
}

export function Layout() {
  const { profile, signOut } = useAuth()
  const isManager = profile?.role === 'manager'

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="lg" wrap="nowrap">
            <Text fw={800} size="lg" visibleFrom="sm">
              Стройка · Задачи
            </Text>
            {isManager ? (
              <>
                <NavItem to="/objects">Объекты</NavItem>
                <NavItem to="/tasks" exact>
                  Все задачи
                </NavItem>
              </>
            ) : (
              <>
                <NavItem to="/my-tasks" exact>
                  Мои задачи
                </NavItem>
                <NavItem to="/objects">Объекты</NavItem>
              </>
            )}
          </Group>

          <Group gap="sm" wrap="nowrap">
            {profile && (
              <>
                <Text size="sm" fw={500} visibleFrom="sm">
                  {profile.full_name}
                </Text>
                <Badge variant="outline" color={isManager ? 'violet' : 'teal'}>
                  {ROLE_LABEL[profile.role]}
                </Badge>
              </>
            )}
            <Button size="xs" variant="default" onClick={() => void signOut()}>
              Выйти
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="lg" py="md">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
