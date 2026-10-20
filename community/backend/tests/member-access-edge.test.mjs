import test from "node:test";
import assert from "node:assert/strict";
import { MemberError, PROJECT_URL } from "../supabase/functions/kapukai-members/auth.mjs";
import { createHandler, createRpc, createRateFingerprint, createConfirmationSender, confirmationMessage, normalizeRequest, hashToken, randomToken, CONSENT_VERSION, MEMBER_PAGE, ALLOWED_ORIGINS, MAX_BODY_BYTES } from "../supabase/functions/kapukai-member-access/handler.mjs";

const ORIGIN = "https://kapukai-community.vercel.app";
const NOW = Date.parse("2026-10-20T12:00:00Z");
const ID = "b8bbc25e-c196-4cbb-8eb9-ff38863df2d8";
const SESSION = "b9ef7317-7514-4aac-8221-9a19f42c34b6";
const RECEIPT = "c46ef1e0-836c-4e8c-b6a2-b8c9c40ecc54";
const TOKEN = "a".repeat(43);
const SECRET = "sb_secret_fixture_only";
const GENERIC = { ok: true, result: "request_received" };
const actor = { user_id: ID, session_id: SESSION };
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const body = (action = "access_request", payload = {}) => ({ action, payload: action === "access_request" ? { email: "Fixture@Example.invalid", display_name: " Fixture Name ", request_id: ID, consent_version: CONSENT_VERSION, adult: true, privacy_acknowledged: true, human_review_acknowledged: true, started_at: NOW - 2000, website: "", ...payload } : payload });
const request = (input = body(), options = {}) => new Request(`${PROJECT_URL}/functions/v1/kapukai-member-access${options.search || ""}`, { method: options.method || "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...options.headers }, ...(["GET", "OPTIONS"].includes(options.method) ? {} : { body: typeof input === "string" ? input : JSON.stringify(input) }) });
const inspected = (extra = {}) => ({ result: "ok", state: "awaiting_email", revision: 0, can_confirm: true, can_withdraw: true, consent_version: CONSENT_VERSION, expires_at: "2026-10-22T12:00:00Z", manage_expires_at: "2027-04-18T12:00:00Z", claimed: false, ...extra });
function fixture({ rpc, authenticate = async () => actor, sendConfirmation, configured = () => {}, rateFingerprint = hashToken, ...options } = {}) {
  const calls = [], mails = [], authCalls = [], rates = [];
  const send = Object.assign(sendConfirmation || (async value => { mails.push(value); return { state: "accepted", providerMessageId: RECEIPT }; }), { configured });
  const handler = createHandler({ clock: () => NOW, newToken: () => TOKEN,
    authenticate: async req => { authCalls.push(req); return authenticate(req); },
    rpc: async (name, args) => { calls.push({ name, args }); if (rpc) return rpc(name, args); return ({ kapukai_member_access_is_open: true, kapukai_claim_signup_attempt: true, kapukai_member_access_request: { result: "created", access_request_id: ID }, kapukai_member_access_mail_result: { result: "ok" }, kapukai_member_access_token: inspected(), kapukai_member_access_operator: { result: "ok", requests: [] } })[name]; },
    sendConfirmation: send, rateFingerprint: async value => { rates.push(value); return rateFingerprint(value); }, ...options });
  return { handler, calls, mails, authCalls, rates };
}

test("request normalization binds exact consent and strips only intended whitespace", () => {
  const normalized = normalizeRequest(body(), NOW);
  assert.equal(normalized.payload.email, "fixture@example.invalid");
  assert.equal(normalized.payload.display_name, "Fixture Name");
  assert.equal(Object.hasOwn(normalized.payload, "started_at"), false);
  for (const extra of [{ adult: false }, { privacy_acknowledged: false }, { human_review_acknowledged: false }, { consent_version: "other" }, { started_at: NOW - 1199 }, { started_at: NOW - 86400001 }, { request_id: "not-uuid" }, { display_name: "<script>" }, { display_name: "x".repeat(61) }, { password: "unexpected" }]) assert.throws(() => normalizeRequest(body("access_request", extra), NOW), error => error.code === "INVALID_REQUEST");
  for (const email of ["one<target@example.com>", "two<target@example.com>", "a@example.com,b@example.com", "a@example.com;b@example.com", '"a"@example.com', "a(comment)@example.com", "a\\b@example.com", "a@[example.com]", "a:b@example.com", "a\u007f@example.com"]) assert.throws(() => normalizeRequest(body("access_request", { email }), NOW));
  for (const email of ["first.last+topic@example.invalid", "o'brien@example.invalid"]) assert.equal(normalizeRequest(body("access_request", { email }), NOW).payload.email, email);
});

test("exact action and payload allowlist rejects injected identities and unexpected fields", () => {
  for (const input of [{}, { action: "access_request" }, { ...body(), arbitrary: true }, body("state", {}), body("access_inspect", { token: TOKEN, action: "confirm" }), body("operator_access_queue", { user_id: ID }), body("operator_access_approve", { request_id: ID, expected_revision: 0, expires_days: 15 }), body("operator_access_decline", { request_id: ID, expected_revision: -1 }), body("access_status", { detail: true })]) assert.throws(() => normalizeRequest(input, NOW));
  assert.deepEqual(normalizeRequest(body("operator_access_approve", { request_id: ID, expected_revision: 0, expires_days: 14 }), NOW).payload, { request_id: ID, expected_revision: 0, expires_days: 14 });
});

test("tokens are random 256-bit base64url and deterministic SHA256 is stored separately", async () => {
  const one = randomToken(), two = randomToken();
  assert.match(one, /^[A-Za-z0-9_-]{43}$/); assert.equal(Buffer.from(one, "base64url").length, 32); assert.notEqual(one, two);
  assert.match(await hashToken(one), /^[0-9a-f]{64}$/); assert.notEqual(await hashToken(one), await hashToken(two));
});

test("status checks provider configuration and the database without creating or sending", async () => {
  for (const enabled of [true, false]) {
    const f = fixture({ rpc: async name => { assert.equal(name, "kapukai_member_access_is_open"); return enabled; } });
    const res = await f.handler(request(body("access_status", {})));
    assert.equal(res.status, 200); assert.deepEqual(await res.json(), { ok: true, result: "ok", enabled }); assert.equal(f.calls.length, 1); assert.equal(f.mails.length, 0); assert.equal(f.authCalls.length, 0);
  }
  const f = fixture({ configured: () => { throw new MemberError("SERVICE_NOT_CONFIGURED", 503); } });
  assert.equal((await f.handler(request(body("access_status", {})))).status, 503); assert.equal(f.calls.length, 0);
});

test("created requests return generic receipt, hash token, and claim isolated bounded rates", async () => {
  const f = fixture(); const res = await f.handler(request(body(), { headers: { "cf-connecting-ip": "192.0.2.10" } }));
  assert.equal(res.status, 202); assert.deepEqual(await res.json(), GENERIC); assert.equal(f.authCalls.length, 0);
  const claims = f.calls.filter(call => call.name === "kapukai_claim_signup_attempt");
  assert.deepEqual(claims.map(c => c.args.p_limit), [3, 40, 100]);
  assert.deepEqual(f.rates, ["member-access-address|2026-10-20|fixture@example.invalid", "member-access-network|2026-10-20|192.0.2.10", "member-access-global|2026-10-20|all"]);
  for (const claim of claims) { assert.match(claim.args.p_fingerprint, /^[0-9a-f]{64}$/); assert.equal(JSON.stringify(claim).includes("192.0.2.10"), false); }
  const inserted = f.calls.find(c => c.name === "kapukai_member_access_request").args;
  assert.equal(inserted.p_token_hash, await hashToken(TOKEN)); assert.equal(inserted.p_email, "fixture@example.invalid"); assert.equal(JSON.stringify(f.calls).includes(TOKEN), false);
  assert.deepEqual(f.mails, [{ email: "fixture@example.invalid", accessRequestId: ID, token: TOKEN }]);
  assert.deepEqual(f.calls.at(-1), { name: "kapukai_member_access_mail_result", args: { p_access_request_id: ID, p_state: "accepted", p_provider_message_id: RECEIPT } });
});

test("honeypot has generic success without creating, consuming quota, or sending", async () => {
  const f = fixture(); const res = await f.handler(request(body("access_request", { website: "bot", email: "invalid" })));
  assert.equal(res.status, 202); assert.deepEqual(await res.json(), GENERIC); assert.deepEqual(f.calls, []); assert.deepEqual(f.mails, []);
});

test("paused or unconfigured request fails before quota or creation", async () => {
  const paused = fixture({ rpc: async () => false });
  const res = await paused.handler(request()); assert.equal(res.status, 503); assert.deepEqual(await res.json(), { ok: false, code: "PAUSED" }); assert.equal(paused.calls.length, 1); assert.equal(paused.mails.length, 0);
  const missing = fixture({ configured: () => { throw new MemberError("SERVICE_NOT_CONFIGURED", 503); } });
  assert.equal((await missing.handler(request())).status, 503); assert.equal(missing.calls.length, 0);
});

test("address, network, or global throttle suppresses creation and mail with the same receipt", async () => {
  for (const blocked of [3, 40, 100]) {
    const f = fixture({ rpc: async (name, args) => name === "kapukai_member_access_is_open" || (name === "kapukai_claim_signup_attempt" && args.p_limit !== blocked) });
    const res = await f.handler(request()); assert.equal(res.status, 202); assert.deepEqual(await res.json(), GENERIC); assert.equal(f.calls.some(c => c.name === "kapukai_member_access_request"), false); assert.equal(f.mails.length, 0);
  }
});

test("duplicates and idempotency conflicts never replay a provider handoff", async () => {
  for (const result of ["duplicate", "idempotency_conflict", "rate_limited"]) {
    const f = fixture({ rpc: async name => name === "kapukai_member_access_request" ? { result } : true });
    const res = await f.handler(request()); assert.equal(res.status, 202); assert.deepEqual(await res.json(), GENERIC); assert.equal(f.mails.length, 0); assert.equal(f.calls.some(c => c.name === "kapukai_member_access_mail_result"), false);
  }
});

test("uncertain send and missing delivery receipt never retry", async () => {
  let attempts = 0;
  const f = fixture({ sendConfirmation: async () => { attempts++; throw new Error("provider private body"); }, rpc: async name => {
    if (name === "kapukai_member_access_request") return { result: "created", access_request_id: ID };
    if (name === "kapukai_member_access_mail_result") throw new Error("database unavailable");
    return true;
  } });
  const res = await f.handler(request()); assert.equal(res.status, 202); assert.deepEqual(await res.json(), GENERIC); assert.equal(attempts, 1);
  assert.deepEqual(f.calls.at(-1).args, { p_access_request_id: ID, p_state: "unknown", p_provider_message_id: null });
});

test("inspection never confirms and public token projection omits identities and secrets", async () => {
  const f = fixture({ rpc: async () => inspected({ email: "private@example.invalid", token_hash: "private", id: ID, invite_token: "d".repeat(64) }) });
  const res = await f.handler(request(body("access_inspect", { token: TOKEN })));
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), { ok: true, ...inspected() }); assert.equal(f.authCalls.length, 0); assert.equal(f.mails.length, 0);
  assert.deepEqual(f.calls, [{ name: "kapukai_member_access_token", args: { p_token_hash: await hashToken(TOKEN), p_action: "inspect" } }]);
});

