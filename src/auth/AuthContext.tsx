import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getAuthErrorMessage, getErrorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface AuthValue {
  /** Определяем сессию и загружаем профиль. */
  loading: boolean
  session: Session | null
  /** Профиль вошедшего пользователя: роль и имя. */
  profile: Profile | null
  /** Пользователь вошёл, но профиль получить не удалось. */
  profileError: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const lastUserId = useRef<string | null>(null)

  useEffect(() => {
    // Сразу после подписки приходит событие INITIAL_SESSION с текущей сессией (или null).
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      const nextUserId = next?.user.id ?? null
      // Данные одного пользователя не должны «просочиться» к другому в той же вкладке:
      // при выходе и при смене пользователя кэш очищается целиком.
      if (event === 'SIGNED_OUT' || (lastUserId.current !== null && nextUserId !== lastUserId.current)) {
        queryClient.clear()
      }
      lastUserId.current = nextUserId
      setSession(next)
      setSessionReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const userId = session?.user.id

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Profile | null> => {
      if (!userId) return null
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (error) throw error
      return data
    },
  })

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(getAuthErrorMessage(error))
  }, [])

  const signOut = useCallback(async () => {
    // Локальная сессия сбрасывается даже если сервер не ответил.
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthValue>(() => {
    const loading = !sessionReady || (Boolean(userId) && profileQuery.isPending)
    const profile = profileQuery.data ?? null

    let profileError: string | null = null
    if (!loading && userId && !profile) {
      profileError = profileQuery.error
        ? getErrorMessage(profileQuery.error)
        : 'Для вашей учётной записи не найден профиль. Обратитесь к администратору.'
    }

    return { loading, session, profile, profileError, signIn, signOut }
  }, [sessionReady, userId, session, profileQuery.isPending, profileQuery.data, profileQuery.error, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth нужно вызывать внутри <AuthProvider>')
  return value
}
