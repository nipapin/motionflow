import "server-only";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { Resend } from "resend";
import { getPool } from "@/lib/db";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";
import { getSubscription, moveCampaignBillingDate } from "@/lib/paddle-api";
import { mailFromAddress } from "@/lib/mail/resend-mailer";
import { ensurePasswordResetTokensTable } from "@/lib/auth/password-reset";
import { PREMIERE_GAL_PRICE_IDS } from "@/lib/premiere-gal-paddle-config";
import { SPUNKRAM_LIBRARY_SUBSCRIPTION_PRICE_IDS, SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS, getSpunkramExtraGenPacks } from "@/lib/spunkram-paddle-config";
import { getExtraGenPacks } from "@/lib/extra-generation-packs";
import { parseRecipients, validateTemplate, renderCampaignEmail, skipsAccess } from "./core.mjs";
import { decode, inspectRecipient, applyRecipient, sendRecipient } from "./engine.mjs";
import type { Campaign, CampaignDraft } from "./shared";

let schemaReady: Promise<void> | undefined;
export function ensureCampaignTables() {
  if (!schemaReady) schemaReady = (async () => {
    const sql = readFileSync(resolve(process.cwd(),"db/migrations/2026_10_08_admin_campaigns.sql"),"utf8");
    for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) await getPool().query(statement);
  })().catch(error => { schemaReady = undefined; throw error; });
  return schemaReady;
}

export function campaignCatalog(subscription: string, duration: string) {
  const yearly = duration !== "month";
  const account = subscription.startsWith("spunkram") ? "spunkram" as const : "default" as const;
  const environment = (account === "spunkram" ? process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_ENVIRONMENT : process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT)?.toLowerCase();
  if (!["sandbox","production"].includes(environment || "")) throw new Error("Paddle environment must be explicitly configured");
  const creator = {monthly:process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_MONTHLY || "",yearly:process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_YEARLY || ""};
  const creatorAi = {monthly:process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_MONTHLY || "",yearly:process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_YEARLY || ""};
  const catalogs = {
    premiere_gal:{authorId:4141,name:"Gal Toolkit MAX",prices:PREMIERE_GAL_PRICE_IDS,all:PREMIERE_GAL_PRICE_IDS},
    spunkram_library:{authorId:1691,name:"Editor",prices:SPUNKRAM_LIBRARY_SUBSCRIPTION_PRICE_IDS,all:{...SPUNKRAM_LIBRARY_SUBSCRIPTION_PRICE_IDS,aiMonthly:SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS.monthly,aiYearly:SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS.yearly}},
    spunkram_ai:{authorId:1691,name:"Editor AI",prices:SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS,all:{...SPUNKRAM_LIBRARY_SUBSCRIPTION_PRICE_IDS,aiMonthly:SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS.monthly,aiYearly:SPUNKRAM_AI_TOOLKIT_SUBSCRIPTION_PRICE_IDS.yearly}},
    motionflow_creator:{authorId:null,name:"Creator",prices:creator,all:{...creator,aiMonthly:creatorAi.monthly,aiYearly:creatorAi.yearly}},
    motionflow_creator_ai:{authorId:null,name:"Creator + AI",prices:creatorAi,all:{...creator,aiMonthly:creatorAi.monthly,aiYearly:creatorAi.yearly}},
  };
  const selected = catalogs[subscription as keyof typeof catalogs];
  if (!selected) throw new Error("Unknown subscription");
  return {...selected,priceId:selected.prices[yearly ? "yearly" : "monthly"],tierPriceIds:Object.values(selected.prices).filter(Boolean),allPriceIds:Object.values(selected.all).filter(Boolean),excludedPriceIds:[...getExtraGenPacks(),...getSpunkramExtraGenPacks()].map(p=>p.priceId).filter(Boolean),plan:duration === "unlimited" ? "lifetime" : yearly ? "yearly" : "monthly",account,environment};
}

