import test from "node:test";
import assert from "node:assert/strict";
import { classifyReceiptStatus, isDocumentedTransition } from "../receipt-state.mjs";

test("Submitted is distinct from a clerk outcome", () => {
  assert.equal(classifyReceiptStatus("Submitted").phase, "awaiting-review");
  assert.equal(classifyReceiptStatus("Filed").phase, "clerk-outcome");
});

test("the source model permits the documented status transitions", () => {
  assert.equal(isDocumentedTransition("Pending Submission", "Submitted"), true);
  assert.equal(isDocumentedTransition("Submitted", "Filed"), true);
  assert.equal(isDocumentedTransition("Submitted", "Partially Filed"), true);
  assert.equal(isDocumentedTransition("Submitted", "Not Filed"), true);
});

test("the map does not invent a transition from submission to another status", () => {
  assert.equal(isDocumentedTransition("Submitted", "Pending Submission"), false);
  assert.equal(isDocumentedTransition("Filed", "Submitted"), false);
});

test("unknown source statuses remain unknown", () => {
  assert.equal(classifyReceiptStatus("Accepted by automated screening").phase, "unknown");
  assert.equal(isDocumentedTransition("Submitted", "Accepted by automated screening"), false);
});