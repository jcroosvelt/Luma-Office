// Compléments pour les navigateurs mobiles anciens (WebView Android, vieux Chrome) : pdf.js en a besoin, dans la page comme dans son worker.
/* eslint-disable */
(function (g) {
  if (!Promise.withResolvers) Promise.withResolvers = function () { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
  if (!Promise.try) Promise.try = function (fn, ...args) { return new Promise((res) => res(fn(...args))); };
  if (!Array.prototype.at) Object.defineProperty(Array.prototype, 'at', { value(i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return this[i]; }, writable: true, configurable: true });
  if (!Object.hasOwn) Object.hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  if (!Object.groupBy) Object.groupBy = (items, fn) => { const o = Object.create(null); let i = 0; for (const x of items) { const k = fn(x, i++); (o[k] ||= []).push(x); } return o; };
  if (!Map.groupBy) Map.groupBy = (items, fn) => { const m = new Map(); let i = 0; for (const x of items) { const k = fn(x, i++); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
  if (typeof URL !== 'undefined' && !URL.parse) URL.parse = (u, b) => { try { return new URL(u, b); } catch { return null; } };
  if (!Array.fromAsync) Array.fromAsync = async function (src) { const out = []; for await (const x of src) out.push(x); return out; };
  if (typeof Uint8Array !== 'undefined' && !Uint8Array.prototype.toHex) {
    Uint8Array.prototype.toHex = function () { let s = ''; for (const b of this) s += b.toString(16).padStart(2, '0'); return s; };
    Uint8Array.fromHex = (s) => Uint8Array.from(s.match(/../g) || [], (h) => parseInt(h, 16));
  }
  if (typeof Uint8Array !== 'undefined' && !Uint8Array.prototype.toBase64) {
    Uint8Array.prototype.toBase64 = function () { let s = ''; for (const b of this) s += String.fromCharCode(b); return btoa(s); };
    Uint8Array.fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  }
  if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
    ReadableStream.prototype[Symbol.asyncIterator] = async function* () { const r = this.getReader(); try { for (;;) { const { done, value } = await r.read(); if (done) return; yield value; } } finally { r.releaseLock(); } };
  }
  if (!Math.sumPrecise) Math.sumPrecise = (it) => { let s = 0; for (const x of it) s += x; return s; };
  if (typeof structuredClone === 'undefined') g.structuredClone = (v) => JSON.parse(JSON.stringify(v));
})(typeof globalThis !== 'undefined' ? globalThis : self);
