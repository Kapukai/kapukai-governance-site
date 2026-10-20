import { MemberError, publicAuthConfig, serviceHeaders, boundedJson, UUID_RE } from "./auth.mjs";

export const ALLOWED_ORIGINS = new Set(["https://kapukai.org", "https://www.kapukai.org", "https://kapukai-community.vercel.app"]);
export const MAX_BODY_BYTES = 16384;
export const SCOPES = Object.freeze(["tools", "timeline", "evidence_dossier", "affidavit_formatting", "training", "independent_review"]);
const ROOM_IDS = new Set(["commons", "tools", "review"]);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value, required, optional = []) => isObject(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const text = (value, min, max) => typeof value === "string" && value.trim().length >= min && value.length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
const uuid = value => typeof value === "string" && UUID_RE.test(value);
const boolean = value => typeof value === "boolean";
const scopes = value => Array.isArray(value) && value.length <= SCOPES.length && new Set(value).size === value.length && value.every(item => SCOPES.includes(item));
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const version = value => integer(value, 1, 2147483647);
const httpsUrl = value => {
  if (typeof value !== "string" || value.length > 500 || /\s/.test(value)) return false;
  try { const parsed = new URL(value); return parsed.protocol === "https:" && !parsed.username && !parsed.password && Boolean(parsed.hostname); }
  catch { return false; }
};
const isoTime = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const email = value => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
const oneId = field => value => keys(value, [field]) && uuid(value[field]);
const room = value => keys(value, ["room_id"]) && ROOM_IDS.has(value.room_id);
const empty = value => keys(value, []);

// Exact action/payload schemas prevent accidental broadening of privileged SQL.
// SQL independently revalidates the contract and every current access predicate.
const VALIDATORS = Object.freeze({
  config: empty, public: empty, state: empty, close: empty,
  export: p => keys(p, [], ["page"]) && (!Object.hasOwn(p, "page") || integer(p.page, 0, 100000)),
  signup: p => keys(p, ["email", "password", "invite_token", "adult", "privacy_acknowledged"]) && email(p.email) && typeof p.password === "string" && p.password.length >= 12 && p.password.length <= 128 && !p.password.includes("\u0000") && typeof p.invite_token === "string" && /^[0-9a-f]{64}$/.test(p.invite_token) && p.adult === true && p.privacy_acknowledged === true,
  join: p => keys(p, ["invite_token", "display_name", "adult", "privacy_acknowledged"]) && typeof p.invite_token === "string" && /^[0-9a-f]{64}$/.test(p.invite_token) && text(p.display_name, 1, 60) && p.adult === true && p.privacy_acknowledged === true,
  profile_save: p => keys(p, ["display_name", "bio", "interests", "discoverable", "reviewer_opt_in", "reviewer_scopes"]) && text(p.display_name, 1, 60) && text(p.bio, 0, 500) && scopes(p.interests) && boolean(p.discoverable) && boolean(p.reviewer_opt_in) && scopes(p.reviewer_scopes),
  room_join: room, room_leave: room, room_posts: room,
  post_create: p => keys(p, ["room_id", "body"]) && ROOM_IDS.has(p.room_id) && text(p.body, 1, 2000),
  post_delete: oneId("post_id"),
  post_report: p => keys(p, ["post_id", "reason"]) && uuid(p.post_id) && text(p.reason, 1, 300),
  member_block: p => keys(p, ["member_id", "blocked"]) && uuid(p.member_id) && boolean(p.blocked),
  introduction_request: oneId("member_id"),
  introduction_respond: p => keys(p, ["introduction_id", "accept"]) && uuid(p.introduction_id) && boolean(p.accept),
  request_create: p => keys(p, ["title", "summary", "scope"]) && text(p.title, 1, 100) && text(p.summary, 1, 600) && SCOPES.includes(p.scope),
  request_close: oneId("request_id"),
  assignment_propose: p => keys(p, ["request_id", "reviewer_id"]) && uuid(p.request_id) && uuid(p.reviewer_id),
  assignment_respond: p => keys(p, ["assignment_id", "accept", "conflict_free"]) && uuid(p.assignment_id) && boolean(p.accept) && boolean(p.conflict_free),
  assignment_cancel: oneId("assignment_id"),
  event_offer: p => keys(p, ["invitee_id", "title", "starts_at", "ends_at"]) && uuid(p.invitee_id) && text(p.title, 1, 100) && isoTime(p.starts_at) && isoTime(p.ends_at) && Date.parse(p.ends_at) > Date.parse(p.starts_at) && Date.parse(p.ends_at) - Date.parse(p.starts_at) <= 14400000,
  event_respond: p => keys(p, ["event_id", "accept"]) && uuid(p.event_id) && boolean(p.accept),
  event_cancel: oneId("event_id"),
  feedback_save: p => keys(p, ["body"], ["feedback_id"]) && (!Object.hasOwn(p, "feedback_id") || uuid(p.feedback_id)) && text(p.body, 1, 2000),
  feedback_consent: p => keys(p, ["feedback_id", "version", "consent"]) && uuid(p.feedback_id) && version(p.version) && boolean(p.consent),
  feedback_withdraw: oneId("feedback_id"),
  credential_submit: p => keys(p, ["title", "issuer", "source_url"]) && text(p.title, 1, 100) && text(p.issuer, 1, 120) && httpsUrl(p.source_url),
  credential_consent: p => keys(p, ["credential_id", "consent"]) && uuid(p.credential_id) && boolean(p.consent),
  operator_config: p => keys(p, ["enabled", "max_members"]) && boolean(p.enabled) && integer(p.max_members, 1, 30),
  operator_invite: p => keys(p, ["email", "expires_days"]) && email(p.email) && integer(p.expires_days, 1, 14),
  operator_invite_revoke: oneId("invitation_id"),
  operator_post_moderate: p => keys(p, ["post_id", "hide", "reason"]) && uuid(p.post_id) && boolean(p.hide) && ["privacy", "conduct", "off_topic", "restored"].includes(p.reason),
  operator_member_suspend: p => keys(p, ["member_id", "suspended"]) && uuid(p.member_id) && boolean(p.suspended),
  operator_feedback_propose: p => keys(p, ["feedback_id", "excerpt"]) && uuid(p.feedback_id) && text(p.excerpt, 1, 600),
  operator_feedback_publish: p => keys(p, ["feedback_id", "version"]) && uuid(p.feedback_id) && version(p.version),
  operator_credential_review: p => keys(p, ["credential_id", "verified", "scopes", "source_url"]) && uuid(p.credential_id) && boolean(p.verified) && scopes(p.scopes) && httpsUrl(p.source_url),
});
export const ACTIONS = Object.freeze(Object.keys(VALIDATORS));

export function normalizeRequest(body) {
  if (!keys(body, ["action"], ["payload"]) || typeof body.action !== "string" || !Object.hasOwn(VALIDATORS, body.action)) throw new MemberError("INVALID_REQUEST", 400);
  const payload = Object.hasOwn(body, "payload") ? body.payload : {};
  if (!VALIDATORS[body.action](payload)) throw new MemberError("INVALID_REQUEST", 400);
  return { action: body.action, payload: { ...payload } };
}

function json(status, body, origin) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", Vary: "Origin" };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  if (status === 429) headers["Retry-After"] = "60";
  return new Response(JSON.stringify(body), { status, headers });
}

