import test from "node:test";
import assert from "node:assert/strict";
import { createAuthenticator, publicAuthConfig, serviceHeaders, MemberError, PROJECT_URL } from "../supabase/functions/kapukai-members/auth.mjs";
import { createHandler, createRpc, createSignupSender, normalizeRequest, ALLOWED_ORIGINS, MAX_BODY_BYTES } from "../supabase/functions/kapukai-members/handler.mjs";

const ORIGIN = "https://kapukai-community.vercel.app";
const KEY = "sb_publishable_fixture_only";
const SECRET = "sb_secret_fixture_only";
const NOW = Date.parse("2026-10-19T17:00:00Z");
const USER = "b8bbc25e-c196-4cbb-8eb9-ff38863df2d8";
const SESSION = "b9ef7317-7514-4aac-8221-9a19f42c34b6";
const OTHER = "c46ef1e0-836c-4e8c-b6a2-b8c9c40ecc54";
const INVITE = "d".repeat(64);
const PASSWORD = "fixture-password-no-real-account";
const actor = { user_id: USER, session_id: SESSION };
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = (extra = {}) => `${encode({ alg: "RS256" })}.${encode({ iss: `${PROJECT_URL}/auth/v1`, aud: "authenticated", role: "authenticated", sub: USER, session_id: SESSION, iat: NOW / 1000 - 60, exp: NOW / 1000 + 3600, ...extra })}.fixture_signature`;
const keyJwt = role => `${encode({ alg: "HS256" })}.${encode({ role, ref: "tbxfsjipkrdwyctepesf" })}.fixture`;
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const request = (body = { action: "state", payload: {} }, options = {}) => new Request(`${PROJECT_URL}/functions/v1/kapukai-members${options.search || ""}`, { method: options.method || "POST", headers: { origin: ORIGIN, "content-type": "application/json", authorization: `Bearer ${token()}`, ...options.headers }, ...(["GET", "OPTIONS"].includes(options.method) ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
function authFixture({ jwt, user = { id: USER, email_confirmed_at: "2026-10-01T00:00:00Z", is_anonymous: false }, providerStatus = 200, fetchImpl } = {}) {
  const calls = [];
  const authenticate = createAuthenticator({ baseUrl: PROJECT_URL, publishableKey: KEY, clock: () => NOW, fetchImpl: async (...args) => { calls.push(args); return fetchImpl ? fetchImpl(...args) : response(user, providerStatus); } });
  return { calls, authenticate, request: request({}, { headers: { authorization: `Bearer ${jwt || token()}` } }) };
}
function fixture({ result = { result: "ok", enabled: true, profile: null }, authenticate = async () => actor, config = { baseUrl: PROJECT_URL, publishableKey: KEY }, rpc, sendSignup } = {}) {
  const calls = [];
  return { calls, handler: createHandler({ authenticate, rpc: async (name, args) => { calls.push({ name, args }); return rpc ? rpc(name, args) : result; }, getConfig: () => config, sendSignup }) };
}
const signup = (extra = {}) => ({ action: "signup", payload: { email: "Fixture@Example.invalid", password: PASSWORD, invite_token: INVITE, adult: true, privacy_acknowledged: true, ...extra } });

test("public configuration rejects secret/service keys and a wrong project", () => {
  assert.deepEqual(publicAuthConfig({ baseUrl: PROJECT_URL, publishableKey: KEY }), { supabase_url: PROJECT_URL, publishable_key: KEY, session_seconds: 1800 });
  assert.equal(publicAuthConfig({ baseUrl: PROJECT_URL, publishableKey: keyJwt("anon") }).publishable_key, keyJwt("anon"));
  for (const key of [SECRET, keyJwt("service_role"), "", token(), "sb_publishable_" + "x".repeat(4096)]) assert.throws(() => publicAuthConfig({ baseUrl: PROJECT_URL, publishableKey: key }), error => error.code === "AUTH_NOT_CONFIGURED");
  assert.throws(() => publicAuthConfig({ baseUrl: "https://other.supabase.co", publishableKey: KEY }));
});

test("secret keys only use apikey while legacy service JWTs use a verified role-specific Bearer", () => {
  const secret = serviceHeaders({ baseUrl: PROJECT_URL, serviceKey: SECRET });
  assert.equal(secret.apikey, SECRET); assert.equal(secret.Authorization, undefined);
  assert.equal(serviceHeaders({ baseUrl: PROJECT_URL, serviceKey: keyJwt("service_role") }).Authorization, `Bearer ${keyJwt("service_role")}`);
  for (const serviceKey of [KEY, keyJwt("anon"), "", token()]) assert.throws(() => serviceHeaders({ baseUrl: PROJECT_URL, serviceKey }), error => error.code === "SERVICE_NOT_CONFIGURED");
});

test("verified member identity has no internal principal mapping or metadata-based authority", async () => {
  const f = authFixture({ user: { id: USER, email_confirmed_at: "2026-10-01T00:00:00Z", user_metadata: { role: "operator", member_id: OTHER }, email: "not-authority@example.invalid" } });
  assert.deepEqual(await f.authenticate(f.request), actor);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], `${PROJECT_URL}/auth/v1/user`);
  assert.equal(f.calls[0][1].redirect, "error"); assert.equal(f.calls[0][1].cache, "no-store");
});

test("absent, malformed and excessive bearer values never reach the identity provider", async () => {
  for (const authorization of ["", "Basic x", "Bearer application-token", "Bearer a.b.c extra", `Bearer ${"x".repeat(16400)}.a.b`]) {
    const f = authFixture(); await assert.rejects(f.authenticate(request({}, { headers: { authorization } })), error => error.code === "AUTHENTICATION_REQUIRED"); assert.equal(f.calls.length, 0);
  }
});

test("forged bearer claims cannot override Auth rejection or provider outages", async () => {
  for (const [providerStatus, expected] of [[401, 401], [403, 401], [404, 401], [500, 503]]) {
    const f = authFixture({ providerStatus, user: { private_details: "never expose" } });
    await assert.rejects(f.authenticate(f.request), error => error.status === expected && !error.message.includes("private"));
    assert.equal(f.calls.length, 1);
  }
});

test("token issuer, role, audience, subject, live age and session shape are constrained after verification", async () => {
  for (const extra of [{ exp: NOW / 1000 }, { exp: NOW / 1000 - 99 }, { iss: "https://attacker.invalid/auth/v1" }, { aud: "anon" }, { role: "service_role" }, { sub: OTHER }, { session_id: "not-uuid" }, { iat: NOW / 1000 + 60 }, { iat: NOW / 1000 - 1800 }, { nbf: NOW / 1000 + 60 }, { is_anonymous: true }]) {
    const f = authFixture({ jwt: token(extra) }); await assert.rejects(f.authenticate(f.request), error => error.status === 401);
    assert.equal(f.calls.length, 1);
  }
});

test("unconfirmed, anonymous, banned and deleted identities fail closed", async () => {
  for (const extra of [{ email_confirmed_at: null }, { email_confirmed_at: "invalid" }, { is_anonymous: true }, { banned_until: "2030-01-01T00:00:00Z" }, { deleted_at: "2026-10-19T10:00:00Z" }]) {
    const f = authFixture({ user: { id: USER, email_confirmed_at: "2026-10-01T00:00:00Z", ...extra } });
    await assert.rejects(f.authenticate(f.request), error => error.status === 401);
  }
});

test("oversized provider responses are cancelled both declared and streamed", async () => {
  for (const declared of [false, true]) {
    let cancelled = false;
    const f = authFixture({ fetchImpl: async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("x".repeat(65537))); }, cancel() { cancelled = true; } }), { headers: declared ? { "content-length": "65537" } : {} }) });
    await assert.rejects(f.authenticate(f.request), error => error.code === "IDENTITY_UNAVAILABLE"); assert.equal(cancelled, true);
  }
});

