(() => {
  const originals = new WeakMap();
  const applied = new Set();
  let scale = 1.15, timer;
  const excluded = '.certificate-template, .certificate-print-copy, .certificate-preview, .sidebar__crest';
  function resize() {
    // Restore the unscaled cascade before measuring, including inherited fonts.
    for (const node of applied) {
      const original = originals.get(node);
      if (original.value) node.style.setProperty('font-size', original.value, original.priority);
      else node.style.removeProperty('font-size');
    }
    applied.clear();
    const nodes = [...document.querySelectorAll('.dashboard-frame--parish :is(h1,h2,h3,h4,h5,h6,p,span,strong,small,label,button,a,input,select,textarea,td,th,dt,dd,time,li)')]
      .filter(node => !node.closest(excluded));
    const sizes = nodes.map(node => parseFloat(getComputedStyle(node).fontSize));
    nodes.forEach((node, index) => {
      if (!originals.has(node)) originals.set(node, {value:node.style.getPropertyValue('font-size'), priority:node.style.getPropertyPriority('font-size')});
      if (Number.isFinite(sizes[index])) {
        node.style.setProperty('font-size', (sizes[index] * scale / 1.15).toFixed(2) + 'px', 'important');
        applied.add(node);
      }
    });
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(resize, 80); }
  window.parishTextSizing = {apply(value) { scale = value; resize(); }};
  new MutationObserver(schedule).observe(document.documentElement, {childList:true, subtree:true});
  window.addEventListener('resize', schedule);
})();
