import test from "node:test";
import assert from "node:assert/strict";
import { createAuthenticator, publicAuthConfig, PROJECT_URL, OpsError } from "../supabase/functions/kapukai-workshop-ops/auth.mjs";
import { createHandler, normalizeRequest, createNoticeSender, NOTICE_VERSION, NOTICE_MESSAGE } from "../supabase/functions/kapukai-workshop-ops/handler.mjs";

const ORIGIN = "https://kapukai-community.vercel.app";
const KEY = "sb_publishable_fixture_only";
const NOW = Date.parse("2026-10-08T19:30:00Z");
const USER = "b8bbc25e-c196-4cbb-8eb9-ff38863df2d8";
const SESSION = "b9ef7317-7514-4aac-8221-9a19f42c34b6";
const APP = "c46ef1e0-836c-4e8c-b6a2-b8c9c40ecc54";
const REQUEST = "c3e175aa-913c-4f9b-a101-c6e979954908";
const internal = { tenant_id: "fictional-tenant", subject_id: "fictional-owner", state: "active" };
const principal = { user_id: USER, session_id: SESSION, tenant_id: internal.tenant_id, subject_id: internal.subject_id };
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = (extra = {}) => `${encode({ alg: "RS256" })}.${encode({ iss: `${PROJECT_URL}/auth/v1`, aud: "authenticated", role: "authenticated", sub: USER, session_id: SESSION, iat: NOW / 1000 - 60, exp: NOW / 1000 + 3600, ...extra })}.fixture_signature`;
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const request = (body = { action: "queue" }, options = {}) => new Request(`${PROJECT_URL}/functions/v1/kapukai-workshop-ops${options.search || ""}`, { method: options.method || "POST", headers: { origin: ORIGIN, "content-type": "application/json", authorization: `Bearer ${token()}`, ...options.headers }, ...(options.method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
function authFixture({ jwt, user = { id: USER, email_confirmed_at: "2026-10-01T00:00:00Z", is_anonymous: false }, mapping = [internal], providerStatus = 200 } = {}) {
  const calls = [];
  const authenticate = createAuthenticator({ baseUrl: PROJECT_URL, publishableKey: KEY, clock: () => NOW, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return url.endsWith("/auth/v1/user") ? response(user, providerStatus) : response(mapping);
  } });
  return { calls, authenticate, request: request({}, { headers: { authorization: `Bearer ${jwt || token()}` } }) };
}
const command = (overrides = {}) => ({ action: "command", application_id: APP, command: "offer", expected_revision: 0, request_id: REQUEST, payload: { resource_id: "practice", expires_days: 7, minutes: 30 }, ...overrides });
function handlerFixture({ result = { result: "ok", enabled: true, applications: [] }, authenticate = async () => principal, config = { baseUrl: PROJECT_URL, publishableKey: KEY } } = {}) {
  const calls = [];
  return { calls, handler: createHandler({ authenticate, rpc: async (name, args) => { calls.push({ name, args }); return result; }, getConfig: () => config }) };
}

test("public config permits only this project and public keys, never service keys", () => {
  assert.deepEqual(publicAuthConfig({ baseUrl: PROJECT_URL, publishableKey: KEY }), { supabase_url: PROJECT_URL, publishable_key: KEY, session_seconds: 1800 });
  const anon = `${encode({ alg: "HS256" })}.${encode({ role: "anon", ref: "tbxfsjipkrdwyctepesf" })}.fixture`;
  assert.equal(publicAuthConfig({ baseUrl: PROJECT_URL, publishableKey: anon }).publishable_key, anon);
  for (const key of ["sb_secret_do_not_expose", "", token({ role: "service_role" }), `${encode({ alg: "HS256" })}.${encode({ role: "anon", ref: "wrong-project" })}.fixture`]) {
    assert.throws(() => publicAuthConfig({ baseUrl: PROJECT_URL, publishableKey: key }), error => error.code === "AUTH_NOT_CONFIGURED");
  }
  assert.throws(() => publicAuthConfig({ baseUrl: "https://other.supabase.co", publishableKey: KEY }));
});

test("verified provider identity and active internal mapping are required, without email-derived authority", async () => {
  const fixture = authFixture({ user: { id: USER, email: "not-an-owner@example.invalid", email_confirmed_at: "2026-10-01T00:00:00Z", user_metadata: { role: "administrator" } } });
  assert.deepEqual(await fixture.authenticate(fixture.request), principal);
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.calls[0].url, `${PROJECT_URL}/auth/v1/user`);
  assert.equal(fixture.calls[1].url, `${PROJECT_URL}/rest/v1/rpc/kapukai_current_principal`);
  assert.equal(fixture.calls[0].options.headers.authorization, fixture.calls[1].options.headers.authorization);
  assert.equal(fixture.calls[1].options.body, "{}");
  assert.equal(fixture.calls[0].options.redirect, "error");
});

test("missing, malformed and applicant tokens never reach provider authentication", async () => {
  for (const authorization of ["", "Bearer applicant_token_without_jwt", `Bearer ${"x".repeat(17000)}.a.b`, "Basic password", "Bearer a.b.c extra"]) {
    const fixture = authFixture();
    await assert.rejects(fixture.authenticate(request({}, { headers: { authorization } })), error => error.code === "AUTHENTICATION_REQUIRED");
    assert.equal(fixture.calls.length, 0);
  }
});

test("provider rejection is authoritative; provider outages fail closed without leaking messages", async () => {
  for (const [status, expected] of [[401, 401], [403, 401], [500, 503]]) {
    const fixture = authFixture({ providerStatus: status, user: { detail: "private provider message" } });
    await assert.rejects(fixture.authenticate(fixture.request), error => error.status === expected && !error.message.includes("private"));
    assert.equal(fixture.calls.length, 1);
  }
});

test("expired, wrong issuer/audience/role/subject/session and future-issued tokens are rejected", async () => {
  for (const extra of [{ exp: NOW / 1000 }, { iss: "https://attacker.invalid/auth/v1" }, { aud: "service_role" }, { role: "service_role" }, { sub: APP }, { session_id: "not-a-session" }, { iat: NOW / 1000 + 120 }, { iat: NOW / 1000 - 1800 }]) {
    const fixture = authFixture({ jwt: token(extra) });
    await assert.rejects(fixture.authenticate(fixture.request), error => error.status === 401);
    assert.equal(fixture.calls.length, 1);
  }
});

test("unconfirmed, anonymous and banned accounts cannot enter owner authorization", async () => {
  for (const extra of [{ email_confirmed_at: null }, { email_confirmed_at: "invalid" }, { is_anonymous: true }, { banned_until: "2030-01-01T00:00:00Z" }]) {
    const fixture = authFixture({ user: { id: USER, email_confirmed_at: "2026-10-01T00:00:00Z", ...extra } });
    await assert.rejects(fixture.authenticate(fixture.request), error => error.status === 401);
  }
});

test("missing, inactive and ambiguous internal mappings deny access", async () => {
  for (const mapping of [[], [{ ...internal, state: "disabled" }], [internal, internal], [{ ...internal, subject_id: "" }]]) {
    const fixture = authFixture({ mapping });
    await assert.rejects(fixture.authenticate(fixture.request), error => error.code === "WORKSHOP_ACCESS_REQUIRED" && error.status === 403);
  }
});

test("origin policy rejects absent, wildcard-lookalike, local and foreign origins before auth", async () => {
  const fixture = handlerFixture({ authenticate: async () => { assert.fail("must not authenticate"); } });
  for (const origin of ["", "null", "http://localhost:5173", "https://kapukai-community.vercel.app.attacker.invalid"]) {
    const result = await fixture.handler(request({ action: "queue" }, { headers: { origin } }));
    assert.equal(result.status, 403);
    assert.equal(result.headers.get("access-control-allow-origin"), null);
  }
  assert.equal(fixture.calls.length, 0);
});

test("config is explicitly public but filtered and no-store; preflight does not disclose records", async () => {
  const fixture = handlerFixture({ authenticate: async () => { assert.fail("config must not authenticate"); } });
  const result = await fixture.handler(request({ action: "config" }));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual(await result.json(), { ok: true, supabase_url: PROJECT_URL, publishable_key: KEY, session_seconds: 1800 });
  const preflight = await fixture.handler(new Request(`${PROJECT_URL}/functions/v1/kapukai-workshop-ops`, { method: "OPTIONS", headers: { origin: ORIGIN } }));
  assert.equal(preflight.status, 204);
  assert.equal(await preflight.text(), "");
  const invalid = handlerFixture({ config: { baseUrl: PROJECT_URL, publishableKey: "sb_secret_never_public" } });
  const rejected = await invalid.handler(request({ action: "config" }));
  assert.equal(rejected.status, 503); assert.ok(!(await rejected.text()).includes("sb_secret"));
});

test("queue and command send only server-derived actor/session/scope and fixed RPC names", async () => {
  const queue = handlerFixture();
  assert.equal((await queue.handler(request({ action: "queue", limit: 12 }))).status, 200);
  assert.deepEqual(queue.calls[0], { name: "kapukai_workshop_owner_queue", args: { p_user_id: USER, p_session_id: SESSION, p_tenant_id: internal.tenant_id, p_subject_id: internal.subject_id, p_limit: 12, p_offset: 0, p_view: "active" } });
  const update = handlerFixture({ result: { result: "updated", lifecycle: { revision: 1 } } });
  assert.equal((await update.handler(request(command()))).status, 200);
  assert.equal(update.calls[0].name, "kapukai_workshop_owner_action");
  assert.equal(update.calls[0].args.p_action, "offer");
  assert.equal(update.calls[0].args.p_user_id, USER);
  assert.equal(update.calls[0].args.p_request_id, REQUEST);
  const denied = await update.handler(request({ ...command(), user_id: APP }));
  assert.equal(denied.status, 400); assert.equal(update.calls.length, 1);
});

test("each operation obeys SQL revocation/scope denial and status conflicts", async () => {
  for (const [resultCode, status] of [["forbidden", 403], ["stale_revision", 409], ["idempotency_conflict", 409], ["capacity_full", 409], ["transition_denied", 409], ["paused", 503], ["expired", 410], ["not_found", 404]]) {
    const fixture = handlerFixture({ result: { result: resultCode, private_message: "must not leak" } });
    const result = await fixture.handler(request(command()));
    assert.equal(result.status, status);
    assert.deepEqual(await result.json(), { ok: false, code: resultCode.toUpperCase() });
    assert.equal(result.headers.get("cache-control"), "no-store");
  }
});

test("auth failure prevents all SQL calls and preserves a generic owner error", async () => {
  const fixture = handlerFixture({ authenticate: async () => { throw new OpsError("AUTHENTICATION_REQUIRED", 401); } });
  const result = await fixture.handler(request(command()));
  assert.equal(result.status, 401); assert.equal(fixture.calls.length, 0);
});

test("normalized owner commands retain idempotency and reject arbitrary data, URLs and money", () => {
  assert.equal(normalizeRequest(command({ application_id: APP.toUpperCase(), request_id: REQUEST.toUpperCase() })).application_id, APP);
  assert.equal(normalizeRequest({ action: "queue" }).limit, 30);
  for (const body of [
    command({ payload: { resource_id: "https://attacker.invalid", expires_days: 7, minutes: 30 } }),
    command({ payload: { resource_id: "practice", expires_days: 0, minutes: 30 } }),
    command({ payload: { resource_id: "practice", expires_days: 7, minutes: 121 } }),
    command({ payload: { resource_id: "practice", expires_days: 7, minutes: 30, price: 100 } }),
    command({ expected_revision: -1 }), command({ expected_revision: 1.2 }),
    command({ request_id: "not-uuid" }), command({ command: "delete_everything" }),
    command({ command: "review", payload: { notes: "private narrative" } }),
    { action: "queue", limit: 51 }, { action: "queue", limit: "30" }, { action: "queue", tenant_id: "other" }, { action: "queue", offset: -1 }, { action: "queue", offset: 10001 }, { action: "queue", view: "private" },
    { action: "config", token: "applicant-link" },
  ]) assert.throws(() => normalizeRequest(body), error => error.code === "INVALID_REQUEST");
});

test("bounded JSON rejects oversized streamed bytes, non-JSON, token URLs and invalid methods", async () => {
  const fixture = handlerFixture();
  assert.equal((await fixture.handler(request("{\"action\":\"queue\",\"extra\":\"" + "日".repeat(3000) + "\"}"))).status, 413);
  assert.equal((await fixture.handler(request({ action: "queue" }, { headers: { "content-type": "text/plain" } }))).status, 400);
  assert.equal((await fixture.handler(request({ action: "queue" }, { search: "?access_token=must-not-use" }))).status, 400);
  assert.equal((await fixture.handler(request(undefined, { method: "GET" }))).status, 405);
  assert.equal(fixture.calls.length, 0);
});

test("unknown SQL failures never echo private data or present fabricated success", async () => {
  const handler = createHandler({ authenticate: async () => principal, rpc: async () => { throw new Error("private source text"); }, getConfig: () => ({ baseUrl: PROJECT_URL, publishableKey: KEY }) });
  const result = await handler(request(command()));
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { ok: false, code: "TEMPORARILY_UNAVAILABLE" });
});

