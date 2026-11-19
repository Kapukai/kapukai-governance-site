import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../oklahoma-emergency-custody/index.html", import.meta.url), "utf8");

test("the public audit separates statutory rules from untested system controls", () => {
  assert.match(html, /Confirmed cyber vulnerability:<\/strong> none established/);
  assert.match(html, /portal controls:<\/strong> not tested/i);
  assert.match(html, /not a finding that Oklahoma has a broken control/i);
  assert.match(html, /not publicly verifiable/i);
});

test("the entry route and emergency clocks have primary-source pinpoints", () => {
  assert.match(html, /1-4-201\(A\)\(2\)/);
  assert.match(html, /information and belief/);
  assert.match(html, /within 23 hours/);
  assert.match(html, /within the next two judicial days/);
  assert.match(html, /1-4-205\(B\)/);
  assert.match(html, /1-4-601–602/);
  assert.match(html, /oklegislature\.gov\/OK_Statutes/);
});

test("the funding section links eligibility to judicial findings and qualifying expenditures", () => {
  assert.match(html, /42 U\.S\.C\. § 672/);
  assert.match(html, /42 U\.S\.C\. § 674/);
  assert.match(html, /qualifying expenditures/);
  assert.match(html, /does not establish that a payment was claimed or received/);
});

test("the page prohibits live fabricated filings and protects case privacy", () => {
  assert.match(html, /Do not submit fabricated information to a live court or agency/);
  assert.match(html, /No child-welfare portal, case file, or individual case has been accessed or tested/);
});
