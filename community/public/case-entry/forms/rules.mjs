/**
 * Eagle Eyes forms catalog checks, v0.1.
 * These pure functions inspect supplied records and arithmetic. They do not
 * decide legal compliance, credibility, affordability in general, or causation.
 * Amounts use integer minor units. No currency conversion or live clock is used.
 */

export const RULE_VERSION = "0.1.0";
export const SUPPORTED_CURRENCIES = Object.freeze(["USD", "GBP", "EUR", "CAD", "AUD", "NZD"]);
const currencies = new Set(SUPPORTED_CURRENCIES);
const isAmount = value => Number.isSafeInteger(value) && value >= 0;
const hasText = value => typeof value === "string" && value.trim().length > 0;
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

function currencyCode(value) {
  return typeof value === "string" && currencies.has(value) ? value : null;
}

export function checkAffordability(input = {}) {
  const { requiredUpfrontMinor, availableMinor, confirmedSupportMinor, currency } = isObject(input) ? input : {};
  const code = currencyCode(currency);
  const result = (status, reason, shortfallMinor = null) => ({ status, reason, shortfallMinor, currency: code });
  if (!code) return result("unknown", "Currency is missing or outside this rule version's supported currencies. No conversion is performed.");
  if (!isAmount(requiredUpfrontMinor)) return result("unknown", "The required upfront payment is missing or is not a nonnegative safe integer in minor units.");
  if (requiredUpfrontMinor === 0) return result("met", "No upfront payment is required for this specific item. Other expenses and access barriers remain separate.", 0);
  if (!isAmount(availableMinor) || !isAmount(confirmedSupportMinor)) {
    return result("unknown", "Available funds and confirmed support must both be recorded. Missing support is not assumed to be zero; pending assistance is not confirmed support.");
  }
  const funds = availableMinor + confirmedSupportMinor;
  if (!Number.isSafeInteger(funds)) return result("unknown", "The supplied amounts exceed the safe arithmetic range.");
  const shortfallMinor = Math.max(0, requiredUpfrontMinor - funds);
  if (shortfallMinor > 0) {
    return result("unmet", "The recorded funds do not cover this specified upfront payment. This arithmetic does not establish that alternatives are unavailable, that a step was blocked, or that a legal violation occurred.", shortfallMinor);
  }
  return result("met", "The recorded funds cover this specified upfront payment. This does not establish that the whole process is affordable or accessible.", 0);
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function timestamp(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !validDate(match[1])) return null;
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) return null;
  if (match[6] !== "Z") {
    const hours = Number(match[6].slice(1, 3));
    const minutes = Number(match[6].slice(4, 6));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function observedDuration(input = {}) {
  const { start, end } = isObject(input) ? input : {};
  const first = timestamp(start);
  const last = timestamp(end);
  if (first === null || last === null) {
    return { status: "unknown", elapsedMinutes: null, reason: "Both observed timestamps must be valid ISO date-times with an explicit UTC offset, at millisecond precision or coarser. Missing events are not zero delay." };
  }
  if (last < first) {
    return { status: "unknown", elapsedMinutes: null, reason: "The supplied end precedes the start. Check event definitions, clocks, and source records; this is not a finding about court performance." };
  }
  return { status: "met", elapsedMinutes: (last - first) / 60000, reason: "Elapsed time between the two supplied observations. This is not a legal deadline calculation, a cause of delay, or proof that evidence was considered." };
}

export function summarizeObservedCosts(items) {
  const totals = new Map();
  let unknownCount = 0;
  let invalidCount = 0;
  let estimateCount = 0;
  let observedCount = 0;
  if (!Array.isArray(items)) {
    return { status: "unknown", reason: "No cost-item array was supplied.", totals: [], unknownCount: 0, invalidCount: 1, completeObservedTotal: false };
  }
  for (const item of items) {
    if (!isObject(item) || !hasText(item.kind)) { invalidCount += 1; continue; }
    if (item.recordStatus === "unknown" || item.amountMinor === null || item.amountMinor === undefined) { unknownCount += 1; continue; }
    const code = currencyCode(item.currency);
    if (!code || !isAmount(item.amountMinor) || !["observed", "estimated"].includes(item.recordStatus)) { invalidCount += 1; continue; }
    if (!totals.has(code)) totals.set(code, { currency: code, observedMinor: 0, estimatedMinor: 0, observedCount: 0, estimatedCount: 0 });
    const total = totals.get(code);
    const field = item.recordStatus === "observed" ? "observedMinor" : "estimatedMinor";
    const countField = item.recordStatus === "observed" ? "observedCount" : "estimatedCount";
    if (total[field] === null || !Number.isSafeInteger(total[field] + item.amountMinor)) {
      total[field] = null;
      invalidCount += 1;
      continue;
    }
    total[field] += item.amountMinor;
    total[countField] += 1;
    if (item.recordStatus === "observed") observedCount += 1;
    else estimateCount += 1;
  }
  const completeObservedTotal = items.length > 0 && observedCount === items.length && unknownCount === 0 && invalidCount === 0 && estimateCount === 0;
  return {
    status: completeObservedTotal ? "met" : "unknown",
    reason: completeObservedTotal
      ? "Observed subtotals cover the supplied items only, separated by currency. They do not establish every expense in the process."
      : "Observed amounts are partial subtotals. Estimates, missing amounts, invalid records, and unrecorded expenses must not be presented as a complete observed total.",
    totals: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    unknownCount,
    invalidCount,
    completeObservedTotal
  };
}

function secureURL(value) {
  try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password; }
  catch { return false; }
}

