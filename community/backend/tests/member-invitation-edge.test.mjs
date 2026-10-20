import test from "node:test";
import assert from "node:assert/strict";
import { MemberError, PROJECT_URL } from "../supabase/functions/kapukai-members/auth.mjs";
import { createHandler, createRpc, createInvitationSender, invitationMessage, normalizeRequest, MEMBER_PAGE } from "../supabase/functions/kapukai-member-access/handler.mjs";

const ORIGIN = "https://kapukai-community.vercel.app";
const USER = "b8bbc25e-c196-4cbb-8eb9-ff38863df2d8";
const SESSION = "b9ef7317-7514-4aac-8221-9a19f42c34b6";
const INVITATION = "6d949fad-ef81-4d98-b4ad-957a3bc36635";
const DELIVERY = "cecc4285-7633-4f24-bd78-b402a740a399";
const RECEIPT = "c46ef1e0-836c-4e8c-b6a2-b8c9c40ecc54";
const TOKEN = "a".repeat(64);
const EMAIL = "invited@example.invalid";
const EXPIRY = "2026-10-27T12:00:00Z";
const actor = { user_id: USER, session_id: SESSION };
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const body = (action = "operator_invitation_send", payload = {}) => ({ action, payload: { email: EMAIL, invite_token: TOKEN, ...(action === "operator_invitation_send" ? { delivery_id: DELIVERY } : {}), ...payload } });
const request = (input = body()) => new Request(`${PROJECT_URL}/functions/v1/kapukai-member-access`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(input) });
const prepared = (extra = {}) => ({ result: "ok", should_send: true, delivery_id: DELIVERY, invitation_id: INVITATION, expires_at: EXPIRY, state: "pending", recipient: EMAIL, ...extra });
const projection = state => ({ ok: true, result: "ok", delivery_state: state, invitation_id: INVITATION, expires_at: EXPIRY });
const sendInput = { email: EMAIL, invitationId: INVITATION, deliveryId: DELIVERY, token: TOKEN, expiresAt: EXPIRY };
function fixture({ rpc, authenticate = async () => actor, sendInvitation, configured = () => {}, ...options } = {}) {
  const calls = [], mails = [], events = [];
  const send = Object.assign(async value => { events.push("send"); mails.push(value); return sendInvitation ? sendInvitation(value) : { state: "accepted", providerMessageId: RECEIPT }; }, { configured: () => { events.push("configured"); return configured(); } });
  const handler = createHandler({
    authenticate: async req => { events.push("authenticate"); return authenticate(req); },
    rpc: async (name, args) => { events.push(name); calls.push({ name, args }); return rpc ? rpc(name, args) : name === "kapukai_member_invitation_delivery" ? prepared() : { result: "ok", state: args.p_state }; },
    sendInvitation: send, ...options,
  });
  return { handler, calls, mails, events };
}

test("invitation actions require exact fields, one bare recipient, a 64-hex token and delivery UUID", () => {
  assert.deepEqual(normalizeRequest(body("operator_invitation_send", { email: "  Invited@Example.invalid ", delivery_id: DELIVERY.toUpperCase() })), body());
  assert.deepEqual(normalizeRequest(body("operator_invitation_status")), body("operator_invitation_status"));
  for (const extra of [{ user_id: USER }, { from: EMAIL }, { subject: "custom" }, { invite_token: "a".repeat(43) }, { invite_token: "A".repeat(64) }, { invite_token: "<script>" }, { delivery_id: "not-uuid" }]) assert.throws(() => normalizeRequest(body("operator_invitation_send", extra)), error => error.code === "INVALID_REQUEST");
  for (const email of ["Name <invited@example.invalid>", "a@example.invalid,b@example.invalid", "a@example.invalid;b@example.invalid", "a\nb@example.invalid", "a\r\nb@example.invalid", '"a"@example.invalid', "a(comment)@example.invalid", "a\\b@example.invalid", "a@[example.invalid]", "a:b@example.invalid", "a\u007f@example.invalid"]) assert.throws(() => normalizeRequest(body("operator_invitation_send", { email })));
  for (const input of [{ ...body(), user_id: USER }, body("operator_invitation_status", { delivery_id: DELIVERY }), { action: "operator_invitation_send", payload: { email: EMAIL, invite_token: TOKEN } }]) assert.throws(() => normalizeRequest(input));
});

