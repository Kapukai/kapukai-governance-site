// Reuse the established Supabase identity -> internal principal boundary.
// Decoded JWT claims are checked only after the Auth service verifies the token.
export const PROJECT_URL = "https://tbxfsjipkrdwyctepesf.supabase.co";
export const SESSION_SECONDS = 1800;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class OpsError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
const fail = (code = "AUTHENTICATION_REQUIRED", status = 401) => new OpsError(code, status);

function claims(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw fail();
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(parts[1].replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0))));
  } catch { throw fail(); }
}

// A mistaken service key must never become browser configuration.
export function publicAuthConfig({ baseUrl, publishableKey }) {
  if (baseUrl !== PROJECT_URL || typeof publishableKey !== "string" || publishableKey.length > 4096) throw fail("AUTH_NOT_CONFIGURED", 503);
  let valid = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey);
  if (!valid) {
    try { const value = claims(publishableKey); valid = value.role === "anon" && value.ref === "tbxfsjipkrdwyctepesf"; } catch { /* not a public key */ }
  }
  if (!valid) throw fail("AUTH_NOT_CONFIGURED", 503);
  return Object.freeze({ supabase_url: PROJECT_URL, publishable_key: publishableKey, session_seconds: SESSION_SECONDS });
}

async function readProviderJson(response) {
  if (Number(response.headers.get("content-length")) > 65536) throw fail("IDENTITY_UNAVAILABLE", 503);
  const reader = response.body?.getReader();
  if (!reader) throw fail("IDENTITY_UNAVAILABLE", 503);
  let length = 0; const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 65536) { await reader.cancel(); throw fail("IDENTITY_UNAVAILABLE", 503); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { throw fail("IDENTITY_UNAVAILABLE", 503); }
  finally { reader.releaseLock(); }
}

export function createAuthenticator({ baseUrl, publishableKey, fetchImpl = fetch, clock = () => Date.now() }) {
  // Validate before any user/provider request. This returns no secret configuration.
  const config = publicAuthConfig({ baseUrl, publishableKey });
  return async function authenticate(request) {
    const authorization = request.headers.get("authorization") || "";
    const match = authorization.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
    if (!match || authorization.length > 16384) throw fail();
    const token = match[1];
    const headers = { apikey: config.publishable_key, authorization: `Bearer ${token}` };
    const get = async (path, options = {}) => {
      let response;
      try { response = await fetchImpl(config.supabase_url + path, { ...options, headers: { ...headers, ...options.headers }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) }); }
      catch { throw fail("IDENTITY_UNAVAILABLE", 503); }
      if (!response.ok) {
        await response.body?.cancel();
        throw [400, 401, 403].includes(response.status) ? fail() : fail("IDENTITY_UNAVAILABLE", 503);
      }
      return readProviderJson(response);
    };
    const user = await get("/auth/v1/user");
    const jwt = claims(token), now = clock() / 1000;
    if (!UUID_RE.test(user?.id || "") || user.id !== jwt.sub || user.is_anonymous === true || !user.email_confirmed_at || !Number.isFinite(Date.parse(user.email_confirmed_at)) || (user.banned_until && Date.parse(user.banned_until) > clock())) throw fail();
    if (jwt.iss !== `${PROJECT_URL}/auth/v1` || jwt.role !== "authenticated" || jwt.aud !== "authenticated" || !UUID_RE.test(jwt.session_id || "") || !Number.isFinite(jwt.exp) || jwt.exp <= now || !Number.isFinite(jwt.iat) || jwt.iat > now + 30 || jwt.iat <= now - SESSION_SECONDS) throw fail();
    const rows = await get("/rest/v1/rpc/kapukai_current_principal", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    // Ambiguous or absent mappings fail closed. No new principal is provisioned.
    const principal = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (!principal || principal.state !== "active" || typeof principal.tenant_id !== "string" || !principal.tenant_id || principal.tenant_id.length > 200 || typeof principal.subject_id !== "string" || !principal.subject_id || principal.subject_id.length > 200) throw fail("WORKSHOP_ACCESS_REQUIRED", 403);
    // The service SQL re-resolves this mapping and checks the current session plus
    // its exact Workshop grant on every read and command. No email is authority.
    return Object.freeze({ user_id: user.id, session_id: jwt.session_id, tenant_id: principal.tenant_id, subject_id: principal.subject_id });
  };
}