const noticeRequest = (extra = {}) => ({ action: "send_notice", application_id: APP, expected_revision: 3, request_id: REQUEST, template_version: NOTICE_VERSION, ...extra });
const NOTICE = "cb47653f-3baf-45fa-97dc-941807b80910";
const PROVIDER_RECEIPT = "abd72b0b-1976-401a-8e6f-a581f24bc7d8";
test("notice sender uses the server recipient and fixed preview, with tracking disabled", async () => {
  const calls = [];
  const send = createNoticeSender({ providerToken: crypto.randomUUID(), from: "sender@example.invalid", fetchImpl: async (url, options) => { calls.push({ url, options }); return response({ ErrorCode: 0, MessageID: PROVIDER_RECEIPT }); } });
  assert.deepEqual(await send({ email: "applicant@example.invalid", applicationId: APP, noticeId: NOTICE, text: "must not override", subject: "must not override" }), { state: "accepted", providerMessageId: PROVIDER_RECEIPT });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.postmarkapp.com/email");
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.To, "applicant@example.invalid");
  assert.equal(payload.Subject, NOTICE_MESSAGE.subject);
  assert.equal(payload.TextBody, NOTICE_MESSAGE.text);
  assert.equal(payload.TrackOpens, false); assert.equal(payload.TrackLinks, "None");
  assert.equal(payload.Metadata.template_version, NOTICE_VERSION);
  assert.ok(!payload.TextBody.includes("#app_token="));
});

