/*
 * Maco iframe bridge (protocol maco-game/v1) for engines that cannot import src/maco-iframe-bridge.ts,
 * such as Unity, Godot or plain HTML. Copy this file to the zip root and load it from index.html with
 * <script src="maco-bridge.js"></script>. It only answers the host's handshake, so the Maco player
 * stops waiting; it ignores `init` and `locale`, and the game starts on its own.
 */
(function () {
  'use strict';
  var PROTOCOL = 'maco-game/v1';
  if (window.parent === window) return;
  var hostOrigin;
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.source !== window.parent || !/^https?:\/\//.test(event.origin)) return;
    if (!data || data.protocol !== PROTOCOL || data.type !== 'host-ready') return;
    if (hostOrigin === undefined) hostOrigin = event.origin;
    if (event.origin !== hostOrigin) return;
    window.parent.postMessage({ protocol: PROTOCOL, type: 'ready' }, hostOrigin);
  });
  window.parent.postMessage({ protocol: PROTOCOL, type: 'ready' }, '*');
})();
