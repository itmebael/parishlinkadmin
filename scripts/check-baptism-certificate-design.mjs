import assert from 'node:assert/strict';
import fs from 'node:fs';
import { command,evaluate,screenshot,close } from './design-browser.mjs';
const fixture=fs.readFileSync('scripts/check-admin-only.mjs','utf8').match(/const fixture=`([\s\S]*?)`;/)[1];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await command('Page.enable');
await command('Network.enable');
await command('Network.setCacheDisabled',{cacheDisabled:true});
const {identifier}=await command('Page.addScriptToEvaluateOnNewDocument',{source:fixture});
try {
  await command('Page.navigate',{url:`http://127.0.0.1:5173/dist/index.html?role=parish&certificateCheck=${Date.now()}#parish-services`});
  await pause(1300);
  await evaluate(`location.hash='#parish-services'`);
  for(let i=0;i<40;i++) {
    if(await evaluate(`!!document.querySelector('.certificate-template[data-certificate-type="baptism"]')`))break;
    await pause(200);
  }
  for(const width of [1440,390]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.querySelector('.sidebar.is-open .sidebar__close')?.click()`);
    await pause(250);
    const state=await evaluate(`(() => {
      const c=[...document.querySelectorAll('.certificate-template[data-certificate-type="baptism"]')].find(el=>el.getBoundingClientRect().height>0 && getComputedStyle(el).visibility!=='hidden');
      return {background:getComputedStyle(c).backgroundColor,overflow:c.scrollWidth>c.clientWidth+1,clipped:c.scrollHeight>c.clientHeight+1,images:[...c.querySelectorAll('img')].every(img=>img.complete&&img.naturalWidth>0)};
    })()`);
    console.log(state);
    await evaluate(`[...document.querySelectorAll('.certificate-template')].find(el=>el.getBoundingClientRect().height>0 && getComputedStyle(el).visibility!=='hidden').scrollIntoView({block:'start'})`);
    await pause(300);
    await screenshot(`baptism-certificate-${width}`);
    assert.equal(state.background,'rgb(255, 255, 255)');
    assert.equal(state.overflow,false);
    assert.equal(state.clipped,false);
    assert.equal(state.images,true);
    await evaluate(`[...document.querySelectorAll('.certificate-template')].find(el=>el.getBoundingClientRect().height>0 && getComputedStyle(el).visibility!=='hidden').scrollIntoView({block:'start'})`);
    await pause(300);
    await screenshot(`baptism-certificate-${width}`);
    console.log('PASS: certificate',width,state);
  }
} finally {
  await command('Page.removeScriptToEvaluateOnNewDocument',{identifier});
  close();
}