async function servicesFor(campaign: CampaignDraft & {environment?:string|null}) {
  let item: {id:number;name:string;author_id:number}|null = null;
  if (campaign.grant.kind === "item") {
    const [items] = await getPool().execute<RowDataPacket[]>(`SELECT id,name,author_id FROM \`${marketplaceItemsTable()}\` WHERE id=? AND deleted_at IS NULL`,[campaign.grant.itemId]);
    if (!items[0]) throw new Error("Selected item is no longer available");
    item = {id:Number(items[0].id),name:String(items[0].name),author_id:Number(items[0].author_id)};
  }
  return {
    item,
    catalog:(name:string,duration:string) => {
      const catalog = campaignCatalog(name,duration);
      if (campaign.environment && catalog.environment !== campaign.environment) throw new Error("Campaign Paddle environment changed; use the original environment");
      return catalog;
    },
    paddle:{get:(id:string,account:"default"|"spunkram") => getSubscription(id,{account,signal:AbortSignal.timeout(30_000)}),move:(id:string,target:string,account:"default"|"spunkram") => moveCampaignBillingDate(id,target,{account})},
    from:mailFromAddress(new URL(campaign.site_origin).hostname === "premieregal.motionflow.pro" ? "Premiere Gal" : "Motion Flow"),
    get mail() { return new Resend(process.env.RESEND_API_KEY); },
  };
}

type DbCampaign = RowDataPacket & {id:string;name:string;config_json:unknown;status:string;created_at:Date;last_error:string|null};
type DbRecipient = RowDataPacket & {id:number;state:string;plan_json:unknown;last_error:string|null};
async function readCampaign(conn: PoolConnection,id:string) {
  const [rows] = await conn.execute<DbCampaign[]>("SELECT * FROM admin_campaigns WHERE id=?",[id]);
  if (!rows[0]) throw new Error("Campaign not found");
  return {...rows[0],...decode(rows[0].config_json),id:rows[0].id,status:rows[0].status};
}

async function locked<T>(id:string,work:(conn:PoolConnection)=>Promise<T>) {
  await ensureCampaignTables();
  const conn = await getPool().getConnection();
  let acquired = false;
  try {
    await conn.execute("SET time_zone = '+00:00'");
    const [rows] = await conn.execute<RowDataPacket[]>("SELECT GET_LOCK(?,0) AS acquired",[`admin-campaign:${id}`]);
    acquired = Number(rows[0].acquired) === 1;
    if (!acquired) throw new Error("Campaign is being processed; retry shortly");
    return await work(conn);
  } finally {
    try {
      await conn.execute("SET @account_audit_actor_id=NULL,@account_audit_source=NULL");
      if (acquired) await conn.execute("SELECT RELEASE_LOCK(?)",[`admin-campaign:${id}`]);
      conn.release();
    } catch { conn.destroy(); }
  }
}

export async function listCampaigns() {
  await ensureCampaignTables();
  const [rows] = await getPool().execute<RowDataPacket[]>("SELECT c.id,c.name,c.status,c.created_at,c.last_error,COUNT(r.id) AS total,SUM(r.state='sent') AS sent,SUM(r.last_error IS NOT NULL) AS errors FROM admin_campaigns c LEFT JOIN admin_campaign_recipients r ON r.campaign_id=c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100");
  return rows;
}

export async function getCampaign(id:string): Promise<Campaign> {
  return locked(id,async conn => {
    const campaign = await readCampaign(conn,id);
    const [rows] = await conn.execute<DbRecipient[]>("SELECT id,email,account_email,first_name,last_name,user_id,created_user,action,base_at,expires_at,state,provider_id,last_error,plan_json FROM admin_campaign_recipients WHERE campaign_id=? ORDER BY id LIMIT 5000",[id]);
    const counts:Record<string,number> = {};
    for (const row of rows) counts[row.state] = (counts[row.state] || 0) + 1;
    return {...campaign,config_json:undefined,recipients:rows.map(row => ({...row,plan_json:undefined,...(row.state === "pending" ? decode(row.plan_json) || {} : {})})),counts,total:rows.length} as Campaign;
  });
}