test("provider rejection, timeout and malformed success have distinct conservative outcomes", async () => {
  for (const [fetchImpl, expected] of [
    [async () => response({ ErrorCode: 422, Message: "private details" }, 422), "failed"],
    [async () => { throw new Error("timeout after provider receipt"); }, "unknown"],
    [async () => response({ ErrorCode: 0, MessageID: "malformed" }), "unknown"],
    [async () => response({ ErrorCode: 0 }, 503), "unknown"],
  ]) {
    const sender = createNoticeSender({ providerToken: crypto.randomUUID(), from: "sender@example.invalid", fetchImpl });
    assert.deepEqual(await sender({ email: "applicant@example.invalid", applicationId: APP, noticeId: NOTICE }), { state: expected, providerMessageId: null });
  }
});

test("oversized provider receipts are cancelled and classified unknown without retry", async () => {
  for (const declaredLength of [false, true]) {
    let calls = 0, cancelled = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(65537))); }, cancel() { cancelled = true; } });
    const sender = createNoticeSender({ providerToken: crypto.randomUUID(), from: "sender@example.invalid", fetchImpl: async () => { calls++; return new Response(stream, { headers: declaredLength ? { "content-length": "65537" } : {} }); } });
    assert.deepEqual(await sender({ email: "applicant@example.invalid", applicationId: APP, noticeId: NOTICE }), { state: "unknown", providerMessageId: null });
    assert.equal(cancelled, true); assert.equal(calls, 1);
  }
});