function uniqueIDs(records) {
  return records.every(record => isObject(record) && hasText(record.id)) && new Set(records.map(record => record.id)).size === records.length;
}

const metricKeys = ["observed_route_count", "submission_rate", "median_elapsed_hours", "participant_out_of_pocket_minor"];

/** Structural checks for a source-only research catalog. A MET result certifies
 * only its named data-contract check. Source accuracy requires source review. */
export function inspectCatalog(catalog) {
  const result = (id, status, reason) => ({ id, status, reason });
  if (!isObject(catalog) || !["sources", "forms", "routes"].every(key => Array.isArray(catalog[key]))) {
    return [result("CAT-SHAPE", "unmet", "The catalog must contain source, form, and route arrays. No legal or operational conclusion follows.")];
  }
  const { sources, forms, routes } = catalog;
  if (![sources, forms, routes].every(group => group.every(isObject))) {
    return [result("CAT-SHAPE", "unmet", "Each catalog record must be an object.")];
  }
  const results = [];
  const headerOK = [catalog.schema_version, catalog.catalog_version, catalog.scope].every(hasText) && validDate(catalog.checked_on);
  results.push(result("CAT-SHAPE", headerOK ? "met" : "unmet", headerOK ? "Catalog version, scope, and check date are present. This is structural completeness only." : "Catalog version, scope, or valid check date is missing."));
  const idsOK = [sources, forms, routes].every(group => group.length > 0 && uniqueIDs(group));
  results.push(result("CAT-IDS", idsOK ? "met" : "unmet", idsOK ? "Source, form, and route identifiers are present and unique within each registry." : "At least one registry is empty or has missing or duplicate identifiers."));

  const sourceIDs = new Set(sources.map(source => source.id));
  const formIDs = new Set(forms.map(form => form.id));
  const refsOK = (refs, allowEmpty = false) => Array.isArray(refs) && (allowEmpty || refs.length > 0) && refs.every(id => sourceIDs.has(id));
  const declaredGap = item => ["not-yet-mapped", "proposal", "unknown"].includes(item.source_status) && Array.isArray(item.source_ids) && item.source_ids.length === 0;
  const nestedShapeOK = routes.every(route => ["steps", "channels", "review_clocks", "cost_items"].every(key => Array.isArray(route[key]) && route[key].every(isObject)));
  let referencesOK = forms.every(form => refsOK(form.source_ids)) && routes.every(route => refsOK(route.source_ids) && Array.isArray(route.form_ids) && route.form_ids.length > 0 && route.form_ids.every(id => formIDs.has(id)));
  let hasDeclaredGap = false;
  if (nestedShapeOK) {
    hasDeclaredGap = routes.some(route => [...route.steps, ...route.channels, ...route.review_clocks].some(declaredGap));
    referencesOK &&= routes.every(route => [...route.steps, ...route.channels, ...route.review_clocks].every(item => refsOK(item.source_ids) || declaredGap(item)) && route.cost_items.every(item => refsOK(item.source_ids, item.amount_status === "unknown")));
  } else referencesOK = false;
  results.push(result("CAT-SOURCES", referencesOK ? (hasDeclaredGap ? "unknown" : "met") : "unmet", !referencesOK ? "A source/form reference is missing or unresolved, or a route collection is malformed." : hasDeclaredGap ? "Documented references resolve, but an explicitly marked research gap or proposal has no source yet. Source coverage remains incomplete; this is not a finding that a legal route is absent." : "Documented forms, route steps, channels, clocks, and priced items resolve to source records. Links alone do not verify the underlying claims."));

  const sourceMetadataOK = sources.every(source => [source.title, source.kind, source.scope, source.pinpoint, source.review_status].every(hasText) && secureURL(source.url) && validDate(source.last_checked) && source.last_checked <= catalog.checked_on && (source.effective_date === null || validDate(source.effective_date)) && (source.published_date === undefined || source.published_date === null || validDate(source.published_date)));
  const formMetadataOK = forms.every(form => [form.title, form.form_number, form.document_role].every(hasText) && (hasText(form.jurisdiction) || (isObject(form.jurisdiction) && hasText(form.jurisdiction.state))) && secureURL(form.landing_url) && (form.pdf_url === null || secureURL(form.pdf_url)) && (form.effective_date === null || validDate(form.effective_date)));
  const scopeOK = routes.every(route => isObject(route.jurisdiction) && [route.title, route.proceeding, route.initiating_actor, route.first_consequential_decision, route.review_status, route.jurisdiction.state, route.jurisdiction.court, route.jurisdiction.level, route.jurisdiction.time_zone].every(hasText));
  const clocksOK = nestedShapeOK && routes.every(route => route.review_clocks.every(clock => clock.effective_date === null || validDate(clock.effective_date)));
  const missingVersions = forms.some(form => form.effective_date === null) || (nestedShapeOK && routes.some(route => route.review_clocks.some(clock => clock.effective_date === null)));
  const metadataOK = sourceMetadataOK && formMetadataOK && scopeOK && clocksOK;
  results.push(result("CAT-SCOPE-VERSION", metadataOK ? (missingVersions ? "unknown" : "met") : "unmet", !metadataOK ? "Required jurisdiction, document role, source pinpoint, HTTPS URL, or date metadata is missing or invalid." : missingVersions ? "Scope metadata is recorded, but at least one form or clock effective date is unknown. Do not infer current applicability." : "Forms and clocks have edition dates and routes have jurisdiction scope. Applicability and currentness still require source review."));

  const linkageOK = nestedShapeOK && routes.every(route => uniqueIDs(route.steps) && uniqueIDs(route.channels) && uniqueIDs(route.review_clocks) && uniqueIDs(route.cost_items) && route.channels.every(channel => route.steps.some(step => step.id === channel.stage_id)));
  results.push(result("CAT-CHANNELS", linkageOK ? "met" : "unmet", linkageOK ? "Channel stage references resolve and route-local identifiers are unique. This does not establish that channels work in practice." : "A channel references an absent stage, or a route collection has missing/duplicate identifiers."));

  const unknownMetrics = routes.every(route => isObject(route.operational_metrics) && metricKeys.every(key => Object.hasOwn(route.operational_metrics, key) && route.operational_metrics[key] === null));
  results.push(result("CAT-OBSERVATIONS", unknownMetrics ? "met" : "unmet", unknownMetrics ? "Operational rates, time, expense, and sample sizes remain explicit unknowns in this source-only catalog." : "Source-only records must not contain unsupported operational numbers or omit the explicit unknown fields. Observations need a separate dataset and method."));

  const costsOK = nestedShapeOK && routes.every(route => route.cost_items.every(item => currencyCode(item.currency) && ["published", "variable", "unknown"].includes(item.amount_status) && (item.amount_status === "published" ? isAmount(item.amount_minor) : item.amount_minor === null) && (item.mandatory === null || typeof item.mandatory === "boolean")));
  results.push(result("CAT-COSTS", costsOK ? "met" : "unmet", costsOK ? "Published payment amounts, variable fees, and unknown expenses remain distinct. A zero item does not establish zero total cost or access." : "Cost metadata mixes unknown/variable amounts with numeric claims or has invalid minor units, currency, or required-payment status."));

  const overclaimed = [...sources, ...forms, ...routes].some(item => /^(verified|fully[- ]verified|independently[- ]verified|human[- ]reviewed|compliant|legally[- ]compliant|court[- ]verified)$/i.test(item.review_status ?? ""));
  results.push(result("CAT-REVIEW", overclaimed ? "unmet" : "met", overclaimed ? "A source-only catalog claims verification or compliance beyond this check. Preserve review scope and independent-review status." : "No record claims an unqualified verification/compliance status. This check does not perform independent review."));

  const hashes = [...sources, ...forms].map(item => item.sha256);
  const malformedHash = hashes.some(hash => hash !== null && (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)));
  results.push(result("CAT-INTEGRITY", malformedHash ? "unmet" : "unknown", malformedHash ? "An absent digest must be null; a supplied SHA-256 must have 64 lowercase hexadecimal characters. No digest can be authenticated from a URL alone." : hashes.some(hash => hash !== null) ? "Digest syntax is valid, but this catalog checker has not read the captured bytes. Integrity remains unverified until a separate byte-level check." : "Source/form bytes have no recorded digest. Integrity remains unknown until bytes are captured and hashed; a source URL is not a checksum."));
  return results;
}
