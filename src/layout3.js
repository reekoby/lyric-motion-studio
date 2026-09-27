/* Edge layouts (ref: Motion Array kinetic typography): rotating text rings, diamond text tunnel,
 * full-screen repeat stack, card deck carousel, brutalist meta poster, typographic tile wall */
'use strict';
(() => {
  const L0 = LM.layout, lib = L0.lib, block = L0.block, bbox = L0.bbox;
  const { clamp, lerp, hash, mix } = LM.U;
  const E = LM.E, PI = Math.PI, TAU = PI * 2;
  const wrap = (v, m) => ((v % m) + m) % m;
  const plain = (P) => (P.plain || P.segments.map((s) => s.map((t) => t.gs.map((g) => g.ch).join('')).join('')).join(' ')).replace(/\s+/g, ' ').trim();
  const words = (P) => { const o = []; P.segments.forEach((s) => s.forEach((t) => { if (!t.space) o.push(t.gs.map((g) => g.ch).join('')); })); return o; };
  const fontAt = (tmpl, size) => tmpl.replace('{S}', size.toFixed(2));
  const tempo = (r) => (r && r.tempo ? r.tempo() : 1);

  // text laid along a circle, glyph by glyph
  function ringText(ctx, cx, cy, R, txt, font, size, a0, dir) {
    ctx.font = fontAt(font, size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const unit = txt + '  ・  ';
    const uw = ctx.measureText(unit).width; if (uw < 1) return;
    const reps = Math.max(1, Math.floor((TAU * R) / uw));
    const s = unit.repeat(reps), k = (TAU * R) / (uw * reps); // stretch so the ring closes
    let acc = 0;
    for (const ch of Array.from(s)) {
      const w = ctx.measureText(ch).width * k, a = a0 + (acc + w / 2) / R * dir;
      acc += w;
      ctx.save(); ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.rotate(a + (dir > 0 ? PI / 2 : -PI / 2)); ctx.fillText(ch, 0, 0); ctx.restore();
    }
  }
  // text running along a straight edge (repeated, scrolling)
  function edgeText(ctx, x0, y0, x1, y1, txt, font, size, off) {
    const len = Math.hypot(x1 - x0, y1 - y0); if (len < 2) return;
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
    ctx.beginPath(); ctx.rect(0, -size, len, size * 2); ctx.clip();
    ctx.font = fontAt(font, size); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const unit = txt + '   '; const uw = Math.max(1, ctx.measureText(unit).width);
    for (let x = -wrap(off, uw); x < len; x += uw) ctx.fillText(unit, x, 0);
    ctx.restore();
  }

  lib.textRings = { n: '円環リピート（回転する文字の輪）', c: 'エッジ', f(L, P) {
    const md = L.minD;
    const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: md * 0.5, h: md * 0.3 }, { maxLines: 3 });
    const b = bbox(r.glyphs), txt = plain(P), font = L.font;
    const R1 = Math.max(b.w, b.h) * 0.5 + md * 0.09, R2 = R1 + md * 0.11;
    return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'fn', f(ctx, D) {
      const q = E.outCubic(clamp(D.pe * 1.2)), sp = tempo(D.r);
      ctx.globalAlpha *= q;
      ctx.fillStyle = D.pal.accent; ringText(ctx, L.W / 2, L.cy, R1, txt, font, md * 0.05, -PI / 2 + D.t * 0.35 * sp + (1 - q) * 2, 1);
      ctx.fillStyle = D.pal.sub; ringText(ctx, L.W / 2, L.cy, R2 * lerp(1.4, 1, q), txt, font, md * 0.066, -PI / 2 - D.t * 0.22 * sp - (1 - q) * 2, -1);
      ctx.strokeStyle = D.pal.text; ctx.globalAlpha *= 0.35; ctx.lineWidth = D.S * 1.5;
      ctx.beginPath(); ctx.arc(L.W / 2, L.cy, (R1 + R2) / 2 * lerp(1.4, 1, q), 0, TAU); ctx.stroke();
    } }] };
  } };

  lib.diamondTunnel = { n: '角トンネル（文字の菱形が迫る）', c: 'エッジ', f(L, P) {
    const md = L.minD;
    const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: md * 0.44, h: md * 0.26 }, { maxLines: 3 });
    const b = bbox(r.glyphs), txt = plain(P), font = L.font, cx = L.W / 2, cy = L.cy;
    const s0 = (b.w + b.h) * 0.5 * 0.78 + md * 0.04, far = Math.hypot(L.W, L.H);
    return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'fn', f(ctx, D) {
      const q = E.outCubic(clamp(D.pe * 1.3)), sp = tempo(D.r), ph = (D.t * 0.32 * sp) % 1;
      for (let k = 7; k >= 0; k--) {
        const s = s0 * Math.pow(1.5, k + ph) * lerp(0.4, 1, q);
        if (s > far * 1.1) continue;
        const size = s * 0.13, a = clamp((far * 1.1 - s) / (far * 0.5)) * q;
        ctx.save(); ctx.globalAlpha *= a;
        ctx.fillStyle = k % 2 ? D.pal.sub : D.pal.accent;
        const pts = [[cx, cy - s], [cx + s, cy], [cx, cy + s], [cx - s, cy]];
        const off = D.t * (60 + k * 12) * D.S * sp * (k % 2 ? 1 : -1);
        for (let j = 0; j < 4; j++) { const A = pts[j], B = pts[(j + 1) % 4]; edgeText(ctx, A[0], A[1], B[0], B[1], txt, font, size, off); }
        ctx.restore();
      }
    } }] };
  } };

  lib.fullStack = { n: '反復フルスタック（全画面に積層）', c: 'エッジ', f(L, P) {
    const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.92, h: L.safe.h * 0.2 }, { maxLines: 1 });
    const b = bbox(r.glyphs), txt = plain(P), font = L.font, size = r.glyphs[0] ? r.glyphs[0].size : L.minD * 0.1;
    const step = b.h * 1.04, n = Math.ceil(L.H / 2 / step) + 1;
    return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'fn', f(ctx, D) {
      ctx.font = fontAt(font, size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = Math.max(1, size * 0.028); ctx.lineJoin = 'round';
      const hi = Math.floor(D.t * 6 * tempo(D.r)) % (n * 2);
      for (let k = 1; k <= n; k++) for (const sg of [-1, 1]) {
        const vis = clamp(D.pe * (n + 2) - k); if (vis <= 0) continue;
        const y = L.cy + sg * k * step, idx = sg > 0 ? n + k - 1 : k - 1, on = idx === hi;
        ctx.globalAlpha = vis * (on ? 1 : 0.9 - k * 0.08);
        if (on) { ctx.fillStyle = D.pal.accent; ctx.fillText(txt, L.W / 2, y); }
        else if (k % 2) { ctx.strokeStyle = D.pal.text; ctx.strokeText(txt, L.W / 2, y); }
        else { ctx.fillStyle = D.pal.sub; ctx.fillText(txt, L.W / 2, y); }
      }
    } }] };
  } };

  lib.cardDeck = { n: 'カードデッキ（スライドするカード）', c: 'エッジ', f(L, P) {
    const md = L.minD, cw = Math.min(L.safe.w * 0.5, md * 0.66), ch = cw;
    const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: cw * 0.8, h: ch * 0.72 }, { maxLines: 4 });
    r.glyphs.forEach((g) => (g.on = 'accent'));
    const txt = plain(P), font = L.font;
    const rr = (ctx, x, y, w, h, rad) => { ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); };
    return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'fn', f(ctx, D) {
      const q = E.outExpo(clamp(D.pe * 1.1)), slide = (1 - q) * L.W * 0.7, drift = Math.sin(D.t * 0.6) * md * 0.01;
      const x0 = L.W / 2 - cw / 2, y0 = L.cy - ch / 2;
      [-1, 1].forEach((sg, j) => {
        const sw = cw * 0.78, sx = L.W / 2 + sg * (cw * 0.5 + sw * 0.5 + md * 0.035) - sw / 2 + slide * 0.6 + drift * sg, sy = L.cy - sw / 2;
        ctx.save(); ctx.globalAlpha *= 0.95; ctx.fillStyle = j ? D.pal.sub : mix(D.pal.sub, D.pal.bg, 0.45); rr(ctx, sx, sy, sw, sw, md * 0.014); ctx.fill(); ctx.clip();
        ctx.fillStyle = j ? D.pal.bg : D.pal.bg; ctx.globalAlpha *= 0.55; ctx.font = fontAt(font, sw * 0.16); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        for (let k = 0; k < 7; k++) ctx.fillText(txt, sx + sw * 0.06 - wrap(D.t * 20 * D.S * (k % 2 ? 1 : -1), sw), sy + sw * 0.05 + k * sw * 0.15);
        ctx.restore();
      });
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = md * 0.03; ctx.shadowOffsetY = md * 0.01;
      ctx.fillStyle = D.pal.accent; rr(ctx, x0 + slide, y0, cw, ch, md * 0.018); ctx.fill(); ctx.restore();
    } }] };
  } };

  lib.metaPoster = { n: 'ブルータル誌面（メタ情報つき）', c: 'エッジ', f(L, P) {
    const md = L.minD, land = L.W > L.H;
    const bw = L.safe.w * (land ? 0.66 : 0.9);
    const r = block(L, P, { cx: L.safe.x + bw / 2, cy: L.cy + (land ? 0 : md * 0.05), w: bw, h: L.safe.h * 0.5 }, { align: 'left', lh: 1.02, maxLines: 4 });
    const b = bbox(r.glyphs), font = L.font, num = String((hash(plain(P).length, 7, 3) * 90 | 0) + 10);
    const cR = Math.min(md * 0.2, b.h * 0.9), ccx = Math.min(L.safe.x + L.safe.w - cR, b.x + b.w + cR * 0.35), ccy = b.y + cR * 0.3;
    return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'fn', f(ctx, D) {
      const q = E.outExpo(clamp(D.pe * 1.2)), S = D.S, pal = D.pal, sm = md * 0.022;
      const title = ((D.r && D.r.p && D.r.p.title) || 'LYRIC MOTION').toUpperCase();
      // red disc behind
      ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.arc(ccx, ccy, cR * E.outBack(clamp(D.pe * 1.4)), 0, TAU); ctx.fill();
      // rotating circular badge
      ctx.fillStyle = pal.text; ctx.globalAlpha *= q; ringText(ctx, ccx, ccy, cR * 1.28, '● ' + title + ' ● ' + num, font, sm * 0.8, D.t * 0.5, 1);
      // meta text
      ctx.font = fontAt(font, sm); ctx.textBaseline = 'top'; ctx.fillStyle = pal.text;
      ctx.textAlign = 'left'; ctx.fillText('NO.' + num, L.safe.x, L.safe.y);
      ctx.textAlign = 'right'; const tc = D.t; ctx.fillText(`${String(Math.floor(tc / 60)).padStart(2, '0')}:${String(Math.floor(tc % 60)).padStart(2, '0')}:${String(Math.floor((tc % 1) * 30)).padStart(2, '0')}`, L.safe.x + L.safe.w, L.safe.y);
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(title + '  —  LYRIC VIDEO', L.safe.x, L.safe.y + L.safe.h);
      // rules
      ctx.fillRect(L.safe.x, L.safe.y + sm * 1.6, L.safe.w * q, Math.max(1, S * 1.5));
      ctx.fillRect(b.x, b.y + b.h + md * 0.03, b.w * q, Math.max(2, S * 4));
      // barcode
      const bx = L.safe.x + L.safe.w - md * 0.18, by = L.safe.y + L.safe.h - md * 0.06;
      for (let i = 0; i < 26; i++) { const w = S * (1 + hash(i, 4) * 3.5); ctx.fillRect(bx + i * md * 0.0068, by, w, md * 0.05 * q); }
      // crosshairs + arrow
      ctx.strokeStyle = pal.text; ctx.lineWidth = Math.max(1, S * 1.4);
      [[L.safe.x + md * 0.02, L.cy], [L.safe.x + L.safe.w - md * 0.02, L.cy], [L.W / 2, L.safe.y + md * 0.06]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - sm * 0.6, y); ctx.lineTo(x + sm * 0.6, y); ctx.moveTo(x, y - sm * 0.6); ctx.lineTo(x, y + sm * 0.6); ctx.stroke(); });
      ctx.font = fontAt(font, sm * 2.2); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = pal.accent; ctx.fillText('↗', b.x + b.w + sm * 0.4, b.y + sm * 2.4);
    } }] };
  } };

  lib.tileWall = { n: 'タイポタイル（単語の壁紙）', c: 'エッジ', f(L, P) {
    const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.74, h: L.safe.h * 0.32 }, { maxLines: 2 });
    const b = bbox(r.glyphs), font = L.font, ws = words(P);
    const word = (ws.slice().sort((a, c) => c.length - a.length).find((w) => w.length <= 8) || ws[0] || '').trim();
    const pad = L.minD * 0.035, size = L.minD * 0.11;
    return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'fn', f(ctx, D) {
      ctx.font = fontAt(font, size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = Math.max(1, size * 0.03);
      const cw = ctx.measureText(word).width + size * 0.6, chh = size * 1.25, q = clamp(D.pe * 1.5);
      const ox = wrap(D.t * 40 * D.S * tempo(D.r), cw), oy = wrap(D.t * 18 * D.S * tempo(D.r), chh * 2);
      let j = 0;
      for (let y = -chh * 2 + oy; y < L.H + chh; y += chh, j++) {
        const shift = (j % 2) * cw * 0.5;
        let i = 0;
        for (let x = -cw + ox * (j % 2 ? -1 : 1) + shift; x < L.W + cw; x += cw, i++) {
          const kind = (i + j * 2) % 3;
          ctx.globalAlpha = q * (kind === 0 ? 0.8 : 0.45);
          if (kind === 0) { ctx.fillStyle = D.pal.accent; ctx.fillText(word, x, y); }
          else if (kind === 1) { ctx.strokeStyle = D.pal.text; ctx.strokeText(word, x, y); }
          else { ctx.fillStyle = D.pal.sub; ctx.fillText(word, x, y); }
        }
      }
      ctx.globalAlpha = 1; ctx.fillStyle = D.pal.bg;
      const w = (b.w + pad * 2) * E.outExpo(q); ctx.fillRect(L.W / 2 - w / 2, b.y - pad, w, b.h + pad * 2);
    } }] };
  } };
})();
