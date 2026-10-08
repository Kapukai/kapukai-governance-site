import { createAuthenticator, OpsError } from "./auth.mjs";
import { createHandler, createNoticeSender } from "./handler.mjs";

const env = (name: string) => Deno.env.get(name) || "";
function defaultKey(name: string, fallback: string) {
  try { return JSON.parse(env(name) || "{}").default || env(fallback); }
  catch { return env(fallback); }
}
const baseUrl = env("SUPABASE_URL");
const serviceKey = defaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const publishableKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const providerToken = env("POSTMARK_SERVER_TOKEN"), from = env("POSTMARK_FROM_EMAIL");
const getConfig = () => ({ baseUrl, publishableKey });
let authenticator: ReturnType<typeof createAuthenticator> | undefined;
async function authenticate(request: Request) {
  authenticator ||= createAuthenticator(getConfig());
  return authenticator(request);
}
async function rpc(name: string, parameters: unknown) {
  if (!serviceKey || !baseUrl) throw new OpsError("SERVICE_NOT_CONFIGURED", 503);
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(parameters),
  });
  if (!response.ok) { await response.body?.cancel(); throw new OpsError("TEMPORARILY_UNAVAILABLE", 503); }
  // Queue is bounded to 50 records. Do not log provider bodies or applicant data.
  if (Number(response.headers.get("content-length")) > 1048576) { await response.body?.cancel(); throw new OpsError("TEMPORARILY_UNAVAILABLE", 503); }
  const reader = response.body?.getReader(); if (!reader) throw new OpsError("TEMPORARILY_UNAVAILABLE", 503);
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 1048576) { await reader.cancel(); throw new OpsError("TEMPORARILY_UNAVAILABLE", 503); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { reader.releaseLock(); }
}
Deno.serve(createHandler({ authenticate, rpc, getConfig, canSendNotice: () => Boolean(serviceKey && baseUrl && providerToken && from), sendNotice: createNoticeSender({ providerToken, from }) }));
