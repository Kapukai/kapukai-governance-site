import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const root = new URL('../public/', import.meta.url);
const load = path => readFileSync(new URL(path,root),'utf8');
const landing = load('newsletter/index.html');
const archive = load('newsletter/archive/index.html');
const issue = load('newsletter/archive/2026-11/index.html');
test('the enrolled signup sources and confirmation action survive the archive addition',()=>{
  assert.match(landing,/form id="signup" data-source="\/newsletter" data-primary="remedy_brief"/);
  assert.match(landing,/name="topic" value="remedy_brief" required/);
  assert.match(landing,/href="\/newsletter\/archive\/"/);
});
test('public issue and archive have readable dates, matching URLs, and join links',()=>{
  for(const [s,slug] of [[issue,'/newsletter/archive/2026-11/'],[archive,'/newsletter/archive/']]) {
    assert.equal(s.match(/<h1\b/g)?.length,1);
    assert.ok(s.includes('href="https://kapukai.org'+slug+'"'));
    assert.ok(s.includes('href="https://kapukai.org/join/"'));
    assert.doesNotMatch(s,/<form\b|<script\b/);
  }
  assert.match(archive,/href="\/newsletter\/archive\/2026-11\/"/);
  assert.match(issue,/November 1–5, 2026/);
  assert.match(issue,/href="\/newsletter\/archive\/"/);
  assert.match(issue,/href="https:\/\/kapukai.org\/accountability\/demo\/"/);
});
