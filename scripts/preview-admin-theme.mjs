import fs from 'node:fs';
import assert from 'node:assert/strict';
import {command,evaluate,screenshot,close,browserErrors} from './design-browser.mjs';

const fixture = fs.readFileSync('scripts/check-admin-only.mjs','utf8').match(/const fixture=`([\s\S]*?)`;/)[1];
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
await command('Page.enable');
await command('Runtime.enable');
const {identifier} = await command('Page.addScriptToEvaluateOnNewDocument',{source:fixture});
try {
  for (const width of [1280,390]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    for (const route of ['parish-records','parish-archive','parish-bookings','parish-settings']) {
      await command('Page.navigate',{url:`http://127.0.0.1:5182/dist/index.html?role=parish#${route}`});
      for (let i=0;i<60;i++) {
        if (await evaluate(`!!document.querySelector('.overview-shell')`)) break;
        await pause(200);
      }
      await pause(700);
      await evaluate(`location.hash=${JSON.stringify('#'+route)}`);
      await pause(700);
      const state = await evaluate(`({route:location.hash,title:document.querySelector('.screen-title-block h3')?.textContent,font:document.querySelector('.screen-title-block h3')&&getComputedStyle(document.querySelector('.screen-title-block h3')).fontFamily,color:document.querySelector('.screen-title-block h3')&&getComputedStyle(document.querySelector('.screen-title-block h3')).color,overflow:document.documentElement.scrollWidth>innerWidth+1,links:[...document.querySelectorAll('.nav-item')].map(el=>el.textContent.trim())})`);
      await evaluate(`window.scrollTo(0,0);document.querySelector('.workspace')?.scrollTo(0,0)`);
      assert.ok(await evaluate(`document.querySelector('.screen-title-block h3').getBoundingClientRect().height>0`),'Page heading is visible');
      assert.equal(state.route, '#'+route);
      assert.ok(state.title, 'Page renders');
      assert.equal(state.color,'rgb(25, 62, 117)');
      assert.equal(state.overflow,false,'No page overflow');
      assert.ok(state.links.includes('Records') && state.links.includes('Archive'));
      console.log(JSON.stringify({width,...state}));
      if(route==='parish-records'||route==='parish-archive') await screenshot(`${route}-theme-${width}`);
    }
  }
  assert.deepEqual(browserErrors,[]);
  console.log('PASS: shared heading colors, Records/Archive navigation, desktop/mobile layout and no browser exceptions.');
} finally {
  await command('Page.removeScriptToEvaluateOnNewDocument',{identifier});
  close();
}