async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new MemberError("INVALID_BODY", 400);
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) { await request.body?.cancel(); throw new MemberError("BODY_TOO_LARGE", 413); }
  const reader = request.body?.getReader(); if (!reader) throw new MemberError("INVALID_BODY", 400);
  let length = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
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

const RESULT_STATUS = Object.freeze({ forbidden: 403, paused: 503, invalid: 400, conflict: 409, not_found: 404, capacity_full: 409, rate_limited: 429, expired: 410, stale_revision: 409, transition_denied: 409 });
const ERROR_STATUS = Object.freeze({ AUTHENTICATION_REQUIRED: 401, AUTH_NOT_CONFIGURED: 503, SERVICE_NOT_CONFIGURED: 503, IDENTITY_UNAVAILABLE: 503, INVALID_REQUEST: 400, INVALID_BODY: 400, BODY_TOO_LARGE: 413, TEMPORARILY_UNAVAILABLE: 503 });

// Public data has a second projection at the Edge boundary. Future private SQL
// fields cannot accidentally appear in the public feed through object spreading.
function publicProjection(result) {
  if (!Array.isArray(result.feedback) || !Array.isArray(result.credentials) || result.feedback.length > 100 || result.credentials.length > 100) throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
  const project = (rows, fields) => rows.map(row => {
    if (!isObject(row)) throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
    return Object.fromEntries(fields.filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]]));
  });
  return { result: "ok", feedback: project(result.feedback, ["id", "excerpt", "version", "published_at", "display_name"]), credentials: project(result.credentials, ["id", "title", "issuer", "source_url", "scopes", "verified_at", "display_name"]) };
}