test("unauthenticated and forged identities cannot claim or send invitations", async () => {
  for (const authenticate of [async () => { throw new MemberError("AUTHENTICATION_REQUIRED", 401); }, async () => ({ user_id: "forged", session_id: SESSION }), async () => ({ user_id: USER, session_id: null })]) {
    for (const action of ["operator_invitation_send", "operator_invitation_status"]) {
      const f = fixture({ authenticate }); const res = await f.handler(request(body(action)));
      assert.equal(res.status, 401); assert.deepEqual(await res.json(), { ok: false, code: "AUTHENTICATION_REQUIRED" }); assert.equal(f.calls.length, 0); assert.equal(f.mails.length, 0);
    }
  }
});

test("mail configuration is checked after authentication and before claiming; status stays readable", async () => {
  const f = fixture({ configured: () => { throw new MemberError("SERVICE_NOT_CONFIGURED", 503); } });
  assert.equal((await f.handler(request())).status, 503); assert.deepEqual(f.events, ["authenticate", "configured"]); assert.equal(f.calls.length, 0);
  const status = fixture({ sendInvitation: async () => assert.fail("no send"), configured: () => assert.fail("status does not configure mail"), rpc: async () => prepared({ state: "none", should_send: false, delivery_id: null }) });
  const res = await status.handler(request(body("operator_invitation_status")));
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), projection("none")); assert.equal(status.mails.length, 0);
  assert.deepEqual(status.calls[0].args, { p_user_id: USER, p_session_id: SESSION, p_action: "status", p_payload: { email: EMAIL, invite_token: TOKEN } });
});

test("a verified operator claims before a single bound-recipient handoff and records the receipt", async () => {
  const f = fixture(); const res = await f.handler(request());
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), projection("accepted"));
  assert.deepEqual(f.events, ["authenticate", "configured", "kapukai_member_invitation_delivery", "send", "kapukai_member_invitation_mail_result"]);
  assert.deepEqual(f.calls[0], { name: "kapukai_member_invitation_delivery", args: { p_user_id: USER, p_session_id: SESSION, p_action: "prepare", p_payload: body().payload } });
  assert.deepEqual(f.mails, [sendInput]);
  assert.deepEqual(f.calls[1], { name: "kapukai_member_invitation_mail_result", args: { p_delivery_id: DELIVERY, p_state: "accepted", p_provider_message_id: RECEIPT } });
  for (const header of ["cache-control", "referrer-policy"]) assert.equal(res.headers.get(header), header === "cache-control" ? "no-store" : "no-referrer");
});

test("operator denial, inactive invitation, pause, conflict and rate limits are bounded and never send", async () => {
  for (const [result, status] of [["invalid", 400], ["forbidden", 403], ["not_found", 404], ["expired", 410], ["paused", 503], ["conflict", 409], ["idempotency_conflict", 409], ["rate_limited", 429], ["private unexpected result", 503]]) {
    const f = fixture({ rpc: async () => ({ result, email: EMAIL, invite_token: TOKEN, detail: "private" }) }); const res = await f.handler(request());
    assert.equal(res.status, status); assert.deepEqual(await res.json(), { ok: false, code: result === "private unexpected result" ? "TEMPORARILY_UNAVAILABLE" : result.toUpperCase() }); assert.equal(f.mails.length, 0); assert.equal(f.calls.length, 1);
  }
});

test("mismatched recipient and malformed database claims cannot reach the provider", async () => {
  for (const extra of [{ recipient: "other@example.invalid" }, { recipient: "a@example.invalid,b@example.invalid" }, { recipient: EMAIL.toUpperCase() }, { invitation_id: "forged" }, { delivery_id: INVITATION }, { expires_at: "<script>" }, { state: "accepted" }, { should_send: 1 }, { state: "none", delivery_id: null }]) {
    const f = fixture({ rpc: async () => prepared(extra) }); const res = await f.handler(request());
    assert.equal(res.status, 503); assert.deepEqual(await res.json(), { ok: false, code: "TEMPORARILY_UNAVAILABLE" }); assert.equal(f.mails.length, 0); assert.equal(f.calls.length, 1);
  }
});

