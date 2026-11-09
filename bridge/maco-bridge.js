/*
 * Maco iframe bridge for static (R2, Unity, Godot or plain HTML) builds.
 *
 * Add this file beside index.html and load it before the engine bundle:
 *
 *   <script src="maco-bridge.js"></script>
 *
 * It keeps the maco-game/v1 ready handshake and publishes `window.MacoBridge`.
 * The game can use the latter without importing any Maco package:
 *
 *   MacoBridge.on('locale', function (locale) { setLanguage(locale) })
 *   MacoBridge.on('input', function (input) { applyHostInput(input) })
 *   var ticket = await MacoBridge.requestRoomTicket(roomCode)
 *   var matchTicket = await MacoBridge.requestMatchTicket()
 *   var voiceTicket = await MacoBridge.requestVoiceTicket(roomCode)
 *   MacoBridge.submitScore(finalScore) // once per finished play
 *
 * `request*Ticket` deliberately only asks the embedding Maco page. It never
 * knows an API URL, cookie, private key or long-lived credential. The parent
 * must authorize the artifact's configured online game and reply with a
 * `online-ticket` message. A ticket is short-lived and is still validated by
 * the room/signalling service.
 *
 * `submitScore` only reports a finished play's score to the same host. The
 * host decides whether and how it counts; the bridge holds no score authority.
 */
