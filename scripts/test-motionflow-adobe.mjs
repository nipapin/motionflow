import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { NextRequest } from "next/server.js";
const require = createRequire(import.meta.url);
function load(file, mocks) {
  const module = { exports:{} };
  const code = ts.transpileModule(readFileSync(new URL("../" + file, import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function("require","module","exports",code)(name => Object.hasOwn(mocks,name) ? mocks[name] : name === "server-only" ? {} : require(name),module,module.exports);
  return module.exports;
}
test("Adobe device client uses marketplace author and platform subscription", () => {
  const registry = load("lib/cep-client-registry.ts", {"@/lib/odin-packages":{ODIN_CEP_CLIENT:"odin-cep",ODIN_PACKAGES_AUTHOR_ID:900000001},"@/lib/premiere-gal-paddle-config":{PREMIERE_GAL_AUTHOR_ID:4141},"@/lib/premiere-gal-paths":{PREMIEREGAL_SUBDOMAIN_HOST:"gal.example.test"},"@/lib/spunkram-paddle-config":{SPUNKRAM_AUTHOR_ID:1691}});
  const cfg = registry.requireCepClientConfig("motionflow-adobe");
  assert.equal(cfg.authorId,6); assert.equal(cfg.platformSubscription,true);
  assert.equal(cfg.verificationPath,"/cep/login"); assert.equal(registry.requireCepClientConfig("spunkram-cep").platformSubscription,false);
});
test("Adobe captions and chapters consume the shared site quota, Spunkram keeps author quota", async () => {
  const calls = [], siteStatus = {remaining:42}, authorStatus = {remaining:5};
  const helpers = load("lib/cep-generations.ts", {
    "@/lib/cep-client-registry":{getCepClientConfig:client=>({platformSubscription:client==="motionflow-adobe",authorId:1691}),requireCepClientConfig:()=>assert.fail()},
    "@/lib/cep-entitlements":{getActiveAuthorSubscription:async()=>({active:true}),cepAiGenerationsLimit:()=>10},
    "@/lib/generations":{getGenerationsStatus:async id=>{calls.push(["site-status",id]);return siteStatus;},consumeGeneration:async(...args)=>{calls.push(["site-consume",...args]);return {ok:true};},getCepSpunkramGenerationsStatus:async()=>authorStatus,consumeCepSpunkramGeneration:async()=>({ok:true})},
  });
  const user = {id:12,source:"cep-bearer",cepClient:"motionflow-adobe"};
  assert.equal(await helpers.generationsStatusForResolvedUser(user),siteStatus);
  assert.equal((await helpers.consumeGenerationForResolvedUser(user,"captions",2)).ok,true);
  assert.deepEqual(calls,[["site-status",12],["site-consume",12,"captions",2]]);
  assert.equal(await helpers.generationsStatusForResolvedUser({...user,cepClient:"spunkram-cep"}),authorStatus);
});
test("Adobe caption styles require Creator access and never an author subscription", async () => {
  let creators = 0, authors = 0;
  const helpers = load("lib/auth/resolve-captions-user.ts", {
    "@/lib/auth/get-session-user":{},"@/lib/cep-auth":{},
    "@/lib/subscriptions":{hasActiveMotionflowSubscription:async()=>{creators++;return true;}},
    "@/lib/cep-client-registry":{getCepClientConfig:()=>({platformSubscription:true}),requireCepClientConfig:()=>assert.fail()},
    "@/lib/cep-entitlements":{getActiveAuthorSubscription:async()=>{authors++;return {active:false};}},
  });
  assert.equal(await helpers.userCanDownloadCaptionProject({id:12,source:"cep-bearer",cepClient:"motionflow-adobe"}),true);
  assert.equal(creators,1); assert.equal(authors,0);
});
test("Adobe update stream is isolated and published archive has SHA-256", async () => {
  const writes = [];
  const release = load("lib/spunkram-release.ts", {
    "@/lib/cep-events":{publishCepExtensionUpdate:async()=>true},
    "@/lib/r2-storage":{getR2Client:()=>({send:async command=>{writes.push(command.input);return {};}}),getR2Bucket:()=>"test",r2PublicUrlForKey:key=>"https://cdn.example.test/"+key},
  });
  assert.equal(release.cepProductFromClient("motionflow-adobe"),"motionflow");
  const result = await release.publishCepProductZxp({product:"motionflow",version:"0.2.0",zxpBody:Buffer.from("archive")});
  assert.match(result.sha256,/^[a-f0-9]{64}$/); assert.match(result.zxpUrl,/motionflow\/0.2.0\/motionflow.zip$/);
  assert.equal(writes[1].Key,"public/downloads/motionflow/latest.json");
});
test("update download cannot select an arbitrary URL or a different release", async () => {
  const download = load("app/(main)/api/cep/update/download/route.ts", {"../route":{GET:async()=>Response.json({version:"0.2.0",zxpUrl:"https://cdn.example.test/motionflow.zip"})}});
  const changed = await download.GET(new NextRequest("https://example.test/api/cep/update/download?version=0.1.0&url=https://evil.test"));
  assert.equal(changed.status,409);
  const valid = await download.GET(new NextRequest("https://example.test/api/cep/update/download?version=0.2.0&url=https://evil.test"));
  assert.equal(valid.status,302); assert.equal(valid.headers.get("location"),"https://cdn.example.test/motionflow.zip");
});
