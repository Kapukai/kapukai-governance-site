import { monthlyTick } from "./monthly.mjs";
import { brandMessage } from "./kapukai-email.mjs";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") || "";
const WEBHOOK_URL = `${PROJECT_URL}/functions/v1/kapukai-postmark-webhook`;

type Config = {
  mode: "hold" | "test" | "live";
  worker_token_hash: string;
  broadcast_stream: string;
  owner_test_email: string;
  batch_size: number;
  postmark_ready_at: string | null;
};

type Job = {
  job_id: string;
  campaign_id: string;
  registry_id: string;
  email: string;
  full_name: string | null;
  interests: string[];
  campaign_key: string;
  subject: string;
  text_body: string;
  html_body: string;
  broadcast_stream: string;
  is_test: boolean;
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function getServiceKey() {
  const secretJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  const legacySecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  try {
    return secretJson ? JSON.parse(secretJson).default : legacySecret;
  } catch {
    return legacySecret;
  }
}

async function rest(path: string, serviceKey: string, init: RequestInit = {}) {
  if (!PROJECT_URL) throw new Error("Missing project URL");
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${PROJECT_URL}/rest/v1/${path}`, { ...init, headers });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

async function readConfig(serviceKey: string): Promise<Config> {
  const result = await rest(
    "kapukai_interest_lifecycle_config?select=mode,worker_token_hash,broadcast_stream,owner_test_email,batch_size,postmark_ready_at&id=eq.1",
    serviceKey,
    { method: "GET" }
  );
  if (!result.ok) throw new Error(`CONFIG_READ_${result.status}`);
  const rows = await result.json();
  if (!Array.isArray(rows) || !rows[0]) throw new Error("CONFIG_MISSING");
  return rows[0] as Config;
}

async function authenticate(req: Request, config: Config) {
  const received = req.headers.get("x-kapukai-worker-token")?.trim() || "";
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  return constantTimeEqual(await sha256(received), config.worker_token_hash);
}

async function postmark(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("X-Postmark-Server-Token", token);
  return fetch(`https://api.postmarkapp.com${path}`, { ...init, headers });
}

async function ensurePostmark(config: Config, serviceKey: string) {
  if (config.postmark_ready_at) return { ready: true, changed: false };

  const token = Deno.env.get("POSTMARK_SERVER_TOKEN") || "";
  const webhookSecret = Deno.env.get("POSTMARK_WEBHOOK_SECRET") || "";
  if (!token || !webhookSecret || !WEBHOOK_URL.startsWith("https://")) {
    throw new Error("POSTMARK_INFRASTRUCTURE_SECRETS_MISSING");
  }

  const streamsResponse = await postmark("/message-streams?MessageStreamType=all&IncludeArchivedStreams=false", token);
  if (!streamsResponse.ok) throw new Error(`POSTMARK_STREAM_LIST_${streamsResponse.status}`);
  const streamsPayload = await streamsResponse.json();
  const streams = Array.isArray(streamsPayload.MessageStreams) ? streamsPayload.MessageStreams : [];
  let stream = streams.find((item: Record<string, unknown>) => item.ID === config.broadcast_stream);

  if (!stream) {
    const createResponse = await postmark("/message-streams", token, {
      method: "POST",
      body: JSON.stringify({
        ID: config.broadcast_stream,
        Name: "Kapukai Signal Briefs",
        Description: "Consent-governed Kapukai onboarding and public-interest broadcasts.",
        MessageStreamType: "Broadcasts",
        SubscriptionManagementConfiguration: { UnsubscribeHandlingType: "Postmark" }
      })
    });
    if (!createResponse.ok) throw new Error(`POSTMARK_STREAM_CREATE_${createResponse.status}`);
    stream = await createResponse.json();
  }

  if (stream.MessageStreamType !== "Broadcasts") {
    throw new Error("POSTMARK_STREAM_IS_NOT_BROADCAST");
  }

  const hooksResponse = await postmark(`/webhooks?MessageStream=${encodeURIComponent(config.broadcast_stream)}`, token);
  if (!hooksResponse.ok) throw new Error(`POSTMARK_WEBHOOK_LIST_${hooksResponse.status}`);
  const hooksPayload = await hooksResponse.json();
  const hooks = Array.isArray(hooksPayload.Webhooks) ? hooksPayload.Webhooks : [];
  const existing = hooks.find((item: Record<string, unknown>) => item.Url === WEBHOOK_URL);
  const webhookBody: Record<string, unknown> = {
    Url: WEBHOOK_URL,
    Verify: true,
    HttpHeaders: [{ Name: "X-Kapukai-Webhook-Token", Value: webhookSecret }],
    Triggers: {
      Open: { Enabled: false, PostFirstOpenOnly: false },
      Click: { Enabled: false },
      Delivery: { Enabled: true },
      Bounce: { Enabled: true, IncludeContent: false },
      SpamComplaint: { Enabled: true, IncludeContent: false },
      SubscriptionChange: { Enabled: true }
    }
  };

  let webhookResponse: Response;
  if (existing?.ID) {
    webhookResponse = await postmark(`/webhooks/${existing.ID}`, token, {
      method: "PUT",
      body: JSON.stringify(webhookBody)
    });
  } else {
    webhookBody.MessageStream = config.broadcast_stream;
    webhookResponse = await postmark("/webhooks", token, {
      method: "POST",
      body: JSON.stringify(webhookBody)
    });
  }
  if (!webhookResponse.ok) throw new Error(`POSTMARK_WEBHOOK_WRITE_${webhookResponse.status}`);
  // With Verify=true Postmark returns a non-2xx response when any enabled
  // webhook event fails verification. A successful response is the gate.
  await webhookResponse.json().catch(() => ({}));

  const update = await rest("kapukai_interest_lifecycle_config?id=eq.1", serviceKey, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ postmark_ready_at: new Date().toISOString(), last_worker_result: "POSTMARK_READY" })
  });
  if (!update.ok) throw new Error(`CONFIG_UPDATE_${update.status}`);
  return { ready: true, changed: true };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const interestLabels: Record<string, string> = {
  updates: "Updates",
  research_participant: "Research participant",
  institutional_pilot: "Institutional pilot",
  expert_contributor: "Expert contributor",
  funder_partner: "Funder or partner"
};

