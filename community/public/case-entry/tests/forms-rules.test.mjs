import test from "node:test";
import assert from "node:assert/strict";
import { checkAffordability, observedDuration, summarizeObservedCosts, inspectCatalog } from "../forms/rules.mjs";

const funds = overrides => ({ requiredUpfrontMinor: 8000, availableMinor: 5000, confirmedSupportMinor: 0, currency: "USD", ...overrides });
const observed = (kind, amountMinor, currency = "USD") => ({ kind, amountMinor, currency, recordStatus: "observed" });

test("a funding shortfall exists independently of a zero elapsed interval", () => {
  const money = checkAffordability(funds());
  const time = observedDuration({ start: "2026-11-21T10:00:00-05:00", end: "2026-11-21T10:00:00-05:00" });
  assert.equal(money.status, "unmet");
  assert.equal(money.shortfallMinor, 3000);
  assert.equal(time.elapsedMinutes, 0);
  assert.match(money.reason, /does not establish.*alternatives/);
});

test("a zero specified charge does not require a financial disclosure or imply a free process", () => {
  const result = checkAffordability({ requiredUpfrontMinor: 0, currency: "USD" });
  assert.equal(result.status, "met");
  assert.equal(result.shortfallMinor, 0);
  assert.match(result.reason, /Other expenses and access barriers/);
});

test("missing values and unconfirmed support never become zero", () => {
  for (const input of [undefined, null, {}, funds({ requiredUpfrontMinor: null }), funds({ availableMinor: undefined }), funds({ confirmedSupportMinor: null })]) {
    assert.equal(checkAffordability(input).status, "unknown");
    assert.equal(checkAffordability(input).shortfallMinor, null);
  }
});

test("only explicitly confirmed support closes the specified funding gap", () => {
  const input = funds({ confirmedSupportMinor: 3000 });
  const snapshot = structuredClone(input);
  assert.equal(checkAffordability(input).status, "met");
  assert.equal(checkAffordability(input).shortfallMinor, 0);
  assert.deepEqual(input, snapshot);
});

