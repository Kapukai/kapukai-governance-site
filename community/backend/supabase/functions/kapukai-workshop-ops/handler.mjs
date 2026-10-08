import { OpsError, publicAuthConfig, UUID_RE } from "./auth.mjs";

export const ALLOWED_ORIGINS = new Set(["https://kapukai.org", "https://www.kapukai.org", "https://kapukai-community.vercel.app"]);
export const NOTICE_VERSION = "kapukai-application-update-v1-2026-10-08";
export const NOTICE_MESSAGE = Object.freeze({
  subject: "An update to your Kapukai application",
  text: "There is an update to your private Kapukai application.\n\nOpen the original email titled \"Confirm your Kapukai application request\" and use its private application link to review the current status and available next steps. Keep that link private.\n\nThis notification does not grant assistance, a role, account access or a professional credential. You can withdraw through the same private application link.\n\nIf you cannot find the original email, contact architect@kapukai.org without sending case records, financial records, identification or other sensitive documents.\n\nKapukai Governance Lab\narchitect@kapukai.org",
});
const RESOURCES = new Set(["practice", "tester_guide", "learning", "reviewer_orientation"]);
const REASONS = new Set(["capacity", "scope", "no_response", "completed", "applicant_request"]);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const bad = () => new OpsError("INVALID_REQUEST", 400);

export function normalizeRequest(body) {
  if (!isObject(body)) throw bad();
  if (body.action === "config" && exactKeys(body, ["action"])) return { action: "config" };
  if (body.action === "queue" && Object.keys(body).every(key => ["action", "limit", "offset", "view"].includes(key))) {
    const limit = body.limit ?? 30, offset = body.offset ?? 0, view = body.view ?? "active";
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0 || offset > 10000 || !["active", "archived", "all"].includes(view)) throw bad();
    return { action: "queue", limit, offset, view };
  }
  if (body.action === "send_notice") {
    if (!exactKeys(body, ["action", "application_id", "expected_revision", "request_id", "template_version"]) || !UUID_RE.test(body.application_id || "") || !UUID_RE.test(body.request_id || "") || !Number.isSafeInteger(body.expected_revision) || body.expected_revision < 0 || body.expected_revision > 2147483647 || body.template_version !== NOTICE_VERSION) throw bad();
    return { action: "send_notice", application_id: body.application_id.toLowerCase(), expected_revision: body.expected_revision, request_id: body.request_id.toLowerCase(), template_version: NOTICE_VERSION };
  }
  if (!exactKeys(body, ["action", "application_id", "command", "expected_revision", "request_id", "payload"]) || body.action !== "command" || !UUID_RE.test(body.application_id || "") || !UUID_RE.test(body.request_id || "") || !Number.isSafeInteger(body.expected_revision) || body.expected_revision < 0 || body.expected_revision > 2147483647) throw bad();
  const payload = body.payload; let valid = false;
  if (["review", "start"].includes(body.command)) valid = exactKeys(payload, []);
  else if (body.command === "clarify") valid = exactKeys(payload, ["field"]) && ["service_interest", "availability"].includes(payload.field);
  else if (["waitlist", "decline", "close"].includes(body.command)) valid = exactKeys(payload, ["reason"]) && REASONS.has(payload.reason);
  else if (body.command === "pause") valid = exactKeys(payload, ["reason"]) && ["capacity", "scope"].includes(payload.reason);
  else if (["deliver", "resolve_correction"].includes(body.command)) valid = exactKeys(payload, ["resource_id"]) && RESOURCES.has(payload.resource_id);
  else if (body.command === "offer") valid = exactKeys(payload, ["resource_id", "expires_days", "minutes"]) && RESOURCES.has(payload.resource_id) && Number.isInteger(payload.expires_days) && payload.expires_days >= 1 && payload.expires_days <= 30 && Number.isInteger(payload.minutes) && payload.minutes >= 15 && payload.minutes <= 120;
  if (!valid) throw bad();
  return { action: "command", application_id: body.application_id.toLowerCase(), command: body.command, expected_revision: body.expected_revision, request_id: body.request_id.toLowerCase(), payload: { ...payload } };
}

function json(status, body, origin) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Vary": "Origin" };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new OpsError("INVALID_BODY", 400);
  if (Number(request.headers.get("content-length")) > 8192) throw new OpsError("BODY_TOO_LARGE", 413);
  const reader = request.body?.getReader(); if (!reader) throw new OpsError("INVALID_BODY", 400);
  let length = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 8192) { await reader.cancel(); throw new OpsError("BODY_TOO_LARGE", 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) { if (error instanceof OpsError) throw error; throw new OpsError("INVALID_BODY", 400); }
  finally { reader.releaseLock(); }
}

