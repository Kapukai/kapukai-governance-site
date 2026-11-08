create role anon;create role authenticated;create role service_role;
create table public.kapukai_interest_registry(id uuid primary key,email text,status text);
create table public.kapukai_scoped_subscriptions(registry_id uuid,topic text,cadence text,state text,confirmed_at timestamptz,revoked_at timestamptz,last_intent_id uuid);
create table public.kapukai_crm_outbox(email text,hubspot_email_optout boolean);
create table public.kapukai_interest_lifecycle_config(id integer,mode text,postmark_ready_at timestamptz);
create table public.kapukai_interest_delivery_events(registry_id uuid,channel text,provider text,message_type text,delivery_status text,provider_message_id text);
