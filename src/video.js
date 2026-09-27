/* Video backgrounds: MP4 / WebM / MOV clips in the background library.
 * Preview: a muted <video> element kept in sync with the song clock (plays while the song plays, seeks while scrubbing).
 * Export: frame-exact decoding with Mediabunny's CanvasSink (sequential cursor, restarted on jumps). */
'use strict';
LM.video = (() => {
  const U = LM.U;
  const S = { playing: false, onFrame: null, list: new Set() };
  const isVideoBlob = (b) => !!b && /^video\//.test(b.type || '');
  const isVideoFile = (f) => !!f && (/^video\//.test(f.type || '') || /\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name || ''));

  /* ---------- preview source ---------- */
  class PreviewSrc {
    constructor(el, blob) {
      this.isVideo = true; this.el = el; this.blob = blob;
      this.width = el.videoWidth || 1280; this.height = el.videoHeight || 720; this.duration = isFinite(el.duration) ? el.duration : 0;
      this.thumb = document.createElement('canvas'); this.src = ''; this.lastUse = 0; this.rate = 1;
      el.addEventListener('seeked', () => { if (!S.playing && S.onFrame) S.onFrame(); });
      el.addEventListener('loadeddata', () => { if (S.onFrame) S.onFrame(); });
      S.list.add(this);
    }
    // drawable for video time vt (seconds inside the clip)
    source(vt, rate) {
      const el = this.el; this.lastUse = performance.now();
      if (!isFinite(vt)) vt = 0;
      const r = U.clamp(rate || 1, 0.25, 4);
      if (S.playing) {
        if (el.playbackRate !== r) el.playbackRate = r;
        if (el.paused) el.play().catch(() => {});
        if (!el.seeking && Math.abs(el.currentTime - vt) > 0.3) el.currentTime = vt;
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && Math.abs(el.currentTime - vt) > 0.02) el.currentTime = vt;
      }
      return el.readyState >= 2 ? el : this.thumb;
    }
    dispose() { try { this.el.pause(); URL.revokeObjectURL(this.el.src); this.el.removeAttribute('src'); this.el.load(); } catch (e) {} S.list.delete(this); }
  }
  // pause clips that are no longer on screen
  setInterval(() => { const now = performance.now(); S.list.forEach((v) => { if (!v.el.paused && now - v.lastUse > 400) v.el.pause(); }); }, 500);

  function create(blob) {
    return new Promise((res, rej) => {
      const el = document.createElement('video');
      el.muted = true; el.playsInline = true; el.preload = 'auto'; el.loop = false; el.crossOrigin = 'anonymous';
      el.setAttribute('muted', ''); el.setAttribute('playsinline', '');
      const url = URL.createObjectURL(blob);
      let done = false;
      const fail = () => { if (done) return; done = true; URL.revokeObjectURL(url); rej(new Error('video decode failed')); };
      el.onerror = fail;
      const to = setTimeout(fail, 20000);
      el.onloadeddata = async () => {
        if (done) return;
        const v = new PreviewSrc(el, blob);
        // poster frame for the library thumbnail
        try {
          await new Promise((r2) => { const t = Math.min(1, (el.duration || 2) * 0.2); el.onseeked = () => { el.onseeked = null; r2(); }; el.currentTime = t; setTimeout(r2, 2500); });
          const k = Math.min(1, 480 / Math.max(el.videoWidth, el.videoHeight));
          v.thumb.width = Math.max(2, Math.round(el.videoWidth * k)); v.thumb.height = Math.max(2, Math.round(el.videoHeight * k));
          v.thumb.getContext('2d').drawImage(el, 0, 0, v.thumb.width, v.thumb.height);
          v.src = v.thumb.toDataURL('image/jpeg', 0.8);
        } catch (e) {}
        v.width = el.videoWidth; v.height = el.videoHeight; v.duration = el.duration;
        done = true; clearTimeout(to); res(v);
      };
      el.src = url;
    });
  }

  /* ---------- export source (frame exact) ---------- */
  async function exportSrc(pv, maxW) {
    const MB = window.Mediabunny;
    try {
      const input = new MB.Input({ source: new MB.BlobSource(pv.blob), formats: MB.ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) throw new Error('cannot decode');
      const dw = (typeof track.getDisplayWidth === 'function' ? await track.getDisplayWidth() : track.displayWidth) || pv.width;
      const dh = (typeof track.getDisplayHeight === 'function' ? await track.getDisplayHeight() : track.displayHeight) || pv.height;
      const w = Math.max(2, Math.min(dw, Math.round(maxW))), h = Math.max(2, Math.round(w * dh / dw));
      const sink = new MB.CanvasSink(track, { width: w, height: h, fit: 'fill', poolSize: 6 });
      const t0 = await track.getFirstTimestamp(), dur = await track.computeDuration();
      const blank = document.createElement('canvas'); blank.width = w; blank.height = h;
      let it = null, cur = null, nxt = null;
      const src = {
        isVideo: true, width: w, height: h, duration: dur - t0, exact: true,
        async seek(vt) {
          vt = U.clamp(t0 + vt, t0, Math.max(t0, dur - 1e-3));
          if (cur && vt >= cur.timestamp - 2e-3 && vt < cur.timestamp + (cur.duration || 1 / 30) - 2e-3) return;
          if (!it || !cur || vt < cur.timestamp - 1e-6 || vt > cur.timestamp + 1.5) {
            if (it) { try { await it.return(); } catch (e) {} }
            // start a little before so the frame covering vt is included
            it = sink.canvases(Math.max(t0, vt - 0.1)); nxt = null;
            const r = await it.next(); cur = r.done ? cur : r.value;
          }
          for (;;) {
            if (!nxt) { const r = await it.next(); if (r.done) break; nxt = r.value; }
            if (nxt.timestamp <= vt + 2e-3) { cur = nxt; nxt = null; } else break;
          }
        },
        source() { return cur ? cur.canvas : blank; },
        get ts() { return cur ? cur.timestamp - t0 : null; },
        async dispose() { if (it) { try { await it.return(); } catch (e) {} } try { input.dispose && input.dispose(); } catch (e) {} },
      };
      return src;
    } catch (e) {
      console.warn('[LM.video] frame-exact decode unavailable, falling back to <video> seeking:', e && e.message);
      // fallback: seek the <video> element (slower, still correct to ~1 frame)
      const el = pv.el;
      const cv = document.createElement('canvas'); const w = Math.min(pv.width, Math.round(maxW)); cv.width = w; cv.height = Math.round(w * pv.height / pv.width);
      return {
        isVideo: true, width: cv.width, height: cv.height, duration: pv.duration, exact: false,
        async seek(vt) { el.pause(); if (Math.abs(el.currentTime - vt) > 1e-3) await new Promise((r) => { el.onseeked = () => { el.onseeked = null; r(); }; el.currentTime = U.clamp(vt, 0, Math.max(0, pv.duration - 0.01)); setTimeout(r, 3000); }); cv.getContext('2d').drawImage(el, 0, 0, cv.width, cv.height); },
        source() { return cv; },
        async dispose() {},
      };
    }
  }
  // replace preview video sources with frame-exact export sources (images are passed through)
  async function forExport(images, maxW) {
    const out = Object.assign({}, images || {}), made = [];
    for (const [k, v] of Object.entries(images || {})) if (v && v.isVideo && v.blob) { const e = await exportSrc(v, maxW); out[k] = e; made.push(e); }
    out.__dispose = async () => { for (const e of made) await e.dispose(); };
    out.__hasVideo = made.length > 0;
    return out;
  }

  return {
    create, forExport, isVideoBlob, isVideoFile,
    setPlaying(b) { S.playing = !!b; if (!b) S.list.forEach((v) => v.el.pause()); },
    set onFrame(f) { S.onFrame = f; },
    get playing() { return S.playing; },
  };
})();
