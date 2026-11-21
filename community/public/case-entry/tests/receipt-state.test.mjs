import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyReceiptStatus, isDocumentedTransition } from "../receipt-state.mjs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const data = JSON.parse(read("../data.json"));
const finding = data.jurisdictions.find(item => item.state === "OK");

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

test("the Oklahoma finding is dated, scoped, and reviewable", () => {
  assert.ok(finding);
  assert.match(finding.claim_id, /^OK-[A-Z0-9-]+$/);
  assert.equal(finding.checked_on, data.checked_on);
  assert.equal(finding.next_review_due, "2027-02-18");
  assert.ok(finding.route_scope.length > 30);
  assert.ok(finding.claim_text.length > 80);
  assert.ok(finding.what_was_observed.length >= 3);
  assert.ok(finding.what_was_tested.includes("No account creation"));
  assert.ok(finding.what_remains_unknown.length >= 3);
  assert.equal(finding.operational_status, "not-tested");
  assert.equal(finding.independent_review, "not-recorded");
});

test("the source record preserves the distinct official sources and pinpoints", () => {
  const titles = finding.sources.map(source => source.title);
  assert.ok(titles.some(title => title.includes("Rules for E-Filing")));
  assert.ok(titles.some(title => title.includes("Version 2")));
  assert.ok(titles.some(title => title.includes("registration screen")));
  assert.ok(titles.some(title => title.includes("FAQ")));
  for (const source of finding.sources) {
    assert.match(source.url, /^https:\/\//);
    assert.ok(source.pinpoint.length > 15);
    assert.ok(source.date_note.length > 20);
  }
  assert.match(finding.scope_note, /supersede/i);
  assert.match(finding.summary, /mismatch/i);
});

test("the public correction route requests public sources only", () => {
  const html = read("../index.html");
  const log = JSON.parse(read("../correction-log.json"));
  assert.match(html, /mailto:architect@kapukai\.org/);
  assert.match(html, /Do not attach files/);
  assert.match(html, /case numbers/);
  assert.doesNotMatch(html, /<input[^>]+type=["']file/i);
  assert.equal(log.tracking_started_on, data.public_metrics.baseline_on);
  assert.deepEqual(log.entries, []);
});

test("public quality measures disclose baseline and zero denominators", () => {
  const html = read("../index.html");
  const metrics = data.public_metrics;
  assert.match(html, /quality-metrics/);
  assert.match(html, /operations\.md/);
  assert.equal(metrics.independent_review_records_published, 0);
  assert.equal(metrics.live_oucms_reproductions_completed, 0);
  assert.equal(metrics.public_correction_log_entries, 0);
  assert.match(metrics.metrics_note, /not measurable/i);
});

test("mobile, keyboard, and visible-focus support remain in the page", () => {
  const html = read("../index.html");
  const css = read("../styles.css");
  const app = read("../app.js");
  assert.match(html, /Skip to the map/);
  assert.match(html, /aria-live="polite"/);
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(css, /focus-visible/);
  assert.match(app, /event\.key === "Enter" \|\| event\.key === " "/);
});
