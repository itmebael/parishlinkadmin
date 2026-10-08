(() => {
  const key = () => { try { const s = JSON.parse(sessionStorage.getItem('diocese-dashboard-db-session') || '{}'); return `diolink-parish-settings-${s.parish_id || s.email || 'default'}`; } catch { return 'diolink-parish-settings-default'; } };
  const read = () => { try { return JSON.parse(localStorage.getItem(key()) || '{}'); } catch { return {}; } };
  const write = data => localStorage.setItem(key(), JSON.stringify(data));
  window.parishSettings = { isEnabled: title => read()[title] !== false };
  const settingCard = () => [...document.querySelectorAll('.glass-card.page-card')].find(card => (card.querySelector('h4')?.textContent || '').trim().toLowerCase() === 'parish setting');
  const toast = text => { const item = document.createElement('div'); item.className = 'parish-setting-toast'; item.setAttribute('role', 'status'); item.textContent = text; document.body.append(item); setTimeout(() => item.remove(), 2200); };
  function mount() {
    const card = settingCard(); if (!card || card.dataset.settingsTogglesMounted) return;
    const rows = [...card.querySelectorAll('.settings-item')]; if (!rows.length) return;
    const saved = read(); card.dataset.settingsTogglesMounted = 'true';
    const fontRow = document.createElement('div');
    fontRow.className = 'settings-item parish-font-setting';
    fontRow.innerHTML = '<div><strong>Font size</strong><span>Adjust text across the parish screens.</span><small data-font-preview>The quick brown fox jumps over the lazy dog.</small></div><div class="parish-font-controls" role="group" aria-label="Adjust font size"><button type="button" data-font-action="smaller" aria-label="Decrease font size">A−</button><button type="button" data-font-action="reset" aria-label="Reset font size">Default</button><button type="button" data-font-action="larger" aria-label="Increase font size">A+</button><output aria-live="polite"></output></div>';
    card.querySelector('.settings-list').append(fontRow);
    const syncFont = () => {
      const api = window.parishFontSize;
      if (!api) return;
      const value = api.get();
      fontRow.querySelector('[data-font-action="smaller"]').disabled = value <= api.min;
      fontRow.querySelector('[data-font-action="larger"]').disabled = value >= api.max;
      fontRow.querySelector('output').textContent = Math.round(value / api.default * 100) + '%';
    };
    fontRow.addEventListener('click', event => {
      const action = event.target.closest('[data-font-action]')?.dataset.fontAction;
      if (!action || !window.parishFontSize) return;
      const api = window.parishFontSize;
      api.set(action === 'reset' ? api.default : api.get() + (action === 'larger' ? api.step : -api.step));
      syncFont();
    });
    window.addEventListener('parish-font-size-change', syncFont);
    syncFont();
    rows.forEach((row, index) => {
      const title = row.querySelector('strong')?.textContent.trim() || `setting-${index}`;
      const status = row.querySelector('.status-badge'); if (!status) return;
      let enabled = saved[title] !== false;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'parish-setting-toggle'; button.setAttribute('role', 'switch');
      button.setAttribute('aria-label', title);
      const render = () => { button.classList.toggle('is-on', enabled); button.setAttribute('aria-checked', String(enabled)); button.innerHTML = `<span class="parish-setting-toggle__dot" aria-hidden="true"></span><span>${enabled ? 'Enabled' : 'Disabled'}</span>`; };
      render(); status.replaceWith(button);
      button.addEventListener('click', () => {
        const next = read(); next[title] = !(next[title] !== false);
        try { write(next); } catch { toast('Could not save this preference. Please try again.'); return; }
        enabled = next[title]; render();
        window.dispatchEvent(new CustomEvent('parish-settings-change', { detail: next }));
        toast(`${title} ${enabled ? 'enabled' : 'disabled'}.`);
      });
    });
  }
  setInterval(mount, 500); mount();
})();
