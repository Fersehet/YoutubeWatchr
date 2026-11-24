// YoutubeWatchr: the part that has to run in the page's own JS world.
// 1. Song clock: YT Music's player (#movie_player) knows the position within the
//    current song, also with gapless playback and crossfades of other extensions.
//    Its methods only exist in the page's world, so content.js gets them from here.
// 2. Spectrum for pages whose sound already runs through Web Audio: some YT Music
//    extensions (e.g. Velvetone with its EQ and crossfade) route the <video> through
//    their own AudioContext in the page. An element can only feed one Web Audio
//    graph, so content.js can't hook it then. We listen to whatever reaches the
//    speakers (after their EQ, limiter and crossfade) and hand the bars to
//    content.js. Band math is the same as there.
// Values go to content.js as JSON strings in CustomEvents: strings cross from the
// page into the extension's world reliably, objects don't.
(function () {
  'use strict';
  // Only for the page's own world (Firefox before 128 ignores "world": "MAIN").
  if (window.__ytwPage || (typeof chrome !== 'undefined' && chrome.runtime?.id)) return;
  window.__ytwPage = true;

  // ---- song clock ----------------------------------------------------------
  setInterval(() => {
    const p = document.getElementById('movie_player');
    if (typeof p?.getCurrentTime !== 'function') return;
    try {
      const position = +p.getCurrentTime(), duration = +p.getDuration();
      if (!isFinite(position) || !(duration > 0)) return;
      document.dispatchEvent(new CustomEvent('ytw:time', { detail: JSON.stringify({ position, duration }) }));
    } catch { /* player not ready */ }
  }, 250);

  // ---- spectrum of the page's own Web Audio --------------------------------

  const BANDS = 32, BAND_FPS = 30;
  const MIN_HZ = 40, MAX_HZ = 16000;
  const DB_FLOOR = -85, DB_CEIL = -30;

  function buildBands(sampleRate, fftSize) {
    const binHz = sampleRate / fftSize;
    const edges = [];
    for (let i = 0; i <= BANDS; i++) edges.push(MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, i / BANDS));
    const bins = [];
    let prev = 1;
    for (let i = 0; i < BANDS; i++) {
      const lo = Math.max(prev, Math.round(edges[i] / binHz));
      const hi = Math.max(lo + 1, Math.round(edges[i + 1] / binHz));
      bins.push([lo, hi, Math.sqrt(edges[i] * edges[i + 1])]);
      prev = hi;
    }
    return bins;
  }

  // One analyser per AudioContext, fed by every node that plays to the speakers.
  const taps = new Map();
  // Tells content.js that the page plays the <video> through Web Audio itself, so it
  // must not grab the element.
  const mark = () => document.documentElement?.setAttribute('data-ytw-page-audio', '');
  function tap(node) {
    const ctx = node.context;
    if (!(ctx instanceof AudioContext)) return; // skip OfflineAudioContext (rendering, fingerprinting)
    mark();
    let t = taps.get(ctx);
    if (!t) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.4;
      t = { analyser, freq: new Float32Array(analyser.frequencyBinCount), bins: buildBands(ctx.sampleRate, analyser.fftSize), nodes: new WeakSet() };
      taps.set(ctx, t);
      console.log('[YoutubeWatchr] spectrum taps the page audio');
    }
    if (!t.nodes.has(node)) { connect.call(node, t.analyser); t.nodes.add(node); }
  }

  const proto = AudioNode.prototype;
  const connect = proto.connect, disconnect = proto.disconnect;
  proto.connect = function (dest, ...rest) {
    const out = connect.call(this, dest, ...rest);
    try { if (dest instanceof AudioDestinationNode) tap(this); } catch { /* never break the page's audio */ }
    return out;
  };
  const cmes = AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource = function (el) {
    const node = cmes.call(this, el);
    mark();
    return node;
  };
  proto.disconnect = function (...args) {
    const out = disconnect.apply(this, args);
    try { taps.get(this.context)?.nodes.delete(this); } catch { /* ignore */ }
    return out;
  };

  // Velvetone may have wired its graph before this script ran: tap its limiter
  // (the node that plays to the speakers) directly.
  setInterval(() => {
    const v = window.__bytmAudio;
    try { if (v?.limiter && v.ctx?.state !== 'closed') tap(v.limiter); } catch { /* ignore */ }
  }, 1000);

  let silent = false;
  setInterval(() => {
    if (!taps.size) return;
    let t = null;
    for (const [ctx, cur] of taps) {
      if (ctx.state === 'closed') taps.delete(ctx);
      else if (ctx.state === 'running') t = cur;
    }
    if (!t) return;
    // No check for a paused <video>: a crossfade tail can still be playing then.
    // Silence comes out as all-zero bars, which are sent once.
    t.analyser.getFloatFrequencyData(t.freq);
    const bands = t.bins.map(([lo, hi, fc]) => {
      let p = 0;
      for (let i = lo; i < hi; i++) p += Math.pow(10, t.freq[i] / 10);
      const db = 10 * Math.log10(p / (hi - lo) + 1e-20) + 3 * Math.log2(fc / 1000);
      return Math.round(255 * Math.min(1, Math.max(0, (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR))));
    });
    const quiet = bands.every(b => b === 0);
    if (quiet && silent) return;
    silent = quiet;
    document.dispatchEvent(new CustomEvent('ytw:bands', { detail: JSON.stringify(bands) }));
  }, 1000 / BAND_FPS);
})();
