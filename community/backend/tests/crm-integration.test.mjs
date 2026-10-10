import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {createHandler, PROPERTY_DEFINITIONS} from "../supabase/functions/kapukai-hubspot-sync/handler.mjs";

const [fixture, migration] = await Promise.all([
  readFile(new URL("./crm-fixture.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261010162458_signup_crm_outbox.sql", import.meta.url), "utf8"),
]);
const response = (status, value = {}) => new Response(JSON.stringify(value), {status});

test("real SQL triggers and worker RPCs deliver pending → confirmed → withdrawal to one verified CRM contact", async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture); await db.exec(migration);
    const email = "lifecycle@registrants.dev", token = "integration_test_worker_0123456789abcdef";
    await db.query("update kapukai_crm_config set enabled=true,worker_token_hash=encode(sha256(convert_to($1,'UTF8')),'hex')", [token]);
    let contact = null; const externalWrites = [], rpcCalls = [];
    async function rpc(name, args) {
      assert.match(name, /^kapukai_crm_[a-z_]+$/);
      const keys = Object.keys(args); keys.forEach(key => assert.match(key, /^p_[a-z_]+$/));
      // The real named-argument call fails on any worker/SQL signature drift.
      const query = `select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(",")}) as result`;
      await db.exec("set role service_role");
      try {
        rpcCalls.push(name);
        return (await db.query(query, Object.values(args))).rows[0].result;
      } finally { await db.exec("reset role"); }
    }
    async function fetch(url, options) {
      const u = new URL(url);
      if (u.pathname === "/integrations/v1/me") return response(200, {portalId: 245840109});
      if (u.pathname === "/crm/v3/properties/contacts") return response(200, {results: PROPERTY_DEFINITIONS});
      if (options.method === "POST") {
        assert.equal(contact, null, "a confirmed identity must never be created twice");
        const body = JSON.parse(options.body); externalWrites.push({method: "POST", properties: body.properties});
        contact = {id: "81234", properties: {...body.properties, hs_email_optout: "true", firstname: "CRM owner value"}};
        return response(201, contact);
      }
      if (!contact) return response(404);
      if (options.method === "PATCH") {
        const body = JSON.parse(options.body); externalWrites.push({method: "PATCH", properties: body.properties});
        assert.ok(Object.keys(body.properties).every(key => key.startsWith("kapukai_")));
        Object.assign(contact.properties, body.properties);
      }
      return response(200, contact);
    }
    const worker = createHandler({rpc, fetch, hubspotToken: "test_only_hubspot_key", random: () => 0});
    async function run() {
      const result = await worker(new Request("https://test.invalid/worker", {method: "POST", headers: {Authorization: "Bearer " + token}}));
      const body = await result.json(); assert.equal(result.status, 200, JSON.stringify(body)); return body;
    }
    const row = () => db.query("select * from kapukai_crm_outbox where email=$1", [email]).then(result => result.rows[0]);
    const id = (await db.query("insert into kapukai_interest_registry(email,full_name,created_at) values($1,'Supplied name','2026-10-10T05:00:00-07:00') returning id", [email])).rows[0].id;
    await db.query("insert into kapukai_scoped_intents(registry_id) values($1)", [id]);

    assert.equal((await run()).synced, 1);
    assert.equal(contact.properties.kapukai_consent_status, "pending");
    assert.equal(contact.properties.kapukai_confirmed_topics, "");
    assert.equal(contact.properties.kapukai_email_verified, "false");
    assert.ok(contact.properties.kapukai_latest_signup_at.endsWith("Z"));
    let queue = await row(); assert.equal(queue.state, "synced");
    assert.equal(queue.hubspot_contact_id, "81234"); assert.equal(queue.hubspot_email_optout, true);
    assert.equal(queue.generation, queue.synced_generation);
    const firstGeneration = queue.generation;

    await db.exec("begin");
    await db.query("update kapukai_scoped_intents set state='confirmed' where registry_id=$1", [id]);
    await db.query("insert into kapukai_scoped_subscriptions(registry_id,topic,state) values($1,'free_classes','confirmed')", [id]);
    await db.exec("commit");
    assert.equal((await run()).synced, 1);
    assert.equal(contact.properties.kapukai_consent_status, "confirmed_topics");
    assert.equal(contact.properties.kapukai_confirmed_topics, "scoped:free_classes");
    assert.equal(contact.properties.kapukai_email_verified, "true");
    queue = await row(); assert.equal(queue.state, "synced"); assert.ok(queue.generation > firstGeneration);
    assert.equal(queue.hubspot_contact_id, "81234");

    const beforeReplay = externalWrites.length;
    // Simulate a lost completion acknowledgement after HubSpot committed.
    // The operator retry RPC must replay the same generation without duplication.
    await db.query("update kapukai_crm_outbox set state='retry',last_error_code='HUBSPOT_RESPONSE_UNCERTAIN' where email=$1", [email]);
    assert.equal((await db.query("select kapukai_crm_retry($1) as count", [email])).rows[0].count, 1);
    assert.equal((await run()).synced, 1);
    assert.equal(externalWrites.length, beforeReplay, "replayed current generation only reads and verifies");

    await db.exec("begin");
    await db.query("update kapukai_scoped_subscriptions set state='unsubscribed',revoked_at=now() where registry_id=$1", [id]);
    await db.query("update kapukai_scoped_intents set state='unsubscribed' where registry_id=$1", [id]);
    await db.exec("commit");
    assert.equal((await run()).synced, 1);
    assert.equal(contact.properties.kapukai_consent_status, "withdrawn");
    assert.equal(contact.properties.kapukai_confirmed_topics, "");
    assert.ok(contact.properties.kapukai_latest_withdrawal_at);
    assert.equal(contact.properties.hs_email_optout, "true");
    assert.equal(contact.properties.firstname, "CRM owner value");
    assert.equal(externalWrites.filter(write => write.method === "POST").length, 1);
    assert.equal(externalWrites.filter(write => write.method === "PATCH").length, 2);
    queue = await row(); assert.equal(queue.state, "synced"); assert.equal(queue.last_error_code, null);
    assert.equal(queue.generation, queue.synced_generation);
    assert.ok(rpcCalls.includes("kapukai_crm_authorize_worker"));
    assert.ok(rpcCalls.includes("kapukai_crm_checkpoint"));
    assert.equal((await run()).claimed, 0);
  } finally { await db.close(); }
});
