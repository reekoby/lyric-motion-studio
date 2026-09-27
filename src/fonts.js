/* Web font loading (Google Fonts, on demand) + user font upload */
'use strict';
LM.fonts = (() => {
  const D = LM.data;
  const linked = new Map();
  let onChange = null;
  function link(id) {
    const f = D.fontById[id];
    if (!f || !f.g) return Promise.resolve();
    if (linked.has(id)) return linked.get(id);
    const pr = new Promise((res) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = `https://fonts.googleapis.com/css2?family=${f.g}&display=block`;
      l.onload = () => res(true); l.onerror = () => res(false);
      document.head.appendChild(l);
      setTimeout(() => res(false), 8000);
    });
    linked.set(id, pr);
    return pr;
  }
  async function ensure(id, text) {
    const f = D.fontById[id] || D.fontById.sans;
    await link(f.id);
    const sample = (text || '') + (/^英字/.test(f.cat || '') ? 'AaQq0,.\'"' : /^韓国語/.test(f.cat || '') ? '한글Aa0' : 'あア漢Aa0');
    const ws = new Set([f.w, ...(f.ws || [])]);
    try {
      await Promise.race([
        Promise.all([...ws].map((w) => document.fonts.load(`${f.id === 'playfair' ? 'italic ' : ''}${w} 40px "${f.fam}"`, sample))),
        new Promise((r) => setTimeout(r, 7000)),
      ]);
    } catch (e) {}
  }
  async function ensureProject(p) {
    const R = LM.Renderer;
    const jobs = new Map();
    const add = (id, txt) => { const k = id; jobs.set(k, (jobs.get(k) || '') + txt); };
    p.cues.forEach((c) => { const F = R.fontOf(p, c); add(F.f.id, c.text); if (F.lf) add(F.lf.id, c.text.replace(/[^\x20-\x7e‘’“”…À-ɏ¿¡«»]/g, '')); if (F.kf && /[가-힯]/.test(c.text)) add(F.kf.id, c.text.replace(/[^가-힯ᄀ-ᇿ㄰-㆏]/g, '')); });
    add(R.fontOf(p, null).f.id, (p.title || '') + (p.artist || ''));
    await Promise.all([...jobs].map(([id, txt]) => ensure(id, Array.from(new Set(Array.from(txt))).join(''))));
    LM.typo.clearCache();
  }
  let customN = 0;
  async function addCustom(file) {
    const buf = await file.arrayBuffer();
    const fam = 'LMUser' + (++customN);
    const ff = new FontFace(fam, buf);
    await ff.load();
    document.fonts.add(ff);
    const id = 'user' + customN;
    const entry = { id, n: file.name.replace(/\.(ttf|otf|woff2?)$/i, ''), fam, g: null, w: 400, cat: 'アップロード', ws: [400] };
    D.fonts.push(entry); D.fontById[id] = entry;
    LM.typo.clearCache();
    return entry;
  }
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { LM.typo.clearCache(); onChange && onChange(); });
  return { link, ensure, ensureProject, addCustom, set onChange(fn) { onChange = fn; } };
})();