test("all allowed origins receive precise CORS and missing/lookalike origins fail before authentication", async () => {
  const f = fixture({ authenticate: async () => assert.fail("must not authenticate") });
  for (const origin of ["", "null", "http://kapukai.org", "https://kapukai.org.attacker.invalid", "https://random.vercel.app", "http://localhost:5173"]) {
    const r = await f.handler(request({ action: "config" }, { headers: { origin } })); assert.equal(r.status, 403); assert.equal(r.headers.get("access-control-allow-origin"), null);
  }
  for (const origin of ALLOWED_ORIGINS) {
    const r = await f.handler(request({}, { method: "OPTIONS", headers: { origin } }));
    assert.equal(r.status, 204); assert.equal(r.headers.get("access-control-allow-origin"), origin); assert.equal(await r.text(), "");
    assert.equal(r.headers.get("access-control-allow-credentials"), null);
  }
  assert.equal(f.calls.length, 0);
});

test("config is intentionally public, no-store and never returns mistaken secret configuration", async () => {
  const f = fixture({ authenticate: async () => assert.fail("config is public") });
  const r = await f.handler(request({ action: "config", payload: {} }));
  assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "no-store"); assert.equal((await r.json()).publishable_key, KEY);
  const bad = fixture({ config: { baseUrl: PROJECT_URL, publishableKey: SECRET } });
  const denied = await bad.handler(request({ action: "config" })); assert.equal(denied.status, 503); assert.ok(!(await denied.text()).includes(SECRET));
});

