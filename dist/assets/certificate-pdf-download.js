const scripts = new Map();
function loadScript(url) {
  if (!scripts.has(url)) scripts.set(url, new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => { scripts.delete(url); script.remove(); reject(new Error('Could not load PDF tools. Check your internet connection and try again.')); };
    document.head.appendChild(script);
  }));
  return scripts.get(url);
}
export async function downloadCertificatePdf(element, filename) {
  if (!element) throw new Error('Open the certificate preview before downloading.');
  if (!window.html2canvas) await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
  if (!window.jspdf?.jsPDF) await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
  await document.fonts.ready;
  await Promise.all(Array.from(element.querySelectorAll('img'), image => image.decode().catch(() => {})));
  const canvas = await window.html2canvas(element, {
    scale:2, useCORS:true, backgroundColor:'#ffffff', windowWidth:1440,
    onclone(doc) {
      const paper = doc.querySelector('.certificate-preview-dialog .certificate-template') || doc.querySelector('.certificate-builder .certificate-template');
      if (!paper) return;
      paper.style.setProperty('width', '700px', 'important');
      paper.style.setProperty('max-width', 'none', 'important');
      paper.style.setProperty('transform', 'none', 'important');
      paper.style.setProperty('margin', '0', 'important');
      const container = paper.closest('.certificate-preview-dialog__paper');
      if (container) {container.style.overflow='visible'; container.style.height='auto';}
    }
  });
  if (!canvas.width || !canvas.height) throw new Error('The certificate could not be rendered.');
  const longPaper = element.closest('.certificate-print-copy--longpaper');
  const pdf = new window.jspdf.jsPDF({orientation:'portrait', unit:'mm', format:longPaper ? [215.9,330.2] : 'a4'});
  const pageWidth = pdf.internal.pageSize.getWidth(), pageHeight = pdf.internal.pageSize.getHeight();
  const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
  const width = canvas.width * scale, height = canvas.height * scale;
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageWidth-width)/2, 0, width, height, undefined, 'FAST');
  pdf.save(String(filename || 'certificate').replace(/[^a-z0-9-]+/gi, '-') + '.pdf');
}
