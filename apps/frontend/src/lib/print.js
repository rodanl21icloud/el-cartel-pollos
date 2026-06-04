// Impresión SIN depender de pop-ups: escribe el comprobante en un iframe oculto
// (mismo origen) y el propio HTML dispara window.print() en su onload. Si por algún
// motivo el iframe falla, cae a una ventana nueva (que sí puede bloquear el navegador).
export function openPrint(html) {
  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow && iframe.contentWindow.document;
    if (!doc) throw new Error('no-iframe');
    doc.open(); doc.write(html); doc.close();   // el script embebido llama a print() en onload
    // Limpieza tardía (no cerrar antes de que el diálogo de impresión termine).
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* */ } }, 60000);
    return true;
  } catch {
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) { alert('Habilita las ventanas emergentes para imprimir, o usa otra impresora.'); return false; }
    win.document.open(); win.document.write(html); win.document.close();
    return true;
  }
}
