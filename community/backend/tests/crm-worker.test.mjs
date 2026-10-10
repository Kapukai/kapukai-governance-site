import test from "node:test";
import assert from "node:assert/strict";
import {
  createHandler, createHubSpotClient, syncContact, contactProjection,
  PROPERTY_DEFINITIONS, PROPERTY_NAMES, retryDelay, constantTimeEqual,
} from "../supabase/functions/kapukai-hubspot-sync/handler.mjs";

const WORKER_TOKEN = "worker_test_only_0123456789abcdef0123456789";
const job = (overrides = {}) => ({email: "person@example.test", generation: 1,
  lease_id: "9c7c2032-134e-4baa-940a-4cf989e18255", hubspot_contact_id: null, attempt_count: 1,
  payload: {email: "person@example.test", name: "Supplied Name", company: "Supplied Organization",
    consent_status: "confirmed", confirmed_topics: ["free_classes", "tester_invites"],
    signup_sources: ["community_signup", "auth_account"], email_verified: true,
    source_states: ["scoped:confirmed", "workshop:closed"],
    latest_signup_at: "2026-10-10T12:00:00Z", latest_withdrawal_at: null, source_present: true, suppressed: false},
  ...overrides});
const reply = (status, body = {}, headers = {}) => new Response(JSON.stringify(body), {status, headers: {"Content-Type": "application/json", ...headers}});
function fakeApi({contacts = [], schema = PROPERTY_DEFINITIONS, intercept, portalId = 245840109} = {}) {
  const records = new Map(contacts.map(c => [String(c.id), structuredClone(c)]));
  const definitions = new Map(schema.map(p => [p.name, structuredClone(p)]));
  const calls = []; let nextId = 1000;
  async function fetch(url, options) {
    const u = new URL(url), method = options.method, body = options.body ? JSON.parse(options.body) : undefined;
    const call = {url: u, method, body, options}; calls.push(call);
    const intercepted = await intercept?.(call, {records, definitions, calls});
    if (intercepted !== undefined) return intercepted;
    if (u.pathname === "/integrations/v1/me") return reply(200, {portalId});
    if (u.pathname === "/crm/v3/properties/contacts" && method === "GET") return reply(200, {results: [...definitions.values()]});
    if (u.pathname === "/crm/v3/properties/contacts" && method === "POST") {
      if (definitions.has(body.name)) return reply(409);
      definitions.set(body.name, body); return reply(201, body);
    }
    if (u.pathname.startsWith("/crm/v3/properties/contacts/")) return reply(200, definitions.get(u.pathname.split("/").at(-1)));
    if (u.pathname === "/crm/v3/objects/contacts" && method === "POST") {
      if ([...records.values()].some(c => c.properties.email === body.properties.email)) return reply(409);
      const contact = {id: String(nextId++), properties: body.properties}; records.set(contact.id, contact);
      return reply(201, contact);
    }
    if (u.pathname.startsWith("/crm/v3/objects/contacts/")) {
      const value = decodeURIComponent(u.pathname.split("/").at(-1));
      const contact = u.searchParams.get("idProperty") === "email" ?
        [...records.values()].find(c => c.properties.email.toLowerCase() === value.toLowerCase()) : records.get(value);
      if (!contact) return reply(404);
      if (method === "PATCH") Object.assign(contact.properties, body.properties);
      return reply(200, contact);
    }
    assert.fail("Unexpected API request " + method + " " + u.pathname);
  }
  return {fetch, calls, records, definitions};
}
function fakeDb({jobs = [], guards = [], authorize = true, complete = true, checkpoint = true, enabled = true} = {}) {
  const calls = [], completions = [], checkpoints = [], heartbeats = [];
  const queue = [...jobs];
  async function rpc(name, parameters) {
    calls.push({name, parameters});
    if (name === "kapukai_crm_authorize_worker") return authorize;
    if (name === "kapukai_crm_heartbeat") { heartbeats.push(parameters); return {enabled, credential_ready: parameters.p_credential_ready}; }
    if (name === "kapukai_crm_health") return {enabled, credential_ready: true, pending: queue.length};
    if (name === "kapukai_crm_claim") return queue.length ? [queue.shift()] : [];
    if (name === "kapukai_crm_lease_current") return guards.length ? guards.shift() : true;
    if (name === "kapukai_crm_checkpoint") { checkpoints.push(parameters); return checkpoint; }
    if (name === "kapukai_crm_complete") { completions.push(parameters); return complete; }
    assert.fail("Unexpected RPC " + name);
  }
  return {rpc, calls, completions, checkpoints, heartbeats, queue};
}
const clientFor = api => createHubSpotClient({token: "fake_hubspot_token", fetch: api.fetch});
const workerFor = (db, api, extras = {}) => createHandler({rpc: db.rpc, fetch: api.fetch,
  workerToken: WORKER_TOKEN, hubspotToken: "fake_hubspot_token", random: () => 0, ...extras});
