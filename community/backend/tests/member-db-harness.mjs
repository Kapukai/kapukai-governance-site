import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export const O='11111111-1111-4111-8111-111111111111', A='22222222-2222-4222-8222-222222222222', B='33333333-3333-4333-8333-333333333333', E='44444444-4444-4444-8444-444444444444';
export async function setup(){const db=new PGlite();await db.exec(await readFile(new URL('./member-db-fixture.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../sql/member_community.sql',import.meta.url),'utf8'));await db.query('insert into kapukai_members.operators(user_id) values($1)',[O]);return db;}
export async function cmd(db,user,action,payload={},session=user){return (await db.query('select public.kapukai_member_command($1,$2,$3,$4::jsonb) r',[user,session,action,JSON.stringify(payload)])).rows[0].r;}
export async function enable(db,max=25){return cmd(db,O,'operator_config',{enabled:true,max_members:max});}
export async function join(db,user){const email=(await db.query('select email from auth.users where id=$1',[user])).rows[0].email;const i=await cmd(db,O,'operator_invite',{email,expires_days:7});return cmd(db,user,'join',{invite_token:i.invite_token,display_name:email.split('@')[0],adult:true,privacy_acknowledged:true});}
export async function profile(db,user,over={}){return cmd(db,user,'profile_save',{display_name:user===A?'Alice':user===B?'Bob':'Owner',bio:'Independent work',interests:['tools','independent_review'],discoverable:true,reviewer_opt_in:false,reviewer_scopes:[],...over});}
export async function pub(db){return (await db.query('select kapukai_member_public() r')).rows[0].r;}