export async function saveCampaign(draft:CampaignDraft,adminId:number,id:string=randomUUID()) {
  validateTemplate(draft.template);
  if (draft.extension_template) validateTemplate(draft.extension_template);
  const parsed = parseRecipients(draft.recipients_source);
  const services = await servicesFor(draft);
  const catalog = draft.grant.kind === "subscription" ? services.catalog(draft.grant.subscription,draft.grant.duration) : null;
  const config = {...draft,site_origin:new URL(draft.site_origin).origin,product_name:draft.grant.kind === "item" ? services.item!.name : catalog?.name || "Motion Flow",environment:catalog?.environment || null};
  return locked(id,async conn => {
    await conn.beginTransaction();
    try {
      const [rows] = await conn.execute<DbCampaign[]>("SELECT status FROM admin_campaigns WHERE id=? FOR UPDATE",[id]);
      if (rows[0] && rows[0].status !== "draft") throw new Error("Only draft campaigns can be edited");
      if (rows.length) {
        await conn.execute("UPDATE admin_campaigns SET name=?,config_json=?,last_error=NULL,updated_at=UTC_TIMESTAMP() WHERE id=?",[draft.name,JSON.stringify(config),id]);
        await conn.execute("DELETE FROM admin_campaign_recipients WHERE campaign_id=?",[id]);
      } else await conn.execute("INSERT INTO admin_campaigns (id,name,config_json,created_by) VALUES (?,?,?,?)",[id,draft.name,JSON.stringify(config),adminId]);
      for (const r of parsed.recipients) await conn.execute("INSERT INTO admin_campaign_recipients (campaign_id,email,account_email,first_name,last_name) VALUES (?,?,?,?,?)",[id,r.email,r.account_email,r.first_name,r.last_name]);
      await conn.commit();
      return {id,total:parsed.recipients.length,duplicates:parsed.duplicates};
    } catch (error) { await conn.rollback(); throw error; }
  });
}

export async function prepareCampaign(id:string) {
  return locked(id,async conn => {
    const campaign = await readCampaign(conn,id);
    const services = await servicesFor(campaign);
    const [recipients] = await conn.execute<DbRecipient[]>("SELECT * FROM admin_campaign_recipients WHERE campaign_id=? ORDER BY id",[id]);
    if (!["draft","preparing","prepared"].includes(campaign.status)) throw new Error("A launched campaign already has a fixed recipient list");
    if (campaign.status === "draft") await conn.execute("UPDATE admin_campaigns SET status='preparing',last_error=NULL,updated_at=UTC_TIMESTAMP() WHERE id=?",[id]);
    const unchecked = recipients.find(r => !r.plan_json || decode(r.plan_json)?.action === "keep_existing");
    if (unchecked) {
      try {
        const plan = await inspectRecipient(conn,campaign,unchecked,services);
        const publicPlan = {user_id:plan.user_id,created_user:plan.created_user,action:plan.action,base_at:plan.base_at,expires_at:plan.expires_at,billing_count:plan.billing?.length || 0};
        await conn.execute("UPDATE admin_campaign_recipients SET plan_json=?,last_error=NULL WHERE id=?",[JSON.stringify(publicPlan),unchecked.id]);
        return {done:false,recipientId:unchecked.id};
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not check recipient";
        await conn.execute("UPDATE admin_campaign_recipients SET last_error=? WHERE id=?",[message.slice(0,500),unchecked.id]);
        throw error;
      }
    }
    const plans = [];
    const previews: Array<{kind:string;email:string;subject:string;text:string;html:string}> = [];
    const seen = new Set();
    for (const recipient of recipients) {
      const plan = decode(recipient.plan_json);
      if (plan.user_id && seen.has(plan.user_id)) throw new Error("The same account occurs more than once in this campaign");
      if (plan.user_id) seen.add(plan.user_id);
      const publicPlan = plan;
      plans.push(publicPlan);
      if (skipsAccess(plan.action)) continue;
      const previewKind = plan.created_user ? "new" : plan.action === "extend_access" ? "extended" : "existing";
      if (!previews.some(p => p.kind === previewKind)) {
        const setup = plan.created_user ? `${campaign.site_origin}/reset-password?email=${encodeURIComponent(recipient.account_email)}&token=PREVIEW_ONLY&source=invite` : "";
        previews.push({kind:previewKind,email:recipient.email,...renderCampaignEmail(campaign,{...recipient,...plan},setup)});
      }
    }
    await conn.execute("UPDATE admin_campaigns SET status='prepared',last_error=NULL,updated_at=UTC_TIMESTAMP() WHERE id=?",[id]);
    return {done:true,total:plans.length,skipped:plans.filter(p => skipsAccess(p.action)).length,newAccounts:plans.filter(p => p.created_user).length,extensions:plans.filter(p => p.action === "extend_access").length,billingChanges:plans.reduce((n,p) => n+p.billing_count,0),previews};
  });
}