test("explicit notice claims once, records provider acceptance and never reveals the email", async () => {
  const calls = [], sends = []; let claimed = false;
  const handler = createHandler({ authenticate: async () => principal, getConfig: () => ({ baseUrl: PROJECT_URL, publishableKey: KEY }), canSendNotice: () => true,
    sendNotice: async value => { sends.push(value); return { state: "accepted", providerMessageId: PROVIDER_RECEIPT }; },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "kapukai_workshop_notice_claim") { if (claimed) return { result: "duplicate", notice_id: NOTICE, state: "accepted" }; claimed = true; return { result: "claimed", notice_id: NOTICE, email: "applicant@example.invalid", template_version: NOTICE_VERSION }; }
      return { result: "recorded", state: args.p_state };
    },
  });
  const first = await handler(request(noticeRequest()));
  assert.deepEqual(await first.json(), { ok: true, result: "notice_recorded", notice: { id: NOTICE, state: "accepted" } });
  assert.equal(sends.length, 1);
  assert.equal(calls[1].name, "kapukai_workshop_notice_finish");
  assert.equal(calls[1].args.p_provider_message_id, PROVIDER_RECEIPT);
  assert.equal(calls[0].args.p_user_id, USER);
  const repeat = await handler(request(noticeRequest()));
  assert.deepEqual(await repeat.json(), { ok: true, result: "duplicate", notice: { id: NOTICE, state: "accepted" } });
  assert.equal(sends.length, 1);
});

