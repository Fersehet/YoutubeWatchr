// ==UserScript==
// @name         YT Music → OBS Now Playing
// @namespace    yt-music-obs
// @version      1.1.3
// @description  Sends the current YouTube Music track and a live audio spectrum to your YoutubeWatchr server.
// @match        https://music.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      localhost
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // The server on this computer. For your online server use its address, e.g.
  // 'https://ytw.example.com', and put the key from the editor (Connection) into KEY.
  const SERVER = 'http://127.0.0.1:8974';
  const KEY = '';
  const BANDS = 32;          // number of equalizer bars sent to the overlay
  const BAND_FPS = 30;       // spectrum updates per second
  const MIN_HZ = 40, MAX_HZ = 16000;
  const DB_FLOOR = -85, DB_CEIL = -30; // band loudness shown as empty .. full bar

  // ---- transport -----------------------------------------------------------
  let inFlight = 0;
  function send(payload) {
    if (inFlight > 2) return; // server down or slow: drop frames instead of piling up
    inFlight++;
    GM_xmlhttpRequest({
      method: 'POST',
      url: SERVER.replace(/\/+$/, '') + '/update',
      headers: KEY ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY } : { 'Content-Type': 'application/json' },
      data: JSON.stringify(payload),
      timeout: 1000,
      onload: () => inFlight--,
      onerror: () => inFlight--,
      ontimeout: () => inFlight--,
    });
  }

  // ---- track info ----------------------------------------------------------
  const $ = s => document.querySelector(s);
  const video = () => $('video');

  function bigArt(url) {
    // YT Music thumbnails carry their size in the URL; ask for a large one.
    return url ? url.replace(/=w\d+-h\d+[^&?]*/, '=w544-h544-l90-rj') : '';
  }

  // With gapless playback YT Music plays the next song in the same <video>
  // without resetting it, so currentTime and duration keep counting across
  // songs. So the song time starts over whenever the title changes, and the
  // player bar (its slider or the "1:23 / 3:45" text) corrects it whenever
  // the video clock drifts more than 1.5 s from what YT Music shows.
  let offset = 0, offsetTitle = '';
  const secs = s => s ? s.trim().split(':').reduce((a, b) => a * 60 + +b, 0) : NaN;
  function songTime(v, title) {
    if (!v) return { position: 0, duration: 0 };
    if (title && title !== offsetTitle) { if (offsetTitle) offset = v.currentTime; offsetTitle = title; }
    if (v.currentTime < offset) offset = 0; // a new song in a fresh <video>
    const bar = $('ytmusic-player-bar');
    const slider = bar?.querySelector('#progress-bar');
    const [shown, total] = (bar?.querySelector('.time-info')?.textContent || '').split('/').map(secs);
    let now = parseFloat(slider?.getAttribute('aria-valuenow'));
    let max = parseFloat(slider?.getAttribute('aria-valuemax'));
    if (!isFinite(now)) now = shown;
    if (!(max > 0)) max = total;
    if (isFinite(now) && Math.abs(v.currentTime - offset - now) > 1.5) offset = v.currentTime - now;
    const duration = max > 0 ? max : (isFinite(v.duration) ? v.duration - offset : 0);
    return { position: Math.max(0, v.currentTime - offset), duration };
  }

  function readTrack() {
    const v = video();
    const md = (unsafeWindow.navigator.mediaSession || navigator.mediaSession || {}).metadata;
    const bar = $('ytmusic-player-bar');
    const domTitle = bar?.querySelector('.title')?.textContent?.trim();
    const byline = bar?.querySelector('.byline')?.textContent?.trim() || '';
    const domArt = bar?.querySelector('img.image, .thumbnail img')?.src;

    let art = '';
    if (md?.artwork?.length) {
      art = [...md.artwork].sort((a, b) => parseInt(b.sizes) - parseInt(a.sizes))[0].src;
    }
    return {
      title: md?.title || domTitle || '',
      artist: md?.artist || byline.split('•')[0].trim(),
      album: md?.album || (byline.split('•')[1] || '').trim(),
      art: bigArt(art || domArt),
      playing: !!v && !v.paused && !v.ended,
      ...songTime(v, md?.title || domTitle || ''),
      ts: Date.now(),
    };
  }

  let lastKey = '';
  function pushTrack(force) {
    const t = readTrack();
    if (!t.title) return;
    const key = [t.title, t.artist, t.art, t.playing].join('|');
    if (force || key !== lastKey) {
      lastKey = key;
      send({ track: t });
    }
  }
  setInterval(() => pushTrack(true), 1000); // also keeps the progress bar in sync

  // ---- audio spectrum ------------------------------------------------------
  // Hooking the <video> into Web Audio reroutes its sound through our
  // AudioContext. We only do it after a user gesture so the context starts
  // "running"; a suspended context would mute playback.
  let ctx, analyser, freq, hookedEl, bandBins;

  function buildBands(sampleRate, fftSize) {
    const binHz = sampleRate / fftSize;
    const edges = [];
    for (let i = 0; i <= BANDS; i++) {
      edges.push(MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, i / BANDS));
    }
    // Each band gets its own FFT bins (the lowest bands would otherwise share
    // one bin and always show the same height) and its center frequency.
    bandBins = [];
    let prev = 1;
    for (let i = 0; i < BANDS; i++) {
      const lo = Math.max(prev, Math.round(edges[i] / binHz));
      const hi = Math.max(lo + 1, Math.round(edges[i + 1] / binHz));
      bandBins.push([lo, hi, Math.sqrt(edges[i] * edges[i + 1])]);
      prev = hi;
    }
  }

  function hook() {
    const v = video();
    if (!v || v === hookedEl) return;
    try {
      if (!ctx) {
        ctx = new AudioContext();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 4096;
        analyser.smoothingTimeConstant = 0.4; // keeps the hits; the overlay smooths the fall
        analyser.connect(ctx.destination);
        freq = new Float32Array(analyser.frequencyBinCount);
        buildBands(ctx.sampleRate, analyser.fftSize);
      }
      ctx.createMediaElementSource(v).connect(analyser);
      hookedEl = v;
      console.log('[YoutubeWatchr] audio spectrum hooked');
    } catch (e) {
      console.warn('[YoutubeWatchr] could not hook audio, overlay will use simulated bars', e);
      hookedEl = v; // don't retry the same element
    }
  }

  function onGesture() {
    hook();
    if (ctx && ctx.state !== 'running') ctx.resume();
  }
  ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, onGesture, true));

  let sentSilence = false;
  setInterval(() => {
    const v = video();
    if (!analyser || !v || hookedEl !== v) return;
    if (ctx.state !== 'running') { ctx.resume(); return; }
    if (v.paused) {
      if (!sentSilence) { send({ bands: new Array(BANDS).fill(0) }); sentSilence = true; }
      return;
    }
    sentSilence = false;
    // Loudness of each band: the mean power of its bins in dB, tilted up by
    // 3 dB per octave so lows, mids and highs of a typical mix (which, like
    // pink noise, gets quieter towards the highs) come out equally tall.
    // DB_FLOOR..DB_CEIL is mapped to 0..255; pink noise at -16 dBFS sits at 55%.
    analyser.getFloatFrequencyData(freq);
    const bands = bandBins.map(([lo, hi, fc]) => {
      let p = 0;
      for (let i = lo; i < hi; i++) p += Math.pow(10, freq[i] / 10);
      const db = 10 * Math.log10(p / (hi - lo) + 1e-20) + 3 * Math.log2(fc / 1000);
      return Math.round(255 * Math.min(1, Math.max(0, (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR))));
    });
    send({ bands });
  }, 1000 / BAND_FPS);

  // ---- react to player events ---------------------------------------------
  function watchVideo() {
    const v = video();
    if (!v || v.__ytObs) return;
    v.__ytObs = true;
    ['play', 'pause', 'ended', 'loadedmetadata', 'seeked'].forEach(ev =>
      v.addEventListener(ev, () => pushTrack(true)));
    v.addEventListener('play', () => { if (ctx && ctx.state !== 'running') ctx.resume(); });
  }
  let pending = 0;
  new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => { pending = 0; watchVideo(); pushTrack(false); }, 250);
  })
    .observe(document.body, { subtree: true, childList: true, characterData: true });
  watchVideo();
})();
