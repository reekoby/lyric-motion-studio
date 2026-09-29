/* Lyric Motion Studio — editor app */
'use strict';
(() => {
  const U = LM.U, D = LM.data, M = LM.motion, FX = LM.fx, MD = LM.model, R = LM.Renderer;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  const FR = MD.FR;
  const T = (x) => (LM.i18n ? LM.i18n.tx(x) : x), TXT = T;
  const plain = (t) => String(t ?? '').replace(/[|｜]([^《|｜]+)《[^》]*》/g, '$1').replace(/《[^》]*》/g, '').replace(/\*/g, '').replace(/\s*\/\s*/g, ' ');

  /* in-page dialog (native confirm/prompt are unavailable in some hosts) */
  function ask(msg, opts = {}) {
    return new Promise((res) => {
      const m = $('#askModal');
      $('#askMsg').textContent = msg;
      const inp = $('#askInput');
      inp.hidden = opts.input == null; inp.value = opts.input ?? '';
      $('#askOk').textContent = opts.ok || 'OK';
      m.classList.add('open');
      if (!inp.hidden) setTimeout(() => inp.select(), 30);
      const done = (v) => { m.classList.remove('open'); $('#askOk').onclick = $('#askCancel').onclick = null; res(v); };
      $('#askOk').onclick = () => done(opts.input != null ? inp.value : true);
      $('#askCancel').onclick = () => done(opts.input != null ? null : false);
      inp.onkeydown = (e) => { if (e.key === 'Enter') $('#askOk').click(); };
    });
  }

  /* ---------------- state ---------------- */
  let P = MD.newProject();
  const S = { sel: -1, t: 0, playing: false, clock0: 0, t0: 0, loop: false, tap: false, tapIdx: 0, tapDown: null, plans: [], planIdx: -1, palCat: 'all', dirty: true, images: {}, audioBlob: null, audioName: null, peaks: null, pvQ: 0.5, pvK: 0.75, rAvg: 0, rAdj: 0, multi: new Set(), tapW: 0, clip: null };
  const hist = { stack: [], idx: -1 };
  const au = $('#au');
  const view = new R({ canvas: $('#view'), W: 960, H: 540, images: S.images, audio: { get analysis() { return LM.audio.analysis; }, spectrum: LM.audio.spectrum, waveAt: LM.audio.waveAt } });

  /* ---------------- utils ---------------- */
  const toastEl = $('#toast');
  let toastT;
  function toast(msg, err) { toastEl.textContent = msg; toastEl.className = 'toast show' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => (toastEl.className = 'toast' + (err ? ' err' : '')), err ? 4200 : 2400); }
  const cues = () => P.cues;
  const selCue = () => P.cues[S.sel] || null;
  const dur = () => P.duration || 30;
  function sortCues() { const id = selCue() && selCue().id; P.cues.sort((a, b) => a.start - b.start); if (id) S.sel = P.cues.findIndex((c) => c.id === id); }

  /* ---------------- history / autosave ---------------- */
  const snapshot = () => JSON.stringify(P);
  function commit(opts = {}) {
    const s = snapshot();
    if (hist.stack[hist.idx] !== s) {
      hist.stack.length = hist.idx + 1;
      hist.stack.push(s);
      if (hist.stack.length > 120) hist.stack.shift();
      hist.idx = hist.stack.length - 1;
    }
    autosave();
    S.dirty = true;
    if (!opts.quiet) refresh(opts);
    updateUndo();
  }
  const commitSoon = U.debounce(() => commit({ keep: true }), 350);
  function undo() { if (hist.idx > 0) { hist.idx--; P = JSON.parse(hist.stack[hist.idx]); afterLoad(true); } }
  function redo() { if (hist.idx < hist.stack.length - 1) { hist.idx++; P = JSON.parse(hist.stack[hist.idx]); afterLoad(true); } }
  function updateUndo() { $('#undo').disabled = hist.idx <= 0; $('#redo').disabled = hist.idx >= hist.stack.length - 1; }
  let saveWarned = false;
  const autosave = U.debounce(() => { const ok = U.store.set('lms.project', P); if (!ok && !saveWarned) { saveWarned = true; toast('ブラウザーの保存容量が足りず、自動保存できませんでした。「ファイル」から保存してください', true); } if (ok) saveWarned = false; }, 600);

  // IndexedDB for audio
  const idb = {
    open() { return new Promise((res, rej) => { try { const r = indexedDB.open('lms', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); },
    async set(k, v) { try { const db = await this.open(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) {} },
    async del(k) { try { const db = await this.open(); await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {} },
    async keys() { try { const db = await this.open(); return await new Promise((res) => { const tx = db.transaction('kv', 'readonly'); const r = tx.objectStore('kv').getAllKeys(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); } catch (e) { return []; } },
    async get(k) { try { const db = await this.open(); return await new Promise((res) => { const tx = db.transaction('kv', 'readonly'); const r = tx.objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); } catch (e) { return null; } },
  };

  /* ---------------- audio ---------------- */
  async function loadAudio(file, silent) {
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) return toast('音源は200MBまでです', true);
    const name = file.name || 'audio';
    try {
      $('#audioName').textContent = '読み込み中… ' + name; $('#audioInfo').hidden = false;
      const buf = await file.arrayBuffer();
      const ab = await LM.audio.decode(buf);
      if (ab.duration < 1 || ab.duration > 1200) throw new Error('曲の長さは1秒〜20分に対応しています');
      LM.audio.setBuffer(ab);
      S.audioBlob = file; S.audioName = name; P.audioName = name;
      if (au.src) URL.revokeObjectURL(au.src);
      au.src = URL.createObjectURL(file);
      const oldDur = P.duration;
      P.duration = Math.round(ab.duration * 1000) / 1000;
      S.peaks = LM.audio.peaks(80);
      $('#audioName').textContent = name; $('#audioDur').textContent = U.fmtTime(ab.duration, false);
      $('#audioBpm').textContent = '解析中…';
      idb.set('audio', { blob: file, name });
      // clamp cues (do not re-place existing timing)
      if (P.cues.length && oldDur !== P.duration) {
        P.cues.forEach((c) => { if (c.end > P.duration) c.end = P.duration; if (c.start > P.duration - FR) c.start = Math.max(0, P.duration - FR); });
      }
      commit();
      const an = await LM.audio.analyze();
      $('#audioBpm').textContent = an && an.bpm ? `BPM ≈ ${an.bpm}` : 'BPM –';
      S.dirty = true; drawTL();
      if (!silent) toast('音源を読み込みました' + (an && an.bpm ? `（テンポ目安 ${an.bpm} BPM）` : ''));
    } catch (e) {
      console.error(e);
      $('#audioInfo').hidden = true;
      toast('音源を読み込めませんでした：' + (e.message || '対応していない形式です'), true);
    }
  }

  /* ---------------- playback ---------------- */
  const hasAudio = () => !!au.src && LM.audio.buffer;
  function now() {
    if (S.playing) return hasAudio() ? au.currentTime : S.t0 + (performance.now() - S.clock0) / 1000;
    return S.t;
  }
  function play() {
    if (S.playing) return;
    if (S.t >= dur() - 0.02) S.t = 0;
    S.playing = true; LM.video.setPlaying(true);
    if (hasAudio()) { au.currentTime = S.t; au.play().catch(() => {}); }
    else { S.t0 = S.t; S.clock0 = performance.now(); }
    setPlayIco();
  }
  function pause() {
    if (!S.playing) return;
    S.t = now(); S.playing = false; LM.video.setPlaying(false);
    if (hasAudio()) au.pause();
    setPlayIco(); S.dirty = true;
  }
  function toggle() { S.playing ? pause() : play(); }
  function seek(t) {
    t = U.clamp(t, 0, dur());
    S.t = t;
    if (hasAudio()) au.currentTime = t;
    if (S.playing && !hasAudio()) { S.t0 = t; S.clock0 = performance.now(); }
    S.dirty = true;
  }
  function setPlayIco() { $('#playIco').innerHTML = S.playing ? '<rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/>' : '<path d="M7 4v16l13-8z" fill="currentColor"/>'; }
  au.addEventListener('ended', () => { S.playing = false; LM.video.setPlaying(false); S.t = dur(); setPlayIco(); });

  /* ---------------- preview sizing & loop ---------------- */
  function fitFrame() {
    const [W, H] = D.aspects[P.aspect];
    const box = $('#viewBox').getBoundingClientRect();
    const pad = 36;
    const k = Math.min((box.width - pad) / W, (box.height - pad) / H);
    const fw = Math.max(80, W * k), fh = Math.max(45, H * k);
    const fr = $('#frame'); fr.style.width = fw + 'px'; fr.style.height = fh + 'px';
    const q = S.pvQ === 'auto' ? S.pvK : S.pvQ;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rw = Math.min(W * q, fw * dpr * 1.05), rh = rw * H / W;
    view.setSize(rw, rh);
    S.dirty = true;
  }
  let lastT = -1;
  function frame() {
    const t = now();
    if (S.playing) {
      const c = selCue();
      if (S.loop && c && (t >= c.end + 0.15 || t < c.start - 0.5)) { seek(c.start); }
      if (!hasAudio() && t >= dur()) { pause(); S.t = dur(); }
    }
    if (S.dirty || t !== lastT) {
      view.setProject(P);
      const r0 = performance.now();
      try { view.render(t, {}); } catch (e) { console.error(e); }
      adaptPreview(performance.now() - r0);
      lastT = t; S.dirty = false;
      $('#tNow').textContent = U.fmtTime(t);
      if (S.playing) followSel(t);
      markNow(t);
      drawTL();
      if (S.tap) updatePrompter(t);
    }
    requestAnimationFrame(frame);
  }
  // adaptive preview resolution: keep playback smooth, sharpen when idle
  function adaptPreview(ms) {
    if (S.pvQ !== 'auto') return;
    S.rAvg = S.rAvg ? S.rAvg * 0.9 + ms * 0.1 : ms;
    const nowMs = performance.now(); if (nowMs - S.rAdj < 900) return;
    let k = S.pvK;
    if (S.playing && S.rAvg > 22 && k > 0.3) k = Math.max(0.3, k * 0.82);
    else if (S.rAvg < (S.playing ? 9 : 30) && k < 1) k = Math.min(1, k * 1.15);
    if (Math.abs(k - S.pvK) > 0.01) { S.pvK = k; S.rAdj = nowMs; fitFrame(); }
  }
  let lastActive = -1;
  function followSel(t) {
    const i = P.cues.findIndex((c) => t >= c.start && t < c.end);
    if (i >= 0 && i !== lastActive && !S.loop && !S.tap) { lastActive = i; if (S.sel !== i) { S.sel = i; renderInspector(); markList(); } }
  }

  /* ---------------- timeline ---------------- */
  const tl = $('#tl'), tlc = tl.getContext('2d');
  const TL = { pps: 40, scroll: 0, drag: null, H: 150 };
  function tlSize() {
    const r = tl.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    tl.width = Math.round(r.width * dpr); tl.height = Math.round(r.height * dpr);
    TL.dpr = dpr; TL.w = r.width; TL.h = r.height;
  }
  const x2t = (x) => (x + TL.scroll) / TL.pps;
  const t2x = (t) => t * TL.pps - TL.scroll;
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  let colors = {};
  function readColors() { colors = { bg: css('--panel'), sunk: css('--sunk'), line: css('--line'), text: css('--text'), dim: css('--dim'), faint: css('--faint'), acc: css('--acc'), bad: css('--bad'), panel2: css('--panel2') }; }
  function drawTL() {
    if (!TL.w) return;
    const c = tlc, W = TL.w, H = TL.h, t = now();
    c.setTransform(TL.dpr, 0, 0, TL.dpr, 0, 0);
    c.fillStyle = colors.sunk; c.fillRect(0, 0, W, H);
    const rulerH = 22, secH = 14, trackY = rulerH + secH + 40, trackH = H - trackY - 8;
    // follow playhead
    if (S.playing && !TL.drag) { const px = t2x(t); if (px > W * 0.85 || px < 0) TL.scroll = Math.max(0, t * TL.pps - W * 0.2); }
    const tlEnd = Math.max(dur(), ...P.cues.map((q) => q.end));
    TL.scroll = U.clamp(TL.scroll, 0, Math.max(0, tlEnd * TL.pps - W + 40));
    // ruler
    c.fillStyle = colors.bg; c.fillRect(0, 0, W, rulerH);
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60];
    const step = steps.find((s) => s * TL.pps >= 60) || 60;
    c.fillStyle = colors.faint; c.strokeStyle = colors.line; c.font = '10px Inter, sans-serif'; c.textBaseline = 'middle';
    for (let s = Math.floor(x2t(0) / step) * step; s <= x2t(W); s += step) {
      const x = t2x(s); c.beginPath(); c.moveTo(x + 0.5, rulerH - 7); c.lineTo(x + 0.5, H); c.globalAlpha = 0.5; c.stroke(); c.globalAlpha = 1;
      c.fillText(U.fmtTime(s, false), x + 4, rulerH / 2);
    }
    // song-structure band
    const sy = rulerH; c.fillStyle = colors.bg; c.fillRect(0, sy, W, secH);
    const secs = P.sections || [];
    c.font = 'bold 9.5px Inter, "Noto Sans JP", sans-serif'; c.textBaseline = 'middle';
    secs.forEach((sc, k) => {
      const m = MD.SEC[sc.type]; if (!m) return;
      const x0 = t2x(sc.t), x1 = t2x(k < secs.length - 1 ? secs[k + 1].t : Math.max(dur(), sc.t + 1));
      if (x1 < 0 || x0 > W) return;
      c.fillStyle = m.col; c.globalAlpha = sc.est ? 0.42 : 0.85; rr(c, x0 + 0.5, sy + 1.5, Math.max(2, x1 - x0 - 1.5), secH - 3, 3); c.fill(); c.globalAlpha = 1;
      if (TL.secDrag && TL.secDrag.k === k) { c.fillStyle = colors.text; c.fillRect(x0, sy, 2, secH); }
      if (x1 - x0 > 26) { c.save(); c.beginPath(); c.rect(x0, sy, x1 - x0 - 2, secH); c.clip(); c.fillStyle = '#fff'; c.fillText(T(m.n) + (sc.est ? T('（推定）') : ''), x0 + 5, sy + secH / 2 + 0.5); c.restore(); }
    });
    if (!secs.length && TL.w > 300) { c.fillStyle = colors.faint; c.font = '9.5px Inter, "Noto Sans JP", sans-serif'; c.fillText(T('曲構成：ダブルクリックでマーカー追加（おまかせタブで自動推定）'), 8, sy + secH / 2); }
    TL.secY = sy; TL.secH = secH;
    // background-image change points
    try { view.setProject(P); const sl = view.imageSlots && view.imageSlots(); if (sl) { c.save(); sl.forEach((q, i) => { const x = t2x(q.t0); if (x < -20 || x > W) return; const im0 = q.id && S.images['img:' + q.id], im = im0 && im0.isVideo ? im0.thumb : im0; c.fillStyle = colors.bg; c.fillRect(x, 2, 26, 16); if (im) c.drawImage(im, x + 1, 3, 24, 14); c.strokeStyle = colors.acc; c.lineWidth = 1; c.strokeRect(x + 0.5, 2.5, 25, 15); }); c.restore(); } } catch (e) {}
    // waveform
    const wy = rulerH + secH + 20;
    if (S.peaks) {
      const pk = S.peaks; c.fillStyle = colors.dim; c.globalAlpha = 0.45;
      for (let x = 0; x < W; x++) {
        const t0 = x2t(x), t1 = x2t(x + 1); let a = 0, b = 0;
        for (let i = Math.floor(t0 * pk.pps); i < Math.ceil(t1 * pk.pps); i++) { if (pk.mn[i] < a) a = pk.mn[i]; if (pk.mx[i] > b) b = pk.mx[i]; }
        c.fillRect(x, wy - b * 18, 1, Math.max(1, (b - a) * 18));
      }
      c.globalAlpha = 1;
    } else { c.fillStyle = colors.faint; c.fillText(T('音源を読み込むと波形が表示されます'), 10, wy); }
    // beats
    const an = LM.audio.analysis;
    let beats = an && an.beats;
    if (P.bpm > 0) { beats = []; for (let b = P.beatOffset || 0; b < dur(); b += 60 / P.bpm) beats.push(b); }
    if (beats && TL.pps > 25) { c.fillStyle = colors.acc; c.globalAlpha = 0.5; for (const b of beats) { const x = t2x(b); if (x < -2 || x > W) continue; c.fillRect(x, rulerH, 1, 5); } c.globalAlpha = 1; }
    // cues
    c.font = '12px "Noto Sans JP", sans-serif';
    const iss = new Set(MD.validate(P).filter((x) => x.type !== 'over').map((x) => x.i));
    P.cues.forEach((q, i) => {
      const x0 = t2x(q.start), x1 = t2x(q.end);
      if (x1 < -4 || x0 > W + 4) return;
      const on = i === S.sel, tapI = S.tap && i === S.tapIdx, ms = S.multi.has(q.id);
      c.fillStyle = on ? colors.acc : colors.panel2;
      if (ms && !on) { c.fillStyle = colors.acc; c.globalAlpha = 0.45; }
      c.strokeStyle = iss.has(i) ? colors.bad : on ? colors.acc : colors.line;
      rr(c, x0, trackY, Math.max(2, x1 - x0), trackH, 5); c.fill(); c.globalAlpha = 1; c.lineWidth = tapI ? 2.5 : 1; if (tapI || ms) c.strokeStyle = colors.acc; c.stroke();
      // word stamps
      if (Array.isArray(q.words) && x1 - x0 > 10) { c.fillStyle = on ? '#fff' : colors.acc; q.words.forEach((w) => { if (w == null) return; const wx = t2x(w); if (wx >= x0 && wx <= x1) c.fillRect(wx - 0.5, trackY + trackH - 13, 1.5, 8); }); }
      if (q.trans && q.trans !== 'none' && i > 0) { c.fillStyle = colors.acc; c.beginPath(); c.moveTo(x0 - 5, trackY - 2); c.lineTo(x0 + 5, trackY - 2); c.lineTo(x0, trackY + 6); c.fill(); }
      // palette stripe
      const pal = R.palOf(P, q);
      c.fillStyle = pal.accent; c.fillRect(x0 + 1, trackY + trackH - 4, Math.max(0, x1 - x0 - 2), 3);
      if (x1 - x0 > 24) {
        c.save(); c.beginPath(); c.rect(x0 + 4, trackY, x1 - x0 - 8, trackH); c.clip();
        c.fillStyle = on ? '#fff' : colors.text; c.textBaseline = 'top';
        c.fillText((q.locked ? '🔒 ' : '') + plain(q.text), x0 + 6, trackY + 6);
        c.fillStyle = on ? 'rgba(255,255,255,.75)' : colors.faint; c.font = '10px Inter, sans-serif';
        const tr = R.tracksOf(q);
        c.fillText(`${T((LM.layout.lib[q.scene.layout] || {}).n || '')} · ${T(M.enter[tr.enter].n)}`, x0 + 6, trackY + 24);
        c.font = '12px "Noto Sans JP", sans-serif';
        c.restore();
      }
    });
    // instrumental (no-lyric) zones
    if (P.gapFill !== 'off') {
      let gs = []; try { view.setProject(P); gs = view.gaps(); } catch (e) {}
      c.save();
      gs.forEach((g) => {
        const x0 = t2x(g.t0), x1 = t2x(g.t1); if (x1 < 0 || x0 > W || x1 - x0 < 3) return;
        c.save(); c.beginPath(); c.rect(x0 + 2, trackY + 4, x1 - x0 - 4, trackH - 8); c.clip();
        c.strokeStyle = colors.acc; c.globalAlpha = 0.28; c.lineWidth = 1;
        for (let x = x0 - trackH; x < x1; x += 8) { c.beginPath(); c.moveTo(x, trackY + trackH); c.lineTo(x + trackH, trackY); c.stroke(); }
        c.globalAlpha = 0.85; c.fillStyle = colors.acc; c.font = '10px Inter, "Noto Sans JP", sans-serif'; c.textBaseline = 'top';
        if (x1 - x0 > 50) c.fillText(T({ intro: 'イントロ', inter: 'インスト', outro: 'アウトロ' }[g.kind]) + ' ♪', Math.max(x0, 0) + 6, trackY + 8);
        c.restore();
      });
      c.restore();
    }
    // tap live marker
    if (S.tapDown != null) { c.fillStyle = colors.acc; c.globalAlpha = 0.35; const x0 = t2x(S.tapDown), x1 = t2x(t); c.fillRect(x0, trackY, Math.max(1, x1 - x0), trackH); c.globalAlpha = 1; }
    // playhead
    const px = t2x(t);
    c.fillStyle = colors.acc; c.fillRect(px - 0.5, 0, 1.5, H);
    c.beginPath(); c.moveTo(px - 6, 0); c.lineTo(px + 6, 0); c.lineTo(px, 8); c.fill();
    // end marker + overflow zone
    const ex = t2x(dur());
    if (ex < W) { c.fillStyle = colors.bad; c.globalAlpha = 0.08; c.fillRect(ex, rulerH, W - ex, H - rulerH); c.globalAlpha = 1; c.fillStyle = colors.bad; c.fillRect(ex, 0, 1.5, H); c.font = '10px Inter, sans-serif'; c.textBaseline = 'middle'; c.fillText(T('曲の終わり'), ex + 4, rulerH + 8); }
    TL.trackY = trackY; TL.trackH = trackH;
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function snapT(t, exclude) {
    if (!$('#snap').checked) return t;
    const th = 7 / TL.pps; let best = t, bd = th;
    const test = (v) => { const d = Math.abs(v - t); if (d < bd) (bd = d), (best = v); };
    test(now());
    P.cues.forEach((c, i) => { if (i !== exclude) { test(c.start); test(c.end); } });
    const an = LM.audio.analysis; if (an && an.beats) for (const b of an.beats) { if (b > t + th) break; test(b); }
    return best;
  }
  function tlHit(x, y) {
    if (y < TL.trackY || y > TL.trackY + TL.trackH) return null;
    for (let i = 0; i < P.cues.length; i++) {
      const c = P.cues[i], x0 = t2x(c.start), x1 = t2x(c.end);
      if (x >= x0 - 5 && x <= x1 + 5) {
        if (Math.abs(x - x0) < 6) return { i, part: 'start' };
        if (Math.abs(x - x1) < 6) return { i, part: 'end' };
        if (x > x0 && x < x1) return { i, part: 'body' };
      }
    }
    return null;
  }
  function secHit(x, y) {
    if (y < TL.secY || y > TL.secY + TL.secH) return null;
    const secs = P.sections || [];
    for (let k = 0; k < secs.length; k++) if (Math.abs(t2x(secs[k].t) - x) < 6) return { k, edge: true };
    for (let k = secs.length - 1; k >= 0; k--) if (t2x(secs[k].t) <= x) return { k, edge: false };
    return { k: -1 };
  }
  tl.addEventListener('contextmenu', (e) => {
    const r = tl.getBoundingClientRect(), h = secHit(e.clientX - r.left, e.clientY - r.top);
    if (h && h.k >= 0) { e.preventDefault(); P.sections.splice(h.k, 1); commit({ quiet: true }); renderSections(); S.dirty = true; toast('マーカーを削除しました'); }
  });
  tl.addEventListener('pointerdown', (e) => {
    const r = tl.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.button === 2) return;
    tl.setPointerCapture(e.pointerId);
    const sh = secHit(x, y);
    if (sh) { if (sh.k >= 0) { TL.drag = { type: 'sec', k: sh.k, x0: x, t0: P.sections[sh.k].t, moved: false, edge: sh.edge }; TL.secDrag = TL.drag; } else TL.drag = { type: 'seek' }; S.dirty = true; return; }
    const hit = tlHit(x, y);
    if (hit) {
      const c = P.cues[hit.i];
      if (clickSel(hit.i, e, false)) { TL.drag = null; return; }
      TL.drag = { type: hit.part, i: hit.i, x0: x, s0: c.start, e0: c.end, moved: false };
    } else {
      TL.drag = { type: 'seek' }; seek(x2t(x));
      // click on an instrumental zone (hatched band) → edit that section's settings
      if (y >= TL.trackY && y <= TL.trackY + TL.trackH) { const t = x2t(x), g = gapList().find((q) => t >= q.t0 && t < q.t1); if (g) { S.gapTarget = view.gapKey(g); syncGapUI(); } }
    }
  });
  tl.addEventListener('pointermove', (e) => {
    const r = tl.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (!TL.drag) { const h = tlHit(x, y); tl.style.cursor = h ? (h.part === 'body' ? 'grab' : 'ew-resize') : 'default'; return; }
    const d = TL.drag;
    if (d.type === 'seek') { seek(x2t(x)); return; }
    if (d.type === 'sec') {
      if (Math.abs(x - d.x0) > 3) d.moved = true; if (!d.moved) return;
      const secs = P.sections, lo = d.k > 0 ? secs[d.k - 1].t + 0.5 : 0, hi = d.k < secs.length - 1 ? secs[d.k + 1].t - 0.5 : dur();
      secs[d.k].t = U.clamp(snapT(d.t0 + (x - d.x0) / TL.pps, -1), lo, hi); secs[d.k].est = false; S.dirty = true; return;
    }
    const c = P.cues[d.i], prev = P.cues[d.i - 1], next = P.cues[d.i + 1];
    const dt = (x - d.x0) / TL.pps;
    if (Math.abs(x - d.x0) > 2) d.moved = true;
    if (!d.moved) return;
    const lo = prev ? prev.end : 0, hi = next ? next.start : Math.max(dur(), d.e0);
    if (d.type === 'body') {
      const len = d.e0 - d.s0; let s = snapT(d.s0 + dt, d.i);
      const se = snapT(d.e0 + dt, d.i); if (Math.abs(se - (d.e0 + dt)) < Math.abs(s - (d.s0 + dt))) s = se - len;
      s = U.clamp(s, lo, hi - len); MD.moveCue(c, s - c.start); c.end = s + len;
    } else if (d.type === 'start') c.start = U.clamp(snapT(d.s0 + dt, d.i), lo, c.end - FR);
    else c.end = U.clamp(snapT(d.e0 + dt, d.i), c.start + FR, hi);
    if (d.type !== 'body') MD.clipWords(c);
    S.dirty = true; if (S.sel === d.i) updateInspectorTimes();
  });
  const endDrag = () => {
    const d = TL.drag;
    if (d && d.type === 'sec') {
      if (!d.moved) { const sc = P.sections[d.k]; const o = MD.SEC_ORDER; sc.type = o[(o.indexOf(sc.type) + 1) % o.length]; sc.est = false; }
      TL.drag = null; TL.secDrag = null; commit({ quiet: true }); renderSections(); S.dirty = true; return;
    }
    if (TL.drag && TL.drag.moved) commit({ keep: true }); else if (TL.drag && TL.drag.type !== 'seek') { /* click on cue */ } TL.drag = null; };
  tl.addEventListener('pointerup', endDrag); tl.addEventListener('pointercancel', endDrag);
  tl.addEventListener('dblclick', (e) => {
    const r = tl.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (y >= TL.secY && y <= TL.secY + TL.secH) { const sh = secHit(x, y); if (sh && sh.edge) return; addSection(snapT(x2t(x), -1)); return; }
    const h = tlHit(x, y); if (h) seek(P.cues[h.i].start);
  });
  tl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = tl.getBoundingClientRect(), x = e.clientX - r.left;
    if (e.ctrlKey || e.metaKey) { const t = x2t(x); TL.pps = U.clamp(TL.pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 5, 400); TL.scroll = t * TL.pps - x; $('#tlZoom').value = TL.pps; }
    else TL.scroll += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
    S.dirty = true;
  }, { passive: false });
  $('#tlZoom').addEventListener('input', (e) => { const t = now(); const cx = t2x(t); TL.pps = +e.target.value; TL.scroll = t * TL.pps - cx; S.dirty = true; });
  // resize timeline
  (() => { let y0, h0; const rs = $('#tlResize'); rs.addEventListener('pointerdown', (e) => { y0 = e.clientY; h0 = $('#tlWrap').offsetHeight; rs.setPointerCapture(e.pointerId); rs.onpointermove = (ev) => { $('#tlWrap').style.height = U.clamp(h0 - (ev.clientY - y0), 90, 360) + 'px'; tlSize(); fitFrame(); }; }); rs.addEventListener('pointerup', () => (rs.onpointermove = null)); })();

  /* ---------------- tap stamping ---------------- */
  const wordMode = () => $('#tapWord').checked;
  function setTap(on) {
    S.tap = on; $('#tapMode').classList.toggle('on', on); $('#prompter').classList.toggle('on', on);
    S.tapW = 0;
    if (on) { S.tapIdx = Math.max(0, S.sel); toast(wordMode() ? '単語ごとの打刻：各単語の歌い出しで Enter を押します。最初の単語で行の開始も合わせ、以降の行も一緒にずれます' : 'タップ打刻：歌い出しで Enter を押し、歌い終わりで離します。以降の行も一緒にずれます。↑↓ で打刻する行を戻せます'); }
    S.tapDown = null; S.dirty = true;
  }
  function updatePrompter() {
    const c = P.cues;
    $('#pPrev').textContent = c[S.tapIdx - 1] ? plain(c[S.tapIdx - 1].text) : '';
    $('#pCur').textContent = c[S.tapIdx] ? `${S.tapIdx + 1}. ${plain(c[S.tapIdx].text)}` : '（最後の行まで打刻しました）';
    $('#pNext').textContent = c[S.tapIdx + 1] ? plain(c[S.tapIdx + 1].text) : '';
    const pw = $('#pWords');
    if (wordMode() && c[S.tapIdx]) {
      const WR = LM.typo.words(c[S.tapIdx].text).list;
      const key = S.tapIdx + ':' + S.tapW + ':' + WR.length;
      if (pw.dataset.k !== key) { pw.dataset.k = key; pw.innerHTML = WR.map((w, k) => `<span class="${k < S.tapW ? 'done' : k === S.tapW ? 'next' : ''}">${esc(w.text)}</span>`).join(''); }
      pw.hidden = false;
    } else { pw.hidden = true; pw.dataset.k = ''; }
  }
  function tapWordPress() {
    const i = S.tapIdx, c = P.cues[i]; if (!c) return;
    if (!S.playing) play();
    const WR = LM.typo.words(c.text).list;
    if (!WR.length) { S.tapIdx++; return; }
    let t = Math.max(0, now() - LAT());
    if (S.tapW === 0) {
      t = stampTime();
      const r = MD.rippleStart(P, i, t);
      if (r.err) { toast(r.err, true); return; }
      c.words = new Array(WR.length).fill(null); c.words[0] = c.start;
    } else {
      if (!Array.isArray(c.words) || c.words.length !== WR.length) c.words = new Array(WR.length).fill(null);
      const prevW = c.words[S.tapW - 1] ?? c.start;
      t = Math.max(prevW + 0.04, t);
      if (t > c.end - 0.08) { const nx = P.cues[i + 1]; c.end = Math.min(nx ? nx.start : Infinity, t + 0.35); if (c.end - 0.04 < t) t = c.end - 0.04; }
      c.words[S.tapW] = t;
    }
    S.sel = i; S.tapW++;
    $('#tapBtn').classList.add('dn'); setTimeout(() => $('#tapBtn').classList.remove('dn'), 90);
    if (S.tapW >= WR.length) { S.tapW = 0; S.tapIdx = Math.min(P.cues.length, i + 1); commit({ keep: true, quiet: true }); renderInspector(); markList(); }
    S.dirty = true;
  }
  // stamp the next unset word of the selected phrase at the playhead (W)
  function stampWord() {
    const c = selCue(); if (!c) return;
    const WR = LM.typo.words(c.text).list; if (!WR.length) return;
    if (!Array.isArray(c.words) || c.words.length !== WR.length) c.words = new Array(WR.length).fill(null);
    const t = Math.max(0, now() - LAT());
    if (t < c.start - 1e-3 || t >= c.end) return toast('再生位置がこの行の中にありません', true);
    let k = c.words.findIndex((x) => x == null); if (k < 0) k = c.words.length - 1;
    c.words[k] = t; commit({ quiet: true }); renderInspector(); S.dirty = true;
    toast(`「${WR[k].text}」を ${(t - c.start).toFixed(2)}秒 に打刻`);
  }
  function tapPress() {
    if (!S.tap || S.tapDown != null) return;
    if (wordMode()) return tapWordPress();
    const i = S.tapIdx; if (!P.cues[i]) return;
    if (!S.playing) play();
    const t = stampTime();
    const r = MD.rippleStart(P, i, t);
    if (r.err) { toast(r.err, true); return; }
    S.tapDown = t; S.sel = i; $('#tapBtn').classList.add('dn'); S.dirty = true;
  }
  function tapRelease() {
    if (S.tapDown == null) return;
    const t = Math.max(0, now() - LAT()), i = S.tapIdx;
    if (t - S.tapDown >= 0.2) MD.stampEnd(P, i, t);
    S.tapDown = null; S.tapIdx = Math.min(P.cues.length, i + 1); $('#tapBtn').classList.remove('dn');
    commit({ keep: true, quiet: true }); renderInspector(); markList();
  }
  $('#tapMode').onclick = () => setTap(!S.tap);
  $('#tapWord').onchange = () => { S.tapW = 0; S.dirty = true; U.store.set('lms.tapword', $('#tapWord').checked); };
  $('#tapBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); tapPress(); });
  $('#tapBtn').addEventListener('pointerup', tapRelease);
  $('#tapBtn').addEventListener('pointerleave', tapRelease);

  /* ---------------- panels: source ---------------- */
  const drop = $('#audioDrop');
  $('#audioFile').onchange = (e) => loadAudio(e.target.files[0]);
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) loadAudio(f); });
  $('#durInput').onchange = (e) => { const v = U.clamp(+e.target.value || 30, 1, 1200); if (hasAudio()) return (e.target.value = P.duration); P.duration = v; commit(); };
  $('#lyricsFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) { e.target.value = ''; return toast('歌詞ファイルが大きすぎます（2MBまで）', true); }
    const txt = await f.text();
    if (/\.lrc$/i.test(f.name) || /^\s*\[\d+:\d+/.test(txt)) importTimed(MD.fromLRC(txt));
    else if (/\.srt$/i.test(f.name) || /-->/.test(txt)) importTimed(MD.fromSRT(txt));
    else { $('#lyrics').value = txt; toast('歌詞を読み込みました。「歌詞を自動配置」で反映します'); }
    e.target.value = '';
  };
  function importTimed(list) {
    if (!list.length) return toast('タイミング情報が見つかりませんでした', true);
    list = list.slice(0, 2000);
    const maxEnd = list.reduce((a, c) => Math.max(a, +c.end || 0), 0);
    if (!hasAudio() && maxEnd > P.duration) P.duration = Math.min(1200, Math.ceil(maxEnd + 1));
    P.cues = list.slice(0, 500).map((c) => MD.normalizeCue({ text: c.text, start: c.start, end: Math.min(c.end, P.duration), scene: {} }));
    $('#lyrics').value = P.cues.map((c) => c.text).join('\n');
    MD.repairEnds(P);
    P.cues = LM.director.generate(P, { seed: P.seed });
    S.sel = 0; commit(); toast(`${P.cues.length}行をタイミング付きで読み込みました`);
  }
  $('#autoPlace').onclick = async () => {
    const lines = MD.linesFrom($('#lyrics').value);
    if (!lines.length) return toast('歌詞を入力してください', true);
    if (P.cues.length && !(await ask('現在のタイミング表を、歌詞からの仮配置で上書きします。（元に戻すで復元できます）', { ok: '上書きして配置' }))) return;
    if (P.cues.length) await saveSnap('自動配置の直前', true);
    const times = MD.autoTime(lines, dur(), LM.audio.analysis, { snap: $('#snapBeat').checked });
    P.cues = times.map((c) => MD.normalizeCue({ text: c.text, start: c.start, end: c.end, scene: {} }));
    P.cues = LM.director.generate(P, { seed: P.seed });
    pushPlan(); S.sel = 0; commit();
    toast(`${lines.length}行を配置し、「${D.themeById[P.theme].n}」で演出を付けました`);
  };
  /* ---------------- 歌声に合わせて自動配置 ---------------- */
  let aligning = false;
  async function vocalAlign(opts = {}) {
    if (aligning) return;
    if (!hasAudio() || !LM.audio.buffer) return toast('先に音源を読み込んでください（歌声を解析して配置します）', true);
    const partial = opts.fromIdx != null && opts.fromIdx >= 0 && P.cues[opts.fromIdx];
    let lines, keep = null, anchors = [], from = 0;
    if (partial) {
      sortCues();
      const i0 = opts.fromIdx; lines = P.cues.slice(i0).map((c) => c.text); keep = P.cues.slice(i0);
      from = Math.max(0, P.cues[i0].start - 0.15);
      anchors = keep.map((c, k) => (k === 0 || c.locked ? c.start : null));
      if (!(await ask(`${i0 + 1}行目の開始（${U.fmtTime(P.cues[i0].start)}）を固定して、以降の${lines.length}行を歌声に合わせて置き直します。`, { ok: '合わせ直す' }))) return;
    } else {
      lines = MD.linesFrom($('#lyrics').value);
      if (!lines.length) return toast('歌詞を入力してください', true);
      const same = P.cues.length === lines.length && P.cues.every((c, i) => c.text === lines[i]);
      if (same) { keep = P.cues.slice(); anchors = keep.map((c) => (c.locked ? c.start : null)); }
      if (P.cues.length && !(await ask(same ? '歌声を解析して、全行のタイミングを置き直します（🔒の行は固定・演出はそのまま）。' : '歌声を解析して、歌詞をタイミング付きで配置し直します（現在のタイミング表は上書き・元に戻すで復元できます）。', { ok: '配置する' }))) return;
    }
    aligning = true;
    await saveSnap(partial ? '歌声で合わせ直す直前' : '歌声で自動配置の直前', true);
    const quiet = (P.sections || []).map((x, i, arr) => { if (!['intro', 'inter', 'outro'].includes(x.type)) return null; const nx = arr[i + 1]; return [x.t, nx ? nx.t : dur(), x.est ? 0.5 : 0.12]; }).filter(Boolean);
    const pr = $('#alignProg'); pr.hidden = false; const bar = pr.querySelector('i'), lab = pr.querySelector('span');
    const L2 = { analyse: '歌声を解析中…', align: '歌詞の位置を計算中…', words: '単語のタイミングを計算中…', done: '完了' };
    try {
      const res = await LM.align.run(LM.audio.buffer, lines, { from, anchors, quiet, onProgress: (p, st) => { bar.style.width = Math.round(p * 100) + '%'; lab.textContent = T(L2[st] || ''); } });
      if (!res) throw new Error('align failed');
      const low = [];
      if (keep) {
        res.cues.forEach((r, k) => { const c = keep[k]; if (c.locked && k > 0) return; c.start = r.start; c.end = r.end; if (r.words) c.words = r.words; else delete c.words; if (r.conf < 0.35) low.push(c.id); });
        if (partial) { const prev = P.cues[opts.fromIdx - 1]; if (prev && prev.end > keep[0].start - 0.02) prev.end = Math.max(prev.start + 0.2, keep[0].start - 0.03); }
      } else {
        P.cues = res.cues.map((r) => { const c = MD.normalizeCue({ text: r.text, start: r.start, end: r.end, scene: {}, words: r.words || undefined }); if (r.conf < 0.35) low.push(c.id); return c; });
        P.cues = LM.director.generate(P, { seed: P.seed }); pushPlan();
      }
      S.lowConf = new Set(low);
      sortCues(); if (!partial) S.sel = 0; view.invalidate(); commit();
      toast(`${res.cues.length}行を歌声に合わせて配置しました${low.length ? `（確信度の低い行：${low.length}行。一覧で黄色の行を確認してください）` : ''}${res.mono ? '。モノラル音源のため精度が下がることがあります' : ''}`);
    } catch (e) { console.warn(e); toast('歌声の解析に失敗しました', true); }
    finally { aligning = false; pr.hidden = true; }
  }
  $('#vocalPlace').onclick = () => vocalAlign();
  $('#applyText').onclick = () => {
    const lines = MD.linesFrom($('#lyrics').value);
    if (lines.length !== P.cues.length) return toast(`行数が違います（歌詞 ${lines.length}行 / タイミング表 ${P.cues.length}行）。行数をそろえるか「歌詞を自動配置」を使ってください`, true);
    P.cues.forEach((c, i) => (c.text = lines[i])); commit(); toast('タイミングを保ったまま文字を更新しました');
  };
  const bindText = (id, key, top) => { const el = $(id); el.addEventListener('input', () => { P[key] = el.value.slice(0, 100); if (top) $(top).value = el.value; S.dirty = true; commitSoon(); }); };
  bindText('#pTitle', 'title', '#pTitleTop'); bindText('#pArtist', 'artist');
  $('#pTitleTop').addEventListener('input', (e) => { P.title = e.target.value.slice(0, 100); $('#pTitle').value = P.title; S.dirty = true; commitSoon(); });
  $('#showCredits').onchange = (e) => { P.showCredits = e.target.checked; commit(); };
  $('#creditPos').onchange = (e) => { P.creditPos = e.target.value; commit(); };

  /* ---------------- panels: auto ---------------- */
  function buildThemes() {
    $('#themes').innerHTML = D.themes.map((t) => {
      const pal = D.palById[t.pals[0]].c, pal2 = D.palById[t.pals[1] || t.pals[0]].c;
      const f = D.fontById[t.fonts[0]];
      return `<button class="theme" data-id="${t.id}"><div class="sw" style="background:linear-gradient(115deg,${pal[0]} 0 58%,${pal2[0]} 58%);color:${pal[1]}"><span data-noi18n style="font-family:'${f.fam}',sans-serif">${esc(t.emoji)}&nbsp;<span style="color:${pal[2]}">あ</span>A</span></div><div class="tx"><b>${esc(t.n)}</b><small>${esc(t.d)}</small></div></button>`;
    }).join('');
    $$('#themes .theme').forEach((b) => (b.onclick = () => {
      LM.director.applyTheme(P, b.dataset.id);
      if (P.cues.length) { P.cues = LM.director.generate(P, { seed: P.seed }); pushPlan(); }
      D.themeById[b.dataset.id].fonts.forEach((id) => LM.fonts.ensure(id, P.cues.map((c) => c.text).join('')));
      commit(); toast(`テーマ「${D.themeById[b.dataset.id].n}」を適用しました`);
    }));
  }
  function pushPlan() {
    S.plans = S.plans.slice(0, S.planIdx + 1);
    S.plans.push({ seed: P.seed, theme: P.theme, cues: JSON.parse(JSON.stringify(P.cues)) });
    if (S.plans.length > 30) S.plans.shift();
    S.planIdx = S.plans.length - 1;
  }
  function usePlan(i) {
    const pl = S.plans[i]; if (!pl) return;
    S.planIdx = i;
    // keep current text & timing & lock; take scene/motion/filters from plan by id
    const m = new Map(pl.cues.map((c) => [c.id, c]));
    P.cues.forEach((c) => { const o = m.get(c.id); if (o && !c.locked) Object.assign(c, { scene: o.scene, enter: o.enter, hold: o.hold, exit: o.exit, filters: o.filters }); });
    P.seed = pl.seed; commit();
  }
  $('#seed').onchange = (e) => { P.seed = U.clamp(Math.floor(+e.target.value || 0), 0, 2147483647); commit(); };
  $('#dice').onclick = () => { P.seed = Math.floor(Math.random() * 2147483647); $('#seed').value = P.seed; $('#generate').click(); };
  $('#autoColors').onchange = (e) => { P.autoColors = e.target.checked; commit(); };
  $('#autoFilters').onchange = (e) => { P.autoFilters = e.target.checked; commit(); };
  $('#autoTrans').onchange = (e) => { P.autoTrans = e.target.checked; commit(); };
  $('#autoGfx').onchange = (e) => { P.autoGfx = e.target.checked; commit(); };
  $('#transOn').onchange = (e) => { P.transOff = !e.target.checked; commit(); };
  $('#bgmDim').oninput = (e) => { P.bgmDim = +e.target.value / 100; $('#bgmDimV').textContent = e.target.value + '%'; S.dirty = true; commitSoon(); };
  $('#generate').onclick = () => {
    if (!P.cues.length) return toast('先に歌詞を配置してください', true);
    saveSnap('演出生成の直前', true);
    P.cues = LM.director.generate(P, { seed: P.seed }); pushPlan(); commit();
    toast(`シード ${P.seed} で演出を生成しました`);
  };
  /* motion character (激しさ / 動きの付け方 / 変化の多さ) */
  const FEELS = [['auto', '◎', 'テーマ通り', 'テーマの候補そのまま'], ['smooth', '〜', 'なめらか', 'フェード・スライド・マスク'], ['bounce', '⤴', '弾む', 'ポップ・バウンス・重力'], ['snap', 'ϟ', 'キレ', 'スラム・ウィップ・ズーム'],
    ['glitch', '▚', 'グリッチ', 'デジタル・ノイズ・スライス'], ['cinema', '◐', 'シネマ', 'ぼかし・3D・ゆったり'], ['organic', '✎', '手ざわり', 'フロー・手描き・ゆらぎ'], ['kinetic', '▦', '刻む', '単語打ち・ワードフラッシュ']];
  $('#feels').innerHTML = FEELS.map(([id, ic, n, d]) => `<button data-f="${id}" title="${d}"><b>${ic}</b>${n}</button>`).join('');
  const mLive = () => $('#motionLive').checked;
  $('#motionLive').checked = U.store.get('lms.mlive', true) !== false;
  $('#motionLive').onchange = (e) => U.store.set('lms.mlive', e.target.checked);
  const regenSoon = U.debounce(() => { if (!P.cues.length) return; P.cues = LM.director.generate(P, { seed: P.seed }); pushPlan(); view.invalidate(); commit(); }, 250);
  const motionChanged = () => { if (mLive() && P.cues.length) regenSoon(); else { syncMotionUI(); commitSoon(); } };
  function syncMotionUI() {
    const th = D.themeById[P.theme], d0 = LM.director.themeDrive(th), d = P.drive == null ? d0 : P.drive;
    $('#drive').value = Math.round(d * 100); $('#driveV').textContent = P.drive == null ? T('標準') : Math.round(d * 100) + '%';
    $('#driveTh').textContent = `${T('テーマ標準')} ${Math.round(d0 * 100)}%`;
    const v = P.variety == null ? 0.5 : P.variety; $('#variety').value = Math.round(v * 100); $('#varietyV').textContent = P.variety == null ? T('標準') : Math.round(v * 100) + '%';
    $$('#feels button').forEach((b) => b.classList.toggle('on', (P.feel || 'auto') === b.dataset.f));
    $('#motionReset').disabled = P.drive == null && P.variety == null && (P.feel || 'auto') === 'auto';
  }
  $('#drive').addEventListener('input', (e) => { P.drive = +e.target.value / 100; LM.director.applyDrive(P); syncMotionUI(); S.dirty = true; });
  $('#drive').addEventListener('change', motionChanged);
  $('#variety').addEventListener('input', (e) => { P.variety = +e.target.value / 100; syncMotionUI(); });
  $('#variety').addEventListener('change', motionChanged);
  $$('#feels button').forEach((b) => (b.onclick = () => { P.feel = b.dataset.f; syncMotionUI(); motionChanged(); }));
  $('#motionReset').onclick = () => { P.drive = null; P.variety = null; P.feel = 'auto'; LM.director.applyDrive(P); syncMotionUI(); motionChanged(); };
  $('#planPrev').onclick = () => usePlan(S.planIdx - 1);
  $('#planNext').onclick = () => usePlan(S.planIdx + 1);

  /* ---------------- panels: design ---------------- */
  function buildAspects() {
    const keys = Object.keys(D.aspects);
    $('#aspects').innerHTML = keys.map((k) => `<button class="chip" data-a="${k}" title="${D.aspectHint[k]}">${k} <small style="opacity:.6">${D.aspectHint[k]}</small></button>`).join('');
    $$('#aspects .chip').forEach((b) => (b.onclick = () => setAspect(b.dataset.a)));
    $('#aspectQuick').innerHTML = keys.map((k) => `<option value="${k}">${k}</option>`).join('');
    $('#aspectQuick').onchange = (e) => setAspect(e.target.value);
  }
  function setAspect(a) { P.aspect = a; commit(); fitFrame(); }
  function buildPalettes() {
    const cats = Object.assign({ all: 'すべて' }, D.palCats);
    $('#palCats').innerHTML = Object.entries(cats).map(([k, v]) => `<button class="chip ${S.palCat === k ? 'on' : ''}" data-c="${k}">${v}</button>`).join('');
    $$('#palCats .chip').forEach((b) => (b.onclick = () => { S.palCat = b.dataset.c; buildPalettes(); }));
    const list = D.palettes.filter((p) => S.palCat === 'all' || p.cat === S.palCat);
    $('#pals').innerHTML = list.map((p) => `<button class="pal ${P.palette === p.id && !P.colors ? 'on' : ''}" data-id="${p.id}" title="${esc(p.n)}"><div class="pv" style="background:${p.c[0]};color:${p.c[1]}">あ<span style="color:${p.c[2]}">A</span><i style="background:${p.c[3]}"></i></div><small>${esc(p.n)}</small></button>`).join('');
    $$('#pals .pal').forEach((b) => (b.onclick = () => {
      P.palette = b.dataset.id; P.colors = null;
      if (P.autoColors) { P.autoColors = false; toast('配色を固定しました（おまかせ配色をオフ）'); }
      P.cues.forEach((c) => c.scene && delete c.scene.pal);
      commit();
    }));
    $('#palNote').textContent = P.colors ? 'カスタム使用中' : P.autoColors ? 'テーマ内で自動循環中' : '';
  }
  const CN = ['背景', '文字', '強調', 'サブ'];
  function colorEditor(host, arr, onChange) {
    host.innerHTML = CN.map((n, i) => `<label>${n}<span class="cc"><input type="color" value="${arr[i]}" data-i="${i}"><input type="text" value="${arr[i]}" data-h="${i}" maxlength="7"></span></label>`).join('');
    $$('input[type=color]', host).forEach((el) => el.addEventListener('input', () => { arr[+el.dataset.i] = el.value; $(`input[data-h="${el.dataset.i}"]`, host).value = el.value; onChange(arr, true); }));
    $$('input[type=text]', host).forEach((el) => el.addEventListener('change', () => { let v = el.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (U.isHex(v)) { arr[+el.dataset.h] = v.toLowerCase(); $(`input[data-i="${el.dataset.h}"]`, host).value = v; onChange(arr); } else { el.value = arr[+el.dataset.h]; toast('#RRGGBB の形式で入力してください', true); } }));
  }
  function buildCustom() {
    const base = P.colors || D.palById[P.palette].c.slice();
    const arr = base.slice(0, 4); if (!arr[3]) arr[3] = U.mix(arr[1], arr[2], 0.5);
    colorEditor($('#custColors'), arr, (a, live) => { if (!$('#useCustom').checked) return; P.colors = a.slice(); S.dirty = true; live ? commitSoon() : commit(); });
    $('#useCustom').checked = !!P.colors;
    $('#useCustom').onchange = (e) => { P.colors = e.target.checked ? arr.slice() : null; commit(); };
  }
  $('#keyColor').onchange = (e) => { P.keyColor = e.target.checked; commit(); };
  function buildFonts() {
    const groups = {};
    D.fonts.forEach((f) => (groups[f.cat] = groups[f.cat] || []).push(f));
    let h = `<button data-id="" class="${!P.font ? 'on' : ''}"><span style="font-size:13px">テーマに任せる（シーンごとの書体）</span></button>`;
    for (const [g, fs] of Object.entries(groups)) {
      h += `<div class="grp">${esc(g)}</div>` + fs.map((f) => `<button data-id="${f.id}" class="${P.font === f.id ? 'on' : ''}"><span data-noi18n style="font-family:'${f.fam}',sans-serif;font-weight:${f.w}${f.id === 'playfair' ? ';font-style:italic' : ''}">${/英字/.test(f.cat) ? 'Lyric Motion 123' : /韓国語/.test(f.cat) ? '새벽의 노래 Lyric' : '夜明けの歌 Lyric'}</span><small>${esc(f.n)}</small></button>`).join('');
    }
    $('#fonts').innerHTML = h;
    $$('#fonts button').forEach((b) => {
      b.onclick = async () => { P.font = b.dataset.id || null; if (P.font) { await LM.fonts.ensure(P.font, P.cues.map((c) => c.text).join('')); } P.fontWeight = null; view.invalidate(); commit(); };
      if (b.dataset.id) b.addEventListener('mouseenter', () => LM.fonts.link(b.dataset.id), { once: true });
    });
    const LF = D.fonts.filter((x) => /^英字/.test(x.cat || ''));
    const cats2 = [...new Set(LF.map((x) => x.cat))];
    const mainF = D.fontById[P.font || 'sans'];
    const autoN = mainF && D.LATIN_PAIR[mainF.id] ? D.fontById[D.LATIN_PAIR[mainF.id]].n : '和文書体のまま';
    $('#latinFont').innerHTML = `<option value="auto">おまかせ（和文に合わせる：${esc(autoN)}）</option><option value="same">和文書体の英字をそのまま使う</option>` + cats2.map((c) => `<optgroup label="${esc(c)}">${LF.filter((x) => x.cat === c).map((x) => `<option value="${x.id}">${esc(x.n)}</option>`).join('')}</optgroup>`).join('');
    $('#latinFont').value = P.latinFont || 'auto';
    const KF = D.fonts.filter((x) => /^韓国語/.test(x.cat || '')), kcats = [...new Set(KF.map((x) => x.cat))];
    const kAuto = mainF && D.KOR_PAIR(mainF) ? D.fontById[D.KOR_PAIR(mainF)].n : 'Noto Sans KR';
    $('#koreanFont').innerHTML = `<option value="auto">${esc(T('おまかせ（和文に合わせる）'))}: ${esc(/^韓国語/.test((mainF && mainF.cat) || '') ? mainF.n : kAuto)}</option>` + kcats.map((c) => `<optgroup label="${esc(c)}">${KF.filter((x) => x.cat === c).map((x) => `<option value="${x.id}">${esc(x.n)}</option>`).join('')}</optgroup>`).join('');
    $('#koreanFont').value = P.koreanFont || 'auto';
    $('#latinScale').value = Math.round((P.latinScale || 1) * 100); $('#latinScaleV').textContent = $('#latinScale').value + '%';
    
    const f = P.font ? D.fontById[P.font] : null;
    $('#fontWeight').innerHTML = `<option value="">標準${f ? `（${f.w}）` : ''}</option>` + (f ? f.ws : [400, 500, 700, 800, 900]).map((w) => `<option value="${w}" ${P.fontWeight === w ? 'selected' : ''}>${w}</option>`).join('');
  }
  // lazy-link fonts visible in list when scrolled
  $('#fonts').addEventListener('scroll', U.debounce(() => { const r = $('#fonts').getBoundingClientRect(); $$('#fonts button[data-id]').forEach((b) => { const br = b.getBoundingClientRect(); if (b.dataset.id && br.bottom > r.top && br.top < r.bottom) LM.fonts.link(b.dataset.id); }); }, 150));
  $('#latinFont').onchange = async (e) => { P.latinFont = e.target.value; const F = R.fontOf(P, null); if (F.lf) await LM.fonts.ensure(F.lf.id, P.cues.map((c) => c.text).join('')); await LM.fonts.ensureProject(P); view.invalidate(); commit(); };
  $('#koreanFont').onchange = async (e) => { P.koreanFont = e.target.value; await LM.fonts.ensureProject(P); view.invalidate(); commit(); };
  $('#latinScale').addEventListener('input', (e) => { P.latinScale = +e.target.value / 100; $('#latinScaleV').textContent = e.target.value + '%'; view.invalidate(); S.dirty = true; commitSoon(); });
  $('#fontWeight').onchange = (e) => { P.fontWeight = e.target.value ? +e.target.value : null; view.invalidate(); commit(); };
  $('#fontFile').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const ent = await LM.fonts.addCustom(f); P.font = ent.id; view.invalidate(); commit(); toast(`「${ent.n}」を追加しました（このブラウザーを開いている間のみ有効）`); } catch (er) { toast('フォントを読み込めませんでした', true); } e.target.value = ''; };
  const slider = (id, key, fmt, toP, fromP) => {
    const el = $(id), v = $(id + 'V');
    el.addEventListener('input', () => { P[key] = toP(+el.value); v.textContent = fmt(+el.value); view.invalidate(); S.dirty = true; commitSoon(); });
    return () => { el.value = fromP(P[key]); v.textContent = fmt(+el.value); };
  };
  // 字間・スペース: − / ＋ nudges and reset
  const KERN = { tracking: [-15, 50, 100, 0], latinTrack: [-10, 30, 100, 0], wordSpace: [40, 250, 100, 1], wakanGap: [0, 60, 1, 25], yakuAmt: [0, 100, 100, 1] };
  $$('#kernSec .kn').forEach((b) => (b.onclick = () => { const el = $('#' + b.dataset.k); el.value = U.clamp(+el.value + +b.dataset.d, +el.min, +el.max); el.dispatchEvent(new Event('input')); }));
  ['wakanGap', 'yakuAmt'].forEach((k) => $('#' + k).addEventListener('input', (e) => { if (k === 'wakanGap') P.wakan = +e.target.value > 0; else P.yakumono = +e.target.value > 0; }));
  $('#kernReset').onclick = () => { Object.entries(KERN).forEach(([k, v]) => (P[k] = v[3])); P.wakan = true; P.yakumono = true; view.invalidate(); commit(); };
  const syncers = [
    slider('#textScale', 'textScale', (x) => x + '%', (x) => x / 100, (p) => Math.round((p || 1) * 100)),
    slider('#tracking', 'tracking', (x) => (x === 0 ? T('標準') : (x > 0 ? '+' : '') + (x / 100).toFixed(2) + 'em'), (x) => x / 100, (p) => Math.round((p || 0) * 100)),
    slider('#latinTrack', 'latinTrack', (x) => (x === 0 ? T('標準') : (x > 0 ? '+' : '') + (x / 100).toFixed(2) + 'em'), (x) => x / 100, (p) => Math.round((p || 0) * 100)),
    slider('#wordSpace', 'wordSpace', (x) => (x === 100 ? T('標準') : x + '%'), (x) => x / 100, (p) => Math.round((p || 1) * 100)),
    slider('#wakanGap', 'wakanGap', (x) => (x === 0 ? T('なし') : x === 25 ? '1/4em' : (x / 100).toFixed(2) + 'em'), (x) => x, (p) => (P.wakan === false ? 0 : p == null ? 25 : p)),
    slider('#yakuAmt', 'yakuAmt', (x) => (x === 0 ? T('詰めない') : x === 100 ? T('標準') : x + '%'), (x) => x / 100, (p) => (P.yakumono === false ? 0 : Math.round((p == null ? 1 : p) * 100))),
    slider('#intensity', 'intensity', (x) => x + '%', (x) => x / 100, (p) => Math.round((p || 1) * 100)),
    slider('#speed', 'speed', (x) => x + '%', (x) => x / 100, (p) => Math.round((p || 1) * 100)),
    slider('#fxInt', 'filterIntensity', (x) => x + '%', (x) => (x / 100) * 0.6, (p) => Math.round(((p ?? 0.6) / 0.6) * 100)),
  ];
  function buildBg() {
    $('#bgType').innerHTML = Object.entries(D.bgTypes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('#pattern').innerHTML = Object.entries(D.patterns).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('#camera').innerHTML = `<option value="">シーンに任せる</option>` + Object.entries(D.cameras).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  }
  $('#bgType').onchange = (e) => { P.bg = Object.assign({}, P.bg, { type: e.target.value }); if (e.target.value === 'image' && !P.bg.image) $('#bgFile').click(); commit(); };
  $('#pattern').onchange = (e) => { P.pattern = e.target.value; commit(); };
  $('#camera').onchange = (e) => { P.camera = e.target.value || null; if (P.camera) P.cues.forEach((c) => c.scene && delete c.scene.camera); commit(); };
  $('#bgFile').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 12 * 1024 * 1024) return toast('背景画像は12MBまでにしてください', true);
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        // downscale to keep project small
        const k = Math.min(1, 2560 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const url = c.toDataURL('image/jpeg', 0.88);
        const im2 = new Image(); im2.onload = () => { S.images[url] = im2; view.images = S.images; P.bg = Object.assign({}, P.bg, { type: 'image', image: url }); commit(); };
        im2.src = url;
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(f); e.target.value = '';
  };
  $('#bgDim').oninput = (e) => { P.bg.dim = +e.target.value / 100; $('#bgDimV').textContent = e.target.value + '%'; S.dirty = true; commitSoon(); };
  $('#bgBlur').oninput = (e) => { P.bg.blur = +e.target.value; $('#bgBlurV').textContent = e.target.value; S.dirty = true; commitSoon(); };
  function ensureImages() { if (P.bg && P.bg.image && !S.images[P.bg.image]) { const im = new Image(); im.onload = () => { S.images[P.bg.image] = im; view.images = S.images; S.dirty = true; }; im.src = P.bg.image; } }

  /* ---------------- background image library ---------------- */
  const imgKey = (id) => 'img:' + id;
  function blobToImage(blob) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(blob); }); }
  async function prepImage(file) {
    const im = await blobToImage(file);
    const k = Math.min(1, 2560 / Math.max(im.width, im.height));
    const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    URL.revokeObjectURL(im.src);
    return { blob, im: await blobToImage(blob) };
  }
  async function addVideo(f) {
    if (f.size > 1024 * 1024 * 1024) { toast(`${f.name} は大きすぎます（1GBまで）`, true); return false; }
    const blob = f.type ? f : new Blob([f], { type: /\.webm$/i.test(f.name) ? 'video/webm' : /\.mov$/i.test(f.name) ? 'video/quicktime' : 'video/mp4' });
    let v; try { v = await LM.video.create(blob); } catch (e) { toast(`${f.name} はこのブラウザーで再生できない形式です（H.264 の MP4 か WebM がおすすめ）`, true); return false; }
    const id = U.uid(); S.images[imgKey(id)] = v;
    try { await idb.set(imgKey(id), blob); } catch (e) { toast('動画をブラウザーに保存できませんでした（容量不足の可能性）。このセッション中は使えます', true); }
    if (f.size > 300 * 1024 * 1024) toast(`${f.name} は大きいため、ブラウザーの保存容量を多く使います`, true);
    P.images = P.images || [];
    P.images.push({ id, name: f.name.replace(/\.[^.]+$/, '').slice(0, 60), on: true, type: 'video', dur: Math.round(v.duration * 100) / 100, vin: 0, vout: 0, speed: 1, sync: 'slot', loop: true });
    return true;
  }
  async function addImages(files) {
    const all = Array.from(files || []);
    const vids = all.filter((f) => LM.video.isVideoFile(f)).slice(0, 12);
    const list = all.filter((f) => /^image\//.test(f.type)).slice(0, 40);
    if (!list.length && !vids.length) return toast('画像または動画ファイルを選んでください', true);
    let n = 0, nv = 0;
    for (const f of vids) { toast(`動画を読み込み中… ${f.name}`); if (await addVideo(f)) nv++; }
    for (const f of list) {
      if (f.size > 40 * 1024 * 1024) { toast(`${f.name} は大きすぎます（40MBまで）`, true); continue; }
      try { const { blob, im } = await prepImage(f); const id = U.uid(); S.images[imgKey(id)] = im; await idb.set(imgKey(id), blob); P.images = P.images || []; P.images.push({ id, name: f.name.replace(/\.[^.]+$/, '').slice(0, 60), on: true }); n++; } catch (e) { toast(`${f.name} を読み込めませんでした`, true); }
    }
    // first pictures in a project: switch to image-first so the motion never hides them
    const firstImg = (n || nv) && !P.bgmMixSet && P.images.length === n + nv;
    if (firstImg) { P.imgFirst = true; LM.imgFirst.applyLook(P); LM.imgFirst.fitCues(P); setTimeout(() => toast('画像が主役になるよう、覆わない背景モーションと見やすい設定にしました（背景画像の「背景画像・動画を主役にする」でオフにできます）'), 2600); }
    if (n || nv) { if (P.imgMode === 'off') P.imgMode = 'auto'; view.images = S.images; commit(); toast(nv && n ? `背景に画像${n}枚・動画${nv}本を追加しました` : nv ? `${nv}本の背景動画を追加しました` : `${n}枚の背景画像を追加しました`); }
  }
  // remove stored image/video blobs that neither the project nor any snapshot refers to (run once at start-up)
  async function gcBlobs() {
    try {
      const keys = (await idb.keys()).filter((k) => typeof k === 'string' && k.startsWith('img:'));
      if (!keys.length) return;
      const used = new Set((P.images || []).map((x) => imgKey(x.id)));
      const snaps = (await idb.get('snaps')) || [];
      (Array.isArray(snaps) ? snaps : []).forEach((sn) => { try { const pj = typeof sn.data === 'string' ? JSON.parse(sn.data) : sn.data; ((pj && pj.images) || []).forEach((x) => x && used.add(imgKey(x.id))); } catch (e) {} });
      for (const k of keys) if (!used.has(k)) await idb.del(k);
    } catch (e) {}
  }
  async function ensureLibImages() {
    for (const x of P.images || []) {
      if (S.images[imgKey(x.id)]) continue;
      const b = await idb.get(imgKey(x.id)); if (!b) continue;
      try { S.images[imgKey(x.id)] = x.type === 'video' || LM.video.isVideoBlob(b) ? await LM.video.create(b) : await blobToImage(b); } catch (e) {}
    }
    view.images = S.images; S.dirty = true; renderImgs();
  }
  const fmtDur = (d) => { d = d || 0; const m = Math.floor(d / 60), s2 = Math.floor(d % 60); return `${m}:${String(s2).padStart(2, '0')}`; };
  function renderVidOpts() {
    const V = (P.images || []).filter((x) => x.type === 'video');
    $('#vidOpts').hidden = !V.length;
    $('#vidOpts').innerHTML = V.length ? `<div class="hint" style="margin:2px 0 6px">動画の設定</div>` + V.map((x) => `<div class="vo" data-id="${esc(x.id)}">
      <div class="vt"><b data-noi18n>${esc(x.name)}</b><span class="hint">${fmtDur(x.dur)}</span></div>
      <div class="row"><label>使う範囲</label><input type="number" class="num" data-k="vin" min="0" step="0.1" value="${+(x.vin || 0).toFixed(2)}" style="width:62px"><span class="hint">〜</span><input type="number" class="num" data-k="vout" min="0" step="0.1" value="${x.vout > 0 ? +x.vout.toFixed(2) : +(x.dur || 0).toFixed(2)}" style="width:62px"><span class="hint">秒</span></div>
      <div class="row"><label>再生</label><select data-k="sync" style="flex:1"><option value="slot" ${x.sync !== 'song' ? 'selected' : ''}>切り替わるたびに頭から</option><option value="song" ${x.sync === 'song' ? 'selected' : ''}>曲の時間に同期（通しの映像向け）</option></select></div>
      <div class="row"><label>速度</label><select data-k="speed" style="flex:1">${[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => `<option value="${v}" ${(x.speed || 1) === v ? 'selected' : ''}>${v}×${v === 1 ? '（等速）' : v < 1 ? '（スロー）' : ''}</option>`).join('')}</select></div>
      <div class="row" style="gap:14px"><label class="tg"><input type="checkbox" data-k="loop" ${x.loop !== false ? 'checked' : ''}><i></i>ループ</label><label class="tg"><input type="checkbox" data-k="kb" ${x.kb !== false ? 'checked' : ''}><i></i>ズーム＆パン</label></div>
    </div>`).join('') : '';
    $$('#vidOpts .vo').forEach((row) => {
      const x = P.images.find((y) => y.id === row.dataset.id); if (!x) return;
      row.querySelectorAll('[data-k]').forEach((el) => (el.onchange = () => {
        const k = el.dataset.k;
        if (k === 'vin' || k === 'vout') { let v = U.clamp(+el.value || 0, 0, x.dur || 1e9); if (k === 'vout' && (v <= (x.vin || 0) + 0.1 || v >= (x.dur || 0) - 0.01)) v = v >= (x.dur || 0) - 0.01 ? 0 : (x.vin || 0) + 0.5; x[k] = v; }
        else if (k === 'speed') x.speed = +el.value;
        else if (k === 'sync') x.sync = el.value;
        else x[k] = el.checked;
        commit();
      }));
    });
  }
  /* ---------- per-picture framing: position, size, fit, rotation, flip, pan ---------- */
  const PAN_N = { auto: '全体設定に従う（ゆっくりズーム＆パン）', none: '動かさない', left: '左へパン', right: '右へパン', up: '上へパン', down: '下へパン', zoomIn: 'ズームイン', zoomOut: 'ズームアウト', spin: 'ゆっくり回転' };
  function openImgAdj(id) {
    S.imgAdj = id || null; if (!id) S.imgEditOn = false;
    $('#frame').classList.toggle('imgedit', !!(S.imgAdj && S.imgEditOn));
    renderImgs();
    if (id) { // jump to a moment where this picture is on screen
      const sl = (view.imageSlots() || []).find((x) => x.id === id);
      if (sl && !(now() >= sl.t0 && now() < sl.t1)) seek(sl.t0 + Math.min(1, (sl.t1 - sl.t0) / 2));
      else if (!sl) toast('この画像は今の切り替え設定では表示されていません（オンにする・行ごとに指定するなど）');
    }
  }
  function renderImgAdj() {
    const host = $('#imgAdj'), x = (P.images || []).find((y) => y.id === S.imgAdj);
    host.hidden = !x; if (!x) { host.innerHTML = ''; host.dataset.id = ''; return; }
    if (S.iaBusy && host.dataset.id === x.id) return; // don't rebuild under a slider that is being dragged
    host.dataset.id = x.id;
    if (!host._busyBound) { host._busyBound = true; host.addEventListener('pointerdown', () => (S.iaBusy = true)); window.addEventListener('pointerup', () => { if (S.iaBusy) { S.iaBusy = false; } }); }
    const pct = (v) => Math.round(v * 100);
    const row = (id, lab, v, lo, hi, st, fmt) => `<div class="row"><label>${lab}</label><input type="range" id="${id}" min="${lo}" max="${hi}" step="${st}" value="${v}"><span class="val" id="${id}V">${fmt(v)}</span></div>`;
    host.innerHTML = `<div class="vt"><b data-noi18n>${esc(x.name)}</b><span class="sp"></span><button class="btn sm" id="iaClose">${esc(T('閉じる'))}</button></div>
      <div class="row"><label class="tg"><input type="checkbox" id="iaDrag" ${S.imgEditOn ? 'checked' : ''}><i></i>${esc(T('プレビューで直接動かす'))}</label></div>
      <p class="hint" style="margin:0 0 6px">${esc(T('ドラッグ：移動／Shift＋ドラッグ：回転／ホイール：拡大・縮小'))}</p>
      <div class="row"><label>${esc(T('合わせ方'))}</label><div class="seg" id="iaFit"><button data-v="cover" class="${x.fit !== 'contain' ? 'on' : ''}">${esc(T('画面を埋める'))}</button><button data-v="contain" class="${x.fit === 'contain' ? 'on' : ''}">${esc(T('全体を収める'))}</button></div></div>
      ${row('iaZoom', T('大きさ'), pct(x.zoom || 1), 20, 400, 1, (v) => v + '%')}
      ${row('iaX', T('横位置'), pct(x.ox || 0), -100, 100, 1, (v) => (v > 0 ? '+' : '') + v + '%')}
      ${row('iaY', T('縦位置'), pct(x.oy || 0), -100, 100, 1, (v) => (v > 0 ? '+' : '') + v + '%')}
      ${row('iaRot', T('回転'), Math.round(x.rot || 0), -180, 180, 1, (v) => v + '°')}
      <div class="row"><label class="tg"><input type="checkbox" id="iaFlip" ${x.flip ? 'checked' : ''}><i></i>${esc(T('左右反転'))}</label></div>
      <div class="row"><label>${esc(T('パン（動き）'))}</label><select id="iaPan" style="flex:1">${Object.entries(PAN_N).map(([k, n]) => `<option value="${k}" ${(x.pan || 'auto') === k ? 'selected' : ''}>${esc(T(n))}</option>`).join('')}</select></div>
      ${(x.pan || 'auto') !== 'auto' && x.pan !== 'none' ? row('iaPanAmt', T('動きの量'), x.panAmt == null ? 50 : x.panAmt, 0, 100, 1, (v) => v) : ''}
      <div class="row"><span class="sp"></span><button class="btn sm" id="iaReset">${esc(T('位置・大きさ・回転を戻す'))}</button></div>`;
    const bind = (id, fn, fmt) => { const el = $('#' + id); if (!el) return; el.addEventListener('input', () => { fn(+el.value); $('#' + id + 'V').textContent = fmt(+el.value); S.dirty = true; commitSoon(); }); };
    bind('iaZoom', (v) => (x.zoom = v === 100 ? undefined : v / 100), (v) => v + '%');
    bind('iaX', (v) => (x.ox = v ? v / 100 : undefined), (v) => (v > 0 ? '+' : '') + v + '%');
    bind('iaY', (v) => (x.oy = v ? v / 100 : undefined), (v) => (v > 0 ? '+' : '') + v + '%');
    bind('iaRot', (v) => (x.rot = v || undefined), (v) => v + '°');
    bind('iaPanAmt', (v) => (x.panAmt = v), (v) => v);
    $$('#iaFit button').forEach((b) => (b.onclick = () => { if (b.dataset.v === 'contain') x.fit = 'contain'; else delete x.fit; commit(); }));
    $('#iaFlip').onchange = (e) => { if (e.target.checked) x.flip = true; else delete x.flip; commit(); };
    $('#iaPan').onchange = (e) => { if (e.target.value === 'auto') delete x.pan; else x.pan = e.target.value; commit(); };
    $('#iaDrag').onchange = (e) => { S.imgEditOn = e.target.checked; $('#frame').classList.toggle('imgedit', S.imgEditOn); };
    $('#iaReset').onclick = () => { ['ox', 'oy', 'zoom', 'rot', 'flip', 'fit', 'fx', 'fy'].forEach((k) => delete x[k]); commit(); };
    $('#iaClose').onclick = () => openImgAdj(null);
  }
  function renderImgs() {
    const L = P.images || [];
    $('#imgList').innerHTML = L.map((x, i) => { const im = S.images[imgKey(x.id)]; return `<div class="im ${x.on !== false ? 'on' : 'off'}" data-i="${i}" title="${esc(x.name)}（クリックでオン／オフ・ダブルクリックで位置・大きさ・回転・パンを調整）" style="background-image:url('${im ? im.src : ''}')"><span class="no">${i + 1}</span>${x.type === 'video' ? `<span class="vd">▶ ${fmtDur(x.dur)}</span>` : ''}<button class="ix" data-x="${i}" title="削除">×</button><button class="ie" data-e="${i}" title="位置・大きさ・回転・パンを調整">調整</button><span class="mv"><button data-l="${i}">◀</button><button data-r="${i}">▶</button></span></div>`; }).join('');
    $('#imgCount').textContent = L.length ? `${L.filter((x) => x.on !== false).length} / ${L.length}枚を使用` : '';
    $$('#imgList .im').forEach((el) => {
      el.onclick = (e) => { if (e.target.closest('button')) return; const x = P.images[+el.dataset.i]; x.on = x.on === false; commit(); };
      el.ondblclick = () => openImgAdj(P.images[+el.dataset.i].id);
    });
    $$('#imgList [data-x]').forEach((b) => (b.onclick = async (e) => { e.stopPropagation(); const i = +b.dataset.x, x = P.images[i]; if (!(await ask(`「${x.name}」を背景画像から削除しますか？`, { ok: '削除' }))) return; P.images.splice(i, 1); P.cues.forEach((c) => { if (c.img === x.id) delete c.img; }); const v = S.images[imgKey(x.id)]; if (v && v.dispose) v.dispose(); delete S.images[imgKey(x.id)]; commit(); }));
    $$('#imgList [data-e]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const x = P.images[+b.dataset.e]; openImgAdj(S.imgAdj === x.id ? null : x.id); }));
    $$('#imgList .im').forEach((el) => el.classList.toggle('edit', !!S.imgAdj && (P.images[+el.dataset.i] || {}).id === S.imgAdj));
    renderImgAdj();
    renderVidOpts();
    $$('#imgList [data-l],#imgList [data-r]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const i = +(b.dataset.l ?? b.dataset.r), j = i + (b.dataset.l != null ? -1 : 1); if (j < 0 || j >= P.images.length) return; [P.images[i], P.images[j]] = [P.images[j], P.images[i]]; commit(); }));
  }
  function syncImgUI() {
    $('#imgOn').checked = P.imgMode !== 'off' && (P.images || []).length > 0;
    $('#imgChange').value = P.imgChange || 'auto'; $('#imgEvery').value = String(P.imgEvery || 2);
    $('#imgEveryRow').hidden = !['phrase', 'bars', 'auto'].includes(P.imgChange || 'auto'); $('#imgEveryU').textContent = (P.imgChange || 'auto') === 'bars' ? '小節ごと' : 'フレーズごと';
    seg('#imgOrder', P.imgOrder || 'order', (v) => { P.imgOrder = v; commit(); });
    const tr = LM.Renderer.imgTrans; $('#imgTransCur').textContent = P.imgTrans && P.imgTrans !== 'auto' && tr[P.imgTrans] ? tr[P.imgTrans].n : 'おまかせ（テーマに合わせて毎回変える）';
    $('#imgTransDur').value = Math.round((P.imgTransDur || 0) * 100); $('#imgTransDurV').textContent = P.imgTransDur > 0 ? P.imgTransDur.toFixed(2) + 's' : '1拍（自動）';
    $('#imgLook').value = P.imgLook || 'natural';
    $('#imgDim').value = Math.round((P.imgDim != null ? P.imgDim : (P.bg && P.bg.dim) ?? 0.35) * 100); $('#imgDimV').textContent = $('#imgDim').value + '%';
    $('#imgBlur').value = P.imgBlur != null ? P.imgBlur : (P.bg && P.bg.blur) || 0; $('#imgBlurV').textContent = $('#imgBlur').value;
    const iop = Math.round((P.imgOpacity == null ? 1 : P.imgOpacity) * 100); $('#imgOpacity').value = iop; $('#imgOpacityV').textContent = iop + '%'; $('#imgBlend').value = P.imgBlend || 'normal';
    $('#imgFirst').checked = !!P.imgFirst; $('#imgFirstApply').disabled = !P.imgFirst;
    $('#imgKB').checked = P.imgKB !== false; $('#imgBeat').checked = !!P.imgBeat; $('#imgBgmFull').checked = !!P.imgBgmFull;
    renderImgs();
  }
  $('#imgFiles').onchange = (e) => { addImages(e.target.files); e.target.value = ''; };
  (() => { const d = $('#imgDrop'); d.onclick = () => $('#imgFiles').click(); ['dragenter', 'dragover'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.add('over'); })); ['dragleave', 'drop'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.remove('over'); })); d.addEventListener('drop', (e) => addImages(e.dataTransfer.files)); })();
  $('#imgOn').onchange = (e) => { if (e.target.checked && !(P.images || []).length) { e.target.checked = false; $('#imgFiles').click(); return; } P.imgMode = e.target.checked ? 'auto' : 'off'; commit(); };
  $('#imgChange').onchange = (e) => { P.imgChange = e.target.value; commit(); if (P.imgChange === 'manual') toast('右の詳細パネル「背景画像」で、切り替えたい行に画像を指定してください'); };
  $('#imgEvery').onchange = (e) => { P.imgEvery = +e.target.value; commit(); };
  $('#imgTransPick').onclick = () => openPicker('itrans');
  $('#imgTransDur').addEventListener('input', (e) => { P.imgTransDur = +e.target.value / 100; $('#imgTransDurV').textContent = P.imgTransDur > 0 ? P.imgTransDur.toFixed(2) + 's' : '1拍（自動）'; S.dirty = true; commitSoon(); });
  $('#imgLook').onchange = (e) => { P.imgLook = e.target.value; commit(); };
  $('#imgDim').addEventListener('input', (e) => { P.imgDim = +e.target.value / 100; $('#imgDimV').textContent = e.target.value + '%'; S.dirty = true; commitSoon(); });
  $('#imgBlur').addEventListener('input', (e) => { P.imgBlur = +e.target.value; $('#imgBlurV').textContent = e.target.value; S.dirty = true; commitSoon(); });
  $('#imgKB').onchange = (e) => { P.imgKB = e.target.checked; commit(); };
  $('#imgBeat').onchange = (e) => { P.imgBeat = e.target.checked; commit(); };
  $('#imgBgmFull').onchange = (e) => { P.imgBgmFull = e.target.checked; commit(); };
  function imgFirstApply(quiet) {
    LM.imgFirst.applyLook(P); const n = LM.imgFirst.fitCues(P);
    if (P.imgMode === 'off' && (P.images || []).length) P.imgMode = 'auto';
    commit();
    if (!quiet) toast(n ? T('画像を覆う背景モーション{0}か所を、画像が見えるものに差し替えました').replace('{0}', n) : '画像がよく見える設定にしました');
  }
  $('#imgFirst').onchange = (e) => { P.imgFirst = e.target.checked; if (P.imgFirst) imgFirstApply(); else { commit(); toast('おまかせは通常の背景モーションも選ぶようになります（いまの演出はそのまま）'); } };
  $('#imgFirstApply').onclick = () => imgFirstApply();
  $('#imgOpacity').addEventListener('input', (e) => { P.imgOpacity = +e.target.value / 100; $('#imgOpacityV').textContent = e.target.value + '%'; S.dirty = true; commitSoon(); });
  $('#imgBlend').onchange = (e) => { P.imgBlend = e.target.value; commit(); };
  // 背景モーションの重ね方（不透明度・描画モード）— the same two settings appear in the background-motion and image sections
  function syncBgmMix() {
    const op = Math.round((P.bgmOpacity == null ? 1 : P.bgmOpacity) * 100), bl = P.bgmBlend || 'normal';
    $$('.bgmOp').forEach((el) => { el.value = op; const v = $('#' + el.id + 'V'); if (v) v.textContent = op + '%'; });
    $$('.bgmBl').forEach((el) => { el.value = bl; });
    // show where the global value is overridden (per phrase / per instrumental section)
    const nc = (P.cues || []).filter((c) => c.bgmOpacity != null || c.bgmBlend != null).length;
    const ov = P.gapOv || {}, ng = Object.keys(ov).filter((k) => ov[k] && (ov[k].opacity != null || ov[k].blend != null)).length;
    const all = P.gapOpacity != null || P.gapBlend != null;
    const parts = []; if (nc) parts.push(T('フレーズ {0}行').replace('{0}', nc)); if (ng) parts.push(T('区間 {0}か所').replace('{0}', ng)); if (all) parts.push(T('歌詞のない区間すべて'));
    $$('.ovinfo').forEach((el) => {
      el.hidden = !parts.length; if (!parts.length) { el.innerHTML = ''; return; }
      el.innerHTML = `<b class="ovb">${esc(T('個別'))}</b><span style="flex:1">${esc(T('ここと違う設定があります：{0}').replace('{0}', parts.join(T('、'))))}</span><button class="btn sm ovclr">${esc(T('個別設定を解除'))}</button>`;
      el.querySelector('.ovclr').onclick = () => { (P.cues || []).forEach((c) => { delete c.bgmOpacity; delete c.bgmBlend; }); Object.keys(ov).forEach((k) => { if (ov[k]) { delete ov[k].opacity; delete ov[k].blend; if (!Object.keys(ov[k]).length) delete ov[k]; } }); P.gapOpacity = null; P.gapBlend = null; commit(); toast(T('背景モーションの重ね方を全体の設定にそろえました')); };
    });
  }
  const ovMark = (row, on) => { if (!row) return; const lb = row.querySelector('label'); if (!lb) return; let b = lb.querySelector('.ovb'); if (on && !b) { b = document.createElement('b'); b.className = 'ovb'; b.textContent = T('個別'); lb.appendChild(b); } else if (!on && b) b.remove(); };
  $$('.bgmOp').forEach((el) => el.addEventListener('input', () => { P.bgmOpacity = +el.value / 100; P.bgmMixSet = true; syncBgmMix(); S.dirty = true; commitSoon(); }));
  $$('.bgmBl').forEach((el) => (el.onchange = () => { P.bgmBlend = el.value; P.bgmMixSet = true; syncBgmMix(); commit(); }));

  /* ---------------- background motion & tempo ---------------- */
  function syncBgmUI() {
    $('#autoBgm').checked = !!P.autoBgm;
    const names = (P.bgm || []).map((id) => (LM.bgm.lib[id] || {}).n).filter(Boolean);
    $('#bgmCur').textContent = P.autoBgm ? 'テーマに合わせてセクションごとに自動で選びます' : names.length ? names.join(' ＋ ') : 'なし';
    $('#bgmAmt').value = Math.round((P.bgmAmt ?? 1) * 100); $('#bgmAmtV').textContent = $('#bgmAmt').value + '%';
    $('#bgmSpeed').value = Math.round((P.bgmSpeed ?? 1) * 100); $('#bgmSpeedV').textContent = $('#bgmSpeed').value + '%';
    $('#tempoSync').checked = P.tempoSync !== false;
    syncGapUI();
    const th = D.themeById[P.theme];
    $('#tempoSel').innerHTML = Object.entries(D.tempos).map(([k, v]) => `<option value="${k}">${v}${k === 'theme' && th ? `（${th.n}：${Math.round(th.speed * 100)}%）` : ''}</option>`).join('');
    const match = Object.keys(D.tempos).find((k) => k !== 'theme' && Math.abs(+k - (P.speed || 1)) < 0.01);
    $('#tempoSel').value = th && Math.abs(th.speed - (P.speed || 1)) < 0.01 ? 'theme' : match || 'theme';
  }
  $('#bgmPick').onclick = () => openPicker('bgm');
  /* ---- instrumental sections: "all sections" or one section (its own overrides in P.gapOv[key]) ---- */
  const GAP_G = { fill: 'gapFill', bgm: 'gapBgm', opacity: 'gapOpacity', blend: 'gapBlend', amt: 'gapAmt', speed: 'gapSpeed', cam: 'gapCam', every: 'gapEvery', flash: 'gapFlash', visAmt: 'gapVisAmt', label: 'gapLabel', countdown: 'gapCountdown', progress: 'gapProgress' };
  const gapList = () => { try { view.setProject(P); return view.gaps(); } catch (e) { return []; } };
  const gapByKey = (k) => gapList().find((g) => view.gapKey(g) === k) || null;
  function gapName(g) {
    const sec = g.sec && MD.SEC[g.sec] ? MD.SEC[g.sec].n : null;
    const kind = sec || { intro: 'イントロ', inter: '間奏', outro: 'アウトロ' }[g.kind] || '間奏';
    return `${T(kind)}  ${U.fmtTime(g.t0, false)}–${U.fmtTime(g.t1, false)}`;
  }
  function gapCur() { const g = S.gapTarget ? gapByKey(S.gapTarget) : null; if (S.gapTarget && !g) S.gapTarget = null; return { g, cf: view.gapCfg(g) }; }
  function gapSet(k, v) {
    if (S.gapTarget) { P.gapOv = P.gapOv || {}; const o = (P.gapOv[S.gapTarget] = P.gapOv[S.gapTarget] || {}); if (v === undefined) delete o[k]; else o[k] = v; if (!Object.keys(o).length) delete P.gapOv[S.gapTarget]; }
    else if (k === 'vis') { P.gapVisual = v !== 'none'; P.gapVisStyle = v === 'none' ? 'auto' : v; }
    else if (k === 'labelText') return;
    else P[GAP_G[k]] = v === undefined ? null : v;
  }
  function syncGapUI() {
    const gs = gapList();
    $('#gapTarget').innerHTML = `<option value="">${esc(T('すべての区間'))}</option>` + gs.map((g) => { const k = view.gapKey(g); const ov = P.gapOv && P.gapOv[k]; return `<option value="${esc(k)}">${esc(gapName(g))}${ov ? ' ●' : ''}</option>`; }).join('');
    const { g, cf } = gapCur(); $('#gapTarget').value = S.gapTarget || '';
    const one = !!g; $('#gapTargetHint').hidden = !one; $('#gapReset').hidden = !one; $('#gapMinRow').hidden = one; $('#gapLabelTextRow').hidden = !one;
    $('#gapFill').value = cf.fill; $('#gapVisStyle').value = cf.vis || 'auto';
    $('#gapLabel').checked = !!cf.label; $('#gapCountdown').checked = !!cf.countdown; $('#gapProgress').checked = cf.progress !== false;
    $('#gapLabelText').value = cf.labelText || ''; $('#gapMin').value = String(P.gapMin || 1.2);
    $('#gapBgmCur').textContent = (cf.bgm || []).length ? cf.bgm.map((id) => (LM.bgm.lib[id] || {}).n).filter(Boolean).join(' ＋ ') : T('おまかせ');
    const gov = (g && P.gapOv && P.gapOv[S.gapTarget]) || null;
    $$('#gapBox .gk').forEach((el) => {
      const k = el.dataset.k, m = +el.dataset.m || 1, v = cf[k], val = el.nextElementSibling;
      ovMark(el.closest('.row'), !!gov && gov[k] != null);
      if (el.tagName === 'SELECT') { el.value = k === 'blend' ? v || '' : String(v == null ? 'auto' : v); return; }
      if (k === 'opacity') { const inh = v == null, ov = inh ? (P.bgmOpacity == null ? 1 : P.bgmOpacity) : v; el.value = Math.round(ov * 100); if (val) val.textContent = inh ? `${T('全体')} ${Math.round(ov * 100)}%` : Math.round(ov * 100) + '%'; return; }
      el.value = Math.round((v == null ? 1 : v) * m); if (val) val.textContent = Math.round((v == null ? 1 : v) * 100) + '%';
    });
  }
  $('#gapTarget').onchange = (e) => { S.gapTarget = e.target.value || null; syncGapUI(); const g = S.gapTarget && gapByKey(S.gapTarget); if (g) seek(Math.min(g.t1 - 0.05, g.t0 + Math.min(1.5, (g.t1 - g.t0) / 2))); };
  $$('#gapBox .gk').forEach((el) => {
    const k = el.dataset.k, m = +el.dataset.m || 1;
    if (el.tagName === 'SELECT') el.onchange = () => { gapSet(k, k === 'blend' ? el.value || undefined : el.value); commit(); };
    else el.addEventListener('input', () => { gapSet(k, +el.value / m); const val = el.nextElementSibling; if (val) val.textContent = el.value + '%'; S.dirty = true; commitSoon(); });
  });
  $('#gapOpInherit').onclick = () => { gapSet('opacity', undefined); commit(); };
  $('#gapBgmPick').onclick = () => openPicker('gbgm');
  $('#gapFill').onchange = (e) => { gapSet('fill', e.target.value); commit(); };
  $('#gapVisStyle').onchange = (e) => { gapSet('vis', e.target.value); commit(); };
  $('#gapLabel').onchange = (e) => { gapSet('label', e.target.checked); commit(); };
  $('#gapCountdown').onchange = (e) => { gapSet('countdown', e.target.checked); commit(); };
  $('#gapProgress').onchange = (e) => { gapSet('progress', e.target.checked); commit(); };
  $('#gapLabelText').addEventListener('input', (e) => { gapSet('labelText', e.target.value.trim() ? e.target.value.slice(0, 40) : undefined); S.dirty = true; commitSoon(); });
  $('#gapMin').onchange = (e) => { P.gapMin = +e.target.value; commit(); };
  $('#gapReset').onclick = () => { if (S.gapTarget && P.gapOv) delete P.gapOv[S.gapTarget]; commit(); };
  $('#autoBgm').onchange = (e) => { P.autoBgm = e.target.checked; if (P.autoBgm && P.cues.length && !P.cues.some((c) => c.scene && c.scene.bgm)) { P.cues = LM.director.generate(P, { seed: P.seed }); } commit(); };
  $('#bgmAmt').oninput = (e) => { P.bgmAmt = +e.target.value / 100; $('#bgmAmtV').textContent = e.target.value + '%'; S.dirty = true; commitSoon(); };
  $('#bgmSpeed').oninput = (e) => { P.bgmSpeed = +e.target.value / 100; $('#bgmSpeedV').textContent = e.target.value + '%'; S.dirty = true; commitSoon(); };
  $('#tempoSel').onchange = (e) => { const v = e.target.value; P.speed = v === 'theme' ? (D.themeById[P.theme] || {}).speed || 1 : +v; commit(); };
  $('#tempoSync').onchange = (e) => { P.tempoSync = e.target.checked; commit(); };

  /* ---------------- panels: fx ---------------- */
  function fxChips(host, activeSet, onToggle, amtMap, onAmt) {
    const byCat = {};
    Object.entries(FX.list).forEach(([id, f]) => (byCat[f.c] = byCat[f.c] || []).push([id, f]));
    host.innerHTML = Object.entries(FX.cats).map(([c, n]) => `<div class="fxg"><h4>${n}</h4><div class="fxc">${(byCat[c] || []).map(([id, f]) => `<button class="chip ${activeSet.has(id) ? 'on' : ''}" data-f="${id}">${esc(f.n)}</button>`).join('')}</div>${amtMap ? `<div class="fxamt">${(byCat[c] || []).filter(([id]) => activeSet.has(id)).map(([id, f]) => `<span>${esc(f.n)}</span><input type="range" min="0" max="200" step="5" value="${Math.round((amtMap[id] ?? 1) * 100)}" data-a="${id}">`).join('')}</div>` : ''}</div>`).join('');
    $$('.chip', host).forEach((b) => (b.onclick = () => onToggle(b.dataset.f)));
    $$('input[data-a]', host).forEach((el) => el.addEventListener('input', () => onAmt(el.dataset.a, +el.value / 100)));
  }
  function buildFxGlobal() {
    fxChips($('#fxGlobal'), new Set(P.filters), (id) => { const i = P.filters.indexOf(id); i >= 0 ? P.filters.splice(i, 1) : P.filters.push(id); commit(); }, P.filterAmt, (id, v) => { P.filterAmt[id] = v; S.dirty = true; commitSoon(); });
  }
  $('#fxClear').onclick = () => { P.filters = []; commit(); };
  $('#beatSync').onchange = (e) => { P.beatSync = e.target.checked; commit(); };
  $('#bpm').onchange = (e) => { const v = +e.target.value; P.bpm = v > 0 ? U.clamp(v, 30, 300) : null; commit(); };
  $('#beatOffset').onchange = (e) => { P.beatOffset = +e.target.value || 0; commit(); };
  let taps = [];
  $('#tapTempo').onclick = () => {
    const t = performance.now(); taps = taps.filter((x) => t - x < 3000); taps.push(t);
    if (taps.length >= 3) { const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); P.bpm = Math.round((60000 / iv) * 10) / 10; P.beatOffset = Math.round((now() % (60 / P.bpm)) * 100) / 100; $('#bpm').value = P.bpm; $('#beatOffset').value = P.beatOffset; commitSoon(); }
  };

  /* ---------------- fine timing: latency / shift / quantize ---------------- */
  const FT = { shift: 'all', qt: 'all' };
  $('#tapLat').addEventListener('input', (e) => { P.tapLatency = +e.target.value / 1000; $('#tapLatV').textContent = P.tapLatency.toFixed(2) + 's'; commitSoon(); });
  seg('#shiftTarget', FT.shift, (v) => (FT.shift = v));
  seg('#qTarget', FT.qt, (v) => (FT.qt = v));
  $$('[data-sh]').forEach((b) => (b.onclick = () => {
    if (!P.cues.length) return;
    const from = FT.shift === 'after' ? Math.max(0, S.sel) : 0;
    const err = MD.shiftFrom(P, from, +b.dataset.sh);
    if (err) return toast(err, true);
    commit({ quiet: true }); renderList(); renderInspector(); S.dirty = true;
    toast(`${FT.shift === 'after' ? `${from + 1}行目以降` : '全行'}を ${(+b.dataset.sh > 0 ? '+' : '') + (+b.dataset.sh).toFixed(2)}秒 ずらしました`);
  }));
  $('#qStr').addEventListener('input', (e) => { P.qStrength = +e.target.value / 100; $('#qStrV').textContent = e.target.value + '%'; commitSoon(); });
  $('#qEnd').onchange = (e) => { P.qEnd = e.target.checked; commitSoon(); };
  $('#autoQ').onchange = (e) => { P.autoQuantize = e.target.checked; commitSoon(); if (e.target.checked && !MD.beatGrid(P, LM.audio.analysis, 1)) toast('ビート情報がありません。音源を読み込むか、エフェクトタブでBPMを入力してください', true); };
  $('#qRun').onclick = () => {
    const grid = MD.beatGrid(P, LM.audio.analysis, P.qGrid || 1);
    if (!grid) return toast('ビート情報がありません。音源を読み込む（自動解析）か、エフェクトタブでBPMを入力してください', true);
    if (!P.cues.length) return;
    const sel = Math.max(0, S.sel);
    const o = { strength: P.qStrength ?? 1, ends: !!P.qEnd, from: FT.qt === 'all' ? 0 : sel, to: FT.qt === 'one' ? sel : null };
    const r = MD.quantize(P, grid, o);
    commit({ quiet: true }); renderList(); renderInspector(); S.dirty = true;
    toast(`${r.moved}行をビートにそろえました${r.skipped ? `（${r.skipped}行は前の行と重なるため見送り）` : ''}`);
  };
  function syncFine() {
    $('#tapLat').value = Math.round((P.tapLatency ?? 0.12) * 1000); $('#tapLatV').textContent = (P.tapLatency ?? 0.12).toFixed(2) + 's';
    seg('#qGrid', String(P.qGrid || 1), (v) => { P.qGrid = +v; commitSoon(); syncFine(); });
    $('#qStr').value = Math.round((P.qStrength ?? 1) * 100); $('#qStrV').textContent = $('#qStr').value + '%';
    $('#qEnd').checked = !!P.qEnd; $('#autoQ').checked = !!P.autoQuantize;
    const an = LM.audio.analysis;
    $('#qInfo').textContent = P.bpm > 0 ? `グリッド：手入力 ${P.bpm} BPM（ずれ ${P.beatOffset || 0}秒）` : an && an.bpm ? `グリッド：解析したビート（約 ${an.bpm} BPM・目安）。ずれる場合はエフェクトタブでBPMを手入力してください` : 'ビート情報がありません。音源を読み込むかBPMを入力してください';
  }
  // latency calibration with a click track
  const CAL = { ac: null, clicks: [], taps: [], per: 0.6 };
  $('#calBtn').onclick = () => { pause(); $('#calOut').textContent = ''; $('#calUse').disabled = true; $('#calModal').classList.add('open'); };
  function calStop() { if (CAL.ac) { try { CAL.ac.close(); } catch (e) {} CAL.ac = null; } }
  $('#calClose').onclick = () => { calStop(); $('#calModal').classList.remove('open'); };
  $('#calStart').onclick = () => {
    calStop();
    const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC(); CAL.ac = ac;
    CAL.clicks = []; CAL.taps = [];
    const t0 = ac.currentTime + 0.6;
    for (let k = 0; k < 20; k++) {
      const t = t0 + k * CAL.per; CAL.clicks.push(t);
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = k % 4 === 0 ? 1500 : 1000; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.start(t); o.stop(t + 0.06);
    }
    $('#calOut').textContent = 'クリックに合わせてタップ… 0回';
  };
  function calTap() {
    const ac = CAL.ac; if (!ac) return;
    const t = ac.currentTime;
    const near = CAL.clicks.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), CAL.clicks[0]);
    CAL.taps.push(t - near);
    const use = CAL.taps.slice(2).filter((d) => Math.abs(d) < CAL.per * 0.45);
    if (use.length >= 8) {
      const m = use.slice().sort((a, b) => a - b)[Math.floor(use.length / 2)];
      const spread = Math.max(...use) - Math.min(...use);
      CAL.result = U.clamp(m, 0, 0.4);
      $('#calOut').innerHTML = `平均 <b>${m >= 0 ? m.toFixed(3) + '秒 遅れ' : (-m).toFixed(3) + '秒 早め'}</b>（ばらつき ${spread.toFixed(2)}秒）`;
      $('#calUse').disabled = false;
    } else $('#calOut').textContent = `クリックに合わせてタップ… ${CAL.taps.length}回`;
  }
  $('#calTap').addEventListener('pointerdown', (e) => { e.preventDefault(); calTap(); });
  document.addEventListener('keydown', (e) => { if ($('#calModal').classList.contains('open') && e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) calTap(); } }, true);
  $('#calUse').onclick = () => { P.tapLatency = Math.round(CAL.result * 100) / 100; calStop(); $('#calModal').classList.remove('open'); syncFine(); commit({ quiet: true }); toast(`タップ遅れ補正を ${P.tapLatency.toFixed(2)}秒 にしました`); };

  /* ---------------- cue list ---------------- */
  function renderListSoft() {
    const c = selCue(); if (!c) return;
    const row = $(`#cueList .cue[data-i="${S.sel}"] .x`); if (row) row.textContent = plain(c.text);
  }
  function renderList() {
    const iss = MD.validate(P);
    const bad = new Set(iss.filter((x) => x.type !== 'over').map((x) => x.i));
    const over = new Set(iss.filter((x) => x.type === 'over').map((x) => x.i));
    $('#cueCount').textContent = `${P.cues.length}行`;
    $('#cueList').innerHTML = P.cues.length ? P.cues.map((c, i) => `<div class="cue ${i === S.sel ? 'on' : ''} ${bad.has(i) ? 'bad' : ''} ${over.has(i) ? 'over' : ''} ${S.lowConf && S.lowConf.has(c.id) ? 'low' : ''}" data-i="${i}" ${over.has(i) ? 'title="曲の終わりをはみ出しています"' : S.lowConf && S.lowConf.has(c.id) ? 'title="歌声からの自動配置で確信度が低い行です。再生して確認してください"' : ''}><span class="n">${i + 1}</span><span class="t">${U.fmtTime(c.start)}<br>${U.fmtTime(c.end)}</span><span class="x" data-noi18n>${esc(plain(c.text))}</span><span class="lk">${c.locked ? '🔒' : ''}</span><button class="btn sm rip" data-r="${i}" title="再生位置をこの行の開始にして、以降の行も同じだけずらす（Shift+I）">ここから</button></div>`).join('') : '<div class="empty">まだフレーズがありません。<br>「素材」タブで歌詞を配置してください。</div>';
    $$('#cueList .cue').forEach((el) => (el.onclick = (e) => clickSel(+el.dataset.i, e, !S.playing)));
    $$('#cueList .rip').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); ripple(+b.dataset.r); }));
    S.nowIdx = null; markNow(now());
    const ov = iss.filter((x) => x.type === 'over'), rest = iss.filter((x) => x.type !== 'over');
    $('#issues').innerHTML = (ov.length ? `<div class="warn">${ov.length}行が曲の終わりをはみ出しています。補正を続ければ収まります（はみ出した部分は書き出しに含まれません）。</div>` : '') + (rest.length ? `<div class="warn">${rest.slice(0, 6).map((x) => esc(x.msg)).join('<br>')}${rest.length > 6 ? `<br>…ほか${rest.length - 6}件` : ''}</div>` : '');
  }
  function markNow(t) {
    const i = P.cues.findIndex((c) => t >= c.start && t < c.end);
    if (i === S.nowIdx) return;
    S.nowIdx = i;
    $$('#cueList .cue').forEach((el) => el.classList.toggle('now', +el.dataset.i === i));
  }
  const LAT = () => (S.playing ? (P.tapLatency ?? 0.12) : 0);
  function stampTime() {
    let t = Math.max(0, now() - LAT());
    if (P.autoQuantize) { const g = MD.beatGrid(P, LM.audio.analysis, P.qGrid || 1); if (g) t = MD.nearest(g, t); }
    return t;
  }
  function ripple(i) {
    const c = P.cues[i]; if (!c) return;
    const t = stampTime();
    const r = MD.rippleStart(P, i, t);
    if (r.err) return toast(r.err, true);
    S.sel = i; lastActive = -1;
    commit({ quiet: true }); renderList(); renderInspector(); S.dirty = true;
    const later = P.cues.length - 1 - i;
    const nOver = P.cues.filter((q) => q.end > dur() + 1e-4).length;
    toast(`${i + 1}行目を ${U.fmtTime(t)} に合わせました${LAT() ? `（遅れ補正 −${LAT().toFixed(2)}s${P.autoQuantize ? '・ビート吸着' : ''}）` : ''}${later ? `（以降${later}行を ${r.d >= 0 ? '+' : ''}${r.d.toFixed(2)}秒）` : ''}${nOver ? `・${nOver}行が曲の終わりをはみ出し中` : ''}`);
  }
  function markList() { $$('#cueList .cue').forEach((el) => { const i = +el.dataset.i; el.classList.toggle('on', i === S.sel); el.classList.toggle('msel', !!P.cues[i] && S.multi.has(P.cues[i].id)); }); const on = $('#cueList .cue.on'); if (on && $('[data-pane=list]').classList.contains('on')) on.scrollIntoView({ block: 'nearest' }); }
  $('#validate').onclick = () => { const iss = MD.validate(P); renderList(); toast(iss.length ? `${iss.length}件の問題があります` : '問題は見つかりませんでした', !!iss.length); };
  $('#repair').onclick = () => { const errs = MD.repairEnds(P); commit(); toast(errs.length ? errs[0] : '終了時刻を修復しました', !!errs.length); };
  $('#lockAll').onclick = () => { P.cues.forEach((c) => (c.locked = true)); commit(); };
  $('#unlockAll').onclick = () => { P.cues.forEach((c) => (c.locked = false)); commit(); };

  /* multi-selection (Shift = range, Ctrl/Cmd = toggle). Returns true when the click only changed the selection set */
  function clickSel(i, e, doSeek) {
    const c = P.cues[i]; if (!c) return false;
    if (e && (e.ctrlKey || e.metaKey)) {
      if (!S.multi.size && selCue()) S.multi.add(selCue().id);
      S.multi.has(c.id) ? S.multi.delete(c.id) : S.multi.add(c.id);
      if (S.multi.size <= 1) S.multi.clear();
      S.sel = i; renderInspector(); markList(); S.dirty = true; return true;
    }
    if (e && e.shiftKey && S.sel >= 0) {
      S.multi.clear(); const a = Math.min(S.sel, i), b = Math.max(S.sel, i);
      for (let k = a; k <= b; k++) S.multi.add(P.cues[k].id);
      S.sel = i; renderInspector(); markList(); S.dirty = true; return true;
    }
    if (S.multi.size) { S.multi.clear(); }
    selectCue(i, doSeek); return false;
  }
  const selTargets = () => (S.multi.size > 1 ? P.cues.filter((c) => S.multi.has(c.id)) : selCue() ? [selCue()] : []);
  function pruneMulti() { const ids = new Set(P.cues.map((c) => c.id)); for (const id of S.multi) if (!ids.has(id)) S.multi.delete(id); if (S.multi.size <= 1) S.multi.clear(); }

  /* style clipboard */
  const STYLE_KEYS = ['enter', 'hold', 'exit', 'filters', 'filterAmt', 'font', 'textScale', 'colors', 'trans', 'gfx', 'bgm', 'tf', 'ed', 'xd', 'noGlobalFilters', 'trackAdj', 'wordSpaceAdj', 'bgmOpacity', 'bgmBlend', 'emph', 'mp'];
  function copyStyle() {
    const c = selCue(); if (!c) return;
    const o = {}; STYLE_KEYS.forEach((k) => { if (c[k] !== undefined) o[k] = JSON.parse(JSON.stringify(c[k])); });
    o.scene = Object.assign({}, c.scene); delete o.scene.variant;
    S.clip = o; U.store.set('lms.clip', o); toast(`${S.sel + 1}行目のスタイルをコピーしました（Ctrl+Shift+V で貼り付け）`); renderInspector();
  }
  function pasteStyle() {
    const raw = S.clip || U.store.get('lms.clip'); if (!raw || typeof raw !== 'object') return toast('先にスタイルをコピーしてください（Ctrl+Shift+C）', true);
    // stored clipboard is untrusted: run it through the cue normalizer and keep style keys only
    const nc = MD.normalizeCue(Object.assign({}, raw, { text: '', start: 0, end: 1 })), o = {};
    STYLE_KEYS.forEach((k) => { if (raw[k] !== undefined && nc[k] !== undefined) o[k] = nc[k]; }); o.scene = nc.scene;
    const ts = selTargets(); let n = 0, skip = 0;
    ts.forEach((c) => {
      if (c.locked) { skip++; return; }
      STYLE_KEYS.forEach((k) => { if (o[k] !== undefined) c[k] = JSON.parse(JSON.stringify(o[k])); else delete c[k]; });
      c.scene = Object.assign({}, o.scene, { variant: (c.scene || {}).variant }); delete c.motion; n++;
    });
    commit(); toast(`${n}行にスタイルを貼り付けました${skip ? `（固定中の${skip}行を除く）` : ''}`);
  }

  function selectCue(i, doSeek) {
    S.sel = U.clamp(i, -1, P.cues.length - 1);
    if (doSeek && P.cues[S.sel]) seek(P.cues[S.sel].start);
    if (S.tap) S.tapIdx = Math.max(0, S.sel);
    renderInspector(); markList(); S.dirty = true;
  }

  /* ---------------- inspector ---------------- */
  const thumbR = new R({ W: 320, H: 180, gl: true });
  // apply to the selected phrase, or to every phrase in a multi-selection
  function eachSel(f) { const ids = S.multi.size > 1 ? S.multi : new Set([selCue() && selCue().id]); P.cues.forEach((q) => { if (ids.has(q.id)) f(q); }); }
  function nudgeKern(kind, d) {
    if (!selCue()) return toast('字間を調整する行を選んでください', true);
    let v = 0;
    eachSel((q) => {
      if (kind === 'track') { v = Math.round(U.clamp((q.trackAdj || 0) + d, -0.15, 0.4) * 100) / 100; if (v) q.trackAdj = v; else delete q.trackAdj; }
      else { v = Math.round(U.clamp((q.wordSpaceAdj || 1) + d, 0.4, 2.5) * 100) / 100; if (v !== 1) q.wordSpaceAdj = v; else delete q.wordSpaceAdj; }
    });
    view.invalidate(); S.dirty = true; commitSoon(); renderInspector();
    toast(kind === 'track' ? `字間 ${v > 0 ? '+' : ''}${v.toFixed(2)}em` : `単語間 ${Math.round(v * 100)}%`);
  }
  const BLEND_OPTS = [['normal', '通常'],['screen', 'スクリーン（明るく重ねる）'],['lighter', '加算（光らせる）'],['lighten', '比較（明）'],['color-dodge', '覆い焼きカラー'],['overlay', 'オーバーレイ'],['soft-light', 'ソフトライト'],['hard-light', 'ハードライト'],['multiply', '乗算（暗く重ねる）'],['darken', '比較（暗）'],['difference', '差の絶対値'],['exclusion', '除外'],['luminosity', '輝度（明度だけ重ねる）'],['color', 'カラー（色だけ重ねる）']];
  function renderInspector() {
    view.setProject(P);
    const c = selCue(), b = $('#ibody');
    // while the phrase text is being typed (incl. IME composition), keep the textarea alive: no rebuild until it loses focus
    const act = document.activeElement;
    if (c && act && act.id === 'iText' && b.dataset.cue === c.id && S.multi.size <= 1) { $('#iTitle').textContent = `フレーズ ${S.sel + 1} / ${P.cues.length}`; S.inspStale = true; S.dirty = true; return; }
    S.inspStale = false;
    $('#iLock').disabled = $('#iReroll').disabled = !c;
    if (!c) { $('#iTitle').textContent = 'フレーズ詳細'; b.innerHTML = '<div class="empty">タイムラインかフレーズ一覧で行を選ぶと、<br>登場・保持・退場の動き、レイアウト、色、書体、<br>エフェクトを個別に調整できます。</div>'; return; }
    $('#iTitle').textContent = `フレーズ ${S.sel + 1} / ${P.cues.length}`;
    $('#iLock').textContent = c.locked ? '🔒' : '🔓'; $('#iLock').classList.toggle('on', !!c.locked);
    const tr = R.tracksOf(c), sc = c.scene || {};
    const pal = R.palOf(P, c);
    const fontOpts = `<option value="">全体設定に従う</option>` + D.fonts.map((f) => `<option value="${f.id}" ${c.font === f.id ? 'selected' : ''}>${esc(f.n)}</option>`).join('');
    const palOpts = `<option value="">全体設定に従う</option>` + D.palettes.map((p) => `<option value="${p.id}" ${sc.pal === p.id ? 'selected' : ''}>${esc(D.palCats[p.cat])}：${esc(p.n)}</option>`).join('');
    const warn = [];
    if (c.end - c.start < 0.6) warn.push('表示時間が短いため、動きは短縮されます');
    const WR = LM.typo.words(c.text).list, wset = Array.isArray(c.words) && c.words.length === WR.length ? c.words : null;
    const nW = wset ? wset.filter((x) => x != null).length : 0;
    const tf = c.tf || {};
    const tfRow = (id, lab, v, min, max, step, unit) => `<div class="row"><label>${lab}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><span class="val" id="${id}V">${unit(v)}</span></div>`;
    b.innerHTML = `
      ${S.multi.size > 1 ? `<div class="multi"><b>${S.multi.size}行を選択中</b><span style="flex-basis:100%;opacity:.85">モーション・レイアウト・トランジション・背景モーションの変更はまとめて適用されます</span><button class="btn sm" id="mPaste">スタイル貼り付け</button><button class="btn sm" id="mReroll">🎲 再抽選</button><button class="btn sm" id="mLock">🔒 固定</button><button class="btn sm" id="mClear">選択解除</button></div>` : ''}
      ${warn.length ? `<div class="warn">${warn.join('<br>')}</div>` : ''}
      <div class="sec"><h3>歌詞</h3><textarea id="iText" rows="2" maxlength="300">${esc(c.text)}</textarea>
        <p class="hint"><b>*語句*</b> で強調、<b>/</b> で改行、<b>漢字《かんじ》</b> でルビ</p></div>
      <div class="sec"><h3>タイミング <span class="sp"></span><button class="btn sm" id="iPlay">▶ この行を再生</button></h3>
        <div class="time2"><span class="hint">開始</span><input type="text" id="iStart"><button class="btn sm" id="iStampS" title="再生位置を開始に (I)"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg></button>
        <span></span><button class="btn sm" id="iRipple" style="grid-column:2/4" title="再生中にこの行が始まった瞬間に押す（Shift+I）">▶ 再生位置をここから開始（以降の行もずらす）</button>
        <span></span><button class="btn sm" id="iRealign" style="grid-column:2/4" title="この行の開始は固定し、以降の行を歌声に合わせて置き直します" ${hasAudio() ? '' : 'disabled'}>🎤 以降の行を歌声に合わせ直す</button>
        <span class="hint">終了</span><input type="text" id="iEnd"><button class="btn sm" id="iStampE" title="再生位置を終了に (O)"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg></button></div>
        <div class="row" style="margin-top:6px"><span class="hint" id="iDur"></span><span class="sp"></span><div class="nud"><button class="btn sm" data-n="-0.1">−0.1s</button><button class="btn sm" data-n="-0.033">−1f</button><button class="btn sm" data-n="0.033">+1f</button><button class="btn sm" data-n="0.1">+0.1s</button><button class="btn sm" id="iSnap" title="この行の開始を一番近いビートへ">ビートへ</button></div></div></div>
      <div class="sec"><h3>ワードタイミング <span class="sp"></span><span class="hint">${nW ? `${nW} / ${WR.length} 打刻済み` : '未打刻（自動で均等割り）'}</span></h3>
        <div class="wchips" id="iWords">${WR.map((w, k) => `<button data-w="${k}" class="${wset && wset[k] != null ? 'set' : ''}" title="クリック：再生位置をこの単語の歌い出しに（W）／右クリック：解除"><span data-noi18n>${esc(w.text)}</span><small>${wset && wset[k] != null ? '+' + (wset[k] - c.start).toFixed(2) + 's' : '自動'}</small></button>`).join('')}</div>
        <div class="row" style="margin-top:6px"><button class="btn sm" id="iWEven">均等に割り付け</button><button class="btn sm" id="iWBeat">ビートに割り付け</button><button class="btn sm" id="iWClear">クリア</button></div>
        <p class="hint">カラオケ塗り・単語ハイライト・単語順に出る動き（ワード系モーション・ワードフラッシュ等）が歌に同期します。下の「単語ごと」タップでも打刻できます。</p></div>
      <div class="sec"><h3>モーション（登場 → 保持 → 強調 → 退場）</h3>
        <div class="tr3 tr4"><button class="mbtn" data-pick="enter"><small>登場</small><span>${esc(M.enter[tr.enter].n)}</span></button><button class="mbtn" data-pick="hold"><small>保持</small><span>${esc(M.hold[tr.hold].n)}</span></button><button class="mbtn" data-pick="emph"><small>強調</small><span>${esc((M.emph[tr.emph] || M.emph.none).n)}</span></button><button class="mbtn" data-pick="exit"><small>退場</small><span>${esc(M.exit[tr.exit].n)}</span></button></div>
        <details class="mpBox" ${S.mpOpen ? 'open' : ''}><summary>動きの調整（強さ・ばらつき・タイミング）${c.mp ? '<b class="ovb">個別</b>' : ''}</summary><div id="mpPanel"></div></details></div>
      <div class="sec"><h3>カット・グラフィック</h3>
        <div class="tr3" style="grid-template-columns:1fr 1fr"><button class="mbtn" data-pick="trans"><small>この行へのトランジション</small><span>${esc(c.trans && LM.trans.lib[c.trans] ? LM.trans.lib[c.trans].n : 'なし')}</span></button><button class="mbtn" data-pick="gfx"><small>アクセントグラフィック</small><span>${esc((c.gfx || []).map((id) => (LM.gfx.lib[id] || {}).n).filter(Boolean).join('＋') || 'なし')}</span></button></div>
        ${S.sel === 0 ? '<p class="hint">1行目にはトランジションは入りません</p>' : ''}</div>
      <div class="sec"><h3>レイアウト</h3><button class="lbtn" data-pick="layout"><canvas id="iLayThumb" width="168" height="96"></canvas><div><b>${esc((LM.layout.lib[sc.layout] || {}).n || '')}</b><div class="hint">クリックで一覧から選ぶ</div></div></button>
        <div class="row" style="margin-top:8px"><label>カメラ</label><select id="iCam" style="flex:1">${Object.entries(D.cameras).map(([k, v]) => `<option value="${k}" ${(sc.camera || 'still') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="row"><label>模様</label><select id="iDeco" style="flex:1">${Object.entries(D.patterns).map(([k, v]) => `<option value="${k}" ${(sc.decoration || 'none') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <label class="tg"><input type="checkbox" id="iInv" ${sc.invert ? 'checked' : ''}><i></i>背景と文字の色を反転</label>
        ${(P.images || []).length ? `<div class="row" style="margin-top:8px"><label>背景画像</label><select id="iImg" style="flex:1"><option value="">自動（全体の切り替えに従う）</option><option value="__none" ${c.img === '__none' ? 'selected' : ''}>この行から画像なし</option>${P.images.map((x, i) => `<option value="${esc(x.id)}" ${c.img === x.id ? 'selected' : ''}>${i + 1}. ${esc(x.name)}</option>`).join('')}</select></div>` : ''}
        <div class="row" style="margin-top:8px"><label>背景モーション</label><button class="btn sm" id="iBgm" style="flex:1;justify-content:flex-start;overflow:hidden">${esc(Array.isArray(c.bgm) ? (c.bgm.length ? c.bgm.map((id) => (LM.bgm.lib[id] || {}).n).join('＋') : 'なし') : '全体設定に従う（' + (view.bgmOf(c).map((id) => (LM.bgm.lib[id] || {}).n).join('＋') || 'なし') + '）')}</button></div>
        <div class="row"><label title="この行だけ背景モーションの濃さを変える">不透明度${c.bgmOpacity != null ? '<b class="ovb">個別</b>' : ''}</label><input type="range" id="iBgmOp" min="0" max="100" step="1" value="${Math.round((c.bgmOpacity != null ? c.bgmOpacity : P.bgmOpacity == null ? 1 : P.bgmOpacity) * 100)}"><span class="val" id="iBgmOpV"></span><button class="btn sm ic" id="iBgmOpR" title="全体の設定に合わせる">↺</button></div>
        <div class="row"><label title="この行だけ背景モーションの重ね方を変える">描画モード${c.bgmBlend ? '<b class="ovb">個別</b>' : ''}</label><select id="iBgmBl" style="flex:1"><option value="">全体の設定に合わせる</option>${BLEND_OPTS.map(([k, n]) => `<option value="${k}" ${c.bgmBlend === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
      <div class="sec"><h3>位置・大きさ・動きの長さ <span class="sp"></span><button class="btn sm" id="iTfReset">リセット</button></h3>
        ${tfRow('iTx', '横位置', Math.round((tf.x || 0) * 100), -50, 50, 1, (v) => (v > 0 ? '+' : '') + v + '%')}
        ${tfRow('iTy', '縦位置', Math.round((tf.y || 0) * 100), -50, 50, 1, (v) => (v > 0 ? '+' : '') + v + '%')}
        ${tfRow('iTs', '拡大', Math.round((tf.s || 1) * 100), 30, 300, 1, (v) => v + '%')}
        ${tfRow('iTr', '回転', Math.round(((tf.r || 0) * 180) / Math.PI), -45, 45, 1, (v) => v + '°')}
        ${tfRow('iEd', '登場の長さ', Math.round((c.ed || 0) * 100), 0, 300, 5, (v) => (v ? (v / 100).toFixed(2) + 's' : '自動'))}
        ${tfRow('iXd', '退場の長さ', Math.round((c.xd || 0) * 100), 0, 300, 5, (v) => (v ? (v / 100).toFixed(2) + 's' : '自動'))}
        <p class="hint">プレビュー上で文字を直接ドラッグしても動かせます（ダブルクリックで中央へ）。長さ「自動」はテンポ感・BPMに合わせます。</p></div>
      <div class="sec"><h3>配色 <span class="sp"></span><span class="sw4">${['bg', 'text', 'accent', 'sub'].map((k) => `<i style="width:14px;height:14px;border-radius:4px;background:${pal[k]};border:1px solid var(--line)"></i>`).join('')}</span></h3>
        <select id="iPal" style="width:100%">${palOpts}</select>
        <label class="tg" style="margin:8px 0"><input type="checkbox" id="iCustom" ${c.colors ? 'checked' : ''}><i></i>この行だけカスタム配色</label>
        <div class="cust" id="iColors" ${c.colors ? '' : 'hidden'}></div></div>
      <div class="sec"><h3>書体・サイズ</h3><select id="iFont" style="width:100%">${fontOpts}</select>
        <div class="row" style="margin-top:8px"><label>文字サイズ</label><input type="range" id="iSize" min="50" max="150" value="${Math.round((c.textScale || 1) * 100)}"><span class="val" id="iSizeV">${Math.round((c.textScale || 1) * 100)}%</span></div>
        <div class="row"><label title="この行だけ字間を詰める／広げる（全体の設定に上乗せ）">字間</label><button class="btn sm ic kn" data-ik="iTrack" data-d="-1" title="詰める">−</button><input type="range" id="iTrack" min="-15" max="40" step="1" value="${Math.round((c.trackAdj || 0) * 100)}"><button class="btn sm ic kn" data-ik="iTrack" data-d="1" title="広げる">＋</button><span class="val" id="iTrackV"></span></div>
        <div class="row"><label title="この行だけ英単語の間隔を調整">単語間</label><button class="btn sm ic kn" data-ik="iWsp" data-d="-5" title="詰める">−</button><input type="range" id="iWsp" min="40" max="250" step="5" value="${Math.round((c.wordSpaceAdj || 1) * 100)}"><button class="btn sm ic kn" data-ik="iWsp" data-d="5" title="広げる">＋</button><span class="val" id="iWspV"></span></div></div>
      <div class="sec"><h3>この行のエフェクト <span class="sp"></span><label class="tg" title="全体エフェクトをこの行では使わない"><input type="checkbox" id="iNoG" ${c.noGlobalFilters ? 'checked' : ''}><i></i>全体を無効</label></h3><div id="iFx"></div></div>
      <div class="sec"><h3>スタイル</h3><div class="row" style="flex-wrap:wrap"><button class="btn sm" id="iCopy" title="Ctrl+Shift+C">スタイルをコピー</button><button class="btn sm" id="iPasteS" title="Ctrl+Shift+V" ${S.clip || U.store.get('lms.clip') ? '' : 'disabled'}>貼り付け</button><span class="sp"></span></div>
        <button class="btn" id="iDup" style="width:100%;margin-top:6px">この行の演出を後続の行にもコピー…</button></div>`;
    updateInspectorTimes();
    // events
    b.dataset.cue = c.id;
    const it = $('#iText');
    let composing = false;
    const apply = () => { const v = it.value.replace(/\r?\n/g, '/').slice(0, 300); if (v === c.text) return; c.text = v; view.invalidate(); S.dirty = true; renderListSoft(); commitSoon(); };
    it.addEventListener('compositionstart', () => { composing = true; });
    it.addEventListener('compositionend', () => { composing = false; apply(); });
    it.addEventListener('input', (e) => { if (composing || e.isComposing) return; apply(); });
    it.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && !composing && e.keyCode !== 229) { e.preventDefault(); const a = it.selectionStart, z = it.selectionEnd; it.setRangeText('/', a, z, 'end'); apply(); } if (e.key === 'Escape') it.blur(); });
    it.addEventListener('blur', () => { if (composing) { composing = false; apply(); } setTimeout(() => { if (S.inspStale && document.activeElement !== it) renderInspector(); }, 0); });
    const tIn = (id, key) => $(id).addEventListener('change', (e) => {
      const v = U.parseTime(e.target.value); if (!isFinite(v)) return updateInspectorTimes();
      if (key === 'start') { const err = MD.stampStart(P, S.sel, U.clamp(v, 0, dur())); if (err) toast(err, true); }
      else { const err = MD.stampEnd(P, S.sel, U.clamp(v, 0, dur())); if (err) toast(err, true); }
      commit();
    });
    tIn('#iStart', 'start'); tIn('#iEnd', 'end');
    $('#iSnap').onclick = () => { const g = MD.beatGrid(P, LM.audio.analysis, P.qGrid || 1); if (!g) return toast('ビート情報がありません', true); const r = MD.quantize(P, g, { from: S.sel, to: S.sel, strength: 1, ends: !!P.qEnd }); commit(); toast(r.moved ? `${S.sel + 1}行目をビートにそろえました` : 'すでにビート上です'); };
    $('#iStampS').onclick = () => stamp('start'); $('#iRipple').onclick = () => ripple(S.sel); $('#iRealign').onclick = () => vocalAlign({ fromIdx: S.sel }); $('#iStampE').onclick = () => stamp('end');
    $$('[data-n]', b).forEach((bt) => (bt.onclick = () => { const d = +bt.dataset.n; const err = MD.stampStart(P, S.sel, U.clamp(c.start + d, 0, dur())); if (err) toast(err, true); commit(); }));
    $('#iPlay').onclick = () => { S.loop = true; $('#loopCue').classList.add('on'); seek(c.start); play(); };
    $$('[data-pick]', b).forEach((bt) => (bt.onclick = () => openPicker(bt.dataset.pick)));
    $('.mpBox', b).ontoggle = (e) => { S.mpOpen = e.target.open; };
    buildMpPanel(c);
    $('#iCam').onchange = (e) => { c.scene.camera = e.target.value; P.camera = null; commit(); };
    $('#iBgm').onclick = () => openPicker('cbgm');
    if ($('#iImg')) $('#iImg').onchange = (e) => { const v = e.target.value; if (v) c.img = v; else delete c.img; if (v && P.imgMode === 'off') P.imgMode = 'auto'; commit(); };
    $('#iDeco').onchange = (e) => { c.scene.decoration = e.target.value; commit(); };
    $('#iInv').onchange = (e) => { c.scene.invert = e.target.checked; commit(); };
    $('#iPal').onchange = (e) => { if (e.target.value) { c.scene.pal = e.target.value; if (!P.autoColors) toast('行ごとの配色は「配色もおまかせ」がオンのときに使われます。オンにしました'); P.autoColors = true; } else delete c.scene.pal; commit(); };
    const arr = (c.colors || [pal.bg, pal.text, pal.accent, pal.sub]).slice();
    colorEditor($('#iColors'), arr, (a, live) => { c.colors = a.slice(); S.dirty = true; live ? commitSoon() : commit({ keep: true }); });
    $('#iCustom').onchange = (e) => { c.colors = e.target.checked ? arr.slice() : null; commit(); };
    $('#iFont').onchange = async (e) => { c.font = e.target.value || null; if (c.font) await LM.fonts.ensure(c.font, c.text); view.invalidate(); commit(); };
    const trF = (v) => (v === 0 ? TXT('全体と同じ') : (v > 0 ? '+' : '') + (v / 100).toFixed(2) + 'em'), wsF = (v) => (v === 100 ? TXT('全体と同じ') : v + '%');
    const opF = () => { $('#iBgmOpV').textContent = c.bgmOpacity == null ? `${TXT('全体')} ${Math.round((P.bgmOpacity == null ? 1 : P.bgmOpacity) * 100)}%` : Math.round(c.bgmOpacity * 100) + '%'; };
    opF();
    $('#iBgmOp').oninput = (e) => { const v = +e.target.value / 100; eachSel((q) => (q.bgmOpacity = v)); opF(); ovMark(e.target.closest('.row'), true); S.dirty = true; commitSoon(); };
    $('#iBgmOpR').onclick = () => { eachSel((q) => delete q.bgmOpacity); commit(); };
    $('#iBgmBl').onchange = (e) => { const v = e.target.value; eachSel((q) => { if (v) q.bgmBlend = v; else delete q.bgmBlend; }); commit(); };
    $('#iTrackV').textContent = trF(+$('#iTrack').value); $('#iWspV').textContent = wsF(+$('#iWsp').value);
    $('#iTrack').oninput = (e) => { const v = +e.target.value; eachSel((q) => { q.trackAdj = v / 100 || undefined; if (!v) delete q.trackAdj; }); $('#iTrackV').textContent = trF(v); view.invalidate(); S.dirty = true; commitSoon(); };
    $('#iWsp').oninput = (e) => { const v = +e.target.value; eachSel((q) => { if (v === 100) delete q.wordSpaceAdj; else q.wordSpaceAdj = v / 100; }); $('#iWspV').textContent = wsF(v); view.invalidate(); S.dirty = true; commitSoon(); };
    $$('#ibody .kn[data-ik]').forEach((bt) => (bt.onclick = () => { const el = $('#' + bt.dataset.ik); el.value = U.clamp(+el.value + +bt.dataset.d, +el.min, +el.max); el.dispatchEvent(new Event('input')); }));
    $('#iSize').oninput = (e) => { c.textScale = +e.target.value / 100; $('#iSizeV').textContent = e.target.value + '%'; S.dirty = true; commitSoon(); };
    $('#iNoG').onchange = (e) => { c.noGlobalFilters = e.target.checked; commit(); };
    fxChips($('#iFx'), new Set(c.filters || []), (id) => { c.filters = c.filters || []; const i = c.filters.indexOf(id); i >= 0 ? c.filters.splice(i, 1) : c.filters.push(id); commit(); }, c.filterAmt || (c.filterAmt = {}), (id, v) => { c.filterAmt[id] = v; S.dirty = true; commitSoon(); });
    $('#iDup').onclick = async () => {
      const n = await ask('後続の何行にコピーしますか？（固定行は除く）', { input: '3', ok: 'コピー' }); const k = parseInt(n, 10); if (!(k > 0)) return;
      for (let j = S.sel + 1; j <= Math.min(P.cues.length - 1, S.sel + k); j++) { const d = P.cues[j]; if (d.locked) continue; Object.assign(d, { enter: c.enter, hold: c.hold, exit: c.exit, filters: (c.filters || []).slice(), font: c.font, textScale: c.textScale }); d.scene = Object.assign({}, c.scene, { variant: d.scene.variant }); }
      commit(); toast('演出をコピーしました');
    };
    // multi
    if ($('#mPaste')) {
      $('#mPaste').onclick = pasteStyle;
      $('#mReroll').onclick = () => { let n = 0; P.cues.forEach((q, i) => { if (!S.multi.has(q.id) || q.locked) return; const nc = LM.director.rerollOne(P, i, Math.floor(Math.random() * 1e9)); Object.assign(q, { scene: nc.scene, enter: nc.enter, hold: nc.hold, exit: nc.exit, filters: nc.filters }); n++; }); commit(); toast(`${n}行を再抽選しました`); };
      $('#mLock').onclick = () => { const ts = selTargets(); const lock = !ts.every((q) => q.locked); ts.forEach((q) => (q.locked = lock)); commit(); };
      $('#mClear').onclick = () => { S.multi.clear(); renderInspector(); markList(); S.dirty = true; };
    }
    // word timing
    $$('#iWords button').forEach((bt) => {
      bt.onclick = () => {
        const k = +bt.dataset.w, t = Math.max(0, now() - LAT());
        if (t < c.start - 1e-3 || t >= c.end) return toast('再生位置をこの行の中に置いてからクリックしてください（再生しながらでもOK）', true);
        if (!Array.isArray(c.words) || c.words.length !== WR.length) c.words = new Array(WR.length).fill(null);
        c.words[k] = Math.max(c.start, t); commit({ quiet: true }); renderInspector(); S.dirty = true;
      };
      bt.oncontextmenu = (e) => { e.preventDefault(); if (!Array.isArray(c.words)) return; c.words[+bt.dataset.w] = null; if (c.words.every((x) => x == null)) delete c.words; commit({ quiet: true }); renderInspector(); S.dirty = true; };
    });
    $('#iWEven').onclick = () => { if (!WR.length) return; const tot = WR.reduce((a, w) => a + (w.b - w.a), 0); let acc = 0; const span = (c.end - c.start) * 0.86; c.words = WR.map((w) => { const v = c.start + (acc / tot) * span; acc += w.b - w.a; return Math.round(v * 1000) / 1000; }); commit({ quiet: true }); renderInspector(); S.dirty = true; };
    $('#iWBeat').onclick = () => {
      const g = MD.beatGrid(P, LM.audio.analysis, 2); if (!g) return toast('ビート情報がありません', true);
      const inside = g.filter((x) => x >= c.start - 0.02 && x < c.end - 0.1); if (!inside.length) return toast('この行の中に拍がありません', true);
      c.words = WR.map((w, k) => (inside[Math.min(inside.length - 1, Math.floor((k * inside.length) / WR.length))]));
      for (let k = 1; k < c.words.length; k++) if (c.words[k] <= c.words[k - 1]) c.words[k] = null;
      c.words[0] = c.start; commit({ quiet: true }); renderInspector(); S.dirty = true; toast('単語を裏拍までのグリッドに割り付けました');
    };
    $('#iWClear').onclick = () => { delete c.words; commit({ quiet: true }); renderInspector(); S.dirty = true; };
    // transform / durations
    const tfBind = (id, fn, fmt) => { const el = $('#' + id); el.addEventListener('input', () => { fn(+el.value); $('#' + id + 'V').textContent = fmt(+el.value); S.dirty = true; commitSoon(); }); el.addEventListener('dblclick', () => { el.value = el.getAttribute('min') === '30' ? 100 : 0; el.dispatchEvent(new Event('input')); }); };
    const T = () => (c.tf = c.tf || {});
    const pct = (v) => (v > 0 ? '+' : '') + v + '%', secs = (v) => (v ? (v / 100).toFixed(2) + 's' : '自動');
    tfBind('iTx', (v) => (T().x = v / 100), pct); tfBind('iTy', (v) => (T().y = v / 100), pct);
    tfBind('iTs', (v) => (T().s = v / 100), (v) => v + '%'); tfBind('iTr', (v) => (T().r = (v * Math.PI) / 180), (v) => v + '°');
    tfBind('iEd', (v) => (v ? (c.ed = v / 100) : delete c.ed), secs); tfBind('iXd', (v) => (v ? (c.xd = v / 100) : delete c.xd), secs);
    $('#iTfReset').onclick = () => { delete c.tf; delete c.ed; delete c.xd; commit(); };
    $('#iCopy').onclick = copyStyle; $('#iPasteS').onclick = pasteStyle;
    drawLayoutThumb($('#iLayThumb'), c, sc.layout);
  }
  function updateInspectorTimes() {
    const c = selCue(); if (!c || !$('#iStart')) return;
    if (document.activeElement !== $('#iStart')) $('#iStart').value = U.fmtTime(c.start);
    if (document.activeElement !== $('#iEnd')) $('#iEnd').value = U.fmtTime(c.end);
    $('#iDur').textContent = `長さ ${(c.end - c.start).toFixed(2)}秒`;
  }
  function stamp(which) {
    const c = selCue(); if (!c) return;
    const t = which === 'start' ? stampTime() : Math.max(0, now() - LAT());
    const err = which === 'start' ? MD.stampStart(P, S.sel, t) : MD.stampEnd(P, S.sel, t);
    if (err) toast(err, true); else toast(`${S.sel + 1}行目の${which === 'start' ? '開始' : '終了'}を ${U.fmtTime(t)} にしました`);
    commit();
  }
  $('#iLock').onclick = () => { const c = selCue(); if (!c) return; c.locked = !c.locked; commit(); };
  $('#iReroll').onclick = () => reroll();
  function reroll() {
    const c = selCue(); if (!c) return;
    if (c.locked) return toast('固定中の行です。🔒を外すと再抽選できます', true);
    const nc = LM.director.rerollOne(P, S.sel, Math.floor(Math.random() * 1e9));
    Object.assign(c, { scene: nc.scene, enter: nc.enter, hold: nc.hold, exit: nc.exit, filters: nc.filters });
    commit();
  }
  function thumbProject(c, over) {
    const q = Object.assign(JSON.parse(JSON.stringify(c)), { id: 'thumb', start: 0, end: 3 }, over || {});
    q.scene = Object.assign({}, c.scene, (over && over.scene) || {});
    const pr = Object.assign({}, P, { cues: [q], showCredits: false, aspect: '16:9', duration: 4 });
    return pr;
  }
  function drawLayoutThumb(cv, c, lay) {
    if (!cv) return;
    thumbR.setProject(thumbProject(c, { enter: 'none', hold: 'none', exit: 'cut', scene: { layout: lay } }));
    thumbR.render(1.5, {});
    const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(thumbR.out, 0, 0, cv.width, cv.height);
  }

  /* ---------------- picker modal ---------------- */
  const pick = { kind: null, cat: 'all', hover: null, raf: 0 };
  const isBg = () => pick.kind === 'bgm' || pick.kind === 'cbgm' || pick.kind === 'gbgm';
  const isTG = () => pick.kind === 'trans' || pick.kind === 'gfx';
  const DUMMY = () => ({ en: 'Beyond the *dawn*', es: 'Más allá del *alba*', it: 'Oltre l\'*alba*', ko: '*새벽* 너머로' }[LM.i18n && LM.i18n.lang] || '夜明けの*向こう*へ');
  const dummyCue = () => MD.normalizeCue({ id: 'dummy', text: DUMMY(), start: 0, end: 3, enter: 'fade', hold: 'none', exit: 'fadeOut', scene: { layout: 'center' } });
  const MOTION_K = ['enter', 'hold', 'emph', 'exit'];
  function openPicker(kind) {
    const c = selCue(); if (!c && kind !== 'bgm' && kind !== 'gbgm' && kind !== 'itrans') return;
    pick.kind = kind; pick.cat = 'all'; pick.samples = null;
    pick.tags = pick.tags || new Set(); $('#pickTools').hidden = !MOTION_K.includes(kind);
    $('#pickTitle').textContent = { emph: '強調（アクセント）', enter: '登場モーション', hold: '保持中の動き', exit: '退場モーション', layout: 'レイアウト', bgm: '背景モーション（全体・複数選択で重ねがけ）', itrans: '背景画像の切り替えトランジション', gbgm: 'インスト区間の背景（複数選ぶと小節ごとに切り替え）', cbgm: 'この行の背景モーション', trans: 'トランジション（前の行からこの行へ切り替わる瞬間）', gfx: 'アクセントグラフィック（最大2つ）' }[kind];
    $('#pickAllWrap').hidden = isBg() || pick.kind === 'gfx' || pick.kind === 'itrans';
    $('#pickSearch').value = '';
    $('#pickAll').checked = false;
    $('#pickModal').classList.add('open');
    buildPicker();
  }
  function pickLib() {
    if (pick.kind === 'itrans') return Object.assign({ auto: { n: 'おまかせ（テーマに合わせて毎回変える）', c: '基本' } }, LM.Renderer.imgTrans);
    if (pick.kind === 'trans') return Object.assign({ none: { n: 'なし（そのまま切り替え）', c: '基本' } }, LM.trans.lib);
    if (pick.kind === 'gfx') return Object.assign({ __none: { n: 'なし', c: '基本' } }, LM.gfx.lib);
    if (pick.kind === 'gbgm') return Object.assign({ __none: { n: 'おまかせ（テーマに合わせる）', c: '基本' } }, LM.bgm.lib);
    if (isBg()) return Object.assign(pick.kind === 'cbgm' ? { __inherit: { n: '全体設定に従う', c: '基本' }, __none: { n: 'なし', c: '基本' } } : { __none: { n: 'なし', c: '基本' } }, LM.bgm.lib);
    return pick.kind === 'layout' ? LM.layout.lib : M[pick.kind];
  }
  function curVal(c) {
    if (pick.kind === 'itrans') return P.imgTrans || 'auto';
    if (pick.kind === 'trans') return c.trans || 'none';
    if (pick.kind === 'gfx') return (c.gfx && c.gfx.length) ? c.gfx : ['__none'];
    if (pick.kind === 'bgm') return P.autoBgm ? [] : (P.bgm || []);
    if (pick.kind === 'gbgm') { const b = view.gapCfg(S.gapTarget ? gapByKey(S.gapTarget) : null).bgm || []; return b.length ? b : ['__none']; }
    if (pick.kind === 'cbgm') return Array.isArray(c.bgm) ? (c.bgm.length ? c.bgm : ['__none']) : ['__inherit'];
    const tr = R.tracksOf(c); return pick.kind === 'layout' ? c.scene.layout : tr[pick.kind];
  }
  function buildPicker() {
    const c = selCue() || dummyCue(), lib = pickLib();
    const cats = ['all', ...new Set(Object.values(lib).map((m) => m.c))];
    $('#pickCats').innerHTML = cats.map((k) => `<button class="chip ${pick.cat === k ? 'on' : ''}" data-c="${k}">${k === 'all' ? 'すべて' : esc(k)}</button>`).join('');
    $$('#pickCats .chip').forEach((b) => (b.onclick = () => { pick.cat = b.dataset.c; buildPicker(); }));
    const q = $('#pickSearch').value.trim();
    const cur = curVal(c);
    const isM = MOTION_K.includes(pick.kind), mt = (id) => (isM && LM.MS ? LM.MS.meta(pick.kind, id) : null);
    let items = Object.entries(lib).filter(([id, m]) => (pick.cat === 'all' || m.c === pick.cat) && (!q || T(m.n).includes(q) || m.n.includes(q) || id.toLowerCase().includes(q.toLowerCase())));
    if (isM) {
      const allTags = LM.MS.STYLE; $('#pickTags').innerHTML = allTags.map((tg) => `<button class="chip sm ${pick.tags.has(tg) ? 'on' : ''}" data-t="${tg}">${esc(T(LM.MS.STYLE_JA[tg]))}</button>`).join('');
      $$('#pickTags .chip').forEach((b2) => (b2.onclick = () => { pick.tags.has(b2.dataset.t) ? pick.tags.delete(b2.dataset.t) : pick.tags.add(b2.dataset.t); buildPicker(); }));
      if (pick.tags.size) items = items.filter(([id]) => { const x = mt(id); return x && [...pick.tags].every((tg) => x.tags.includes(tg)); });
      const so = $('#pickSort').value; if (so) items.sort((a, b) => { const A2 = mt(a[0]) || {}, B2 = mt(b[0]) || {}; return so === 'calm' ? (A2.energy || 0) - (B2.energy || 0) : so === 'read' ? (B2.readability || 0) - (A2.readability || 0) : (B2.energy || 0) - (A2.energy || 0); });
    }
    const mline = (id) => { const x = mt(id); if (!x) return ''; return `<em class="mmeta">${x.tags.slice(0, 3).map((tg) => esc(T(LM.MS.STYLE_JA[tg]))).join(' · ')}<br>${esc(T('動き'))} ${x.energy} · ${esc(T('読みやすさ'))} ${x.readability} · ${(x.recommendedDuration[0] / 1000).toFixed(1)}–${(x.recommendedDuration[1] / 1000).toFixed(1)}s</em>`; };
    $('#pickGrid').innerHTML = items.map(([id, m]) => `<button class="card ${(Array.isArray(cur) ? cur.includes(id) : id === cur) ? 'on' : ''}" data-id="${id}"><canvas width="320" height="180"></canvas><div><span>${esc(m.n)}</span><small>${esc(m.c)}</small>${mline(id)}</div></button>`).join('') || '<div class="empty">該当なし</div>';
    $('#pickHint').textContent = pick.kind === 'layout' ? '現在の歌詞で各レイアウトを表示しています' : pick.kind === 'bgm' ? 'クリックで追加／解除（最大3つまで重ねられます）。選ぶと「おまかせ背景」はオフになります' : pick.kind === 'gbgm' ? 'クリックで追加／解除（最大6つ）。歌詞のない区間で小節ごとに順番に切り替わります' : 'カードにマウスを乗せると動きを確認できます';
    const cards = $$('#pickGrid .card');
    let k = 0;
    const drawSome = () => { const end = Math.min(cards.length, k + 6); for (; k < end; k++) drawCard(cards[k], cards[k].dataset.id, null); if (k < cards.length && $('#pickModal').classList.contains('open')) requestAnimationFrame(drawSome); };
    drawSome();
    cards.forEach((cd) => {
      cd.onmouseenter = () => { pick.hover = cd; pick.t0 = performance.now(); animCard(); };
      cd.onmouseleave = () => { if (pick.hover === cd) { pick.hover = null; drawCard(cd, cd.dataset.id, null); } };
      cd.onclick = () => applyPick(cd.dataset.id);
    });
  }
  function cardProject(id) {
    const c = selCue() || dummyCue();
    if (pick.kind === 'trans') {
      const pr = thumbProject(c, { enter: 'none', hold: 'none', exit: 'cut', filters: [], gfx: [], trans: id, start: 1.5, end: 3.2 });
      const q = pr.cues[0]; q.start = 1.5; q.end = 3.2; q.trans = id;
      pr.cues.unshift(MD.normalizeCue({ id: 'prevT', text: T('まえのフレーズ'), start: 0, end: 1.5, enter: 'none', hold: 'none', exit: 'cut', scene: { layout: 'center' } }));
      pr.bpm = 120; pr.duration = 4; pr.transOff = false; pr.autoColors = false; pr.cues[0].colors = null;
      return pr;
    }
    if (pick.kind === 'gfx') { const pr = thumbProject(c, { enter: 'fade', hold: 'none', exit: 'cut', filters: [], gfx: id === '__none' ? [] : [id], scene: { layout: 'center' } }); return pr; }
    if (isBg()) { const pr = thumbProject(c, { enter: 'none', hold: 'none', exit: 'cut', filters: [], scene: { layout: 'subtitle', decoration: 'none' } }); pr.filters = []; pr.pattern = 'none'; pr.cues[0].bgm = id === '__inherit' ? undefined : id === '__none' ? [] : [id]; if (id === '__inherit') delete pr.cues[0].bgm; pr.cues[0].end = 60; pr.duration = 60; return pr; }
    const o = pick.kind === 'layout' ? { scene: { layout: id }, enter: 'none', hold: 'none', exit: 'cut' } : { [pick.kind]: id };
    if (pick.kind === 'enter') Object.assign(o, { hold: 'none', exit: 'cut' });
    if (pick.kind === 'hold') Object.assign(o, { enter: 'none', exit: 'cut' });
    if (pick.kind === 'exit') Object.assign(o, { enter: 'none', hold: 'none' });
    if (pick.kind === 'emph') Object.assign(o, { enter: 'none', hold: 'none', exit: 'cut', mp: Object.assign({}, c.mp, { m: Object.assign({ trig: 'beat', tgt: 'all', i: 60 }, c.mp && c.mp.m, { tgt: 'all' }) }) });
    const smp = $('#pickSample') && $('#pickSample').value; if (smp && MOTION_K.includes(pick.kind)) o.text = smp;
    const pr = thumbProject(c, o); if (pick.kind === 'emph') pr.bpm = 120;
    if (o.enter === 'morphFrom' || (pick.kind === 'enter' && id === 'morphFrom')) { pr.cues.unshift(MD.normalizeCue({ id: 'prevM', text: smp ? 'TYPE' : T('まえのフレーズ'), start: -1, end: 0, enter: 'none', hold: 'none', exit: 'cut', scene: { layout: 'center' } })); }
    return pr;
  }
  // sample pictures for the image-transition picker (user's own first two, else generated)
  function sampleCanvases() {
    const W = 320, H = 180, mkc = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const own = (P.images || []).map((x) => { const v = S.images[imgKey(x.id)]; return v && v.isVideo ? v.thumb : v; }).filter(Boolean);
    return [0, 1].map((k) => { const c = mkc(), x = c.getContext('2d'); const im = own[k % Math.max(1, own.length)];
      if (im) { const s = Math.max(W / im.width, H / im.height); x.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s); }
      else { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, k ? '#ff6a3d' : '#1b2a6b'); g.addColorStop(1, k ? '#ffd23f' : '#4fd1c5'); x.fillStyle = g; x.fillRect(0, 0, W, H); x.fillStyle = 'rgba(255,255,255,.85)'; x.font = '900 64px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(k ? 'B' : 'A', W / 2, H / 2); }
      return c; });
  }
  function drawCard(cd, id, t) {
    if (pick.kind === 'itrans') {
      const cv = $('canvas', cd), x = cv.getContext('2d'); const [A, B] = pick.samples || (pick.samples = sampleCanvases());
      const tid = id === 'auto' ? R.imgPool(P.theme)[Math.floor((t || 0) / 1.6) % R.imgPool(P.theme).length] : id;
      const u = t == null ? 0.5 : U.clamp(((t % 1.6) - 0.3) / 1.0, 0, 1);
      thumbR.setSize(320, 180); x.save(); x.clearRect(0, 0, 320, 180);
      try { R.imgTrans[tid].f(x, A, B, u, { W: 320, H: 180, S: 320 / 1920, minD: 180, pal: R.palOf(P, selCue()), seed: 5, r: thumbR }); } catch (e) { console.warn(e); }
      x.restore(); return;
    }
    const pr = cardProject(id);
    thumbR.setProject(pr);
    const q = pr.cues[0];
    if (t == null && pick.kind === 'trans') t = 1.47;
    if (t == null && pick.kind === 'gfx') t = 0.45;
    if (t == null) { t = pick.kind === 'enter' ? 0.32 : pick.kind === 'exit' ? 2.75 : 1.5; if (pick.kind === 'enter') { const ph = R.phases(pr, pr.cues, 0, 8); t = Math.min(1.2, ph.ed * 0.4); } if (pick.kind === 'exit') { const ph = R.phases(pr, pr.cues, 0, 8); t = ph.exitStart + ph.xd * 0.45; } }
    try { thumbR.render(t, {}); } catch (e) { console.warn(e); }
    const cv = $('canvas', cd), x = cv.getContext('2d'); x.clearRect(0, 0, 320, 180); x.drawImage(thumbR.out, 0, 0, 320, 180);
  }
  function animCard() {
    cancelAnimationFrame(pick.raf);
    const cd = pick.hover; if (!cd || !$('#pickModal').classList.contains('open')) return;
    const el = (performance.now() - pick.t0) / 1000;
    let t;
    if (pick.kind === 'itrans') t = el;
    else if (pick.kind === 'trans') t = 1.05 + (el % 1.1) * 0.8;
    else if (pick.kind === 'gfx') t = el % 2.2;
    else if (isBg()) t = 1.5 + el;
    else if (pick.kind === 'enter') t = el % 2.2;
    else if (pick.kind === 'exit') t = 1.6 + (el % 1.9);
    else if (pick.kind === 'emph') t = 0.45 + (el % 2);
    else t = 0.2 + (el % 2.6);
    drawCard(cd, cd.dataset.id, pick.kind === 'layout' ? null : t);
    if (pick.kind !== 'layout') pick.raf = requestAnimationFrame(animCard);
  }
  function applyPick(id) {
    if (pick.kind === 'itrans') { P.imgTrans = id; $('#pickModal').classList.remove('open'); commit(); toast(id === 'auto' ? '切り替えトランジションをおまかせにしました' : `切り替えを「${R.imgTrans[id].n}」にしました`); return; }
    if (pick.kind === 'trans') {
      const all = $('#pickAll').checked; const targets = all ? P.cues.filter((c, i) => i > 0 && !c.locked) : selTargets();
      targets.forEach((c) => (c.trans = id)); P.transOff = false;
      $('#pickModal').classList.remove('open'); commit(); toast(all ? `${targets.length}行に適用しました` : 'トランジションを変更しました'); return;
    }
    if (pick.kind === 'gfx') {
      const c = selCue(); let list = (c.gfx || []).slice();
      if (id === '__none') list = []; else if (list.includes(id)) list = list.filter((x) => x !== id); else { list.push(id); if (list.length > 2) list.shift(); }
      selTargets().forEach((q) => (q.gfx = list.slice())); commit({ quiet: true }); renderInspector(); S.dirty = true;
      $$('#pickGrid .card').forEach((cd) => cd.classList.toggle('on', list.length ? list.includes(cd.dataset.id) : cd.dataset.id === '__none'));
      return;
    }
    if (pick.kind === 'bgm') {
      let list = P.autoBgm ? [] : (P.bgm || []).slice();
      if (id === '__none') list = [];
      else if (list.includes(id)) list = list.filter((x) => x !== id);
      else { list.push(id); if (list.length > 3) list.shift(); }
      P.autoBgm = false; P.bgm = list; commit({ quiet: true }); syncBgmUI(); S.dirty = true;
      $$('#pickGrid .card').forEach((cd) => cd.classList.toggle('on', list.includes(cd.dataset.id)));
      return;
    }
    if (pick.kind === 'gbgm') {
      const gcf = view.gapCfg(S.gapTarget ? gapByKey(S.gapTarget) : null);
      let list = (gcf.bgm || []).slice();
      if (id === '__none') list = []; else if (list.includes(id)) list = list.filter((x) => x !== id); else { list.push(id); if (list.length > 6) list.shift(); }
      gapSet('bgm', S.gapTarget && !list.length ? undefined : list); if (gcf.fill === 'off') gapSet('fill', 'auto'); commit({ quiet: true }); syncBgmUI(); S.dirty = true;
      $$('#pickGrid .card').forEach((cd) => cd.classList.toggle('on', list.length ? list.includes(cd.dataset.id) : cd.dataset.id === '__none'));
      return;
    }
    if (pick.kind === 'cbgm') {
      selTargets().forEach((c) => { if (id === '__inherit') delete c.bgm; else c.bgm = id === '__none' ? [] : [id]; });
      $('#pickModal').classList.remove('open'); commit(); return;
    }
    const all = $('#pickAll').checked;
    const targets = all ? P.cues.filter((c) => !c.locked) : selTargets();
    targets.forEach((c) => { if (pick.kind === 'layout') c.scene.layout = id; else { const tr = R.tracksOf(c); Object.assign(c, tr); c[pick.kind] = id; delete c.motion; } });
    $('#pickModal').classList.remove('open'); commit();
    toast(all || targets.length > 1 ? `${targets.length}行に適用しました` : '変更しました');
  }
  $('#pickSearch').addEventListener('input', U.debounce(buildPicker, 150));
  $('#pickSample').onchange = () => buildPicker(); $('#pickSort').onchange = () => buildPicker();

  /* ---------------- direct manipulation on the preview ---------------- */
  (() => {
    const fr = $('#frame'); let dg = null;
    const activeIdx = () => { const t = now(); const c = selCue(); if (c && t >= c.start - 0.05 && t < c.end + 0.05) return S.sel; return P.cues.findIndex((q) => t >= q.start && t < q.end); };
    // picture framing mode: drag = move, Shift+drag = rotate, wheel = zoom
    let ig = null;
    const imgEnt = () => (S.imgEditOn && S.imgAdj ? (P.images || []).find((y) => y.id === S.imgAdj) : null);
    fr.addEventListener('pointerdown', (e) => {
      const x = imgEnt(); if (!x || e.button !== 0 || e.target.closest('.prompter')) return;
      e.stopImmediatePropagation(); const r = fr.getBoundingClientRect(); fr.setPointerCapture(e.pointerId);
      ig = { x, x0: e.clientX, y0: e.clientY, w: r.width, h: r.height, ox: x.ox || 0, oy: x.oy || 0, rot: x.rot || 0 };
    }, true);
    fr.addEventListener('pointermove', (e) => {
      if (!ig) return; e.stopImmediatePropagation();
      const dx = (e.clientX - ig.x0) / ig.w, dy = (e.clientY - ig.y0) / ig.h;
      if (e.shiftKey) { let r = Math.round(ig.rot + dx * 180); if (Math.abs(r) < 2) r = 0; ig.x.rot = r || undefined; }
      else { let ox = U.clamp(ig.ox + dx, -1, 1), oy = U.clamp(ig.oy + dy, -1, 1); if (Math.abs(ox) < 0.01) ox = 0; if (Math.abs(oy) < 0.01) oy = 0; ig.x.ox = ox ? Math.round(ox * 1000) / 1000 : undefined; ig.x.oy = oy ? Math.round(oy * 1000) / 1000 : undefined; }
      S.dirty = true;
    }, true);
    const igUp = (e) => { if (!ig) return; e.stopImmediatePropagation(); ig = null; commit({ quiet: true }); renderImgAdj(); };
    fr.addEventListener('pointerup', igUp, true); fr.addEventListener('pointercancel', igUp, true);
    fr.addEventListener('wheel', (e) => { const x = imgEnt(); if (!x) return; e.preventDefault(); const z = U.clamp((x.zoom || 1) * (e.deltaY < 0 ? 1.05 : 1 / 1.05), 0.2, 4); x.zoom = Math.abs(z - 1) < 0.01 ? undefined : Math.round(z * 1000) / 1000; S.dirty = true; commitSoon(); clearTimeout(ig && ig.tm); setTimeout(renderImgAdj, 250); }, { passive: false });
    fr.addEventListener('pointerdown', (e) => {
      if (S.tap || e.button !== 0 || e.target.closest('.prompter')) return;
      const i = activeIdx(); if (i < 0) return;
      if (i !== S.sel) { S.multi.clear(); selectCue(i, false); }
      const c = P.cues[i]; if (c.locked) return toast('固定中の行です（🔒を外すと動かせます）', true);
      const r = fr.getBoundingClientRect(); fr.setPointerCapture(e.pointerId);
      dg = { c, x0: e.clientX, y0: e.clientY, w: r.width, h: r.height, tx: (c.tf && c.tf.x) || 0, ty: (c.tf && c.tf.y) || 0, moved: false };
      fr.classList.add('dragtf');
    });
    fr.addEventListener('pointermove', (e) => {
      if (!dg) return;
      let dx = (e.clientX - dg.x0) / dg.w, dy = (e.clientY - dg.y0) / dg.h;
      if (!dg.moved && Math.hypot(e.clientX - dg.x0, e.clientY - dg.y0) < 3) return;
      dg.moved = true;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      let x = U.clamp(dg.tx + dx, -0.5, 0.5), y = U.clamp(dg.ty + dy, -0.5, 0.5);
      if (Math.abs(x) < 0.012) x = 0; if (Math.abs(y) < 0.012) y = 0;
      dg.c.tf = Object.assign({}, dg.c.tf, { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
      $('#tfHint').textContent = `横 ${(x * 100).toFixed(1)}% ／ 縦 ${(y * 100).toFixed(1)}%（Shift：軸固定）`;
      S.dirty = true;
    });
    const up = () => { if (!dg) return; fr.classList.remove('dragtf'); $('#tfHint').textContent = 'ドラッグで文字位置を移動（Shift：水平/垂直固定・ダブルクリックで中央へ）'; if (dg.moved) { commit({ quiet: true }); renderInspector(); } dg = null; };
    fr.addEventListener('pointerup', up); fr.addEventListener('pointercancel', up);
    fr.addEventListener('dblclick', (e) => { if (S.tap || e.target.closest('.prompter')) return; const c = selCue(); if (c && c.tf) { delete c.tf.x; delete c.tf.y; commit(); } });
  })();

  /* ---------------- looks (saved design presets) ---------------- */
  const LOOK_KEYS = ['theme', 'palette', 'colors', 'autoColors', 'series', 'font', 'fontWeight', 'textScale', 'tracking', 'intensity', 'speed', 'tempoSync', 'filters', 'filterAmt', 'filterIntensity', 'autoFilters', 'pattern', 'camera', 'keyColor', 'autoBgm', 'bgm', 'bgmAmt', 'bgmSpeed', 'bgmDim', 'autoTrans', 'autoGfx', 'transOff', 'ruby', 'drive', 'feel', 'variety', 'latinTrack', 'wordSpace', 'wakanGap', 'yakuAmt', 'wakan', 'yakumono', 'bgmOpacity', 'bgmBlend', 'gapFill', 'gapBgm', 'gapVisual', 'gapVisStyle', 'gapLabel', 'gapCountdown', 'gapOpacity', 'gapBlend', 'gapAmt', 'gapSpeed', 'gapCam', 'gapEvery', 'gapFlash', 'gapVisAmt', 'gapProgress'];
  // looks come from localStorage or imported files: validate everything through the project normalizer
  function cleanLook(lk) {
    if (!lk || typeof lk !== 'object' || !lk.v || typeof lk.v !== 'object' || Array.isArray(lk.v)) return null;
    const n = MD.normalize(Object.assign({}, lk.v, { cues: [] })), v = {};
    LOOK_KEYS.forEach((k) => { if (k in lk.v && k !== 'bg') v[k] = n[k]; });
    if (lk.v.bg) { v.bg = Object.assign({}, n.bg); delete v.bg.image; }
    return { n: String(lk.n || 'Look').slice(0, 40), v };
  }
  const looks = () => { const L = U.store.get('lms.looks', []); return Array.isArray(L) ? L.slice(0, 200).map(cleanLook).filter(Boolean) : []; };
  function buildLooks() {
    const L = looks();
    $('#looks').innerHTML = L.length ? L.map((lk, i) => {
      const c = lk.v.colors || (D.palById[lk.v.palette] || D.palettes[0]).c; const f = lk.v.font && D.fontById[lk.v.font];
      const hx = (x) => (U.isHex(x) ? x : '#888888');
      return `<button class="lk" data-i="${i}" title="クリックで適用"><div class="sw" style="background:${hx(c[0])};color:${hx(c[1])};${f ? `font-family:'${esc(f.fam)}',sans-serif` : ''}">Aa<span style="color:${hx(c[2])};margin-left:4px">あ</span></div><small>${esc(lk.n)}</small><span class="x" data-del="${i}" title="削除">×</span></button>`;
    }).join('') : '<p class="hint" style="grid-column:1/-1;margin:0">まだ保存されたルックはありません。</p>';
    $$('#looks .lk').forEach((b) => (b.onclick = async (e) => {
      const L2 = looks();
      if (e.target.dataset.del != null) { if (!(await ask(`ルック「${L2[+e.target.dataset.del].n}」を削除しますか？`, { ok: '削除' }))) return; L2.splice(+e.target.dataset.del, 1); U.store.set('lms.looks', L2); buildLooks(); return; }
      const lk = L2[+b.dataset.i]; if (!lk) return;
      LOOK_KEYS.forEach((k) => { if (k in lk.v) P[k] = JSON.parse(JSON.stringify(lk.v[k])); });
      if (lk.v.bg) P.bg = Object.assign({}, P.bg, lk.v.bg, { image: P.bg && P.bg.image });
      if (!P.autoColors) P.cues.forEach((c) => c.scene && delete c.scene.pal);
      if (P.cues.length) { P.cues = LM.director.generate(P, { seed: P.seed }); pushPlan(); }
      await LM.fonts.ensureProject(P); view.invalidate(); commit(); toast(`ルック「${lk.n}」を適用しました`);
    }));
  }
  $('#lookSave').onclick = async () => {
    const n = await ask('ルックの名前', { input: `${(D.themeById[P.theme] || {}).n || 'ルック'} ${looks().length + 1}`, ok: '保存' }); if (!n) return;
    const v = {}; LOOK_KEYS.forEach((k) => { if (P[k] !== undefined) v[k] = JSON.parse(JSON.stringify(P[k])); });
    v.bg = Object.assign({}, P.bg); delete v.bg.image;
    const L = looks(); L.push({ n: String(n).slice(0, 40), v }); U.store.set('lms.looks', L); buildLooks(); toast('ルックを保存しました');
  };
  $('#lookExport').onclick = () => { const L = looks(); if (!L.length) return toast('保存されたルックがありません', true); saveFile(new Blob([JSON.stringify({ lmsLooks: 1, looks: L }, null, 1)], { type: 'application/json' }), 'lyric-motion-looks.json'); };
  $('#lookImport').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const j = JSON.parse(await f.text()); const add = (Array.isArray(j && j.looks) ? j.looks : []).slice(0, 200).map(cleanLook).filter(Boolean); if (!add.length) throw new Error('ルックが含まれていません'); U.store.set('lms.looks', looks().concat(add)); buildLooks(); toast(`${add.length}件のルックを読み込みました`); } catch (er) { toast('読み込めませんでした：' + er.message, true); }
  };

  /* ---------------- song structure ---------------- */
  function renderSections() {
    const secs = P.sections || [];
    $('#secInfo').textContent = secs.length ? `${secs.length}区間${secs.some((x) => x.est) ? '（推定を含む）' : ''}` : '';
    $('#secList').innerHTML = secs.map((sc, k) => `<div class="si"><i style="background:${MD.SEC[sc.type].col}"></i><span class="t" data-t="${k}" title="クリックで移動">${U.fmtTime(sc.t)}</span><select data-k="${k}">${MD.SEC_ORDER.map((id) => `<option value="${id}" ${id === sc.type ? 'selected' : ''}>${MD.SEC[id].n}${sc.est && id === sc.type ? '（推定）' : ''}</option>`).join('')}</select><button class="btn sm ic" data-x="${k}" title="削除">×</button></div>`).join('');
    $$('#secList select').forEach((el) => (el.onchange = () => { const sc = P.sections[+el.dataset.k]; sc.type = el.value; sc.est = false; commit({ quiet: true }); renderSections(); S.dirty = true; }));
    $$('#secList [data-t]').forEach((el) => (el.onclick = () => seek(P.sections[+el.dataset.t].t)));
    $$('#secList [data-x]').forEach((el) => (el.onclick = () => { P.sections.splice(+el.dataset.x, 1); commit({ quiet: true }); renderSections(); S.dirty = true; }));
  }
  function addSection(t) {
    P.sections = P.sections || [];
    t = U.clamp(t, 0, dur());
    if (P.sections.some((x) => Math.abs(x.t - t) < 0.5)) return toast('近くにすでにマーカーがあります', true);
    const prev = MD.sectionAt(P, t);
    const o = MD.SEC_ORDER; const type = prev ? o[(o.indexOf(prev.type) + 1) % o.length] : t < 1 ? 'intro' : 'A';
    P.sections.push({ t: Math.round(t * 1000) / 1000, type }); P.sections.sort((a, b) => a.t - b.t);
    commit({ quiet: true }); renderSections(); S.dirty = true; toast(`${U.fmtTime(t)} に「${MD.SEC[type].n}」を追加（クリックで種類を切替）`);
  }
  $('#secAdd').onclick = () => addSection(now());
  $('#secClear').onclick = () => { P.sections = []; commit({ quiet: true }); renderSections(); S.dirty = true; };
  $('#secEst').onclick = async () => {
    const an = LM.audio.analysis; if (!an) return toast('音源を読み込むと推定できます', true);
    if ((P.sections || []).some((x) => !x.est) && !(await ask('手動で付けたマーカーを推定結果で置き換えます', { ok: '置き換える' }))) return;
    const r = MD.estimateSections(P, an); if (!r || !r.length) return toast('推定できませんでした', true);
    P.sections = r; commit({ quiet: true }); renderSections(); S.dirty = true;
    toast(`${r.length}区間を推定しました。「演出を生成」でセクションごとに演出を切り替えます`);
  };
  $('#rubyOn').onchange = (e) => { P.ruby = e.target.checked; view.invalidate(); commit(); };

  /* ---------------- title card ---------------- */
  $('#addTitle').onclick = () => {
    const first = P.cues.find((c) => c.kind !== 'title'); const room = first ? first.start : dur();
    if (room < 1.4) return toast('曲頭に1.4秒以上の空きがありません。「ここから」や一括シフトで歌詞を後ろにずらしてください', true);
    P.cues = P.cues.filter((c) => c.kind !== 'title');
    const end = Math.max(1.2, Math.min(room - 0.15, 6)), start = Math.min(0.25, end * 0.1);
    const txt = (P.title ? `*${P.title.replace(/[*/]/g, '')}*` : '*TITLE*') + (P.artist ? '/' + P.artist.replace(/[*/]/g, '') : '');
    const en = ['focusPull', 'blurIn', 'fade'].find((k) => M.enter[k]), ex = ['blurOut', 'fadeOut'].find((k) => M.exit[k]);
    const nc = MD.normalizeCue({ text: txt, start, end, kind: 'title', enter: en, hold: M.hold.drift ? 'drift' : 'none', exit: ex, textScale: 1.1, scene: { layout: LM.layout.lib.poster ? 'poster' : 'center', camera: 'push' } });
    P.cues.unshift(nc); S.sel = 0; S.multi.clear(); commit(); toast('タイトルカードを追加しました（「素材」タブのタイトル／アーティストを使います）');
  };

  /* ---------------- export ---------------- */
  const EX = { fmt: 'mp4', bg: 'normal', range: 'all', fps: 30, q: 'high', mb: 0, batch: new Set(), running: null };
  const FPSX = { '23.976': 24000 / 1001, '29.97': 30000 / 1001, '59.94': 60000 / 1001 };
  function openExport() {
    pause();
    const F = LM.exporter.FORMATS, f0 = F[EX.fmt];
    $('#exFmt').innerHTML = Object.entries(F).filter(([k]) => !(k === 'mov' && U.inArtifact())).map(([k, f]) => `<button data-f="${k}" class="${EX.fmt === k ? 'on' : ''}"><b>${esc(f.n)}</b><small>${esc(f.desc)}</small></button>`).join('');
    $$('#exFmt button').forEach((b) => (b.onclick = () => { EX.fmt = b.dataset.f; if (F[EX.fmt].alpha && EX.bg === 'normal') EX.bg = 'alpha'; if (EX.fmt === 'gif' && EX.fps > 30) EX.fps = 15; openExport(); }));
    const [W, H] = D.aspects[P.aspect];
    const res = [[0.5, '軽量'], [2 / 3, 'HD'], [1, 'フルHD'], [4 / 3, 'WQHD'], [2, '4K']];
    const cur = $('#exRes').value || '1';
    $('#exRes').innerHTML = res.map(([k, n]) => `<option value="${k}" ${String(k) === cur ? 'selected' : ''}>${n}（${Math.round((W * k) / 2) * 2}×${Math.round((H * k) / 2) * 2}）</option>`).join('');
    if (EX.fmt === 'gif' && !$('#exRes').dataset.gif) { $('#exRes').value = '0.5'; $('#exRes').dataset.gif = 1; }
    seg('#exBg', EX.bg, (v) => { EX.bg = v; openExport(); });
    seg('#exRange', EX.range, (v) => { EX.range = v; openExport(); });
    seg('#exFps', String(EX.fps), (v) => (EX.fps = +v));
    seg('#exMb', String(EX.mb), (v) => (EX.mb = +v));
    $('#exBatch').innerHTML = Object.keys(D.aspects).filter((a) => a !== P.aspect).map((a) => `<button class="chip ${EX.batch.has(a) ? 'on' : ''}" data-a="${a}">${a} <small style="opacity:.6">${D.aspectHint[a]}</small></button>`).join('');
    $$('#exBatch .chip').forEach((b) => (b.onclick = () => { EX.batch.has(b.dataset.a) ? EX.batch.delete(b.dataset.a) : EX.batch.add(b.dataset.a); b.classList.toggle('on'); }));
    $('#exStreamRow').hidden = U.inArtifact() || !window.showSaveFilePicker || !!(f0.seq || f0.gif);
    seg('#exQ', EX.q, (v) => (EX.q = v));
    $('#exKeyRow').hidden = EX.bg !== 'custom';
    $('#exRangeRow').hidden = EX.range !== 'custom';
    const f = F[EX.fmt];
    const hints = {
      normal: '背景・模様まで含めた完成映像です。',
      alpha: f.alpha || f.seq || f.gif ? '背景を透明にして文字と装飾だけを書き出します。' : 'この形式は透過に対応していません。「WebM 透過」か「PNG連番」を選んでください（または下のクロマキー）。',
      green: '背景を #00B140 で塗りつぶします。編集ソフトのクロマキーで抜いてください（緑系の配色は避けると綺麗に抜けます）。',
      blue: '背景を #0047BB で塗りつぶします。緑を使う配色のときに。',
      custom: '任意のキー色で背景を塗りつぶします。文字色と被らない色を選んでください。',
    };
    $('#exBgHint').textContent = hints[EX.bg];
    $('#exOverWrap').hidden = EX.bg === 'normal';
    $('#exAudio').closest('.row').hidden = !!(f.seq || f.gif);
    const w = [];
    if (EX.bg === 'alpha' && !(f.alpha || f.seq || f.gif)) w.push('選択中の形式は透過できません。');
    if ((f.seq || f.gif) && EX.range === 'all' && dur() > 30) w.push(`曲全体（${Math.round(dur())}秒）の${f.gif ? 'GIF' : 'PNG連番'}は非常に大きくなります。範囲を指定するのがおすすめです。`);
    if (!hasAudio() && !(f.seq || f.gif)) w.push('音源が読み込まれていないため、無音の動画になります。');
    $('#exWarn').hidden = !w.length; $('#exWarn').innerHTML = w.join('<br>');
    $('#exModal').classList.add('open');
  }
  function seg(sel, val, on) { $$(sel + ' button').forEach((b) => { b.classList.toggle('on', b.dataset.v === val); b.onclick = () => { $$(sel + ' button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); on(b.dataset.v); }; }); }
  $('#exportBtn').onclick = openExport;
  $('#exGo').onclick = async () => {
    const F = LM.exporter.FORMATS, f = F[EX.fmt];
    if (!P.cues.length) return toast('フレーズがありません', true);
    if (EX.bg === 'alpha' && !(f.alpha || f.seq || f.gif)) return toast('この形式は透過できません', true);
    const k = +$('#exRes').value || 1;
    const fps = FPSX[String(EX.fps)] || EX.fps;
    const aspects = [P.aspect, ...Array.from(EX.batch).filter((a) => a !== P.aspect && D.aspects[a])];
    let t0 = 0, t1 = dur();
    if (EX.range === 'cue' && selCue()) { t0 = selCue().start; t1 = Math.min(dur(), selCue().end + 0.5); }
    if (EX.range === 'custom') { t0 = U.clamp(U.parseTime($('#exT0').value) || 0, 0, dur()); t1 = U.clamp(U.parseTime($('#exT1').value) || dur(), t0 + 0.1, dur()); }
    const mode = EX.bg === 'normal' ? {} : { transparent: true, overlays: $('#exOver').checked, key: EX.bg === 'green' ? '#00b140' : EX.bg === 'blue' ? '#0047bb' : EX.bg === 'custom' ? $('#exKey').value : null };
    let dirHandle = null, outDir = null, fileHandle = null;
    const wantStream = $('#exStream').checked && !$('#exStreamRow').hidden && !(f.seq || f.gif);
    if (wantStream) {
      try {
        if (aspects.length > 1) outDir = await window.showDirectoryPicker({ mode: 'readwrite' });
        else fileHandle = await window.showSaveFilePicker({ suggestedName: `${safeName()}${f.alpha ? '_alpha' : ''}.${f.ext}` });
      } catch (e) { return; }
    }
    if (f.seq && (t1 - t0) * fps > 900 && window.showDirectoryPicker && !U.inArtifact()) {
      if (await ask(`${Math.round((t1 - t0) * EX.fps)}枚のPNGになります。ZIPではなくフォルダーへ直接保存しますか？（推奨）`, { ok: 'フォルダーを選ぶ' })) { try { dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { return; } }
    }
    const sig = { cancel: false }; EX.running = sig;
    $('#exGo').disabled = true; $('#exCancel').disabled = false;
    $('#exMsg').textContent = 'フォント準備中…'; $('#exBar').style.width = '0%';
    try {
      await LM.fonts.ensureProject(P);
      const done = [];
      for (let ai = 0; ai < aspects.length; ai++) {
        const asp = aspects[ai], [W0, H0] = D.aspects[asp];
        const W = Math.round((W0 * k) / 2) * 2, H = Math.round((H0 * k) / 2) * 2;
        const pr = JSON.parse(JSON.stringify(P)); pr.aspect = asp;
        const tag = aspects.length > 1 ? `[${ai + 1}/${aspects.length} ${asp}] ` : '';
        let writable = null;
        if (fileHandle) writable = await fileHandle.createWritable();
        else if (outDir) { const fh = await outDir.getFileHandle(`${safeName()}_${asp.replace(':', 'x')}${f.alpha ? '_alpha' : ''}.${f.ext}`, { create: true }); writable = await fh.createWritable(); }
        const t = performance.now();
        const res = await LM.exporter.run({ fmt: EX.fmt, W, H, fps, t0, t1, mode, quality: EX.q, mblur: EX.mb, includeAudio: $('#exAudio').checked && hasAudio(), project: pr, images: S.images, dirHandle, writable, signal: sig,
          onProgress: (p, m) => { $('#exBar').style.width = (p * 100).toFixed(1) + '%'; const el = (performance.now() - t) / 1000; const eta = p > 0.02 ? el / p - el : 0; $('#exMsg').textContent = `${tag}${m}${eta > 1 ? `・残り約${Math.ceil(eta)}秒` : ''}`; } });
        if (aspects.length > 1 && res.name) res.name = res.name.replace(/(\.[a-z0-9]+)$/i, `_${asp.replace(':', 'x')}$1`);
        let st = 'saved'; if (res.blob) st = await U.download(res.blob, res.name);
        if (st === 'declined') { toast('保存をキャンセルしました'); break; }
        done.push({ asp, res });
      }
      const last = done[done.length - 1];
      if (last) {
        $('#exMsg').textContent = '完了：' + (done.length > 1 ? `${done.length}本（${done.map((d) => d.asp).join(' / ')}）` : last.res.name || last.res.note || '');
        const sz = done.reduce((a, d) => a + (d.res.blob ? d.res.blob.size : 0), 0);
        toast(last.res.warn || `書き出しました（${done.length > 1 ? done.length + '本・' : ''}${sz ? (sz / 1048576).toFixed(1) + 'MB' : 'ディスク／フォルダー'}）`, !!last.res.warn);
      }
    } catch (e) {
      console.error(e); $('#exMsg').textContent = e.message; toast(e.message || '書き出しに失敗しました', true);
    } finally { $('#exGo').disabled = false; $('#exCancel').disabled = true; EX.running = null; }
  };
  $('#exCancel').onclick = () => { if (EX.running) EX.running.cancel = true; };

  /* ---------------- file menu ---------------- */
  $('#fileBtn').onclick = (e) => { e.stopPropagation(); $('#fileMenu').classList.toggle('open'); };
  document.addEventListener('click', () => $('#fileMenu').classList.remove('open'));
  const saveFile = (b, n) => U.download(b, n).then((st) => { if (st !== 'declined' && U.inArtifact() && !/\.(json|zip|png|gif|mp4|webm)$/i.test(n)) toast('この環境では拡張子の後ろに .txt / .zip が付きます。保存後に外してください'); return st; }).catch((e) => { toast(e.message, true); return 'error'; });
  const safeName = () => (P.title || 'lyric-motion').replace(/[\\/:*?"<>|]+/g, '_');
  function saveJson() { saveFile(new Blob([JSON.stringify(P, null, 1)], { type: 'application/json' }), safeName() + '.json'); toast((P.images || []).length ? 'プロジェクトを保存しました（音源と背景画像は含まれません。まとめて持ち出すには「.lmz」で）' : 'プロジェクトを保存しました（音源は含まれません。音源込みは「.lmz」で）'); }
  async function savePkg() {
    const z = new LM.exporter.Zip();
    z.add('project.json', new TextEncoder().encode(JSON.stringify(P)));
    if (S.audioBlob) z.add('audio/' + (S.audioName || 'audio.mp3'), new Uint8Array(await S.audioBlob.arrayBuffer()));
    for (const x of P.images || []) { const b = await idb.get(imgKey(x.id)); if (b) z.add('images/' + x.id + (x.type === 'video' ? (/webm/.test(b.type) ? '.webm' : /quicktime/.test(b.type) ? '.mov' : '.mp4') : '.jpg'), new Uint8Array(await b.arrayBuffer())); }
    saveFile(z.blob(), safeName() + '.lmz'); toast(S.audioBlob ? '音源込みで保存しました' : '音源がないため、プロジェクトのみ保存しました');
  }
  async function openFile(f) {
    try {
      if (/\.lmz$/i.test(f.name) || /\.zip$/i.test(f.name)) {
        const files = await LM.exporter.unzip(await f.arrayBuffer());
        if (!files['project.json']) throw new Error('project.json が見つかりません');
        P = MD.normalize(JSON.parse(new TextDecoder().decode(files['project.json'])));
        const ak = Object.keys(files).find((k) => k.startsWith('audio/'));
        for (const k of Object.keys(files)) if (k.startsWith('images/')) { const id = k.slice(7).replace(/\.[^.]+$/, ''); const ext = (k.match(/\.([a-z0-9]+)$/i) || [])[1] || 'jpg', vid = /^(mp4|webm|mov|m4v)$/i.test(ext); const blob = new Blob([files[k]], { type: vid ? (ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4') : 'image/jpeg' }); await idb.set(imgKey(id), blob); try { S.images[imgKey(id)] = vid ? await LM.video.create(blob) : await blobToImage(blob); } catch (e) {} }
        afterLoad();
        if (ak) await loadAudio(new File([files[ak]], ak.slice(6)), true);
      } else {
        if (f.size > 60 * 1024 * 1024) throw new Error('ファイルが大きすぎます');
        P = MD.normalize(JSON.parse(await f.text()));
        afterLoad();
        if (P.audioName && (!S.audioName || S.audioName !== P.audioName)) toast(`音源「${P.audioName}」を読み込み直してください（JSONには音声が含まれません）`);
      }
      commit(); toast('プロジェクトを開きました');
    } catch (e) { console.error(e); toast('開けませんでした：' + e.message, true); }
  }
  $('#openFile').onchange = (e) => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; };
  $('#subFile').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const txt = await f.text(); importTimed(/-->/.test(txt) ? MD.fromSRT(txt) : MD.fromLRC(txt)); e.target.value = ''; };
  /* ---------------- snapshots (named versions in IndexedDB) ---------------- */
  async function snaps() { return (await idb.get('snaps')) || []; }
  async function saveSnap(name, auto) {
    const L = await snaps();
    L.unshift({ id: U.uid(), name: String(name || '').slice(0, 60) || 'スナップショット', at: Date.now(), auto: !!auto, n: P.cues.length, theme: (D.themeById[P.theme] || {}).n || '', data: JSON.stringify(P) });
    // keep at most 40, and at most 12 automatic ones
    let autos = 0; const out = L.filter((x) => (x.auto ? ++autos <= 12 : true)).slice(0, 40);
    await idb.set('snaps', out);
    if (!auto) toast('スナップショットを保存しました');
  }
  async function renderSnaps() {
    const L = await snaps();
    const fmt = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    $('#snapList').innerHTML = L.length ? L.map((x) => `<div class="sn"><div><b>${x.auto ? '⟲ ' : ''}${esc(x.name)}</b><small>${fmt(x.at)} ・ ${x.n}行 ・ ${esc(x.theme)}</small></div><span class="sp"></span><button class="btn sm" data-r="${x.id}">復元</button><button class="btn sm" data-d="${x.id}">削除</button></div>`).join('') : '<p class="hint">まだありません。</p>';
    $$('#snapList [data-r]').forEach((b) => (b.onclick = async () => {
      const x = (await snaps()).find((q) => q.id === b.dataset.r); if (!x) return;
      if (!(await ask(`「${x.name}」の状態に戻します（今の状態は自動で保存されます）`, { ok: '復元' }))) return;
      await saveSnap('復元の直前', true);
      P = MD.normalize(JSON.parse(x.data)); afterLoad(); commit(); $('#snapModal').classList.remove('open'); toast('復元しました');
    }));
    $$('#snapList [data-d]').forEach((b) => (b.onclick = async () => { await idb.set('snaps', (await snaps()).filter((q) => q.id !== b.dataset.d)); renderSnaps(); }));
  }
  $('#snapNew').onclick = async () => { const n = await ask('スナップショットの名前', { input: `案 ${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`, ok: '保存' }); if (n == null) return; await saveSnap(n); renderSnaps(); $('#snapModal').classList.add('open'); };
  /* YouTube chapters from song structure (0:00 must be first) */
  function chaptersText() {
    const secs = (P.sections || []).slice().sort((a, b) => a.t - b.t);
    if (!secs.length) return null;
    const f = (t) => { t = Math.max(0, Math.round(t)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s2 = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s2).padStart(2, '0'); };
    const cnt = {}; const rows = secs.map((x) => { const n = MD.SEC[x.type].n; cnt[n] = (cnt[n] || 0) + 1; return [x.t, n]; });
    const seen = {}; const lines = rows.map(([t, n]) => { seen[n] = (seen[n] || 0) + 1; return `${f(t)} ${n}${cnt[n] > 1 ? seen[n] : ''}`; });
    if (secs[0].t > 0.5) lines.unshift('0:00 ' + ((P.title || '') + ' ').trim() + 'スタート');
    else lines[0] = lines[0].replace(/^\d+:\d+/, '0:00');
    return (P.title ? `${P.title}${P.artist ? ' / ' + P.artist : ''}\n\n` : '') + lines.join('\n') + '\n';
  }


  /* ---------------- 設定を初期状態にリセット ---------------- */
  const RS_KEYS = ['lyrics', 'timing', 'audio', 'song', 'images', 'aspect', 'credits', 'looks'];
  function rsSync() {
    const on = (k) => $(`#resetModal [data-rs="${k}"]`).checked;
    const tm = $('#resetModal [data-rs="timing"]'); tm.disabled = on('lyrics'); if (tm.disabled) tm.checked = false;
    $('#rsWarn').hidden = !((on('audio') && hasAudio()) || on('looks'));
  }
  function openReset() {
    $$('#resetModal [data-rs]').forEach((el) => { el.checked = false; el.onchange = rsSync; });
    rsSync(); $('#resetModal').classList.add('open');
  }
  $('#rsAll').onclick = () => { $$('#resetModal [data-rs]').forEach((el) => (el.checked = true)); rsSync(); };
  $('#rsNone').onclick = () => { $$('#resetModal [data-rs]').forEach((el) => (el.checked = false)); rsSync(); };
  function removeAudio() {
    if (S.playing) { try { pause(); } catch (e) {} }
    try { au.pause(); } catch (e) {}
    if (au.src) { try { URL.revokeObjectURL(au.src); } catch (e) {} }
    au.removeAttribute('src'); try { au.load(); } catch (e) {}
    LM.audio.clear && LM.audio.clear();
    S.audioBlob = null; S.audioName = null; S.peaks = null; P.audioName = null;
    idb.del('audio');
    $('#audioInfo').hidden = true;
  }
  async function resetSettings(o) {
    await saveSnap('設定リセットの直前', true);
    const old = P, np = MD.newProject();
    // always kept: song length and this device's tap latency calibration
    np.duration = old.duration; if (old.tapLatency != null) np.tapLatency = old.tapLatency;
    if (!o.aspect) np.aspect = old.aspect;
    if (!o.credits) { np.title = old.title; np.artist = old.artist; np.showCredits = old.showCredits; np.creditPos = old.creditPos; }
    if (!o.song) { np.sections = old.sections; np.bpm = old.bpm; np.beatOffset = old.beatOffset; }
    if (!o.images) np.images = old.images;
    if (!o.audio) np.audioName = old.audioName;
    if (!o.lyrics) {
      let cues = (old.cues || []).map((c) => ({ id: c.id, text: c.text, start: c.start, end: c.end, words: c.words, locked: c.locked, kind: c.kind, img: o.images ? undefined : c.img, scene: {} }));
      if (o.timing && cues.length) {
        const times = MD.autoTime(cues.map((c) => c.text), np.duration, o.audio ? null : LM.audio.analysis, {});
        cues = cues.map((c, i) => Object.assign(c, times[i] ? { start: times[i].start, end: times[i].end } : {}, { words: undefined }));
      }
      np.cues = cues;
    }
    const removedImgs = o.images ? (old.images || []) : [];
    P = MD.normalize(np);
    LM.director.applyTheme(P, 'jpop');
    // the first-image default: keep background images visible under the motion
    if ((P.images || []).length) { P.imgFirst = true; LM.imgFirst.applyLook(P); }
    if (P.cues.length) { MD.repairEnds(P); P.cues = LM.director.generate(P, { seed: P.seed }); }
    if (o.audio) removeAudio();
    removedImgs.forEach((x) => { const v = S.images[imgKey(x.id)]; if (v && v.dispose) v.dispose(); delete S.images[imgKey(x.id)]; });
    if (o.looks) { U.store.set('lms.looks', []); buildLooks(); }
    S.sel = P.cues.length ? 0 : -1; S.gapTarget = null; S.multi && S.multi.clear();
    afterLoad(); commit();
    const kept = RS_KEYS.filter((k) => !o[k]).length;
    toast(kept === RS_KEYS.length ? '設定を初期状態に戻しました（歌詞・曲・画像などはそのままです）' : '設定と選んだ項目を初期状態に戻しました');
  }
  $('#rsGo').onclick = async () => {
    const o = {}; $$('#resetModal [data-rs]').forEach((el) => (o[el.dataset.rs] = el.checked && !el.disabled));
    if (o.lyrics) o.timing = false;
    $('#resetModal').classList.remove('open');
    await resetSettings(o);
  };
  /* ---------------- Motion System parameters (per phrase) ---------------- */
  const MPK = { e: 'enter', h: 'hold', m: 'emph', x: 'exit' };
  function buildMpPanel(c) {
    const host = $('#mpPanel'); if (!host || !LM.MS) return;
    const k = S.mpTrk || 'e', o = (c.mp && c.mp[k]) || {}, MS = LM.MS;
    const rng = (id, lab, v, lo, hi, st, fmt, tip) => `<div class="row"><label${tip ? ` title="${esc(tip)}"` : ''}>${lab}</label><input type="range" id="${id}" min="${lo}" max="${hi}" step="${st}" value="${v == null ? (lo + hi) / 2 : v}"><span class="val" id="${id}V">${v == null ? esc(T('標準')) : fmt(v)}</span><button class="btn sm ic" data-rs="${id}" title="${esc(T('標準に戻す'))}">↺</button></div>`;
    const sel = (id, lab, v, opts) => `<div class="row"><label>${lab}</label><select id="${id}" style="flex:1">${Object.entries(opts).map(([a, n]) => `<option value="${a}" ${String(v) === a ? 'selected' : ''}>${esc(T(n))}</option>`).join('')}</select></div>`;
    const tr = k === 'e' || k === 'x', ez = o.ease || 'auto';
    host.innerHTML = `<div class="seg" id="mpTrk" style="margin:6px 0">${Object.entries({ e: '登場', h: '保持', m: '強調', x: '退場' }).map(([a, n]) => `<button data-v="${a}" class="${a === k ? 'on' : ''}">${esc(T(n))}${c.mp && c.mp[a] ? ' •' : ''}</button>`).join('')}</div>
      ${rng('mpI', '強さ', o.i, 0, 100, 1, (v) => v, '移動距離・拡大率・回転・ぼかし・行き過ぎの量がモーションに合わせて変わります（50＝標準）')}
      ${rng('mpV', 'ばらつき', o.v, 0, 100, 1, (v) => v, '単語ごとに向き・距離・タイミング・回転を少しずつ変えます（同じシードなら毎回同じ結果）')}
      ${tr ? rng('mpSt', '間隔（スタッガー）', o.st, 0, 100, 1, (v) => v, '一文字・一単語ずつの時間差') : ''}
      ${tr ? sel('mpEase', 'タイミングカーブ', ez, MS.EASE_N) : ''}
      ${tr && ez === 'spring' ? rng('mpK', '硬さ（stiffness）', o.k, 20, 600, 5, (v) => v) + rng('mpDm', '減衰（damping）', o.dm, 2, 60, 1, (v) => v) + rng('mpMs', '質量（mass）', o.ms, 0.2, 4, 0.1, (v) => (+v).toFixed(1)) : ''}
      ${tr && ez === 'back' ? rng('mpS', '行き過ぎ（overshoot）', o.s, 0, 5, 0.1, (v) => (+v).toFixed(1)) : ''}
      ${tr ? sel('mpBeats', '長さ（拍に合わせる）', o.beats || 0, { 0: '自動', 0.125: '1/8拍', 0.25: '1/4拍', 0.5: '1/2拍', 1: '1拍', 2: '2拍', 4: '1小節' }) : ''}
      ${k === 'e' ? rng('mpDelay', '遅らせて始める', o.delay, 0, 2, 0.05, (v) => (+v).toFixed(2) + 's') : ''}
      ${k === 'm' ? sel('mpTrig', 'きっかけ', o.trig || 'beat', MS.TRIG) + sel('mpTgt', '対象', o.tgt || 'auto', MS.TGT) : ''}
      <div class="row"><button class="btn sm" id="mpSeed">${esc(T('別のばらつきパターン'))}</button><span class="sp"></span><button class="btn sm" id="mpReset">${esc(T('この行の調整をすべて戻す'))}</button></div>
      <p class="hint">${esc(T(k === 'm' ? '強調は、表示中の文字を拍や歌い出しに合わせて一瞬だけ動かすアクセントです。登場・保持・退場の動きに重ねて使えます。' : '強さ・ばらつきはこの行のモーションすべてに効きます。複数の行を選んでいれば、まとめて変わります。'))}</p>`;
    const setv = (n, v) => { eachSel((q) => { q.mp = q.mp || {}; const t0 = (q.mp[k] = q.mp[k] || {}); if (v == null || v === '' || v === 'auto' || (n === 'beats' && !+v)) delete t0[n]; else t0[n] = v; if (!Object.keys(t0).length) delete q.mp[k]; if (!Object.keys(q.mp).length) delete q.mp; }); };
    $$('#mpTrk button', host).forEach((bt) => (bt.onclick = () => { S.mpTrk = bt.dataset.v; buildMpPanel(c); }));
    const RMAP = { mpI: 'i', mpV: 'v', mpSt: 'st', mpK: 'k', mpDm: 'dm', mpMs: 'ms', mpS: 's', mpDelay: 'delay' };
    Object.entries(RMAP).forEach(([id, n]) => { const el = $('#' + id, host); if (!el) return; el.addEventListener('input', () => { setv(n, +el.value); $('#' + id + 'V', host).textContent = n === 'delay' ? (+el.value).toFixed(2) + 's' : n === 'ms' || n === 's' ? (+el.value).toFixed(1) : el.value; S.dirty = true; commitSoon(); }); });
    $$('[data-rs]', host).forEach((bt) => (bt.onclick = () => { setv(RMAP[bt.dataset.rs], null); commit(); }));
    if ($('#mpEase', host)) $('#mpEase', host).onchange = (e) => { setv('ease', e.target.value); commit(); };
    if ($('#mpBeats', host)) $('#mpBeats', host).onchange = (e) => { setv('beats', +e.target.value); commit(); };
    if ($('#mpTrig', host)) $('#mpTrig', host).onchange = (e) => { setv('trig', e.target.value); commit(); };
    if ($('#mpTgt', host)) $('#mpTgt', host).onchange = (e) => { setv('tgt', e.target.value); commit(); };
    $('#mpSeed', host).onclick = () => { eachSel((q) => { q.mp = q.mp || {}; q.mp.seed = ((q.mp.seed || 0) + 1) % 1000000; }); commit(); };
    $('#mpReset', host).onclick = () => { eachSel((q) => delete q.mp); commit(); };
  }
  const acts = {
    new: async () => { if (!(await ask('新規プロジェクトを作成します（現在の内容は「元に戻す」で復元できます）', { ok: '新規作成' }))) return; const keepDur = hasAudio() ? P.duration : 30; P = MD.newProject(); P.duration = keepDur; LM.director.applyTheme(P, 'jpop'); $('#lyrics').value = ''; S.sel = -1; afterLoad(); commit(); },
    reset: () => openReset(),
    open: () => $('#openFile').click(), saveJson, savePkg,
    srt: () => saveFile(new Blob([MD.toSRT(P)], { type: 'text/plain' }), safeName() + '.srt'),
    vtt: () => saveFile(new Blob([MD.toVTT(P)], { type: 'text/vtt' }), safeName() + '.vtt'),
    lrc: () => saveFile(new Blob([MD.toLRC(P)], { type: 'text/plain' }), safeName() + '.lrc'),
    importSub: () => $('#subFile').click(),
    snapSave: () => $('#snapNew').click(),
    snapList: async () => { await renderSnaps(); $('#snapModal').classList.add('open'); },
    clearData: async () => {
      if (!(await ask('このブラウザーに保存されたデータ（自動保存のプロジェクト・音源・背景画像と動画・スナップショット・ルック・設定）をすべて削除します。ファイルとして保存したものは消えません。元に戻せません。', { ok: 'すべて削除' }))) return;
      try { Object.keys(localStorage).filter((k) => k.startsWith('lms.')).forEach((k) => localStorage.removeItem(k)); } catch (e) {}
      await new Promise((res) => { try { const r = indexedDB.deleteDatabase('lms'); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch (e) { res(); } });
      toast('保存データを削除しました。ページを再読み込みします'); setTimeout(() => location.reload(), 900);
    },
    chapters: () => { const t = chaptersText(); if (!t) return toast('曲構成（おまかせタブ）を先に指定・推定してください', true); try { navigator.clipboard && navigator.clipboard.writeText(t); } catch (e) {} saveFile(new Blob([t], { type: 'text/plain' }), safeName() + '_chapters.txt'); toast('チャプターを書き出しました（クリップボードにもコピー）'); },
    still: async () => { const [W, H] = D.aspects[P.aspect]; await LM.fonts.ensureProject(P); const r = await LM.exporter.still({ W, H, t: now(), project: P, images: S.images }); saveFile(r.blob, r.name); },
    help: () => $('#helpModal').classList.add('open'),
    manual: () => openManual(),
    theme: () => { const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); const nx = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = nx; U.store.set('lms.ui', nx); readColors(); S.dirty = true; },
  };
  $$('#fileMenu button').forEach((b) => (b.onclick = () => { $('#fileMenu').classList.remove('open'); acts[b.dataset.act](); }));
  $$('[data-close]').forEach((b) => (b.onclick = () => b.closest('.modal').classList.remove('open')));
  $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m && !(m.id === 'exModal' && EX.running)) m.classList.remove('open'); }));

  /* ---------------- manual ---------------- */
  (() => { const st = document.createElement('style'); st.textContent = LM.manual.css; document.head.appendChild(st); })();
  function openManual(id) {
    const S2 = (LM.i18n && LM.i18n.manual()) || LM.manual.sections, cur = (id && S2.some((s) => s.id === id) && id) || S2[0].id; S.manId = cur;
    $('#manNav').innerHTML = S2.map((s) => `<button data-m="${s.id}" class="${s.id === cur ? 'on' : ''}">${esc(s.t)}</button>`).join('');
    const sec = S2.find((s) => s.id === cur) || S2[0];
    $('#manBody').innerHTML = `<h2>${esc(sec.t)}</h2>${sec.h}`; $('#manBody').scrollTop = 0;
    $$('#manNav button').forEach((b) => (b.onclick = () => openManual(b.dataset.m)));
    $('#manualModal').classList.add('open');
  }
  $('#manualBtn').onclick = () => openManual();

  /* ---------------- language ---------------- */
  if (LM.i18n) {
    const ls = $('#langSel');
    ls.innerHTML = LM.i18n.LANGS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
    ls.value = LM.i18n.lang;
    ls.onchange = () => { LM.i18n.set(ls.value); };
    LM.i18n.onChange((l) => {
      ls.value = l;
      pick.samples = null;
      try { refresh(); } catch (e) { console.warn(e); }
      if ($('#manualModal').classList.contains('open')) openManual(S.manId);
      S.dirty = true;
    });
  }
  $('#manualSave').onclick = () => saveFile(new Blob([LM.manual.standalone((LM.i18n && LM.i18n.manual()) || null, LM.i18n ? LM.i18n.lang : 'ja')], { type: 'text/html' }), (LM.i18n && LM.i18n.lang !== 'ja' ? 'LyricMotionStudio_Manual_' + LM.i18n.lang : 'LyricMotionStudio_取扱説明書') + '.html');

  /* ---------------- transport ---------------- */
  $('#play').onclick = toggle;
  $('#toStart').onclick = () => seek(0);
  $('#prevCue').onclick = () => jumpCue(-1);
  $('#nextCue').onclick = () => jumpCue(1);
  function jumpCue(d) { if (!P.cues.length) return; const t = now(); let i; if (d > 0) i = P.cues.findIndex((c) => c.start > t + 0.01); else { i = -1; P.cues.forEach((c, k) => { if (c.start < t - 0.25) i = k; }); } if (i < 0) i = d > 0 ? P.cues.length - 1 : 0; selectCue(i, true); }
  $('#seekTo').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = U.parseTime(e.target.value); if (isFinite(v)) seek(v); else toast('例：75 または 1:15', true); e.target.blur(); } });
  $('#loopCue').onclick = () => { S.loop = !S.loop; $('#loopCue').classList.toggle('on', S.loop); };
  $('#pvQ').onchange = (e) => { S.pvQ = e.target.value === 'auto' ? 'auto' : +e.target.value; U.store.set('lms.pvq', S.pvQ); fitFrame(); };
  $('#guidesBtn').onclick = () => { $('#guides').classList.toggle('on'); $('#guidesBtn').classList.toggle('on'); };
  $('#inspToggle').onclick = () => $('#insp').classList.toggle('float');
  $('#addCue').onclick = () => {
    const t = now();
    const next = P.cues.find((c) => c.start > t);
    const inside = P.cues.find((c) => t >= c.start && t < c.end);
    if (inside) return toast('再生位置が既存のフレーズ内です。「分割」を使うか空いている場所に移動してください', true);
    const end = Math.min(next ? next.start : dur(), t + 2.5);
    if (end - t < FR * 3) return toast('空きが足りません', true);
    const nc = MD.normalizeCue({ text: '新しいフレーズ', start: t, end, enter: 'fade', hold: 'none', exit: 'fadeOut', scene: { layout: 'center' } });
    P.cues.push(nc); sortCues(); S.sel = P.cues.indexOf(nc); commit(); setTimeout(() => $('#iText') && $('#iText').select(), 50);
  };
  $('#splitCue').onclick = () => {
    const t = now(); const i = P.cues.findIndex((c) => t > c.start + FR && t < c.end - FR);
    if (i < 0) return toast('再生位置をフレーズの途中に置いてください', true);
    const c = P.cues[i]; const gs = LM.seg.graphemes(c.text); const k = Math.max(1, Math.round(gs.length * ((t - c.start) / (c.end - c.start))));
    const b = MD.normalizeCue(JSON.parse(JSON.stringify(Object.assign({}, c, { id: U.uid(), text: gs.slice(k).join('') || c.text, start: t }))));
    c.text = gs.slice(0, k).join(''); c.end = t;
    P.cues.splice(i + 1, 0, b); S.sel = i + 1; commit();
  };
  $('#delCue').onclick = () => delCue();
  function delCue() {
    if (S.multi.size > 1) { const n = S.multi.size; P.cues = P.cues.filter((c) => !S.multi.has(c.id)); S.multi.clear(); S.sel = Math.min(S.sel, P.cues.length - 1); commit(); toast(`${n}行を削除しました（元に戻せます）`); return; }
    if (S.sel < 0) return; P.cues.splice(S.sel, 1); S.sel = Math.min(S.sel, P.cues.length - 1); commit();
  }
  $('#undo').onclick = undo; $('#redo').onclick = redo;
  $$('#tabs button').forEach((b) => (b.onclick = () => { $$('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); $$('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === b.dataset.tab)); if (b.dataset.tab === 'list') markList(); }));

  /* ---------------- keyboard ---------------- */
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !['checkbox', 'range', 'color'].includes(document.activeElement.type);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveJson(); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'c' && !typing) { e.preventDefault(); copyStyle(); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'v' && !typing) { e.preventDefault(); pasteStyle(); return; }
    if (mod && e.key.toLowerCase() === 'a' && !typing && !$('.modal.open')) { e.preventDefault(); P.cues.forEach((c) => S.multi.add(c.id)); if (S.sel < 0 && P.cues.length) S.sel = 0; if (S.multi.size <= 1) S.multi.clear(); renderInspector(); markList(); S.dirty = true; return; }
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#openFile').click(); return; }
    if (typing) return;
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') { e.preventDefault(); const sg = e.code === 'BracketLeft' ? -1 : 1; if (e.altKey) nudgeKern('word', sg * (e.shiftKey ? 0.25 : 0.05)); else nudgeKern('track', sg * (e.shiftKey ? 0.05 : 0.01)); return; }
    if (e.key === 'Escape') { if (!$('.modal.open') && S.multi.size) { S.multi.clear(); renderInspector(); markList(); S.dirty = true; } $$('.modal.open').forEach((m) => { if (!(m.id === 'exModal' && EX.running)) m.classList.remove('open'); }); return; }
    if ($('.modal.open')) return;
    if (S.tap && (e.key === 'Enter' || e.key.toLowerCase() === 'j')) { e.preventDefault(); if (!e.repeat) tapPress(); return; }
    if (S.tap && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && S.tapDown == null) { e.preventDefault(); S.tapW = 0; S.tapIdx = U.clamp(S.tapIdx + (e.key === 'ArrowUp' ? -1 : 1), 0, P.cues.length - 1); S.sel = S.tapIdx; renderInspector(); markList(); S.dirty = true; return; }
    const t = now();
    switch (e.key) {
      case ' ': e.preventDefault(); toggle(); break;
      case 'ArrowLeft': e.preventDefault(); seek(t - (e.altKey ? FR : e.shiftKey ? 5 : 1)); break;
      case 'ArrowRight': e.preventDefault(); seek(t + (e.altKey ? FR : e.shiftKey ? 5 : 1)); break;
      case 'ArrowUp': e.preventDefault(); jumpCue(-1); break;
      case 'ArrowDown': e.preventDefault(); jumpCue(1); break;
      case 'Home': seek(0); break;
      case 'i': case 'I': if (e.shiftKey) ripple(S.sel); else stamp('start'); break;
      case 'o': case 'O': stamp('end'); break;
      case 'w': case 'W': stampWord(); break;
      case 'm': case 'M': addSection(t); break;
      case 'r': case 'R': reroll(); break;
      case 'l': case 'L': if (selCue()) { selCue().locked = !selCue().locked; commit(); } break;
      case 'Delete': case 'Backspace': delCue(); break;
    }
  });
  document.addEventListener('keyup', (e) => { const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && !['checkbox', 'range', 'color'].includes(a.type)) return; if (S.tap && (e.key === 'Enter' || e.key.toLowerCase() === 'j')) tapRelease(); });

  /* ---------------- refresh ---------------- */
  function refresh() {
    sortCues();
    $('#pTitleTop').value = P.title || ''; if (document.activeElement !== $('#pTitle')) $('#pTitle').value = P.title || '';
    if (document.activeElement !== $('#pArtist')) $('#pArtist').value = P.artist || '';
    $('#showCredits').checked = !!P.showCredits; $('#creditPos').value = P.creditPos || 'bl';
    $('#durInput').value = P.duration; $('#durInput').disabled = hasAudio(); $('#durRow').style.opacity = hasAudio() ? 0.5 : 1;
    $('#tDur').textContent = U.fmtTime(dur(), false);
    $$('#themes .theme').forEach((b) => b.classList.toggle('on', b.dataset.id === P.theme));
    $('#seed').value = P.seed; $('#autoColors').checked = !!P.autoColors; $('#autoFilters').checked = !!P.autoFilters; $('#autoTrans').checked = P.autoTrans !== false; $('#autoGfx').checked = P.autoGfx !== false; $('#transOn').checked = !P.transOff; $('#bgmDim').value = Math.round((P.bgmDim ?? 0.22) * 100); $('#bgmDimV').textContent = $('#bgmDim').value + '%';
    $('#planInfo').textContent = S.plans.length ? `案 ${S.planIdx + 1} / ${S.plans.length}` : '案 –';
    $('#planPrev').disabled = S.planIdx <= 0; $('#planNext').disabled = S.planIdx >= S.plans.length - 1;
    $$('#aspects .chip').forEach((b) => b.classList.toggle('on', b.dataset.a === P.aspect)); $('#aspectQuick').value = P.aspect;
    buildPalettes(); buildCustom(); buildFonts(); syncMotionUI(); syncBgmMix();
    $('#keyColor').checked = P.keyColor !== false;
    syncers.forEach((f) => f());
    $('#bgType').value = (P.bg && P.bg.type) || 'solid'; $('#bgImgRow').hidden = $('#bgType').value !== 'image';
    $('#bgDim').value = Math.round(((P.bg && P.bg.dim) ?? 0.45) * 100); $('#bgDimV').textContent = $('#bgDim').value + '%';
    $('#bgBlur').value = (P.bg && P.bg.blur) || 0; $('#bgBlurV').textContent = $('#bgBlur').value;
    $('#pattern').value = P.pattern || 'none'; $('#camera').value = P.camera || '';
    $('#beatSync').checked = P.beatSync !== false; $('#bpm').value = P.bpm || ''; $('#beatOffset').value = P.beatOffset || 0;
    pruneMulti();
    $('#rubyOn').checked = P.ruby !== false;
    buildFxGlobal(); renderList(); renderInspector(); syncFine(); syncBgmUI(); renderSections(); buildLooks(); syncImgUI();
    ensureImages();
    LM.fonts.ensureProject(P).then(() => { view.invalidate(); S.dirty = true; });
    S.dirty = true;
  }
  function afterLoad(fromHist) {
    if (P.camera) P.cues.forEach((c) => c.scene && (c.scene.camera = P.camera));
    if (S.sel >= P.cues.length) S.sel = P.cues.length - 1;
    if (!fromHist && !$('#lyrics').value.trim()) $('#lyrics').value = P.cues.map((c) => c.text).join('\n');
    if (!fromHist) $('#lyrics').value = P.cues.map((c) => c.text).join('\n');
    view.invalidate(); fitFrame(); refresh(); updateUndo(); ensureLibImages();
  }

  /* ---------------- boot ---------------- */
  LM.fonts.onChange = () => { view.invalidate(); S.dirty = true; };
  LM.video.onFrame = () => { S.dirty = true; };
  function sample() {
    const p = MD.newProject();
    const L = (LM.i18n && LM.i18n.lang) || 'ja';
    const SAMPLES = {
      ja: ['サンプル', 'jpop', ['*夜明け*の向こうへ', '走り出した / 僕らの声', 'Hello, new world', '眠れない夜を数えて', '*きみ*に届け', 'ありがとう']],
      en: ['Sample', 'jpop', ['Beyond the *dawn*', 'We started running / with our voices', '"Hello, new world"', "Counting nights I can't sleep", 'Reach *you* tonight', 'Thank you']],
      es: ['Muestra', 'jpop', ['Más allá del *alba*', 'Empezamos a correr / con nuestra voz', '¿Me oyes, *mundo* nuevo?', 'Contando noches sin dormir', '¡Hasta *ti* esta noche!', 'Gracias']],
      it: ['Esempio', 'jpop', ["Oltre l'*alba*", 'Abbiamo iniziato a correre / con la nostra voce', '«Ciao, *mondo* nuovo»', 'Contando notti senza sonno', 'Fino a *te* stanotte', 'Grazie']],
      ko: ['샘플', 'jpop', ['*새벽* 너머로', '달리기 시작한 / 우리의 목소리', 'Hello, new world', '잠 못 드는 밤을 세며', '*너*에게 닿기를', '고마워']],
    };
    const [title, theme, lines] = SAMPLES[L] || SAMPLES.ja;
    p.title = title; p.artist = 'Lyric Motion'; p.duration = 24;
    LM.director.applyTheme(p, theme);
    p.cues = MD.autoTime(lines, 24, null).map((c) => MD.normalizeCue({ text: c.text, start: c.start, end: c.end, scene: {} }));
    p.cues = LM.director.generate(p, { seed: p.seed });
    return p;
  }
  async function boot() {
    const ui = U.store.get('lms.ui'); if (ui) document.documentElement.dataset.theme = ui;
    S.pvQ = U.store.get('lms.pvq', 'auto'); $('#pvQ').value = String(S.pvQ); if (!$('#pvQ').value) { S.pvQ = 'auto'; $('#pvQ').value = 'auto'; }
    $('#tapWord').checked = !!U.store.get('lms.tapword', false);
    readColors();
    buildThemes(); buildAspects(); buildBg();
    const saved = U.store.get('lms.project');
    try { P = saved && saved.cues ? MD.normalize(saved) : sample(); if (saved && saved.cues) { view.setProject(P); view.render(0, {}); } } catch (e) { console.warn('saved project could not be restored', e); P = sample(); setTimeout(() => toast('前回の自動保存を読み込めなかったため、サンプルから始めます', true), 800); }
    $('#lyrics').value = P.cues.map((c) => c.text).join('\n');
    S.sel = P.cues.length ? 0 : -1;
    pushPlan();
    tlSize(); TL.pps = 40; $('#tlZoom').value = 40;
    afterLoad(true);
    commit({ quiet: true });
    setTimeout(gcBlobs, 4000);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); S.dirty = true; });
    new ResizeObserver(() => { tlSize(); fitFrame(); }).observe($('#viewBox'));
    new ResizeObserver(() => { tlSize(); S.dirty = true; }).observe($('#tlWrap'));
    requestAnimationFrame(frame);
    if (!U.store.get('lms.seenManual')) { U.store.set('lms.seenManual', 1); setTimeout(() => openManual('quick'), 600); }
    const a = await idb.get('audio');
    if (a && a.blob && (!P.audioName || a.name === P.audioName)) loadAudio(new File([a.blob], a.name), true);
  }
  window.LMApp = { get P() { return P; }, set P(v) { P = MD.normalize(v); afterLoad(); commit(); }, S, seek, play, pause, view, commit, loadAudio, openExport, selectCue, openManual, clickSel, setTap, tapPress, tapRelease, addSection, copyStyle, pasteStyle, renderInspector };
  boot();
})();
