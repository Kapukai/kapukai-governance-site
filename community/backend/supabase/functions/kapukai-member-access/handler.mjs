import { MemberError, UUID_RE, boundedJson, serviceHeaders } from "../kapukai-members/auth.mjs";

export const CONSENT_VERSION = "kapukai-member-access-v1-2026-10-20";
export const MEMBER_PAGE = "https://kapukai-community.vercel.app/community/members/";
export const ALLOWED_ORIGINS = new Set(["https://kapukai.org", "https://www.kapukai.org", "https://kapukai-community.vercel.app"]);
export const MAX_BODY_BYTES = 4096;
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const GENERIC = Object.freeze({ ok: true, result: "request_received" });
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, expected) => isObject(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const uuid = value => typeof value === "string" && UUID_RE.test(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const bad = () => new MemberError("INVALID_REQUEST", 400);
// Postmark parses To as an address list. Accept one bare mailbox only so
// display names or separators cannot bypass per-address delivery limits.
const email = value => typeof value === "string" && value.length <= 254 && !/[\u0000-\u0020\u007f<>,;:"\\()\[\]]/.test(value) && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

export async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function randomToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function normalizeRequest(body, now = Date.now()) {
  if (!exactKeys(body, ["action", "payload"]) || typeof body.action !== "string" || !isObject(body.payload)) throw bad();
  const p = body.payload;
  if (body.action === "access_status" && exactKeys(p, [])) return { action: body.action, payload: {} };
  if (body.action === "access_request") {
    if (!exactKeys(p, ["email", "display_name", "request_id", "consent_version", "adult", "privacy_acknowledged", "human_review_acknowledged", "started_at", "website"]) || typeof p.website !== "string" || p.website.length > 200) throw bad();
    if (p.website.trim()) return { action: body.action, bot: true };
    const address = typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
    const name = typeof p.display_name === "string" ? p.display_name.trim() : "";
    if (!email(address) || !name || name.length > 60 || /[\u0000-\u001f\u007f<>]/.test(name) || !uuid(p.request_id) || p.consent_version !== CONSENT_VERSION || p.adult !== true || p.privacy_acknowledged !== true || p.human_review_acknowledged !== true || !Number.isFinite(p.started_at) || now - p.started_at < 1200 || now - p.started_at > 86400000) throw bad();
    return { action: body.action, payload: { email: address, display_name: name, request_id: p.request_id.toLowerCase(), consent_version: CONSENT_VERSION, adult: true, privacy_acknowledged: true, human_review_acknowledged: true } };
  }
  if (["access_inspect", "access_confirm", "access_withdraw"].includes(body.action)) {
    if (!exactKeys(p, ["token"]) || typeof p.token !== "string" || !TOKEN_RE.test(p.token)) throw bad();
    return { action: body.action, payload: { token: p.token } };
  }
  if (body.action === "operator_access_queue" && exactKeys(p, [])) return { action: body.action, payload: {} };
  if (["operator_access_approve", "operator_access_decline"].includes(body.action)) {
    const expected = body.action === "operator_access_approve" ? ["request_id", "expected_revision", "expires_days"] : ["request_id", "expected_revision"];
    if (!exactKeys(p, expected) || !uuid(p.request_id) || !integer(p.expected_revision, 0, 2147483647) || (body.action === "operator_access_approve" && !integer(p.expires_days, 1, 14))) throw bad();
    return { action: body.action, payload: { ...p, request_id: p.request_id.toLowerCase() } };
  }
  throw bad();
}

async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new MemberError("INVALID_BODY", 400);
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) { await request.body?.cancel(); throw new MemberError("BODY_TOO_LARGE", 413); }
  const reader = request.body?.getReader(); if (!reader) throw new MemberError("INVALID_BODY", 400);
  let length = 0; const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new MemberError("BODY_TOO_LARGE", 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) { if (error instanceof MemberError) throw error; throw new MemberError("INVALID_BODY", 400); }
  finally { reader.releaseLock(); }
}

function json(status, body, origin) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", Vary: "Origin" };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  if (status === 429) headers["Retry-After"] = "60";
  return new Response(JSON.stringify(body), { status, headers });
}
const RESULT_STATUS = Object.freeze({ invalid: 400, forbidden: 403, not_found: 404, conflict: 409, idempotency_conflict: 409, expired: 410, rate_limited: 429, paused: 503, capacity_full: 409 });
const ERROR_STATUS = Object.freeze({ INVALID_REQUEST: 400, INVALID_BODY: 400, BODY_TOO_LARGE: 413, AUTHENTICATION_REQUIRED: 401, AUTH_NOT_CONFIGURED: 503, SERVICE_NOT_CONFIGURED: 503, IDENTITY_UNAVAILABLE: 503, TEMPORARILY_UNAVAILABLE: 503 });
function failedResult(result, origin) {
  if (Object.hasOwn(RESULT_STATUS, result?.result || "")) return json(RESULT_STATUS[result.result], { ok: false, code: result.result.toUpperCase() }, origin);
  throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
}
function tokenProjection(result) {
  if (!["awaiting_email", "awaiting_review", "approved", "declined", "withdrawn"].includes(result.state) || !integer(result.revision, 0, 2147483647) || typeof result.can_confirm !== "boolean" || typeof result.can_withdraw !== "boolean" || result.consent_version !== CONSENT_VERSION) throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
  const fields = ["state", "revision", "can_confirm", "can_withdraw", "consent_version", "expires_at", "manage_expires_at", "claimed"];
  return { ok: true, result: "ok", ...Object.fromEntries(fields.filter(key => Object.hasOwn(result, key)).map(key => [key, result[key]])) };
}
function operatorProjection(action, result) {
  if (action === "operator_access_queue") {
    if (!Array.isArray(result.requests) || result.requests.length > 100) throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
    const fields = ["id", "email", "display_name", "state", "revision", "created_at", "confirmed_at", "updated_at", "expires_at", "manage_expires_at", "delivery_state", "decided_at"];
    return { ok: true, result: "ok", requests: result.requests.map(row => {
      if (!isObject(row) || !uuid(row.id)) throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
      return Object.fromEntries(fields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
    }) };
  }
  if (action === "operator_access_approve") {
    if (typeof result.invite_token !== "string" || !/^[0-9a-f]{64}$/.test(result.invite_token) || !uuid(result.invitation_id) || typeof result.expires_at !== "string" || !Number.isFinite(Date.parse(result.expires_at))) throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
    return { ok: true, result: "ok", invite_token: result.invite_token, invitation_id: result.invitation_id, expires_at: result.expires_at };
  }
  return { ok: true, result: "ok" };
}

const RPC_NAMES = new Set(["kapukai_claim_signup_attempt", "kapukai_member_access_is_open", "kapukai_member_access_request", "kapukai_member_access_token", "kapukai_member_access_mail_result", "kapukai_member_access_operator"]);
export function createRpc({ baseUrl, serviceKey, fetchImpl = fetch }) {
  return async (name, parameters) => {
    if (!RPC_NAMES.has(name)) throw bad();
    const headers = serviceHeaders({ baseUrl, serviceKey }); let response;
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(parameters), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
    } catch { throw new MemberError("TEMPORARILY_UNAVAILABLE", 503); }
    if (!response.ok) { await response.body?.cancel(); throw new MemberError("TEMPORARILY_UNAVAILABLE", 503); }
    return boundedJson(response, 524288, "TEMPORARILY_UNAVAILABLE");
  };
}
export function createRateFingerprint({ baseUrl, serviceKey }) {
  let key;
  return async value => {
    serviceHeaders({ baseUrl, serviceKey });
    key ||= crypto.subtle.importKey("raw", new TextEncoder().encode(serviceKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", await key, new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  };
}

export function confirmationMessage(token) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) throw bad();
  const url = `${MEMBER_PAGE}#access_token=${token}`;
  const subject = "Confirm your Kapukai member access request";
  const text = `You requested access to the Kapukai member community.\n\nReview and confirm your request:\n${url}\n\nOpening this link does not confirm anything. Choose Confirm request on the page to verify your email and request human review. Confirmation expires in 48 hours. The same private link lets you review or withdraw your request for 180 days.\n\nConfirmation does not create an account or grant community membership. Approval is separate and subject to capacity. This request does not subscribe you to newsletters or make your profile public.\n\nIf you did not request this, ignore this email. Do not share the private link or reply with case records, identification, or other sensitive documents.\n\nKapukai Governance Lab\narchitect@kapukai.org`;
  // The only dynamic HTML value is a fixed HTTPS URL plus validated random token.
  // Submitted names, addresses, and arbitrary request fields are never echoed.
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head><body style="margin:0;padding:24px;background:#f7f5ee;color:#10253a;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="max-width:600px;margin:auto;background:#fff;border:1px solid #dedbd0;width:100%"><tr><td style="padding:28px;background:#10253a;border-top:3px solid #bd8d38;color:#fff;letter-spacing:3px;font-weight:bold">KAPUKAI<br><span style="font-size:11px;letter-spacing:2px">GOVERNANCE LAB</span></td></tr><tr><td style="padding:32px;line-height:1.7"><h1 style="font:normal 30px Georgia,serif;margin:0 0 24px">Confirm your access request</h1><p>You requested access to the Kapukai member community.</p><p><a href="${url}" style="display:inline-block;padding:14px 20px;background:#0f675f;color:#fff;text-decoration:none;font-weight:bold">Review your request</a></p><p>Opening this link does not confirm anything. Choose <strong>Confirm request</strong> on the page to verify your email and request human review.</p><p>Confirmation expires in 48 hours. Keep this link private; it also lets you review or withdraw the request for 180 days.</p><p>Confirmation does not create an account or grant community membership. Approval is separate and subject to capacity. This does not subscribe you to newsletters or publish your profile.</p><p>If you did not request this, ignore this email. Do not reply with sensitive documents. For help: <a href="mailto:architect@kapukai.org" style="color:#0f675f">architect@kapukai.org</a>.</p></td></tr><tr><td style="padding:24px 32px;border-top:1px solid #dedbd0;font-size:13px">Kapukai Governance Lab · Truth as a public utility.</td></tr></table></body></html>`;
  return { subject, text, html };
}
export function createConfirmationSender({ providerToken, from, fetchImpl = fetch }) {
  const configured = () => {
    if (typeof providerToken !== "string" || !providerToken || typeof from !== "string" || !from || from.length > 320 || /[\r\n]/.test(from)) throw new MemberError("SERVICE_NOT_CONFIGURED", 503);
  };
  const send = async ({ email: address, accessRequestId, token }) => {
    configured();
    if (!email(address) || !uuid(accessRequestId)) throw bad();
    const message = confirmationMessage(token); let response;
    try {
      response = await fetchImpl("https://api.postmarkapp.com/email", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Postmark-Server-Token": providerToken },
        body: JSON.stringify({ From: from, To: address, ReplyTo: "architect@kapukai.org", Subject: message.subject, TextBody: message.text, HtmlBody: message.html, MessageStream: "outbound", Tag: "kapukai-member-access-confirmation", TrackOpens: false, TrackLinks: "None", Metadata: { access_request_id: accessRequestId, message_type: "member_access_confirmation" } }),
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
      });
    } catch { return { state: "unknown", providerMessageId: null }; }
    let receipt;
    try { receipt = await boundedJson(response, 65536, "TEMPORARILY_UNAVAILABLE"); }
    catch { return { state: "unknown", providerMessageId: null }; }
    if (response.ok && receipt?.ErrorCode === 0 && uuid(receipt.MessageID)) return { state: "accepted", providerMessageId: receipt.MessageID };
    return { state: typeof receipt?.ErrorCode === "number" && receipt.ErrorCode !== 0 ? "failed" : "unknown", providerMessageId: null };
  };
  return Object.assign(send, { configured });
}

