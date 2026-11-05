/*
 * Maco iframe bridge (protocol maco-game/v1) for engines that cannot import src/maco-iframe-bridge.ts,
 * such as Unity, Godot or plain HTML. Copy this file to the zip root and load it from index.html with
 * <script src="maco-bridge.js"></script>. It only answers the host's handshake, so the Maco player
 * stops waiting; it ignores `init` and `locale`, and the game starts on its own.
 *
 * It answers only Maco's own pages (HOST_ORIGINS, the same list as src/maco-iframe-bridge.ts). When a page
 * outside Maco frames a copy, it replaces the document with a link to Maco Games, which takes the engine's
 * canvas off the page.
 */
(function () {
  'use strict';
  var PROTOCOL = 'maco-game/v1';
  var HOST_ORIGINS = ['https://macogame.com', 'https://macomanga.com', 'http://localhost:7070', 'http://localhost:6868'];
  var NOTICE = '<body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;min-height:100vh;padding:24px;box-sizing:border-box;font:16px/1.5 system-ui,sans-serif;background:#000;color:#fff;text-align:center">'
    + '<p style="margin:0">Trò chơi này chỉ chơi được trên Maco Games.</p>'
    + '<a href="https://macogame.com/" style="padding:12px 20px;border-radius:999px;background:#2563eb;color:#fff;font-weight:600;text-decoration:none">Chơi tại macogame.com</a>'
    + '</body>';
  if (window.parent === window) return;

  function isHostOrigin(origin) {
    for (var i = 0; i < HOST_ORIGINS.length; i++) {
      if (HOST_ORIGINS[i] === origin) return true;
    }
    return false;
  }

  function showPlayOnMaco() {
    try { window.stop(); } catch (e) { /* not every browser exposes stop() */ }
    window.document.documentElement.innerHTML = NOTICE;
  }

  // Where the browser reports the embedding page, refuse a foreign one at once. "null" is not foreign: Maco frames
  // games with referrerpolicy="no-referrer", which hides its origin there, so the handshake decides.
  var ancestors = window.location && window.location.ancestorOrigins;
  var parentOrigin = ancestors && ancestors.length ? ancestors[0] : undefined;
  if (parentOrigin !== undefined && parentOrigin !== 'null' && !isHostOrigin(parentOrigin)) {
    showPlayOnMaco();
    return;
  }

  var hostOrigin;
  var refused = false;
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (refused || event.source !== window.parent) return;
    if (!data || data.protocol !== PROTOCOL || data.type !== 'host-ready') return;
    if (!isHostOrigin(event.origin)) {
      refused = true;
      showPlayOnMaco();
      return;
    }
    if (hostOrigin === undefined) hostOrigin = event.origin;
    if (event.origin !== hostOrigin) return;
    window.parent.postMessage({ protocol: PROTOCOL, type: 'ready' }, hostOrigin);
  });
  // A post whose target origin does not match the parent is dropped, so only a Maco parent hears this.
  for (var i = 0; i < HOST_ORIGINS.length; i++) {
    window.parent.postMessage({ protocol: PROTOCOL, type: 'ready' }, HOST_ORIGINS[i]);
  }
})();