test("replayed and status-only claims project safe states without sending or rewriting receipts", async () => {
  for (const state of ["pending", "accepted", "failed", "unknown"]) {
    for (const action of ["operator_invitation_send", "operator_invitation_status"]) {
      const f = fixture({ rpc: async () => prepared({ state, should_send: false, invite_token: TOKEN, provider_message_id: RECEIPT, email: EMAIL }) }); const res = await f.handler(request(body(action)));
      assert.equal(res.status, 200); assert.deepEqual(await res.json(), projection(state)); assert.equal(f.mails.length, 0); assert.equal(f.calls.length, 1);
    }
  }
  const malformedStatus = fixture(); assert.equal((await malformedStatus.handler(request(body("operator_invitation_status")))).status, 503); assert.equal(malformedStatus.mails.length, 0);
});

test("ambiguous or malformed sender outcomes are recorded unknown and never retried", async () => {
  for (const sendInvitation of [async () => { throw new Error(`${EMAIL} ${TOKEN}`); }, async () => ({ state: "accepted", providerMessageId: "invalid" }), async () => ({ state: "private" }), async () => undefined]) {
    const f = fixture({ sendInvitation }); const res = await f.handler(request());
    assert.equal(res.status, 200); assert.deepEqual(await res.json(), projection("unknown")); assert.equal(f.mails.length, 1);
    assert.deepEqual(f.calls.at(-1).args, { p_delivery_id: DELIVERY, p_state: "unknown", p_provider_message_id: null });
  }
});

test("failed receipt writes remain unknown even after acceptance or explicit rejection", async () => {
  for (const state of ["accepted", "failed"]) {
    for (const completion of [async () => { throw new Error("private database details"); }, async () => ({ result: "ok", state: "pending" }), async () => ({ result: "forbidden" }), async () => null]) {
      const f = fixture({ sendInvitation: async () => ({ state, providerMessageId: RECEIPT }), rpc: async name => name === "kapukai_member_invitation_delivery" ? prepared() : completion() }); const res = await f.handler(request());
      assert.equal(res.status, 200); assert.deepEqual(await res.json(), projection("unknown")); assert.equal(f.mails.length, 1); assert.equal(f.calls.length, 2);
      assert.equal(f.calls[1].args.p_provider_message_id, state === "accepted" ? RECEIPT : null);
    }
  }
  const rejected = fixture({ sendInvitation: async () => ({ state: "failed", providerMessageId: null }) });
  assert.deepEqual(await (await rejected.handler(request())).json(), projection("failed")); assert.equal(rejected.mails.length, 1);
});

test("invitation template uses the fixed private fragment and explains separate account and membership steps", () => {
  const msg = invitationMessage(TOKEN, EXPIRY);
  assert.equal(msg.subject, "Your Kapukai member invitation"); assert.ok(msg.text.includes(`${MEMBER_PAGE}#invite=${TOKEN}`)); assert.ok(msg.html.includes(`href="${MEMBER_PAGE}#invite=${TOKEN}"`));
  for (const value of ["You have been invited to the Kapukai member community.", "Set up your member account", "using the email address that received this invitation", "separate email verification code", "Opening this link does not create an account or accept membership", "does not subscribe you to newsletters, make your profile discoverable, or publish anything", new Date(EXPIRY).toISOString()]) { assert.ok(msg.text.includes(value)); assert.ok(msg.html.includes(value)); }
  assert.equal(msg.html.includes("<img"), false); assert.equal(msg.html.includes("?invite="), false); assert.equal(msg.text.includes(EMAIL), false);
  for (const [token, expiry] of [["<script>", EXPIRY], [TOKEN, "<img src=x>"]]) assert.throws(() => invitationMessage(token, expiry));
});