const invoke = (worker, method = "POST", token = WORKER_TOKEN) => worker(new Request("https://test.invalid/worker", {method, headers: {Authorization: "Bearer " + token}}));
const mutations = api => api.calls.filter(c => c.method !== "GET");

test("new signup creates one normalized identity, checkpoints before readback, and verifies owned properties", async () => {
  const item = job({email: " Person@Example.Test "});
  const db = fakeDb({jobs: [item]}), api = fakeApi();
  const response = await invoke(workerFor(db, api));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).synced, 1);
  assert.equal(api.records.size, 1);
  assert.equal([...api.records.values()][0].properties.email, "person@example.test");
  assert.equal(db.checkpoints.length, 1);
  assert.equal(db.completions[0].p_contact_id, "1000");
  assert.equal(db.completions[0].p_outcome, "synced");
  assert.equal(mutations(api).length, 1);
  assert.equal(api.calls.at(-1).method, "GET");
  assert.equal(api.calls.at(-1).url.pathname, "/crm/v3/objects/contacts/1000");
});

test("existing contact deduplicates by email and PATCH cannot overwrite CRM-owned data or enroll marketing", async () => {
  const item = job();
  Object.assign(item.payload, {firstname: "Malicious", lifecyclestage: "customer", hubspot_owner_id: "999",
    hs_marketable_status: "true", notes: "PRIVATE CASE DETAILS", properties: {email: "attacker@example.test"}});
  const api = fakeApi({contacts: [{id: "123", properties: {email: item.email, firstname: "Owner entered", lifecyclestage: "customer", hs_email_optout: "true"}}]});
  const db = fakeDb({jobs: [item]});
  await invoke(workerFor(db, api));
  assert.equal(api.records.size, 1);
  const writes = mutations(api); assert.equal(writes.length, 1); assert.equal(writes[0].method, "PATCH");
  assert.deepEqual(Object.keys(writes[0].body.properties).sort(), [...PROPERTY_NAMES].sort());
  assert.equal(api.records.get("123").properties.firstname, "Owner entered");
  assert.equal(api.records.get("123").properties.lifecyclestage, "customer");
  assert.equal(api.records.get("123").properties.hs_email_optout, "true");
  assert.equal(db.completions[0].p_hubspot_email_optout, true);
  assert.equal(JSON.stringify(writes).includes("PRIVATE CASE DETAILS"), false);
});

test("replayed generation reads existing identity and skips an already matching PATCH", async () => {
  const item = job(), projection = contactProjection(item);
  const api = fakeApi({contacts: [{id: "123", properties: {email: item.email, ...projection.properties}}]});
  const db = fakeDb(); const result = await syncContact(item, {rpc: db.rpc, client: clientFor(api)});
  assert.equal(result.contactId, "123"); assert.equal(mutations(api).length, 0);
  assert.equal(db.checkpoints.length, 1); assert.equal(api.calls.length, 2);
});

