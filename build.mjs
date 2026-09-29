import fs from 'fs';
import crypto from 'crypto';
const src = (f) => fs.readFileSync('src/' + f, 'utf8');
const order = ['core.js','typo.js','motion.js','motion2.js','motion3.js','motion4.js','layout.js','layout2.js','layout3.js','data.js','tone.js','bgmotion.js','bgshader.js','gfx.js','gfx2.js','trans.js','tone2.js','edge.js','motion5.js','bgfx.js','fx.js','vocalo.js','imgfirst.js','render.js','imgbg.js','video.js','align.js','audio.js','model.js','director.js','fonts.js','export.js','manual.js','i18n.js','app.js'];
let mb = fs.readFileSync('node_modules/mediabunny/dist/bundles/mediabunny.min.cjs','utf8');
mb = mb.replace(/if \(typeof module === "object"[^\n]*\n?$/,'') + '\nwindow.Mediabunny=Mediabunny;';
let gif = fs.readFileSync('node_modules/gifenc/dist/gifenc.js','utf8').replace(/\/\/# sourceMappingURL.*$/m,'');
gif = '/*! gifenc 1.0.3 | MIT License | Copyright (c) 2017 Matt DesLauriers | https://github.com/mattdesl/gifenc\n * (quantizer ported from PnnQuant.js by mcychan) */\n(function(){var exports={};' + gif + '\nwindow.gifenc=exports;})();';
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
const I18N = {};
for (const l of ['en','es','it','ko']) I18N[l] = { dict: JSON.parse(fs.readFileSync(`i18n/${l}.json`,'utf8')), manual: JSON.parse(fs.readFileSync(`i18n/manual_${l}.json`,'utf8')) };
const app = order.map(f => `/* ---- ${f} ---- */\n` + (f === 'i18n.js' ? `LM.I18N_DATA = ${JSON.stringify(I18N)};\n` : '') + src(f)).join('\n');
const REPO = process.env.LMS_REPO || (JSON.parse(fs.readFileSync('package.json', 'utf8')).homepage || 'https://github.com/');
const scripts = `<script>${esc(mb)}</script>\n<script>${esc(gif)}</script>\n<script>\n${esc(app.split('__REPO_URL__').join(REPO))}\n</script>`;
const BANNER = `<!--\n  Lyric Motion Studio — Copyright (c) 2026 ΛNTRΞC — MIT License\n  Bundles: Mediabunny (MPL-2.0, https://github.com/Vanilagy/mediabunny), gifenc (MIT, https://github.com/mattdesl/gifenc).\n  See LICENSE and THIRD_PARTY_NOTICES.md in the repository.\n-->\n`;
let html = src('index.html').replace('<!--SCRIPTS-->', () => scripts);
// public (standalone) build: strict Content-Security-Policy — only these exact inline scripts may run,
// the only network destinations are Google Fonts; everything else is local (blob:/data:)
const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => "'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
const CSP = ["default-src 'none'", `script-src ${hashes.join(' ')}`, "style-src 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com data: blob:", "img-src data: blob:", "media-src blob: data:", "worker-src blob:", "connect-src blob: data:", "base-uri 'none'", "form-action 'none'", "object-src 'none'"].join('; ');
const standalone = html.replace('<meta name="viewport"', `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<meta name="referrer" content="no-referrer">\n<meta name="viewport"`).replace('<!doctype html>', '<!doctype html>\n' + BANNER);
fs.mkdirSync('dist', {recursive:true});
fs.writeFileSync('dist/lyric-motion-studio.html', standalone);
const art = html.replace(/^[\s\S]*?<head>\s*<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*/, '').replace(/<\/head>\s*<body>\s*/, '').replace(/<\/body>\s*<\/html>\s*$/, '');
fs.writeFileSync('dist/artifact.html', art);
console.log('built', (html.length/1024).toFixed(0)+'KB');
