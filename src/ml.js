/* Effect catalogue phase 6a — compositing with people in the background image / video (§20 CP-05〜10, §25 EX-10).
 * Runs TensorFlow.js graph models from an optional "ML pack" (lms-ml-pack.lmsml: model topology + weights only, no
 * code — the code that runs them is bundled TensorFlow.js). Everything stays on the device.
 *  - person segmentation (selfie segmentation, 256×256)  → lyric behind the person, wrap around the person, avoid
 *  - face detection with landmarks (BlazeFace, 128×128) → follow the face, words leave the mouth
 *  - body pose, 17 keypoints (MoveNet Lightning, 192×192) → follow / push with the hands, lay words along the arms
 * The models look at the composed background of each frame (images, video, Ken Burns — whatever is behind the lyric),
 * so coordinates are already in screen space. Face / pose can be pre-analysed over the whole song for smooth tracks;
 * otherwise each frame is detected live and smoothed. */
'use strict';
LM.ml = (() => {
  const U = LM.U, clamp = U.clamp, lerp = U.lerp;
  const MAGIC = 'LMSML1\n';
  let hdr = null, buf = null, base = 0, M = {}, state = 'none', err = '', inShape = {};
  const KP = ['nose', 'eyeL', 'eyeR', 'earL', 'earR', 'shL', 'shR', 'elL', 'elR', 'wrL', 'wrR', 'hipL', 'hipR', 'knL', 'knR', 'anL', 'anR'];
  const KI = Object.fromEntries(KP.map((k, i) => [k, i]));

  function parse(ab) {
    const u8 = new Uint8Array(ab); if (u8.length < 16) throw new Error('bad pack');
    for (let i = 0; i < MAGIC.length; i++) if (u8[i] !== MAGIC.charCodeAt(i)) throw new Error('not an ML pack');
    const n = new DataView(ab).getUint32(7, true); if (n < 2 || 11 + n > u8.length) throw new Error('bad header');
    const h = JSON.parse(new TextDecoder().decode(u8.subarray(11, 11 + n)));
    if (!h || h.v !== 1 || !h.models) throw new Error('unsupported pack');
    for (const r of ['seg', 'face', 'pose']) { const m = h.models[r]; if (!m || !m.modelTopology || !Array.isArray(m.weightSpecs) || !(m.ofs >= 0) || !(m.len > 0) || 11 + n + m.ofs + m.len > u8.length) throw new Error('missing model: ' + r); }
    return { h, base: 11 + n };
  }
  function setPack(ab) { const p = parse(ab); hdr = p.h; base = p.base; buf = ab; M = {}; state = 'loaded'; err = ''; return info(); }
  const info = () => ({ state, err, models: hdr ? Object.fromEntries(Object.entries(hdr.models).map(([k, m]) => [k, m.name])) : {}, size: buf ? buf.byteLength : 0, created: hdr && hdr.created });
  let initP = null;
  function init() {
    if (state === 'ready') return Promise.resolve(true);
    if (!hdr) return Promise.reject(new Error('no ML pack'));
    if (initP) return initP;
    initP = (async () => {
      try {
        const tf = window.tf; if (!tf) throw new Error('TensorFlow.js is not available');
        try { await tf.setBackend('webgl'); } catch (e) { /* keep default */ }
        await tf.ready();
        for (const r of ['seg', 'face', 'pose']) {
          const m = hdr.models[r], wd = buf.slice(base + m.ofs, base + m.ofs + m.len);
          M[r] = await tf.loadGraphModel(tf.io.fromMemory({ modelTopology: m.modelTopology, weightSpecs: m.weightSpecs, weightData: wd, format: m.format, generatedBy: m.generatedBy, convertedBy: m.convertedBy }));
          const s = M[r].inputs[0].shape; inShape[r] = [s[1] > 0 ? s[1] : r === 'seg' ? 256 : r === 'face' ? 128 : 192, s[2] > 0 ? s[2] : r === 'seg' ? 256 : r === 'face' ? 128 : 192];
        }
        anchors = genAnchors(inShape.face[1]);
        // warm up (compiles the shaders once)
        const c = document.createElement('canvas'); c.width = 64; c.height = 36; segment(c); detect(c);
        state = 'ready'; return true;
      } catch (e) { state = 'error'; err = e.message || String(e); initP = null; throw e; }
    })();
    return initP;
  }

  /* ---------- input helpers ---------- */
  const CV = {}; const cvOf = (k, w, h) => { let c = CV[k]; if (!c) c = CV[k] = document.createElement('canvas'); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return c; };
  // letterbox into a square so faces / bodies keep their proportions; returns the mapping back to normalised source coords
  function square(src, n, key) {
    const c = cvOf(key, n, n), x = c.getContext('2d', { willReadFrequently: true }), sw = src.width, sh = src.height, s = n / Math.max(sw, sh), dw = sw * s, dh = sh * s, ox = (n - dw) / 2, oy = (n - dh) / 2;
    x.fillStyle = '#000'; x.fillRect(0, 0, n, n); x.drawImage(src, ox, oy, dw, dh);
    return { c, map: (px, py) => [(px - ox) / dw, (py - oy) / dh], sc: [n / dw, n / dh] };
  }

  /* ---------- person segmentation ---------- */
  function segment(src, ow, oh) {
    const tf = window.tf, [h, w] = inShape.seg; ow = ow || Math.max(32, Math.round(src.width / 2)); oh = oh || Math.max(18, Math.round(src.height / 2));
    const c = cvOf('seg', w, h); c.getContext('2d').drawImage(src, 0, 0, w, h);
    return tf.tidy(() => {
      const x = tf.expandDims(tf.div(tf.cast(tf.browser.fromPixels(c), 'float32'), 255), 0);
      let y = M.seg.execute(x); if (Array.isArray(y)) y = y[0];
      if (y.shape[3] === 2) y = tf.slice(tf.softmax(y), [0, 0, 0, 1], [1, -1, -1, 1]);
      // upscale, then tighten the soft edge so hair / shoulders keep a clean but feathered border
      y = tf.sigmoid(tf.mul(tf.sub(tf.image.resizeBilinear(y, [oh, ow]), 0.5), 9));
      return { d: y.dataSync().slice(), w: ow, h: oh };
    });
  }
  /* ---------- face (BlazeFace) ---------- */
  let anchors = null;
  function genAnchors(n) { const out = [], spec = [[n / 16, 2], [n / 8, 6]]; for (const [st, k] of spec) { const g = Math.floor((n + st - 1) / st); for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) for (let j = 0; j < k; j++) out.push([st * (x + 0.5), st * (y + 0.5)]); } return out; }
  function face(src) {
    const tf = window.tf, n = inShape.face[1], sq = square(src, n, 'face');
    const d = tf.tidy(() => { const x = tf.expandDims(tf.sub(tf.div(tf.cast(tf.browser.fromPixels(sq.c), 'float32'), 127.5), 1), 0); let y = M.face.execute(x); if (Array.isArray(y)) { y = y.slice().sort((a, b) => a.size - b.size); y = tf.concat([tf.concat([y[1], y[3]], 2), tf.concat([y[0], y[2]], 2)], 1); } return y.dataSync().slice(); });
    const stride = d.length / anchors.length; let best = -1, bs = 0;
    for (let i = 0; i < anchors.length; i++) { const s = 1 / (1 + Math.exp(-d[i * stride])); if (s > bs) { bs = s; best = i; } }
    if (best < 0 || bs < 0.6) return null;
    const a = anchors[best], o = best * stride, cx = a[0] + d[o + 1], cy = a[1] + d[o + 2], bw = d[o + 3], bh = d[o + 4];
    const P = (k) => sq.map(a[0] + d[o + 5 + k * 2], a[1] + d[o + 6 + k * 2]);
    const [x0, y0] = sq.map(cx - bw / 2, cy - bh / 2), [x1, y1] = sq.map(cx + bw / 2, cy + bh / 2);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, eyeR: P(0), eyeL: P(1), nose: P(2), mouth: P(3), s: bs };
  }
  /* ---------- pose (MoveNet Lightning) ---------- */
  function pose(src) {
    const tf = window.tf, n = inShape.pose[1], sq = square(src, n, 'pose');
    const d = tf.tidy(() => { const x = tf.expandDims(tf.cast(tf.browser.fromPixels(sq.c), 'int32'), 0); let y = M.pose.execute(x); if (Array.isArray(y)) y = y[0]; return y.dataSync().slice(); });
    const kp = []; let sum = 0; for (let i = 0; i < 17; i++) { const [x, y] = sq.map(d[i * 3 + 1] * n, d[i * 3] * n); kp.push({ x, y, s: d[i * 3 + 2] }); sum += d[i * 3 + 2]; }
    return sum / 17 > 0.18 ? kp : null;
  }
  function detect(src) { return { face: face(src), pose: pose(src) }; }

  /* ---------- whole-song tracks (pre-analysis) ---------- */
  let TR = null; // { fps, n, face: Float32Array(n*9), pose: Float32Array(n*51), key }
  async function analyze(frameAt, dur, onP, fps = 10, key = '') {
    if (state !== 'ready') await init();
    const n = Math.max(2, Math.ceil(dur * fps) + 1), F = new Float32Array(n * 9).fill(NaN), Pz = new Float32Array(n * 51).fill(NaN);
    for (let i = 0; i < n; i++) {
      const cv = await frameAt(i / fps); if (!cv) continue;
      const r = detect(cv);
      if (r.face) F.set([r.face.x, r.face.y, r.face.w, r.face.h, r.face.mouth[0], r.face.mouth[1], r.face.nose[0], r.face.nose[1], r.face.s], i * 9);
      if (r.pose) r.pose.forEach((k, j) => Pz.set([k.x, k.y, k.s], i * 51 + j * 3));
      if (i % 4 === 0) { onP && onP(i / n); await new Promise((res) => setTimeout(res, 0)); }
    }
    // confidence-weighted Gaussian smoothing (σ ≈ 0.12 s) that also bridges short gaps (< 0.8 s)
    const smooth = (A, stride, conf, nc) => {
      const out = new Float32Array(A.length).fill(NaN), R = Math.round(fps * 0.3), sg = fps * 0.12;
      for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
        let sw = 0, sx = 0, sy = 0, near = 1e9;
        for (let k = -R; k <= R; k++) { const j = i + k; if (j < 0 || j >= n) continue; const o = j * stride + conf(c); const cf = A[o + 2]; if (!(cf > 0.25)) continue; const w = Math.exp(-(k * k) / (2 * sg * sg)) * cf; sw += w; sx += A[o] * w; sy += A[o + 1] * w; near = Math.min(near, Math.abs(k)); }
        if (sw > 0 && near <= fps * 0.8) { const o = i * stride + conf(c); out[o] = sx / sw; out[o + 1] = sy / sw; out[o + 2] = Math.min(1, sw); }
      }
      return out;
    };
    // face: pack (cx,cy,conf) (w,h,conf) (mx,my,conf) as 3 "points"
    const F3 = new Float32Array(n * 9).fill(NaN); for (let i = 0; i < n; i++) { const o = i * 9, s = F[o + 8]; if (!(s > 0)) continue; F3.set([F[o], F[o + 1], s, F[o + 2], F[o + 3], s, F[o + 4], F[o + 5], s], o); }
    TR = { fps, n, face: smooth(F3, 9, (c) => c * 3, 3), pose: smooth(Pz, 51, (c) => c * 3, 17), key };
    onP && onP(1);
    return TR;
  }
  function trackAt(t) {
    if (!TR) return null;
    const x = t * TR.fps, i = Math.max(0, Math.min(TR.n - 2, Math.floor(x))), u = clamp(x - i, 0, 1);
    const L = (A, o) => { const a = A[i * (A === TR.face ? 9 : 51) + o], b = A[(i + 1) * (A === TR.face ? 9 : 51) + o]; return Number.isFinite(a) ? (Number.isFinite(b) ? lerp(a, b, u) : a) : Number.isFinite(b) ? b : NaN; };
    let face = null; const fx = L(TR.face, 0); if (Number.isFinite(fx)) face = { x: fx, y: L(TR.face, 1), w: L(TR.face, 3), h: L(TR.face, 4), mouth: [L(TR.face, 6), L(TR.face, 7)], s: L(TR.face, 2) };
    let pose = null; const kp = []; let ok = 0; for (let j = 0; j < 17; j++) { const x0 = L(TR.pose, j * 3); kp.push({ x: x0, y: L(TR.pose, j * 3 + 1), s: Number.isFinite(x0) ? L(TR.pose, j * 3 + 2) : 0 }); if (Number.isFinite(x0)) ok++; }
    if (ok >= 5) pose = kp;
    return { face, pose };
  }
  const hasTracks = (key) => !!TR && (!key || TR.key === key);
  const clearTracks = () => { TR = null; };
  function forget() { hdr = null; buf = null; M = {}; state = 'none'; initP = null; TR = null; }

  /* ---------- lyric motions that use the people in the background ---------- */
  const Mo = LM.motion, cat = '実写合成', E = LM.E;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const kpt = (ml, k) => { const p = ml && ml.pose && ml.pose[KI[k]]; return p && p.s > 0.25 && Number.isFinite(p.x) ? p : null; };
  // the person's body: shoulders / hips from the pose, else the segmentation box
  function body(ml, C) {
    const sL = kpt(ml, 'shL'), sR = kpt(ml, 'shR'), hL = kpt(ml, 'hipL'), hR = kpt(ml, 'hipR');
    if (sL && sR) { const cx = (sL.x + sR.x) / 2, sy = (sL.y + sR.y) / 2, hy = hL && hR ? (hL.y + hR.y) / 2 : sy + Math.abs(sL.x - sR.x) * 1.4, w = Math.abs(sL.x - sR.x); return { cx, cy: lerp(sy, hy, 0.35), w: Math.max(w * 1.25, C.W * 0.08), h: Math.max(hy - sy, C.H * 0.1) }; }
    const pb = ml && ml.person; if (pb) return { cx: pb.cx, cy: pb.y0 + (pb.y1 - pb.y0) * 0.42, w: (pb.x1 - pb.x0) * 0.75, h: (pb.y1 - pb.y0) * 0.45 };
    return null;
  }
  Object.assign(Mo.hold, {
    wrapPerson: { n: '人物の周りを回る（前と後ろに回り込む）', c: cat, ml: 'occl', f: (ht, g, C) => {
      const ml = C.ml, b = body(ml, C); if (!b) return {};
      const N = Math.max(1, C.N), ang = ((g.k || 0) / N) * Math.PI * 2 * Math.min(1, N / 10 + 0.35) - C.tAbs * 0.9 * (C.amp || 1), rx = Math.max(b.w * 0.7 + g.size * 0.5, (N * g.size * 0.95) / (Math.PI * 2 * Math.min(1, N / 10 + 0.35))), ry = b.h * 0.1;
      const z = Math.cos(ang), x = b.cx + Math.sin(ang) * rx, y = b.cy + z * ry, s = 0.78 + 0.28 * (z * 0.5 + 0.5);
      return { x: x - g.x, y: y - g.y, sx: s, sy: s, rot: -Math.sin(ang) * 0.15, front: z > 0, dark: z < 0 ? 0.25 * -z : 0 };
    } },
    faceFollow: { n: '顔の横についていく', c: cat, ml: 'face', f: (ht, g, C) => {
      const f = C.ml && C.ml.face; if (!f || !C.bb) return {};
      const side = f.x < C.W / 2 ? 1 : -1, tx = f.x + side * (f.w * 0.75 + C.bb.w * 0.55), ty = f.y - f.h * 0.15;
      return { x: clamp(tx, C.bb.w * 0.5 + C.W * 0.03, C.W - C.bb.w * 0.5 - C.W * 0.03) - C.bb.cx, y: clamp(ty, C.bb.h * 0.5 + C.H * 0.04, C.H - C.bb.h * 0.5 - C.H * 0.04) - C.bb.cy };
    } },
    followHand: { n: '手の動きについていく', c: cat, ml: 'pose', f: (ht, g, C) => {
      const ml = C.ml, a = kpt(ml, 'wrL'), b = kpt(ml, 'wrR'); const w = a && b ? (a.y < b.y ? a : b) : a || b; if (!w || !C.bb) return {};
      const lag = ((g.k || 0) / Math.max(1, C.N)) * 0.6, tx = w.x + C.bb.w * 0.1, ty = w.y - C.bb.h * 0.9;
      return { x: (tx - C.bb.cx) * (1 - lag * 0.3), y: (ty - C.bb.cy) * (1 - lag * 0.3), rot: Math.sin(C.tAbs * 3 + (g.k || 0)) * 0.03 };
    } },
    handPush: { n: '手で文字を払いのける', c: cat, ml: 'pose', f: (ht, g, C) => {
      const ml = C.ml; let x = 0, y = 0, r = 0;
      for (const k of ['wrL', 'wrR']) { const w = kpt(ml, k); if (!w) continue; const dx = g.x - w.x, dy = g.y - w.y, d = Math.hypot(dx, dy) + 1, R = g.size * 3.2 * (C.amp || 1); if (d > R) continue; const f = Math.pow(1 - d / R, 2) * R * 0.9; x += (dx / d) * f; y += (dy / d) * f; r += (dx > 0 ? 1 : -1) * (1 - d / R) * 0.5; }
      return { x, y, rot: r };
    } },
    alongBody: { n: '腕と肩のラインに沿って並ぶ', c: cat, ml: 'pose', f: (ht, g, C) => {
      const ml = C.ml; let path = ['wrR', 'elR', 'shR', 'shL', 'elL', 'wrL'].map((k) => kpt(ml, k)).filter(Boolean); if (path.length < 3) return {};
      if (path[0].x > path[path.length - 1].x) path = path.slice().reverse(); // read left → right
      const bc = body(ml, C) || { cx: C.W / 2, cy: C.H / 2 };
      // smooth the polyline (Chaikin) so the words flow along the arms instead of kinking at the joints
      for (let it = 0; it < 2; it++) { const q = [path[0]]; for (let i = 0; i < path.length - 1; i++) { const A = path[i], B = path[i + 1]; q.push({ x: A.x * 0.75 + B.x * 0.25, y: A.y * 0.75 + B.y * 0.25 }, { x: A.x * 0.25 + B.x * 0.75, y: A.y * 0.25 + B.y * 0.75 }); } q.push(path[path.length - 1]); path = q; }
      const seg = []; let tot = 0; for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); seg.push(l); tot += l; }
      const u = ((g.k || 0) + 0.5) / Math.max(1, C.N), d = (0.08 + u * 0.84) * tot; let acc = 0, i = 0; while (i < seg.length - 1 && acc + seg[i] < d) { acc += seg[i]; i++; }
      const q = clamp((d - acc) / (seg[i] || 1), 0, 1), A = path[i], B = path[i + 1], px0 = lerp(A.x, B.x, q), py0 = lerp(A.y, B.y, q);
      const ang = Math.atan2(B.y - A.y, B.x - A.x); let nx = Math.sin(ang), ny = -Math.cos(ang); if (nx * (px0 - bc.cx) + ny * (py0 - bc.cy) < 0) { nx = -nx; ny = -ny; }
      const lift = g.size * 0.7, k = clamp(0.9 * (C.amp || 1), 0, 1);
      return { x: (px0 + nx * lift - g.x) * k, y: (py0 + ny * lift - g.y) * k, rot: clamp(ang, -1.75, 1.75) * k };
    } },
    avoidPerson: { n: '人物を避けて空いている側に寄る', c: cat, ml: 'seg', f: (ht, g, C) => {
      const pb = C.ml && C.ml.person; if (!pb || !C.bb || pb.cov < 0.01) return {};
      const left = pb.x0, right = C.W - pb.x1, side = right > left ? 1 : -1, room = side > 0 ? [pb.x1, C.W] : [0, pb.x0];
      const tx = clamp((room[0] + room[1]) / 2, C.bb.w * 0.5 + C.W * 0.03, C.W - C.bb.w * 0.5 - C.W * 0.03), s = clamp((room[1] - room[0]) * 0.92 / Math.max(1, C.bb.w), 0.55, 1);
      return { x: tx - C.bb.cx + (g.x - C.bb.cx) * (s - 1), y: (g.y - C.bb.cy) * (s - 1), sx: s, sy: s };
    } },
  });
  Object.assign(Mo.enter, {
    fromMouth: { n: '口元から言葉が飛び出す', c: cat, ml: 'face', d: 1.1, st: 0.55, f: (p, g, C) => {
      const f = C.ml && C.ml.face; if (p <= 0) return { a: 0 }; if (!f) return { a: clamp(p * 3, 0, 1) };
      const q = E.outCubic(p), mx = f.mouth[0], my = f.mouth[1], ax = lerp(mx, g.x, q), ay = lerp(my, g.y, q) - Math.sin(Math.PI * q) * g.size * 1.2, s = lerp(0.15, 1, E.outBack(p));
      return { x: ax - g.x, y: ay - g.y, sx: s, sy: s, a: clamp(p * 4, 0, 1), rot: (1 - q) * ((g.k || 0) % 2 ? 0.5 : -0.5) };
    } },
  });
  LM.fx.cats.ml = '実写合成';
  LM.fx.list.behindPerson = { n: '歌詞を人物の後ろに回す', c: 'ml', k: 'post' };
  const USES = new Set(Object.entries(Mo.hold).concat(Object.entries(Mo.enter)).filter(([, m]) => m.ml).map(([k]) => k));
  // what the current line needs from the models
  function needs(c, ph, fl, p) {
    const ids = [ph.tr.enter, ph.tr.hold, ph.tr.exit], o = { seg: false, det: false, occl: false };
    for (const id of ids) { const m = Mo.enter[id] || Mo.hold[id] || Mo.exit[id]; if (!m || !m.ml) continue; if (m.ml === 'occl') { o.occl = o.seg = true; o.det = true; } else if (m.ml === 'seg') o.seg = true; else o.det = true; }
    if ((fl && fl.has && fl.has('behindPerson')) || p.mlBehind) { o.occl = o.seg = true; }
    return o;
  }
  return { setPack, init, info, get ready() { return state === 'ready'; }, get state() { return state; }, segment, detect, analyze, trackAt, hasTracks, clearTracks, forget, needs, USES, KI };
})();
