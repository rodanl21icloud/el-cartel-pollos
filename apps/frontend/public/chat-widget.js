/* Chatbot de ventas — El Cartel de los Pollos. Widget vanilla, sin dependencias.
   Se integra en landing.html con <script defer src="/chat-widget.js">. */
(function () {
  'use strict';
  if (window.__cartelChat) return; window.__cartelChat = true;

  var ROJO = '#c8102e', ORO = '#f5a623', BG = '#141414';
  var css = '' +
    '.cc-launch{position:fixed;right:18px;bottom:18px;z-index:9998;width:60px;height:60px;border-radius:50%;background:' + ROJO + ';color:#fff;border:3px solid ' + ORO + ';box-shadow:0 8px 24px rgba(0,0,0,.4);cursor:pointer;font-size:28px;display:grid;place-items:center;transition:transform .15s}' +
    '.cc-launch:hover{transform:scale(1.06)}' +
    '.cc-tip{position:fixed;right:88px;bottom:34px;z-index:9998;background:#fff;color:#111;padding:8px 12px;border-radius:12px;font:600 13px/1.3 Inter,system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.25);max-width:200px}' +
    '.cc-tip:after{content:"";position:absolute;right:-6px;bottom:14px;border:6px solid transparent;border-left-color:#fff}' +
    '.cc-panel{position:fixed;right:18px;bottom:18px;z-index:9999;width:370px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 36px);background:' + BG + ';border:2px solid ' + ORO + ';border-radius:18px;display:none;flex-direction:column;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.55);font-family:Inter,system-ui,sans-serif}' +
    '.cc-open .cc-panel{display:flex}.cc-open .cc-launch,.cc-open .cc-tip{display:none}' +
    '.cc-head{background:' + ROJO + ';color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}' +
    '.cc-head b{font:800 16px Oswald,sans-serif;letter-spacing:.04em;text-transform:uppercase}' +
    '.cc-head .cc-st{font-size:11px;opacity:.85;display:block}' +
    '.cc-x{margin-left:auto;background:rgba(0,0,0,.25);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px}' +
    '.cc-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#0e0e0e}' +
    '.cc-msg{max-width:84%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-break:break-word}' +
    '.cc-bot{align-self:flex-start;background:#262626;color:#f0ece4;border-bottom-left-radius:4px}' +
    '.cc-user{align-self:flex-end;background:' + ORO + ';color:#1a1a1a;font-weight:600;border-bottom-right-radius:4px}' +
    '.cc-typing{align-self:flex-start;color:#aaa;font-size:13px;padding:4px 8px}' +
    '.cc-qr{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px}' +
    '.cc-qr button{background:transparent;border:1px solid ' + ORO + ';color:' + ORO + ';border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:600;cursor:pointer}' +
    '.cc-qr button:hover{background:' + ORO + ';color:#1a1a1a}' +
    '.cc-wa{display:block;margin:0 14px 8px;text-align:center;background:#25D366;color:#fff;font-weight:700;padding:10px;border-radius:12px;text-decoration:none;font-size:14px}' +
    '.cc-foot{display:flex;gap:8px;padding:10px;background:' + BG + ';border-top:1px solid #2a2a2a}' +
    '.cc-foot input{flex:1;background:#1f1f1f;border:1px solid #333;color:#fff;border-radius:12px;padding:10px 12px;font-size:14px;outline:none}' +
    '.cc-foot input:focus{border-color:' + ORO + '}' +
    '.cc-foot button{background:' + ROJO + ';border:none;color:#fff;width:44px;border-radius:12px;cursor:pointer;font-size:18px}' +
    '.cc-foot button:disabled{opacity:.5}' +
    '.cc-err{color:#ff9d9d;font-size:12.5px;text-align:center;padding:0 14px 6px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var root = document.createElement('div'); root.className = 'cc-root';
  root.innerHTML =
    '<div class="cc-tip">¿Hambre? 🍗 Te ayudo a pedir</div>' +
    '<button class="cc-launch" aria-label="Abrir chat">🍗</button>' +
    '<div class="cc-panel" role="dialog" aria-label="Chat de ventas">' +
      '<div class="cc-head"><span style="font-size:22px">🍗</span><div><b>El Cartel</b><span class="cc-st">Asistente de pedidos</span></div><button class="cc-x" aria-label="Cerrar">✕</button></div>' +
      '<div class="cc-body"></div>' +
      '<div class="cc-qr"></div>' +
      '<div class="cc-err" style="display:none"></div>' +
      '<div class="cc-foot"><input type="text" placeholder="Escribe tu mensaje…" aria-label="Mensaje" /><button aria-label="Enviar">➤</button></div>' +
    '</div>';
  document.body.appendChild(root);

  var $ = function (s) { return root.querySelector(s); };
  var body = $('.cc-body'), qr = $('.cc-qr'), errBox = $('.cc-err'), input = $('.cc-foot input'), sendBtn = $('.cc-foot button');
  var history = [];
  var GREET = '¡Hola! 🍗 Soy el asistente de El Cartel de los Pollos. ¿Quieres ver el menú, armar un combo o que te recomiende algo?';
  var QUICK = ['Ver menú', 'Recomiéndame un combo', 'Quiero hacer un pedido'];

  function open() { root.classList.add('cc-open'); if (!history.length) { addBot(GREET); setQuick(QUICK); } setTimeout(function () { input.focus(); }, 50); }
  function close() { root.classList.remove('cc-open'); }
  $('.cc-launch').onclick = open; $('.cc-tip').onclick = open; $('.cc-x').onclick = close;

  function scroll() { body.scrollTop = body.scrollHeight; }
  function bubble(cls, text) { var d = document.createElement('div'); d.className = 'cc-msg ' + cls; d.textContent = text; body.appendChild(d); scroll(); return d; }
  function addBot(t) { bubble('cc-bot', t); history.push({ role: 'assistant', content: t }); }
  function addUser(t) { bubble('cc-user', t); history.push({ role: 'user', content: t }); }
  function setQuick(arr) {
    qr.innerHTML = '';
    (arr || []).forEach(function (q) { var b = document.createElement('button'); b.textContent = q; b.onclick = function () { send(q); }; qr.appendChild(b); });
  }
  function waButton(url) { var a = document.createElement('a'); a.className = 'cc-wa'; a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '🟢 Seguir en WhatsApp'; qr.parentNode.insertBefore(a, qr.nextSibling); }

  var busy = false;
  function send(text) {
    text = (text || input.value).trim(); if (!text || busy) return;
    input.value = ''; errBox.style.display = 'none'; setQuick([]); addUser(text);
    busy = true; sendBtn.disabled = true;
    var typing = document.createElement('div'); typing.className = 'cc-typing'; typing.textContent = 'escribiendo…'; body.appendChild(typing); scroll();

    fetch('/api/public/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        typing.remove();
        if (!res.ok || !res.j.reply) { addBot(res.j.reply || 'No pude responder ahora. Intenta de nuevo o sigue por WhatsApp.'); }
        else { addBot(res.j.reply); }
        if (res.j.wa) waButton(res.j.wa);
      })
      .catch(function () { typing.remove(); errBox.textContent = 'Sin conexión. Reintenta en un momento.'; errBox.style.display = 'block'; })
      .finally(function () { busy = false; sendBtn.disabled = false; input.focus(); });
  }

  sendBtn.onclick = function () { send(); };
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
})();