export async function processCampaign(id:string,action:"apply"|"send",adminId:number) {
  return locked(id,async conn => {
    const campaign = await readCampaign(conn,id);
    if (campaign.status === "draft") throw new Error("Check and preview the campaign before launching");
    if (action === "apply" && !["prepared","applying"].includes(campaign.status)) throw new Error("Complete campaign checks before issuing access");
    if (action === "send" && !["applied","sending","completed"].includes(campaign.status)) throw new Error("Finish issuing access before sending emails");
    const services = await servicesFor(campaign);
    if (action === "send" && !process.env.RESEND_API_KEY?.trim()) throw new Error("Resend API key is missing");
    if (action === "send") await ensurePasswordResetTokensTable();
    const where = action === "apply" ? "state IN ('pending','applied')" : "state IN ('ready','sending')";
    const [rows] = await conn.execute<DbRecipient[]>(`SELECT * FROM admin_campaign_recipients WHERE campaign_id=? AND ${where} ORDER BY id LIMIT 1`,[id]);
    if (!rows[0]) {
      await conn.execute("UPDATE admin_campaigns SET status=?,last_error=NULL,updated_at=UTC_TIMESTAMP() WHERE id=?",[action === "apply" ? "applied" : "completed",id]);
      return {done:true};
    }
    await conn.execute("UPDATE admin_campaigns SET status=?,last_error=NULL,updated_at=UTC_TIMESTAMP() WHERE id=?",[action === "apply" ? "applying" : "sending",id]);
    await conn.execute("SET @account_audit_actor_id=?,@account_audit_source='admin.campaigns'",[adminId]);
    try {
      if (action === "apply") await applyRecipient(conn,campaign,rows[0],services);
      else await sendRecipient(conn,campaign,rows[0],services);
      return {done:false,recipientId:rows[0].id};
    } catch (error) {
      const message = error instanceof Error ? error.message : "Campaign processing failed";
      await conn.execute("UPDATE admin_campaign_recipients SET last_error=? WHERE id=?",[message.slice(0,500),rows[0].id]);
      await conn.execute("UPDATE admin_campaigns SET last_error=? WHERE id=?",[message.slice(0,500),id]);
      throw error;
    }
  });
}

export async function returnCampaignToDraft(id:string) {
  return locked(id,async conn => {
    const campaign = await readCampaign(conn,id);
    if (!["draft","preparing","prepared"].includes(campaign.status)) throw new Error("A launched campaign cannot be edited");
    await conn.execute("UPDATE admin_campaign_recipients SET plan_json=NULL,last_error=NULL WHERE campaign_id=? AND state='pending'",[id]);
    await conn.execute("UPDATE admin_campaigns SET status='draft',updated_at=UTC_TIMESTAMP() WHERE id=?",[id]);
    return {ok:true};
  });
}
