import { test, expect } from "@playwright/test";
import axe from "axe-core";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const artifacts = resolve(here, "artifacts");

// These are user-visible outcomes, independent of the application's JS state.
const pathways = [
  { name: "I need urgent help", title: /timely relief/i, detail: /lawful power to act/i },
  { name: "I need records", title: /custodian of the record/i, detail: /Preserve your originals/i },
  { name: "I need to challenge a decision", title: /legally reconsider/i, detail: /deadlines/i },
  { name: "I want to change a rule", title: /authority to change the rule/i, detail: /statutory change/i },
  { name: "I want to build a solution", title: /testable decision interface/i, detail: /synthetic data/i },
];

async function openCircuit(page) {
  const response = await page.goto("/circuit/");
  expect(response?.status(), "the actual route should load").toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/People in\s*the Circuit/);
}

async function expectAllPathways(page) {
  await expect(page.getByRole("group", { name: "Choose a pathway" })).toBeHidden();
  for (const path of pathways) {
    const panel = page.locator(".pathway-results article").filter({
      has: page.getByRole("heading", { name: path.title }),
    });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(path.detail);
  }
  await expect(page.locator(".pathway-results article:visible")).toHaveCount(5);
}

async function auditAccessibility(page, testInfo, label) {
  // Serve the audit script as same-origin test instrumentation. The page's CSP
  // stays enabled; no production source or security policy is modified.
  if (!(await page.evaluate(() => Boolean(window.axe)))) {
    const auditURL = new URL("/__circuit-tests/axe-core.js", page.url()).href;
    await page.route(auditURL, (route) => route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: axe.source,
    }));
    await page.addScriptTag({ url: auditURL });
  }
  const result = await page.evaluate(async () => window.axe.run(document, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
    },
  }));
  await testInfo.attach(`axe-${label}.json`, {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  const failures = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    targets: v.nodes.map((n) => n.target),
    helpUrl: v.helpUrl,
  }));
  expect(failures, `automated accessibility violations: ${label}`).toEqual([]);
  // Incomplete checks remain in the artifact for human review; they are not
  // silently counted as passing and this suite is not a conformance certificate.
}

test.beforeAll(async ({ browser }) => {
  await mkdir(artifacts, { recursive: true });
  const files = [];
  for (const name of ["index.html", "styles.css", "circuit.js"]) {
    const bytes = await readFile(resolve(here, "../../circuit", name));
    files.push({
      path: `circuit/${name}`,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  await writeFile(resolve(artifacts, "tested-source.json"), JSON.stringify({
    checkedAt: new Date().toISOString(),
    sourceCommit: process.env.CIRCUIT_SOURCE_COMMIT || process.env.GITHUB_SHA || null,
    browser: browser.version(),
    axeVersion: axe.version,
    files,
    limits: [
      "Chromium only; manual VoiceOver/NVDA checks remain.",
      "Viewport reflow is checked; native browser zoom is a separate manual check.",
      "Tests use synthetic public content and a local HTTP server, not production.",
      "Axe incomplete items require review; automated checks do not certify WCAG conformance.",
    ],
  }, null, 2));
});

for (const path of pathways) {
  test(`pathway: ${path.name}`, async ({ page }) => {
    await openCircuit(page);
    const button = page.getByRole("button", { name: path.name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.stages button[aria-pressed="true"]')).toHaveCount(1);
    const panel = page.locator(".pathway-results article:visible");
    await expect(panel).toHaveCount(1);
    await expect(panel.getByRole("heading", { name: path.title })).toBeVisible();
    await expect(panel).toContainText(path.detail);
    await expect(page.getByRole("status")).toContainText(path.title);
  });
}

test("skip link and native Enter/Space activation preserve keyboard access", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCircuit(page);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();

  const records = page.getByRole("button", { name: "I need records", exact: true });
  await records.focus();
  await page.keyboard.press("Enter");
  await expect(records).toBeFocused();
  await expect(page.getByRole("heading", { name: /custodian of the record/i })).toBeVisible();
  const challenge = page.getByRole("button", { name: "I need to challenge a decision", exact: true });
  await challenge.focus();
  await page.keyboard.press("Space");
  await expect(challenge).toBeFocused();
  await expect(page.getByRole("heading", { name: /legally reconsider/i })).toBeVisible();
  const focus = await challenge.evaluate((el) => ({
    style: getComputedStyle(el).outlineStyle,
    width: parseFloat(getComputedStyle(el).outlineWidth),
  }));
  expect(focus.style).not.toBe("none");
  expect(focus.width).toBeGreaterThanOrEqual(2);
});

test("all five pathways are readable without JavaScript", async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 }, baseURL });
  try {
    const page = await context.newPage();
    await openCircuit(page);
    // Verify the complete guidance, not an incidental <noscript> message.
    // Playwright's text matcher deliberately skips NOSCRIPT content.
    await expectAllPathways(page);
    await page.screenshot({ path: testInfo.outputPath("circuit-no-javascript.png"), fullPage: true });
    await testInfo.attach("circuit-no-javascript", {
      path: testInfo.outputPath("circuit-no-javascript.png"),
      contentType: "image/png",
    });
  } finally {
    await context.close();
  }
});

