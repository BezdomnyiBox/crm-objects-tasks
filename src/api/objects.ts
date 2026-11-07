import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { SiteObject } from '../lib/types'

/** Объекты, видимые текущему пользователю (исполнитель — только те, где у него есть задачи). */
export function useObjects() {
  return useQuery({
    queryKey: ['objects'],
    queryFn: async (): Promise<SiteObject[]> => {
      const { data, error } = await supabase.from('objects').select('*').order('name')
      if (error) throw error
      return data
    },
  })
}

export function useObject(id: string | undefined) {
  return useQuery({
    queryKey: ['object', id],
    queryFn: async (): Promise<SiteObject | null> => {
      if (!id) return null
      const { data, error } = await supabase.from('objects').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export interface ObjectInput {
  id?: string
  name: string
  address: string
}

export function useSaveObject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, address }: ObjectInput) => {
      const values = { name: name.trim(), address: address.trim() }
      if (id) {
        // .select() нужен, чтобы заметить «обновилось 0 строк» (так база отвечает, если прав нет)
        const { data, error } = await supabase.from('objects').update(values).eq('id', id).select('id')
        if (error) throw error
        if (data.length === 0) throw new Error('Не удалось сохранить: объект не найден или нет прав на изменение.')
      } else {
        const { error } = await supabase.from('objects').insert(values)
        if (error) throw error
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
  })
}

export function useDeleteObject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('objects').delete().eq('id', id).select('id')
      if (error) throw error
      if (data.length === 0) throw new Error('Не удалось удалить: объект не найден или нет прав на удаление.')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
  })
}
