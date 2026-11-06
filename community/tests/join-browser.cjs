// Run with playwright-core and a Chromium executable; JOIN_URL must point at the candidate.
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME_BIN, args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    for (const width of [320,390,1280]) {
      const page = await browser.newPage({viewport:{width,height:812}});
      const requests=[], errors=[];
      page.on('pageerror', e=>errors.push(e.message));
      let fail=true;
      await page.route('**/functions/v1/kapukai-scoped-signup', async route=>{
        requests.push(route.request().postDataJSON());
        if(fail) return route.abort('failed');
        return route.fulfill({json:{ok:true}});
      });
      await page.goto(process.env.JOIN_URL);
      assert.equal(await page.locator('h1').count(),1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow at '+width);
      await page.getByRole('link',{name:'Find a way to help',exact:true}).click();
      const all=page.getByText('See all 16 volunteer roles',{exact:true});
      await all.focus();await page.keyboard.press('Enter');
      const roles=await all.locator('..').locator('a').evaluateAll(as=>as.map(a=>a.href));
      assert.equal(new Set(roles).size,16);
      assert.ok(roles.every(h=>new URL(h).pathname==='courtbinderapp@gmail.com' && new URL(h).searchParams.get('subject').startsWith('Change the Board volunteer interest: ')));
      await page.keyboard.press('Enter');
      await page.getByRole('link',{name:'Explore Kapukai',exact:true}).click();
      const submit=page.locator('#signup-form button[type=submit]');
      await submit.click();assert.equal(requests.length,0);
      await page.locator('#email').fill('invalid');await page.locator('#adult').check();await submit.click();assert.equal(requests.length,0);
      await page.locator('#email').fill('fixture@example.invalid');await submit.click();
      assert.match(await page.locator('#status').innerText(),/at least one/);
      await page.locator('[value=tester_invites]').check();await page.locator('[value=affidavit]').check();
      await page.locator('[value=tester_invites]').uncheck();assert.equal(await page.locator('#tool-choices').isVisible(),false);
      await page.locator('[value=free_classes]').check();
      await submit.click();await page.getByText(/Your choices are still here/).waitFor();
      assert.deepEqual(requests[0].tool_interests,[]);assert.equal(await page.locator('#email').inputValue(),'fixture@example.invalid');
      fail=false;await page.clock.install();await submit.click();await page.getByText(/Confirm your Kapukai choices/).waitFor();
      assert.equal(requests[0].request_id,requests[1].request_id);
      assert.deepEqual(requests[1].topics,['free_classes']);assert.equal(await submit.isDisabled(),true);
      await page.clock.fastForward(300001);await submit.click();await page.getByText(/Confirm your Kapukai choices/).waitFor();
      assert.notEqual(requests[2].request_id,requests[1].request_id);assert.deepEqual(errors,[]);
      await page.close(); console.log('PASS: choices, role targets, keyboard, layout, validation, retry and resend at '+width+'px');
    }
    const p=await browser.newPage({javaScriptEnabled:false});await p.goto(process.env.JOIN_URL);
    await p.getByText('Help from home',{exact:true}).click();
    assert.ok(await p.getByRole('link',{name:'Social media and design',exact:true}).isVisible());
    assert.ok(await p.getByText(/Enable JavaScript to submit/).isVisible());console.log('PASS: no-JS discovery and fallback');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});