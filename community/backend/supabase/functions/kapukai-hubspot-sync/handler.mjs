// Server-only CRM projection. This worker never calls a marketing or email API.
const API = "https://api.hubapi.com";
const CONTACTS = "/crm/v3/objects/contacts";
const PROPERTIES = "/crm/v3/properties/contacts";
const FIELD_LABELS = {
  kapukai_signup_sources: "Kapukai signup sources",
  kapukai_source_states: "Kapukai source states",
  kapukai_confirmed_topics: "Kapukai confirmed topics",
  kapukai_consent_status: "Kapukai consent status",
  kapukai_email_verified: "Kapukai email verified",
  kapukai_latest_signup_at: "Kapukai latest signup at",
  kapukai_latest_withdrawal_at: "Kapukai latest withdrawal at",
  kapukai_source_present: "Kapukai source present",
  kapukai_suppressed: "Kapukai source suppression",
  kapukai_sync_generation: "Kapukai sync generation",
  kapukai_supplied_name: "Kapukai supplied name",
  kapukai_supplied_company: "Kapukai supplied company",
};
export const PROPERTY_DEFINITIONS = Object.entries(FIELD_LABELS).map(([name, label]) => ({
  name, label, groupName: "contactinformation", type: "string", fieldType: "text",
  description: "Supabase-managed Kapukai signup projection. This is not HubSpot marketing permission or an access/qualification decision.",
}));
export const PROPERTY_NAMES = Object.keys(FIELD_LABELS);
const READ_PROPERTIES = ["email", "hs_email_optout", ...PROPERTY_NAMES].join(",");

export class SyncError extends Error {
  constructor(code, outcome = "retry", retryAfter = null) {
    super(code); this.code = code; this.outcome = outcome; this.retryAfter = retryAfter;
  }
}

// Compare fixed-size digests; no early exit at the first differing character.
export async function constantTimeEqual(a, b) {
  const encoder = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(value => crypto.subtle.digest("SHA-256", encoder.encode(value))));
  const left = new Uint8Array(x), right = new Uint8Array(y);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

const normalizeEmail = value => typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const textValue = value => typeof value === "string" ? value.trim().slice(0, 200).replace(/[\u0000-\u001f\u007f]/g, "") : "";
function tagList(value) {
  if (!Array.isArray(value) || value.length > 100 || value.some(item => typeof item !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,99}$/.test(item))) {
    throw new SyncError("INVALID_PAYLOAD", "failed");
  }
  return [...new Set(value)].sort().join(";");
}
function timestamp(value) {
  if (value === null || value === undefined || value === "") return "";
  const date = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(date.getTime())) throw new SyncError("INVALID_PAYLOAD", "failed");
  return date.toISOString();
}
export function contactProjection(job) {
  const p = job.payload;
  const email = normalizeEmail(job.email);
  if (!p || typeof p !== "object" || !validEmail(email) || normalizeEmail(p.email) !== email ||
      !Number.isSafeInteger(Number(job.generation)) || Number(job.generation) < 1 ||
      ![p.email_verified, p.source_present, p.suppressed].every(value => typeof value === "boolean") ||
      typeof p.consent_status !== "string" || !/^[a-z][a-z_]{0,39}$/.test(p.consent_status)) {
    throw new SyncError("INVALID_PAYLOAD", "failed");
  }
  // Explicitly construct properties: payload keys can never select a HubSpot field.
  return {email, properties: {
    kapukai_signup_sources: tagList(p.signup_sources),
    kapukai_source_states: tagList(p.source_states),
    kapukai_confirmed_topics: !p.source_present ? "" : tagList(p.confirmed_topics),
    kapukai_consent_status: p.consent_status,
    kapukai_email_verified: String(p.email_verified),
    kapukai_latest_signup_at: timestamp(p.latest_signup_at),
    kapukai_latest_withdrawal_at: timestamp(p.latest_withdrawal_at),
    kapukai_source_present: String(p.source_present),
    kapukai_suppressed: String(p.suppressed),
    kapukai_sync_generation: String(job.generation),
    kapukai_supplied_name: p.source_present ? textValue(p.name) : "",
    kapukai_supplied_company: p.source_present ? textValue(p.company) : "",
  }};
}

