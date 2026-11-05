import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, createRpc, hashToken, normalizeRequest, ALLOWED_ORIGINS, RECOVERY_ORIGIN, MAX_BODY_BYTES } from "../supabase/functions/kapukai-member-access/handler.mjs";
import { createRecoverySender } from "../supabase/functions/kapukai-members/auth-code-delivery.mjs";
import { MemberError, PROJECT_URL } from "../supabase/functions/kapukai-members/auth.mjs";

const ID = "11835f81-6373-4ee0-9fef-32698771d80b";
const MESSAGE_ID = "e8cc978b-dba7-4fc6-85ef-1570b4df98fe";
const ADDRESS = "person@example.invalid";
const NOW = Date.parse("2026-11-05T12:00:00Z");
const GENERIC = { ok: true, result: "request_received" };
const payload = overrides => ({ action: "auth_recovery_request", payload: { email: ADDRESS, request_id: ID, ...overrides } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const request = (body = payload(), origin = RECOVERY_ORIGIN, extras = {}) => new Request("https://service.example.invalid/member-access", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body), ...extras });

function fixture(options = {}) {
  const calls = [], claims = new Map(), fingerprints = [], background = [];
  let sent = 0, authenticated = 0;
  const rpc = async (name, params) => {
    calls.push({ name, params });
    if (name === "kapukai_claim_signup_attempt") return options.rateResult ?? true;
    if (name === "kapukai_auth_recovery_claim") {
      if (options.claimError) throw new Error("private database details");
      const prior = claims.get(params.p_request_id);
      if (prior) return { result: prior.fingerprint === params.p_address_fingerprint ? "duplicate" : "idempotency_conflict" };
      claims.set(params.p_request_id, { fingerprint: params.p_address_fingerprint, state: "pending" });
      return { result: "claimed" };
    }
    if (name === "kapukai_auth_recovery_mail_result") {
      if (options.receiptError) throw new Error("private provider details");
      claims.get(params.p_request_id).state = params.p_state;
      return { result: "ok", state: params.p_state };
    }
    throw new Error("unexpected RPC");
  };
  const sendRecovery = Object.assign(async p => {
    sent++;
    assert.deepEqual(p, { email: ADDRESS });
    if (options.sendError) throw new Error("private recipient or code");
    return options.sendResult ? options.sendResult() : options.receipt ?? { state: "accepted", providerMessageId: MESSAGE_ID };
  }, { configured: () => { if (options.unconfigured) throw new MemberError("SERVICE_NOT_CONFIGURED", 503); } });
  const defer = options.noBackground ? undefined : task => { if (options.deferError) throw new Error("private runtime details"); background.push(task); };
  const handler = createHandler({ rpc, sendRecovery, defer, authenticate: async () => { authenticated++; throw new Error("must not authenticate recovery"); }, rateFingerprint: async value => { fingerprints.push(value); return hashToken(value); }, clock: () => NOW });
  return { handler, calls, claims, fingerprints, background, complete: () => Promise.all(background), get sent() { return sent; }, get authenticated() { return authenticated; } };
}

test("recovery schema permits only a bounded bare address and UUID", () => {
  assert.deepEqual(normalizeRequest(payload({ email: " Person@Example.Invalid " })), payload());
  for (const address of ["bad", "a@b", "Name <a@example.invalid>", "a@example.invalid,b@example.invalid", "a@example.invalid; b@example.invalid", "a\r\n@example.invalid", "\n" + ADDRESS, "a".repeat(255) + "@example.invalid", null]) assert.throws(() => normalizeRequest(payload({ email: address })), { code: "INVALID_REQUEST" });
  for (const overrides of [{ request_id: "bad" }, { redirect_to: "https://other.invalid" }, { token: "123456" }, { password: "never-here" }, { user_id: ID }]) assert.throws(() => normalizeRequest(payload(overrides)), { code: "INVALID_REQUEST" });
  assert.throws(() => normalizeRequest({ ...payload(), extra: true }), { code: "INVALID_REQUEST" });
});

test("HLL receives only recovery and existing origin action permissions do not expand", async () => {
  for (const action of ["access_status", "access_request", "access_inspect", "access_confirm", "access_withdraw", "operator_access_queue", "operator_access_approve", "operator_invitation_send", "operator_invitation_status", "unknown"]) {
    const f = fixture();
    assert.equal((await f.handler(request({ action, payload: {} }))).status, 403);
    assert.equal(f.calls.length, 0); assert.equal(f.sent, 0); assert.equal(f.authenticated, 0);
  }
  for (const origin of [...ALLOWED_ORIGINS, "https://humanlibertyledger.org", "http://www.humanlibertyledger.org", RECOVERY_ORIGIN + ".evil.invalid", "null"]) {
    const f = fixture(); assert.equal((await f.handler(request(payload(), origin))).status, 403); assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  const preflight = await f.handler(new Request("https://service.example.invalid/member-access", { method: "OPTIONS", headers: { origin: RECOVERY_ORIGIN } }));
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("access-control-allow-origin"), RECOVERY_ORIGIN); assert.equal(f.calls.length, 0);
});

