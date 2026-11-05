import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
// Use the repository's installed dependency by default, or an explicitly
// provisioned runtime when reviewing only a partial source working copy.
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");

// Isolated PostgreSQL engine fixture. This is not production or a true
// multi-connection concurrency test. No provider or network calls are made.
let db;
const fingerprint = "a".repeat(64);
const otherFingerprint = "b".repeat(64);
const claim = async (id, value = fingerprint) => (await db.query("select public.kapukai_auth_recovery_claim($1, $2) as result", [id, value])).rows[0].result;
const receipt = async (id, state, providerId = null) => (await db.query("select public.kapukai_auth_recovery_mail_result($1, $2, $3) as result", [id, state, providerId])).rows[0].result;

before(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(await readFile(new URL("../sql/proposed_auth_recovery.sql", import.meta.url), "utf8"));
});
after(async () => { await db?.close(); });

test("claim creates a pending tombstone and repeated or mismatched keys cannot reopen it", async () => {
  const id = randomUUID();
  assert.deepEqual(await claim(id), { result: "claimed" });
  assert.deepEqual(await claim(id), { result: "duplicate" });
  assert.deepEqual(await claim(id, otherFingerprint), { result: "idempotency_conflict" });
  const result = await db.query("select state, provider_message_id, resolved_at from private.kapukai_auth_recovery_requests where request_id=$1", [id]);
  assert.deepEqual(result.rows, [{ state: "pending", provider_message_id: null, resolved_at: null }]);
});

test("claim validates private fingerprints and cannot store raw recipients", async () => {
  for (const [id, value] of [[null, fingerprint], [randomUUID(), null], [randomUUID(), "person@example.invalid"], [randomUUID(), "A".repeat(64)], [randomUUID(), "a".repeat(65)]]) assert.deepEqual(await claim(id, value), { result: "invalid" });
});

test("receipt accepts one valid terminal transition and duplicate receipt is idempotent", async () => {
  for (const state of ["accepted", "failed", "unknown"]) {
    const id = randomUUID(), providerId = state === "accepted" ? randomUUID() : null;
    await claim(id);
    assert.deepEqual(await receipt(id, state, providerId), { result: "ok", state });
    assert.deepEqual(await receipt(id, state, providerId), { result: "ok", state });
    assert.deepEqual(await receipt(id, state === "unknown" ? "failed" : "unknown"), { result: "conflict" });
    assert.deepEqual(await claim(id), { result: "duplicate" });
    const row = (await db.query("select state, provider_message_id, resolved_at from private.kapukai_auth_recovery_requests where request_id=$1", [id])).rows[0];
    assert.equal(row.state, state); assert.equal(row.provider_message_id, providerId); assert.ok(row.resolved_at);
  }
});

test("malformed or missing receipts cannot corrupt a durable claim", async () => {
  const id = randomUUID(); await claim(id);
  for (const [state, providerId] of [[null, null], ["pending", null], ["accepted", null], ["unknown", randomUUID()], ["failed", randomUUID()]]) assert.deepEqual(await receipt(id, state, providerId), { result: "invalid" });
  assert.deepEqual(await receipt(randomUUID(), "unknown"), { result: "not_found" });
  assert.deepEqual(await receipt(null, "unknown"), { result: "invalid" });
  assert.deepEqual(await claim(id), { result: "duplicate" });
  assert.equal((await db.query("select state from private.kapukai_auth_recovery_requests where request_id=$1", [id])).rows[0].state, "pending");
});

test("anon and authenticated cannot execute either RPC or read the private table", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(claim(randomUUID()), error => error.code === "42501");
      await assert.rejects(receipt(randomUUID(), "unknown"), error => error.code === "42501");
      await assert.rejects(db.query("select * from private.kapukai_auth_recovery_requests"), error => error.code === "42501");
    } finally { await db.exec("reset role"); }
  }
});

test("service role can use the narrow functions but has no direct table privilege", async () => {
  await db.exec("set role service_role");
  try {
    const id = randomUUID(); assert.deepEqual(await claim(id), { result: "claimed" });
    assert.deepEqual(await receipt(id, "unknown"), { result: "ok", state: "unknown" });
    await assert.rejects(db.query("select * from private.kapukai_auth_recovery_requests"), error => error.code === "42501");
  } finally { await db.exec("reset role"); }
});

test("SQL uses RLS, no public policies, empty search path and only nonidentifying receipt columns", async () => {
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='private.kapukai_auth_recovery_requests'::regclass")).rows[0].relrowsecurity, true);
  assert.equal((await db.query("select count(*)::int as n from pg_policies where schemaname='private' and tablename='kapukai_auth_recovery_requests'")).rows[0].n, 0);
  const functions = (await db.query("select prosecdef, proconfig from pg_proc where proname in ('kapukai_auth_recovery_claim','kapukai_auth_recovery_mail_result')")).rows;
  assert.equal(functions.length, 2);
  for (const fn of functions) { assert.equal(fn.prosecdef, true); assert.deepEqual(fn.proconfig, ['search_path=""']); }
  const columns = (await db.query("select column_name from information_schema.columns where table_schema='private' and table_name='kapukai_auth_recovery_requests' order by ordinal_position")).rows.map(x => x.column_name);
  assert.deepEqual(columns, ["request_id", "address_fingerprint", "state", "provider_message_id", "created_at", "resolved_at"]);
});
