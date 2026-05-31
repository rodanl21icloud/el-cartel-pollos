// Impresión aislada: abre una ventana con el HTML del comprobante y lanza
// el diálogo de impresión del sistema (sirve con cualquier impresora térmica
// instalada como impresora del SO). El propio documento llama a print().
export function openPrint(html) {
  const w = window.open('', '_blank', 'width=400,height=600');
  if (!w) {
    alert('Permite las ventanas emergentes para imprimir.');
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