export function createHandler({ authenticate, rpc, sendConfirmation, rateFingerprint, clock = () => Date.now(), newToken = randomToken }) {
  return async request => {
    const origin = request.headers.get("origin");
    if (!ALLOWED_ORIGINS.has(origin)) return json(403, { ok: false, code: "ORIGIN_DENIED" }, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, content-type, apikey", Vary: "Origin", "Cache-Control": "no-store" } });
    if (request.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, origin);
    if (new URL(request.url).search) return json(400, { ok: false, code: "INVALID_REQUEST" }, origin);
    try {
      const body = normalizeRequest(await readBody(request), clock());
      if (body.action === "access_status") {
        if (typeof sendConfirmation !== "function" || typeof sendConfirmation.configured !== "function") throw new MemberError("SERVICE_NOT_CONFIGURED", 503);
        sendConfirmation.configured();
        const enabled = await rpc("kapukai_member_access_is_open", {});
        if (typeof enabled !== "boolean") throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
        return json(200, { ok: true, result: "ok", enabled }, origin);
      }
      if (body.action === "access_request") {
        if (body.bot) return json(202, GENERIC, origin);
        if (typeof sendConfirmation !== "function" || typeof rateFingerprint !== "function") throw new MemberError("SERVICE_NOT_CONFIGURED", 503);
        sendConfirmation.configured?.();
        const open = await rpc("kapukai_member_access_is_open", {});
        if (open === false) return json(503, { ok: false, code: "PAUSED" }, origin);
        if (open !== true) throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
        const p = body.payload, day = new Date(clock()).toISOString().slice(0, 10);
        // Forwarded network identity is only supplemental; address and global
        // limits remain authoritative. Persist only daily keyed fingerprints.
        const network = (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown").slice(0, 200);
        for (const [scope, value, limit] of [["address", p.email, 3], ["network", network, 40], ["global", "all", 100]]) {
          const fingerprint = await rateFingerprint(`member-access-${scope}|${day}|${value}`);
          if (typeof fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(fingerprint)) throw new MemberError("SERVICE_NOT_CONFIGURED", 503);
          const allowed = await rpc("kapukai_claim_signup_attempt", { p_fingerprint: fingerprint, p_limit: limit });
          if (allowed === false) return json(202, GENERIC, origin);
          if (allowed !== true) throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
        }
        const token = newToken(); if (typeof token !== "string" || !TOKEN_RE.test(token)) throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
        const result = await rpc("kapukai_member_access_request", { p_email: p.email, p_display_name: p.display_name, p_request_id: p.request_id, p_token_hash: await hashToken(token), p_consent_version: p.consent_version, p_adult: true, p_privacy_acknowledged: true, p_human_review_acknowledged: true });
        if (result?.result === "created") {
          if (!uuid(result.access_request_id)) throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
          let receipt = { state: "unknown", providerMessageId: null };
          try {
            const sent = await sendConfirmation({ email: p.email, accessRequestId: result.access_request_id, token });
            if (["accepted", "failed", "unknown"].includes(sent?.state)) receipt = { state: sent.state === "accepted" && !uuid(sent.providerMessageId) ? "unknown" : sent.state, providerMessageId: uuid(sent.providerMessageId) ? sent.providerMessageId : null };
          } catch { /* An uncertain provider handoff is never retried. */ }
          try { await rpc("kapukai_member_access_mail_result", { p_access_request_id: result.access_request_id, p_state: receipt.state, p_provider_message_id: receipt.providerMessageId }); }
          catch { /* Pending receipt stays for reconciliation; never resend. */ }
        } else if (!["duplicate", "idempotency_conflict", "suppressed", "rate_limited"].includes(result?.result)) return failedResult(result, origin);
        return json(202, GENERIC, origin);
      }
      if (body.action.startsWith("access_")) {
        const result = await rpc("kapukai_member_access_token", { p_token_hash: await hashToken(body.payload.token), p_action: body.action.slice("access_".length) });
        return result?.result === "ok" ? json(200, tokenProjection(result), origin) : failedResult(result, origin);
      }
      const actor = await authenticate(request);
      if (!uuid(actor?.user_id) || !uuid(actor?.session_id)) throw new MemberError("AUTHENTICATION_REQUIRED", 401);
      const result = await rpc("kapukai_member_access_operator", { p_user_id: actor.user_id, p_session_id: actor.session_id, p_action: body.action.slice("operator_access_".length), p_payload: body.payload });
      return result?.result === "ok" ? json(200, operatorProjection(body.action, result), origin) : failedResult(result, origin);
    } catch (error) {
      const code = error instanceof MemberError && Object.hasOwn(ERROR_STATUS, error.code) ? error.code : "TEMPORARILY_UNAVAILABLE";
      return json(ERROR_STATUS[code], { ok: false, code }, origin);
    }
  };
}