test("Postmark handoff pins endpoint, recipient, subject and privacy-safe metadata with tracking off", async () => {
  const calls = [];
  const send = createInvitationSender({ providerToken: "fixture-provider", from: "Kapukai <noreply@example.invalid>", fetchImpl: async (...args) => { calls.push(args); return response({ ErrorCode: 0, MessageID: RECEIPT, To: EMAIL }); } });
  assert.equal(send.configured(), undefined); assert.deepEqual(await send(sendInput), { state: "accepted", providerMessageId: RECEIPT }); assert.equal(calls.length, 1);
  const [url, options] = calls[0], message = JSON.parse(options.body);
  assert.equal(url, "https://api.postmarkapp.com/email"); assert.equal(options.method, "POST"); assert.equal(options.headers["X-Postmark-Server-Token"], "fixture-provider"); assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store"); assert.ok(options.signal instanceof AbortSignal);
  assert.equal(message.To, EMAIL); assert.equal(message.Cc, undefined); assert.equal(message.Bcc, undefined); assert.equal(message.ReplyTo, "architect@kapukai.org"); assert.equal(message.Subject, invitationMessage(TOKEN, EXPIRY).subject); assert.equal(message.Tag, "kapukai-member-invitation"); assert.equal(message.MessageStream, "outbound"); assert.equal(message.TrackOpens, false); assert.equal(message.TrackLinks, "None");
  assert.deepEqual(message.Metadata, { invitation_id: INVITATION, delivery_id: DELIVERY, message_type: "member_invitation" }); assert.equal(JSON.stringify(message.Metadata).includes(TOKEN), false); assert.equal(JSON.stringify(message.Metadata).includes(EMAIL), false);
  for (const extra of [{ email: `Name <${EMAIL}>` }, { email: `${EMAIL},other@example.invalid` }, { invitationId: "forged" }, { deliveryId: "forged" }, { token: "bad" }, { expiresAt: "bad" }]) await assert.rejects(send({ ...sendInput, ...extra }), error => error.code === "INVALID_REQUEST");
  assert.equal(calls.length, 1);
});

test("provider rejection is distinct from timeouts, 5xx, malformed and mismatched acceptance", async () => {
  const cases = [
    [async () => response({ ErrorCode: 0, MessageID: RECEIPT }), "accepted"],
    [async () => response({ ErrorCode: 300, Message: `${TOKEN} ${EMAIL}` }, 422), "failed"],
    [async () => response({ ErrorCode: 429 }, 429), "failed"],
    [async () => response({ ErrorCode: 500 }, 500), "unknown"],
    [async () => { throw new DOMException("Timed out", "TimeoutError"); }, "unknown"],
    [async () => new Response("not JSON", { status: 200 }), "unknown"],
    [async () => response({ ErrorCode: 0, MessageID: "not-uuid" }), "unknown"],
    [async () => response({ ErrorCode: 0, MessageID: RECEIPT, To: "other@example.invalid" }), "unknown"],
    [async () => response({ ErrorCode: 0, MessageID: RECEIPT }, 202), "unknown"],
    [async () => response({ ErrorCode: 300 }), "unknown"],
    [async () => response({ ErrorCode: 0, MessageID: RECEIPT }, 422), "unknown"],
    [async () => new Response("x".repeat(65537)), "unknown"],
  ];
  for (const [fetchImpl, state] of cases) {
    let calls = 0; const send = createInvitationSender({ providerToken: "fixture-provider", from: "noreply@example.invalid", fetchImpl: async (...args) => { calls++; return fetchImpl(...args); } });
    assert.deepEqual(await send(sendInput), { state, providerMessageId: state === "accepted" ? RECEIPT : null }); assert.equal(calls, 1);
  }
  assert.throws(() => createInvitationSender({ providerToken: "", from: "" }).configured(), error => error.code === "SERVICE_NOT_CONFIGURED");
});

test("only the two specific invitation RPCs extend the existing service transport allowlist", async () => {
  const calls = []; const rpc = createRpc({ baseUrl: PROJECT_URL, serviceKey: "sb_secret_fixture_only", fetchImpl: async (...args) => { calls.push(args); return response({ result: "ok" }); } });
  for (const name of ["kapukai_member_invitation_delivery", "kapukai_member_invitation_mail_result"]) {
    assert.deepEqual(await rpc(name, {}), { result: "ok" }); assert.equal(calls.at(-1)[0], `${PROJECT_URL}/rest/v1/rpc/${name}`); assert.equal(calls.at(-1)[1].headers.apikey, "sb_secret_fixture_only");
  }
  for (const name of ["kapukai_member_command", "kapukai_member_invitation_send", "kapukai_member_invitation_delivery?private=1"]) await assert.rejects(rpc(name, {}), error => error.code === "INVALID_REQUEST");
  assert.equal(calls.length, 2);
});
