import { MemberError, serviceHeaders, boundedJson, UUID_RE } from "./auth.mjs";

const unavailable = () => new MemberError("TEMPORARILY_UNAVAILABLE", 503);
const uuid = value => typeof value === "string" && UUID_RE.test(value);
const mailbox = value => typeof value === "string" && value.length <= 254 && !/[\u0000-\u0020\u007f<>,;:"\\()\[\]]/.test(value) && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

// Extracted from the existing createSignupSender. Both callers use the same
// admin-generate-link and Postmark transport; only fixed server purposes differ.
function signupMessage(code) {
  const subject = "Verify your Kapukai member account";
  const textBody = `Your Kapukai member account verification code is:\n\n${code}\n\nReturn to the Kapukai member page where you requested this code and enter it there. Do not share this code or your invitation. Verification confirms your email; community access still requires your valid invitation.\n\nIf you did not request this, you can ignore this email. For help, contact architect@kapukai.org.\n\nKapukai Governance Lab\nTruth as a public utility.`;
  // The only dynamic HTML value is a validated numeric code. No remote images,
  // hidden tracking, action link, invitation token, or password enters the email.
  const htmlBody = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head><body style="margin:0;padding:24px;background:#f7f5ee;color:#10253a;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="max-width:600px;margin:auto;background:#fff;border:1px solid #dedbd0;width:100%"><tr><td style="padding:28px;background:#10253a;border-top:3px solid #bd8d38;color:#fff;letter-spacing:3px;font-weight:bold">KAPUKAI<br><span style="font-size:11px;letter-spacing:2px">GOVERNANCE LAB</span></td></tr><tr><td style="padding:32px"><h1 style="font:normal 30px Georgia,serif;margin:0 0 24px">Verify your member account</h1><p style="line-height:1.6">Enter this code on the Kapukai member page where you requested it.</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#0f675f">${code}</p><p style="line-height:1.6">Keep this code and your invitation private. Verification confirms your email; community access still requires your valid invitation.</p><p style="line-height:1.6">If you did not request this, you can ignore this email. For help, contact <a href="mailto:architect@kapukai.org" style="color:#0f675f">architect@kapukai.org</a>.</p></td></tr><tr><td style="padding:24px 32px;border-top:1px solid #dedbd0;font-size:13px;line-height:1.6">Kapukai Governance Lab<br>Truth as a public utility.</td></tr></table></body></html>`;

  return { subject, textBody, htmlBody, tag: "kapukai-member-verification" };
}

function recoveryMessage(code) {
  const subject = "Reset your Kapukai account password";
  const textBody = `Your password recovery code is:\n\n${code}\n\nReturn to the Human Liberty Ledger page where you requested this code and enter it there. Never share this code. Changing this password affects your shared Kapukai account, including other services using that account.\n\nIf you did not request a password reset, ignore this email. Your password has not changed. For help, contact architect@kapukai.org.\n\nKapukai Governance Lab`;
  const htmlBody = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head><body style="margin:0;padding:24px;background:#f7f5ee;color:#10253a;font-family:Arial,Helvetica,sans-serif"><main style="max-width:600px;margin:auto;background:#fff;padding:32px;border-top:3px solid #bd8d38"><h1 style="font:normal 30px Georgia,serif">Reset your account password</h1><p>Enter this code on the Human Liberty Ledger page where you requested it.</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#0f675f">${code}</p><p>Never share this code. Changing this password affects your shared Kapukai account, including other services using that account.</p><p>If you did not request this, ignore this email. Your password has not changed.</p><p>For help, contact <a href="mailto:architect@kapukai.org">architect@kapukai.org</a>.</p><p>Kapukai Governance Lab</p></main></body></html>`;
  return { subject, textBody, htmlBody, tag: "kapukai-auth-recovery" };
}

function createAuthCodeSender({ baseUrl, serviceKey, providerToken, from, fetchImpl = fetch }, purpose, audience = "member") {
  const configured = () => {
    if (typeof providerToken !== "string" || !providerToken || typeof from !== "string" || !from || from.length > 320 || /[\r\n]/.test(from)) throw new MemberError("SERVICE_NOT_CONFIGURED", 503);
    return serviceHeaders({ baseUrl, serviceKey });
  };
  const send = async ({ email: address, password }) => {
    const headers = configured();
    if (!mailbox(address)) throw new MemberError("INVALID_REQUEST", 400);
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/auth/v1/admin/generate_link`, {
        method: "POST", headers,
        body: JSON.stringify({ type: purpose, email: address, ...(purpose === "signup" ? { password } : {}) }),
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
      });
    } catch { return { state: "unknown", providerMessageId: null }; }
    if (!response.ok) {
      await response.body?.cancel();
      // A nonexistent recovery account does not create an Auth user or send mail.
      if ((purpose === "signup" ? [400, 422] : [400, 404, 422]).includes(response.status)) return { state: "not_created", providerMessageId: null };
      return { state: "unknown", providerMessageId: null };
    }
    let generated;
    try { generated = await boundedJson(response, 65536, "TEMPORARILY_UNAVAILABLE"); }
    catch { return { state: "unknown", providerMessageId: null }; }
    const code = generated?.email_otp;
    if (typeof code !== "string" || !/^\d{6,10}$/.test(code) || generated.verification_type !== purpose || (generated.email && (typeof generated.email !== "string" || generated.email.toLowerCase() !== address.toLowerCase()))) return { state: "unknown", providerMessageId: null };
    // Only a validated numeric OTP enters the message. Generated links, passwords
    // and provider user metadata never enter HTML, responses, logs or receipts.
    const message = purpose === "signup" ? (audience === "unified" ? unifiedSignupMessage(code) : signupMessage(code)) : recoveryMessage(code);
    try {
      response = await fetchImpl("https://api.postmarkapp.com/email", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Postmark-Server-Token": providerToken },
        body: JSON.stringify({ From: from, To: address, ReplyTo: "architect@kapukai.org", Subject: message.subject, TextBody: message.textBody, HtmlBody: message.htmlBody, MessageStream: "outbound", Tag: message.tag, TrackOpens: false, TrackLinks: "None" }),
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
      });
    } catch { return { state: "unknown", providerMessageId: null }; }
    let receipt;
    try { receipt = await boundedJson(response, 65536, "TEMPORARILY_UNAVAILABLE"); }
    catch { return { state: "unknown", providerMessageId: null }; }
    if (response.status === 200 && receipt?.ErrorCode === 0 && uuid(receipt.MessageID) && (receipt.To === undefined || receipt.To === address)) return { state: "accepted", providerMessageId: receipt.MessageID };
    return { state: response.status >= 400 && response.status < 500 && Number.isSafeInteger(receipt?.ErrorCode) && receipt.ErrorCode !== 0 ? "failed" : "unknown", providerMessageId: null };
  };
  return Object.assign(send, { configured });
}

export function createSignupSender(config) {
  const deliver = createAuthCodeSender(config, "signup");
  const send = async payload => {
    const receipt = await deliver(payload);
    if (receipt.state === "not_created") return { state: "not_created" };
    if (receipt.state !== "accepted") throw unavailable();
    return { state: "accepted" };
  };
  return Object.assign(send, { configured: deliver.configured });
}

export function createRecoverySender(config) {
  const deliver = createAuthCodeSender(config, "recovery");
  const send = async payload => {
    const receipt = await deliver(payload);
    return receipt.state === "not_created" ? { state: "failed", providerMessageId: null } : receipt;
  };
  return Object.assign(send, { configured: deliver.configured });
}


function unifiedSignupMessage(code) {
  return { subject: 'Confirm your Unified account',
    textBody: `Your Unified confirmation code is:\n\n${code}\n\nReturn to https://www.humanlibertyledger.org/unified and choose Enter confirmation code. This confirms your shared Kapukai account email. It does not grant organization authority or community membership. Never share this code. If you did not request this, ignore this email.`,
    htmlBody: `<h1>Confirm your Unified account</h1><p>Enter this code on Unified:</p><p style="font-size:32px;letter-spacing:6px">${code}</p><p>This confirms your shared Kapukai account email. Organization permissions and publication review remain separate. Never share this code. Ignore this email if you did not request it.</p>`,
    tag: 'unified-account-confirmation' };
}
export function createUnifiedSignupSender(config) {
  const deliver = createAuthCodeSender(config, 'signup', 'unified');
  const send = async payload => {
    const receipt = await deliver(payload);
    return receipt.state === 'not_created' ? { state: 'failed', providerMessageId: null } : receipt;
  };
  return Object.assign(send, { configured: deliver.configured });
}
