/* Japanese-aware typesetting: parsing, kinsoku, balanced line breaking, fitting */
'use strict';
LM.typo = (() => {
  const { graphemes, words } = LM.seg;
  const U = LM.U;
  const NO_START = new Set(Array.from('、。，．・：；？！ゝゞー）」』】〕〉》”’ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々〻‐゠–〜～?!,.:;)]}…‥・°%»›'));
  const NO_END = new Set(Array.from('（「『【〔〈《“‘([{#＃$＄¿¡«‹'));
  const SMALL_KANA = new Set(Array.from('ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ'));
  const PUNCT_VERT = new Set(Array.from('、。，．'));
  const ROTATE_VERT = new Set(Array.from('ー―—‐–〜～…‥（）「」『』【】〔〕〈〉《》()[]{}<>＝=:：;；→←'));
  const reHira = /^[぀-ゟ]+$/;
  const reKanjiKata = /[一-鿿゠-ヿ㐀-䶿]/;
  const reKanjiOnly = /[一-鿿㐀-䶿々〆ヵヶ]/;
  const reLatin = /[A-Za-z0-9À-ɏ]/;
  const reSpace = /^\s+$/;
  const reWordish = /[\p{L}\p{N}]/u;

  const isLatinG = (ch) => reLatin.test(ch) && ch.length <= 2 && !/[　-鿿]/.test(ch);
  // character classes for mixed Japanese / Latin setting
  const reAsciiPunct = /^[!-/:-@\[-`{-~¿¡«»‹›]$/;               // ASCII punctuation & symbols
  const reCurly = /^[‘’“”]$/;
  const reCJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ々〆〤]/;
  const reHangul = /[ᄀ-ᇿ㄰-㆏가-힯ꥠ-꥿ힰ-퟿]/;
  const JP_OPEN = new Set(Array.from('「『（【〔〈《［｛〘〖'));
  const JP_CLOSE = new Set(Array.from('」』）】〕〉》］｝〙〗、。，．'));
  const isLatinLetter = (ch) => isLatinG(ch);
  // Latin-font glyph? (letters, digits, ASCII punct; curly quotes are decided by context in classify)
  const isLatinCh = (ch) => isLatinG(ch) || reAsciiPunct.test(ch) || ch === '…' || ch === '–';
  const OPT0 = { latin: null, korean: null, latinScale: 1, wakan: true, yakumono: true, latinTrack: 0, wordSpace: 1, wakanGap: 25, yakuAmt: 1 };
  let OPT = Object.assign({}, OPT0);
  const setOpts = (o) => { OPT = Object.assign({}, OPT0, o || {}); };
  // mark each glyph: cls J (CJK) / L (Latin letter/digit) / P (Latin punct) / JP (Japanese punct) / S (space); quote role for straight quotes
  function classify(gl) {
    const n = gl.length;
    const isWordish = (g) => g && (isLatinLetter(g.ch) || reCJK.test(g.ch) || reHangul.test(g.ch));
    const nearLatin = (i, dir) => { for (let k = i + dir; k >= 0 && k < n; k += dir) { const c = gl[k].ch; if (reSpace.test(c)) continue; if (isLatinLetter(c)) return true; if (reCJK.test(c) || reHangul.test(c)) return false; } return false; };
    for (let i = 0; i < n; i++) {
      const g = gl[i], ch = g.ch;
      if (reSpace.test(ch)) g.cls = 'S';
      else if (isLatinLetter(ch)) g.cls = 'L';
      else if (reHangul.test(ch)) g.cls = 'K';
      else if (reAsciiPunct.test(ch) || ch === '…') g.cls = 'P';
      else if (reCurly.test(ch)) g.cls = nearLatin(i, 1) || nearLatin(i, -1) ? 'P' : 'JP';
      else if (JP_OPEN.has(ch) || JP_CLOSE.has(ch) || /[・：；！？ー〜～]/.test(ch)) g.cls = 'JP';
      else g.cls = 'J';
      // opening / closing role for quotes
      if (ch === '"' || ch === "'" || reCurly.test(ch)) {
        const prev = gl[i - 1], next = gl[i + 1];
        const pw = isWordish(prev) || (prev && /[.,!?…)\]]/.test(prev.ch)), nw = isWordish(next);
        if (ch === '“' || ch === '‘') g.q = 'open';
        else if (ch === '”' || (ch === '’' && pw)) g.q = 'close';
        else g.q = pw && !nw ? 'close' : !pw && nw ? 'open' : pw ? 'close' : 'open';
        // typographic quotes in Latin runs: I'm → I’m, "go" → “go”
        if (OPT.smartQuotes !== false && g.cls === 'P') { if (ch === "'") g.ch = g.q === 'open' ? '‘' : '’'; else if (ch === '"') g.ch = g.q === 'open' ? '“' : '”'; }
      }
    }
  }

  /* parse "*強調*" and "/" manual breaks */
  function parse(raw) {
    raw = String(raw || '').replace(/\r/g, '');
    const gsAll = graphemes(raw);
    const segs = [[]];
    let emph = false, anyEmph = false, bar = -1, rubyBuf = null, rid = 0, hasRuby = false;
    for (const ch of gsAll) {
      const seg = segs[segs.length - 1];
      if (rubyBuf != null) {
        if (ch === '》' || ch === ')' && false) {
          // attach ruby to base: explicit |base or trailing kanji run
          let from = bar >= 0 ? bar : seg.length;
          if (bar < 0) while (from > 0 && reKanjiOnly.test(seg[from - 1].ch)) from--;
          if (from < seg.length && rubyBuf) { const rb = { id: ++rid, text: rubyBuf }; for (let i = from; i < seg.length; i++) seg[i].rb = rb; hasRuby = true; }
          rubyBuf = null; bar = -1; continue;
        }
        rubyBuf += ch; continue;
      }
      if (ch === '《') { rubyBuf = ''; continue; }
      if (ch === '|' || ch === '｜') { bar = seg.length; continue; }
      if (ch === '*') { emph = !emph; continue; }
      if (ch === '/' || ch === '\n') { segs.push([]); bar = -1; continue; }
      seg.push({ ch, emph });
      if (emph) anyEmph = true;
    }
    const segments = segs.filter((s) => s.length).map((gl) => tokenize(gl));
    const plain = segs.map((s) => s.map((g) => g.ch).join('')).join('');
    // auto key token: longest content token (kanji/katakana/latin)
    if (!anyEmph) {
      let best = null, bl = 0;
      segments.forEach((toks) => toks.forEach((tk) => {
        const t = tk.gs.map((g) => g.ch).join('');
        const content = t.replace(/[぀-ゟ\s、。！？!?,.「」]/g, '');
        const l = Array.from(content).length + (reKanjiKata.test(t) ? 0.5 : 0);
        if (l > bl) (bl = l), (best = tk);
      }));
      if (best) best.gs.forEach((g) => (g.key = true));
    }
    const units = segments.reduce((a, s) => a + s.reduce((b, t) => b + t.gs.reduce((u, g) => u + (g.cls === 'L' ? 0.45 : g.cls === 'P' || g.cls === 'S' ? 0.3 : 1), 0), 0), 0);
    return { segments, plain, anyEmph, hasRuby, units, count: segments.reduce((a, s) => a + s.reduce((b, t) => b + t.gs.length, 0), 0) };
  }

  function tokenize(gl) {
    classify(gl);
    const text = gl.map((g) => g.ch).join('');
    const ws = words(text);
    const toks = [];
    let gi = 0;
    for (const w of ws) {
      const n = graphemes(w).length;
      const gs = gl.slice(gi, gi + n);
      gi += n;
      if (!gs.length) continue;
      toks.push({ gs, space: reSpace.test(w) });
    }
    if (gi < gl.length) toks.push({ gs: gl.slice(gi), space: false });
    // merge rules
    const out = [];
    for (const tk of toks) {
      const prev = out[out.length - 1];
      const first = tk.gs[0].ch, t = tk.gs.map((g) => g.ch).join('');
      if (prev && !prev.space && !tk.space) {
        const ptxt = prev.gs.map((g) => g.ch).join('');
        const plast = prev.gs[prev.gs.length - 1].ch;
        const prevLen = prev.gs.length;
        const fq = tk.gs[0].q, lq = prev.gs[prev.gs.length - 1].q;
        if (fq === 'close' || lq === 'open' || (NO_START.has(first) && fq !== 'open') || (NO_END.has(plast) && lq !== 'close') ||
          (reHira.test(t) && tk.gs.length <= 3 && prevLen <= 7 && (reKanjiKata.test(ptxt) || reHira.test(ptxt) && prevLen <= 2)) ||
          (!reWordish.test(t) && tk.gs.length <= 2 && fq !== 'open' && !NO_END.has(first))) {
          prev.gs = prev.gs.concat(tk.gs);
          continue;
        }
      }
      out.push({ gs: tk.gs.slice(), space: tk.space });
    }
    return out;
  }

  /* measurement cache @100px */
  const mc = document.createElement('canvas').getContext('2d');
  const cache = new Map();
  function adv(ch, font) {
    const k = font + '\u0001' + ch;
    let v = cache.get(k);
    if (v == null) {
      mc.font = font.replace('{S}', '100');
      v = mc.measureText(ch).width;
      if (ch === '　') v = Math.max(v, 100);
      else if (ch === ' ' && !(v > 8)) v = 22;
      cache.set(k, v);
    }
    return v;
  }
  // font metrics @100px (textBaseline middle): alphabetic baseline, cap height, ideographic centre
  const mcache = new Map();
  function metrics(font) {
    let m = mcache.get(font);
    if (m) return m;
    mc.font = font.replace('{S}', '100'); mc.textBaseline = 'middle';
    const H = mc.measureText('H'), K = mc.measureText('漢'), G = mc.measureText('한'), XH = mc.measureText('x');
    const al = -(H.alphabeticBaseline || 0); // px below the middle line
    m = { al, xh: al + (XH.actualBoundingBoxAscent || 0), cap: al + (H.actualBoundingBoxAscent || 0), mid: ((K.actualBoundingBoxDescent || 0) - (K.actualBoundingBoxAscent || 0)) / 2, hmid: ((G.actualBoundingBoxDescent || 0) - (G.actualBoundingBoxAscent || 0)) / 2 };
    mc.textBaseline = 'alphabetic';
    if (!(m.cap > 20)) m.cap = 70;
    mcache.set(font, m);
    return m;
  }
  const clearCache = () => { cache.clear(); mcache.clear(); };

  /* Balanced breaking of a token list into m lines minimizing max width (DP) */
  function breakTokens(toks, widths, m) {
    const T = toks.length;
    if (m <= 1 || T <= 1) return [[0, T]];
    m = Math.min(m, T);
    const pre = [0];
    for (let i = 0; i < T; i++) pre.push(pre[i] + widths[i]);
    const lineW = (a, b) => {
      // trim spaces
      while (a < b && toks[a].space) a++;
      while (b > a && toks[b - 1].space) b--;
      return pre[b] - pre[a];
    };
    const cnt = (a, b) => {
      let c = 0;
      for (let i = a; i < b; i++) if (!toks[i].space) c += toks[i].gs.length;
      return c;
    };
    const cost = (a, b) => {
      const w = lineW(a, b), c = cnt(a, b);
      if (c === 0) return 1e9;
      let pen = w;
      if (c === 1) pen *= 1.9; // orphan penalty
      else if (c === 2) pen *= 1.15;
      return pen;
    };
    // dp[k][i] = min over j of max(dp[k-1][j], cost(j,i))
    const INF = 1e12;
    const dp = Array.from({ length: m + 1 }, () => new Float64Array(T + 1).fill(INF));
    const bk = Array.from({ length: m + 1 }, () => new Int32Array(T + 1).fill(-1));
    const sq = Array.from({ length: m + 1 }, () => new Float64Array(T + 1).fill(INF));
    dp[0][0] = 0; sq[0][0] = 0;
    for (let k = 1; k <= m; k++) {
      for (let i = 1; i <= T; i++) {
        for (let j = k - 1; j < i; j++) {
          if (dp[k - 1][j] >= INF) continue;
          const c = cost(j, i);
          const v = Math.max(dp[k - 1][j], c);
          const s = sq[k - 1][j] + c * c;
          if (v < dp[k][i] - 1e-6 || (Math.abs(v - dp[k][i]) < 1e-6 && s < sq[k][i])) {
            dp[k][i] = v; sq[k][i] = s; bk[k][i] = j;
          }
        }
      }
    }
    const ranges = [];
    let i = T;
    for (let k = m; k >= 1; k--) {
      const j = bk[k][i];
      if (j < 0) return [[0, T]];
      ranges.unshift([j, i]);
      i = j;
    }
    return ranges;
  }

  /*
   * Fit parsed text into box. opts: {font:"...{S}px...", w,h, lh, track(em), maxLines, emphScale, vertical, minLines, maxSize}
   * returns {size, lines:[{gs:[{ch,emph,key,w100,scale}], w, h}], k}
   */
  function fit(parsed, o) {
    const font = o.font, lh = (o.lh || 1.22) + (parsed.hasRuby && !o.vertical ? 0.28 : 0), track = o.track || 0, es = o.emphScale || 1;
    const vertical = !!o.vertical;
    const kor = o.korean !== undefined ? o.korean : OPT.korean;
    const lat = o.latin !== undefined ? o.latin : OPT.latin, lsc = o.latinScale || OPT.latinScale || 1;
    const wakan = o.wakan !== undefined ? o.wakan : OPT.wakan, yak = !vertical && (o.yakumono !== undefined ? o.yakumono : OPT.yakumono);
    // manual spacing controls: Latin letter-spacing (em), word-space scale, 和欧間 (1/100 em), 約物の詰め (0..1)
    const ltr = (o.latinTrack != null ? o.latinTrack : OPT.latinTrack) || 0, wsp = o.wordSpace || OPT.wordSpace || 1, wkg = o.wakanGap != null ? o.wakanGap : OPT.wakanGap, yam = o.yakuAmt != null ? o.yakuAmt : OPT.yakuAmt;
    const segToks = parsed.segments.map((toks) => {
      const flat = []; toks.forEach((tk) => tk.gs.forEach((g) => flat.push(g)));
      flat.forEach((g, i) => {
        const latinGlyph = g.cls === 'L' || g.cls === 'P';
        g.ft = latinGlyph && lat ? lat : g.cls === 'K' && kor ? kor : null;
        const f = g.ft || font;
        let sc = g.emph || (o.emphKey && g.key) ? es : 1;
        // companion faces: match the main face's cap height (Latin) and sit on its baseline / ideographic centre
        let lk = 1, bs = 0;
        if (g.ft) {
          const M0 = metrics(font), M1 = metrics(g.ft);
          if (latinGlyph) { lk = Math.min(1.14, Math.max(0.9, M0.cap / M1.cap)) * lsc; bs = (M0.al / lk - M1.al) / 100; }
          else { bs = (M0.mid - M1.hmid) / 100; }
        } else if (latinGlyph) lk = lsc === 1 ? 1 : lsc;
        sc *= lk;
        // letter-spacing is for kana/kanji rhythm; inside Latin words it only makes them fall apart
        const nx0 = flat[i + 1];
        const inLat = latinGlyph && nx0 && (nx0.cls === 'L' || nx0.cls === 'P');
        g.tk = latinGlyph ? (inLat ? 0.12 : 0.5) : g.cls === 'S' ? 0.5 : JP_OPEN.has(g.ch) || (nx0 && JP_CLOSE.has(nx0.ch)) ? 0.2 : 1;
        g.tr100 = track * 100 * g.tk + (inLat ? ltr * 100 : 0); // tracking after this glyph, 1/100 em
        g.scale = sc; g.lk = lk; g.bs = bs; g.off = 0; g.gap = 0;
        let a;
        if (vertical) {
          const nx = flat[i + 1];
          if (latinGlyph) {
            // rotated Latin run: kerned like a horizontal word, sitting on the column axis at its optical centre
            a = nx && (nx.cls === 'L' || nx.cls === 'P') && !(g.emph ^ nx.emph) ? adv(g.ch + nx.ch, f) - adv(nx.ch, f) : adv(g.ch, f);
            const Mf = metrics(f); g.bs = -(Mf.al - (Mf.cap + Mf.xh) / 4) / 100;
          } else if (ROTATE_VERT.has(g.ch)) a = adv(g.ch, f);
          else a = 100;
        }
        else {
          const nx = flat[i + 1];
          // pair kerning inside Latin runs (same face): w(ab) - w(b)
          if (latinGlyph && nx && (nx.cls === 'L' || nx.cls === 'P') && !(g.emph ^ nx.emph)) a = adv(g.ch + nx.ch, f) - adv(nx.ch, f);
          else a = adv(g.ch, f);
          // 約物詰め: half-width Japanese brackets / 、。
          if (yak && yam > 0 && g.cls === 'JP') { const cut = 45 * U.clamp(yam, 0, 1); if (JP_OPEN.has(g.ch)) { a = Math.min(a, 100 - cut); g.off = -cut / 2; } else if (JP_CLOSE.has(g.ch)) { a = Math.min(a, 100 - cut); g.off = cut / 2; } }
          // 和欧間: quarter-em between Japanese and Latin letters/digits when no space is typed
          if (wakan && wkg > 0 && nx && ((g.cls === 'J' && nx.cls === 'L') || (g.cls === 'L' && nx.cls === 'J'))) g.gap = /[0-9０-９]/.test(g.cls === 'L' ? g.ch : nx.ch) ? wkg * 0.5 : wkg;
        }
        // word space: natural width of the face that sets the neighbouring words (Latin companion between Latin words),
        // a little tighter at display sizes; next to kana/kanji keep a light quarter-em-ish separator
        if (g.cls === 'S' && g.ch === ' ') {
          const pv = flat[i - 1], nx = flat[i + 1];
          const latL = pv && (pv.cls === 'L' || pv.cls === 'P'), latR = nx && (nx.cls === 'L' || nx.cls === 'P');
          if (latL && latR && lat) { const k = pv.lk || lsc || 1; a = adv(' ', lat) * k * 0.92; }
          else if (latL && latR) a = adv(' ', font) * 0.92;
          else a = vertical ? 35 : Math.min(adv(' ', font), 24);
          a = Math.max(14, Math.min(a, 30)) * U.clamp(wsp, 0.3, 3);
          g.tk = 0.2; g.tr100 = track * 100 * 0.2;
        }
        g.w100 = a;
      });
      return toks.map((tk) => { let w = 0; tk.gs.forEach((g) => { w += (g.w100 + (g.gap || 0) + g.tr100) * g.scale; }); tk.w = w; return tk; });
    });
    const S = segToks.length;
    if (!S) return { size: 10, lines: [], k: 0 };
    const segW = segToks.map((toks) => toks.reduce((a, t) => a + t.w, 0));
    const totalG = parsed.count;
    const maxLines = Math.max(S, Math.min(o.maxLines || 4, totalG));
    const minLines = Math.max(S, o.minLines || 1);
    let best = null;
    for (let k = minLines; k <= maxLines; k++) {
      // distribute k lines among segments
      const alloc = segToks.map(() => 1);
      for (let r = S; r < k; r++) {
        let bi = -1, bv = -1;
        for (let s = 0; s < S; s++) {
          const nonSpace = segToks[s].filter((t) => !t.space).length;
          if (alloc[s] >= nonSpace) continue;
          const v = segW[s] / alloc[s];
          if (v > bv) (bv = v), (bi = s);
        }
        if (bi < 0) break;
        alloc[bi]++;
      }
      const lines = [];
      segToks.forEach((toks, s) => {
        const ranges = breakTokens(toks, toks.map((t) => t.w), alloc[s]);
        ranges.forEach(([a, b]) => {
          let tk = toks.slice(a, b);
          while (tk.length && tk[0].space) tk.shift();
          while (tk.length && tk[tk.length - 1].space) tk.pop();
          const gs = [];
          tk.forEach((t, ti) => t.gs.forEach((g) => gs.push(Object.assign({}, g, { tok: ti, space: t.space }))));
          if (gs.length) lines.push(gs);
        });
      });
      if (!lines.length) continue;
      const lw = lines.map((gs) => gs.reduce((a, g) => a + (g.w100 + (g.gap || 0) + g.tr100) * g.scale, 0) - (gs[gs.length - 1].tr100 || 0) * gs[gs.length - 1].scale - ((gs[gs.length - 1].gap || 0) * gs[gs.length - 1].scale));
      const lhs = lines.map((gs) => Math.max(...gs.map((g) => g.scale)) * lh * 100);
      const maxW = Math.max(...lw), sumH = lhs.reduce((a, b) => a + b, 0) - (lh - 1) * 100 * 0.5;
      const size = Math.min((o.w / maxW) * 100, (o.h / sumH) * 100, o.maxSize || 1e9);
      // balance: penalize ragged lines & orphan lines
      const minW = Math.min(...lw);
      const orphan = lines.some((gs) => gs.filter((g) => !g.space).length === 1 && totalG > 3) ? 0.72 : 1;
      const rag = 0.9 + 0.1 * (minW / maxW);
      const score = size * orphan * rag * (1 - 0.045 * (lines.length - 1)) * (o.preferLines && lines.length === o.preferLines ? 1.12 : 1);
      if (!best || score > best.score) best = { score, size, lines, lw, lhs, k: lines.length };
      if (lines.length < k) break;
    }
    // expand into per-line glyph descriptors (px at chosen size)
    const size = best.size;
    const out = best.lines.map((gs, li) => ({
      gs: gs.map((g, gi) => ({ ch: g.ch, rb: g.rb, emph: !!g.emph, key: !!g.key, scale: g.scale, tok: g.tok, space: g.space, adv: g.w100 * size / 100 * g.scale, sz: size * g.scale, ft: g.ft || null, cls: g.cls, off: (g.off || 0) * size / 100 * g.scale, gap: gi < gs.length - 1 ? (g.gap || 0) * size / 100 * g.scale : 0, latCtx: g.cls === 'P' || g.cls === 'L', tk: g.tk == null ? 1 : g.tk, tr: (g.tr100 || 0) * size / 100 * g.scale, bs: g.bs || 0 })),
      w: best.lw[li] * size / 100,
      h: best.lhs[li] * size / 100,
    }));
    return { size, lines: out, k: out.length, track: track * size };
  }

  /* place fitted lines around (cx,cy) → glyph list. align: 'center'|'left'|'right' */
  function place(fitted, cx, cy, align = 'center', o = {}) {
    const glyphs = [];
    const lh = o.lh || 1.22;
    if (o.vertical) return placeVertical(fitted, cx, cy, align, o);
    const totalH = fitted.lines.reduce((a, l) => a + l.h, 0);
    let y = cy - totalH / 2;
    const maxW = Math.max(...fitted.lines.map((l) => l.w), 1);
    fitted.lines.forEach((L, li) => {
      const lineTop = y;
      const midY = y + L.h / 2;
      let x;
      if (align === 'left') x = cx - maxW / 2;
      else if (align === 'right') x = cx + maxW / 2 - L.w;
      else x = cx - L.w / 2;
      const lineStart = x;
      L.gs.forEach((g) => {
        glyphs.push({ ch: g.ch, x: x + g.adv / 2 + (g.off || 0), y: midY, size: g.sz, w: g.adv, line: li, emph: g.emph, key: g.key, tok: g.tok, space: g.space, rb: g.rb, ft: g.ft, cls: g.cls, bs: g.bs });
        x += g.adv + (g.gap || 0) + (g.tr != null ? g.tr : fitted.track * g.scale);
      });
      L.box = { x: lineStart, y: lineTop, w: L.w, h: L.h, cy: midY };
      y += L.h;
    });
    return { glyphs, lines: fitted.lines.map((l) => l.box), size: fitted.size, w: maxW, h: totalH };
  }

  function placeVertical(fitted, cx, cy, align, o) {
    // fitted with vertical=true: "width" along column (top→bottom), line height = column spacing
    const glyphs = [];
    const lh = o.lh || 1.3;
    const totalW = fitted.lines.reduce((a, l) => a + l.h, 0);
    const maxH = Math.max(...fitted.lines.map((l) => l.w), 1);
    let x = cx + totalW / 2;
    const boxes = [];
    fitted.lines.forEach((L, li) => {
      const colW = L.h;
      const colX = x - colW / 2;
      let y = align === 'left' ? cy - maxH / 2 : cy - L.w / 2; // left = top aligned
      const top = y;
      L.gs.forEach((g) => {
        const s = g.sz;
        let gx = colX, gy = y + g.adv / 2, rot = 0;
        const prevL = L.gs[L.gs.indexOf(g) - 1], nextL = L.gs[L.gs.indexOf(g) + 1];
        const latinRun = g.cls === 'L' || (g.cls === 'P' && ((prevL && prevL.cls === 'L') || (nextL && nextL.cls === 'L')));
        if (isLatinG(g.ch) || ROTATE_VERT.has(g.ch) || latinRun) rot = Math.PI / 2;
        if (SMALL_KANA.has(g.ch)) (gx += s * 0.1), (gy -= s * 0.1);
        if (PUNCT_VERT.has(g.ch) || (!latinRun && (g.ch === ',' || g.ch === '.'))) (gx += s * 0.32), (gy -= s * 0.32);
        glyphs.push({ ch: g.ch, x: gx, y: gy, size: s, w: g.adv, line: li, emph: g.emph, key: g.key, tok: g.tok, space: g.space, rot, rb: g.rb, ft: g.ft, cls: g.cls, bs: g.bs });
        y += g.adv + (g.tr != null ? g.tr : fitted.track * g.scale);
      });
      boxes.push({ x: colX - colW / 2, y: top, w: colW, h: L.w, cy: top + L.w / 2 });
      x -= colW;
    });
    return { glyphs, lines: boxes, size: fitted.size, w: totalW, h: maxH };
  }

  // canonical word list with char ranges (non-space glyph indices) — for word-level timing
  const trCache = new Map();
  function wordRanges(text) {
    let v = trCache.get(text); if (v) return v;
    const P = parse(text); const out = []; let k = 0;
    P.segments.forEach((toks) => toks.forEach((t) => {
      const n = t.gs.filter((g) => !/^\s+$/.test(g.ch)).length; if (!n || t.space) return;
      out.push({ a: k, b: k + n, text: t.gs.map((g) => g.ch).join('') }); k += n;
    }));
    v = { list: out, n: k }; trCache.set(text, v); if (trCache.size > 800) trCache.delete(trCache.keys().next().value);
    return v;
  }
  return { parse, fit, place, adv, metrics, clearCache, isLatinG, isLatinCh, setOpts, classify, words: wordRanges };
})();