test("public feed makes a service RPC but projects out accidental private response fields", async () => {
  const f = fixture({ authenticate: async () => assert.fail("feed is public"), result: { result: "ok", email: "private", feedback: [{ id: OTHER, excerpt: "Consented excerpt", email: "private", body: "private original" }], credentials: [{ id: USER, title: "Verified training", source_url: "https://example.invalid/credential", private_notes: "private" }] } });
  const r = await f.handler(request({ action: "public" })); assert.equal(r.status, 200);
  const serialized = JSON.stringify(await r.json()); assert.ok(!serialized.includes("private"));
  assert.deepEqual(f.calls, [{ name: "kapukai_member_public", args: {} }]);
});

test("authenticated commands pass only verified UID/session and the fixed RPC/action", async () => {
  const f = fixture(); const r = await f.handler(request({ action: "profile_save", payload: { display_name: "Test", bio: "", interests: ["tools"], discoverable: false, reviewer_opt_in: false, reviewer_scopes: [] } }));
  assert.equal(r.status, 200); assert.equal(f.calls[0].name, "kapukai_member_command");
  assert.deepEqual(Object.keys(f.calls[0].args).sort(), ["p_action", "p_payload", "p_session_id", "p_user_id"]);
  assert.equal(f.calls[0].args.p_user_id, USER); assert.equal(f.calls[0].args.p_session_id, SESSION);
  const malicious = await f.handler(request({ action: "state", payload: {}, user_id: OTHER })); assert.equal(malicious.status, 400); assert.equal(f.calls.length, 1);
});

test("self-export permits bounded pagination while keeping the empty payload compatible", async () => {
  for (const payload of [{}, { page: 0 }, { page: 100000 }]) {
    const f = fixture({ result: { result: "ok", next_page: null, data: { profile: {} } } });
    const r = await f.handler(request({ action: "export", payload }));
    assert.equal(r.status, 200); assert.deepEqual(f.calls[0].args.p_payload, payload);
    assert.equal(f.calls[0].args.p_user_id, USER); assert.equal((await r.json()).next_page, null);
  }
  for (const payload of [{ page: -1 }, { page: 100001 }, { page: "1" }, { page: 1.5 }, { page: null }, { page: 0, user_id: OTHER }]) assert.throws(() => normalizeRequest({ action: "export", payload }), error => error.code === "INVALID_REQUEST");
});

