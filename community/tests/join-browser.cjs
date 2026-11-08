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
      assert.match(await page.locator('h1').innerText(),/Your curiosity\./);
      const intro=await page.locator('main .layout > section').first().boundingBox();
      const form=await page.locator('main .layout > #signup').boundingBox();
      assert.ok(width>=1000 ? form.x>=intro.x+intro.width-1 : form.y>=intro.y+intro.height-1,'panel alignment at '+width);
      assert.equal(await page.locator('a[href^="mailto:courtbinderapp"]').count(),0);
      assert.equal(await page.getByRole('link',{name:'Visit Human Liberty Ledger'}).getAttribute('href'),'https://www.humanlibertyledger.org/movement/volunteer/');
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
    assert.ok(await p.getByRole('link',{name:'Visit Human Liberty Ledger'}).isVisible());
    assert.ok(await p.getByText(/Enable JavaScript to submit/).isVisible());console.log('PASS: no-JS discovery and fallback');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});