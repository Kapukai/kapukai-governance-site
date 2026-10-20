import { createAuthenticator } from "./auth.mjs";
import { createHandler, createRpc, createSignupSender } from "./handler.mjs";

// Secrets stay inside the Edge environment, never browser source or responses.
const env = (name: string) => Deno.env.get(name) || "";
function defaultKey(name: string, fallback: string) {
  try { const value = JSON.parse(env(name) || "{}").default; return typeof value === "string" && value ? value : env(fallback); }
  catch { return env(fallback); }
}
const baseUrl = env("SUPABASE_URL");
const serviceKey = defaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const publishableKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const getConfig = () => ({ baseUrl, publishableKey });
let authenticator: ReturnType<typeof createAuthenticator> | undefined;
async function authenticate(request: Request) {
  authenticator ||= createAuthenticator(getConfig());
  return authenticator(request);
}
Deno.serve(createHandler({ authenticate, rpc: createRpc({ baseUrl, serviceKey }), getConfig, sendSignup: createSignupSender({ baseUrl, serviceKey, providerToken: env("POSTMARK_SERVER_TOKEN"), from: env("POSTMARK_FROM") || env("POSTMARK_FROM_EMAIL") }) }));