export function retryDelay(attempt, retryAfter, random = Math.random) {
  const backoff = Math.min(21600, 30 * 2 ** Math.min(10, Math.max(0, Number(attempt || 1) - 1)));
  return Math.min(86400, Math.max(Math.ceil(backoff * (1 + random() * 0.2)), Math.ceil(retryAfter || 0)));
}
function retryHeader(value, now) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.ceil((parsed - now()) / 1000)) : null;
}
function apiError(status, response, now) {
  if (status === 401) return new SyncError("HUBSPOT_UNAUTHORIZED", "blocked");
  if (status === 403) return new SyncError("HUBSPOT_PERMISSION_DENIED", "blocked");
  if (status === 429) return new SyncError("HUBSPOT_RATE_LIMITED", "retry", retryHeader(response.headers.get("retry-after"), now));
  if (status === 423 || status === 408 || status >= 500) return new SyncError("HUBSPOT_TEMPORARY_FAILURE", "retry", retryHeader(response.headers.get("retry-after"), now));
  if (status === 404) return new SyncError("HUBSPOT_NOT_FOUND", "blocked");
  if (status === 409) return new SyncError("HUBSPOT_CONFLICT", "retry");
  return new SyncError("HUBSPOT_INVALID_REQUEST", "failed");
}

export function createHubSpotClient({token, fetch: fetchImpl = fetch, now = Date.now, deadline = Infinity, timeoutMs = 10000}) {
  async function request(path, method = "GET", body) {
    const remaining = deadline - now();
    if (remaining <= 0) throw new SyncError("WORKER_BUDGET_EXHAUSTED");
    let response;
    try {
      response = await fetchImpl(API + path, {
        method, headers: {Authorization: "Bearer " + token, "Content-Type": "application/json"},
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(1, Math.floor(Math.min(timeoutMs, remaining)))),
        redirect: "error",
      });
    } catch { throw new SyncError("HUBSPOT_NETWORK_UNCERTAIN"); }
    if (!response.ok) throw apiError(response.status, response, now);
    try { return await response.json(); } catch { throw new SyncError("HUBSPOT_RESPONSE_UNCERTAIN"); }
  }
  const get = (value, byEmail = false) => request(CONTACTS + "/" + encodeURIComponent(value) +
    "?properties=" + encodeURIComponent(READ_PROPERTIES) + (byEmail ? "&idProperty=email" : ""));
  async function lookup(email) {
    try { return await get(email, true); }
    catch (error) { if (error.code === "HUBSPOT_NOT_FOUND") return null; throw error; }
  }
  function schemaCompatible(property, definition) {
    return property && property.name === definition.name && property.type === "string" && property.fieldType === "text" &&
      property.archived !== true && property.modificationMetadata?.readOnlyValue !== true;
  }
  async function ensureSchema(beforeWrite = async () => {}) {
    const result = await request(PROPERTIES);
    if (!Array.isArray(result.results)) throw new SyncError("HUBSPOT_RESPONSE_UNCERTAIN");
    const existing = new Map(result.results.map(property => [property.name, property]));
    for (const definition of PROPERTY_DEFINITIONS) {
      let property = existing.get(definition.name);
      if (!property) {
        await beforeWrite();
        try { property = await request(PROPERTIES, "POST", definition); }
        catch (error) {
          if (error.code !== "HUBSPOT_CONFLICT") throw error;
          property = await request(PROPERTIES + "/" + definition.name);
        }
      }
      if (!schemaCompatible(property, definition)) throw new SyncError("HUBSPOT_PROPERTY_SCHEMA_CONFLICT", "blocked");
    }
  }
  async function verifyAccount(expectedPortalId) {
    if (!/^\d+$/.test(String(expectedPortalId || ""))) throw new SyncError("HUBSPOT_PORTAL_NOT_CONFIGURED", "blocked");
    const details = await request("/integrations/v1/me");
    if (String(details.portalId) !== String(expectedPortalId)) throw new SyncError("HUBSPOT_PORTAL_MISMATCH", "blocked");
  }
  return {get, lookup, ensureSchema, verifyAccount,
    create: properties => request(CONTACTS, "POST", {properties}),
    update: (id, properties) => request(CONTACTS + "/" + encodeURIComponent(id), "PATCH", {properties}),
  };
}

function validContact(contact) { return contact && /^\d+$/.test(String(contact.id)) && contact.archived !== true; }
function matchesEmail(contact, email) {
  // Secondary-email aliases must not collapse independently consented Supabase
  // identities into one mutable CRM projection. A human resolves that conflict.
  return normalizeEmail(contact.properties?.email) === email;
}
function contactMatches(contact, properties) {
  return Object.entries(properties).every(([key, value]) => String(contact.properties?.[key] ?? "") === value);
}
const leaseParams = job => ({p_email: job.email, p_generation: job.generation, p_lease_id: job.lease_id});