test("confirmation and withdrawal are explicit independent token actions and safe result mappings", async () => {
  for (const action of ["access_confirm", "access_withdraw"]) {
    const f = fixture({ configured: () => { throw new Error("not needed"); } });
    assert.equal((await f.handler(request(body(action, { token: TOKEN })))).status, 200); assert.equal(f.calls[0].args.p_action, action.slice(7)); assert.equal(f.calls.length, 1); assert.equal(f.mails.length, 0);
  }
  for (const [result, expected] of [["invalid", 400], ["expired", 410], ["conflict", 409], ["paused", 503]]) {
    const f = fixture({ rpc: async () => ({ result, detail: "private" }) }); const res = await f.handler(request(body("access_confirm", { token: TOKEN })));
    assert.equal(res.status, expected); assert.deepEqual(await res.json(), { ok: false, code: result.toUpperCase() });
  }
});

test("operator actions use verified identity, bounded queue projection, and never send mail", async () => {
  const f = fixture({ rpc: async () => ({ result: "ok", requests: [{ id: ID, email: "fixture@example.invalid", display_name: "Fixture", state: "awaiting_review", revision: 1, token_hash: "private", invite_token: "private" }] }) });
  const res = await f.handler(request(body("operator_access_queue", {}))); assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).requests, [{ id: ID, email: "fixture@example.invalid", display_name: "Fixture", state: "awaiting_review", revision: 1 }]);
  assert.deepEqual(f.calls[0].args, { p_user_id: ID, p_session_id: SESSION, p_action: "queue", p_payload: {} }); assert.equal(f.authCalls.length, 1); assert.equal(f.mails.length, 0);
  const full = fixture({ rpc: async () => ({ result: "ok", requests: Array.from({ length: 101 }, () => ({ id: ID })) }) });
  assert.equal((await full.handler(request(body("operator_access_queue", {})))).status, 503);
});

