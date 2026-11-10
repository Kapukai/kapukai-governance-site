import { createHash } from 'node:crypto';

/**
 * Review aid for one manually coordinated commercial order. HubSpot remains the
 * business record. This module does not authenticate evidence, charge, send,
 * persist, authorize private processing, or enforce edits made directly in CRM.
 * Pass metadata and opaque references only; keep underlying records protected.
 */
export const HOURLY_RATE_CENTS = 25_000;
const ref = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const cents = value => Number.isSafeInteger(value) && value >= 0;
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  const canonical = value.length === 20 ? `${value.slice(0, -1)}.000Z` : value;
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === canonical;
};
const scopeFields = ['ref', 'version', 'contentSha256', 'deliverable', 'rateCents', 'hoursCap', 'amountCents', 'currency', 'dueAt', 'termsRef', 'useRightsRef', 'correctionTermsRef', 'cancellationTermsRef', 'inputRouteRef', 'recipientRef'];

/**
 * Binds acceptance to every permitted scope field, including contentSha256: the
 * actual finalized scope document's SHA-256, computed from its bytes by caller.
 */
export function scopeFingerprint(scope = {}) {
  return createHash('sha256').update(JSON.stringify(scopeFields.map(key => [key, scope[key] ?? null]))).digest('hex');
}

