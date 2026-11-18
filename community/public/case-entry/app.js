import { classifyReceiptStatus, isDocumentedTransition } from "./receipt-state.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const stateSelect = document.getElementById("jurisdiction-select");
const routeTitle = document.getElementById("route-title");
const routeBody = document.getElementById("route-body");
const mapRoot = document.getElementById("us-map");
const mapError = document.getElementById("map-error");
const receiptFlow = document.getElementById("receipt-flow");
let mapPaths = new Map();
let data;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function selectedStateRecord(code) {
  return data.jurisdictions.find(record => record.state === code);
}

function selectState(code) {
  if (!code) return;
  stateSelect.value = code;
  for (const [abbr, path] of mapPaths) path.classList.toggle("is-selected", abbr === code);
  renderRoute(code);
}

function renderMap() {
  const atlasMap = window.ATLAS_MAP;
  if (!atlasMap || !Array.isArray(atlasMap.states) || !atlasMap.states.length) {
    mapError.hidden = false;
    mapError.textContent = "The shared state map could not load. Use the jurisdiction selector instead.";
    return;
  }

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", atlasMap.viewBox);
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Select a state. Oklahoma has public source documentation with an unresolved filer-scope mismatch; the live route remains untested. Other jurisdictions are not yet reviewed.");
  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = "U.S. map by jurisdiction research coverage";
  svg.append(title);

  for (const state of [...atlasMap.states].sort((a, b) => a.name.localeCompare(b.name))) {
    const hasRecord = Boolean(selectedStateRecord(state.abbr));
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", state.path);
    path.setAttribute("class", "state-shape " + (hasRecord ? "source-documented" : "not-reviewed"));
    path.setAttribute("tabindex", "0");
    path.setAttribute("role", "button");
    const record = selectedStateRecord(state.abbr);
    path.setAttribute("aria-label", state.name + ": " + (record ? record.status_label + "; next review due " + record.next_review_due : "not yet reviewed; no finding about safeguards"));
    path.dataset.state = state.abbr;
    path.addEventListener("click", () => selectState(state.abbr));
    path.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectState(state.abbr);
      }
    });
    svg.append(path);
    mapPaths.set(state.abbr, path);
  }
  mapRoot.replaceChildren(svg);
}

function metadata(label, value) {
  const cell = node("div", undefined, "meta-cell");
  cell.append(node("span", label), node("strong", value));
  return cell;
}

function renderFactGroup(label, items) {
  const section = node("section", undefined, "finding-group");
  section.append(node("h4", label));
  const list = node("ul", undefined, "finding-list");
  for (const item of items) list.append(node("li", item));
  section.append(list);
  routeBody.append(section);
}

function renderRoute(code) {
  const states = window.ATLAS_MAP ? window.ATLAS_MAP.states : [];
  const shape = states.find(item => item.abbr === code);
  const record = selectedStateRecord(code);
  const name = record ? record.name : shape ? shape.name : (code === "DC" ? "District of Columbia" : code);
  routeTitle.textContent = name;
  routeBody.replaceChildren();

  if (!record) {
    routeBody.append(node("span", "Not yet reviewed", "status-pill"));
    routeBody.append(node("p", "No detailed pathway has been source-checked for this jurisdiction in this prototype. That is a coverage gap, not a finding about the jurisdiction's law or safeguards.", "route-summary"));
    const meta = node("div", undefined, "route-metadata");
    meta.append(metadata("Coverage", "Not yet reviewed"), metadata("Next step", "Identify the exact court, case type, and entry stage"));
    routeBody.append(meta);
    return;
  }

  routeBody.append(node("span", record.status_label, "status-pill documented"));
  routeBody.append(node("h4", record.route_title));
  routeBody.append(node("p", record.summary, "route-summary"));

  const meta = node("div", undefined, "route-metadata");
  meta.append(
    metadata("Finding ID", record.claim_id),
    metadata("Sources checked", record.checked_on),
    metadata("Next review due", record.next_review_due),
    metadata("Live-system test", "Not tested"),
    metadata("Independent review", "Not recorded")
  );
  routeBody.append(meta);

  const claim = node("section", undefined, "finding-group");
  claim.append(node("h4", "Dated finding"));
  claim.append(node("p", record.claim_text, "route-summary"));
  routeBody.append(claim);

  renderFactGroup("Filer access and source mismatch", record.facts.access);
  renderFactGroup("Document inputs and limits", record.facts.document_inputs);
  renderFactGroup("Receipt states", record.facts.receipt);
  renderFactGroup("What was observed", record.what_was_observed);
  renderFactGroup("What was tested", [record.what_was_tested]);
  renderFactGroup("What remains unknown", record.what_remains_unknown);

  const scope = node("div", undefined, "scope-note");
  scope.append(node("strong", "Scope and source timeline"));
  scope.append(document.createTextNode(record.scope_note));
  routeBody.append(scope);

  const sources = node("ol", undefined, "source-list");
  for (const source of record.sources) {
    const item = node("li");
    const link = node("a", source.title);
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    item.append(link, node("div", source.pinpoint), node("small", source.date_note));
    sources.append(item);
  }
  routeBody.append(sources);
}