test("unauthenticated or forged operator identity cannot reach database", async () => {
  for (const authenticate of [async () => { throw new MemberError("AUTHENTICATION_REQUIRED", 401); }, async () => ({ user_id: "forged", session_id: SESSION })]) {
    const f = fixture({ authenticate }); const res = await f.handler(request(body("operator_access_queue", {}))); assert.equal(res.status, 401); assert.equal(f.calls.length, 0);
  }
});

test("approval exposes only the newly returned invitation, decline stays minimal, errors are bounded", async () => {
  const f = fixture({ rpc: async () => ({ result: "ok", invite_token: "d".repeat(64), invitation_id: ID, expires_at: "2026-10-22T12:00:00Z", token_hash: "private" }) });
  const approved = await f.handler(request(body("operator_access_approve", { request_id: ID, expected_revision: 1, expires_days: 7 })));
  assert.deepEqual(await approved.json(), { ok: true, result: "ok", invite_token: "d".repeat(64), invitation_id: ID, expires_at: "2026-10-22T12:00:00Z" });
  const declined = await f.handler(request(body("operator_access_decline", { request_id: ID, expected_revision: 1 }))); assert.deepEqual(await declined.json(), { ok: true, result: "ok" }); assert.equal(f.mails.length, 0);
  for (const [result, status] of [["forbidden", 403], ["conflict", 409], ["not_found", 404], ["expired", 410], ["paused", 503], ["rate_limited", 429], ["unexpected private result", 503]]) {
    const other = fixture({ rpc: async () => ({ result, detail: "private" }) }); const res = await other.handler(request(body("operator_access_queue", {}))); assert.equal(res.status, status); assert.equal((await res.text()).includes("private"), false);
  }
});

