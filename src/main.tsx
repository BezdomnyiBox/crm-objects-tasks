import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'

import { createTheme, MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigError } from './components/ConfigError'
import { readConfig } from './lib/config'

const theme = createTheme({ primaryColor: 'blue', defaultRadius: 'md' })

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('В index.html не найден элемент #root')
const root = createRoot(rootElement)

// Сначала проверяем конфигурацию, и только потом загружаем приложение (оно подключается к Supabase).
// Так при ошибке настройки вместо пустого экрана пользователь видит понятное объяснение.
const config = readConfig()

if (!config.ok) {
  root.render(
    <MantineProvider theme={theme} forceColorScheme="light">
      <ConfigError message={config.error} />
    </MantineProvider>,
  )
} else {
  void import('./App').then(({ App }) => {
    root.render(
      <StrictMode>
        <MantineProvider theme={theme} forceColorScheme="light">
          <Notifications position="top-right" />
          <App />
        </MantineProvider>
      </StrictMode>,
    )
  })
}
