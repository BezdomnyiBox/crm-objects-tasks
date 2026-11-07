-- ============================================================================
-- Миграция 2/4: служебная схема, профили для новых пользователей, проверка роли.
-- ============================================================================

-- Служебная схема private не публикуется через API (Supabase отдаёт наружу только public),
-- поэтому функции в ней нельзя вызвать «снаружи» напрямую. Они нужны только самой базе.
create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ----------------------------------------------------------------------------
-- «Я постановщик?» — используется в политиках доступа.
-- security definer: читает profiles в обход RLS, иначе политика на profiles зациклилась бы
-- сама на себя. Если у пользователя нет профиля — ответ «нет».
-- ----------------------------------------------------------------------------
create function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'manager'
  );
$$;

revoke all on function private.is_manager() from public;
grant execute on function private.is_manager() to authenticated;

-- ----------------------------------------------------------------------------
-- Профиль создаётся автоматически при появлении пользователя в Supabase Auth
-- (в том числе когда его добавили вручную в панели Supabase).
--
-- Роль берётся из app_metadata — это поле может записать только администратор
-- (панель Supabase или service_role-ключ), пользователь через API его не изменит.
-- user_metadata пользователь править может, поэтому роль из него НЕ читается.
-- Если роль не указана — по умолчанию «исполнитель» (минимум прав).
-- ----------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        split_part(coalesce(new.email, ''), '@', 1)
      ),
      120
    ),
    case
      when new.raw_app_meta_data ->> 'role' = 'manager' then 'manager'::public.app_role
      else 'executor'::public.app_role
    end
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Профили для пользователей, которые уже были до этой миграции (роль — исполнитель).
insert into public.profiles (id, full_name)
select u.id, left(split_part(coalesce(u.email, ''), '@', 1), 120)
from auth.users u
on conflict (id) do nothing;
