import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePilot, scopeFingerprint } from '../commercial-pilot/workflow.mjs';

test('cancellation waits for uncertain payment disposition and permits confirmed failed payment', () => {
  const o = order();
  o.cancellation = { ref: 'cancel:1', termsRef: 'cancel-terms:1', calculationRef: 'calculation:1', refundDueCents: 0 };
  o.payment.status = 'processing';
  assert.equal(evaluatePilot(o).closed, false);
  o.payment.status = 'failed';
  o.payment.amountReceivedCents = 0;
  assert.equal(evaluatePilot(o).closed, true);
  assert.equal(evaluatePilot(o).complete, false);
});
import { createFictionalPilot as order, EXAMPLE_OUTPUT_SHA256 as outputHash } from '../commercial-pilot/example.mjs';

test('six phases require distinct evidence before accepted closure', () => {
  const full = order();
  assert.equal(evaluatePilot(full).complete, true);
  const o = order();
  delete o.closure;
  assert.equal(evaluatePilot(o).phase, 'close');
  assert.equal(evaluatePilot(o).complete, false);
  delete o.delivery;
  assert.equal(evaluatePilot(o).phase, 'deliver');
  delete o.artifact;
  assert.equal(evaluatePilot(o).phase, 'work');
  assert.equal(evaluatePilot(o).readyForWork, true);
  delete o.payment;
  assert.equal(evaluatePilot(o).phase, 'ready');
  delete o.acceptance;
  assert.equal(evaluatePilot(o).phase, 'scope');
  delete o.request;
  assert.equal(evaluatePilot(o).phase, 'request');
});

test('scope content changes invalidate acceptance even when version label is reused', () => {
  for (const [key, value] of [['hoursCap', 3], ['recipientRef', 'recipient:other'], ['useRightsRef', 'rights:2'], ['dueAt', '2026-11-02T17:00:00Z']]) {
    const o = order(); o.scope[key] = value;
    assert.ok(evaluatePilot(o).blockers.includes('exact_scope_acceptance_required'));
    assert.equal(evaluatePilot(o).readyForWork, false);
  }
});

test('scope references forbid raw URLs and unrecognized narrative fields', () => {
  const o = order(); o.scope.inputRouteRef = 'https://private.example/token';
  assert.ok(evaluatePilot(o).blockers.includes('scope_inputRouteRef_required'));
  o.scope.narrative = 'private case text';
  assert.ok(evaluatePilot(o).blockers.includes('unsupported_scope_field'));
});

test('zero price and uncapped or discounted rates cannot masquerade as paid pilot', () => {
  for (const mutation of [o => o.scope.amountCents = 0, o => o.scope.hoursCap = Infinity, o => o.scope.rateCents = 20000]) {
    const o = order(); mutation(o); o.acceptance.scopeSha256 = scopeFingerprint(o.scope);
    assert.equal(evaluatePilot(o).phase, 'scope');
    assert.equal(evaluatePilot(o).readyForWork, false);
  }
});

test('payment requires readback, exact amount, currency, scope and matching environment', () => {
  for (const [key, value] of [['status', 'processing'], ['readbackRef', ''], ['amountReceivedCents', 49999], ['currency', 'eur'], ['mode', 'live'], ['scopeSha256', 'b'.repeat(64)]]) {
    const o = order(); o.payment[key] = value;
    assert.equal(evaluatePilot(o).phase, 'ready', key);
    assert.equal(evaluatePilot(o).readyForWork, false, key);
  }
});

test('capacity and actual processing release remain required despite payment', () => {
  const o = order(); o.capacity.reserved = false; o.handling.toolReleaseRef = '';
  assert.deepEqual(evaluatePilot(o).blockers, ['capacity_reservation_required', 'verified_processing_route_required']);
});

test('repeated evaluations are deterministic, mutation-free and identify one work unit', () => {
  const o = order(); delete o.artifact;
  const before = structuredClone(o);
  const first = evaluatePilot(o);
  for (let n = 0; n < 3; n++) assert.deepEqual(evaluatePilot(o), first);
  assert.deepEqual(o, before);
  assert.equal(first.workKey, `${o.id}:${scopeFingerprint(o.scope)}`);
});

test('delivery and customer receipt cannot substitute for acceptance', () => {
  const o = order(); o.clientResponse.kind = 'received';
  assert.equal(evaluatePilot(o).complete, false);
  o.clientResponse.kind = 'accepted'; o.clientResponse.ref = o.delivery.ref;
  assert.equal(evaluatePilot(o).complete, false);
  o.delivery.recipientRef = 'recipient:other';
  assert.equal(evaluatePilot(o).phase, 'deliver');
});

test('correction reopens completed work and requires a new reviewed version', () => {
  const o = order();
  o.correction = { ref: 'correction:1', artifactSha256: outputHash, status: 'open' };
  assert.equal(evaluatePilot(o).phase, 'work');
  assert.equal(evaluatePilot(o).complete, false);
  o.correction.status = 'resolved'; o.correction.resolutionRef = 'resolution:1'; o.correction.replacementSha256 = outputHash;
  assert.ok(evaluatePilot(o).blockers.includes('corrected_version_required'));
  const replacement = 'b'.repeat(64);
  o.correction.replacementSha256 = replacement;
  o.artifact = { ...o.artifact, version: '2', ref: 'artifact:2', sha256: replacement, reviewRef: 'review:2' };
  assert.equal(evaluatePilot(o).phase, 'deliver');
  o.delivery = { ...o.delivery, ref: 'delivery:2', artifactSha256: replacement };
  assert.ok(evaluatePilot(o).blockers.includes('current_version_acceptance_required'));
  o.clientResponse = { ...o.clientResponse, ref: 'response:2', artifactSha256: replacement };
  assert.ok(evaluatePilot(o).blockers.includes('closure_evidence_required'));
  o.closure = { ...o.closure, ref: 'closure:2', artifactSha256: replacement };
  assert.equal(evaluatePilot(o).complete, true);
});

