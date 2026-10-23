import { createHash } from 'node:crypto';
import { scopeFingerprint } from './workflow.mjs';

// Entirely fictional metadata. These references do not establish a real
// agreement, payment, processing release, delivery or customer acceptance.
export const EXAMPLE_SCOPE_TEXT = 'Fictional timeline exercise. Version 1. Two capped engineering hours at USD 250/hour. USD 500 total. Terms, use rights, correction and cancellation references are fictional test inputs.';
export const EXAMPLE_OUTPUT_SHA256 = 'a'.repeat(64);

export function createFictionalPilot() {
  const scope = {
    ref: 'scope:fictional:1', version: '1',
    contentSha256: createHash('sha256').update(EXAMPLE_SCOPE_TEXT).digest('hex'),
    deliverable: 'timeline', rateCents: 25000, hoursCap: 2, amountCents: 50000, currency: 'usd',
    dueAt: '2026-11-01T17:00:00Z', termsRef: 'terms:1', useRightsRef: 'rights:1',
    correctionTermsRef: 'correction-terms:1', cancellationTermsRef: 'cancel-terms:1',
    inputRouteRef: 'route:fictional', recipientRef: 'recipient:fictional',
  };
  const fingerprint = scopeFingerprint(scope);
  return {
    id: 'pilot:fictional', mode: 'test', ownerRef: 'owner:fictional', nextReviewAt: '2026-10-22T17:00:00Z',
    request: { ref: 'request:1', fitConfirmed: true }, scope,
    acceptance: { ref: 'acceptance:1', scopeVersion: '1', scopeSha256: fingerprint },
    payment: { ref: 'pi_fictional', readbackRef: 'payment-readback:1', amountReceivedCents: 50000, currency: 'usd', status: 'succeeded', mode: 'test', scopeSha256: fingerprint },
    capacity: { reserved: true, ref: 'capacity:1' },
    handling: { verified: true, routeRef: 'route:fictional', verificationRef: 'verification:1', toolReleaseRef: 'release:fictional' },
    artifact: { ref: 'artifact:1', version: '1', sha256: EXAMPLE_OUTPUT_SHA256, scopeSha256: fingerprint, reviewRef: 'review:1', released: true },
    delivery: { ref: 'delivery:1', readbackRef: 'delivery-readback:1', status: 'delivered', artifactSha256: EXAMPLE_OUTPUT_SHA256, recipientRef: 'recipient:fictional' },
    clientResponse: { ref: 'response:1', artifactSha256: EXAMPLE_OUTPUT_SHA256, kind: 'accepted' },
    closure: { ref: 'closure:1', artifactSha256: EXAMPLE_OUTPUT_SHA256, kind: 'accepted' },
  };
}
