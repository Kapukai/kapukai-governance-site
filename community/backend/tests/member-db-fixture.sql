create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table auth.users(id uuid primary key,email text not null,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,role text not null default 'authenticated',is_anonymous boolean not null default false);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz,created_at timestamptz not null default now());
insert into auth.users(id,email,email_confirmed_at) values
('11111111-1111-4111-8111-111111111111','owner@example.test',now()),
('22222222-2222-4222-8222-222222222222','alice@example.test',now()),
('33333333-3333-4333-8333-333333333333','bob@example.test',now()),
('44444444-4444-4444-8444-444444444444','eve@example.test',now());
insert into auth.sessions(id,user_id,not_after) select id,id,now()+interval '1 day' from auth.users;
