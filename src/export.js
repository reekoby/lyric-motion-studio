/* Exporters: MP4/MOV/WebM (WebCodecs via Mediabunny), transparent WebM, PNG sequence, GIF, still, packages */
'use strict';
LM.exporter = (() => {
  const U = LM.U;

  /* minimal ZIP (store) writer */
  const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  class Zip {
    constructor() { this.parts = []; this.cd = []; this.off = 0; }
    add(name, u8) {
      const nm = new TextEncoder().encode(name), crc = crc32(u8);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, u8.length, true); h.setUint32(22, u8.length, true);
      h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      this.parts.push(new Uint8Array(h.buffer), nm, u8);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, u8.length, true); c.setUint32(24, u8.length, true);
      c.setUint16(28, nm.length, true); c.setUint32(42, this.off, true);
      this.cd.push(new Uint8Array(c.buffer), nm);
      this.off += 30 + nm.length + u8.length;
    }
    blob() {
      const cdSize = this.cd.reduce((a, p) => a + p.length, 0);
      const e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true); const n = this.cd.length / 2;
      e.setUint16(8, n, true); e.setUint16(10, n, true); e.setUint32(12, cdSize, true); e.setUint32(16, this.off, true);
      return new Blob([...this.parts, ...this.cd, new Uint8Array(e.buffer)], { type: 'application/zip' });
    }
  }
  // .lmz reader (untrusted input): known entry names only, bounds-checked, size-capped inflate
  async function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), out = Object.create(null);
    const LIMIT = { total: 1.6 * 1024 ** 3, json: 8 * 1024 ** 2, entry: 1.1 * 1024 ** 3 };
    const okName = (n) => n === 'project.json' || /^audio\/[^/\\]{1,120}$/.test(n) || /^images\/[\w-]{1,40}\.(jpg|jpeg|png|webp|mp4|webm|mov|m4v)$/i.test(n);
    let i = 0, total = 0, count = 0;
    while (i + 30 <= u8.length && dv.getUint32(i, true) === 0x04034b50 && count++ < 200) {
      const flags = dv.getUint16(i + 6, true), method = dv.getUint16(i + 8, true), size = dv.getUint32(i + 18, true), nl = dv.getUint16(i + 26, true), xl = dv.getUint16(i + 28, true);
      const start = i + 30 + nl + xl;
      if (flags & 8 || start + size > u8.length) throw new Error('破損しているか、対応していない .lmz です');
      const name = new TextDecoder().decode(u8.subarray(i + 30, i + 30 + nl));
      i = start + size;
      if (!okName(name)) continue;
      let data = u8.subarray(start, start + size);
      const cap = Math.min(name === 'project.json' ? LIMIT.json : LIMIT.entry, LIMIT.total - total);
      if (method === 8) {
        if (typeof DecompressionStream === 'undefined') continue;
        const rd = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(); const parts = []; let n = 0;
        for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > cap) { rd.cancel(); throw new Error('.lmz の中身が大きすぎます'); } parts.push(value); }
        data = new Uint8Array(n); let o = 0; for (const p of parts) { data.set(p, o); o += p.length; }
      } else if (method !== 0) continue;
      else if (data.length > cap) throw new Error('.lmz の中身が大きすぎます');
      total += data.length; out[name] = data;
    }
    return out;
  }

  const FORMATS = {
    mp4: { n: 'MP4（H.264 / AAC）', ext: 'mp4', v: ['avc', 'vp9'], a: ['aac', 'opus'], desc: 'YouTube・SNS・ほぼ全ての環境で再生可能', container: 'mp4' },
    mov: { n: 'MOV（H.264 / AAC）', ext: 'mov', v: ['avc'], a: ['aac'], desc: 'Final Cut Pro・Premiere・DaVinci向け', container: 'mov' },
    mp4hevc: { n: 'MP4（H.265 / HEVC）', ext: 'mp4', v: ['hevc'], a: ['aac', 'opus'], desc: '高画質・小容量（対応端末のみ）', container: 'mp4' },
    webm: { n: 'WebM（VP9 / Opus）', ext: 'webm', v: ['vp9', 'vp8'], a: ['opus'], desc: 'Web向け・軽量', container: 'webm' },
    webmAlpha: { n: 'WebM 透過（VP9 アルファ）', ext: 'webm', v: ['vp9', 'vp8'], a: ['opus'], alpha: true, desc: '背景透過のまま Premiere / DaVinci / AE（プラグイン要）/ Web へ', container: 'webm' },
    png: { n: 'PNG連番（透過対応）', ext: 'zip', seq: true, desc: 'After Effects・Premiere・DaVinci に最も確実に透過で読み込める' },
    gif: { n: 'GIFアニメ', ext: 'gif', gif: true, desc: 'SNS・チャット用のループ素材（短い区間向け）' },
  };

  async function checkSupport(fmt, W, H, fps) {
    const MB = window.Mediabunny;
    const f = FORMATS[fmt];
    if (f.seq || f.gif) return { ok: true };
    if (!MB || typeof VideoEncoder === 'undefined') return { ok: false, msg: 'このブラウザーは動画エンコード（WebCodecs）に対応していません。Chrome / Edge の最新版をお使いください。PNG連番・GIFは書き出せます。' };
    let vc = null;
    for (const c of f.v) {
      try { if (await MB.canEncodeVideo(c, { width: W, height: H, frameRate: fps, alpha: f.alpha ? 'keep' : undefined })) { vc = c; break; } } catch (e) {}
    }
    if (!vc) return { ok: false, msg: `${f.n} の映像エンコードにこの環境が対応していません。別の形式をお試しください。` };
    let ac = null;
    for (const c of f.a) { try { if (await MB.canEncodeAudio(c)) { ac = c; break; } } catch (e) {} }
    const vwarn = vc !== f.v[0] ? 'この環境ではH.264が使えないため、映像をVP9で格納したMP4になります（古い再生環境では再生できない場合があります。WebMもお試しください）。' : null;
    return { ok: true, vc, ac, warn: vwarn || (ac && f.a[0] !== ac ? `AACが使えないため音声は${ac.toUpperCase()}で書き出します（再生環境によっては音が出ない場合があります）。` : !ac ? '音声エンコードに非対応のため映像のみ書き出します。' : null) };
  }

  /*
   * run export. o = {fmt, W, H, fps, t0, t1, mode:{transparent,key}, quality:'high'|..., includeAudio, project, images, onProgress(p, msg), signal:{cancel}}
   */
  async function run(o) {
    try { return await run0(o); } finally { if (run.last && run.last.gl) { const ext = run.last.gl.getExtension('WEBGL_lose_context'); ext && ext.loseContext(); } run.last = null; }
  }
  async function run0(o) {
    const f = FORMATS[o.fmt];
    const imgs = LM.video ? await LM.video.forExport(o.images, Math.max(o.W, o.H) * 1.2) : o.images;
    const r = new LM.Renderer({ W: o.W, H: o.H, images: imgs, audio: { analysis: LM.audio.analysis, spectrum: LM.audio.spectrum, waveAt: LM.audio.waveAt } });
    r.setProject(o.project); run.last = r;
    try { return await runFrames(o, r); } finally { if (imgs && imgs.__dispose) await imgs.__dispose(); }
  }
  async function runFrames(o, r) {
    const f = FORMATS[o.fmt];
    const n = Math.max(1, Math.round((o.t1 - o.t0) * o.fps));
    const mode = o.mode || {};
    const tick = () => new Promise((res) => setTimeout(res, 0));
    /* true sub-frame motion blur: N samples across a 180° shutter, averaged in float with premultiplied alpha */
    const mb = Math.max(1, Math.min(32, Math.round(o.mblur || 1)));
    const rend = async (t) => { if (r.prepareVideos) await r.prepareVideos(t); r.render(t, mode); };
    let frameAt = async (t) => { await rend(t); return r.out; };
    if (mb > 1) {
      const sc = document.createElement('canvas'); sc.width = o.W; sc.height = o.H;
      const sx = sc.getContext('2d', { willReadFrequently: true });
      const oc = document.createElement('canvas'); oc.width = o.W; oc.height = o.H;
      const ox = oc.getContext('2d');
      const N = o.W * o.H, acc = new Float32Array(N * 4), img = ox.createImageData(o.W, o.H), od = img.data;
      const shutter = (o.shutter ?? 0.5) / o.fps;
      frameAt = async (t) => {
        acc.fill(0);
        for (let k = 0; k < mb; k++) {
          await rend(Math.max(0, t + ((k + 0.5) / mb - 0.5) * shutter));
          sx.clearRect(0, 0, o.W, o.H); sx.drawImage(r.out, 0, 0, o.W, o.H);
          const d = sx.getImageData(0, 0, o.W, o.H).data;
          for (let i = 0, j = 0; i < N; i++, j += 4) { const a = d[j + 3]; if (!a) continue; const f = a / 255; acc[j] += d[j] * f; acc[j + 1] += d[j + 1] * f; acc[j + 2] += d[j + 2] * f; acc[j + 3] += a; }
        }
        for (let i = 0, j = 0; i < N; i++, j += 4) { const a = acc[j + 3] / mb; if (a <= 0.01) { od[j + 3] = 0; continue; } const pa = acc[j + 3] / 255; od[j] = acc[j] / pa; od[j + 1] = acc[j + 1] / pa; od[j + 2] = acc[j + 2] / pa; od[j + 3] = a; }
        ox.putImageData(img, 0, 0);
        return oc;
      };
      frameAt.canvas = oc;
    }
    const outCanvas = () => frameAt.canvas || r.out;
    const name = (o.project.title || 'lyric-motion').replace(/[\\/:*?"<>|]+/g, '_');
    if (f.seq) {
      const zip = new Zip();
      let dir = o.dirHandle || null;
      for (let i = 0; i < n; i++) {
        if (o.signal && o.signal.cancel) throw new Error('キャンセルしました');
        const fc = await frameAt(o.t0 + i / o.fps);
        const blob = await new Promise((res) => fc.toBlob(res, 'image/png'));
        const fname = `${name}_${String(i).padStart(5, '0')}.png`;
        if (dir) { const fh = await dir.getFileHandle(fname, { create: true }); const w = await fh.createWritable(); await w.write(blob); await w.close(); }
        else zip.add(fname, new Uint8Array(await blob.arrayBuffer()));
        o.onProgress && o.onProgress((i + 1) / n, `${i + 1} / ${n} フレーム`);
        if (i % 3 === 0) await tick();
      }
      if (dir) return { blob: null, name: null, note: 'フォルダーに書き出しました' };
      return { blob: zip.blob(), name: `${name}_png.zip` };
    }
    if (f.gif) {
      const G = window.gifenc;
      const gw = o.W, gh = o.H;
      const cv = document.createElement('canvas'); cv.width = gw; cv.height = gh;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      const enc = G.GIFEncoder();
      const delay = Math.round(1000 / o.fps);
      for (let i = 0; i < n; i++) {
        if (o.signal && o.signal.cancel) throw new Error('キャンセルしました');
        const fc = await frameAt(o.t0 + i / o.fps);
        cx.clearRect(0, 0, gw, gh); cx.drawImage(fc, 0, 0, gw, gh);
        const data = cx.getImageData(0, 0, gw, gh).data;
        if (mode.transparent && !mode.key) {
          const pal = G.quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true });
          const idx = G.applyPalette(data, pal, 'rgba4444');
          let ti = pal.findIndex((c) => c[3] === 0);
          enc.writeFrame(idx, gw, gh, { palette: pal, delay, transparent: ti >= 0, transparentIndex: Math.max(0, ti), dispose: 2 });
        } else {
          const pal = G.quantize(data, 256);
          const idx = G.applyPalette(data, pal);
          enc.writeFrame(idx, gw, gh, { palette: pal, delay });
        }
        o.onProgress && o.onProgress((i + 1) / n, `${i + 1} / ${n} フレーム`);
        if (i % 2 === 0) await tick();
      }
      enc.finish();
      return { blob: new Blob([enc.bytes()], { type: 'image/gif' }), name: `${name}.gif` };
    }
    // video
    const MB = window.Mediabunny;
    const sup = await checkSupport(o.fmt, o.W, o.H, o.fps);
    if (!sup.ok) throw new Error(sup.msg);
    const stream = !!o.writable;
    const fmtObj = f.container === 'mov' ? new MB.MovOutputFormat({ fastStart: stream ? false : 'in-memory' }) : f.container === 'webm' ? new MB.WebMOutputFormat() : new MB.Mp4OutputFormat({ fastStart: stream ? false : 'in-memory' });
    const output = new MB.Output({ format: fmtObj, target: stream ? new MB.StreamTarget(o.writable, { chunked: true }) : new MB.BufferTarget() });
    const q = { low: MB.QUALITY_MEDIUM, high: MB.QUALITY_HIGH, max: MB.QUALITY_VERY_HIGH }[o.quality || 'high'] || MB.QUALITY_HIGH;
    const vcfg = { codec: sup.vc, bitrate: q, keyFrameInterval: 2 };
    if (f.alpha) vcfg.alpha = 'keep';
    const vs = new MB.CanvasSource(outCanvas(), vcfg);
    output.addVideoTrack(vs, { frameRate: o.fps });
    let as = null;
    const ab = o.includeAudio && sup.ac ? LM.audio.slice(o.t0, o.t1) : null;
    if (ab) { as = new MB.AudioBufferSource({ codec: sup.ac, bitrate: MB.QUALITY_HIGH }); output.addAudioTrack(as); }
    await output.start();
    if (as) { as.add(ab).catch((e) => console.warn(e)); }
    for (let i = 0; i < n; i++) {
      if (o.signal && o.signal.cancel) { await output.cancel(); throw new Error('キャンセルしました'); }
      await frameAt(o.t0 + i / o.fps);
      await vs.add(i / o.fps, 1 / o.fps);
      o.onProgress && o.onProgress((i + 1) / n * 0.98, `${i + 1} / ${n} フレーム`);
      if (i % 4 === 0) await tick();
    }
    if (as) as.close();
    vs.close();
    await output.finalize();
    o.onProgress && o.onProgress(1, '完了');
    const mime = f.container === 'webm' ? 'video/webm' : f.container === 'mov' ? 'video/quicktime' : 'video/mp4';
    if (stream) return { blob: null, name: null, note: 'ディスクに書き込みました', warn: sup.warn };
    return { blob: new Blob([output.target.buffer], { type: mime }), name: `${name}${f.alpha ? '_alpha' : ''}.${f.ext}`, warn: sup.warn };
  }

  async function still(o) {
    const imgs = LM.video ? await LM.video.forExport(o.images, Math.max(o.W, o.H) * 1.2) : o.images;
    const r = new LM.Renderer({ W: o.W, H: o.H, images: imgs, audio: { analysis: LM.audio.analysis, spectrum: LM.audio.spectrum, waveAt: LM.audio.waveAt } });
    r.setProject(o.project);
    try { if (r.prepareVideos) await r.prepareVideos(o.t); r.render(o.t, o.mode || {}); } finally { if (imgs && imgs.__dispose) await imgs.__dispose(); }
    const blob = await new Promise((res) => r.out.toBlob(res, 'image/png'));
    return { blob, name: `${(o.project.title || 'frame').replace(/[\\/:*?"<>|]+/g, '_')}_${o.t.toFixed(2)}s.png` };
  }

  return { FORMATS, checkSupport, run, still, Zip, unzip };
})();