(function () {
  'use strict';

  var PROTOCOL = 'maco-game/v1';
  var HOST_ORIGINS = ['https://macogame.com', 'https://macomanga.com', 'http://localhost:7070', 'http://localhost:6868'];
  var REQUEST_TIMEOUT_MS = 12_000;
  var MAX_PENDING_TICKETS = 8;
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
  var locale;
  var sequence = 0;
  var listeners = { init: [], locale: [], input: [] };
  var pendingTickets = Object.create(null);

  function emit(type, value) {
    var callbacks = listeners[type] || [];
    // Copy so an unsubscribe during a callback does not skip the next callback.
    callbacks.slice().forEach(function (callback) {
      try { callback(value); } catch (e) { setTimeout(function () { throw e; }, 0); }
    });
  }

  function makeRequestId() {
    sequence += 1;
    var random = '';
    try {
      var bytes = new Uint32Array(1);
      window.crypto.getRandomValues(bytes);
      random = bytes[0].toString(36);
    } catch (e) {
      random = Math.random().toString(36).slice(2);
    }
    return 'maco-' + Date.now().toString(36) + '-' + sequence.toString(36) + '-' + random;
  }

  function uuidV4() {
    var cryptoApi = window.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
      try { return cryptoApi.randomUUID(); } catch (e) { /* insecure context: fall back below */ }
    }
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') return undefined;
    var bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += (bytes[i] + 0x100).toString(16).slice(1);
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function submitScore(score) {
    if (refused || hostOrigin === undefined) return false;
    if (!Number.isSafeInteger(score) || score <= 0) return false;
    var id = uuidV4();
    if (id === undefined) return false;
    window.parent.postMessage({ protocol: PROTOCOL, type: 'score', payload: { id: id, score: score } }, hostOrigin);
    return true;
  }

  function ticketError(message) {
    var error = new Error(message);
    error.name = 'MacoBridgeTicketError';
    return error;
  }

  function validTicket(ticket) {
    return ticket && typeof ticket === 'object'
      && typeof ticket.room === 'string' && ticket.room.length > 0 && ticket.room.length <= 32
      && typeof ticket.url === 'string' && ticket.url.length > 0 && ticket.url.length <= 2048
      && typeof ticket.ticket === 'string' && ticket.ticket.length > 0 && ticket.ticket.length <= 8192
      && typeof ticket.expiresAt === 'string' && ticket.expiresAt.length > 0 && ticket.expiresAt.length <= 64
      && typeof ticket.driver === 'string' && ticket.driver.length > 0 && ticket.driver.length <= 32;
  }

  function requestTicket(room, channel, matchmake) {
    if (hostOrigin === undefined) return Promise.reject(ticketError('Maco host handshake has not completed'));
    if (room !== null && (typeof room !== 'string' || room.length === 0 || room.length > 32)) {
      return Promise.reject(ticketError('Room code must be null or a string up to 32 characters'));
    }
    if (Object.keys(pendingTickets).length >= MAX_PENDING_TICKETS) {
      return Promise.reject(ticketError('Too many ticket requests are pending'));
    }
    var id = makeRequestId();
    return new Promise(function (resolve, reject) {
      var timeout = setTimeout(function () {
        delete pendingTickets[id];
        reject(ticketError('Maco host did not answer the ticket request'));
      }, REQUEST_TIMEOUT_MS);
      pendingTickets[id] = { resolve: resolve, reject: reject, timeout: timeout };
      window.parent.postMessage({
        protocol: PROTOCOL,
        type: 'online-ticket-request',
        payload: Object.assign({ id: id, room: room, channel: channel }, matchmake ? { matchmake: true } : {})
      }, hostOrigin);
    });
  }

  /** Public API for an engine bundle loaded after this script. */
  window.MacoBridge = {
    protocol: PROTOCOL,
    getLocale: function () { return locale; },
    /** Subscribe to `init`, `locale` or host-owned mobile `input`. Returns an unsubscribe function. */
    on: function (type, callback) {
      if (!listeners[type] || typeof callback !== 'function') return function () {};
      listeners[type].push(callback);
      return function () {
        var index = listeners[type].indexOf(callback);
        if (index !== -1) listeners[type].splice(index, 1);
      };
    },
    /** Gets a fresh gameplay room ticket. `null` creates a room; a code joins one. */
    requestRoomTicket: function (room) { return requestTicket(room === undefined ? null : room, 'game', false); },
    /** Joins the host-managed automatic queue for a two-player RTC game. */
    requestMatchTicket: function () { return requestTicket(null, 'game', true); },
    /** Gets a fresh, separate RTC ticket for optional room voice chat. */
    requestVoiceTicket: function (room) { return requestTicket(room, 'voice', false); },
    /**
     * Reports the score of one finished play to the Maco host. Call it once per play. Returns false, and sends
     * nothing, before the host handshake or when `score` is not a positive safe integer.
     */
    submitScore: submitScore
  };

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (refused || event.source !== window.parent || !data || data.protocol !== PROTOCOL) return;

    if (!isHostOrigin(event.origin)) {
      // Keep legacy behaviour: a foreign parent is rejected when it actively tries to complete the handshake.
      // Other protocol-shaped traffic is ignored so an unrelated postMessage cannot erase a running engine.
      if (data.type !== 'host-ready') return;
      refused = true;
      showPlayOnMaco();
      return;
    }

    if (data.type === 'host-ready') {
      if (hostOrigin === undefined) hostOrigin = event.origin;
      if (event.origin !== hostOrigin) return;
      window.parent.postMessage({ protocol: PROTOCOL, type: 'ready' }, hostOrigin);
      return;
    }
    if (hostOrigin === undefined || event.origin !== hostOrigin) return;

    if (data.type === 'init' || data.type === 'locale') {
      var nextLocale = data.payload && typeof data.payload.locale === 'string' && data.payload.locale.length <= 35
        ? data.payload.locale : undefined;
      locale = nextLocale;
      emit(data.type, nextLocale);
      return;
    }
    if (data.type === 'input' && data.payload && typeof data.payload === 'object') {
      emit('input', data.payload);
      return;
    }
    if (data.type === 'online-ticket' && data.payload && typeof data.payload.id === 'string') {
      var pending = pendingTickets[data.payload.id];
      if (!pending) return;
      delete pendingTickets[data.payload.id];
      clearTimeout(pending.timeout);
      if (data.payload.error === 'invalid' || data.payload.error === 'unavailable' || data.payload.error === 'denied') {
        pending.reject(ticketError(data.payload.error));
      } else if (validTicket(data.payload.ticket)) {
        pending.resolve(data.payload.ticket);
      } else {
        pending.reject(ticketError('Maco host returned an invalid room ticket'));
      }
    }
  });

  // `ready` contains no user data or authority. The host validates event.origin, while this bridge accepts
  // subsequent messages only from an allow-listed host. One wildcard discovery post avoids origin-mismatch errors.
  window.parent.postMessage({ protocol: PROTOCOL, type: 'ready' }, '*');
})();