export function createRpc({ baseUrl, serviceKey, fetchImpl = fetch }) {
  return async function rpc(name, parameters) {
    if (!["kapukai_member_command", "kapukai_member_public", "kapukai_member_signup_check"].includes(name)) throw new MemberError("INVALID_REQUEST", 400);
    const headers = serviceHeaders({ baseUrl, serviceKey }); let response;
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(parameters), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
    } catch { throw new MemberError("TEMPORARILY_UNAVAILABLE", 503); }
    if (!response.ok) { await response.body?.cancel(); throw new MemberError("TEMPORARILY_UNAVAILABLE", 503); }
    return boundedJson(response, 1048576, "TEMPORARILY_UNAVAILABLE");
  };
}

export function createSignupSender({ baseUrl, serviceKey, providerToken, from, fetchImpl = fetch }) {
  const configured = () => {
    if (typeof providerToken !== "string" || !providerToken || typeof from !== "string" || !from || from.length > 320 || /[\r\n]/.test(from)) throw new MemberError("SERVICE_NOT_CONFIGURED", 503);
    return serviceHeaders({ baseUrl, serviceKey });
  };
  const send = async ({ email: address, password }) => {
    const headers = configured(); let response;
    try {
      response = await fetchImpl(`${baseUrl}/auth/v1/admin/generate_link`, {
        method: "POST", headers, body: JSON.stringify({ type: "signup", email: address, password }),
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
      });
    } catch { throw new MemberError("TEMPORARILY_UNAVAILABLE", 503); }
    if (!response.ok) {
      await response.body?.cancel();
      // Existing account and invalid provider input must not expose registration.
      if ([400, 422].includes(response.status)) return { state: "not_created" };
      throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
    }
    const generated = await boundedJson(response, 65536, "TEMPORARILY_UNAVAILABLE");
    const code = generated?.email_otp;
    if (typeof code !== "string" || !/^\d{6,10}$/.test(code) || generated.verification_type !== "signup" || (generated.email && generated.email.toLowerCase() !== address.toLowerCase())) throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
    const subject = "Verify your Kapukai member account";
    const textBody = `Your Kapukai member account verification code is:\n\n${code}\n\nReturn to the Kapukai member page where you requested this code and enter it there. Do not share this code or your invitation. Verification confirms your email; community access still requires your valid invitation.\n\nIf you did not request this, you can ignore this email. For help, contact architect@kapukai.org.\n\nKapukai Governance Lab\nTruth as a public utility.`;
    // The only dynamic HTML value is a validated numeric code. No remote images,
    // hidden tracking, action link, invitation token, or password enters the email.
    const htmlBody = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head><body style="margin:0;padding:24px;background:#f7f5ee;color:#10253a;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="max-width:600px;margin:auto;background:#fff;border:1px solid #dedbd0;width:100%"><tr><td style="padding:28px;background:#10253a;border-top:3px solid #bd8d38;color:#fff;letter-spacing:3px;font-weight:bold">KAPUKAI<br><span style="font-size:11px;letter-spacing:2px">GOVERNANCE LAB</span></td></tr><tr><td style="padding:32px"><h1 style="font:normal 30px Georgia,serif;margin:0 0 24px">Verify your member account</h1><p style="line-height:1.6">Enter this code on the Kapukai member page where you requested it.</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#0f675f">${code}</p><p style="line-height:1.6">Keep this code and your invitation private. Verification confirms your email; community access still requires your valid invitation.</p><p style="line-height:1.6">If you did not request this, you can ignore this email. For help, contact <a href="mailto:architect@kapukai.org" style="color:#0f675f">architect@kapukai.org</a>.</p></td></tr><tr><td style="padding:24px 32px;border-top:1px solid #dedbd0;font-size:13px;line-height:1.6">Kapukai Governance Lab<br>Truth as a public utility.</td></tr></table></body></html>`;
    try {
      response = await fetchImpl("https://api.postmarkapp.com/email", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Postmark-Server-Token": providerToken },
        body: JSON.stringify({ From: from, To: address, ReplyTo: "architect@kapukai.org", Subject: subject, TextBody: textBody, HtmlBody: htmlBody, MessageStream: "outbound", Tag: "kapukai-member-verification", TrackOpens: false, TrackLinks: "None" }),
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
      });
    } catch { throw new MemberError("TEMPORARILY_UNAVAILABLE", 503); }
    const receipt = await boundedJson(response, 65536, "TEMPORARILY_UNAVAILABLE");
    if (!response.ok || receipt?.ErrorCode !== 0 || !uuid(receipt.MessageID)) throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
    return { state: "accepted" };
  };
  return Object.assign(send, { configured });
}

