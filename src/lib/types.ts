import type { Database } from './database.types'

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']

export type AppRole = Database['public']['Enums']['app_role']
export type TaskStatus = Database['public']['Enums']['task_status']

export type Profile = Row<'profiles'>
export type SiteObject = Row<'objects'> // «объект» = стройка
export type Task = Row<'tasks'>
export type HistoryEntry = Row<'task_status_history'>
export type Transition = Row<'task_transitions'>

/** Краткие сведения о человеке, которые подтягиваются вместе с задачей. */
export type PersonRef = Pick<Profile, 'id' | 'full_name'>

/** Задача вместе с объектом, исполнителем и автором — для списков и карточки. */
export type TaskWithRefs = Task & {
  object: Pick<SiteObject, 'id' | 'name' | 'address'> | null
  executor: PersonRef | null
  author: PersonRef | null
}