export async function syncContact(job, {rpc, client}) {
  const projection = contactProjection(job);
  let contactId = job.hubspot_contact_id ? String(job.hubspot_contact_id) : null;
  const guard = async () => {
    if (await rpc("kapukai_crm_lease_current", leaseParams(job)) !== true) throw new SyncError("STALE_GENERATION", "retry", 0);
  };
  const checkpoint = async id => {
    contactId = String(id);
    if (await rpc("kapukai_crm_checkpoint", {...leaseParams(job), p_contact_id: contactId}) !== true) {
      throw new SyncError("LEASE_LOST", "retry", 0);
    }
  };
  try {
    await guard();
    let contact;
    // A mapped contact must continue to exist and match before any write. An
    // archived/deleted CRM record is an operator decision, not a new signup.
    if (contactId) {
      try { contact = await client.get(contactId); }
      catch (error) { if (error.code === "HUBSPOT_NOT_FOUND") throw new SyncError("CONTACT_MISSING", "blocked"); throw error; }
      if (!validContact(contact) || !matchesEmail(contact, projection.email)) throw new SyncError("CONTACT_IDENTITY_CONFLICT", "blocked");
    } else {
      contact = await client.lookup(projection.email);
    }
    if (contact) {
      if (!validContact(contact) || !matchesEmail(contact, projection.email)) throw new SyncError("CONTACT_IDENTITY_CONFLICT", "blocked");
      await checkpoint(contact.id);
    } else {
      // Deleting the only source must not create a new contact from a tombstone.
      if (!job.payload.source_present) return {contactId: null, hubspotEmailOptout: null};
      await guard();
      try {
        contact = await client.create({email: projection.email, ...projection.properties});
        if (!validContact(contact)) throw new SyncError("HUBSPOT_RESPONSE_UNCERTAIN");
        if (!matchesEmail(contact, projection.email)) throw new SyncError("CONTACT_IDENTITY_CONFLICT", "blocked");
      } catch (error) {
        // One create per attempt. Conflict/timeout may have committed; recover by
        // unique email read, never by a second blind create in this attempt.
        if (!["HUBSPOT_CONFLICT", "HUBSPOT_NETWORK_UNCERTAIN", "HUBSPOT_RESPONSE_UNCERTAIN", "HUBSPOT_TEMPORARY_FAILURE"].includes(error.code)) throw error;
        contact = await client.lookup(projection.email);
        if (!contact) throw error;
        if (!validContact(contact) || !matchesEmail(contact, projection.email)) throw new SyncError("CONTACT_IDENTITY_CONFLICT", "blocked");
      }
      await checkpoint(contact.id);
    }
    if (!contactMatches(contact, projection.properties)) {
      await guard();
      await client.update(contactId, projection.properties);
    }
    // A response to PATCH is not completion evidence: compare a separate GET.
    const verified = await client.get(contactId);
    if (!validContact(verified) || !matchesEmail(verified, projection.email)) throw new SyncError("CONTACT_IDENTITY_CONFLICT", "blocked");
    if (!contactMatches(verified, projection.properties)) throw new SyncError("HUBSPOT_READBACK_MISMATCH");
    const rawOptout = verified.properties?.hs_email_optout;
    return {contactId, hubspotEmailOptout: rawOptout === "true" || rawOptout === true ? true : rawOptout === "false" || rawOptout === false ? false : null};
  } catch (error) {
    error.contactId = contactId;
    throw error;
  }
}

const json = (status, data) => new Response(JSON.stringify(data), {status, headers: {"Content-Type": "application/json", "Cache-Control": "no-store"}});
const safeError = error => error instanceof SyncError ? error : new SyncError("DATABASE_OR_WORKER_FAILURE");

