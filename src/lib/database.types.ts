// Типы базы данных (формат как у `supabase gen types typescript`).
//
// Insert/Update у objects и tasks намеренно сужены до тех колонок, на которые у API есть право записи
// (см. миграцию 3, GRANT): статус, автора и дату создания клиент задать не может,
// и TypeScript не даст даже попытаться.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      objects: {
        Row: { id: string; name: string; address: string; created_at: string }
        Insert: { name: string; address: string }
        Update: { name?: string; address?: string }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          full_name: string
          role: Database['public']['Enums']['app_role']
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      task_status_history: {
        Row: {
          id: number
          task_id: string
          from_status: Database['public']['Enums']['task_status'] | null
          to_status: Database['public']['Enums']['task_status']
          actor_id: string
          actor_name: string
          comment: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      task_transitions: {
        Row: {
          from_status: Database['public']['Enums']['task_status']
          to_status: Database['public']['Enums']['task_status']
          actor: 'manager' | 'assignee'
          comment_required: boolean
        }
        Insert: never
        Update: never
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string
          object_id: string
          executor_id: string
          status: Database['public']['Enums']['task_status']
          author_id: string
          created_at: string
        }
        Insert: { title: string; description?: string; object_id: string; executor_id: string }
        Update: { title?: string; description?: string; object_id?: string; executor_id?: string }
        Relationships: [
          {
            foreignKeyName: 'tasks_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_executor_id_fkey'
            columns: ['executor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_object_id_fkey'
            columns: ['object_id']
            isOneToOne: false
            referencedRelation: 'objects'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      change_task_status: {
        Args: {
          p_task_id: string
          p_new_status: Database['public']['Enums']['task_status']
          p_comment?: string | null
        }
        Returns: Database['public']['Tables']['tasks']['Row']
      }
    }
    Enums: {
      app_role: 'manager' | 'executor'
      task_status: 'new' | 'in_progress' | 'in_review' | 'accepted' | 'rework'
    }
    CompositeTypes: { [_ in never]: never }
  }
}
