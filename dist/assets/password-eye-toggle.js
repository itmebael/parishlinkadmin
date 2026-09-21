(() => {
  const icon = visible => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-5.5 9.5-5.5S21.5 12 21.5 12 18.1 17.5 12 17.5 2.5 12 2.5 12Z"></path><circle cx="12" cy="12" r="2.4"></circle>${visible ? '<path d="M4 4 20 20"></path>' : ''}</svg>`;
  function mount() {
    document.querySelectorAll('input[type="password"]').forEach(input => {
      if (input.closest('.password-eye-field')) return;
      const wrap = document.createElement('span'); wrap.className = 'password-eye-field';
      input.parentNode.insertBefore(wrap, input); wrap.append(input);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'password-eye-toggle';
      const render = visible => { button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password'); button.setAttribute('aria-pressed', String(visible)); button.innerHTML = icon(visible); };
      render(false); button.addEventListener('click', () => { const visible = input.type === 'password'; input.type = visible ? 'text' : 'password'; render(visible); input.focus(); }); wrap.append(button);
    });
  }
  setInterval(mount, 500); mount();
})();
