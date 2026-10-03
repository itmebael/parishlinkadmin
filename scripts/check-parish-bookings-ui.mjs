import assert from 'node:assert/strict';
import fs from 'node:fs';
import { command, evaluate, screenshot, close } from './design-browser.mjs';

const fixture = fs.readFileSync('scripts/check-admin-only.mjs', 'utf8').match(/const fixture=`([\s\S]*?)`;/)[1];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const bookings = [
  { id:'apt-test', client_name:'Rodwin Caravana', reference_number:'APT-20260428-T8JK03XAK7', service_name:'Certificate pickup', booking_date:'2026-04-29', booking_status:'Appointment' },
  { id:'cert-test', client_name:'Rodwin Oliva Caravana', reference_number:'CERT-20260428-KRMNZNUKEK', service_name:'Baptismal Certificate', booking_date:'2026-04-28', booking_status:'Pending', certificate_file_name:'CERT-20260428-KRMNZNUKEK.pdf', certificate_file_url:'https://example.test/certificate.pdf' }
];
await command('Page.enable');
await command('Network.enable');
await command('Network.setCacheDisabled', { cacheDisabled:true });
const { identifier } = await command('Page.addScriptToEvaluateOnNewDocument', { source: fixture + `
const fixtureFetch=window.fetch;
window.fetch=async(input,init)=>{
  const url=String(input);
  if(url.includes('supabase.co') && (url.includes('diocese_service_bookings') || url.includes('list_parish_bookings'))) return new Response(JSON.stringify(${JSON.stringify(bookings)}),{headers:{'Content-Type':'application/json'}});
  return fixtureFetch(input,init);
};` });
try {
  await command('Page.navigate', { url:`http://127.0.0.1:5173/dist/index.html?role=parish&bookingsCheck=${Date.now()}#parish-bookings` });
  await pause(1200);
  await evaluate(`location.hash='#parish-bookings'`);
  for (let i=0;i<40;i++) {
    if (await evaluate(`document.querySelectorAll('.parish-booking-item').length===2 && !!document.querySelector('.pab-deleteall-wrap')`)) break;
    await pause(200);
  }
  for (const theme of ['light','dark']) {
    await evaluate(`if(document.documentElement.dataset.theme!==${JSON.stringify(theme)}) document.querySelector('button[aria-label="Switch to ${theme} mode"]').click()`);
    await pause(200);
    for (const width of [1440,768,390,320]) {
      await command('Emulation.setDeviceMetricsOverride', { width,height:1000,deviceScaleFactor:1,mobile:false });
      await evaluate(`document.querySelector('.sidebar.is-open .sidebar__close')?.click()`);
      await pause(250);
      const result=await evaluate(`(() => {
        const rows=[...document.querySelectorAll('.parish-booking-item')];
        return {
          count:rows.length,
          overflow:document.documentElement.scrollWidth>innerWidth+1,
          clipped:rows.flatMap(row=>[...row.querySelectorAll('button,a,label')]).filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.textContent),
          ordered:rows.every(row=>row.querySelector('.parish-booking-actions').getBoundingClientRect().top>=row.querySelector('.detail-list__meta').getBoundingClientRect().bottom),
          deleteBelow:document.querySelector('.pab-deleteall-wrap').getBoundingClientRect().top>=document.querySelector('.parish-booking-list').getBoundingClientRect().bottom
        };
      })()`);
      assert.equal(result.count,2);
      assert.equal(result.overflow,false);
      assert.deepEqual(result.clipped,[]);
      assert.equal(result.ordered,true);
      assert.equal(result.deleteBelow,true);
      if(width===1440 || width===390) await screenshot(`bookings-${theme}-${width}`);
      console.log('PASS:',theme,width);
    }
  }
} finally {
  await command('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  close();
}
