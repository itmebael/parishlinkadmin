(() => {
  const key = () => { try { const s = JSON.parse(sessionStorage.getItem('diocese-dashboard-db-session') || '{}'); return `diolink-parish-settings-${s.parish_id || s.email || 'default'}`; } catch { return 'diolink-parish-settings-default'; } };
  const read = () => { try { return JSON.parse(localStorage.getItem(key()) || '{}'); } catch { return {}; } };
  const write = data => localStorage.setItem(key(), JSON.stringify(data));
  const settingCard = () => [...document.querySelectorAll('.glass-card.page-card')].find(card => (card.querySelector('h4')?.textContent || '').trim().toLowerCase() === 'parish setting');
  const toast = text => { const item = document.createElement('div'); item.className = 'parish-setting-toast'; item.textContent = text; document.body.append(item); setTimeout(() => item.remove(), 2200); };
  function mount() {
    const card = settingCard(); if (!card || card.dataset.settingsTogglesMounted) return;
    const rows = [...card.querySelectorAll('.settings-item')]; if (!rows.length) return;
    const saved = read(); card.dataset.settingsTogglesMounted = 'true';
    rows.forEach((row, index) => {
      const title = row.querySelector('strong')?.textContent.trim() || `setting-${index}`;
      const status = row.querySelector('.status-badge'); if (!status) return;
      let enabled = saved[title] !== false;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'parish-setting-toggle'; button.setAttribute('role', 'switch');
      const render = () => { button.classList.toggle('is-on', enabled); button.setAttribute('aria-checked', String(enabled)); button.innerHTML = `<span class="parish-setting-toggle__dot"></span><span>${enabled ? 'Enabled' : 'Disabled'}</span>`; };
      render(); status.replaceWith(button);
      button.addEventListener('click', () => { enabled = !enabled; const next = read(); next[title] = enabled; write(next); render(); toast(`${title} ${enabled ? 'enabled' : 'disabled'}.`); });
    });
  }
  setInterval(mount, 500); mount();
})();