for (const variant of ["conflict", "timeout"]) {
  test(`${variant} after create is recovered by email lookup without a second create`, async () => {
    let created = false;
    const api = fakeApi({intercept: (call, state) => {
      if (call.method === "POST" && call.url.pathname === "/crm/v3/objects/contacts" && !created) {
        created = true;
        state.records.set("887", {id: "887", properties: {email: "person@example.test"}});
        if (variant === "timeout") throw new Error("may have committed; private error must not escape");
        return reply(409);
      }
    }});
    const db = fakeDb({jobs: [job()]});
    const response = await invoke(workerFor(db, api));
    assert.equal((await response.json()).synced, 1);
    assert.equal(api.calls.filter(c => c.method === "POST" && c.url.pathname === "/crm/v3/objects/contacts").length, 1);
    assert.equal(db.completions[0].p_contact_id, "887");
    assert.equal(api.records.size, 1);
  });
}

test("uncertain create with no readable record is queued for retry; it never performs a blind second create", async () => {
  const api = fakeApi({intercept: call => { if (call.method === "POST") throw new Error("secret/token/email"); }});
  const db = fakeDb({jobs: [job()]}); const response = await invoke(workerFor(db, api));
  assert.equal((await response.json()).retry, 1);
  assert.equal(mutations(api).length, 1);
  assert.equal(db.completions[0].p_error_code, "HUBSPOT_NETWORK_UNCERTAIN");
  assert.equal(db.completions[0].p_retry_after_seconds, 30);
});

test("429 Retry-After is respected and stops the batch without claiming the next signup", async () => {
  const api = fakeApi({intercept: call => call.url.pathname.startsWith("/crm/v3/objects/") ? reply(429, {private: "do not expose"}, {"Retry-After": "300"}) : undefined});
  const db = fakeDb({jobs: [job(), job({email: "second@example.test"})]});
  const response = await invoke(workerFor(db, api)); const output = await response.json();
  assert.equal(output.retry, 1); assert.equal(db.queue.length, 1);
  assert.equal(db.completions[0].p_retry_after_seconds, 300);
  assert.equal(db.heartbeats.at(-1).p_error_code, "HUBSPOT_RATE_LIMITED");
  assert.equal(JSON.stringify(output).includes("private"), false);
});

for (const status of [401, 403, 400, 503]) {
  test(`HubSpot ${status} records an actionable safe outcome`, async () => {
    const api = fakeApi({intercept: call => call.url.pathname.startsWith("/crm/v3/objects/") ? reply(status, {message: "PRIVATE INFORMATION"}) : undefined});
    const db = fakeDb({jobs: [job()]}); const response = await invoke(workerFor(db, api));
    const output = await response.json();
    const outcome = status === 401 || status === 403 ? "blocked" : status === 400 ? "failed" : "retry";
    assert.equal(db.completions[0].p_outcome, outcome); assert.equal(output[outcome], 1);
    assert.equal(JSON.stringify(db.completions).includes("PRIVATE INFORMATION"), false);
  });
}

test("stale generation is fenced before external contact mutation", async () => {
  const api = fakeApi({contacts: [{id: "123", properties: {email: "person@example.test"}}]});
  const db = fakeDb({jobs: [job()], guards: [true, false]});
  await invoke(workerFor(db, api));
  assert.equal(mutations(api).length, 0);
  assert.equal(db.completions[0].p_error_code, "STALE_GENERATION");
  assert.equal(db.completions[0].p_contact_id, "123");
  assert.equal(db.completions[0].p_retry_after_seconds, 0);
});

test("checkpoint losing its lease prevents PATCH and reports lease loss", async () => {
  const api = fakeApi({contacts: [{id: "123", properties: {email: "person@example.test"}}]});
  const db = fakeDb({jobs: [job()], checkpoint: false, complete: false});
  const result = await (await invoke(workerFor(db, api))).json();
  assert.equal(mutations(api).length, 0); assert.equal(result.stale, 1);
  assert.equal(db.completions[0].p_error_code, "LEASE_LOST");
});