const RESULT_STATUS = Object.freeze({ forbidden: 403, not_found: 404, stale_revision: 409, idempotency_conflict: 409, capacity_full: 409, invalid: 400, transition_denied: 409, paused: 503, suppressed: 403, expired: 410 });
async function readNoticeReceipt(response) {
  if (Number(response.headers.get("content-length")) > 65536) { await response.body?.cancel(); throw new Error("RECEIPT_TOO_LARGE"); }
  const reader = response.body?.getReader(); if (!reader) throw new Error("RECEIPT_UNAVAILABLE");
  let length = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 65536) { await reader.cancel(); throw new Error("RECEIPT_TOO_LARGE"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { reader.releaseLock(); }
}
export function createNoticeSender({ providerToken, from, fetchImpl = fetch }) {
  return async ({ email, applicationId, noticeId }) => {
    let response;
    try {
      response = await fetchImpl("https://api.postmarkapp.com/email", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": providerToken },
        body: JSON.stringify({ From: from, To: email, ReplyTo: "architect@kapukai.org", Subject: NOTICE_MESSAGE.subject, TextBody: NOTICE_MESSAGE.text, MessageStream: "outbound", Tag: "kapukai-application-update", TrackOpens: false, TrackLinks: "None", Metadata: { application_id: applicationId, notice_id: noticeId, template_version: NOTICE_VERSION } }),
      });
    } catch { return { state: "unknown", providerMessageId: null }; }
    let value;
    try { value = await readNoticeReceipt(response); } catch { return { state: "unknown", providerMessageId: null }; }
    if (response.ok && value?.ErrorCode === 0 && typeof value.MessageID === "string" && UUID_RE.test(value.MessageID)) return { state: "accepted", providerMessageId: value.MessageID };
    return { state: typeof value?.ErrorCode === "number" && value.ErrorCode !== 0 ? "failed" : "unknown", providerMessageId: null };
  };
}

export function createHandler({ authenticate, rpc, getConfig, canSendNotice = () => false, sendNotice }) {
  return async function handler(request) {
    const origin = request.headers.get("origin");
    if (!ALLOWED_ORIGINS.has(origin)) return json(403, { ok: false, code: "ORIGIN_DENIED" }, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Vary": "Origin", "Cache-Control": "no-store" } });
    if (request.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, origin);
    if (new URL(request.url).search) return json(400, { ok: false, code: "INVALID_REQUEST" }, origin);
    try {
      const body = normalizeRequest(await readBody(request));
      if (body.action === "config") return json(200, { ok: true, ...publicAuthConfig(await getConfig()) }, origin);
      const principal = await authenticate(request);
      // IDs come solely from verified identity; clients cannot supply or override them.
      const scope = { p_user_id: principal.user_id, p_session_id: principal.session_id, p_tenant_id: principal.tenant_id, p_subject_id: principal.subject_id };
      if (body.action === "send_notice") {
        if (!await canSendNotice() || typeof sendNotice !== "function") throw new OpsError("NOTICE_NOT_CONFIGURED", 503);
        // The database serializes each application/revision claim and checks live
        // authority plus current withdrawal/suppression before returning a recipient.
        const claim = await rpc("kapukai_workshop_notice_claim", { ...scope, p_application_id: body.application_id, p_expected_revision: body.expected_revision, p_request_id: body.request_id, p_template_version: NOTICE_VERSION });
        if (claim?.result === "duplicate") return json(200, { ok: true, result: "duplicate", notice: { id: claim.notice_id, state: claim.state === "pending" ? "unknown" : claim.state } }, origin);
        if (claim?.result !== "claimed") {
          const status = RESULT_STATUS[claim?.result];
          if (status) return json(status, { ok: false, code: claim.result.toUpperCase() }, origin);
          throw new OpsError("TEMPORARILY_UNAVAILABLE", 503);
        }
        if (!UUID_RE.test(claim.notice_id || "") || claim.template_version !== NOTICE_VERSION || typeof claim.email !== "string" || claim.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(claim.email)) throw new OpsError("NOTICE_CLAIM_INVALID", 503);
        let receipt = { state: "unknown", providerMessageId: null };
        try {
          const sent = await sendNotice({ email: claim.email, applicationId: body.application_id, noticeId: claim.notice_id });
          if (["accepted", "failed", "unknown"].includes(sent?.state)) receipt = { state: sent.state === "accepted" && !UUID_RE.test(sent.providerMessageId || "") ? "unknown" : sent.state, providerMessageId: UUID_RE.test(sent.providerMessageId || "") ? sent.providerMessageId : null };
        } catch { /* A timeout is not proof of failure. Never send again automatically. */ }
        try {
          const saved = await rpc("kapukai_workshop_notice_finish", { ...scope, p_notice_id: claim.notice_id, p_state: receipt.state, p_provider_message_id: receipt.providerMessageId });
          if (saved?.result === "recorded") return json(200, { ok: true, result: "notice_recorded", notice: { id: claim.notice_id, state: saved.state } }, origin);
        } catch { /* The claim remains unrepeatable pending reconciliation. */ }
        return json(200, { ok: true, result: "notice_unreconciled", notice: { id: claim.notice_id, state: "unknown" } }, origin);
      }
      const result = body.action === "queue"
        ? await rpc("kapukai_workshop_owner_queue", { ...scope, p_limit: body.limit, p_offset: body.offset, p_view: body.view })
        : await rpc("kapukai_workshop_owner_action", { ...scope, p_application_id: body.application_id, p_action: body.command, p_expected_revision: body.expected_revision, p_request_id: body.request_id, p_payload: body.payload });
      if (["ok", "updated", "duplicate"].includes(result?.result)) return json(200, { ok: true, ...result, ...(body.action === "queue" ? { notice_template: { version: NOTICE_VERSION, ...NOTICE_MESSAGE }, notice_available: Boolean(await canSendNotice()) } : {}) }, origin);
      const status = RESULT_STATUS[result?.result];
      if (status) return json(status, { ok: false, code: result.result.toUpperCase() }, origin);
      throw new OpsError("TEMPORARILY_UNAVAILABLE", 503);
    } catch (error) {
      return json(error instanceof OpsError ? error.status : 503, { ok: false, code: error instanceof OpsError ? error.code : "TEMPORARILY_UNAVAILABLE" }, origin);
    }
  };
}
