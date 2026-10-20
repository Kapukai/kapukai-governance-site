import {readFile} from 'node:fs/promises';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {setup as memberSetup,enable,cmd,O,A,B,E} from './member-db-harness.mjs';
export {enable,cmd,O,A,B,E};
export const CONSENT='kapukai-member-access-v1-2026-10-20';
export const hash=token=>createHash('sha256').update(token).digest('hex');
export async function setup(){const db=await memberSetup();await db.exec(await readFile(new URL('../sql/member_access_requests.sql',import.meta.url),'utf8'));return db;}
export async function request(db,over={}){const token=over.token??randomBytes(32).toString('base64url');const p={email:'new-person@example.test',display_name:'New person',request_id:randomUUID(),token_hash:hash(token),consent_version:CONSENT,adult:true,privacy_acknowledged:true,human_review_acknowledged:true,...over};const result=(await db.query('select kapukai_member_access_request($1,$2,$3,$4,$5,$6,$7,$8) r',[p.email,p.display_name,p.request_id,p.token_hash,p.consent_version,p.adult,p.privacy_acknowledged,p.human_review_acknowledged])).rows[0].r;return {...result,token,p};}
export async function token(db,t,action='inspect'){return(await db.query('select kapukai_member_access_token($1,$2) r',[hash(t),action])).rows[0].r;}
export async function operator(db,action,payload={},user=O,session=user){return(await db.query('select kapukai_member_access_operator($1,$2,$3,$4::jsonb) r',[user,session,action,JSON.stringify(payload)])).rows[0].r;}
export async function receipt(db,id,state='accepted',provider='synthetic-receipt'){return(await db.query('select kapukai_member_access_mail_result($1,$2,$3) r',[id,state,provider])).rows[0].r;}