test("money rejects fractions, negatives, coercion, unsafe amounts, and unknown currency", () => {
  for (const value of [-1, 0.1, "8000", true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(checkAffordability(funds({ requiredUpfrontMinor: value })).status, "unknown");
  }
  for (const currency of [null, "", "XYZ", "usd", 0]) assert.equal(checkAffordability(funds({ currency })).status, "unknown");
  assert.equal(checkAffordability(funds({ availableMinor: Number.MAX_SAFE_INTEGER, confirmedSupportMinor: 1 })).status, "unknown");
});

test("timestamps compare instants across explicit offsets", () => {
  const result = observedDuration({ start: "2026-11-21T08:00:00-08:00", end: "2026-11-21T16:45:30Z" });
  assert.equal(result.status, "met");
  assert.equal(result.elapsedMinutes, 45.5);
  assert.match(result.reason, /not a legal deadline/);
});

test("missing, ambiguous, impossible, and reverse timestamps remain unknown", () => {
  const end = "2026-11-21T16:00:00Z";
  for (const start of [null, undefined, "2026-11-21T12:00:00", "2026-02-30T12:00:00Z", "2026-11-21T24:00:00Z", "2026-11-21T00:00:00+14:30", "2026-11-21T00:61:00Z", "not a date"]) {
    assert.equal(observedDuration({ start, end }).status, "unknown");
    assert.equal(observedDuration({ start, end }).elapsedMinutes, null);
  }
  const reverse = observedDuration({ start: "2026-11-22T16:00:00Z", end });
  assert.equal(reverse.status, "unknown");
  assert.match(reverse.reason, /not a finding about court performance/);
  assert.equal(observedDuration(null).elapsedMinutes, null);
});

test("cost summaries keep currency, observation, and estimation separate", () => {
  const input = [observed("provider", 1500), observed("travel", 2500), observed("copying", 300, "GBP"), { kind: "lost-work", amountMinor: 9000, currency: "USD", recordStatus: "estimated" }];
  const snapshot = structuredClone(input);
  const result = summarizeObservedCosts(input);
  assert.deepEqual(result.totals, [
    { currency: "GBP", observedMinor: 300, estimatedMinor: 0, observedCount: 1, estimatedCount: 0 },
    { currency: "USD", observedMinor: 4000, estimatedMinor: 9000, observedCount: 2, estimatedCount: 1 }
  ]);
  assert.equal(result.completeObservedTotal, false);
  assert.equal(result.status, "unknown");
  assert.deepEqual(input, snapshot);
});

test("unknown expenses prevent a complete cost total even with a known zero court fee", () => {
  const result = summarizeObservedCosts([observed("court-fee", 0), { kind: "travel", amountMinor: null, currency: "USD", recordStatus: "unknown" }]);
  assert.equal(result.totals[0].observedMinor, 0);
  assert.equal(result.unknownCount, 1);
  assert.equal(result.completeObservedTotal, false);
  assert.equal(result.status, "unknown");
});

test("an empty expense list is not a zero-cost observation", () => {
  assert.equal(summarizeObservedCosts([]).status, "unknown");
  assert.equal(summarizeObservedCosts([]).completeObservedTotal, false);
  assert.deepEqual(summarizeObservedCosts([]).totals, []);
  assert.equal(summarizeObservedCosts(null).invalidCount, 1);
});

test("recorded expense totals are bounded to supplied items and protect arithmetic range", () => {
  const complete = summarizeObservedCosts([observed("travel", 500), observed("copying", 200)]);
  assert.equal(complete.completeObservedTotal, true);
  assert.equal(complete.totals[0].observedMinor, 700);
  assert.match(complete.reason, /supplied items only/);
  const overflow = summarizeObservedCosts([observed("a", Number.MAX_SAFE_INTEGER), observed("b", 1)]);
  assert.equal(overflow.status, "unknown");
  assert.equal(overflow.totals[0].observedMinor, null);
  assert.equal(overflow.invalidCount, 1);
  assert.equal(summarizeObservedCosts([observed("negative", -10)]).invalidCount, 1);
});

function catalogFixture() {
  return {
    schema_version: "1.0.0", catalog_version: "0.1.0", checked_on: "2026-11-21", scope: "Source-only synthetic fixture; no operational observations.",
    sources: [{ id: "S1", title: "Official example", url: "https://example.gov/form", kind: "official-instructions", scope: "Example route", effective_date: null, last_checked: "2026-11-21", pinpoint: "Section 1", review_status: "ai-assisted-source-review", sha256: null }],
    forms: [{ id: "F1", title: "Example request", form_number: "F-1", jurisdiction: "CA", document_role: "request", effective_date: "2025-01-01", source_ids: ["S1"], landing_url: "https://example.gov/form", pdf_url: null, sha256: null }],
    routes: [{
      id: "R1", title: "Example route", jurisdiction: { state: "CA", court: "Example court", county: "Example", level: "county", time_zone: "America/Los_Angeles" }, proceeding: "Example request", initiating_actor: "Applicant", first_consequential_decision: "Request decision", review_status: "ai-assisted-source-review", source_ids: ["S1"], form_ids: ["F1"],
      steps: [{ id: "S-INTAKE", title: "Intake", actor: "Applicant", description: "Example only", source_ids: ["S1"] }],
      channels: [{ id: "C1", title: "Paper", participant_role: "Applicant", stage_id: "S-INTAKE", description: "Example only", source_ids: ["S1"] }],
      review_clocks: [{ id: "CLOCK1", label: "Example window", description: "Source text only", effective_date: "2026-01-01", source_ids: ["S1"] }],
      cost_items: [{ id: "COST1", label: "Court fee", amount_minor: 0, currency: "USD", amount_status: "published", mandatory: true, payment_timing: "submission", source_ids: ["S1"], notes: "Specific charge only" }],
      operational_metrics: { observed_route_count: null, submission_rate: null, median_elapsed_hours: null, participant_out_of_pocket_minor: null }
    }]
  };
}

const check = (data, id) => inspectCatalog(data).find(result => result.id === id);

test("catalog checks prove structure while keeping byte integrity unknown", () => {
  const input = catalogFixture();
  const snapshot = structuredClone(input);
  const results = inspectCatalog(input);
  assert.ok(results.filter(result => result.id !== "CAT-INTEGRITY").every(result => result.status === "met"));
  assert.equal(check(input, "CAT-INTEGRITY").status, "unknown");
  assert.match(check(input, "CAT-SOURCES").reason, /do not verify/);
  assert.deepEqual(input, snapshot);
});

test("catalog rejects malformed registries and duplicate or dangling references", () => {
  assert.equal(inspectCatalog(null)[0].status, "unmet");
  assert.equal(inspectCatalog({ sources: [null], forms: [], routes: [] })[0].status, "unmet");
  const duplicate = catalogFixture(); duplicate.forms.push(structuredClone(duplicate.forms[0]));
  assert.equal(check(duplicate, "CAT-IDS").status, "unmet");
  const dangling = catalogFixture(); dangling.routes[0].steps[0].source_ids = ["missing"];
  assert.equal(check(dangling, "CAT-SOURCES").status, "unmet");
  const stage = catalogFixture(); stage.routes[0].channels[0].stage_id = "nonexistent";
  assert.equal(check(stage, "CAT-CHANNELS").status, "unmet");
});

test("scope and form versions cannot silently disappear or normalize impossible dates", () => {
  const scope = catalogFixture(); delete scope.routes[0].jurisdiction.court;
  assert.equal(check(scope, "CAT-SCOPE-VERSION").status, "unmet");
  const unknown = catalogFixture(); unknown.forms[0].effective_date = null;
  assert.equal(check(unknown, "CAT-SCOPE-VERSION").status, "unknown");
  const impossible = catalogFixture(); impossible.forms[0].effective_date = "2026-02-30";
  assert.equal(check(impossible, "CAT-SCOPE-VERSION").status, "unmet");
  const futureCheck = catalogFixture(); futureCheck.sources[0].last_checked = "2026-11-22";
  assert.equal(check(futureCheck, "CAT-SCOPE-VERSION").status, "unmet");
  const impossibleSource = catalogFixture(); impossibleSource.sources[0].effective_date = "2026-04-31";
  assert.equal(check(impossibleSource, "CAT-SCOPE-VERSION").status, "unmet");
});

test("an explicitly marked research gap stays unknown without implying that a legal route is absent", () => {
  const input = catalogFixture();
  input.routes[0].steps.push({ id: "CORRECTION", title: "Correction route", source_status: "not-yet-mapped", source_ids: [] });
  assert.equal(check(input, "CAT-SOURCES").status, "unknown");
  assert.match(check(input, "CAT-SOURCES").reason, /not a finding that a legal route is absent/);
  delete input.routes[0].steps[1].source_status;
  assert.equal(check(input, "CAT-SOURCES").status, "unmet");
  input.routes[0].steps[1].source_status = "not-yet-mapped";
  input.routes[0].steps[1].source_ids = ["missing"];
  assert.equal(check(input, "CAT-SOURCES").status, "unmet");
});

test("unknown operating metrics cannot become zero or unsupported measured values", () => {
  const sourceOnly = catalogFixture(); sourceOnly.routes[0].operational_metrics.submission_rate = 0;
  assert.equal(check(sourceOnly, "CAT-OBSERVATIONS").status, "unmet");
  const omitted = catalogFixture(); delete omitted.routes[0].operational_metrics.observed_route_count;
  assert.equal(check(omitted, "CAT-OBSERVATIONS").status, "unmet");
});

test("variable and unknown monetary items cannot acquire invented numeric amounts", () => {
  const variable = catalogFixture(); variable.routes[0].cost_items[0].amount_status = "variable";
  assert.equal(check(variable, "CAT-COSTS").status, "unmet");
  variable.routes[0].cost_items[0].amount_minor = null;
  assert.equal(check(variable, "CAT-COSTS").status, "met");
});

test("source-only catalogs cannot acquire verified labels or authenticate invented digests", () => {
  const verified = catalogFixture(); verified.routes[0].review_status = "verified";
  assert.equal(check(verified, "CAT-REVIEW").status, "unmet");
  const short = catalogFixture(); short.forms[0].sha256 = "deadbeef";
  assert.equal(check(short, "CAT-INTEGRITY").status, "unmet");
  const invented = catalogFixture(); invented.sources[0].sha256 = "a".repeat(64);
  assert.equal(check(invented, "CAT-INTEGRITY").status, "unknown");
  assert.match(check(invented, "CAT-INTEGRITY").reason, /has not read the captured bytes/);
});
