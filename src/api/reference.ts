import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { HistoryEntry, PersonRef, Transition } from '../lib/types'

/** Журнал смены статусов задачи: от старых записей к новым. */
export function useHistory(taskId: string | undefined) {
  return useQuery({
    queryKey: ['history', taskId],
    queryFn: async (): Promise<HistoryEntry[]> => {
      if (!taskId) return []
      const { data, error } = await supabase
        .from('task_status_history')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

/** Правила переходов — читаются из базы, чтобы показывать только действительно доступные кнопки. */
export function useTransitions() {
  return useQuery({
    queryKey: ['transitions'],
    queryFn: async (): Promise<Transition[]> => {
      const { data, error } = await supabase.from('task_transitions').select('*')
      if (error) throw error
      return data
    },
    staleTime: Infinity,
  })
}

/** Исполнители для выбора в форме задачи (список видят только постановщики). */
export function useExecutors(enabled: boolean) {
  return useQuery({
    queryKey: ['executors'],
    enabled,
    queryFn: async (): Promise<PersonRef[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'executor')
        .order('full_name')
      if (error) throw error
      return data
    },
  })
}
