// Keep report documents and their print styles isolated inside the admin page.
export function openReportPreview(title = 'Report preview') {
  const previous = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', title);
  dialog.style.cssText = 'width: min(1180px, calc(100vw - 24px)); max-width: none; height: calc(100dvh - 40px); max-height: none; padding: 0; border: 1px solid #cbddea; border-radius: 16px; background: #fff; box-shadow: 0 24px 80px #173e6350; overflow: hidden;';
  const style = document.createElement('style');
  style.textContent = 'dialog[data-report-preview]::backdrop{background:rgba(18,40,65,.55)}';
  dialog.dataset.reportPreview = '';
  const header = document.createElement('header');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 18px;border-bottom:1px solid #d3e2ee;font:600 15px Arial;color:#193b5c;height:58px;box-sizing:border-box';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = 'Close';
  button.style.cssText = 'padding:8px 16px;border:1px solid #bdd6e9;border-radius:8px;background:#f3f9ff;color:#1762a2;cursor:pointer';
  const frame = document.createElement('iframe');
  frame.title = title;
  frame.style.cssText = 'display:block;width:100%;height:calc(100% - 58px);border:0;background:#fff';
  header.append(heading, button); dialog.append(style, header, frame);
  document.body.append(dialog);
  const reportDocument = frame.contentDocument;
  let closed = false;
  function close() {
    if (closed) return;
    closed = true; dialog.close(); dialog.remove();
    if (previous?.isConnected) previous.focus({preventScroll:true});
  }
  button.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  function wireFrame() {
    if (closed) return;
    frame.contentWindow.close = close;
    frame.contentDocument.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    });
  }
  frame.addEventListener('load', wireFrame);
  dialog.showModal(); button.focus(); wireFrame();
  return {
    get document() { return reportDocument; },
    get closed() { return closed; },
    close,
    focus() { if (!closed) { wireFrame(); frame.contentWindow.focus(); } },
    print() { if (!closed) frame.contentWindow.print(); }
  };
}