test("readback mismatch retries with the known contact ID already saved", async () => {
  const api = fakeApi({contacts: [{id: "123", properties: {email: "person@example.test"}}],
    intercept: call => call.method === "PATCH" ? reply(200, {id: "123"}) : undefined});
  const db = fakeDb({jobs: [job()]}); await invoke(workerFor(db, api));
  assert.equal(db.completions[0].p_error_code, "HUBSPOT_READBACK_MISMATCH");
  assert.equal(db.completions[0].p_contact_id, "123");
  assert.equal(db.checkpoints[0].p_contact_id, "123");
});

test("mapped contact disappearance is blocked and never recreated", async () => {
  const api = fakeApi(), db = fakeDb({jobs: [job({hubspot_contact_id: "123"})]});
  await invoke(workerFor(db, api));
  assert.equal(db.completions[0].p_error_code, "CONTACT_MISSING");
  assert.equal(db.completions[0].p_outcome, "blocked"); assert.equal(mutations(api).length, 0);
});

test("mapped contact email changes do not overwrite a different identity", async () => {
  const api = fakeApi({contacts: [{id: "123", properties: {email: "someoneelse@example.test"}}]});
  const db = fakeDb({jobs: [job({hubspot_contact_id: "123"})]}); await invoke(workerFor(db, api));
  assert.equal(db.completions[0].p_error_code, "CONTACT_IDENTITY_CONFLICT");
  assert.equal(mutations(api).length, 0);
});

test("deleted source cannot create a contact and clears supplied details in an existing projection", async () => {
  const item = job(); item.payload.source_present = false;
  const api = fakeApi(), db = fakeDb({jobs: [item]}); await invoke(workerFor(db, api));
  assert.equal(mutations(api).length, 0); assert.equal(db.completions[0].p_outcome, "synced");
  const properties = contactProjection(item).properties;
  assert.equal(properties.kapukai_supplied_name, ""); assert.equal(properties.kapukai_confirmed_topics, "");
});

test("source suppression remains separate from independent scoped consent and HubSpot opt-out", () => {
  const item = job(); item.payload.suppressed = true; item.payload.confirmed_topics = ["assurance:updates"];
  const properties = contactProjection(item).properties;
  assert.equal(properties.kapukai_confirmed_topics, "assurance:updates"); assert.equal(properties.kapukai_suppressed, "true");
  assert.equal("hs_email_optout" in properties, false);
});

test("unauthenticated callers cannot query health, trigger RPC work, or learn credential status", async () => {
  const api = fakeApi(), db = fakeDb(); const worker = workerFor(db, api, {hubspotToken: ""});
  for (const token of ["bad", "z".repeat(40)]) {
    const response = await invoke(worker, "GET", token);
    assert.equal(response.status, 401); assert.deepEqual(await response.json(), {ok: false, error: "UNAUTHORIZED"});
  }
  assert.equal(db.calls.length, 0); assert.equal(api.calls.length, 0);
  assert.equal(await constantTimeEqual(WORKER_TOKEN, WORKER_TOKEN), true);
  assert.equal(await constantTimeEqual(WORKER_TOKEN, WORKER_TOKEN + "x"), false);
});

test("Vault-authorized worker fallback only receives the bearer server-side", async () => {
  const api = fakeApi(), db = fakeDb();
  const response = await invoke(workerFor(db, api, {workerToken: ""}), "GET");
  assert.equal(response.status, 200); assert.equal(db.calls[0].name, "kapukai_crm_authorize_worker");
  assert.equal(db.calls[0].parameters.p_token, WORKER_TOKEN); assert.equal(api.calls.length, 0);
});

