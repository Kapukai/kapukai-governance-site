import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export {O,A,B,E} from './member-db-harness.mjs';
export async function setup(){const db=new PGlite();for(const f of ['./member-db-fixture.sql','../sql/member_community.sql','../sql/lab_booking.sql'])await db.exec(await readFile(new URL(f,import.meta.url),'utf8'));return db;}
export async function cmd(db,user,action,payload={},session=user){return (await db.query('select public.kapukai_lab_command($1,$2,$3,$4::jsonb) r',[user,session,action,JSON.stringify(payload)])).rows[0].r;}
export async function mail(db,action,payload){return (await db.query('select public.kapukai_lab_mail($1,$2::jsonb) r',[action,JSON.stringify(payload)])).rows[0].r;}
