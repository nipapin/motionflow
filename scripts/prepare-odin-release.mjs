import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { ZipArchive } from 'archiver';

// Builds a new bundle from an immutable local source copy. Never edits the source.
const [sourceArg, definitionArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !definitionArg || !outputArg) throw new Error('Usage: node scripts/prepare-odin-release.mjs <source-directory> <JSON.odin> <new-output-directory>');
const source = path.resolve(sourceArg), output = path.resolve(outputArg);
if (output === source || output.startsWith(source + path.sep) || source.startsWith(output + path.sep)) throw new Error('Source and output must not overlap');
if (fs.existsSync(output) || fs.existsSync(output + '.zip')) throw new Error('Output already exists; inspect it before rebuilding');
const definitionBytes = await fsp.readFile(definitionArg);
const definition = JSON.parse(definitionBytes.toString('utf8').replace(/^\uFEFF/, ''));
const host = definition.settings?.main?.software_id;
if (!['AE', 'PR'].includes(host) || !(definition.structure ?? definition.content ?? definition.contents)) throw new Error('Invalid JSON pack');
const manifest = JSON.parse(await fsp.readFile(path.join(source, 'manifest.json'), 'utf8'));
if (!Array.isArray(manifest)) throw new Error('Expected array manifest');
const definitions = manifest.filter(e => /\.odin$/i.test(e.path));
if (definitions.length !== 1) throw new Error('Exactly one original .odin is required');
const seen = new Set();
const safePath = value => {
  if (typeof value !== 'string' || !value || /[\\:]/.test(value) || value.startsWith('/') || value.split('/').some(s => !s || s === '.' || s === '..')) throw new Error('Unsafe manifest path');
  const key = value.toLowerCase();
  if (seen.has(key)) throw new Error('Duplicate manifest path');
  seen.add(key);
  return value;
};
const hashFile = async file => {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
};
const verified = [];
for (const entry of manifest) {
  const rel = safePath(entry.path);
  if (rel === 'manifest.json') continue;
  const file = path.join(source, rel);
  const stat = await fsp.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Expected regular file: ' + rel);
  const hash = await hashFile(file);
  if (hash !== entry.hash?.toLowerCase() || (entry.size != null && stat.size !== entry.size)) throw new Error('Source hash/size mismatch: ' + rel);
  verified.push({ path: rel, size: stat.size, hash });
}
console.log(JSON.stringify({ host, sourceFilesVerified: verified.length }));
const renameRoot = rel => {
  const [first, ...rest] = rel.split('/');
  const name = ({ 'Odin Pro After Effects': 'Assets', 'Odin Pro Premiere Pro': 'Assets', 'Odin Pro Preview Assets': 'Previews', 'Odin Pro Fonts': 'Fonts' })[first] ?? first;
  return [name, ...rest].join('/');
};
const releaseManifest = [];
const targets = new Set();
for (const entry of verified) {
  const rel = renameRoot(entry.path);
  if (targets.has(rel.toLowerCase())) throw new Error('Mapped path collision: ' + rel);
  targets.add(rel.toLowerCase());
  const dest = path.join(output, rel);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  if (/\.odin$/i.test(entry.path)) {
    await fsp.writeFile(dest, definitionBytes, { flag: 'wx' });
    releaseManifest.push({ name: path.basename(rel), path: rel, size: definitionBytes.length, hash: crypto.createHash('sha256').update(definitionBytes).digest('hex') });
  } else {
    await fsp.copyFile(path.join(source, entry.path), dest, fs.constants.COPYFILE_EXCL);
    releaseManifest.push({ name: path.basename(rel), path: rel, size: entry.size, hash: entry.hash });
  }
}
releaseManifest.sort((a, b) => a.path.localeCompare(b.path, 'en'));
await fsp.writeFile(path.join(output, 'manifest.json'), JSON.stringify(releaseManifest, null, 2), { flag: 'wx' });
const archive = new ZipArchive({ zlib: { level: 6 } });
const writing = pipeline(archive, fs.createWriteStream(output + '.zip', { flags: 'wx' }));
archive.directory(output, false);
await archive.finalize();
await writing;
const report = { host, name: definition.settings.main.name, version: definition.settings.main.version,
  files: releaseManifest.length, zip: path.basename(output) + '.zip', zipBytes: (await fsp.stat(output + '.zip')).size,
  zipSha256: await hashFile(output + '.zip'), sourceFilesVerified: verified.length };
await fsp.writeFile(output + '.report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
