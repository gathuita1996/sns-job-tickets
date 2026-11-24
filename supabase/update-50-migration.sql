-- ============================================================================
-- UPDATE 50 -- safe to run more than once. Run it BEFORE deploying the new code.
--
--   A member must complete their profile before they can file a job
--      * public.profile_missing_fields(user) lists what is still empty in a profile. Every one of these is required:
--        full name, username, contact number, gender, date of birth, national ID number, KRA PIN, SHA number, profile
--        picture, and the four bank details (bank name, account number, account name, branch).
--        Title and the employee number are not required (the admin gives the employee number; only admins show a title).
--        "Empty" means nothing but spaces, tabs and line breaks.
--      * A trigger on jobs stops a member who is not complete from filing a new job, with the message
--        "Please update your profile to file this job." (hint: profile_incomplete). It protects the screens' own check,
--        so an out-of-date copy of the app, or anything else that talks to the database, cannot get round it.
--      * Admins are not held to it, and neither are the server's own key or the SQL editor (nobody is signed in there).
--        An admin can still assign a job to a member whose profile is not complete.
--      * Only filing a NEW job is held back. Editing, completing or deleting a job a member already has is not.
--      * Nothing is changed in anyone's profile. Members who are not complete simply see a banner in the app.
--
--   The same list is in the app (src/lib/profileComplete.js). A test fails if the two ever differ.
-- ============================================================================

-- ---- 1. what is still empty in a profile ----------------------------------------------------------------------------
-- Returns the keys, in this order, or null when there is no such profile.
create or replace function public.profile_missing_fields(p_user uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when coalesce(p.full_name, '')     ~ '^[ \t\r\n]*$' then 'full_name'      end,
    case when coalesce(p.username, '')      ~ '^[ \t\r\n]*$' then 'username'       end,
    case when coalesce(p.contact, '')       ~ '^[ \t\r\n]*$' then 'contact'        end,
    case when coalesce(p.gender, '')        ~ '^[ \t\r\n]*$' then 'gender'         end,
    case when p.date_of_birth is null                         then 'date_of_birth'  end,
    case when coalesce(p.id_number, '')     ~ '^[ \t\r\n]*$' then 'id_number'      end,
    case when coalesce(p.kra_pin, '')       ~ '^[ \t\r\n]*$' then 'kra_pin'        end,
    case when coalesce(p.sha_number, '')    ~ '^[ \t\r\n]*$' then 'sha_number'     end,
    case when coalesce(p.avatar_url, '')    ~ '^[ \t\r\n]*$' then 'avatar'         end,
    case when coalesce(b.bank_name, '')     ~ '^[ \t\r\n]*$' then 'bank_name'      end,
    case when coalesce(b.account_number, '') ~ '^[ \t\r\n]*$' then 'account_number' end,
    case when coalesce(b.account_name, '')  ~ '^[ \t\r\n]*$' then 'account_name'   end,
    case when coalesce(b.branch, '')        ~ '^[ \t\r\n]*$' then 'branch'         end
  ], null)
  from public.profiles p
  left join public.staff_bank_details b on b.member_id = p.id
  where p.id = p_user
$$;

-- ---- 2. the guard on new jobs ---------------------------------------------------------------------------------------
create or replace function public.require_complete_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  missing text[];
begin
  -- Nobody signed in (the server's own key, the SQL editor) and admins are not held to it.
  if me is null or public.is_admin() then return new; end if;
  missing := public.profile_missing_fields(me);
  if missing is null or coalesce(array_length(missing, 1), 0) > 0 then
    raise exception 'Please update your profile to file this job.'
      using detail = 'Still empty: ' || coalesce(array_to_string(missing, ', '), 'the whole profile'),
            hint = 'profile_incomplete';
  end if;
  return new;
end $$;

drop trigger if exists trg_require_complete_profile on public.jobs;
create trigger trg_require_complete_profile before insert on public.jobs
  for each row execute function public.require_complete_profile();

-- The two functions are the database's own business: nobody signed in to the app needs to call them.
revoke all on function public.profile_missing_fields(uuid) from public, anon, authenticated;
grant execute on function public.profile_missing_fields(uuid) to service_role;
revoke all on function public.require_complete_profile() from public, anon, authenticated;

notify pgrst, 'reload schema';