test("CORS is exact and denial occurs before any side effect", async () => {
  const f = fixture();
  for (const origin of ["", "null", "https://kapukai.org.attacker.invalid", "http://kapukai.org", "https://random.vercel.app"]) {
    const res = await f.handler(request(body(), { headers: { origin } })); assert.equal(res.status, 403); assert.equal(res.headers.get("access-control-allow-origin"), null);
  }
  for (const origin of ALLOWED_ORIGINS) {
    const res = await f.handler(request(body(), { method: "OPTIONS", headers: { origin } })); assert.equal(res.status, 204); assert.equal(res.headers.get("access-control-allow-origin"), origin); assert.equal(res.headers.get("access-control-allow-credentials"), null);
  }
  assert.equal(f.calls.length, 0); assert.equal(f.authCalls.length, 0);
});

test("queries, methods, content type, malformed JSON and excessive bodies fail before RPC", async () => {
  const f = fixture();
  for (const [req, expected] of [[request(body(), { method: "GET" }), 405], [request(body(), { search: `?token=${TOKEN}` }), 400], [request(body(), { headers: { "content-type": "text/plain" } }), 400], [request("{"), 400], [request("x".repeat(MAX_BODY_BYTES + 1)), 413], [request(body(), { headers: { "content-length": "4097" } }), 413]]) {
    const res = await f.handler(req); assert.equal(res.status, expected); assert.equal(res.headers.get("cache-control"), "no-store"); assert.equal(res.headers.get("referrer-policy"), "no-referrer"); assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  }
  assert.equal(f.calls.length, 0);
});

test("streamed input bounds cancel excessive bytes and reject invalid UTF8", async () => {
  const f = fixture(); let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_BODY_BYTES + 1)); }, cancel() { cancelled = true; } });
  const base = { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, duplex: "half" };
  assert.equal((await f.handler(new Request(`${PROJECT_URL}/functions/v1/kapukai-member-access`, { ...base, body: stream }))).status, 413); assert.equal(cancelled, true);
  assert.equal((await f.handler(new Request(`${PROJECT_URL}/functions/v1/kapukai-member-access`, { ...base, body: new Uint8Array([0xff]) }))).status, 400); assert.equal(f.calls.length, 0);
});