test("assignment withdrawal passes only the assignment ID and verified actor to SQL", async () => {
  const f = fixture(); const r = await f.handler(request({ action: "assignment_cancel", payload: { assignment_id: OTHER } }));
  assert.equal(r.status, 200);
  assert.deepEqual(f.calls, [{ name: "kapukai_member_command", args: { p_user_id: USER, p_session_id: SESSION, p_action: "assignment_cancel", p_payload: { assignment_id: OTHER } } }]);
  for (const payload of [{}, { assignment_id: "not-uuid" }, { assignment_id: OTHER, reviewer_id: USER }]) assert.throws(() => normalizeRequest({ action: "assignment_cancel", payload }), error => error.code === "INVALID_REQUEST");
});

test("revocation, pause, conflicts, capacity and durable rate limiting retain safe HTTP statuses", async () => {
  for (const [result, status] of [["forbidden", 403], ["paused", 503], ["invalid", 400], ["conflict", 409], ["not_found", 404], ["capacity_full", 409], ["rate_limited", 429]]) {
    const f = fixture({ result: { result, private_message: "hidden" } }); const r = await f.handler(request());
    assert.equal(r.status, status); assert.deepEqual(await r.json(), { ok: false, code: result.toUpperCase() });
    assert.equal(r.headers.get("cache-control"), "no-store"); if (status === 429) assert.equal(r.headers.get("retry-after"), "60");
  }
});

test("authentication failure prevents SQL and arbitrary failures never leak text", async () => {
  const f = fixture({ authenticate: async () => { throw new MemberError("AUTHENTICATION_REQUIRED", 401); } });
  assert.equal((await f.handler(request())).status, 401); assert.equal(f.calls.length, 0);
  for (const error of [new Error("private password"), new MemberError("SECRET_PROVIDER_DETAIL", 500)]) {
    const broken = fixture({ rpc: async () => { throw error; } }); const r = await broken.handler(request());
    assert.equal(r.status, 503); assert.deepEqual(await r.json(), { ok: false, code: "TEMPORARILY_UNAVAILABLE" });
  }
});

test("arbitrary actions, ID overrides, nested shape tricks and excessive payload fields are rejected", () => {
  for (const body of [null, [], { action: "__proto__" }, { action: "constructor" }, { action: "delete_all" }, { action: "state", payload: { user_id: OTHER } }, { action: "state", payload: null }, { action: "state", payload: [] }, { action: "join", payload: { invite_token: INVITE, display_name: "Test", adult: false, privacy_acknowledged: true } }, { action: "post_create", payload: { room_id: "private_case", body: "Test" } }, { action: "operator_config", payload: { enabled: true, max_members: 31 } }, { action: "credential_submit", payload: { title: "Claim", issuer: "Issuer", source_url: "javascript:alert(1)" } }, { action: "credential_submit", payload: { title: "Claim", issuer: "Issuer", source_url: "https://secret@example.invalid/" } }, { action: "profile_save", payload: { display_name: "Test", bio: "", interests: ["tools", "tools"], discoverable: true, reviewer_opt_in: false, reviewer_scopes: [] } }]) assert.throws(() => normalizeRequest(body), error => error.code === "INVALID_REQUEST");
});

test("body limit counts streamed UTF-8 bytes, cannot be bypassed by missing length, and cancels oversized bodies", async () => {
  const f = fixture();
  assert.equal((await f.handler(request('{"action":"state","padding":"' + "日".repeat(6000) + '"}'))).status, 413);
  for (const declared of [false, true]) {
    let cancelled = false;
    const streamed = new Request(`${PROJECT_URL}/functions/v1/kapukai-members`, { method: "POST", duplex: "half", headers: { origin: ORIGIN, "content-type": "application/json", ...(declared ? { "content-length": String(MAX_BODY_BYTES + 1) } : {}) }, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_BODY_BYTES + 1)); }, cancel() { cancelled = true; } }) });
    assert.equal((await f.handler(streamed)).status, 413); assert.equal(cancelled, true);
  }
  assert.equal(f.calls.length, 0);
});