test("malformed or excessive requests fail before budgets or provider effects", async () => {
  const requests = [
    [request(payload({ token: "123456" })), 400],
    [request(payload(), RECOVERY_ORIGIN, { body: "{" }), 400],
    [request(payload(), RECOVERY_ORIGIN, { body: "x".repeat(MAX_BODY_BYTES + 1) }), 413],
    [request(payload(), RECOVERY_ORIGIN, { headers: { origin: RECOVERY_ORIGIN, "content-type": "text/plain" } }), 400],
    [new Request("https://service.example.invalid/member-access?token=x", { method: "POST", headers: { origin: RECOVERY_ORIGIN, "content-type": "application/json" }, body: JSON.stringify(payload()) }), 400],
  ];
  for (const [req, status] of requests) { const f = fixture(); assert.equal((await f.handler(req)).status, status); assert.equal(f.calls.length, 0); }
});

test("recovery consumes isolated bounded budgets and claims before issuing a code", async () => {
  const f = fixture();
  const result = await f.handler(request());
  await f.complete();
  assert.equal(result.status, 202); assert.deepEqual(await result.json(), GENERIC);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(f.authenticated, 0); assert.equal(f.sent, 1);
  assert.deepEqual(f.calls.slice(0, 3).map(x => x.params.p_limit), [3, 40, 50]);
  assert.deepEqual(f.fingerprints, [`auth-recovery-address|2026-11-05|${ADDRESS}`, "auth-recovery-network|2026-11-05|unknown", "auth-recovery-global|2026-11-05|all", `auth-recovery-recipient|${ADDRESS}`]);
  assert.equal(f.calls[3].name, "kapukai_auth_recovery_claim");
  assert.deepEqual(f.calls[4], { name: "kapukai_auth_recovery_mail_result", params: { p_request_id: ID, p_state: "accepted", p_provider_message_id: MESSAGE_ID } });
  const persisted = JSON.stringify(f.calls); assert.equal(persisted.includes(ADDRESS), false); assert.equal(persisted.includes("token"), false); assert.equal(persisted.includes("password"), false);
});

test("throttle has the identical public response and never claims or sends", async () => {
  const f = fixture({ rateResult: false });
  const result = await f.handler(request()); assert.equal(result.status, 202); assert.deepEqual(await result.json(), GENERIC);
  assert.equal(f.calls.length, 1); assert.equal(f.sent, 0);
});

test("configuration, malformed budgets and unavailable claim database fail before delivery", async () => {
  for (const options of [{ unconfigured: true }, { noBackground: true }, { rateResult: "true" }, { claimError: true }]) {
    const f = fixture(options), result = await f.handler(request());
    assert.equal(result.status, 503); assert.equal(f.sent, 0); assert.match((await result.json()).code, /^(SERVICE_NOT_CONFIGURED|TEMPORARILY_UNAVAILABLE)$/);
  }
});

test("simultaneous duplicate logical requests produce at most one provider handoff", async () => {
  const f = fixture();
  const replies = await Promise.all(Array.from({ length: 8 }, () => f.handler(request())));
  await f.complete();
  for (const result of replies) { assert.equal(result.status, 202); assert.deepEqual(await result.json(), GENERIC); }
  assert.equal(f.sent, 1); assert.equal(f.claims.size, 1);
  assert.equal(f.calls.filter(x => x.name === "kapukai_auth_recovery_mail_result").length, 1);
  assert.deepEqual(await (await f.handler(request(payload({ email: "other@example.invalid" })))).json(), GENERIC);
  assert.equal(f.sent, 1);
});

test("accepted, rejected, ambiguous and lost receipts never authorize replay", async () => {
  for (const options of [
    { receipt: { state: "failed", providerMessageId: null } },
    { receipt: { state: "unknown", providerMessageId: null } },
    { receipt: { state: "accepted", providerMessageId: "not-a-uuid", token: "synthetic-private-code" } },
    { sendError: true }, { receiptError: true },
  ]) {
    const f = fixture(options);
    for (let i = 0; i < 2; i++) {
      const result = await f.handler(request()); assert.equal(result.status, 202); assert.deepEqual(await result.json(), GENERIC);
    }
    await f.complete();
    assert.equal(f.sent, 1);
    assert.equal(f.calls.filter(x => x.name === "kapukai_auth_recovery_mail_result").length, 1);
    assert.equal(JSON.stringify(f.calls).includes("synthetic-private-code"), false);
  }
});

test("response completes without awaiting the deferred account lookup or provider outcome", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const f = fixture({ sendResult: () => pending });
  const result = await f.handler(request());
  assert.equal(result.status, 202); assert.deepEqual(await result.json(), GENERIC);
  assert.equal(f.background.length, 1); assert.equal(f.claims.get(ID).state, "pending");
  assert.equal(f.calls.some(x => x.name === "kapukai_auth_recovery_mail_result"), false);
  const repeated = await f.handler(request()); assert.deepEqual(await repeated.json(), GENERIC); assert.equal(f.sent, 1);
  finish({ state: "accepted", providerMessageId: MESSAGE_ID });
  await f.complete(); assert.equal(f.claims.get(ID).state, "accepted");
});