test("RPC transport allowlists names, pins service role headers and bounds failures", async () => {
  const calls = []; const rpc = createRpc({ baseUrl: PROJECT_URL, serviceKey: SECRET, fetchImpl: async (...args) => { calls.push(args); return response(true); } });
  assert.equal(await rpc("kapukai_member_access_is_open", {}), true);
  assert.equal(calls[0][0], `${PROJECT_URL}/rest/v1/rpc/kapukai_member_access_is_open`); assert.equal(calls[0][1].headers.apikey, SECRET); assert.equal(calls[0][1].headers.Authorization, undefined); assert.equal(calls[0][1].redirect, "error");
  await assert.rejects(rpc("kapukai_member_command", {}), error => error.code === "INVALID_REQUEST"); assert.equal(calls.length, 1);
  const wrong = createRpc({ baseUrl: PROJECT_URL, serviceKey: "sb_publishable_fixture", fetchImpl: async () => assert.fail("no request") });
  await assert.rejects(wrong("kapukai_member_access_is_open", {}), error => error.code === "SERVICE_NOT_CONFIGURED");
  let cancelled = false;
  const big = createRpc({ baseUrl: PROJECT_URL, serviceKey: SECRET, fetchImpl: async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(524289)); }, cancel() { cancelled = true; } })) });
  await assert.rejects(big("kapukai_member_access_is_open", {}), error => error.code === "TEMPORARILY_UNAVAILABLE"); assert.equal(cancelled, true);
});

test("rate fingerprints are keyed and separated by scope and day", async () => {
  const one = createRateFingerprint({ baseUrl: PROJECT_URL, serviceKey: SECRET }), two = createRateFingerprint({ baseUrl: PROJECT_URL, serviceKey: "sb_secret_different_fixture" });
  const a = "member-access-address|2026-10-20|fixture@example.invalid";
  assert.match(await one(a), /^[0-9a-f]{64}$/); assert.equal(await one(a), await one(a)); assert.notEqual(await one(a), await two(a)); assert.notEqual(await one(a), await one(a.replace("2026-10-20", "2026-10-21"))); assert.notEqual(await one(a), await one(a.replace("address", "network")));
});

test("confirmation mail contains fixed private fragment and explicitly separate confirmation", () => {
  const msg = confirmationMessage(TOKEN);
  assert.ok(msg.text.includes(`${MEMBER_PAGE}#access_token=${TOKEN}`)); assert.ok(msg.html.includes(`href="${MEMBER_PAGE}#access_token=${TOKEN}"`)); assert.match(msg.text, /Opening this link does not confirm anything/); assert.match(msg.text, /does not create an account/); assert.equal(msg.html.includes("<img"), false); assert.throws(() => confirmationMessage('<script>'));
});

test("Postmark sends once with trackers disabled and minimal nonidentifying metadata", async () => {
  const calls = [];
  const send = createConfirmationSender({ providerToken: "fixture-provider", from: "Kapukai <noreply@example.invalid>", fetchImpl: async (...args) => { calls.push(args); return response({ ErrorCode: 0, MessageID: RECEIPT }); } });
  assert.equal(send.configured(), undefined);
  assert.deepEqual(await send({ email: "fixture@example.invalid", accessRequestId: ID, token: TOKEN }), { state: "accepted", providerMessageId: RECEIPT });
  assert.equal(calls.length, 1); assert.equal(calls[0][0], "https://api.postmarkapp.com/email"); const message = JSON.parse(calls[0][1].body);
  assert.equal(message.To, "fixture@example.invalid"); assert.equal(message.TrackOpens, false); assert.equal(message.TrackLinks, "None"); assert.deepEqual(message.Metadata, { access_request_id: ID, message_type: "member_access_confirmation" }); assert.equal(JSON.stringify(message.Metadata).includes(TOKEN), false); assert.equal(calls[0][1].redirect, "error");
  await assert.rejects(send({ email: "name<fixture@example.invalid>", accessRequestId: ID, token: TOKEN })); assert.equal(calls.length, 1);
});

test("provider outage, rejection and oversized receipts are recorded without retries", async () => {
  for (const [fetchImpl, state] of [[async () => { throw new Error("uncertain"); }, "unknown"], [async () => response({ ErrorCode: 300 }, 422), "failed"], [async () => response({ ErrorCode: 0, MessageID: "not-uuid" }), "unknown"], [async () => new Response("x".repeat(65537)), "unknown"]]) {
    let calls = 0; const send = createConfirmationSender({ providerToken: "fixture-provider", from: "noreply@example.invalid", fetchImpl: async (...args) => { calls++; return fetchImpl(...args); } });
    assert.deepEqual(await send({ email: "fixture@example.invalid", accessRequestId: ID, token: TOKEN }), { state, providerMessageId: null }); assert.equal(calls, 1);
  }
  assert.throws(() => createConfirmationSender({ providerToken: "", from: "" }).configured(), error => error.code === "SERVICE_NOT_CONFIGURED");
});
