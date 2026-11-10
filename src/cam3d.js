/* Effect catalogue phase 5c — 3D camera work and solid 3D text (§11 CM-14〜35, §4 GL-17).
 * The lyric layer is projected as a textured plane with a real perspective camera on the GPU (perspective-correct,
 * with depth-of-field blur that grows with distance from the focal plane), so the text can lie on the floor,
 * tower overhead, be circled, flown through or left behind in a 3D space of lyrics. The background layer gets its own
 * move (parallax, dolly-zoom stretch, rack-focus blur). Cameras:
 *  top-down, low angle, arc, orbit, fly-through, FPV drone, bullet time (time freezes while the camera circles),
 *  rack focus, dolly zoom (vertigo), multiplane parallax, Droste infinite zoom, lyric-to-lyric 3D space, one-shot
 *  (the camera never stops moving forward through the lines).
 * Solid 3D text (GL-17): letters are extruded into thick blocks with shaded sides that turn, flip in and flip out. */
'use strict';
(() => {
  const U = LM.U, { clamp, lerp, hash, mix } = U, E = LM.E, M = LM.motion, PI = Math.PI, DEG = PI / 180;
  const N1 = U.noise1, sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  /* ---------- small mat3 helpers ---------- */
  const rX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
  const rY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
  const rZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
  const mul = (A, B) => { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return o; };
  const tr = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
  const app = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
  const rot = (rx, ry, rz) => mul(rY(ry || 0), mul(rX(rx || 0), rZ(rz || 0)));

  /* ---------- GPU plane renderer ---------- */
  const VS = `precision highp float;attribute vec2 p;uniform mat3 Rm;uniform vec3 Tr;uniform vec2 R;uniform float D,Sc;varying vec2 uv;varying float dz;
void main(){vec3 q=Rm*vec3(p*R*.5*Sc,0.)+Tr;float ze=max(D-q.z,1.);uv=vec2(p.x*.5+.5,.5-p.y*.5);dz=ze/D;
 gl_Position=vec4(q.x*D/(R.x*.5),q.y*D/(R.y*.5),.5*ze,ze);}`;
  const FS = `precision highp float;uniform sampler2D tx;uniform vec2 R;uniform float F,K,Ub,Al;varying vec2 uv;varying float dz;
void main(){float r=clamp(abs(dz-F)*K+Ub,0.,28.);vec4 c=texture2D(tx,uv);
 if(r>.6){vec4 a=c;float w=1.;for(int i=1;i<24;i++){float fi=float(i),rr=sqrt(fi/24.)*r,an=fi*2.39996;vec2 o=vec2(cos(an),sin(an))*rr/R;a+=texture2D(tx,uv+o);w+=1.;}c=a/w;}
 gl_FragColor=c*Al;}`;
  let G = null;
  function gl0() {
    if (G !== null) return G;
    try {
      const cv = document.createElement('canvas'), gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true }); if (!gl) return (G = false);
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      const u = {}; ['Rm', 'Tr', 'R', 'D', 'Sc', 'tx', 'F', 'K', 'Ub', 'Al'].forEach((k) => (u[k] = gl.getUniformLocation(pr, k)));
      // finely tessellated plane keeps the perspective correct under strong tilts
      const n = 24, v = []; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x0 = -1 + 2 * i / n, x1 = -1 + 2 * (i + 1) / n, y0 = -1 + 2 * j / n, y1 = -1 + 2 * (j + 1) / n; v.push(x0, y0, x1, y0, x0, y1, x1, y0, x1, y1, x0, y1); }
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      G = { cv, gl, pr, u, b, tex, nv: v.length / 2, a: gl.getAttribLocation(pr, 'p') };
    } catch (e) { console.warn('plane3d', e.message); G = false; }
    return G;
  }
  // c: { R (mat3), T [x,y,z] px, s, fov, focus, dof, blur, alpha }
  function plane(src, c, W, H, S) {
    const g = gl0(); if (!g) return null; const gl = g.gl;
    if (g.cv.width !== W || g.cv.height !== H) { g.cv.width = W; g.cv.height = H; }
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(g.pr); gl.bindBuffer(gl.ARRAY_BUFFER, g.b); gl.enableVertexAttribArray(g.a); gl.vertexAttribPointer(g.a, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const fov = (c.fov || 38) * DEG, D = (H / 2) / Math.tan(fov / 2);
    // screen y grows downwards: flip y in and out of the rotation so positive rx tips the top away
    const F = [1, 0, 0, 0, -1, 0, 0, 0, 1], Rm = mul(F, mul(c.R, F));
    gl.uniformMatrix3fv(g.u.Rm, false, new Float32Array(tr(Rm))); gl.uniform3f(g.u.Tr, c.T[0], -c.T[1], c.T[2]); gl.uniform2f(g.u.R, W, H); gl.uniform1f(g.u.D, D); gl.uniform1f(g.u.Sc, c.s || 1);
    gl.uniform1i(g.u.tx, 0); gl.uniform1f(g.u.F, c.focus == null ? 1 : c.focus); gl.uniform1f(g.u.K, (c.dof || 0) * S * 10); gl.uniform1f(g.u.Ub, (c.blur || 0) * S); gl.uniform1f(g.u.Al, c.alpha == null ? 1 : c.alpha);
    gl.drawArrays(gl.TRIANGLES, 0, g.nv);
    return g.cv;
  }

  /* ---------- cameras ---------- */
  const N2 = (t, s) => N1(t, s) * 0.65 + N1(t * 2.3, s + 7) * 0.35;
  const base = (o) => Object.assign({ R: rot(o.rx, o.ry, o.rz), T: [o.x || 0, o.y || 0, o.z || 0], s: o.s || 1, fov: o.fov || 38, focus: 1, dof: o.dof == null ? 1 : o.dof, blur: o.blur || 0, alpha: o.alpha == null ? 1 : o.alpha }, o.extra || {});
  const C3 = {
    topDown: (k) => base({ rx: (54 - 6 * k.hp) * DEG * k.am, ry: Math.sin(k.t * 0.2) * 5 * DEG, z: k.H * 0.28 * E.outCubic(k.hp), y: k.H * 0.04, s: 1.25, dof: 3 }),
    lowAngle: (k) => base({ rx: -28 * DEG * k.am, ry: Math.sin(k.t * 0.17) * 4 * DEG, z: k.H * 0.12 * k.hp, y: -k.H * 0.04, s: 1.15, dof: 2.5 }),
    arc3D: (k) => { const q = E.inOutSine(k.hp); return base({ ry: lerp(-36, 24, q) * DEG * k.am, rx: 8 * DEG, z: k.H * 0.12 * Math.sin(PI * q), s: 1.06, dof: 2.5 }); },
    orbit3D: (k) => base({ ry: (-52 + 104 * k.hp) * DEG * k.am, rx: 10 * Math.sin(PI * k.hp) * DEG, z: -k.H * 0.05, s: 1.04, dof: 3 }),
    flyThrough: (k) => { const e = E.outExpo(k.ep), x = E.inExpo(k.xp); return base({ z: -k.H * 7 * (1 - e) + k.H * 1.9 * x, ry: (1 - e) * 22 * DEG + x * -8 * DEG, rz: (1 - e) * -8 * DEG, dof: 2.4, alpha: clamp(k.ep * 4) * (1 - sstep(0.65, 1, k.xp)) }); },
    fpv: (k) => { const t = k.t, b = Math.exp(-((t - k.lb) / 0.25)); return base({ rz: (N2(t * 0.9, 1) * 18 + N2(t * 3.5, 2) * 3) * DEG * k.am, rx: (N2(t * 0.7, 3) * 16 - b * 7) * DEG * k.am, ry: N2(t * 0.6, 5) * 20 * DEG * k.am, z: N2(t * 0.5, 6) * k.H * 0.25 + b * k.H * 0.1, x: N2(t * 1.1, 8) * k.W * 0.04, y: N2(t * 1.3, 9) * k.H * 0.04, s: 1.12, dof: 2 }); },
    bulletTime: (k) => { const u = clamp((k.hp - 0.3) / 0.42), w = E.inOutSine(u); return base({ ry: Math.sin(PI * w) * 44 * DEG * k.am, rx: Math.sin(PI * w) * 6 * DEG, z: k.H * 0.16 * Math.sin(PI * w), s: 1.05, dof: 2.5 + 3 * Math.sin(PI * w) }); },
    rackFocus: (k) => { const q = sstep(0.12, 1, k.lt / Math.max(0.6, Math.min(1.6, k.dur * 0.35))); return base({ blur: 9 * (1 - q), dof: 0, extra: { bgBlur: 7 * q } }); },
    dollyZoom: (k) => { const q = E.inOutSine(k.hp); return base({ s: 1 - 0.03 * q, rx: 3 * DEG * q, dof: 0, extra: { bg: { s: 1 + 0.5 * q * k.am, x: 0, y: 0 } } }); },
    multiplane: (k) => { const q = k.hp - 0.5; return base({ x: -q * k.W * 0.12 * k.am, dof: 0, extra: { bg: { s: 1.08, x: -q * k.W * 0.035 * k.am, y: 0 } } }); },
    droste: (k) => base({ dof: 0, extra: { droste: true } }),
  };
  // lyric space: every line has its own pose; the camera travels from line to line
  function poseOf(i, mode, W, H) {
    if (mode === 'oneShot') return { x: Math.sin(i * 1.7) * W * 0.32, y: Math.cos(i * 1.1) * H * 0.18, z: -i * H * 2.4, ry: -Math.sin(i * 1.7) * 26 * DEG, rx: 0 };
    return { x: (hash(i, 61) - 0.5) * W * 1.8, y: (hash(i, 62) - 0.5) * H * 1.4, z: -(hash(i, 63)) * H * 2.2, ry: (hash(i, 64) - 0.5) * 70 * DEG, rx: (hash(i, 65) - 0.5) * 30 * DEG };
  }
  function spaceCam(r, t, mode) {
    const cs = r.cues, W = r.W, H = r.H; let i = -1; for (let j = 0; j < cs.length; j++) { if (cs[j].start - (mode === 'oneShot' ? 0 : 0.35) <= t) i = j; else break; }
    if (i < 0) i = 0;
    const P = (j) => poseOf(j, mode, W, H), lp = (a, b, q) => ({ x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q), z: lerp(a.z, b.z, q), ry: lerp(a.ry, b.ry, q), rx: lerp(a.rx, b.rx, q) });
    let cam;
    if (mode === 'oneShot') { const s0 = cs[i] ? cs[i].start : 0, s1 = cs[i + 1] ? cs[i + 1].start : s0 + 4, q = clamp((t - s0) / Math.max(0.3, s1 - s0)), w = 0.12 * q + 0.88 * sstep(0.72, 1, q); cam = lp(P(i), P(i + 1), w); cam.z += H * 0.45; }
    else { const s0 = cs[i] ? cs[i].start - 0.35 : 0, q = E.inOutCubic(clamp((t - s0) / 0.8)); cam = lp(P(Math.max(0, i - 1)), P(i), i > 0 ? q : 1); cam.x += Math.sin(t * 0.3) * W * 0.012; cam.y += Math.cos(t * 0.23) * H * 0.012; cam.z += H * 0.02; }
    return cam;
  }
  function spacePlane(r, ci, t, mode) {
    const cam = spaceCam(r, t, mode), p = poseOf(ci, mode, r.W, r.H), Rc = rot(cam.rx, cam.ry, 0), Rt = tr(Rc);
    const T = app(Rt, [p.x - cam.x, p.y - cam.y, p.z - cam.z]), R = mul(Rt, rot(p.rx, p.ry, 0)), dz = (r.H / 2) / Math.tan(19 * DEG) - T[2];
    return base({ extra: { R, T, alpha: clamp(1.4 - Math.max(0, -T[2]) / (r.H * 6)) * (dz < r.H * 0.25 ? clamp(dz / (r.H * 0.25)) : 1), dof: 2.2 } });
  }
  const SPACE = { space3d: 1, oneShot: 1 };
  const has = (id) => !!(C3[id] || SPACE[id]);
  function params(id, r, v, t, beat) {
    const { c, ph } = v, lt = t - c.start, amp = r.p.intensity || 1;
    if (SPACE[id]) return spacePlane(r, v.i, t, id);
    const k = { t, lt, hp: clamp(lt / ph.dur), dur: ph.dur, ep: clamp(lt / Math.max(0.05, ph.ed)), xp: ph.xd > 0 ? clamp((t - ph.exitStart) / ph.xd) : 0, W: r.W, H: r.H, S: r.S, am: Math.min(1.3, amp), beat, lb: r.lastTrig ? r.lastTrig(t, 1) : t };
    return C3[id](k);
  }
  // time freeze for bullet time (glyph motion holds while the camera moves)
  function freezeT(tt, c, ph) { const w0 = c.start + ph.dur * 0.3, w1 = c.start + ph.dur * 0.72; return tt > w0 && tt < w1 ? w0 : tt; }
  // the projected layer onto ctx
  function draw(ctx, L, c3, r) {
    const W = r.W, H = r.H;
    if (c3.droste) {
      const t = r.curT || 0, s = 0.42, f = (t * 0.32) % 1, z = Math.pow(1 / s, f);
      ctx.save();
      for (let k = 4; k >= 0; k--) { const sc = z * Math.pow(s, k); if (sc < 0.03 || sc > 2.2) continue; ctx.save(); ctx.globalAlpha *= (sc > 1 ? clamp((2.2 - sc) / 1.2) : clamp(0.35 + sc)) * (k === 4 ? clamp(f * 3) : 1); ctx.translate(W / 2, H / 2); ctx.rotate(Math.log(sc) * 0.12); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2); ctx.drawImage(L, 0, 0); ctx.restore(); }
      ctx.restore(); return;
    }
    const cv = plane(L, c3, W, H, r.S);
    if (!cv) { ctx.drawImage(L, 0, 0); return; }
    ctx.drawImage(cv, 0, 0, W, H);
  }
  // background move / blur for the current line's camera (applied to everything drawn behind the lyric)
  function bgFor(r, cur, t) {
    if (!cur) return null; const id = (cur.c.scene && cur.c.scene.camera) || r.p.camera; if (!id || !has(id)) return null;
    let o = null;
    if (SPACE[id]) { const cam = spaceCam(r, t, id); o = { s: 1.12, x: -cam.x * 0.03 - Math.sin(cam.ry) * r.W * 0.05, y: -cam.y * 0.03 }; }
    else { const c3 = params(id, r, cur, t, 0); o = c3.bg ? Object.assign({}, c3.bg) : null; if (c3.bgBlur) { o = o || { s: 1, x: 0, y: 0 }; o.blur = c3.bgBlur; }
      if (!o && (id === 'arc3D' || id === 'orbit3D' || id === 'fpv')) { const ry = Math.atan2(c3.R[2], c3.R[0]); o = { s: 1.08, x: -ry * r.W * 0.05, y: 0 }; } }
    return o;
  }
  LM.cam3d = { has, params, draw, bgFor, freezeT, plane };
  Object.assign(LM.data.cameras, {
    topDown: '俯瞰（文字が床に置かれる）', lowAngle: 'あおり（下から見上げる）', arc3D: 'アーク（弧を描いて回り込む）', orbit3D: '3Dオービット（文字の周りを回る）', flyThrough: 'フライスルー（奥から飛んで来て通り抜ける）',
    fpv: 'FPVドローン（急旋回・急降下）', bulletTime: 'バレットタイム（止まった瞬間に回り込む）', rackFocus: 'ラックフォーカス（背景から文字へピント送り）', dollyZoom: 'ドリーズーム（めまいショット）',
    multiplane: 'マルチプレーン（奥行きのある横移動）', droste: 'ドロステ（無限に続く入れ子ズーム）', space3d: '3D空間の歌詞から歌詞へ移動', oneShot: 'ワンショット（止まらずに奥へ進み続ける）',
  });

  /* ---------- solid 3D text (GL-17) ---------- */
  function extrude(ctx, X) {
    const { T, size, col, draw, ch } = X, d = T.pd, ry = d.ry || 0, rx = d.rx || 0, depth = size * (d.depth || 0.32), n = Math.max(6, Math.round(depth / Math.max(0.8, size * 0.018)));
    const ox = Math.sin(ry) * depth, oy = -Math.sin(rx) * depth, side = mix(col, '#000000', 0.38), edge = mix(col, '#ffffff', 0.15), cx = Math.cos(ry), cy = Math.cos(rx);
    ctx.save(); ctx.filter = 'none';
    for (let k = n; k >= 1; k--) { const f = k / n; ctx.save(); ctx.translate(ox * f, oy * f); ctx.scale(Math.max(0.02, Math.abs(cx)), Math.max(0.02, Math.abs(cy))); ctx.fillStyle = k === 1 ? edge : mix(side, '#000000', f * 0.4); ctx.fillText(ch, 0, 0); ctx.restore(); }
    ctx.restore();
    ctx.save(); ctx.scale(Math.max(0.02, Math.abs(cx)), Math.max(0.02, Math.abs(cy))); draw();
    // light sweeping over the face as it turns
    const hl = clamp(0.5 - Math.sin(ry) * 0.9 - Math.sin(rx) * 0.4, 0, 1) * 0.35; if (hl > 0.02) { ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha *= hl; const gr = ctx.createLinearGradient(-size * 0.6, -size * 0.6, size * 0.6, size * 0.6); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillText(ch, 0, 0); }
    ctx.restore();
  }
  if (LM.glyphPaint) LM.glyphPaint.extrude = extrude;
  const cat = '3D';
  const lineTurn = (g, C, ry) => ({ x: (g.x - C.cx) * (Math.cos(ry) - 1) });
  Object.assign(M.hold, {
    extrudeTurn: { n: '立体文字がゆっくり向きを変える', c: cat, f: (ht, g, C) => { const k = C.amp || 1, ry = Math.sin(C.tAbs * 0.55) * 0.72 * k, rx = Math.sin(C.tAbs * 0.41 + 1) * 0.26 * k; return Object.assign(lineTurn(g, C, ry), { paint: extrude, pd: { ry, rx, depth: 0.45 } }); } },
    extrudeBeat: { n: '立体文字がビートで傾く', c: cat, f: (ht, g, C) => { const k = C.amp || 1, b = C.beat || 0, ry = (Math.floor(C.tAbs * (C.bpm || 120) / 60) % 2 ? 0.4 : -0.4) * k * (0.6 + b * 0.4), rx = 0.18 * b * k; return { paint: extrude, pd: { ry, rx, depth: 0.42 } }; } },
  });
  Object.assign(M.enter, {
    extrudeFlip: { n: '立体文字が回転して現れる', c: cat, d: 0.9, st: 0.5, f: (p, g) => { if (p <= 0) return { a: 0 }; const q = E.outBack(clamp(p)), ry = (1 - q) * 1.45; return { paint: extrude, pd: { ry, rx: (1 - q) * 0.3, depth: 0.36 }, a: clamp(p / 0.15), y: (1 - E.outCubic(p)) * g.size * 0.3 }; } },
  });
  Object.assign(M.exit, {
    extrudeFlipOut: { n: '立体文字が回転して消える', c: cat, d: 0.8, st: 0.45, f: (p, g) => { const q = E.inCubic(clamp(p)), ry = -q * 1.5; return { paint: extrude, pd: { ry, rx: q * 0.25, depth: 0.36 }, a: 1 - sstep(0.7, 1, p), y: q * g.size * 0.25 }; } },
  });

  LM.director_OVR = LM.director_OVR || {};
  const OV = (k, o) => (LM.director_OVR[k] = Object.assign(LM.director_OVR[k] || {}, o));
  OV('cam', { topDown: [0.4, 'cinema'], lowAngle: [0.45, 'cinema snap'], arc3D: [0.4, 'cinema smooth'], orbit3D: [0.5, 'cinema kinetic'], flyThrough: [0.7, 'snap kinetic'], fpv: [0.85, 'snap glitch'], bulletTime: [0.6, 'cinema'], rackFocus: [0.2, 'cinema smooth'], dollyZoom: [0.35, 'cinema'], multiplane: [0.25, 'cinema smooth'], droste: [0.55, 'glitch kinetic'], space3d: [0.55, 'cinema kinetic'], oneShot: [0.5, 'cinema smooth kinetic'] });
  OV('hold', { extrudeTurn: [0.35, 'cinema smooth'], extrudeBeat: [0.7, 'snap'] });
  OV('enter', { extrudeFlip: [0.6, 'snap bounce'] }); OV('exit', { extrudeFlipOut: [0.55, 'snap'] });
  const D = LM.data, addTo = (id, key, o) => { const t = D.themeById[id]; if (t) t[key] = Object.assign({}, t[key] || {}, o); };
  [['cinematic', { rackFocus: 1.5, arc3D: 1.2, dollyZoom: 1, topDown: 0.8, bulletTime: 0.6, space3d: 0.8 }], ['artistmv', { rackFocus: 1.2, arc3D: 1, lowAngle: 0.8, multiplane: 1 }], ['ballad', { rackFocus: 1, multiplane: 0.8 }],
    ['edm', { flyThrough: 1.2, fpv: 0.8, oneShot: 1, orbit3D: 0.8 }], ['techno', { flyThrough: 1, droste: 0.8, oneShot: 0.8 }], ['vj', { droste: 1.2, fpv: 1, space3d: 1, oneShot: 1 }], ['psyche', { droste: 1.5, orbit3D: 1 }],
    ['hiphop', { lowAngle: 1.2, fpv: 0.6 }], ['trap', { lowAngle: 1, flyThrough: 0.8 }], ['rock', { lowAngle: 1, fpv: 0.6 }], ['metal', { lowAngle: 1.2 }], ['kpop', { orbit3D: 1, flyThrough: 0.8, arc3D: 0.8 }],
    ['anison', { flyThrough: 1, orbit3D: 0.8, bulletTime: 0.6 }], ['showreel', { space3d: 1.2, oneShot: 1, topDown: 0.8, arc3D: 0.8 }], ['dream', { multiplane: 1, dollyZoom: 0.8, droste: 0.6 }], ['ambient', { multiplane: 1, oneShot: 0.8 }],
    ['citypop', { multiplane: 0.8, topDown: 0.6 }], ['jpop', { arc3D: 0.6, flyThrough: 0.6 }], ['minimal', { topDown: 1, rackFocus: 0.8 }], ['horror', { dollyZoom: 1.5, lowAngle: 0.8 }]].forEach(([id, o]) => addTo(id, 'camera', o));
  [['cinematic', { extrudeTurn: 0.6 }], ['showreel', { extrudeTurn: 1 }], ['edm', { extrudeBeat: 0.8 }], ['techno', { extrudeBeat: 0.8 }], ['kpop', { extrudeBeat: 0.8 }], ['anison', { extrudeBeat: 0.6 }], ['metal', { extrudeTurn: 0.8 }], ['rock', { extrudeBeat: 0.6 }]].forEach(([id, o]) => addTo(id, 'hold', o));
  [['showreel', { extrudeFlip: 1 }], ['kpop', { extrudeFlip: 0.8 }], ['anison', { extrudeFlip: 0.8 }], ['metal', { extrudeFlip: 0.8 }], ['edm', { extrudeFlip: 0.6 }]].forEach(([id, o]) => addTo(id, 'enter', o));
  [['showreel', { extrudeFlipOut: 1 }], ['kpop', { extrudeFlipOut: 0.6 }], ['metal', { extrudeFlipOut: 0.6 }]].forEach(([id, o]) => addTo(id, 'exit', o));
})();
