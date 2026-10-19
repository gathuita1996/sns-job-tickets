-- =============================================================================
-- SNS Job Cards -- UPDATE 38.  Run once in the SQL editor of your live project (safe to re-run).
--   Fixes "Log a service": it was refused by the database because a service has no category.
-- =============================================================================
-- Services have no purchase category, but the expenses table insists on one, so every "Log a service"
-- was refused. A service now gets the category "Service" automatically.
alter table public.expenses alter column category set default 'Service';
