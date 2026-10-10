import {createHandler} from "./handler.mjs";

const env = (name: string) => Deno.env.get(name) || "";
function serviceKey() {
  try { return JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}").default || env("SUPABASE_SERVICE_ROLE_KEY"); }
  catch { return env("SUPABASE_SERVICE_ROLE_KEY"); }
}
const key = serviceKey(), base = env("SUPABASE_URL");
async function rpc(name: string, parameters: unknown, options: {timeoutMs?: number} = {}) {
  // A secret API key belongs in apikey. Legacy JWT service keys also work there.
  const headers: Record<string, string> = {apikey: key, "Content-Type": "application/json"};
  if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key;
  const response = await fetch(base + "/rest/v1/rpc/" + name, {
    method: "POST", headers, body: JSON.stringify(parameters),
    signal: AbortSignal.timeout(options.timeoutMs ?? 10000), redirect: "error",
  });
  if (!response.ok) throw new Error("DATABASE_RPC_FAILED");
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
Deno.serve(createHandler({rpc, databaseReady: Boolean(key && base),
  // Production authorizes only the dedicated Vault-backed worker token via RPC.
  // Deliberately never reuse the older kapukai-connect credential names.
  hubspotToken: env("KAPUKAI_HUBSPOT_ACCESS_TOKEN"),
  expectedPortalId: env("KAPUKAI_HUBSPOT_PORTAL_ID") || "245840109",
}));