test("non-JSON, malformed JSON, wrong methods and URL credentials never reach SQL", async () => {
  const f = fixture();
  assert.equal((await f.handler(request("{"))).status, 400);
  assert.equal((await f.handler(request({}, { headers: { "content-type": "text/plain" } }))).status, 400);
  assert.equal((await f.handler(request({}, { search: "?access_token=private" }))).status, 400);
  assert.equal((await f.handler(request({}, { method: "GET" }))).status, 405); assert.equal(f.calls.length, 0);
});

test("RPC wrapper rejects arbitrary names and wrong credentials before network access", async () => {
  let calls = 0;
  for (const serviceKey of [KEY, ""]) {
    const rpc = createRpc({ baseUrl: PROJECT_URL, serviceKey, fetchImpl: async () => { calls++; } });
    await assert.rejects(rpc("kapukai_member_command", {}), error => error.code === "SERVICE_NOT_CONFIGURED");
  }
  const rpc = createRpc({ baseUrl: PROJECT_URL, serviceKey: SECRET, fetchImpl: async () => { calls++; } });
  await assert.rejects(rpc("kapukai_delete_all", {}), error => error.code === "INVALID_REQUEST"); assert.equal(calls, 0);
});

test("RPC wrapper bounds streamed responses and never retries failures", async () => {
  for (const fetchImpl of [async () => response({ private: "text" }, 500), async () => response({ body: "x".repeat(1048577) }), async () => { throw Error("private network failure"); }]) {
    let calls = 0; const rpc = createRpc({ baseUrl: PROJECT_URL, serviceKey: SECRET, fetchImpl: async (...args) => { calls++; return fetchImpl(...args); } });
    await assert.rejects(rpc("kapukai_member_command", {}), error => error.code === "TEMPORARILY_UNAVAILABLE"); assert.equal(calls, 1);
  }
});

test("signup consumes only a validated invitation eligibility/rate check and never puts password in SQL or reply", async () => {
  const sent = []; const f = fixture({ sendSignup: async input => { sent.push(input); }, result: { result: "ok" }, authenticate: async () => assert.fail("signup does not authenticate") });
  const r = await f.handler(request(signup())); assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, result: "verification_sent" });
  assert.deepEqual(f.calls, [{ name: "kapukai_member_signup_check", args: { p_email: "fixture@example.invalid", p_invite_token: INVITE } }]);
  assert.deepEqual(sent, [{ email: "fixture@example.invalid", password: PASSWORD }]);
  assert.ok(!JSON.stringify(f.calls).includes(PASSWORD));
});

test("ineligible, expired, paused and rate-limited signup requests have indistinguishable replies and no email", async () => {
  for (const result of ["forbidden", "invalid", "not_found", "expired", "paused", "capacity_full", "rate_limited"]) {
    const f = fixture({ result: { result, private: "detail" }, sendSignup: async () => assert.fail("ineligible signup must not send") });
    const r = await f.handler(request(signup())); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true, result: "verification_sent" });
  }
});

test("signup schema rejects passwords outside bounds, identity overrides and absent adult/privacy consent", () => {
  for (const extra of [{ password: "short" }, { password: "x".repeat(129) }, { invite_token: "x".repeat(64) }, { adult: false }, { privacy_acknowledged: false }, { role: "operator" }, { email: "x@example.invalid\r\nBcc:evil@example.invalid" }]) assert.throws(() => normalizeRequest(signup(extra)), error => error.code === "INVALID_REQUEST");
});

