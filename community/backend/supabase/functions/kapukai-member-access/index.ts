import { createAuthenticator } from "../kapukai-members/auth.mjs";
import { createHandler, createRpc, createRateFingerprint, createConfirmationSender, createInvitationSender } from "./handler.mjs";

const env = (name: string) => Deno.env.get(name) || "";
function defaultKey(name: string, fallback: string) {
  try { const value = JSON.parse(env(name) || "{}").default; return typeof value === "string" && value ? value : env(fallback); }
  catch { return env(fallback); }
}
const baseUrl = env("SUPABASE_URL");
const serviceKey = defaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const publishableKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
let authenticator: ReturnType<typeof createAuthenticator> | undefined;
async function authenticate(request: Request) {
  authenticator ||= createAuthenticator({ baseUrl, publishableKey });
  return authenticator(request);
}
const mailConfig = { providerToken: env("POSTMARK_SERVER_TOKEN"), from: env("POSTMARK_FROM") || env("POSTMARK_FROM_EMAIL") };
Deno.serve(createHandler({ authenticate, rpc: createRpc({ baseUrl, serviceKey }), rateFingerprint: createRateFingerprint({ baseUrl, serviceKey }), sendConfirmation: createConfirmationSender(mailConfig), sendInvitation: createInvitationSender(mailConfig) }));
