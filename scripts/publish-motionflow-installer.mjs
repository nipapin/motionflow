// Publish immutable payloads first, then atomically switch the installer pointer.
// Uses the existing R2 variables; credentials never leave this process.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
const args = Object.fromEntries(process.argv.slice(2).filter(a=>a.startsWith("--")&&a.includes("=")).map(a=>{const i=a.indexOf("=");return [a.slice(2,i),a.slice(i+1)];}));
const dry = process.argv.includes("--dry-run");
const version = args.version;
if (!/^\d+\.\d+\.\d+$/.test(version || "") || !args.zip || !args.ffmpeg || !args.setup) throw Error("Use --version=x.y.z --zip=panel.zip --ffmpeg=ffmpeg.exe --setup=Setup.exe [--dry-run]");
// Same Adobe tool shipped by Bolt CEP. Verify before uploading any payload or
// switching either pointer; a plain unsigned ZIP must never become a release.
const signer = process.env.ZXP_SIGN_CMD || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../CEP/motionflow-cep/node_modules/vite-cep-plugin/lib/bin", process.platform === "win32" ? "ZXPSignCmd.exe" : "ZXPSignCmd");
const verification = spawnSync(signer, ["-verify", path.resolve(args.zip)], { encoding:"utf8", windowsHide:true, timeout:180000 });
if (verification.error || verification.status !== 0 || !verification.stdout?.includes("Signature verified successfully")) throw Error("Adobe signature verification failed; refusing to publish CEP");
console.log("Adobe ZXP signature verified");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const zip = await readFile(args.zip), ffmpeg = await readFile(args.ffmpeg), gzip = gzipSync(ffmpeg,{level:9});
if (sha(ffmpeg)!=="301f347e36adba474b0708c8113eac4326210a9ee9d9e8ee5c584934b597a796") throw Error("FFmpeg differs from the licensed pinned build");
const assets = [
  { id:"cep", key:`public/downloads/motionflow/${version}/motionflow.zip`, bytes:zip.length, sha256:sha(zip) },
  { id:"ffmpeg", key:`public/downloads/motionflow/runtime/ffmpeg/${sha(ffmpeg)}.exe.gz`, bytes:gzip.length, sha256:sha(gzip), unpackedBytes:ffmpeg.length, unpackedSha256:sha(ffmpeg) },
];
const setupBytes = await readFile(args.setup);
if (setupBytes.length > 15*1024*1024 || setupBytes.subarray(0,2).toString() !== "MZ") throw Error("Invalid online Setup executable");
const setup = {key:`public/downloads/motionflow/${version}/MotionFlow-Setup.exe`,bytes:setupBytes.length,sha256:sha(setupBytes)};
const manifest = { schema:1, product:"motionflow", version, assets, setup };
if (dry) { console.log(JSON.stringify(manifest,null,2)); process.exit(0); }
const env = name => { if (!process.env[name]) throw Error(`Missing ${name}`); return process.env[name]; };
const client = new S3Client({region:process.env.R2_REGION||"auto",endpoint:process.env.R2_ENDPOINT||`https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env("R2_ACCESS_KEY_ID"),secretAccessKey:env("R2_SECRET_ACCESS_KEY")}});
const bucket = env("R2_PUBLIC_BUCKET");
for (const [i,a] of [...assets,setup].entries()) {
  let existing;
  try { existing=await client.send(new HeadObjectCommand({Bucket:bucket,Key:a.key})); } catch(e) { if (e.$metadata?.httpStatusCode!==404) throw e; }
  if (existing && (existing.Metadata?.sha256!==a.sha256 || existing.ContentLength!==a.bytes)) throw Error(`Refusing to overwrite immutable ${a.id||"setup"} asset; publish a new version`);
  if (!existing) await client.send(new PutObjectCommand({Bucket:bucket,Key:a.key,Body:[zip,gzip,setupBytes][i],ContentType:"application/octet-stream",Metadata:{sha256:a.sha256},CacheControl:"public, max-age=31536000, immutable"}));
  console.log(`Published ${a.id||"setup"}: ${a.bytes} bytes, SHA-256 ${a.sha256}`);
}
await client.send(new PutObjectCommand({Bucket:bucket,Key:"public/downloads/motionflow/installer/latest.json",Body:JSON.stringify(manifest),ContentType:"application/json",CacheControl:"no-store"}));
const cdn=(process.env.R2_PUBLIC_CDN||"https://cdn.motionflow.pro").replace(/\/+$/,""), cep=assets[0];
await client.send(new PutObjectCommand({Bucket:bucket,Key:"public/downloads/motionflow/latest.json",Body:JSON.stringify({product:"motionflow",version,channel:"stable",zxpUrl:`${cdn}/${cep.key}`,sha256:cep.sha256,changelog:args.changelog||"Small Go online installer",publishedAt:new Date().toISOString(),ffmpeg:{win:`${cdn}/public/downloads/ffmpeg/win/ffmpeg.exe`,mac:`${cdn}/public/downloads/ffmpeg/mac/ffmpeg-mac.zip`}}),ContentType:"application/json",CacheControl:"public, max-age=60"}));
console.log(`Installer and CEP update pointers now use ${version}`);