test("failed background registration has no send, neutral reply and no automatic replay", async () => {
  const f = fixture({ deferError: true });
  for (let i = 0; i < 2; i++) {
    const result = await f.handler(request()); assert.equal(result.status, 202); assert.deepEqual(await result.json(), GENERIC);
  }
  assert.equal(f.sent, 0); assert.equal(f.claims.get(ID).state, "pending");
  assert.equal(f.calls.some(x => x.name === "kapukai_auth_recovery_mail_result"), false);
});

function senderFixture(options = {}) {
  const calls = [];
  const sender = createRecoverySender({ baseUrl: PROJECT_URL, serviceKey: "sb_secret_fixture_only", providerToken: "postmark-fixture-only", from: "Kapukai <service@example.invalid>", fetchImpl: async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (calls.length === 1) return options.generatedResponse ?? json({ email_otp: "12345678", verification_type: "recovery", email: ADDRESS, action_link: "https://provider.invalid/private-token", ...options.generated });
    if (options.throwProvider) throw new Error("synthetic private provider details");
    return options.providerResponse ?? json({ ErrorCode: 0, MessageID: MESSAGE_ID, To: ADDRESS });
  } });
  return { sender, calls };
}

test("shared delivery generates only a recovery OTP and sends fixed private untracked email", async () => {
  const f = senderFixture();
  const receipt = await f.sender({ email: ADDRESS, password: "should-not-cross-boundary", redirect_to: "https://other.invalid" });
  assert.deepEqual(receipt, { state: "accepted", providerMessageId: MESSAGE_ID });
  assert.deepEqual(f.calls[0].body, { type: "recovery", email: ADDRESS });
  assert.equal(f.calls[0].url, `${PROJECT_URL}/auth/v1/admin/generate_link`);
  assert.equal(f.calls[1].url, "https://api.postmarkapp.com/email");
  for (const call of f.calls) { assert.equal(call.init.redirect, "error"); assert.equal(call.init.cache, "no-store"); assert.ok(call.init.signal instanceof AbortSignal); }
  const mail = f.calls[1].body;
  assert.equal(mail.To, ADDRESS); assert.equal(mail.Tag, "kapukai-auth-recovery"); assert.equal(mail.TrackLinks, "None"); assert.equal(mail.TrackOpens, false); assert.equal(mail.MessageStream, "outbound");
  assert.match(mail.TextBody, /12345678/); assert.match(mail.TextBody, /shared Kapukai account/);
  for (const secret of ["private-token", "should-not-cross-boundary", "other.invalid"]) assert.equal(JSON.stringify(mail).includes(secret), false);
  assert.equal(JSON.stringify(receipt).includes("12345678"), false);
});

test("absent accounts and invalid generated codes never reach Postmark", async () => {
  for (const options of [
    ...[400, 404, 422].map(status => ({ generatedResponse: json({ message: "private account status" }, status) })),
    { generated: { email_otp: "<img src=x>" } }, { generated: { verification_type: "signup" } }, { generated: { email: "other@example.invalid" } },
    { generated: { email: { value: ADDRESS } } }, { generatedResponse: new Response("not-json") },
    { generatedResponse: new Response("x".repeat(65537)) },
  ]) {
    const f = senderFixture(options), result = await f.sender({ email: ADDRESS });
    assert.ok(["failed", "unknown"].includes(result.state)); assert.equal(f.calls.length, 1); assert.equal(result.providerMessageId, null);
  }
});

test("provider uncertainty has one handoff and never becomes accepted without a bound receipt", async () => {
  for (const [options, expected] of [
    [{ throwProvider: true }, "unknown"],
    [{ providerResponse: json({ ErrorCode: 406 }, 422) }, "failed"],
    [{ providerResponse: json({ ErrorCode: 500 }, 500) }, "unknown"],
    [{ providerResponse: json({ ErrorCode: 0, MessageID: MESSAGE_ID, To: "other@example.invalid" }) }, "unknown"],
    [{ providerResponse: json({ ErrorCode: 0, MessageID: "invalid" }) }, "unknown"],
    [{ providerResponse: new Response("not-json") }, "unknown"],
    [{ providerResponse: new Response("x".repeat(65537)) }, "unknown"],
  ]) {
    const f = senderFixture(options); assert.deepEqual(await f.sender({ email: ADDRESS }), { state: expected, providerMessageId: null }); assert.equal(f.calls.length, 2);
  }
});

test("recovery extends the RPC transport only with two exact receipt functions", async () => {
  const calls = [];
  const rpc = createRpc({ baseUrl: PROJECT_URL, serviceKey: "sb_secret_fixture_only", fetchImpl: async url => { calls.push(url); return json({ result: "ok" }); } });
  for (const name of ["kapukai_auth_recovery_claim", "kapukai_auth_recovery_mail_result"]) await rpc(name, {});
  await assert.rejects(rpc("kapukai_auth_recovery_delete", {}), { code: "INVALID_REQUEST" });
  assert.equal(calls.length, 2);
});
