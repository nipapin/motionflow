import env from '@next/env';
import { S3Client, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

// Read-only: validate the uploaded folders and ZIP definitions before binding projects.
env.loadEnvConfig(process.cwd());
const bucket = 'motionflow-odin';
const output = path.resolve('.cache/odin-migration/current');
fs.mkdirSync(output, { recursive: true });
const client = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
const bytes = async (key, range) => {
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, ...(range ? { Range: range } : {}) }));
  return Buffer.from(await result.Body.transformToByteArray());
};
const digest = data => createHash('sha256').update(data).digest('hex');
try {
  for (const prefix of ['odin-pro-ae', 'odin-pro-pr', 'odin-pro-ae-free', 'odin-pro-pr-free']) {
    const inventory = new Map();
    let token;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix + '/', ContinuationToken: token }));
      for (const item of page.Contents || []) if (!item.Key.endsWith('/')) inventory.set(item.Key.slice(prefix.length + 1), item.Size);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    const manifestBytes = await bytes(prefix + '/manifest.json');
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (!Array.isArray(manifest) || !manifest.length) throw Error('Invalid manifest: ' + prefix);
    const paths = new Set();
    for (const entry of manifest) {
      if (!entry.path || entry.path.startsWith('/') || entry.path.includes('\\') || entry.path.split('/').includes('..') || paths.has(entry.path)) throw Error('Invalid manifest path: ' + prefix);
      paths.add(entry.path);
      if (!/^[a-f0-9]{64}$/i.test(entry.hash) || inventory.get(entry.path) !== entry.size) throw Error('Inventory mismatch: ' + prefix + '/' + entry.path);
    }
    const definitions = manifest.filter(entry => /\.odin$/i.test(entry.path));
    if (definitions.length !== 1) throw Error('Expected one definition: ' + prefix);
    const definition = definitions[0];
    const packBytes = await bytes(prefix + '/' + definition.path);
    if (digest(packBytes) !== definition.hash) throw Error('Definition hash mismatch: ' + prefix);
    const pack = JSON.parse(packBytes.toString('utf8').replace(/^\uFEFF/, ''));
    const structure = pack.structure ?? pack.contents ?? pack.content ?? pack.settings?.contents;
    const host = prefix.includes('-ae') ? 'AE' : 'PR';
    const edition = prefix.endsWith('-free') ? 'DEMO' : '1.2.0';
    if (!structure || !Object.keys(structure).length || pack.settings?.main?.software_id !== host || pack.settings.main.version !== edition) throw Error('Invalid pack: ' + prefix);
    for (const folder of ['Assets/', 'Previews/', 'Fonts/']) if (![...inventory.keys()].some(key => key.startsWith(folder))) throw Error('Missing folder: ' + prefix + '/' + folder);

    // Read the ZIP central directory and its small definition, without fetching GBs of media.
    const archiveKey = prefix + '.zip';
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: archiveKey }));
    const tail = await bytes(archiveKey, `bytes=${Math.max(0, head.ContentLength - 65557)}-`);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw Error('Invalid ZIP: ' + prefix);
    const count = tail.readUInt16LE(eocd + 10), size = tail.readUInt32LE(eocd + 12), offset = tail.readUInt32LE(eocd + 16);
    const directory = await bytes(archiveKey, `bytes=${offset}-${offset + size - 1}`);
    const zipFiles = new Map();
    let position = 0;
    for (let i = 0; i < count; i++) {
      if (directory.readUInt32LE(position) !== 0x02014b50) throw Error('Invalid ZIP directory');
      const nameSize = directory.readUInt16LE(position + 28), extra = directory.readUInt16LE(position + 30), comment = directory.readUInt16LE(position + 32);
      const name = directory.subarray(position + 46, position + 46 + nameSize).toString('utf8');
      if (zipFiles.has(name)) throw Error('Duplicate ZIP path: ' + name);
      zipFiles.set(name, { size: directory.readUInt32LE(position + 24), compressed: directory.readUInt32LE(position + 20), method: directory.readUInt16LE(position + 10), offset: directory.readUInt32LE(position + 42) });
      position += 46 + nameSize + extra + comment;
    }
    for (const entry of manifest) if (zipFiles.get(entry.path)?.size !== entry.size) throw Error('ZIP inventory mismatch: ' + entry.path);
    for (const name of zipFiles.keys()) if (!name.endsWith('/') && name !== 'manifest.json' && !paths.has(name)) throw Error('Unexpected ZIP file: ' + name);
    for (const [name, expected] of [[definition.path, packBytes], ['manifest.json', manifestBytes]]) {
      const entry = zipFiles.get(name);
      if (!entry) throw Error('Missing ZIP file: ' + name);
      const header = await bytes(archiveKey, `bytes=${entry.offset}-${entry.offset + 29}`);
      const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
      const compressed = await bytes(archiveKey, `bytes=${start}-${start + entry.compressed - 1}`);
      const actual = entry.method === 0 ? compressed : entry.method === 8 ? inflateRawSync(compressed) : null;
      if (!actual || !actual.equals(expected)) throw Error('ZIP differs from folder: ' + name);
    }
    const dir = path.join(output, prefix);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, definition.path), packBytes);
    fs.writeFileSync(path.join(dir, 'manifest.json'), manifestBytes);
    console.log(JSON.stringify({ prefix, host, edition, files: manifest.length, categories: Object.keys(structure).length, zipBytes: head.ContentLength, inventoryMatches: true, zipDefinitionMatches: true }));
  }
} finally { client.destroy(); }
