// Supabase Auth verifies the bearer token before any claims become authority.
// Membership and session revocation are rechecked inside each database command.
export const PROJECT_URL = "https://tbxfsjipkrdwyctepesf.supabase.co";
export const PROJECT_REF = "tbxfsjipkrdwyctepesf";
export const SESSION_SECONDS = 1800;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class MemberError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
const fail = (code = "AUTHENTICATION_REQUIRED", status = 401) => new MemberError(code, status);

function claims(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw fail();
    const value = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(parts[1].replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0))));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw fail();
    return value;
  } catch { throw fail(); }
}

// A mistaken service key must fail closed, never become browser configuration.
export function publicAuthConfig({ baseUrl, publishableKey }) {
  if (baseUrl !== PROJECT_URL || typeof publishableKey !== "string" || publishableKey.length > 4096) throw fail("AUTH_NOT_CONFIGURED", 503);
  let valid = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey);
  if (!valid) {
    try { const value = claims(publishableKey); valid = value.role === "anon" && value.ref === PROJECT_REF; } catch { /* not a public key */ }
  }
  if (!valid) throw fail("AUTH_NOT_CONFIGURED", 503);
  return Object.freeze({ supabase_url: PROJECT_URL, publishable_key: publishableKey, session_seconds: SESSION_SECONDS });
}

export function serviceHeaders({ baseUrl, serviceKey }) {
  if (baseUrl !== PROJECT_URL || typeof serviceKey !== "string" || serviceKey.length > 4096) throw fail("SERVICE_NOT_CONFIGURED", 503);
  const headers = { apikey: serviceKey, "Content-Type": "application/json" };
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(serviceKey)) return headers;
  try {
    const value = claims(serviceKey);
    if (value.role !== "service_role" || value.ref !== PROJECT_REF) throw fail();
    headers.Authorization = `Bearer ${serviceKey}`;
    return headers;
  } catch { throw fail("SERVICE_NOT_CONFIGURED", 503); }
}

export async function boundedJson(response, maximum = 65536, code = "IDENTITY_UNAVAILABLE") {
  if (Number(response.headers.get("content-length")) > maximum) {
    await response.body?.cancel(); throw fail(code, 503);
  }
  const reader = response.body?.getReader();
  if (!reader) throw fail(code, 503);
  let length = 0; const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw fail(code, 503); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { throw fail(code, 503); }
  finally { reader.releaseLock(); }
}

export function createAuthenticator({ baseUrl, publishableKey, fetchImpl = fetch, clock = () => Date.now() }) {
  const config = publicAuthConfig({ baseUrl, publishableKey });
  return async function authenticate(request) {
    const authorization = request.headers.get("authorization") || "";
    const match = authorization.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
    if (!match || authorization.length > 16384) throw fail();
    const token = match[1]; let response;
    try {
      response = await fetchImpl(`${config.supabase_url}/auth/v1/user`, {
        headers: { apikey: config.publishable_key, authorization: `Bearer ${token}` },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
      });
    } catch { throw fail("IDENTITY_UNAVAILABLE", 503); }
    if (!response.ok) {
      await response.body?.cancel();
      throw [400, 401, 403, 404].includes(response.status) ? fail() : fail("IDENTITY_UNAVAILABLE", 503);
    }
    const user = await boundedJson(response), jwt = claims(token), now = clock() / 1000;
    if (!UUID_RE.test(user?.id || "") || user.id !== jwt.sub || user.is_anonymous === true || jwt.is_anonymous === true || !user.email_confirmed_at || !Number.isFinite(Date.parse(user.email_confirmed_at)) || user.deleted_at || (user.banned_until && Date.parse(user.banned_until) > clock())) throw fail();
    if (jwt.iss !== `${PROJECT_URL}/auth/v1` || jwt.role !== "authenticated" || jwt.aud !== "authenticated" || !UUID_RE.test(jwt.session_id || "") || !Number.isFinite(jwt.exp) || jwt.exp <= now || !Number.isFinite(jwt.iat) || jwt.exp <= jwt.iat || jwt.iat > now + 30 || jwt.iat <= now - SESSION_SECONDS || (jwt.nbf !== undefined && (!Number.isFinite(jwt.nbf) || jwt.nbf > now + 30))) throw fail();
    // Standard project JWT lifetime can exceed 30m. This module imposes its own
    // shorter token-age limit; SQL also caps the original live session at 30m.
    // No user metadata, email address, or existing application grants authority.
    return Object.freeze({ user_id: user.id, session_id: jwt.session_id });
  };
}
