// Genera el Manual del Cajero (HTML autocontenido, listo para imprimir a PDF).
// Diseño pensado para TDAH: 1 idea por bloque, pasos cortos, colores semáforo,
// anclas visuales y membrete con el logo en cada página.
//   node docs/build-manual-cajero.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logoPath = join(__dirname, '..', 'apps', 'frontend', 'public', 'logo.jpeg');
const LOGO = 'data:image/jpeg;base64,' + readFileSync(logoPath).toString('base64');

// Membrete reutilizable (va arriba de cada página).
const head = (titulo) => `
  <header class="membrete">
    <img src="${LOGO}" alt="El Cartel de los Pollos" />
    <div class="mb-txt">
      <div class="mb-marca">EL CARTEL DE LOS POLLOS</div>
      <div class="mb-sub">${titulo}</div>
    </div>
    <div class="mb-rol">CAJERO</div>
  </header>`;

const foot = (n) => `<footer class="pie"><span>Manual del Cajero · El Cartel de los Pollos</span><span>Pág. ${n}</span></footer>`;

// Paso numerado grande.
const paso = (n, emoji, txt) => `<li><span class="num">${n}</span><span class="emoji">${emoji}</span><span class="ptxt">${txt}</span></li>`;

const page = (titulo, n, body) => `
<section class="pagina">
  ${head(titulo)}
  <main>${body}</main>
  ${foot(n)}
</section>`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Manual del Cajero · El Cartel de los Pollos</title>
<style>
  :root{
    --rojo:#dc2626; --rojo-osc:#991b1b; --tinta:#0f172a; --gris:#64748b;
    --verde:#16a34a; --verde-bg:#dcfce7; --rojo-bg:#fee2e2; --amar:#f59e0b; --amar-bg:#fef3c7;
    --azul-bg:#dbeafe;
  }
  *{box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact;}
  html,body{margin:0; padding:0; background:#e2e8f0; color:var(--tinta);
    font-family:'Segoe UI',Inter,system-ui,Arial,sans-serif; line-height:1.5;}
  .pagina{width:210mm; min-height:297mm; background:#fff; margin:14px auto; padding:16mm 15mm 14mm;
    box-shadow:0 8px 30px rgba(0,0,0,.15); position:relative; display:flex; flex-direction:column;}
  main{flex:1;}

  /* Membrete */
  .membrete{display:flex; align-items:center; gap:14px; border-bottom:4px solid var(--rojo);
    padding-bottom:10px; margin-bottom:18px;}
  .membrete img{height:54px; width:auto; border-radius:8px;}
  .mb-txt{flex:1;}
  .mb-marca{font-weight:900; letter-spacing:.5px; font-size:15px; color:var(--tinta);}
  .mb-sub{font-size:20px; font-weight:800; color:var(--rojo);}
  .mb-rol{background:var(--tinta); color:#fff; font-weight:900; font-size:13px;
    padding:6px 12px; border-radius:999px; letter-spacing:1px;}

  .pie{display:flex; justify-content:space-between; font-size:11px; color:var(--gris);
    border-top:1px solid #e2e8f0; padding-top:8px; margin-top:14px;}

  h1.cover-t{font-size:46px; font-weight:900; margin:8px 0 0; line-height:1.05;}
  h2{font-size:26px; font-weight:900; margin:0 0 4px;}
  .lead{font-size:16px; color:var(--gris); margin:0 0 16px;}

  /* Pasos */
  ol.pasos{list-style:none; margin:0; padding:0;}
  ol.pasos li{display:flex; align-items:center; gap:14px; background:#f8fafc; border:1px solid #e2e8f0;
    border-radius:16px; padding:14px 16px; margin-bottom:10px;}
  ol.pasos .num{flex:0 0 38px; height:38px; width:38px; background:var(--rojo); color:#fff;
    border-radius:50%; display:grid; place-items:center; font-weight:900; font-size:19px;}
  ol.pasos .emoji{font-size:26px; width:32px; text-align:center;}
  ol.pasos .ptxt{font-size:17px; font-weight:600;}
  ol.pasos b{color:var(--rojo-osc);}

  /* Cajas semáforo */
  .caja{border-radius:16px; padding:14px 18px; margin:12px 0; font-size:16px;}
  .caja .t{font-weight:900; font-size:16px; display:block; margin-bottom:4px;}
  .ok{background:var(--verde-bg); border:2px solid var(--verde);}
  .no{background:var(--rojo-bg); border:2px solid var(--rojo);}
  .ojo{background:var(--amar-bg); border:2px solid var(--amar);}
  .info{background:var(--azul-bg); border:2px solid #3b82f6;}

  .check{list-style:none; margin:10px 0; padding:0;}
  .check li{font-size:17px; padding:8px 0 8px 36px; position:relative; border-bottom:1px dashed #e2e8f0; font-weight:600;}
  .check li:before{content:'☐'; position:absolute; left:4px; font-size:22px; color:var(--gris);}

  .regla{background:var(--tinta); color:#fff; border-radius:18px; padding:18px 20px; margin:14px 0;}
  .regla .t{color:#fca5a5; font-weight:900; letter-spacing:1px; font-size:13px;}
  .regla .b{font-size:20px; font-weight:800; margin-top:4px;}

  .grid2{display:grid; grid-template-columns:1fr 1fr; gap:12px;}
  .mini{background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:12px 14px;}
  .mini .mt{font-weight:900; font-size:15px;}
  .mini .md{font-size:14px; color:var(--gris);}

  .big-emoji{font-size:30px;}
  .tag{display:inline-block; background:#e2e8f0; color:var(--tinta); font-weight:800; font-size:12px;
    padding:3px 10px; border-radius:999px; margin-left:6px;}
  .time{color:var(--verde); font-weight:800; font-size:13px;}

  /* Flujo del día */
  .flujo{display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:16px 0;}
  .flujo .f{background:#fff; border:2px solid var(--rojo); border-radius:16px; padding:14px; text-align:center;}
  .flujo .f .fe{font-size:34px;}
  .flujo .f .ft{font-weight:900; font-size:16px; margin-top:6px;}
  .flujo .f .fd{font-size:13px; color:var(--gris);}

  @media print{
    body{background:#fff;}
    .pagina{margin:0; box-shadow:none; width:auto; min-height:auto; page-break-after:always;}
    .pagina:last-child{page-break-after:auto;}
  }
  @page{size:A4; margin:0;}
</style>
</head>
<body>

<!-- PORTADA -->
<section class="pagina" style="justify-content:center; text-align:center; align-items:center;">
  <div style="margin:auto 0;">
    <img src="${LOGO}" alt="El Cartel de los Pollos" style="width:230px; border-radius:24px; box-shadow:0 10px 40px rgba(0,0,0,.2);" />
    <div style="font-weight:900; letter-spacing:2px; color:var(--gris); margin-top:18px;">EL CARTEL DE LOS POLLOS</div>
    <h1 class="cover-t">Manual del <span style="color:var(--rojo)">Cajero</span></h1>
    <p class="lead" style="font-size:18px; max-width:60%; margin:14px auto;">Tu guía rápida para vender, cobrar y cerrar caja sin estrés. Hecha para leer en segundos.</p>
    <div style="display:inline-block; background:var(--tinta); color:#fff; font-weight:800; padding:10px 18px; border-radius:999px; margin-top:8px;">📖 Léelo a tu ritmo · 1 página = 1 tarea</div>
    <div style="margin-top:26px; color:var(--gris); font-size:13px;">Documento interno · v1</div>
  </div>
</section>

${page('Cómo usar este manual', 2, `
  <h2>Cómo usar este manual 🧭</h2>
  <p class="lead">No tienes que leerlo todo. Busca la tarea que necesitas y sigue los pasos. Cada página es UNA sola cosa.</p>
  <div class="grid2">
    <div class="caja ok"><span class="t">🟢 Verde = HAZLO</span> Lo que SÍ debes hacer.</div>
    <div class="caja no"><span class="t">🔴 Rojo = NUNCA</span> Lo que NO debes hacer.</div>
    <div class="caja ojo"><span class="t">🟡 Amarillo = OJO</span> Algo importante a recordar.</div>
    <div class="caja info"><span class="t">🔵 Azul = DATO</span> Información útil.</div>
  </div>
  <div class="caja ojo" style="margin-top:14px;"><span class="t">⏱️ Los relojes verdes</span> te dicen cuánto demora cada tarea. Casi todo toma segundos.</div>
  <div class="regla"><span class="t">SI TE PIERDES</span><div class="b">Respira. Vuelve a la pantalla <b style="color:#fca5a5">Vender</b>. Desde ahí siempre puedes empezar de nuevo.</div></div>
`)}

${page('Tu día en 4 pasos', 3, `
  <h2>Tu día en 4 pasos ☀️</h2>
  <p class="lead">Todos los días es lo mismo, en este orden:</p>
  <div class="flujo">
    <div class="f"><div class="fe">🔑</div><div class="ft">1. Entrar</div><div class="fd">Inicia sesión</div></div>
    <div class="f"><div class="fe">💵</div><div class="ft">2. Abrir caja</div><div class="fd">Cuenta la plata</div></div>
    <div class="f"><div class="fe">🛒</div><div class="ft">3. Vender</div><div class="fd">Todo el turno</div></div>
    <div class="f"><div class="fe">🔒</div><div class="ft">4. Cerrar caja</div><div class="fd">Al terminar</div></div>
  </div>
  <div class="caja info"><span class="t">🔵 Regla simple</span> No puedes vender si la caja está cerrada. El paso 2 es obligatorio cada día.</div>
  <div class="caja ok"><span class="t">🟢 Tu trabajo en una frase</span> Abrir caja → vender y cobrar bien → cerrar caja contando la plata.</div>
`)}

${page('Paso 1 · Entrar al sistema', 4, `
  <h2>🔑 Entrar al sistema <span class="time">⏱️ 20 seg</span></h2>
  <ol class="pasos">
    ${paso(1, '📱', 'Abre la app <b>El Cartel de los Pollos</b>.')}
    ${paso(2, '👤', 'Escribe tu <b>usuario</b> y tu <b>contraseña</b>.')}
    ${paso(3, '✅', 'Toca <b>Ingresar</b>. Listo, ya estás dentro.')}
  </ol>
  <div class="caja no"><span class="t">🔴 NUNCA</span> Compartas tu contraseña. Lo que pase con tu usuario, queda a tu nombre.</div>
  <div class="caja ojo"><span class="t">🟡 OJO</span> Si la app se cierra sola por inactividad, no pasa nada: solo vuelve a entrar.</div>
  <div class="caja info"><span class="t">🔵 DATO</span> Arriba a la izquierda está el menú. El que más usarás es <b>Vender</b>.</div>
`)}

${page('Paso 2 · Abrir caja', 5, `
  <h2>💵 Abrir caja <span class="time">⏱️ 1–2 min</span></h2>
  <p class="lead">Esto le dice al sistema con cuánta plata empiezas.</p>
  <ol class="pasos">
    ${paso(1, '📂', 'Ve al menú y toca <b>Caja</b>.')}
    ${paso(2, '🔢', 'Cuenta el efectivo del cajón y escribe <b>cuántos</b> hay de cada billete/moneda.')}
    ${paso(3, '👀', 'Revisa que el <b>total</b> que muestra la pantalla sea igual a la plata real.')}
    ${paso(4, '✅', 'Toca <b>Abrir caja</b>.')}
  </ol>
  <div class="regla"><span class="t">REGLA DE ORO</span><div class="b">Cuenta la plata <b style="color:#fca5a5">de verdad</b>, billete por billete. No adivines. Así el cierre te va a cuadrar.</div></div>
  <div class="caja ok"><span class="t">🟢 Si todo bien</span> Verás arriba un sello verde: <b>CAJA ABIERTA</b>. Ya puedes vender.</div>
`)}

${page('Paso 3 · Vender productos', 6, `
  <h2>🛒 Vender productos <span class="time">⏱️ 30 seg por venta</span></h2>
  <ol class="pasos">
    ${paso(1, '🛒', 'Toca <b>Vender</b> y elige <b>Venta de productos</b>.')}
    ${paso(2, '🍗', 'Toca los productos que pide el cliente. Se van sumando al carrito.')}
    ${paso(3, '🧂', 'Si el producto pregunta presa o salsa, elige la <b>adición</b> y confirma.')}
    ${paso(4, '🧮', 'Revisa el <b>carrito</b> a la derecha: productos y total.')}
    ${paso(5, '💳', 'Toca <b>Cobrar / Pagar</b> para ir al cobro.')}
  </ol>
  <div class="grid2">
    <div class="caja ok"><span class="t">🟢 Para subir cantidad</span> Toca el producto otra vez (o usa + / −).</div>
    <div class="caja ojo"><span class="t">🟡 ¿Te equivocaste?</span> Quita el producto con − o el tachito antes de cobrar.</div>
  </div>
  <div class="caja info"><span class="t">🔵 DATO</span> El <b>número de orden</b> sirve para entregar el pedido correcto en despacho.</div>
`)}

${page('Paso 3 · Cobrar (métodos de pago)', 7, `
  <h2>💳 Cobrar <span class="time">⏱️ 15 seg</span></h2>
  <p class="lead">Ya tienes el carrito listo. Ahora cobra:</p>
  <ol class="pasos">
    ${paso(1, '💰', 'Elige cómo paga: <b>Efectivo</b>, <b>Tarjeta</b> o <b>Transferencia</b>.')}
    ${paso(2, '💵', 'Si es <b>efectivo</b>, escribe con cuánto paga y el sistema calcula el <b>vuelto</b>.')}
    ${paso(3, '✅', 'Toca <b>Confirmar venta</b>.')}
    ${paso(4, '🧾', 'Imprime o envía la <b>boleta</b> por WhatsApp si el cliente la pide.')}
  </ol>
  <div class="caja ojo"><span class="t">🟡 Descuento</span> Solo aplica descuento si tu jefe lo autoriza. Queda registrado.</div>
  <div class="caja no"><span class="t">🔴 NUNCA</span> Cobres “de memoria” sin registrar la venta en la app. Toda venta va al sistema.</div>
  <div class="caja ok"><span class="t">🟢 Tip de oro</span> Repite en voz alta: “Son $X, ¿efectivo o tarjeta?”. Menos errores de vuelto.</div>
`)}

${page('Venta libre y reimprimir boleta', 8, `
  <h2>🧾 Venta libre y boletas</h2>
  <h3 style="font-size:18px; margin:6px 0;">Venta libre <span class="time">⏱️ 15 seg</span></h3>
  <p class="lead" style="margin-bottom:8px;">Úsala cuando cobras un monto que NO está en la carta.</p>
  <ol class="pasos">
    ${paso(1, '🛒', 'En <b>Vender</b>, elige <b>Venta libre</b>.')}
    ${paso(2, '💲', 'Escribe el <b>monto</b> y elige el método de pago.')}
    ${paso(3, '✅', 'Confirma.')}
  </ol>
  <div style="height:8px;"></div>
  <h3 style="font-size:18px; margin:6px 0;">Reimprimir una boleta</h3>
  <ol class="pasos">
    ${paso(1, '🧾', 'Ve al menú <b>Ventas</b>.')}
    ${paso(2, '🔎', 'Busca la venta (por número de orden).')}
    ${paso(3, '🖨️', 'Toca el ícono de <b>boleta</b> 🧾 o <b>WhatsApp</b> 📲.')}
  </ol>
  <div class="caja info"><span class="t">🔵 DATO</span> Anular una venta NO lo hace el cajero. Si hay un error, <b>llama a tu supervisor</b>.</div>
`)}

${page('Despacho, horno y mermas', 9, `
  <h2>🛵 Otras tareas rápidas</h2>
  <h3 style="font-size:18px; margin:6px 0;">Despacho (entregar pedidos)</h3>
  <ol class="pasos">
    ${paso(1, '🛵', 'Abre <b>Despacho</b>. Verás los pedidos por número.')}
    ${paso(2, '➡️', 'Toca para avanzar: <b>Pendiente → En preparación → Listo → Entregado</b>.')}
  </ol>
  <div style="height:6px;"></div>
  <h3 style="font-size:18px; margin:6px 0;">Predicción de horno 🔮</h3>
  <div class="caja info"><span class="t">🔵 Para qué sirve</span> Te dice <b>cuántos pollos hornear hoy</b> y a qué hora poner cada tanda. Míralo al empezar el turno.</div>
  <div style="height:6px;"></div>
  <h3 style="font-size:18px; margin:6px 0;">Merma (lo que se echó a perder)</h3>
  <ol class="pasos">
    ${paso(1, '🗑️', 'Abre <b>Mermas</b>.')}
    ${paso(2, '✍️', 'Elige el insumo, la cantidad y escribe el <b>motivo</b> (siempre obligatorio).')}
  </ol>
  <div class="caja ojo"><span class="t">🟡 OJO</span> Registrar la merma es importante: así el inventario queda real y no te lo descuentan a ti.</div>
`)}

${page('Paso 4 · Cerrar caja', 10, `
  <h2>🔒 Cerrar caja (cierre ciego) <span class="time">⏱️ 2–3 min</span></h2>
  <p class="lead">Al terminar tu turno. Cuentas la plata sin ver el “esperado”.</p>
  <ol class="pasos">
    ${paso(1, '📂', 'Ve a <b>Caja</b> y toca <b>Cerrar caja</b>.')}
    ${paso(2, '🔢', 'Cuenta el efectivo real y escribe cuántos hay de cada denominación.')}
    ${paso(3, '💳', 'Escribe los totales de <b>tarjeta</b> y <b>transferencia</b> si los pide.')}
    ${paso(4, '✅', 'Confirma el cierre.')}
  </ol>
  <div class="caja info"><span class="t">🔵 ¿Por qué “ciego”?</span> No verás cuánto “debería” haber. Es a propósito: tú cuentas honesto y el sistema compara después. No es una trampa.</div>
  <div class="regla"><span class="t">REGLA DE ORO</span><div class="b">Cuenta <b style="color:#fca5a5">sin apuro</b> y escribe lo que REALMENTE hay. Si algo no cuadra, avisa a tu supervisor — no lo escondas.</div></div>
`)}

${page('Cuando algo sale mal', 11, `
  <h2>🆘 Cuando algo sale mal</h2>
  <div class="grid2">
    <div class="mini"><div class="mt">🔒 “Caja cerrada” y no puedo vender</div><div class="md">Ve a <b>Caja</b> y ábrela (Paso 2). Sin caja abierta no se vende.</div></div>
    <div class="mini"><div class="mt">📶 Se cayó el internet</div><div class="md">Sigue vendiendo: la app guarda las ventas y las envía sola cuando vuelve la señal.</div></div>
    <div class="mini"><div class="mt">❌ Me equivoqué en una venta</div><div class="md">El cajero no anula. <b>Llama a tu supervisor</b> para anularla.</div></div>
    <div class="mini"><div class="mt">🚪 Se cerró mi sesión</div><div class="md">Es normal tras un rato sin usarla. Solo vuelve a <b>entrar</b>.</div></div>
    <div class="mini"><div class="mt">🤔 No encuentro un botón</div><div class="md">Vuelve a <b>Vender</b> y empieza de nuevo. Respira, sin estrés.</div></div>
    <div class="mini"><div class="mt">💸 La caja no me cuadra</div><div class="md">No la “arregles” a mano. Cierra con lo real y avisa a tu supervisor.</div></div>
  </div>
  <div class="caja ok" style="margin-top:14px;"><span class="t">🟢 Regla anti-pánico</span> Ningún error se arregla escondiéndolo. Avisar siempre es lo correcto.</div>
`)}

${page('Las 5 reglas de oro', 12, `
  <h2>⭐ Tus 5 reglas de oro</h2>
  <ol class="pasos">
    ${paso(1, '💵', '<b>Cuenta la plata de verdad</b> al abrir y al cerrar.')}
    ${paso(2, '🧾', '<b>Toda venta va a la app.</b> Nada “por fuera”.')}
    ${paso(3, '🔑', '<b>Tu usuario es tuyo.</b> No lo prestes.')}
    ${paso(4, '🙋', '<b>Si algo falla, avisa.</b> No lo escondas ni lo arregles a mano.')}
    ${paso(5, '😌', '<b>Sin estrés.</b> Si te pierdes, vuelve a Vender y respira.')}
  </ol>
  <div class="regla"><span class="t">RECUERDA</span><div class="b">Hacer bien estas 5 cosas = un turno tranquilo y una caja que cuadra. 🐔</div></div>
`)}

<!-- CHULETA DE BOLSILLO -->
<section class="pagina">
  ${head('Chuleta de bolsillo · recórtala')}
  <main>
    <h2>✂️ Chuleta de bolsillo</h2>
    <p class="lead">Recorta esta tarjeta y tenla cerca de la caja.</p>
    <div style="border:3px dashed var(--rojo); border-radius:18px; padding:18px;">
      <div style="display:flex; align-items:center; gap:10px; border-bottom:2px solid #e2e8f0; padding-bottom:8px; margin-bottom:10px;">
        <img src="${LOGO}" style="height:38px; border-radius:6px;" />
        <b style="font-size:16px;">Cajero — pasos rápidos</b>
      </div>
      <div class="grid2">
        <div class="mini"><div class="mt">🔑 Entrar</div><div class="md">Usuario + clave → Ingresar.</div></div>
        <div class="mini"><div class="mt">💵 Abrir caja</div><div class="md">Caja → cuenta plata → Abrir.</div></div>
        <div class="mini"><div class="mt">🛒 Vender</div><div class="md">Vender → productos → carrito → Cobrar.</div></div>
        <div class="mini"><div class="mt">💳 Cobrar</div><div class="md">Efectivo / Tarjeta / Transf. → Confirmar.</div></div>
        <div class="mini"><div class="mt">🔒 Cerrar caja</div><div class="md">Caja → Cerrar → cuenta real → Confirmar.</div></div>
        <div class="mini"><div class="mt">🆘 Error de venta</div><div class="md">No anulas tú → llama al supervisor.</div></div>
      </div>
      <div class="caja ojo" style="margin-top:12px;"><span class="t">🟡 Nunca</span> vendas con caja cerrada · nunca cobres “por fuera” · nunca prestes tu clave.</div>
    </div>
  </main>
  ${foot(13)}
</section>

</body>
</html>`;

writeFileSync(join(__dirname, 'manual-cajero.html'), html, 'utf8');
console.log('✓ Generado docs/manual-cajero.html (' + Math.round(html.length / 1024) + ' KB)');