test('cancellation with pending, mismatched or cross-environment refund stays open', () => {
  const o = order();
  o.cancellation = { ref: 'cancel:1', termsRef: 'cancel-terms:1', calculationRef: 'refund-calculation:1', refundDueCents: 50000 };
  o.refund = { ref: 're_fictional', readbackRef: 'refund-readback:1', status: 'pending', paymentRef: 'pi_fictional', amountCents: 50000, currency: 'usd', mode: 'test' };
  assert.equal(evaluatePilot(o).closed, false);
  o.refund.status = 'succeeded'; o.refund.amountCents = 1;
  assert.equal(evaluatePilot(o).closed, false);
  o.refund.amountCents = 50000; o.refund.mode = 'live';
  assert.equal(evaluatePilot(o).closed, false);
  o.refund.mode = 'test';
  assert.equal(evaluatePilot(o).closed, true);
  assert.equal(evaluatePilot(o).complete, false);
  assert.equal(evaluatePilot(o).outcome, 'canceled');
});

test('a documented no-response closure does not invent customer acceptance', () => {
  const o = order(); delete o.clientResponse;
  o.closure.kind = 'explained'; o.closure.reasonCode = 'no_response';
  const result = evaluatePilot(o);
  assert.equal(result.closed, true);
  assert.equal(result.complete, false);
  assert.equal(result.outcome, 'closed_without_acceptance');
});

test('missing identity, owner and next action review date fail before readiness', () => {
  const o = order(); delete o.ownerRef; delete o.nextReviewAt;
  assert.deepEqual(evaluatePilot(o).blockers, ['owner_required', 'next_review_required']);
  assert.equal(evaluatePilot(o).readyForWork, false);
});

test('invalid top-level records fail with a review action instead of throwing', () => {
  for (const input of [null, [], 'text']) {
    assert.deepEqual(evaluatePilot(input).blockers, ['order_record_required']);
  }
});

test('acceptance binds the finalized document bytes even when all reference labels stay unchanged', () => {
  const o = order();
  delete o.scope.contentSha256;
  assert.ok(evaluatePilot(o).blockers.includes('scope_document_hash_required'));
  o.scope.contentSha256 = 'd'.repeat(64);
  assert.ok(evaluatePilot(o).blockers.includes('exact_scope_acceptance_required'));
});

test('invalid calendar dates cannot roll forward silently', () => {
  const o = order();
  o.nextReviewAt = '2026-02-30T17:00:00Z';
  assert.ok(evaluatePilot(o).blockers.includes('next_review_required'));
  o.nextReviewAt = '2026-10-22T17:00:00.000Z';
  o.scope.dueAt = '2026-02-29T17:00:00.000Z';
  o.acceptance.scopeSha256 = scopeFingerprint(o.scope);
  assert.ok(evaluatePilot(o).blockers.includes('scope_due_date_required'));
});

test('hundredth-hour caps use integer cents without binary rounding rejection', () => {
  const o = order();
  o.scope.hoursCap = 0.29; o.scope.amountCents = 7250;
  const fingerprint = scopeFingerprint(o.scope);
  o.acceptance.scopeSha256 = fingerprint;
  o.payment.scopeSha256 = fingerprint; o.payment.amountReceivedCents = 7250;
  delete o.artifact;
  assert.equal(evaluatePilot(o).readyForWork, true);
  o.scope.hoursCap = 0.291; o.acceptance.scopeSha256 = scopeFingerprint(o.scope);
  assert.ok(evaluatePilot(o).blockers.includes('bounded_hours_required'));
});

test('zero-refund cancellation needs a calculation record and the accepted cancellation terms', () => {
  const o = order();
  o.cancellation = { ref: 'cancel:1', termsRef: 'cancel-terms:1', refundDueCents: 0 };
  assert.ok(evaluatePilot(o).blockers.includes('refund_calculation_required'));
  o.cancellation.calculationRef = 'refund-calculation:1';
  assert.equal(evaluatePilot(o).closed, true);
  o.cancellation.termsRef = 'other-terms:1';
  assert.ok(evaluatePilot(o).blockers.includes('cancellation_terms_do_not_match'));
  o.cancellation.termsRef = 'cancel-terms:1';
  o.scope.contentSha256 = 'd'.repeat(64);
  assert.ok(evaluatePilot(o).blockers.includes('accepted_scope_changed'));
});

test('cancellation cannot reconcile a different scope payment or currency', () => {
  const o = order();
  o.cancellation = { ref: 'cancel:1', termsRef: 'cancel-terms:1', calculationRef: 'refund-calculation:1', refundDueCents: 50000 };
  o.refund = { ref: 're_fictional', readbackRef: 'refund-readback:1', status: 'succeeded', paymentRef: 'pi_fictional', amountCents: 50000, currency: 'usd', mode: 'test' };
  o.payment.scopeSha256 = 'd'.repeat(64);
  assert.ok(evaluatePilot(o).blockers.includes('original_payment_does_not_match'));
  o.payment.scopeSha256 = scopeFingerprint(o.scope);
  o.payment.currency = 'eur'; o.refund.currency = 'eur';
  assert.ok(evaluatePilot(o).blockers.includes('original_payment_does_not_match'));
  assert.ok(evaluatePilot(o).blockers.includes('refund_does_not_match'));
});