export function createHandler({rpc, workerToken = "", hubspotToken = "", databaseReady = true,
  expectedPortalId = "245840109", fetch: fetchImpl = fetch, now = Date.now, random = Math.random, budgetMs = 90000, timeoutMs = 10000}) {
  let schemaReady = false;
  async function authorized(request) {
    const authorization = request.headers.get("authorization") || "";
    if (!/^Bearer [A-Za-z0-9._~+/-]{32,256}={0,2}$/.test(authorization)) return false;
    const token = authorization.slice(7);
    if (workerToken) return constantTimeEqual(token, workerToken);
    if (!databaseReady) return false;
    return await rpc("kapukai_crm_authorize_worker", {p_token: token}) === true;
  }
  return async request => {
    const started = now();
    try {
      if (!await authorized(request)) return json(401, {ok: false, error: "UNAUTHORIZED"});
    } catch { return json(503, {ok: false, error: "AUTHORIZATION_UNAVAILABLE"}); }
    if (!["GET", "POST"].includes(request.method)) return json(405, {ok: false, error: "METHOD_NOT_ALLOWED"});
    if (!databaseReady) return json(503, {ok: false, error: "DATABASE_NOT_CONFIGURED"});
    try {
      if (request.method === "GET") return json(200, {ok: true, credential_configured: Boolean(hubspotToken), health: await rpc("kapukai_crm_health", {})});
      const deadline = started + Math.min(90000, budgetMs);
      const workRpc = (name, parameters) => {
        const remaining = deadline - now();
        if (remaining <= 0) throw new SyncError("WORKER_BUDGET_EXHAUSTED");
        return rpc(name, parameters, {timeoutMs: Math.max(1, Math.floor(Math.min(timeoutMs, remaining)))});
      };
      const health = await workRpc("kapukai_crm_heartbeat", {p_credential_ready: Boolean(hubspotToken), p_error_code: hubspotToken ? null : "HUBSPOT_CREDENTIAL_MISSING"});
      if (!hubspotToken) return json(503, {ok: false, error: "HUBSPOT_CREDENTIAL_MISSING"});
      if (health?.enabled === false) return json(200, {ok: true, paused: true});
      if (health?.enabled !== true) throw new SyncError("INVALID_HEALTH_RESPONSE");
      if (health.worker_retry_after_at && Date.parse(health.worker_retry_after_at) > now()) return json(200, {ok: true, cooling_down: true});
      const client = createHubSpotClient({token: hubspotToken, fetch: fetchImpl, now, deadline, timeoutMs});
      try {
        await client.verifyAccount(expectedPortalId);
        if (!schemaReady) {
          await client.ensureSchema(async () => {
            const current = await workRpc("kapukai_crm_health", {});
            if (current?.enabled !== true || current?.credential_ready !== true) throw new SyncError("CRM_SYNC_PAUSED", "blocked");
          });
          schemaReady = true;
        }
      } catch (error) {
        const problem = safeError(error);
        await workRpc("kapukai_crm_heartbeat", {p_credential_ready: problem.outcome !== "blocked", p_error_code: problem.code,
          p_retry_after_seconds: problem.code === "HUBSPOT_RATE_LIMITED" ? retryDelay(1, problem.retryAfter, random) : null});
        return json(503, {ok: false, error: problem.code});
      }
      const summary = {claimed: 0, synced: 0, retry: 0, blocked: 0, failed: 0, stale: 0};
      // Claim just before processing to avoid leasing jobs we cannot reach.
      for (let i = 0; i < 10 && now() < deadline - timeoutMs; i++) {
        const jobs = await workRpc("kapukai_crm_claim", {p_limit: 1, p_lease_seconds: 120});
        if (!Array.isArray(jobs)) throw new SyncError("INVALID_CLAIM_RESPONSE");
        if (!jobs.length) break;
        const job = jobs[0]; summary.claimed++;
        let result, problem;
        try { result = await syncContact(job, {rpc: workRpc, client}); }
        catch (error) { problem = safeError(error); result = {contactId: error.contactId ?? job.hubspot_contact_id ?? null, hubspotEmailOptout: null}; }
        const outcome = problem?.outcome || "synced";
        const completed = await workRpc("kapukai_crm_complete", {...leaseParams(job), p_contact_id: result.contactId,
          p_error_code: problem?.code || null, p_outcome: outcome,
          p_retry_after_seconds: problem?.code === "STALE_GENERATION" || problem?.code === "LEASE_LOST" ? 0 : retryDelay(job.attempt_count, problem?.retryAfter, random),
          p_hubspot_email_optout: result.hubspotEmailOptout});
        if (completed === true) summary[outcome]++; else summary.stale++;
        if (problem?.code === "HUBSPOT_INVALID_REQUEST") schemaReady = false;
        if (problem && ["HUBSPOT_UNAUTHORIZED", "HUBSPOT_PERMISSION_DENIED", "HUBSPOT_RATE_LIMITED"].includes(problem.code)) {
          await workRpc("kapukai_crm_heartbeat", {p_credential_ready: problem.outcome !== "blocked", p_error_code: problem.code,
            p_retry_after_seconds: problem.code === "HUBSPOT_RATE_LIMITED" ? retryDelay(job.attempt_count, problem.retryAfter, random) : null});
          break;
        }
      }
      return json(200, {ok: true, ...summary});
    } catch (error) { return json(503, {ok: false, error: safeError(error).code}); }
  };
}
