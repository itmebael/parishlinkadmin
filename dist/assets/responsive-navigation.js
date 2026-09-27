// Shares the dashboard's React state so navigation and the backdrop close together.
export function useResponsiveNavigation(React, open, setOpen, route) {
  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 1040px)');
    const reset = () => setOpen(false);
    media.addEventListener('change', reset);
    return () => media.removeEventListener('change', reset);
  }, [setOpen]);

  React.useEffect(() => {
    if (!open || !window.matchMedia('(max-width: 1040px)').matches) return;
    const sidebar = document.getElementById('workspace-sidebar');
    const trigger = document.querySelector('.user-topbar-menu');
    if (!sidebar) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...sidebar.querySelectorAll('button, a[href], [tabindex="0"]')]
      .filter(node => !node.disabled && node.getClientRects().length);
    // Wait for the hidden drawer's visibility transition to start before focusing.
    const focusTimer = window.setTimeout(() => controls()[0]?.focus(), 220);
    const onKey = event => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      if (trigger?.isConnected && window.matchMedia('(max-width: 1040px)').matches) trigger.focus();
    };
  }, [open, route, setOpen]);
}
