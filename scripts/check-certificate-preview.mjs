import assert from 'node:assert/strict';
import fs from 'node:fs';
import {command, evaluate, screenshot, close, browserErrors} from './design-browser.mjs';
const fixture = fs.readFileSync('scripts/check-admin-only.mjs', 'utf8').match(/const fixture=`([\s\S]*?)`;/)[1];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(expression) {
  for (let i = 0; i < 60; i++) { if (await evaluate(expression)) return; await pause(150); }
  throw new Error('Timed out: ' + expression);
}
await command('Page.enable');
await command('Runtime.enable');
await command('Network.enable');
await command('Network.setCacheDisabled', {cacheDisabled:true});
const {identifier} = await command('Page.addScriptToEvaluateOnNewDocument', {source: fixture});
try {
  await command('Page.navigate', {url: 'http://127.0.0.1:5181/dist/index.html?role=parish&previewCheck='+Date.now()+'#parish-catbalogan'});
  await pause(500);
  await waitFor(`!!document.querySelector('.sidebar__nav')`);
  await evaluate(`[...document.querySelectorAll('.sidebar .nav-item')].find(el=>el.textContent.trim()==='Services').click()`);
  await waitFor(`!!document.querySelector('.certificate-preview-trigger')`);
  await evaluate(`(() => {
    for (const [name,value] of Object.entries({clientFullName:'Maria Santos',secretaryName:'Ana Cruz',additionalSponsor:'Juan Cruz'})) {
      const el=document.querySelector('input[name="'+name+'"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);
      el.dispatchEvent(new Event('input',{bubbles:true}));
    }
    window.print=()=>window.printCalled=true;
    const anchorClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){if(this.download){window.copiedName=this.download;window.copyPromise=fetch(this.href).then(response=>response.text()).then(html=>window.copiedHtml=html);}else anchorClick.call(this);};
  })()`);
  for (const width of [1440, 390]) {
    await command('Emulation.setDeviceMetricsOverride', {width, height:900, deviceScaleFactor:1, mobile:false});
    await pause(200);
    assert.equal(await evaluate(`document.querySelector('.certificate-preview-dialog').open`), false);
    assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth+1`), false);
    await evaluate(`document.querySelector('.certificate-preview-trigger').focus();document.querySelector('.certificate-preview-trigger').click()`);
    await waitFor(`document.querySelector('.certificate-preview-dialog').open`);
    assert.ok(await evaluate(`document.querySelector('.certificate-preview-dialog').contains(document.activeElement)`));
    assert.equal(await evaluate(`document.body.style.overflow`), 'hidden');
    assert.ok(await evaluate(`document.querySelector('.certificate-preview-dialog .certificate-template').textContent.includes('Maria Santos')`));
    const geometry = await evaluate(`(()=>{const d=document.querySelector('.certificate-preview-dialog'),p=d.querySelector('.certificate-preview-dialog__paper'),f=d.querySelector('.certificate-preview-dialog__footer');return {dialogOverflow:d.scrollWidth>d.clientWidth+1,paperOverflow:p.scrollWidth>p.clientWidth+1,actionsInside:f.getBoundingClientRect().bottom<=d.getBoundingClientRect().bottom+1}})()`);
    assert.equal(geometry.dialogOverflow,false); assert.equal(geometry.paperOverflow,false); assert.equal(geometry.actionsInside,true);
    await screenshot('certificate-preview-'+width);
    await evaluate(`[...document.querySelectorAll('.certificate-preview-dialog button')].find(el=>el.textContent==='Print').click()`);
    assert.equal(await evaluate(`window.printCalled`),true);
    await evaluate(`[...document.querySelectorAll('.certificate-preview-dialog button')].find(el=>el.textContent==='Copy File').click();window.copyPromise`);
    assert.ok(await evaluate(`window.copiedHtml.includes('baptism-reference.css')&&window.copiedHtml.includes('Maria Santos')&&window.copiedHtml.includes('data-design="heaven"')`));
    await evaluate(`[...document.querySelectorAll('.certificate-preview-dialog button')].find(el=>el.textContent==='Send to Owner').click()`);
    await waitFor(`document.querySelector('.certificate-preview-dialog__notice')?.textContent.includes('Load a booking first')`);
    await command('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape'});
    await command('Input.dispatchKeyEvent', {type:'keyUp',key:'Escape',code:'Escape'});
    await waitFor(`!document.querySelector('.certificate-preview-dialog').open`);
    assert.equal(await evaluate(`document.body.style.overflow==='hidden'`),false);
    assert.equal(await evaluate(`document.querySelector('input[name="clientFullName"]').value`),'Maria Santos');
    await evaluate(`document.querySelector('.certificate-form').requestSubmit()`);
    await waitFor(`document.querySelector('.certificate-preview-dialog').open`);
    await evaluate(`document.querySelector('.certificate-preview-dialog__header button').click()`);
    await waitFor(`!document.querySelector('.certificate-preview-dialog').open`);
    console.log('PASS: form, preview, print, styled copy, owner validation, closing, and layout at', width);
  }
  await evaluate(`document.querySelector('.certificate-preview-trigger').click()`);
  await command('Emulation.setEmulatedMedia',{media:'print'});
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.certificate-preview-dialog')).display`),'none');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.certificate-print-copy')).display==='none'`),false);
  assert.deepEqual(browserErrors,[]);
} finally {
  await command('Emulation.setEmulatedMedia',{media:''});
  await command('Page.removeScriptToEvaluateOnNewDocument',{identifier});
  close();
}