export function evaluatePilot(order = {}) {
  const result = (phase, nextAction, blockers = [], extra = {}) => ({
    phase, nextAction, blockers, readyForWork: false, complete: false,
    closed: false, outcome: 'pending', ...extra,
  });
  const require = (list, condition, code) => { if (!condition) list.push(code); };
  if (!order || typeof order !== 'object' || Array.isArray(order)) {
    return result('request', 'Provide one order metadata record.', ['order_record_required']);
  }
  const basics = [];
  require(basics, ref(order.id), 'order_reference_required');
  require(basics, ref(order.ownerRef), 'owner_required');
  require(basics, date(order.nextReviewAt), 'next_review_required');
  require(basics, ['test', 'live'].includes(order.mode), 'mode_required');
  if (basics.length) return result('request', 'Record the owner, order reference and next review date.', basics);

  // A cancellation remains available before agreement or work. It must never be
  // mistaken for fulfilled work; an unresolved refund keeps the record open.
  if (order.cancellation) {
    const c = order.cancellation, p = order.payment ?? {}, r = order.refund ?? {}, errors = [];
    require(errors, ref(c.ref) && ref(c.termsRef), 'cancellation_evidence_required');
    require(errors, ref(c.calculationRef), 'refund_calculation_required');
    require(errors, cents(c.refundDueCents), 'refund_amount_required');
    if (order.payment) {
      require(errors, ref(p.ref) && ref(p.readbackRef) && ['succeeded', 'failed', 'canceled'].includes(p.status), 'payment_disposition_required');
    }
    if (order.acceptance) {
      const s = order.scope ?? {}, a = order.acceptance, fingerprint = scopeFingerprint(s);
      require(errors, hash(s.contentSha256) && ref(a.ref) && a.scopeVersion === s.version && a.scopeSha256 === fingerprint, 'accepted_scope_changed');
      require(errors, c.termsRef === s.cancellationTermsRef, 'cancellation_terms_do_not_match');
      if (order.payment) {
        require(errors, p.scopeSha256 === fingerprint && p.currency === s.currency && p.mode === order.mode && (p.status === 'succeeded' ? p.amountReceivedCents === s.amountCents : p.amountReceivedCents === 0), 'original_payment_does_not_match');
      }
    }
    if (c.refundDueCents > 0) {
      require(errors, ref(p.ref) && ref(p.readbackRef) && p.status === 'succeeded' && cents(p.amountReceivedCents) && p.amountReceivedCents >= c.refundDueCents, 'original_payment_required');
      require(errors, ref(r.ref) && ref(r.readbackRef) && r.status === 'succeeded', 'refund_confirmation_required');
      require(errors, r.paymentRef === p.ref && r.amountCents === c.refundDueCents && p.currency === 'usd' && r.currency === p.currency && r.mode === order.mode && p.mode === order.mode, 'refund_does_not_match');
    }
    return errors.length
      ? result('close', 'Reconcile cancellation and any refund before closing.', errors, { outcome: 'cancellation_pending' })
      : result('close', 'Cancellation recorded; no further work is authorized.', [], { closed: true, outcome: 'canceled' });
  }

  const request = order.request ?? {}, requestErrors = [];
  require(requestErrors, ref(request.ref), 'request_evidence_required');
  require(requestErrors, request.fitConfirmed === true, 'fit_review_required');
  if (requestErrors.length) return result('request', 'Review the request and confirm fit.', requestErrors);

  const s = order.scope ?? {}, a = order.acceptance ?? {}, scopeErrors = [];
  const fingerprint = scopeFingerprint(s);
  require(scopeErrors, Object.keys(s).every(key => scopeFields.includes(key)), 'unsupported_scope_field');
  for (const key of ['ref', 'version', 'termsRef', 'useRightsRef', 'correctionTermsRef', 'cancellationTermsRef', 'inputRouteRef', 'recipientRef']) {
    require(scopeErrors, ref(s[key]), `scope_${key}_required`);
  }
  require(scopeErrors, ['affidavit', 'timeline', 'dossier'].includes(s.deliverable), 'supported_deliverable_required');
  require(scopeErrors, hash(s.contentSha256), 'scope_document_hash_required');
  require(scopeErrors, s.rateCents === HOURLY_RATE_CENTS, 'rate_must_be_250_per_hour');
  const hundredths = Math.round(s.hoursCap * 100);
  require(scopeErrors, Number.isFinite(s.hoursCap) && s.hoursCap > 0 && Number.isSafeInteger(hundredths) && Math.abs(s.hoursCap * 100 - hundredths) < 1e-8, 'bounded_hours_required');
  require(scopeErrors, cents(s.amountCents) && s.amountCents > 0 && s.amountCents === hundredths * (HOURLY_RATE_CENTS / 100), 'quote_must_match_capped_hours');
  require(scopeErrors, s.currency === 'usd', 'usd_currency_required');
  require(scopeErrors, date(s.dueAt), 'scope_due_date_required');
  require(scopeErrors, ref(a.ref) && a.scopeVersion === s.version && a.scopeSha256 === fingerprint, 'exact_scope_acceptance_required');
  if (scopeErrors.length) return result('scope', 'Prepare or obtain acceptance of the exact scope and use terms.', scopeErrors);

  const p = order.payment ?? {}, h = order.handling ?? {}, capacity = order.capacity ?? {}, readyErrors = [];
  require(readyErrors, ref(p.ref) && ref(p.readbackRef) && p.status === 'succeeded', 'payment_readback_required');
  require(readyErrors, p.amountReceivedCents === s.amountCents && p.currency === s.currency && p.mode === order.mode && p.scopeSha256 === fingerprint, 'payment_does_not_match');
  require(readyErrors, capacity.reserved === true && ref(capacity.ref), 'capacity_reservation_required');
  require(readyErrors, h.verified === true && h.routeRef === s.inputRouteRef && ref(h.verificationRef) && ref(h.toolReleaseRef), 'verified_processing_route_required');
  if (readyErrors.length) return result('ready', 'Verify payment, capacity and the permitted input route.', readyErrors);
  const ready = { readyForWork: true, workKey: `${order.id}:${fingerprint}` };

  const artifact = order.artifact ?? {}, correction = order.correction;
  if (correction) {
    const correctionErrors = [];
    require(correctionErrors, ref(correction.ref) && hash(correction.artifactSha256), 'correction_reference_required');
    require(correctionErrors, correction.status === 'resolved', 'correction_pending');
    if (correction.status === 'resolved') {
      require(correctionErrors, ref(correction.resolutionRef) && hash(correction.replacementSha256) && correction.replacementSha256 !== correction.artifactSha256 && correction.replacementSha256 === artifact.sha256, 'corrected_version_required');
    }
    if (correctionErrors.length) return result('work', 'Resolve the reported correction and review a new version.', correctionErrors, ready);
  }

  const artifactErrors = [];
  require(artifactErrors, ref(artifact.ref) && ref(artifact.version) && hash(artifact.sha256), 'versioned_artifact_required');
  require(artifactErrors, artifact.scopeSha256 === fingerprint && ref(artifact.reviewRef) && artifact.released === true, 'reviewed_release_required');
  if (artifactErrors.length) return result('work', 'Produce and review the agreed document.', artifactErrors, ready);

  const d = order.delivery ?? {}, deliveryErrors = [];
  require(deliveryErrors, ref(d.ref) && ref(d.readbackRef) && d.status === 'delivered', 'delivery_confirmation_required');
  require(deliveryErrors, d.artifactSha256 === artifact.sha256 && d.recipientRef === s.recipientRef, 'delivery_does_not_match');
  if (deliveryErrors.length) return result('deliver', 'Deliver the reviewed version to the agreed recipient and verify receipt.', deliveryErrors, ready);

  const response = order.clientResponse ?? {}, closure = order.closure ?? {};
  const accepted = ref(response.ref) && response.ref !== d.ref && response.artifactSha256 === artifact.sha256 && response.kind === 'accepted';
  const closureMatches = ref(closure.ref) && closure.artifactSha256 === artifact.sha256;
  if (closureMatches && closure.kind === 'explained' && ['no_response', 'customer_declined', 'unable_to_complete'].includes(closure.reasonCode)) {
    return result('close', 'Record closed with the stated reason; customer acceptance is not established.', [], { closed: true, outcome: 'closed_without_acceptance', workKey: ready.workKey });
  }
  if (!accepted) return result('close', 'Obtain the customer’s response to this exact version or record an explained closure.', ['current_version_acceptance_required'], ready);
  if (!closureMatches || closure.kind !== 'accepted') return result('close', 'Record acceptance and the final closing reference.', ['closure_evidence_required'], ready);
  return result('close', 'Accepted work is complete; retain the correction route.', [], { complete: true, closed: true, outcome: 'accepted', workKey: ready.workKey });
}
