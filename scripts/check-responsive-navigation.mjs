import assert from 'node:assert/strict';
import fs from 'node:fs';
import {command, evaluate, close, browserErrors, screenshot} from './design-browser.mjs';

const fixture = fs.readFileSync('scripts/check-admin-only.mjs', 'utf8').match(/const fixture=`([\s\S]*?)`;/)[1];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
await command('Page.enable');
await command('Runtime.enable');
const {identifier} = await command('Page.addScriptToEvaluateOnNewDocument', {source: fixture});
const state = () => evaluate(`(() => {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.querySelector('.user-topbar-menu');
  const overlay = document.querySelector('.sidebar-overlay');
  return {
    toggle: !!toggle && toggle.getBoundingClientRect().width > 0,
    visible: getComputedStyle(sidebar).visibility === 'visible' && sidebar.getBoundingClientRect().right > 0,
    open: sidebar.classList.contains('is-open'),
    overlay: getComputedStyle(overlay).display !== 'none' && getComputedStyle(overlay).pointerEvents !== 'none',
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    expanded: toggle.getAttribute('aria-expanded'),
    focused: sidebar.contains(document.activeElement)
  };
})()`);
try {
  await command('Page.navigate', {url: `http://127.0.0.1:5181/dist/index.html?role=parish&check=${Date.now()}#parish-catbalogan`});
  await pause(700);
  for (let i = 0; i < 60; i++) {
    if (await evaluate(`!!document.querySelector('.sidebar')`)) break;
    await pause(200);
  }
  for (const width of [320, 390, 768, 1000, 1040, 1041, 1280]) {
    await command('Emulation.setDeviceMetricsOverride', {width, height: 900, deviceScaleFactor: 1, mobile: false});
    for (const route of ['parish-catbalogan', 'parish-records', 'parish-settings']) {
      await evaluate(`location.hash=${JSON.stringify('#' + route)}`);
      await pause(350);
      let result = await state();
      assert.equal(result.overflow, false, `No overflow at ${width}, ${route}`);
      assert.equal(result.toggle, width <= 1040, `Toggle at ${width}, ${route}`);
      assert.equal(result.visible, width > 1040, `Sidebar at ${width}, ${route}`);
      if (width <= 1040) {
        await evaluate(`document.querySelector('.user-topbar-menu').click()`);
        await pause(300);
        result = await state();
        assert.ok(result.visible && result.overlay && result.focused);
        assert.equal(result.expanded, 'true');
        if (width === 390 && route === 'parish-records') await screenshot('responsive-navigation-open');
        await command('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Escape', code: 'Escape'});
        await pause(300);
        assert.equal((await state()).open, false);
        assert.ok(await evaluate(`document.activeElement.matches('.user-topbar-menu')`));
        for (const action of [`.sidebar__close`, `.sidebar-overlay`, `.sidebar__nav .nav-item`]) {
          await evaluate(`document.querySelector('.user-topbar-menu').click()`);
          await pause(250);
          await evaluate(`document.querySelector(${JSON.stringify(action)}).click()`);
          await pause(300);
          assert.equal((await state()).open, false, `${action} closes drawer`);
        }
      }
    }
    console.log(`PASS: navigation at ${width}px`);
  }
  assert.deepEqual(browserErrors, []);
} finally {
  await command('Page.removeScriptToEvaluateOnNewDocument', {identifier});
  close();
}