function renderQualityMetrics() {
  const root = document.getElementById("quality-metrics");
  const metrics = data.public_metrics;
  if (!root || !metrics) return;
  const record = data.jurisdictions[0];
  const cards = [
    ["Source freshness", data.jurisdictions.length + " source-documented jurisdiction; checked " + metrics.baseline_on + "; next review due " + record.next_review_due + "."],
    ["Independent review", metrics.independent_review_records_published + " published review records. Two separate roles are being recruited."],
    ["Reproducibility", metrics.live_oucms_reproductions_completed + " live OUCMS reproductions. Synthetic software tests do not count as portal tests."],
    ["Corrections and disagreement", metrics.public_correction_log_entries + " public correction-log entries since baseline. Turnaround and disagreement are not yet measurable."]
  ];
  root.replaceChildren();
  for (const [label, value] of cards) {
    const card = node("article", undefined, "quality-card");
    card.append(node("span", label, "quality-label"), node("p", value));
    root.append(card);
  }
  const note = document.getElementById("quality-baseline");
  if (note) note.textContent = "Baseline: " + metrics.baseline_on + ". Counts begin with this map pilot; earlier general inbox correspondence has not been backfilled.";
}

function flowStep(item, className) {
  const step = node("article", undefined, "flow-step " + (className || ""));
  step.append(node("span", item.label, "flow-tag"));
  step.append(node("strong", item.label));
  step.append(node("p", item.meaning));
  return step;
}

function renderReceiptFlow() {
  const statuses = data.receipt_statuses;
  const firstRow = node("div", undefined, "flow-first");
  firstRow.append(flowStep(statuses.find(item => item.lane === "before")));
  firstRow.append(node("span", "→", "flow-arrow"));
  firstRow.append(flowStep(statuses.find(item => item.lane === "submitted"), "is-submitted"));
  receiptFlow.append(firstRow);

  receiptFlow.append(node("p", "After court-clerk processing, the guide lists these separate outcomes:", "branch-caption"));
  const outcomes = node("div", undefined, "outcome-grid");
  for (const item of statuses.filter(status => status.lane === "outcome")) {
    const cardClass = item.key === "PARTIALLY FILED" ? "outcome-card partial" : item.key === "NOT FILED" ? "outcome-card not-filed" : "outcome-card";
    const card = node("article", undefined, cardClass);
    card.append(node("strong", item.label), node("p", item.meaning));
    outcomes.append(card);
  }
  receiptFlow.append(outcomes);

  const submitted = classifyReceiptStatus("Submitted");
  const filed = classifyReceiptStatus("Filed");
  receiptFlow.dataset.submittedPhase = submitted.phase;
  receiptFlow.dataset.submittedToFiled = String(isDocumentedTransition("Submitted", "Filed"));
  receiptFlow.dataset.pendingToSubmitted = String(isDocumentedTransition("Pending Submission", "Submitted"));
  if (submitted.phase === filed.phase) {
    receiptFlow.setAttribute("data-model-error", "The source model failed to distinguish submission from disposition.");
  }
}

async function start() {
  try {
    const response = await fetch("data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load map data (" + response.status + ").");
    data = await response.json();
    renderMap();
    renderQualityMetrics();
    renderReceiptFlow();

    const states = [...(window.ATLAS_MAP ? window.ATLAS_MAP.states : [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const state of states) {
      const hasRecord = Boolean(selectedStateRecord(state.abbr));
      const record = selectedStateRecord(state.abbr);
      const label = record ? " — source mismatch; live route not tested" : " — not yet reviewed";
      const option = node("option", state.name + label);
      option.value = state.abbr;
      stateSelect.append(option);
    }
    if (!states.some(state => state.abbr === "DC")) {
      const option = node("option", "District of Columbia — not yet reviewed");
      option.value = "DC";
      stateSelect.append(option);
    }
    stateSelect.addEventListener("change", () => selectState(stateSelect.value));
    selectState("OK");
  } catch (error) {
    routeTitle.textContent = "Map data unavailable";
    routeBody.textContent = "The prototype could not load its public data. Check that the page is served over HTTP from the community/public directory.";
    mapError.hidden = false;
    mapError.textContent = error.message;
  }
}

start();
