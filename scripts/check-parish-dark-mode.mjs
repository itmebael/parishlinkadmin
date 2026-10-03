import assert from 'node:assert/strict';
import fs from 'node:fs';
import { command, evaluate, screenshot, close } from './design-browser.mjs';

const fixture = fs.readFileSync('scripts/check-admin-only.mjs', 'utf8').match(/const fixture=`([\s\S]*?)`;/)[1];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
await command('Page.enable');
await command('Runtime.enable');
await command('Network.enable');
await command('Network.setCacheDisabled', { cacheDisabled: true });
const { identifier } = await command('Page.addScriptToEvaluateOnNewDocument', {
  source: fixture + '\nlocalStorage.setItem("diocese-dashboard-theme", "dark");'
});
try {
  await command('Page.navigate', { url: `http://127.0.0.1:5173/dist/index.html?role=parish&darkCheck=${Date.now()}#parish-catbalogan` });
  await pause(1200);
  for (let i = 0; i < 50; i++) {
    if (await evaluate('!!document.querySelector(".dashboard-frame--parish")')) break;
    await pause(200);
  }
  const routes = await evaluate(`[...document.querySelectorAll('.sidebar .nav-item')].map(el => ({label:el.textContent.trim()})).filter(item => !/log out|logout/i.test(item.label))`);
  for (const width of [1440, 390]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const { label } of routes) {
      await evaluate(`([...document.querySelectorAll('.sidebar .nav-item')].find(el => el.textContent.trim() === ${JSON.stringify(label)})).click()`);
      await pause(700);
      const result = await evaluate(`(() => {
        const light = [...document.querySelectorAll('.dashboard-frame--parish *')].filter(el => {
          const box = el.getBoundingClientRect();
          if (!box.width || !box.height || el.matches('img,svg,svg *,video,canvas') || el.closest('.certificate-template')) return false;
          const rgb = getComputedStyle(el).backgroundColor.match(/[\\d.]+/g)?.map(Number);
          return rgb && (rgb.length < 4 || rgb[3] > .5) && rgb.slice(0,3).every(n => n > 180) && box.width * box.height > 1500;
        }).map(el => ({class:el.className,parent:el.parentElement.className,tag:el.tagName,color:getComputedStyle(el).backgroundColor}));
        return {theme:document.documentElement.dataset.theme,light,overflow:document.documentElement.scrollWidth>innerWidth+1};
      })()`);
      console.log(width, label, JSON.stringify(result));
      assert.equal(result.theme, 'dark');
      assert.deepEqual(result.light, [], `Light surfaces on ${label} at ${width}`);
      assert.equal(result.overflow, false);
      if (label === 'Archive') {
        const colors = await evaluate(`[...document.querySelectorAll('.login-field > span,.baptism-records__type > span,.screen-subtitle')].filter(el=>el.getBoundingClientRect().height).map(el=>({text:el.textContent,color:getComputedStyle(el).color}))`);
        assert.ok(colors.length, 'Archive labels are present');
        for (const item of colors) assert.equal(item.color, 'rgb(177, 190, 197)', `Light label: ${item.text}`);
        await screenshot(`parish-dark-archive-${width}`);
      }
      if (/dashboard/i.test(label)) await screenshot(`parish-dark-${width}`);
    }
  }
  await evaluate(`location.hash='#parish-settings'`);
  await pause(750);
  await evaluate(`document.querySelector('.parish-setting-toggle[aria-label="Dark mode"]').click()`);
  await pause(250);
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'light');
  await evaluate(`document.querySelector('.parish-setting-toggle[aria-label="Dark mode"]').click()`);
  await pause(250);
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
  await command('Page.reload');
  await pause(1200);
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
  console.log('PASS: dark surfaces across desktop/mobile routes; settings switch and reload persistence.');
} finally {
  await command('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  close();
}
