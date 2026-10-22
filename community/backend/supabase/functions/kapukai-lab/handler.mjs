import { MemberError, publicAuthConfig, serviceHeaders, boundedJson, UUID_RE } from "./auth.mjs";

export const ALLOWED_ORIGINS = new Set(["https://kapukai.org", "https://www.kapukai.org", "https://kapukai-community.vercel.app"]);
export const MAX_BODY_BYTES = 16384;
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v, required, optional = []) => object(v) && required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
const uuid = v => typeof v === "string" && UUID_RE.test(v);
const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const room = v => ["lounge", "conference", "classroom"].includes(v);
const iso = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\.000)?Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === (v.includes(".") ? v : v.replace(/Z$/, ".000Z"));
const range = p => iso(p.starts_at) && iso(p.ends_at) && Date.parse(p.ends_at) > Date.parse(p.starts_at);
const quarter = v => new Date(v).getUTCMinutes() % 15 === 0;
const date = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const title = v => typeof v === "string" && v.trim().length >= 1 && v.length <= 100 && !/[\u0000-\u001F\u007F]/.test(v);
const empty = p => keys(p, []);
const validators = {
  config: empty,
  state: p => keys(p, ["week_start"]) && date(p.week_start),
  book: p => keys(p, ["request_id", "room_id", "starts_at", "ends_at", "participants", "mode"]) && uuid(p.request_id) && room(p.room_id) && range(p) && quarter(p.starts_at) && integer(p.participants, 1, 6) && ["room", "organize"].includes(p.mode),
  join_class: p => keys(p, ["request_id", "class_id"]) && uuid(p.request_id) && uuid(p.class_id),
  cancel: p => keys(p, ["request_id", "booking_id"]) && uuid(p.request_id) && uuid(p.booking_id),
  reschedule: p => keys(p, ["request_id", "booking_id", "starts_at", "ends_at"]) && uuid(p.request_id) && uuid(p.booking_id) && range(p) && quarter(p.starts_at),
  operator_member: p => typeof p?.active === "boolean" && ((keys(p, ["user_id", "active"]) && uuid(p.user_id)) || (keys(p, ["email", "active"]) && typeof p.email === "string" && p.email.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(p.email))),
  operator_window: p => keys(p, ["room_id", "starts_at", "ends_at"]) && room(p.room_id) && range(p),
  operator_window_remove: p => keys(p, ["window_id"]) && uuid(p.window_id),
  operator_class_cancel: p => keys(p, ["request_id", "class_id"]) && uuid(p.request_id) && uuid(p.class_id),
  operator_class: p => keys(p, ["request_id", "room_id", "starts_at", "ends_at", "title", "capacity"]) && uuid(p.request_id) && room(p.room_id) && range(p) && quarter(p.starts_at) && title(p.title) && integer(p.capacity, 1, 6),
  operator_config: p => keys(p, ["enabled"]) && typeof p.enabled === "boolean",
  operator_dispatch: empty,
};
export const ACTIONS = Object.freeze(Object.keys(validators));
export function normalizeRequest(body) {
  if (!keys(body, ["action"], ["payload"]) || typeof body.action !== "string" || !Object.hasOwn(validators, body.action)) throw new MemberError("INVALID_REQUEST", 400);
  const payload = Object.hasOwn(body, "payload") ? body.payload : {};
  if (!validators[body.action](payload)) throw new MemberError("INVALID_REQUEST", 400);
  return { action: body.action, payload };
}
function json(status, body, origin) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", Vary: "Origin" };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
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
  } catch (e) { if (e instanceof MemberError) throw e; throw new MemberError("INVALID_BODY", 400); }
  finally { reader.releaseLock(); }
}
const ERROR_STATUS = Object.freeze({ AUTHENTICATION_REQUIRED: 401, AUTH_NOT_CONFIGURED: 503, SERVICE_NOT_CONFIGURED: 503, IDENTITY_UNAVAILABLE: 503, INVALID_REQUEST: 400, INVALID_BODY: 400, BODY_TOO_LARGE: 413, TEMPORARILY_UNAVAILABLE: 503, FORBIDDEN: 403, DISABLED: 503, CONFLICT: 409, OUTSIDE_HOURS: 409, NOT_FOUND: 404, CAPACITY_FULL: 409, IDEMPOTENCY_CONFLICT: 409 });
const fields = (value, names) => Object.fromEntries(names.filter(k => Object.hasOwn(value, k)).map(k => [k, value[k]]));
const rows = (value, names) => (Array.isArray(value) ? value : []).map(v => fields(v, names));
// Never return Auth emails, provider receipts, private subjects or other users' IDs.
// Operator roster has its own explicit projection; it does not grant membership.
export function projectResult(result, action) {
  if (action !== "state") {
    const projected = fields(result, ["ok", "enabled", "active", "request_id"]);
    if (object(result.booking)) projected.booking = fields(result.booking, ["id", "room_id", "starts_at", "ends_at", "kind", "status", "class_id", "version", "participants"]);
    return projected;
  }
  const out = fields(result, ["ok", "access", "operator", "enabled", "timezone"]);
  out.mine = rows(result.mine, ["id", "room_id", "starts_at", "ends_at", "kind", "status", "class_id", "version", "participants"]);
  if (result.access === true || result.operator === true) {
    out.rooms = rows(result.rooms, ["id", "name", "capacity"]);
    out.windows = rows(result.windows, ["id", "room_id", "starts_at", "ends_at"]);
    out.reservations = rows(result.reservations, ["id", "room_id", "starts_at", "ends_at", "kind", "capacity", "seats_taken"]).map((r, i) => ({ ...r, title: r.kind === "class" ? result.reservations[i].title : "Reserved" }));
  }
  if (result.operator === true) {
    out.members = rows(result.members, ["user_id", "email", "active"]);
    if (object(result.mail_status)) out.mail_status = fields(result.mail_status, ["pending", "sending", "accepted", "failed", "unknown"]);
  }
  return out;
}
export function createRpc({ baseUrl, serviceKey, fetchImpl = fetch }) {
  return async function rpc(name, parameters) {
    if (!["kapukai_lab_command", "kapukai_lab_mail"].includes(name)) throw new MemberError("INVALID_REQUEST", 400);
    const headers = serviceHeaders({ baseUrl, serviceKey }); let response;
    try { response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(parameters), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) }); }
    catch { throw new MemberError("TEMPORARILY_UNAVAILABLE", 503); }
    if (!response.ok) { await response.body?.cancel(); throw new MemberError("TEMPORARILY_UNAVAILABLE", 503); }
    return boundedJson(response, 1048576, "TEMPORARILY_UNAVAILABLE");
  };
}
export function createMailSender({ providerToken, from, fetchImpl = fetch }) {
  const configured = () => {
    if (typeof providerToken !== "string" || !providerToken || typeof from !== "string" || !from || from.length > 320 || /[\r\n]/.test(from)) throw new MemberError("SERVICE_NOT_CONFIGURED", 503);
  };
  const send = async message => {
    configured();
    if (!uuid(message?.id) || typeof message.to !== "string" || message.to.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(message.to) || !title(message.subject) || typeof message.text !== "string" || !message.text || message.text.length > 16000) return { status: "failed" };
    let response;
    try {
      response = await fetchImpl("https://api.postmarkapp.com/email", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Postmark-Server-Token": providerToken }, body: JSON.stringify({ From: from, To: message.to, ReplyTo: "architect@kapukai.org", Subject: message.subject, TextBody: message.text, MessageStream: "outbound", Tag: "kapukai-lab-booking", Metadata: { outbox_id: message.id }, TrackOpens: false, TrackLinks: "None" }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
      const receipt = await boundedJson(response, 65536, "TEMPORARILY_UNAVAILABLE");
      if (response.ok && receipt?.ErrorCode === 0 && uuid(receipt.MessageID)) return { status: "accepted", provider_id: receipt.MessageID };
      if (response.status < 500 && Number.isInteger(receipt?.ErrorCode) && receipt.ErrorCode !== 0) return { status: "failed" };
      return { status: "unknown" };
    } catch { return { status: "unknown" }; }
  };
  return Object.assign(send, { configured });
}
export function createDispatcher({ rpc, sendMail }) {
  return async function dispatch(requestId) {
    // Configuration is checked before pending messages become claimed. A missing
    // provider cannot strand new rows in sending. The DB never reclaims sending.
    try { if (typeof sendMail !== "function") throw new Error(); sendMail.configured?.(); }
    catch { return { state: "pending" }; }
    let claimed;
    try { claimed = await rpc("kapukai_lab_mail", { p_action: "claim", p_payload: { limit: 20, ...(requestId ? { request_id: requestId } : {}) } }); }
    catch { return { state: "pending" }; }
    if (claimed?.ok !== true || !Array.isArray(claimed.messages) || claimed.messages.length > 20) return { state: "pending" };
    const summary = { state: "attempted", accepted: 0, failed: 0, unknown: 0 };
    await Promise.all(claimed.messages.map(async message => {
      let sent;
      try { sent = await sendMail(message); } catch { sent = { status: "unknown" }; }
      if (!["accepted", "failed", "unknown"].includes(sent?.status)) sent = { status: "unknown" };
      const payload = { id: message.id, status: sent.status };
      if (sent.status === "accepted" && uuid(sent.provider_id)) payload.provider_id = sent.provider_id;
      else if (sent.status === "accepted") payload.status = "unknown";
      try {
        const finished = await rpc("kapukai_lab_mail", { p_action: "finish", p_payload: payload });
        if (finished?.ok !== true) payload.status = "unknown";
      } catch { payload.status = "unknown"; }
      summary[payload.status] += 1;
    }));
    return summary;
  };
}
export function createHandler({ authenticate, rpc, getConfig, dispatch }) {
  return async request => {
    const origin = request.headers.get("origin");
    if (!ALLOWED_ORIGINS.has(origin)) return json(403, { ok: false, code: "ORIGIN_DENIED" }, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, content-type, apikey", Vary: "Origin", "Cache-Control": "no-store" } });
    if (request.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, origin);
    if (new URL(request.url).search) return json(400, { ok: false, code: "INVALID_REQUEST" }, origin);
    try {
      const { action, payload } = normalizeRequest(await readBody(request));
      if (action === "config") return json(200, { ok: true, ...publicAuthConfig(await getConfig()) }, origin);
      const actor = await authenticate(request);
      if (!uuid(actor?.user_id) || !uuid(actor?.session_id)) throw new MemberError("AUTHENTICATION_REQUIRED", 401);
      const result = await rpc("kapukai_lab_command", { p_user: actor.user_id, p_session: actor.session_id, p_action: action, p_payload: payload });
      if (result?.ok !== true) {
        const code = Object.hasOwn(ERROR_STATUS, result?.error) ? result.error : "TEMPORARILY_UNAVAILABLE";
        return json(ERROR_STATUS[code], { ok: false, code }, origin);
      }
      const projected = projectResult(result, action);
      if (["book", "join_class", "cancel", "reschedule", "operator_class_cancel", "operator_dispatch"].includes(action)) {
        try { projected.notifications = typeof dispatch === "function" ? await dispatch(action === "operator_dispatch" ? undefined : payload.request_id) : { state: "pending" }; }
        catch { projected.notifications = { state: "pending" }; }
      }
      return json(200, projected, origin);
    } catch (e) {
      const code = e instanceof MemberError && Object.hasOwn(ERROR_STATUS, e.code) ? e.code : "TEMPORARILY_UNAVAILABLE";
      return json(ERROR_STATUS[code], { ok: false, code }, origin);
    }
  };
}
