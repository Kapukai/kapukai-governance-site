const STATUS_INFO = Object.freeze({
  "PENDING SUBMISSION": {
    key: "PENDING SUBMISSION",
    phase: "not-submitted",
    label: "Pending Submission"
  },
  SUBMITTED: {
    key: "SUBMITTED",
    phase: "awaiting-review",
    label: "Submitted"
  },
  FILED: {
    key: "FILED",
    phase: "clerk-outcome",
    label: "Filed"
  },
  "PARTIALLY FILED": {
    key: "PARTIALLY FILED",
    phase: "clerk-outcome",
    label: "Partially Filed"
  },
  "NOT FILED": {
    key: "NOT FILED",
    phase: "clerk-outcome",
    label: "Not Filed"
  }
});

const DOCUMENTED_NEXT = Object.freeze({
  "PENDING SUBMISSION": new Set(["SUBMITTED"]),
  SUBMITTED: new Set(["FILED", "PARTIALLY FILED", "NOT FILED"]),
  FILED: new Set(),
  "PARTIALLY FILED": new Set(),
  "NOT FILED": new Set()
});

export function normalizeReceiptStatus(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function classifyReceiptStatus(value) {
  const key = normalizeReceiptStatus(value);
  return STATUS_INFO[key] ?? { key: "UNKNOWN", phase: "unknown", label: "Unrecognized status" };
}

export function isDocumentedTransition(from, to) {
  const fromKey = normalizeReceiptStatus(from);
  const toKey = normalizeReceiptStatus(to);
  return DOCUMENTED_NEXT[fromKey]?.has(toKey) ?? false;
}