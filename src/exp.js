/* Effect catalogue phase 6d — more experiments (§25 EX-04 / EX-15 / EX-23 / EX-14).
 *  - typeface morph: each letter's outline in two typefaces is turned into a signed distance field and the fields
 *    are blended, so the shape flows from one face into the other (a non-neural take on latent font interpolation)
 *  - generative art from the sound: the song's key, mood, intensity, sections, kicks and spectrum choose and drive
 *    a family of spirograph / rose curves — every section of every song draws a different figure
 *  - user GLSL: a fragment the user writes runs over the whole frame (WebGL1, so loops have fixed bounds)
 *  - pointer interaction (preview only): letters get out of the way of the cursor / finger and ripple. */
'use strict';
(() => {
  const U = LM.U, { clamp, lerp, hash, rgba, mix } = U, M = LM.motion, E = LM.E, PI = Math.PI, TAU = PI * 2;

  /* ================= typeface morph (EX-04) ================= */
  // Felzenszwalb–Huttenlocher squared Euclidean distance transform
  function edt1(f, n, d, v, z) {
    let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
    for (let q = 1; q < n; q++) { let s; do { const r = v[k]; s = (f[q] + q * q - (f[r] + r * r)) / (2 * q - 2 * r); } while (s <= z[k] && --k >= 0); k++; v[k] = q; z[k] = s; z[k + 1] = 1e20; }
    k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; }
  }
  function edt(inside, w, h, want) {
    const INF = 1e20, g = new Float64Array(w * h), f = new Float64Array(Math.max(w, h)), d = new Float64Array(Math.max(w, h)), v = new Int32Array(Math.max(w, h)), z = new Float64Array(Math.max(w, h) + 1);
    for (let i = 0; i < w * h; i++) g[i] = inside[i] === want ? 0 : INF;
    for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; edt1(f, h, d, v, z); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; edt1(f, w, d, v, z); for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x]); }
    return g;
  }
  const SC = new Map(), mc = document.createElement('canvas'), mx = mc.getContext('2d', { willReadFrequently: true });
  function sdfOf(ch, font, n) {
    const key = ch + '|' + font + '|' + n; let r = SC.get(key); if (r) return r;
    mc.width = n; mc.height = n; mx.clearRect(0, 0, n, n); mx.font = font; mx.textAlign = 'center'; mx.textBaseline = 'middle'; mx.fillStyle = '#000'; mx.fillText(ch, n / 2, n / 2);
    const a = mx.getImageData(0, 0, n, n).data, ins = new Uint8Array(n * n); for (let i = 0; i < n * n; i++) ins[i] = a[i * 4 + 3] > 127 ? 1 : 0;
    const dOut = edt(ins, n, n, 1), dIn = edt(ins, n, n, 0), sd = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) sd[i] = ins[i] ? -(dIn[i] - 0.5) : dOut[i] - 0.5;
    if (SC.size > 400) SC.clear(); SC.set(key, (r = sd)); return r;
  }
  const altFace = (font) => { const m = /^(.*?\d+(?:\.\d+)?px)\s*(.*)$/.exec(font); if (!m) return font; const serif = /serif/i.test(m[2]) && !/sans/i.test(m[2]); return m[1].replace(/^\s*\d{3}\s/, serif ? '900 ' : '300 ') + (serif ? ' "Arial Black", "Hiragino Sans", sans-serif' : ' "Times New Roman", "Hiragino Mincho ProN", "Yu Mincho", serif'); };
  const MC = new Map();
  function morphPaint(ctx, X) {
    const { T, size, col, draw, ch } = X, q = clamp(T.pd.q, 0, 1);
    if (q >= 0.995 || !ch.trim()) { draw(); return; }
    const n = Math.max(24, Math.min(144, Math.round(size * 1.5))), fA = altFace(ctx.font), A = sdfOf(ch, fA, n), B = sdfOf(ch, ctx.font, n), qs = Math.round(q * 32) / 32;
    const key = ch + '|' + ctx.font + '|' + n + '|' + qs + '|' + col; let cv = MC.get(key);
    if (!cv) {
      cv = document.createElement('canvas'); cv.width = n; cv.height = n; const x = cv.getContext('2d'), im = x.createImageData(n, n), D = im.data, [r, g, b] = U.hex2rgb(U.isHex(col) ? col : '#ffffff'), e = E.inOutCubic(qs);
      for (let i = 0; i < n * n; i++) { const d = A[i] * (1 - e) + B[i] * e, al = clamp(0.5 - d, 0, 1); D[i * 4] = r; D[i * 4 + 1] = g; D[i * 4 + 2] = b; D[i * 4 + 3] = al * 255; }
      x.putImageData(im, 0, 0); if (MC.size > 900) MC.clear(); MC.set(key, cv);
    }
    ctx.drawImage(cv, -n / 2, -n / 2);
  }
  if (LM.glyphPaint) LM.glyphPaint.morphFace = morphPaint;
  const cat = '実験';
  Object.assign(M.enter, {
    faceMorph: { n: '書体が溶けるように変わって定まる', c: cat, d: 1.2, st: 0.4, f: (p) => (p <= 0 ? { a: 0 } : { paint: morphPaint, pd: { q: E.inOutSine(p) }, a: clamp(p * 4, 0, 1) }) },
  });
  Object.assign(M.hold, {
    faceBreath: { n: '書体が呼吸するように行き来する', c: cat, f: (ht, g, C) => { const q = 0.5 + 0.5 * Math.cos(C.tAbs * 1.6 * (C.amp || 1) - (g.k || 0) * 0.35); return { paint: morphPaint, pd: { q: 0.25 + 0.75 * q } }; } },
  });

  /* ================= generative art from the sound (EX-15) ================= */
  LM.bgm.lib.audioGenArt = { n: '音から生まれる幾何学（曲ごとに変わる）', c: 'オーディオ', full: false, au: true, spec: true, f: (ctx, R) => {
    const a = R.au || {}, F = LM.audio && LM.audio.feat, t = a.t != null ? a.t : R.t, pal = R.pal;
    // the figure's genes: song key, section, mood and intensity
    const key = F && F.key ? F.key.root : 0, minor = F && F.key && F.key.mode === 'minor', secs = (LM.audio && LM.audio.analysis && LM.audio.analysis.sections) || [];
    let si = 0; for (let i = 0; i < secs.length; i++) if (t >= secs[i].t0) si = i;
    const sd = key * 7 + si * 13 + (minor ? 3 : 0), fam = sd % 3, kk = 2 + (sd % 5), aro = a.arousal == null ? 0.5 : a.arousal, sp = a.spec, cx = R.W / 2, cy = R.H / 2, rad = R.minD * (0.36 + aro * 0.08) * (1 + (a.kick || 0) * 0.05);
    const band = (u) => (sp ? sp[Math.min(63, Math.floor(u * 50) + 2)] : 0.4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
    const layers = 3;
    for (let L = 0; L < layers; L++) {
      const col = [pal.accent, pal.sub || pal.accent, pal.text][L], ph = t * (0.12 + L * 0.05) * (L % 2 ? -1 : 1) + L * 1.3, N = 900;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const u = i / N, th = u * TAU * (fam === 1 ? 7 : 1); let r, x, y;
        if (fam === 0) { r = Math.cos(kk * th + ph) * (0.75 + 0.25 * band(u)); x = Math.cos(th + ph * 0.3) * r; y = Math.sin(th + ph * 0.3) * r; } // rose
        else if (fam === 1) { const Rr = 1, rr = (kk + L) / (kk * 2 + 3), d = 0.55 + aro * 0.35; x = (Rr - rr) * Math.cos(th + ph) + d * rr * Math.cos(((Rr - rr) / rr) * th - ph); y = (Rr - rr) * Math.sin(th + ph) - d * rr * Math.sin(((Rr - rr) / rr) * th - ph); r = 1; } // spirograph
        else { const m = kk + L, w = 1 + 0.12 * Math.sin(m * th * 2 + ph * 3) + 0.18 * band(u); x = Math.cos(th) * w * Math.cos(ph * 0.5 + u * PI * 2 * (L + 1) / layers) ; y = Math.sin(th) * w; } // lissajous ring
        const s = rad * (1 - L * 0.16), X = cx + x * s, Y = cy + y * s * (fam === 2 ? 0.9 : 1);
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      }
      ctx.strokeStyle = col; ctx.globalAlpha = 0.16 * (R.amt || 1); ctx.lineWidth = R.S * 7; ctx.stroke();
      ctx.globalAlpha = (0.7 + (a.rms || 0) * 0.3) * (R.amt || 1); ctx.lineWidth = R.S * (1.6 + (a.rms || 0) * 1.4); ctx.stroke();
    }
    ctx.restore();
  } };

  /* ================= user GLSL over the whole frame (EX-23) ================= */
  const DEF = `// uv: 0..1, tex: the frame, time / beat / bass / mid / high / kick / rms: 0..1
vec4 effect(vec2 uv) {
  float w = sin(uv.y * 40.0 + time * 3.0) * 0.002 * (1.0 + kick * 4.0);
  vec4 c = texture2D(tex, uv + vec2(w, 0.0));
  c.r = texture2D(tex, uv + vec2(w + 0.002 * bass, 0.0)).r;
  return c;
}`;
  let GL = null, lastSrc = null, prog = null, lastErr = '';
  function compile(src) {
    if (!GL) { const cv = document.createElement('canvas'), gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true }); if (!gl) return 'WebGL not available'; const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); const t = gl.createTexture(); GL = { cv, gl, b, t }; }
    const gl = GL.gl, sh = (ty, s) => { const o = gl.createShader(ty); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { const e = gl.getShaderInfoLog(o); gl.deleteShader(o); throw new Error(e); } return o; };
    try {
      const fs = `precision highp float;uniform sampler2D tex;uniform vec2 res;uniform float time,beat,bass,mid,high,kick,rms;varying vec2 vUv;\n#line 1\n${src}\nvoid main(){vec4 c=effect(vUv);gl_FragColor=vec4(clamp(c.rgb,0.,1.)*clamp(c.a,0.,1.),clamp(c.a,0.,1.));}`;
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}')); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      prog = { pr, u: {} }; lastErr = ''; return '';
    } catch (e) { prog = null; lastErr = String(e.message || e).replace(/ERROR: 0:/g, 'line ').slice(0, 600); return lastErr; }
  }
  function run(src, scene, W, H, u, amt) {
    if (src !== lastSrc) { lastSrc = src; compile(src); }
    if (!prog || !GL) return false;
    const gl = GL.gl; if (GL.cv.width !== W || GL.cv.height !== H) { GL.cv.width = W; GL.cv.height = H; }
    gl.viewport(0, 0, W, H); gl.useProgram(prog.pr); gl.bindBuffer(gl.ARRAY_BUFFER, GL.b); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, GL.t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const L = (k) => (prog.u[k] !== undefined ? prog.u[k] : (prog.u[k] = gl.getUniformLocation(prog.pr, k)));
    gl.uniform1i(L('tex'), 0); gl.uniform2f(L('res'), W, H); for (const k of ['time', 'beat', 'bass', 'mid', 'high', 'kick', 'rms']) gl.uniform1f(L(k), u[k] || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (gl.isContextLost()) return false;
    const x = scene.getContext('2d'); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = amt >= 0.999 ? 'copy' : 'source-over'; x.globalAlpha = clamp(amt, 0, 1); x.drawImage(GL.cv, 0, 0, scene.width, scene.height); x.restore();
    return true;
  }
  LM.cglsl = { run, compile: (s) => compile(s), get error() { return lastErr; }, DEF };

  LM.director_OVR = LM.director_OVR || {};
  LM.director_OVR.enter = Object.assign(LM.director_OVR.enter || {}, { faceMorph: [0.4, 'cinema smooth'] });
  LM.director_OVR.hold = Object.assign(LM.director_OVR.hold || {}, { faceBreath: [0.3, 'smooth cinema'] });
  const D = LM.data, addTo = (id, key, o) => { const t = D.themeById[id]; if (t) t[key] = Object.assign({}, t[key] || {}, o); };
  [['cinematic', { faceMorph: 0.8 }], ['experimental', { faceMorph: 1.2 }], ['ballad', { faceMorph: 0.6 }], ['artistmv', { faceMorph: 0.8 }], ['showreel', { faceMorph: 0.8 }]].forEach(([id, o]) => addTo(id, 'enter', o));
  [['experimental', { faceBreath: 1 }], ['dream', { faceBreath: 0.6 }]].forEach(([id, o]) => addTo(id, 'hold', o));
  [['vj', { audioGenArt: 1.2 }], ['experimental', { audioGenArt: 1.2 }], ['edm', { audioGenArt: 0.6 }], ['techno', { audioGenArt: 0.8 }], ['psyche', { audioGenArt: 1 }], ['ambient', { audioGenArt: 0.6 }]].forEach(([id, o]) => addTo(id, 'bgm', o));
  [['experimental', { sdfLiquid: 0.6, reactionText: 0.5, cellText: 0.6, inkFluid: 0.5 }], ['vj', { sdfChrome: 0.5, cellText: 0.4 }], ['wa', { inkFluid: 0.8 }], ['cinematic', { sdfChrome: 0.4, inkFluid: 0.4 }], ['chiptune', { cellText: 0.8 }], ['metal', { sdfChrome: 0.6 }], ['hiphop', { sdfChrome: 0.5 }], ['psyche', { reactionText: 0.6, sdfLiquid: 0.6 }]].forEach(([id, o]) => addTo(id, 'filters', o));
})();