function render(job: Job, postalAddress: string) {
  const firstName = job.full_name?.trim().split(/\s+/)[0] || "there";
  const interests = job.interests.map((value) => interestLabels[value] || value).join(", ");
  const text = job.text_body
    .replaceAll("[[first_name]]", firstName)
    .replaceAll("[[interests]]", interests);
  const html = job.html_body
    .replaceAll("[[first_name]]", escapeHtml(firstName))
    .replaceAll("[[interests]]", escapeHtml(interests));
  const testNotice = job.is_test ? "\n\nOWNER-ONLY LIFECYCLE TEST — NOT A PUBLIC CAMPAIGN" : "";
  const footerText = `\n\nKapukai Governance Lab\n${postalAddress}${testNotice}`;
  const footerHtml = `<hr style="margin:32px 0;border:0;border-top:1px solid #c8cbc4"><p style="color:#66757a;font-size:11px;line-height:1.6">Kapukai Governance Lab<br>${escapeHtml(postalAddress)}${job.is_test ? "<br><strong>OWNER-ONLY LIFECYCLE TEST — NOT A PUBLIC CAMPAIGN</strong>" : ""}</p>`;
  const htmlWithFooter = html.includes("</body>")
    ? html.replace("</body>", `${footerHtml}</body>`)
    : `${html}${footerHtml}`;
  return {
    subject: `${job.is_test ? "[TEST] " : ""}${job.subject}`,
    textBody: `${text}${footerText}`,
    htmlBody: htmlWithFooter
  };
}

async function completeJob(
  serviceKey: string,
  job: Job,
  result: "accepted" | "failed",
  providerMessageId: string | null,
  errorCode: string | null
) {
  const complete = await rest("rpc/kapukai_complete_interest_lifecycle_job", serviceKey, {
    method: "POST",
    body: JSON.stringify({
      p_job_id: job.job_id,
      p_result: result,
      p_provider_message_id: providerMessageId,
      p_error_code: errorCode
    })
  });
  if (!complete.ok) throw new Error(`JOB_COMPLETE_${complete.status}`);

  const event = await rest("kapukai_interest_delivery_events", serviceKey, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      registry_id: job.registry_id,
      campaign_job_id: job.job_id,
      channel: "email",
      provider: "postmark",
      message_type: "lifecycle_broadcast",
      delivery_status: result,
      provider_message_id: providerMessageId,
      error_code: errorCode
    })
  });
  if (!event.ok) console.error("Delivery event write failed", event.status, job.job_id);
}