test("signup sender uses only Auth signup generation then a branded OTP email with tracking disabled", async () => {
  const calls = []; const send = createSignupSender({ baseUrl: PROJECT_URL, serviceKey: SECRET, providerToken: "fixture-postmark-key", from: "sender@example.invalid", fetchImpl: async (url, options) => { calls.push({ url, options }); return url.endsWith("generate_link") ? response({ email_otp: "123456", verification_type: "signup", email: "fixture@example.invalid", hashed_token: "must-not-escape", action_link: "https://example.invalid/private" }) : response({ ErrorCode: 0, MessageID: OTHER }); } });
  assert.deepEqual(await send({ email: "fixture@example.invalid", password: PASSWORD }), { state: "accepted" });
  assert.equal(calls.length, 2); assert.equal(calls[0].url, `${PROJECT_URL}/auth/v1/admin/generate_link`);
  assert.deepEqual(JSON.parse(calls[0].options.body), { type: "signup", email: "fixture@example.invalid", password: PASSWORD });
  assert.equal(calls[0].options.headers.Authorization, undefined);
  const mail = JSON.parse(calls[1].options.body); assert.equal(mail.To, "fixture@example.invalid"); assert.equal(mail.TrackOpens, false); assert.equal(mail.TrackLinks, "None");
  assert.ok(mail.TextBody.includes("123456")); assert.ok(mail.HtmlBody.includes("123456"));
  assert.ok(!calls[1].options.body.includes(PASSWORD)); assert.ok(!calls[1].options.body.includes("must-not-escape")); assert.ok(!calls[1].options.body.includes(INVITE));
});

test("signup sender cannot send malformed/provider-controlled HTML codes and never retries uncertain delivery", async () => {
  for (const generated of [{ email_otp: "<script>x</script>", verification_type: "signup" }, { email_otp: "123456", verification_type: "recovery" }, { email_otp: "123456", verification_type: "signup", email: "other@example.invalid" }]) {
    let calls = 0; const send = createSignupSender({ baseUrl: PROJECT_URL, serviceKey: SECRET, providerToken: "fixture", from: "sender@example.invalid", fetchImpl: async () => { calls++; return response(generated); } });
    await assert.rejects(send({ email: "fixture@example.invalid", password: PASSWORD }), error => error.code === "TEMPORARILY_UNAVAILABLE"); assert.equal(calls, 1);
  }
  let calls = 0; const send = createSignupSender({ baseUrl: PROJECT_URL, serviceKey: SECRET, providerToken: "fixture", from: "sender@example.invalid", fetchImpl: async () => { calls++; if (calls === 1) return response({ email_otp: "123456", verification_type: "signup" }); throw Error("uncertain provider handoff"); } });
  const f = fixture({ sendSignup: send }); const r = await f.handler(request(signup()));
  assert.equal(r.status, 503); assert.deepEqual(await r.json(), { ok: false, code: "TEMPORARILY_UNAVAILABLE" }); assert.equal(calls, 2);
});

test("signup provider account-exists responses do not reveal account status or trigger email", async () => {
  for (const status of [400, 422]) {
    let calls = 0;
    const send = createSignupSender({ baseUrl: PROJECT_URL, serviceKey: SECRET, providerToken: "fixture", from: "sender@example.invalid", fetchImpl: async () => { calls++; return response({ code: "email_exists", message: "Private registration details" }, status); } });
    const f = fixture({ sendSignup: send }); const r = await f.handler(request(signup()));
    assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true, result: "verification_sent" }); assert.equal(calls, 1);
  }
});

test("missing mail configuration fails before eligibility counter or account creation", async () => {
  const send = createSignupSender({ baseUrl: PROJECT_URL, serviceKey: SECRET, providerToken: "", from: "", fetchImpl: async () => assert.fail("not configured") });
  const f = fixture({ sendSignup: send }); const r = await f.handler(request(signup())); assert.equal(r.status, 503); assert.equal(f.calls.length, 0);
});
