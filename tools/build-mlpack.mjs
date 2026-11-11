// Builds the optional ML pack (lms-ml-pack.lmsml) from the TensorFlow.js graph models published in the npm package
// @vladmandic/human-models (MIT). The pack is data only (model topology + weights): the code that runs it (TensorFlow.js)
// is part of the app, so loading a pack never executes anything.
//   npm pack @vladmandic/human-models && tar xzf vladmandic-human-models-*.tgz
//   node tools/build-mlpack.mjs <path to package/models> [out]
import fs from 'fs';
import path from 'path';
const dir = process.argv[2], out = process.argv[3] || 'lms-ml-pack.lmsml';
if (!dir) { console.error('usage: node tools/build-mlpack.mjs <human-models/package/models> [out]'); process.exit(1); }
const pick = { seg: 'selfie', face: 'blazeface', pose: 'movenet-lightning' };
const models = {}, blobs = []; let ofs = 0;
for (const [role, name] of Object.entries(pick)) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8'));
  const weightSpecs = [], parts = [];
  for (const g of j.weightsManifest) { weightSpecs.push(...g.weights); for (const p of g.paths) parts.push(fs.readFileSync(path.join(dir, p))); }
  const bin = Buffer.concat(parts);
  models[role] = { name, format: j.format, generatedBy: j.generatedBy || '', convertedBy: j.convertedBy || '', signature: j.signature || null, userDefinedMetadata: j.userDefinedMetadata || null, modelTopology: j.modelTopology, weightSpecs, ofs, len: bin.length };
  blobs.push(bin); ofs += bin.length;
}
const header = Buffer.from(JSON.stringify({ v: 1, app: 'Lyric Motion Studio', created: new Date().toISOString().slice(0, 10), source: '@vladmandic/human-models (MIT) — TensorFlow.js graph models: selfie segmentation (PINTO model zoo / MediaPipe, Apache-2.0), BlazeFace (MediaPipe, Apache-2.0), MoveNet Lightning (Google, Apache-2.0)', models }), 'utf8');
const len = Buffer.alloc(4); len.writeUInt32LE(header.length, 0);
fs.writeFileSync(out, Buffer.concat([Buffer.from('LMSML1\n', 'ascii'), len, header, ...blobs]));
console.log(out, (fs.statSync(out).size / 1048576).toFixed(2) + ' MB', Object.keys(models).map((k) => k + ':' + models[k].name).join(' '));
