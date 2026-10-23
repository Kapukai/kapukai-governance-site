import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
export {O,A,B,E} from './member-db-harness.mjs';
const weekDefinitions=new WeakMap();
// Test-only clock replacement: retain the exact installed production function
// body and change only its default argument. Auth/session clocks stay real.
export async function setWeekClock(db,iso){
 assert.match(iso,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
 assert.ok(Number.isFinite(Date.parse(iso)),'week clock must be a valid instant');
 let definition=weekDefinitions.get(db);
 if(!definition){
  definition=(await db.query("select pg_get_functiondef('kapukai_lab.validate_booking_week(timestamptz,timestamptz,timestamptz)'::regprocedure) definition")).rows[0].definition;
  assert.equal((definition.match(/DEFAULT\s+(?:pg_catalog\.)?clock_timestamp\(\)/gi)||[]).length,1,'installed production week default must use clock_timestamp()');
  weekDefinitions.set(db,definition);
 }
 await db.exec(definition.replace(/DEFAULT\s+(?:pg_catalog\.)?clock_timestamp\(\)/i,`DEFAULT '${iso}'::timestamptz`));
}
export async function setup(){const db=new PGlite();for(const f of ['./member-db-fixture.sql','../sql/member_community.sql','../sql/lab_booking.sql'])await db.exec(await readFile(new URL(f,import.meta.url),'utf8'));await setWeekClock(db,'2030-01-07T13:00:00Z');return db;}
export async function cmd(db,user,action,payload={},session=user){return (await db.query('select public.kapukai_lab_command($1,$2,$3,$4::jsonb) r',[user,session,action,JSON.stringify(payload)])).rows[0].r;}
export async function mail(db,action,payload){return (await db.query('select public.kapukai_lab_mail($1,$2::jsonb) r',[action,JSON.stringify(payload)])).rows[0].r;}