export function createHandler({ authenticate, rpc, getConfig, sendSignup }) {
  return async function handler(request) {
    const origin = request.headers.get("origin");
    if (!ALLOWED_ORIGINS.has(origin)) return json(403, { ok: false, code: "ORIGIN_DENIED" }, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, content-type, apikey", Vary: "Origin", "Cache-Control": "no-store" } });
    if (request.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, origin);
    if (new URL(request.url).search) return json(400, { ok: false, code: "INVALID_REQUEST" }, origin);
    try {
      const body = normalizeRequest(await readBody(request));
      if (body.action === "config") return json(200, { ok: true, ...publicAuthConfig(await getConfig()) }, origin);
      if (body.action === "signup") {
        if (typeof sendSignup !== "function") throw new MemberError("SERVICE_NOT_CONFIGURED", 503);
        sendSignup.configured?.();
        const address = body.payload.email.toLowerCase();
        // Password remains in memory and goes only to Supabase Auth. Invitation
        // checking and its durable per-address send limit see no password.
        const checked = await rpc("kapukai_member_signup_check", { p_email: address, p_invite_token: body.payload.invite_token });
        if (checked?.result === "ok") await sendSignup({ email: address, password: body.payload.password });
        else if (!["forbidden", "invalid", "not_found", "expired", "paused", "capacity_full", "rate_limited"].includes(checked?.result)) throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
        // Enumeration-safe response: the UI explains that only eligible requests
        // receive a code. No automatic retry after an uncertain provider handoff.
        return json(200, { ok: true, result: "verification_sent" }, origin);
      }
      let result;
      if (body.action === "public") result = await rpc("kapukai_member_public", {});
      else {
        const actor = await authenticate(request);
        if (!uuid(actor?.user_id) || !uuid(actor?.session_id)) throw new MemberError("AUTHENTICATION_REQUIRED", 401);
        // Client-supplied identity fields were rejected; authority is server-derived.
        result = await rpc("kapukai_member_command", { p_user_id: actor.user_id, p_session_id: actor.session_id, p_action: body.action, p_payload: body.payload });
      }
      if (result?.result === "ok") return json(200, { ...(body.action === "public" ? publicProjection(result) : result), ok: true }, origin);
      const status = RESULT_STATUS[result?.result];
      if (status) return json(status, { ok: false, code: result.result.toUpperCase() }, origin);
      throw new MemberError("TEMPORARILY_UNAVAILABLE", 503);
    } catch (error) {
      const code = error instanceof MemberError && Object.hasOwn(ERROR_STATUS, error.code) ? error.code : "TEMPORARILY_UNAVAILABLE";
      return json(ERROR_STATUS[code], { ok: false, code }, origin);
    }
  };
}