async function runTick(config: Config, serviceKey: string) {
  await ensurePostmark(config, serviceKey);
  const postalAddress = (Deno.env.get("KAPUKAI_POSTAL_ADDRESS") || "").trim();
  if ((config.mode === "test" || config.mode === "live") && !postalAddress) {
    throw new Error("PUBLIC_POSTAL_ADDRESS_REQUIRED_FOR_TEST_OR_LIVE");
  }

  const claim = await rest("rpc/kapukai_claim_interest_lifecycle_jobs", serviceKey, {
    method: "POST",
    body: JSON.stringify({ p_limit: config.batch_size })
  });
  if (!claim.ok) throw new Error(`JOB_CLAIM_${claim.status}`);
  const jobs = (await claim.json()) as Job[];
  if (!jobs.length) {
    await rest("kapukai_interest_lifecycle_config?id=eq.1", serviceKey, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        last_worker_at: new Date().toISOString(),
        last_worker_result: config.mode === "hold" ? "HOLD_NO_SEND" : "NO_DUE_JOBS"
      })
    });
    return { claimed: 0, accepted: 0, failed: 0 };
  }

  const postmarkToken = Deno.env.get("POSTMARK_SERVER_TOKEN") || "";
  const from = Deno.env.get("POSTMARK_FROM_EMAIL") || "";
  const replyTo = Deno.env.get("SIGNUP_NOTIFY_TO") || "architect@kapukai.org";
  if (!postmarkToken || !from) throw new Error("POSTMARK_SEND_SECRETS_MISSING");

  let accepted = 0;
  let failed = 0;
  for (const job of jobs) {
    if (config.mode === "test" && (!job.is_test || job.email !== config.owner_test_email)) {
      await completeJob(serviceKey, job, "failed", null, "TEST_RECIPIENT_GATE");
      failed += 1;
      continue;
    }

    const rendered = render(job, postalAddress || "HOLD mode — no public footer rendered");
    try {
      const send = await postmark("/email", postmarkToken, {
        method: "POST",
        body: JSON.stringify({
          From: from,
          To: job.email,
          ReplyTo: replyTo,
          Subject: rendered.subject,
          TextBody: rendered.textBody,
          HtmlBody: brandMessage({ Subject: rendered.subject, TextBody: rendered.textBody }).HtmlBody,
          Tag: `kapukai-${job.campaign_key}`.slice(0, 1000),
          TrackOpens: false,
          TrackLinks: "None",
          MessageStream: job.broadcast_stream,
          Metadata: {
            registry_id: job.registry_id,
            campaign_job_id: job.job_id,
            campaign_key: job.campaign_key,
            message_type: "lifecycle_broadcast",
            is_test: String(job.is_test)
          }
        })
      });
      const payload = await send.json().catch(() => ({}));
      if (!send.ok || payload.ErrorCode !== 0 || !payload.MessageID) {
        const code = `POSTMARK_${payload.ErrorCode ?? send.status}`;
        await completeJob(serviceKey, job, "failed", null, code);
        failed += 1;
      } else {
        await completeJob(serviceKey, job, "accepted", payload.MessageID, null);
        accepted += 1;
      }
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 160) : "POSTMARK_REQUEST_FAILED";
      await completeJob(serviceKey, job, "failed", null, code);
      failed += 1;
    }
  }

  await rest("kapukai_interest_lifecycle_config?id=eq.1", serviceKey, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      last_worker_at: new Date().toISOString(),
      last_worker_result: `CLAIMED_${jobs.length}_ACCEPTED_${accepted}_FAILED_${failed}`
    })
  });
  return { claimed: jobs.length, accepted, failed };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response(405, { ok: false, error: "Method not allowed." });
  const length = Number(req.headers.get("content-length") || "0");
  if (length > 4000) return response(413, { ok: false, error: "Request too large." });

  const serviceKey = getServiceKey();
  if (!serviceKey) return response(503, { ok: false, error: "Worker storage is not configured." });

  try {
    const config = await readConfig(serviceKey);
    if (!(await authenticate(req, config))) return response(401, { ok: false, error: "Unauthorized." });
    const body = await req.json().catch(() => ({}));
    const action = body?.action === "ensure" ? "ensure" : "tick";
    if (action === "ensure") {
      const postmarkResult = await ensurePostmark(config, serviceKey);
      return response(200, { ok: true, mode: config.mode, postmark: postmarkResult });
    }
    const result = await runTick(config, serviceKey);
    const monthly=await monthlyTick({
      config, sender:Deno.env.get("POSTMARK_FROM_EMAIL"), postalAddress:Deno.env.get("KAPUKAI_POSTAL_ADDRESS")?.trim(),
      replyTo:Deno.env.get("SIGNUP_NOTIFY_TO")||"architect@kapukai.org",
      provider:(path:string,init:RequestInit={})=>postmark(path,Deno.env.get("POSTMARK_SERVER_TOKEN")||"",init),
      rpc:async(name:string,body:Record<string,unknown>)=>{
        const r=await rest("rpc/kapukai_monthly_"+name,serviceKey,{method:"POST",body:JSON.stringify(body)});
        if(!r.ok)throw Error("MONTHLY_RPC_"+name+"_"+r.status);
        return r.status===204?null:r.text().then(v=>v?JSON.parse(v):null);
      }
    });
    return response(200, { ok: true, mode: config.mode, ...result, monthly });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WORKER_FAILED";
    console.error("Kapukai lifecycle worker failed", message);
    return response(503, { ok: false, error: message });
  }
});

