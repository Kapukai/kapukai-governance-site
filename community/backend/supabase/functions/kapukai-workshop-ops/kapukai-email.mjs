/**
 * Reusable, dependency-free HTML email shell.
 *
 * bodyHtml MUST be application-authored markup. Escape every user-provided value
 * with escapeHtml() before interpolation. Never pass form input as raw bodyHtml.
 * title, preheader, CTA label/URL and footer are escaped by this renderer.
 * CTA URLs must use HTTPS. An omitted CTA produces no link or empty button.
 * Email subjects and Reply-To/From headers are transport settings, not HTML:
 * validate those separately and reject CR/LF in any user-derived header value.
 */

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function safeHttpsUrl(value) {
  if (/[\u0000-\u0020\u007f]/.test(value)) {
    throw new Error('CTA URL must not contain whitespace or control characters.');
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('CTA URL must be an absolute HTTPS URL without credentials.');
  }
  return escapeHtml(url.href);
}

export function renderKapukaiEmail({ preheader, title, bodyHtml, cta, footer, signatureName = 'Christine' }) {
  const action = cta
    ? `<tr><td style="padding:8px 32px 30px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#0a1b2b" style="border:1px solid #0a1b2b;border-radius:2px;mso-padding-alt:15px 24px;">
          <a href="${safeHttpsUrl(cta.url)}" style="display:inline-block;padding:15px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</a>
        </td></tr></table>
      </td></tr>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f3f6f9;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;color:#f3f6f9;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f6f9" style="width:100%;background-color:#f3f6f9;">
    <tr><td align="center" style="padding:28px 12px 36px;">
      <!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:640px;background-color:#ffffff;border:1px solid #dce3e9;">
        <tr><td bgcolor="#0a1b2b" style="padding:28px 32px;background-color:#0a1b2b;border-top:3px solid #bd8d38;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="48" height="48" align="center" valign="middle" style="width:48px;height:48px;border:1px solid #d6b475;color:#d6b475;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:46px;">K</td>
            <td style="padding-left:15px;font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:19px;line-height:24px;letter-spacing:3px;color:#ffffff;font-weight:bold;">KAPUKAI</div>
              <div style="padding-top:3px;font-size:10px;line-height:16px;letter-spacing:2px;color:#cbd6df;">GOVERNANCE LAB</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:34px 32px 20px;font-family:Georgia,'Times New Roman',serif;color:#10253a;">
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:31px;line-height:38px;font-weight:normal;color:#10253a;">${escapeHtml(title)}</h1>
        </td></tr>
        <tr><td style="padding:0 32px 22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#31485c;">
          ${bodyHtml}
        </td></tr>
        ${action}
        <tr><td style="padding:24px 32px;border-top:1px solid #dce3e9;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#10253a;">
          <strong style="font-weight:bold;">${escapeHtml(signatureName)}</strong><br>
          <span style="color:#526272;">Kapukai Governance Lab</span><br>
          <a href="mailto:architect@kapukai.org" style="color:#73511b;text-decoration:underline;">architect@kapukai.org</a>
        </td></tr>
        <tr><td bgcolor="#f8fafc" style="padding:19px 32px;background-color:#f8fafc;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#526272;">
          ${escapeHtml(footer || 'Kapukai Governance Lab · Evidence, accountability, and correction.')}<br>
          <a href="https://kapukai.org" style="color:#73511b;text-decoration:underline;">kapukai.org</a>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

export function brandMessage(message) {
  const text = String(message.TextBody || '');
  const bodyHtml = text.split(/\n\s*\n/).map(part => '<p style="margin:0 0 20px;overflow-wrap:anywhere;word-break:break-word;">' +
    part.split(/(https:\/\/[^\s<>"]+)/g).map((segment, index) => {
      if (index % 2 === 0) return escapeHtml(segment).replaceAll('\n', '<br>');
      try { return '<a href="' + safeHttpsUrl(segment) + '" style="color:#73511b;text-decoration:underline;overflow-wrap:anywhere;word-break:break-word;">' + escapeHtml(segment) + '</a>'; }
      catch { return escapeHtml(segment); }
    }).join('') + '</p>').join('');
  return { ...message, HtmlBody: renderKapukaiEmail({
    title: message.Subject || 'Kapukai Governance Lab',
    preheader: 'Kapukai Governance Lab',
    bodyHtml,
    signatureName: 'Kapukai',
    footer: 'Truth as a public utility.'
  }) };
}
