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
    const darkRow = document.createElement('div');
    darkRow.className = 'settings-item';
    darkRow.innerHTML = '<div><strong>Dark mode</strong><span>Use a darker appearance for the parish workspace.</span></div><span class="status-badge"></span>';
    card.querySelector('.settings-list').append(darkRow);
    rows.push(darkRow);
    rows.forEach((row, index) => {
      const title = row.querySelector('strong')?.textContent.trim() || `setting-${index}`;
      const status = row.querySelector('.status-badge'); if (!status) return;
      const dark = title === 'Dark mode';
      let enabled = dark ? document.documentElement.dataset.theme === 'dark' : saved[title] !== false;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'parish-setting-toggle'; button.setAttribute('role', 'switch');
      button.setAttribute('aria-label', title);
      const render = () => { button.classList.toggle('is-on', enabled); button.setAttribute('aria-checked', String(enabled)); button.innerHTML = `<span class="parish-setting-toggle__dot" aria-hidden="true"></span><span>${enabled ? 'Enabled' : 'Disabled'}</span>`; };
      render(); status.replaceWith(button);
      button.addEventListener('click', () => {
        if (dark) {
          const control = document.querySelector('button[aria-label="Switch to dark mode"],button[aria-label="Switch to light mode"]');
          if (control) control.click();
          else toast('Appearance is unavailable. Please reload and try again.');
          return;
        }
        const next = read(); next[title] = !(next[title] !== false);
        try { write(next); } catch { toast('Could not save this preference. Please try again.'); return; }
        enabled = next[title]; render();
        window.dispatchEvent(new CustomEvent('parish-settings-change', { detail: next }));
        toast(`${title} ${enabled ? 'enabled' : 'disabled'}.`);
      });
      const sync = () => { enabled = dark ? document.documentElement.dataset.theme === 'dark' : read()[title] !== false; render(); };
      const observer = dark ? new MutationObserver(() => { if (button.isConnected) sync(); else observer.disconnect(); }) : null;
      if (observer) observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    });
  }
  setInterval(mount, 500); mount();
})();
