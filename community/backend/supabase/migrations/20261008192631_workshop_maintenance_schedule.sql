-- pg_cron is already installed on the approved Kapukai project.
-- A named schedule updates the existing job rather than creating duplicate jobs.
-- No mail, record deletion, permission grant or public release occurs here.
select cron.schedule(
 'kapukai-workshop-maintenance',
 '*/15 * * * *',
 'select public.kapukai_workshop_maintenance();'
);
