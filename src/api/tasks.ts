import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Task, TaskStatus, TaskWithRefs } from '../lib/types'

// Задача вместе с объектом, исполнителем и автором. Для профилей указано имя внешнего ключа,
// потому что на profiles ссылаются два поля (исполнитель и автор).
const TASK_SELECT =
  '*, object:objects(id, name, address), executor:profiles!tasks_executor_id_fkey(id, full_name), author:profiles!tasks_author_id_fkey(id, full_name)'

/** Все задачи, видимые пользователю: постановщик — все, исполнитель — только свои. */
export function useTasks() {
  return useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: async (): Promise<TaskWithRefs[]> => {
      const { data, error } = await supabase.from('tasks').select(TASK_SELECT).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useObjectTasks(objectId: string | undefined) {
  return useQuery({
    queryKey: ['tasks', 'object', objectId],
    queryFn: async (): Promise<TaskWithRefs[]> => {
      if (!objectId) return []
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .eq('object_id', objectId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Лёгкая выборка для счётчиков на странице объектов. */
export function useTaskSummaries() {
  return useQuery({
    queryKey: ['tasks', 'summary'],
    queryFn: async (): Promise<Pick<Task, 'id' | 'object_id' | 'status'>[]> => {
      const { data, error } = await supabase.from('tasks').select('id, object_id, status')
      if (error) throw error
      return data
    },
  })
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: async (): Promise<TaskWithRefs | null> => {
      if (!id) return null
      const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export interface TaskInput {
  id?: string
  title: string
  description: string
  object_id: string
  executor_id: string
}

export function useSaveTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: TaskInput) => {
      const values = {
        title: input.title.trim(),
        description: input.description.trim(),
        object_id: input.object_id,
        executor_id: input.executor_id,
      }
      if (id) {
        const { data, error } = await supabase.from('tasks').update(values).eq('id', id).select('id')
        if (error) throw error
        if (data.length === 0) throw new Error('Не удалось сохранить: задача не найдена или нет прав на изменение.')
      } else {
        const { error } = await supabase.from('tasks').insert(values)
        if (error) throw error
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('tasks').delete().eq('id', id).select('id')
      if (error) throw error
      if (data.length === 0) throw new Error('Не удалось удалить: задача не найдена или нет прав на удаление.')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
  })
}

export interface ChangeStatusInput {
  taskId: string
  to: TaskStatus
  comment: string
}

/**
 * Смена статуса — только через функцию базы change_task_status: она сама проверяет, кто вызывает,
 * разрешён ли переход и нужен ли комментарий. Интерфейс эти правила лишь повторяет для удобства.
 */
export function useChangeStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, to, comment }: ChangeStatusInput) => {
      const { error } = await supabase.rpc('change_task_status', {
        p_task_id: taskId,
        p_new_status: to,
        p_comment: comment.trim() || null,
      })
      if (error) throw error
    },
    // И при успехе, и при ошибке перечитываем данные: если ошибка вызвана тем, что статус
    // успел измениться (например, другой постановщик уже принял задачу), на экране появится актуальное.
    onSettled: () => {
      void queryClient.invalidateQueries()
    },
  })
}