test("missing HubSpot credential is visible privately and never claims or calls HubSpot", async () => {
  const api = fakeApi(), db = fakeDb({jobs: [job()]});
  const worker = workerFor(db, api, {hubspotToken: ""});
  assert.equal((await invoke(worker)).status, 503);
  assert.deepEqual(db.heartbeats[0], {p_credential_ready: false, p_error_code: "HUBSPOT_CREDENTIAL_MISSING"});
  assert.equal(db.queue.length, 1); assert.equal(api.calls.length, 0);
  const health = await (await invoke(worker, "GET")).json(); assert.equal(health.credential_configured, false);
});

test("wrong HubSpot account blocks before schema or contact writes", async () => {
  const api = fakeApi({portalId: 999}), db = fakeDb({jobs: [job()]});
  const response = await invoke(workerFor(db, api));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "HUBSPOT_PORTAL_MISMATCH");
  assert.equal(api.calls.length, 1); assert.equal(db.queue.length, 1); assert.equal(mutations(api).length, 0);
});

test("disabled integration performs no external reads or schema writes", async () => {
  const api = fakeApi({schema: []}), db = fakeDb({jobs: [job()], enabled: false});
  const response = await invoke(workerFor(db, api));
  assert.deepEqual(await response.json(), {ok: true, paused: true});
  assert.equal(api.calls.length, 0); assert.equal(db.queue.length, 1);
});

test("secondary email aliases are blocked instead of overwriting another identity's consent", async () => {
  const api = fakeApi({contacts: [{id: "123", properties: {email: "primary@example.test", hs_additional_emails: "person@example.test", kapukai_confirmed_topics: "scoped:free_classes"}}]});
  const db = fakeDb({jobs: [job({hubspot_contact_id: "123"})]});
  await invoke(workerFor(db, api));
  assert.equal(db.completions[0].p_error_code, "CONTACT_IDENTITY_CONFLICT");
  assert.equal(mutations(api).length, 0);
  assert.equal(api.records.get("123").properties.kapukai_confirmed_topics, "scoped:free_classes");
});

test("wrong identity in a successful create response is blocked before checkpoint or update", async () => {
  const api = fakeApi({intercept: call => call.method === "POST" ? reply(201, {id: "555", properties: {email: "wrong@example.test"}}) : undefined});
  const db = fakeDb({jobs: [job()]}); await invoke(workerFor(db, api));
  assert.equal(db.completions[0].p_error_code, "CONTACT_IDENTITY_CONFLICT");
  assert.equal(db.checkpoints.length, 0);
  assert.equal(api.calls.some(c => c.method === "PATCH"), false);
});

test("missing owned properties are created once, while incompatible property definitions block safely", async () => {
  const api = fakeApi({schema: []}), db = fakeDb(); const worker = workerFor(db, api);
  assert.equal((await invoke(worker)).status, 200); assert.equal((await invoke(worker)).status, 200);
  assert.equal(mutations(api).length, PROPERTY_DEFINITIONS.length);
  const conflicting = fakeApi({schema: PROPERTY_DEFINITIONS.map((p, i) => i ? p : {...p, type: "number"})});
  const response = await invoke(workerFor(fakeDb(), conflicting));
  assert.equal(response.status, 503); assert.equal((await response.json()).error, "HUBSPOT_PROPERTY_SCHEMA_CONFLICT");
  assert.equal(mutations(conflicting).length, 0);
});

test("one invocation processes at most ten contacts and backoff is bounded", async () => {
  const jobs = Array.from({length: 12}, (_, i) => {
    const item = job({email: `person${i}@example.test`}); item.payload.email = item.email; return item;
  });
  const api = fakeApi(), db = fakeDb({jobs}); const output = await (await invoke(workerFor(db, api))).json();
  assert.equal(output.claimed, 10); assert.equal(output.synced, 10); assert.equal(db.queue.length, 2);
  assert.equal(retryDelay(1, 300, () => 0), 300); assert.equal(retryDelay(30, null, () => 0), 21600);
  assert.equal(retryDelay(1, 200000, () => 0), 86400);
});
