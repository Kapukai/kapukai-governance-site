-- Run using the authorized Supabase SQL editor, never expose this query publicly.
select public.kapukai_crm_health() as crm_health;
select kind,state,owner_id,next_action,due_at,first_seen_at,last_seen_at,evidence
from kapukai_operations.incidents where state='open' order by due_at;
select contact_id,purpose,stage,owner_id,next_action,due_at,revision
from kapukai_operations.commitments where stage not in ('completed','withdrawn') order by due_at;
select purpose,stage,count(*) from kapukai_operations.commitments group by purpose,stage order by purpose,stage;
-- Outcome counts are commitments, not necessarily distinct people.
