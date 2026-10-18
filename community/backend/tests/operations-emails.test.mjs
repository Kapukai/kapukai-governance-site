import {test} from 'node:test';import assert from 'node:assert/strict';
import {TEMPLATES,participationEmail} from '../operations/email-templates.mjs';
test('all participation templates contain HTML, text and escaped user input',()=>{for(const k of Object.keys(TEMPLATES)){const m=participationEmail(k,{nextAction:'<script>alert(1)</script>',dueDate:'October 23'});assert.ok(m.HtmlBody.includes('#0a1b2b'));assert.ok(m.HtmlBody.includes('#bd8d38'));assert.ok(m.HtmlBody.includes('&lt;script&gt;'));assert.ok(!m.HtmlBody.includes('<script>'));assert.ok(m.TextBody.includes('October 23'));}});
