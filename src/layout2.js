/* Time-driven kinetic layouts: word flashes & camera tracking */
'use strict';
(() => {
  const L0 = LM.layout, lib = L0.lib, T = LM.typo;
  const { lerp } = LM.U;
  const PI = Math.PI;

  // split parsed text into word chunks (merge 1-char tokens, cap count)
  function chunks(P, maxN = 7) {
    // keep the typed word spaces (English / Spanish / Italian / Korean) when short words are merged into one flash
    const toks = [];
    P.segments.forEach((s) => { let sp = false; s.forEach((t) => { if (t.space) { sp = true; return; } if (t.gs.length) { t._sp = sp && toks.length > 0; toks.push(t); } sp = false; }); });
    const spTok = (t) => ({ gs: [{ ch: ' ', emph: false, cls: 'S' }], space: true });
    const join = (c, t) => { if (t._sp) c.toks.push(spTok(t)); c.toks.push(t); c.len += t.gs.length; };
    const out = [];
    toks.forEach((t) => {
      const last = out[out.length - 1];
      if (last && (t.gs.length === 1 || last.len === 1) && last.len + t.gs.length <= 6) join(last, t);
      else out.push({ toks: [t], len: t.gs.length });
    });
    while (out.length > maxN) { // merge shortest adjacent pair
      let bi = 0, bl = 1e9;
      for (let i = 0; i < out.length - 1; i++) { const l = out[i].len + out[i + 1].len; if (l < bl) (bl = l), (bi = i); }
      out[bi + 1].toks.forEach((t, k) => (k === 0 ? join(out[bi], t) : (out[bi].toks.push(t), t.space || (out[bi].len += t.gs.length))));
      out.splice(bi + 1, 1);
    }
    return out.map((c) => ({ P: { segments: [c.toks], count: c.len, plain: '' }, len: c.len }));
  }
  const tagSeq = (gl, k, extra) => gl.forEach((g) => Object.assign(g, { seq: k }, extra || {}));

  lib.wordFlash = { n: 'ワードフラッシュ（1語ずつ全画面）', c: '時間演出', f(L, P, rng) {
    const cs = chunks(P, 8);
    const styles = ['huge', 'outlineTilt', 'leftBar', 'vert', 'invert', 'hugeTilt'];
    let glyphs = [], lines = [], decos = [];
    const starts = []; let acc = 0; const tot = cs.reduce((a, c) => a + c.len + 1.2, 0);
    cs.forEach((c, k) => {
      starts.push(acc / tot); acc += c.len + 1.2;
      const st = styles[(k + Math.floor(rng() * 3)) % styles.length];
      let r;
      if (st === 'vert' && /[぀-鿿]/.test(c.P.segments[0].map((t) => t.gs.map((g) => g.ch).join('')).join('')) && c.len >= 2) {
        r = L0.block(L, c.P, { cx: L.W / 2, cy: L.cy, w: L.safe.h * 0.8, h: L.safe.w * 0.4 }, { vertical: true, maxLines: 2, lh: 1.2, noGrow: true });
      } else if (st === 'leftBar') {
        const bw = L.safe.w * 0.8;
        r = L0.block(L, c.P, { cx: L.safe.x + bw / 2 + L.minD * 0.05, cy: L.cy, w: bw, h: L.safe.h * 0.5 }, { align: 'left', maxLines: 2, noGrow: true });
        const b = L0.bbox(r.glyphs);
        decos.push({ t: 'rect', x: b.x - L.minD * 0.05, y: b.y, w: L.S * 14, h: b.h, col: 'accent', anim: 'grow-y', seq: k });
      } else {
        r = L0.block(L, c.P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.94, h: L.safe.h * 0.72 }, { maxLines: 2, lh: 1.05, noGrow: true });
        if (st === 'outlineTilt' || st === 'hugeTilt') { const a = (rng() - 0.5) * 0.3; r.glyphs.forEach((g) => { const dx = g.x - L.W / 2, dy = g.y - L.cy; g.x = L.W / 2 + dx * Math.cos(a) - dy * Math.sin(a); g.y = L.cy + dx * Math.sin(a) + dy * Math.cos(a); g.rot = (g.rot || 0) + a; }); }
        if (st === 'outlineTilt') r.glyphs.forEach((g) => (g.style = 'outline'));
        if (st === 'invert') { decos.push({ t: 'rect', x: 0, y: 0, w: L.W, h: L.H, col: 'accent', anim: 'none', seq: k }); r.glyphs.forEach((g) => (g.on = 'accent')); }
      }
      tagSeq(r.glyphs, k); r.glyphs.forEach((g) => (g.line += k * 10));
      glyphs = glyphs.concat(r.glyphs); lines = lines.concat(r.lines);
    });
    return { glyphs, lines, decos, seq: { n: cs.length, starts } };
  } };

  lib.cameraTrack = { n: 'カメラ追従（単語を渡り歩く）', c: '時間演出', f(L, P, rng) {
    const cs = chunks(P, 7);
    const base = L.minD * 0.16;
    const words = []; let glyphs = [], lines = [];
    let cx = 0, cy = 0, dir = 0; // dir: 0 right, 1 down, 2 up
    const starts = []; let acc = 0; const tot = cs.reduce((a, c) => a + c.len + 1.5, 0);
    cs.forEach((c, k) => {
      starts.push(acc / tot); acc += c.len + 1.5;
      const sc = [1, 0.62, 1.35, 0.8, 1.15][k % 5];
      const f = T.fit(c.P, { font: L.font, w: 1e6, h: base * sc * 1.25, lh: 1.1, track: L.track, maxLines: 1 });
      const pl = T.place(f, 0, 0, 'center', { lh: 1.1 });
      const w = pl.w, h = pl.h;
      const rot = k === 0 ? 0 : [0, -PI / 2, 0, PI / 2][k % 4];
      // position relative to previous word
      if (k > 0) {
        const pw = words[k - 1];
        const gap = base * 0.12;
        if (rot === 0) { cy = pw.cy + (pw.rot === 0 ? pw.h / 2 : pw.w / 2) + h / 2 + gap; cx = pw.cx + (rng() - 0.3) * pw.w * 0.3; }
        else { cx = pw.cx + (pw.rot === 0 ? pw.w / 2 : pw.h / 2) + h / 2 + gap; cy = pw.cy - (rot < 0 ? -1 : 1) * 0 + (rng() - 0.5) * base * 0.3; }
      }
      const cs2 = Math.cos(rot), sn = Math.sin(rot);
      pl.glyphs.forEach((g) => { const x = g.x, y = g.y; g.x = cx + x * cs2 - y * sn; g.y = cy + x * sn + y * cs2; g.rot = (g.rot || 0) + rot; g.seq = k; g.line += k * 10; if (k % 3 === 1) g.col = 'accent'; });
      words.push({ cx, cy, w, h, rot });
      glyphs = glyphs.concat(pl.glyphs);
    });
    return { glyphs, lines, seq: { n: cs.length, starts, keep: true }, track: { words } };
  } };

  lib.bigCrop = { n: '巨大文字（はみ出し）', c: '時間演出', f(L, P) {
    // intentionally oversized type bleeding off-frame, slowly panning (fashion MV look)
    const r = L0.block(L, P, { cx: L.W / 2, cy: L.cy, w: L.W * 1.9, h: L.H * 1.25 }, { maxLines: 2, lh: 0.95, noGrow: true });
    return { glyphs: r.glyphs, lines: r.lines, drift: 0.06, bleed: true };
  } };
})();