test("uncertain receipt storage keeps an unrepeatable claim and reports unknown", async () => {
  let sent = 0, claimed = false;
  const handler = createHandler({ authenticate: async () => principal, getConfig: () => ({ baseUrl: PROJECT_URL, publishableKey: KEY }), canSendNotice: () => true,
    sendNotice: async () => { sent++; return { state: "accepted", providerMessageId: PROVIDER_RECEIPT }; },
    rpc: async name => {
      if (name === "kapukai_workshop_notice_claim") { if (claimed) return { result: "duplicate", notice_id: NOTICE, state: "pending" }; claimed = true; return { result: "claimed", notice_id: NOTICE, email: "applicant@example.invalid", template_version: NOTICE_VERSION }; }
      throw new Error("receipt database unavailable");
    },
  });
  const first = await handler(request(noticeRequest()));
  assert.deepEqual(await first.json(), { ok: true, result: "notice_unreconciled", notice: { id: NOTICE, state: "unknown" } });
  const repeat = await handler(request(noticeRequest()));
  assert.equal((await repeat.json()).notice.state, "unknown");
  assert.equal(sent, 1);
});

test("withdrawal, suppression and current grant denial prevent notice sending", async () => {
  for (const code of ["forbidden", "suppressed", "transition_denied", "paused"]) {
    let sent = 0;
    const handler = createHandler({ authenticate: async () => principal, getConfig: () => ({ baseUrl: PROJECT_URL, publishableKey: KEY }), canSendNotice: () => true, sendNotice: async () => { sent++; }, rpc: async () => ({ result: code }) });
    const result = await handler(request(noticeRequest()));
    assert.ok([403, 409, 503].includes(result.status)); assert.equal(sent, 0);
  }
});

test("notice cannot override recipient/template or accept expired revision and arbitrary body fields", async () => {
  for (const extra of [{ email: "different@example.invalid" }, { subject: "custom text" }, { template_version: "unreviewed-template" }, { expected_revision: -1 }]) {
    assert.throws(() => normalizeRequest(noticeRequest(extra)), error => error.code === "INVALID_REQUEST");
  }
  const fixture = handlerFixture();
  const result = await fixture.handler(request(noticeRequest()));
  assert.equal(result.status, 503); assert.equal(fixture.calls.length, 0);
});