test("a failed script leaves the complete HTML fallback", async ({ page }) => {
  await page.route("**/circuit.js", (route) => route.abort("blockedbyclient"));
  await openCircuit(page);
  await expectAllPathways(page);
});

for (const width of [320, 375, 768, 1440]) {
  test(`layout and navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await openCircuit(page);
    await expect(page.getByRole("group", { name: "Choose a pathway" })).toBeVisible();
    const links = page.getByRole("navigation", { name: "Page sections" }).getByRole("link");
    await expect(links).toHaveCount(4);
    for (const link of await links.all()) {
      await expect(link).toBeVisible();
      const bounds = await link.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    const layout = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(layout.scroll, "the page should reflow without horizontal scrolling").toBeLessThanOrEqual(layout.client + 1);
    for (const button of await page.getByRole("group", { name: "Choose a pathway" }).getByRole("button").all()) {
      const bounds = await button.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByRole("img", { name: /Flourishing across connected lives/ })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`circuit-${width}.png`), fullPage: true });
    await testInfo.attach(`circuit-${width}`, { path: testInfo.outputPath(`circuit-${width}.png`), contentType: "image/png" });
  });
}

test("reduced motion removes smooth scrolling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCircuit(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
});

test("print includes all pathways after selecting a different one", async ({ page }, testInfo) => {
  await openCircuit(page);
  await page.getByRole("button", { name: "I want to build a solution", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  for (const path of pathways) {
    await expect(page.getByRole("heading", { name: path.title })).toBeVisible();
  }
  await expect(page.getByRole("group", { name: "Choose a pathway" })).toBeHidden();
  await page.pdf({ path: testInfo.outputPath("circuit-print.pdf"), format: "A4", printBackground: true });
  await testInfo.attach("print-preview", { path: testInfo.outputPath("circuit-print.pdf"), contentType: "application/pdf" });
});

test("reading and changing pathways sends no external requests or stored records", async ({ page, context }, testInfo) => {
  const requests = [];
  const errors = [];
  page.on("request", (request) => requests.push({ url: request.url(), method: request.method() }));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__circuitStorageWrites = [];
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      window.__circuitStorageWrites.push(String(key));
      return originalSetItem.call(this, key, value);
    };
  });
  await openCircuit(page);
  for (const path of pathways) await page.getByRole("button", { name: path.name, exact: true }).click();
  const expectedOrigin = new URL(page.url()).origin;
  expect(requests.filter((r) => new URL(r.url).origin !== expectedOrigin)).toEqual([]);
  expect(requests.filter((r) => r.method !== "GET")).toEqual([]);
  expect(errors).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  const storage = await page.evaluate(async () => ({
    writes: window.__circuitStorageWrites,
    local: localStorage.length,
    session: sessionStorage.length,
    databases: (await indexedDB.databases()).map((database) => database.name),
    serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  expect(storage).toEqual({ writes: [], local: 0, session: 0, databases: [], serviceWorkers: 0 });
  await expect(page.locator("form, input, textarea")).toHaveCount(0);
  await testInfo.attach("observed-requests.json", { body: JSON.stringify(requests, null, 2), contentType: "application/json" });
});

test("internal links resolve and diagrams retain accessible meaning", async ({ page }) => {
  await openCircuit(page);
  const missing = await page.locator('a[href^="#"]').evaluateAll((links) => links
    .map((link) => link.getAttribute("href"))
    .filter((href) => href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))));
  expect(missing).toEqual([]);
  const duplicateIds = await page.locator("[id]").evaluateAll((nodes) => {
    const ids = nodes.map((node) => node.id);
    return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  });
  expect(duplicateIds).toEqual([]);
  await expect(page.getByRole("list", { name: "Six linked dimensions of an authority record" }).getByRole("listitem")).toHaveText([
    "Authority", "Evidence", "Funding", "Decision", "Impact", "Remedy",
  ]);
  await expect(page.getByRole("img", { name: /Flourishing across connected lives/ })).toHaveAccessibleDescription(/Effects can move in both directions/);
  await expect(page.locator("#flourishing figcaption")).toContainText("intended outcome");
  await expect(page.getByRole("link", { name: /Read the federal branches overview/ })).toHaveAttribute("href", "https://www.usa.gov/branches-of-government");
});

test("desktop automated WCAG 2.2 A/AA checks", async ({ page }, testInfo) => {
  await openCircuit(page);
  await auditAccessibility(page, testInfo, "desktop");
});

for (const path of pathways) {
  test(`mobile automated accessibility: ${path.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await openCircuit(page);
    await page.getByRole("button", { name: path.name, exact: true }).click();
    await auditAccessibility(page, testInfo, path.name.replace(/\W+/g, "-").toLowerCase());
  });
}
