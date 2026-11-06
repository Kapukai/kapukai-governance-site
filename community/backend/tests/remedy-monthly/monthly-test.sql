begin;
do $test$
declare m date:=date_trunc('month',now() at time zone 'America/New_York')::date; j uuid; n integer;
begin
insert into public.kapukai_interest_lifecycle_config values(1,'live',now());
insert into public.kapukai_interest_registry select gen_random_uuid(),'fixture'||i||'@example.invalid',case when i=4 then 'suppressed' else 'pending' end from generate_series(1,8) i;
insert into public.kapukai_scoped_subscriptions select id,'remedy_brief',case when email='fixture2@example.invalid' then 'every_other_week' else 'monthly' end,case when email='fixture3@example.invalid' then 'unsubscribed' else 'confirmed' end,now(),null,gen_random_uuid() from public.kapukai_interest_registry where email<>'fixture5@example.invalid';
insert into public.kapukai_crm_outbox values('fixture6@example.invalid',true);
select remedy_news.release(m,now(),'Test','Test body','Fixture') into n;
if n<>3 then raise exception 'Audience % expected 3',n;end if;
begin perform remedy_news.release(m,now(),'Duplicate','body','Fixture');raise exception 'Duplicate monthly release';exception when unique_violation then null;end;
update public.kapukai_scoped_subscriptions set revoked_at=now() where registry_id=(select id from public.kapukai_interest_registry where email='fixture1@example.invalid');
update remedy_news.editions set paused=true;
if exists(select from public.kapukai_monthly_next()) then raise exception 'Paused edition claimed';end if;
update remedy_news.editions set paused=false;
select job_id into j from public.kapukai_monthly_next();
if j is null then raise exception 'No valid claim';end if;
update public.kapukai_scoped_subscriptions set last_intent_id=gen_random_uuid() where registry_id=(select registry_id from remedy_news.jobs where id=j);
if public.kapukai_monthly_may_send(j) then raise exception 'Changed grant sent';end if;
select job_id into j from public.kapukai_monthly_next();
if j is null or not public.kapukai_monthly_may_send(j) then raise exception 'Active grant failed';end if;
perform public.kapukai_monthly_finish(j,'accepted','fixture');perform public.kapukai_monthly_finish(j,'accepted','fixture');
if (select count(*) from public.kapukai_interest_delivery_events)<>1 or exists(select from public.kapukai_monthly_next()) then raise exception 'Duplicate event or recipient';end if;
if has_function_privilege('anon','public.kapukai_monthly_next()','execute') or has_function_privilege('authenticated','remedy_news.release(date,timestamptz,text,text,text)','execute') then raise exception 'Unprivileged dispatch';end if;
end $test$;
rollback;
