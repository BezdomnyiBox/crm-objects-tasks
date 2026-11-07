import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { HomeRedirect, RequireAuth, RequireRole } from './auth/guards'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ObjectPage } from './pages/ObjectPage'
import { ObjectsPage } from './pages/ObjectsPage'
import { TaskPage } from './pages/TaskPage'
import { TasksPage } from './pages/TasksPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route index element={<HomeRedirect />} />
                <Route path="objects" element={<ObjectsPage />} />
                <Route path="objects/:objectId" element={<ObjectPage />} />
                <Route path="tasks/:taskId" element={<TaskPage />} />

                <Route element={<RequireRole role="executor" />}>
                  <Route path="my-tasks" element={<TasksPage mode="mine" />} />
                </Route>
                <Route element={<RequireRole role="manager" />}>
                  <Route path="tasks" element={<TasksPage mode="all" />} />
                </Route>

                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
