import assert from 'node:assert/strict';
import { command, evaluate, screenshot, close, browserErrors } from './design-browser.mjs';

// Browser-only fixtures. No production account or database is used by this check.
const fixtures = `
  const role = new URL(location.href).searchParams.get('previewRole');
  if (role) sessionStorage.setItem('diocese-dashboard-db-session', JSON.stringify({
    role, email:'preview@example.test', displayName:role==='user'?'Maria Santos':'Parish Office',
    accessToken:'preview-only', refreshToken:'preview-only', expiresAt:Math.floor(Date.now()/1000)+86400,
    userId:'00000000-0000-4000-8000-000000000001', parish_name:'St. Peter & Paul Parish', parish_id:'preview-parish'
  }));
  else sessionStorage.removeItem('diocese-dashboard-db-session');
  localStorage.setItem('diocese-dashboard-theme','light');
  localStorage.setItem('diocese-sf-scale','1');
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const url = typeof input==='string'?input:input.url;
    if (url.includes('supabase.co')) {
      let data=[];
      if(url.includes('/registered_users')) data=[{id:'00000000-0000-4000-8000-000000000001',full_name:'Maria Santos',email:'preview@example.test',parish_name:'St. Peter & Paul Parish',parish_id:'preview-parish'}];
      if(url.includes('get_parish_id_by_email')||url.includes('/parishes?')) data=[{id:'preview-parish',parish_name:'St. Peter & Paul Parish'}];
      if(url.includes('list_parishes')) data=[{parish_name:'St. Peter & Paul Parish'}];
      if(url.includes('/parish_events?')&&url.includes('limit=1')) data=[{id:'preview-mass',title:'Sunday Holy Mass',event_date:'2026-09-20',start_time:'08:00',location:'Main Parish Church',event_type:'Mass'}];
      if(url.includes('/diocese_service_bookings?')&&url.includes('limit=3')) data=[{id:'preview-booking',reference_number:'REQ-2026-014',service_name:'Baptismal Certificate',booking_status:'Pending',created_at:'2026-09-18'}];
      return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
    }
    return originalFetch(input,init);
  };
`;
await command('Runtime.enable');
await command('Page.enable');
const { identifier } = await command('Page.addScriptToEvaluateOnNewDocument', { source: fixtures });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const roles = {
  user: ['user-dashboard','user-certificate','user-mass-schedules','user-appointments','user-live-stream','user-announcement','user-my-requests','user-profile-settings','user-help-support','user-correction'],
  parish: ['parish-catbalogan','parish-live-stream','parish-church','parish-calendar','parish-announcement','parish-records','parish-archive','parish-services','parish-bookings','parish-messages','parish-reports','parish-settings'],
};
const results = [];
try {
  for (const [role, routes] of Object.entries(roles)) {
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await command('Page.navigate', { url: `http://127.0.0.1:5181/dist/index.html?previewRole=${role}#${routes[0]}` });
    await pause(1300);
    if (role === 'user') browserErrors.length = 0;
    for (const route of routes) {
      await evaluate(`location.hash=${JSON.stringify(route)};window.scrollTo(0,0)`);
      await pause(350);
      const state = await evaluate(`({route:location.hash,content:document.querySelector('.overview-shell')?.innerText.length||0,overflow:document.documentElement.scrollWidth>innerWidth+2})`);
      assert.equal(state.route, '#' + route);
      assert.ok(state.content > 15, `No content: ${route}`);
      results.push({ route, width: 1440, overflow: state.overflow });
      if (route === routes[0] || ['parish-bookings','parish-calendar','user-certificate'].includes(route)) await screenshot(route + '-desktop');
      if (route === 'user-certificate') {
        await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>/^Book now$/i.test(b.textContent.trim())).click()`);
        await pause(250);
        assert.ok(await evaluate(`!!document.querySelector('.certificate-booking-modal__dialog')`), 'Booking dialog opens');
        await screenshot('booking-dialog-desktop');
        await evaluate(`document.querySelector('.certificate-booking-modal__close').click()`);
      }
      if (route === 'parish-calendar') {
        await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Next').click()`);
        assert.ok(await evaluate(`document.body.innerText.includes('October 2026')`), 'Calendar advances');
      }
    }
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (const route of routes) {
      await evaluate(`location.hash=${JSON.stringify(route)};window.scrollTo(0,0)`);
      await pause(200);
      const overflow = await evaluate('document.documentElement.scrollWidth>innerWidth+2');
      results.push({ route, width: 390, overflow });
      if (route === routes[0] || route === 'user-certificate') await screenshot(route + '-mobile');
    }
    await evaluate(`location.hash=${JSON.stringify(routes[0])}`);
    await pause(200);
    await evaluate(`document.querySelector('.user-topbar-menu').click()`);
    assert.equal(await evaluate(`document.querySelector('.sidebar').classList.contains('is-open')`), true);
    await evaluate(`document.querySelector('.sidebar-overlay').click()`);
    assert.equal(await evaluate(`document.querySelector('.sidebar').classList.contains('is-open')`), false);
    if (role === 'parish') {
      await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await evaluate(`document.querySelector('button[aria-label="Switch to dark mode"]').click()`);
      await pause(200);
      assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
      await screenshot('parish-dark-desktop');
    }
  }
  await command('Page.navigate', { url: 'http://127.0.0.1:5181/dist/index.html?previewLogin=1#login' });
  await pause(1000);
  await screenshot('login-mobile');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+2'), false, 'Login mobile overflow');
  await evaluate(`document.querySelector('.heaven-password__toggle').click()`);
  assert.equal(await evaluate(`document.querySelector('.heaven-password input').type`), 'text');
  await evaluate(`document.querySelector('.heaven-password__toggle').click()`);
  assert.equal(await evaluate(`document.querySelector('.heaven-password input').type`), 'password');
  await evaluate(`document.getElementById('login-role-tab-user').click()`);
  assert.ok(await evaluate(`document.body.innerText.includes('Faith brings us closer.')`));
  await evaluate(`document.querySelector('.login-mode-link').click()`);
  await pause(300);
  await screenshot('register-mobile');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+2'), false, 'Registration mobile overflow');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate(`document.querySelector('.login-mode-link').click()`);
  await screenshot('login-user-desktop');
  await evaluate(`document.querySelector('.login-panel__topbar .icon-button').click()`);
  await screenshot('login-dark-desktop');
  console.log(JSON.stringify({screens:results.length,overflow:results.filter(r=>r.overflow),browserErrors},null,2));
  assert.equal(results.filter(r=>r.overflow).length,0,'Screen overflow');
  assert.equal(browserErrors.length, 0, 'Browser runtime errors');
} finally {
  await command('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  close();
}
