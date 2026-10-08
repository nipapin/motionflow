"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Mail, Users, Gift, Upload, Check, Play, Pause, ArrowLeft, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SUBSCRIPTIONS, type Campaign, type CampaignDraft, type CampaignTemplate } from "@/lib/campaigns/shared";
import galTemplate from "@/docs/email-templates/premieregal-course.json";
import galExtension from "@/docs/email-templates/premieregal-course-extension.json";

type Summary={id:string;name:string;status:string;total:number;sent:number;errors:number;created_at:string};
type Preview={kind:string;email:string;subject:string;html:string;text:string};
type Item={id:number;name:string;authorId:number};
const STATUS:Record<string,string>={draft:"Draft",preparing:"Checking",prepared:"Checked",applying:"Granting access",applied:"Access granted",sending:"Sending",completed:"Completed",pending:"Pending",ready:"Ready to send",sent:"Accepted by Resend"};
const selectClass="h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const panel="rounded-2xl border border-border bg-card/50 p-5";
const generic:CampaignTemplate={
  subject:"Your {{product_name}} access is ready",
  text:"Hi {{first_name}},\n\n{{access_summary}}\n\nYour sign-in email: {{account_email}}\n\n{{account_instructions}}\n\n{{access_label}}:\n{{access_url}}\n\nThe Motion Flow Team",
  html:'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:28px 12px;background:#070b14;font-family:Arial,sans-serif;color:#e2e8f0"><table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width:560px;margin:auto"><tr><td style="padding:28px;background:#0f172a;border-radius:16px"><p style="color:#93c5fd;font-size:13px">MOTION FLOW</p><h1 style="font-size:28px;line-height:1.2">Your {{product_name}} access is ready</h1><p>Hi {{first_name}},</p><p style="line-height:1.6">{{access_summary}}</p><p>Your sign-in email: <strong>{{account_email}}</strong></p><p style="line-height:1.6">{{account_instructions}}</p><a href="{{access_url}}" style="display:block;padding:16px;background:#2563eb;border-radius:8px;text-align:center;color:white;text-decoration:none">{{access_label}}</a></td></tr></table></body></html>',
};
const empty=():CampaignDraft=>({name:"",site_origin:"https://motionflow.pro",grant:{kind:"invite",subscription:"premiere_gal",duration:"year",itemId:null},template:{...generic},extension_template:null,recipients_source:""});
async function request<T>(path:string,method="GET",body?:unknown):Promise<T> {
  const response=await fetch(`/api/admin/campaigns${path}`,{method,headers:body ? {"Content-Type":"application/json"} : undefined,body:body ? JSON.stringify(body) : undefined});
  const data=await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to complete this action");
  return data;
}
const date=(value:string|null)=>value ? new Date(value.includes("T") ? value : value.replace(" ","T")+"Z").toLocaleDateString("en-US",{timeZone:"UTC"}) : "—";
const compactTextarea="h-32 min-h-0 max-h-32 resize-none overflow-auto font-mono text-xs";
const escapePreview=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]!);

function sampleEmailValues(draft:CampaignDraft,product:string,extension:boolean):Record<string,string> {
  const site=draft.site_origin.replace(/\/$/,"");
  const setup=`${site}/reset-password?email=alex%40example.com&token=PREVIEW_ONLY&source=invite`;
  const expires=draft.grant.duration==="month"?"February 15, 2027":"January 15, 2028";
  return {
    first_name:"Alex",last_name:"Example",email:"alex@example.com",account_email:"alex@example.com",
    product_name:product,duration:draft.grant.duration==="month"?"one month":draft.grant.duration==="year"?"one year":"unlimited access",
    starts_at:"January 15, 2027",expires_at:draft.grant.duration==="unlimited"?"Unlimited":expires,
    login_url:`${site}/`,setup_password_url:extension?"":setup,access_url:extension?`${site}/`:setup,
    access_label:extension?`Open ${product}`:"Set your password",
    account_instructions:extension?"Sign in to your existing account using your usual password or Continue with Google, if that is how you normally sign in.":"We have created your account for you. Set your password using the button below, then sign in with the email address above. This personal link is valid for 7 days. If it expires, use Forgot password on the website.",
    access_summary:draft.grant.kind==="invite"?"Your account is ready.":draft.grant.duration==="unlimited"?`Your ${product} access has no expiration date.`:`Your ${product} access is available through ${expires}.`,
  };
}

function TemplateEditor({title,description,value,previewValues,onChange,disabled}:{title:string;description:string;value:CampaignTemplate;previewValues:Record<string,string>;onChange:(value:CampaignTemplate)=>void;disabled:boolean}) {
  const [error,setError]=useState("");
  const previewHtml=value.html.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(match,key)=>Object.hasOwn(previewValues,key)?escapePreview(previewValues[key]):match);
  async function load(file:File) {
    try {
      if (file.size>500000) throw new Error("File must be smaller than 500 KB");
      const source=await file.text();
      if (file.name.endsWith(".json")) {
        const template=JSON.parse(source);
        if (!["subject","text","html"].every(key=>typeof template[key]==="string" && template[key].trim())) throw new Error("JSON must contain subject, text, and html");
        onChange({subject:template.subject,text:template.text,html:template.html});
      } else {
        const parsed=new DOMParser().parseFromString(source,"text/html");
        onChange({...value,html:source,text:parsed.body.innerText || parsed.body.textContent || value.text,subject:parsed.title || value.subject});
      }
      setError("");
    } catch(err) {setError(err instanceof Error?err.message:"Unable to read file");}
  }
  return <section className={panel}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{title}</h3><label className="flex cursor-pointer items-center gap-2 text-xs text-blue-400"><Upload className="h-4 w-4"/>Upload JSON / HTML<input type="file" accept=".json,.html,.htm" className="sr-only" disabled={disabled} onChange={e=>{const file=e.target.files?.[0];if(file)void load(file);e.target.value="";}}/></label></div>
    <p className="mb-4 min-h-10 text-xs leading-5 text-muted-foreground">{description}</p>
    {error && <p role="alert" className="mb-3 text-sm text-red-400">{error}</p>}
    <label className="mb-4 block space-y-2 text-xs text-muted-foreground">Subject<Input value={value.subject} disabled={disabled} onChange={e=>onChange({...value,subject:e.target.value})}/></label>
    <iframe title={`${title} preview`} sandbox="" referrerPolicy="no-referrer" className="h-80 w-full rounded-lg border bg-white sm:h-96" srcDoc={previewHtml}/>
    <p className="mt-2 text-xs text-muted-foreground">Sample preview with fictional details. Check the campaign to see actual recipient messages.</p>
    <details className="mt-4 border-t pt-3">
      <summary className="cursor-pointer text-xs text-muted-foreground">Edit HTML and plain text</summary>
      <div className="mt-3 grid gap-3"><label className="space-y-2 text-xs text-muted-foreground">HTML<Textarea style={{fieldSizing:"fixed"}} className={compactTextarea} value={value.html} disabled={disabled} onChange={e=>onChange({...value,html:e.target.value})}/></label><label className="space-y-2 text-xs text-muted-foreground">Plain text<Textarea style={{fieldSizing:"fixed"}} className={compactTextarea} value={value.text} disabled={disabled} onChange={e=>onChange({...value,text:e.target.value})}/></label></div>
    </details>
  </section>;
}

export function AdminCampaigns() {
  const [list,setList]=useState<Summary[]>([]);
  const [campaign,setCampaign]=useState<Campaign|null>(null);
  const [draft,setDraft]=useState<CampaignDraft|null>(null);
  const [tab,setTab]=useState("setup");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState<string|null>(null);
  const [previews,setPreviews]=useState<Preview[]>([]);
  const [previewIndex,setPreviewIndex]=useState(0);
  const [itemQuery,setItemQuery]=useState("");
  const [items,setItems]=useState<Item[]>([]);
  const [itemName,setItemName]=useState("");
  const stop=useRef(false);
  useEffect(()=>()=>{stop.current=true;},[]);
  const refreshList=async()=>setList((await request<{campaigns:Summary[]}>("")).campaigns);
  useEffect(()=>{void refreshList().catch(err=>setError(err.message));},[]);
  useEffect(()=>{
    if (!itemQuery.trim()) {setItems([]);return;}
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{void fetch(`/api/admin/users/items?q=${encodeURIComponent(itemQuery)}`,{signal:controller.signal}).then(r=>r.json()).then(data=>setItems(data.items||[])).catch(()=>{});},250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[itemQuery]);
  const editable=!campaign || campaign.status==="draft";
  const disabled=Boolean(busy) || !editable;
  async function refresh(id:string) {
    const result=await request<Campaign>(`/${id}`);
    setCampaign(result);
    return result;
  }
  async function open(id:string) {
    setBusy("load");setError("");setPreviews([]);setTab("setup");
    try {const loaded=await refresh(id);setDraft(loaded);setItemName(loaded.grant.kind==="item"?loaded.product_name:"");}
    catch(err){setError(err instanceof Error?err.message:"Something went wrong");}
    finally{setBusy(null);}
  }
  async function save() {
    if (!draft) return;
    setBusy("save");setError("");
    try {
      const result=await request<{id:string;duplicates:number;total:number}>(campaign?`/${campaign.id}`:"",campaign?"PUT":"POST",draft);
      await refresh(result.id);await refreshList();
      setTab("recipients");
    } catch(err){setError(err instanceof Error?err.message:"Something went wrong");}
    finally{setBusy(null);}
  }
  async function run(action:"prepare"|"apply"|"send") {
    if (!campaign) return;
    stop.current=false;setBusy(action);setError("");
    let steps=0;
    try {
      if(action==="prepare" && campaign.status==="draft" && draft) {
        await request(`/${campaign.id}`,"PUT",draft);
        await refresh(campaign.id);
      }
      while(!stop.current) {
        const result=await request<{done:boolean;previews?:Preview[]}>(`/${campaign.id}/${action}`,"POST");
        steps++;
        if (steps%3===0 || result.done) await refresh(campaign.id);
        if (result.done) {
          if(result.previews){setPreviews(result.previews);setPreviewIndex(0);setTab("preview");}
          break;
        }
        if(action==="send")await new Promise(resolve=>window.setTimeout(resolve,650));
      }
      await refresh(campaign.id);await refreshList();
    } catch(err){setError(err instanceof Error?err.message:"Something went wrong");await refresh(campaign.id).catch(()=>{});}
    finally{setBusy(null);}
  }
  async function editAgain() {
    if(!campaign)return;
    setBusy("edit");setError("");
    try{await request(`/${campaign.id}/draft`,"POST");await refresh(campaign.id);await refreshList();}
    catch(err){setError(err instanceof Error?err.message:"Something went wrong");}finally{setBusy(null);}
  }
  async function importRecipients(file:File) {
    if(file.size>2000000){setError("Recipient list must be smaller than 2 MB");return;}
    const source=await file.text();setDraft(previous=>previous?{...previous,recipients_source:source}:previous);
  }
  function setGrant(value:Partial<CampaignDraft["grant"]>) {setDraft(previous=>previous?{...previous,grant:{...previous.grant,...value,...(value.kind==="subscription" && previous.grant.duration==="unlimited"?{duration:"year" as const}:{})}}:previous);}
  function galPreset(){setDraft(previous=>previous?{...previous,name:previous.name||"Premiere Gal · course students",site_origin:"https://premieregal.motionflow.pro",grant:{kind:"subscription",subscription:"premiere_gal",duration:"year",itemId:null},template:{...galTemplate},extension_template:{...galExtension}}:previous);}
  const checked=campaign?.recipients.filter(r=>r.action).length||0;
  const ready=(campaign?.counts.ready||0)+(campaign?.counts.sending||0)+(campaign?.counts.sent||0);
  const progress=busy==="prepare"?checked:busy==="send"?(campaign?.counts.sent||0):ready;
  const preview=previews[previewIndex];
  const previewProduct=draft?.grant.kind==="subscription"?SUBSCRIPTIONS.find(sub=>sub.value===draft.grant.subscription)?.label||"Subscription":draft?.grant.kind==="item"?itemName||campaign?.product_name||"Product":"Motion Flow";

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">Administration</p><h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1><p className="mt-2 max-w-xl text-sm text-muted-foreground">Manage recipients, access, and emails in one place.</p></div>{!draft && <Button onClick={()=>{setCampaign(null);setDraft(empty());setPreviews([]);setError("");}}><Plus className="mr-2 h-4 w-4"/>Create campaign</Button>}</header>
    {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>}
    {!draft ? <div className={panel}>
      {!list.length?<div className="py-14 text-center"><Mail className="mx-auto mb-4 h-9 w-9 text-blue-400"/><h2 className="font-medium">Create your first campaign</h2><p className="mt-2 text-sm text-muted-foreground">Invite users or grant them access to subscriptions and products.</p></div>:<div className="overflow-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr><th className="pb-3">Campaign</th><th>Status</th><th>Recipients</th><th>Sent</th><th>Errors</th></tr></thead><tbody>{list.map(row=><tr key={row.id} className="border-b last:border-0"><td className="py-4"><button className="text-left font-medium text-blue-400 hover:underline" onClick={()=>void open(row.id)}>{row.name}</button><p className="mt-1 text-xs text-muted-foreground">{date(row.created_at)}</p></td><td>{STATUS[row.status]||row.status}</td><td>{row.total}</td><td>{row.sent||0}</td><td className={Number(row.errors)>0?"text-red-400":"text-muted-foreground"}>{row.errors||0}</td></tr>)}</tbody></table></div>}
    </div>:<>
      <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={()=>{setDraft(null);setCampaign(null);setError("");void refreshList();}}><ArrowLeft className="mr-2 h-4 w-4"/>All campaigns</Button><div className="flex items-center gap-3">{campaign?.environment && <span className={campaign.environment==="sandbox"?"rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-400":"rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400"}>Paddle · {campaign.environment}</span>}<span className="rounded-full border px-3 py-1 text-xs">{STATUS[campaign?.status||"draft"]}</span></div></div>
      {campaign && <div className="grid gap-3 sm:grid-cols-3">{[{icon:Users,label:"Recipients",value:campaign.total},{icon:Gift,label:"Access ready",value:ready},{icon:Mail,label:"Accepted by Resend",value:campaign.counts.sent||0}].map(metric=><div key={metric.label} className={panel}><metric.icon className="mb-3 h-5 w-5 text-blue-400"/><p className="text-3xl font-semibold">{metric.value}</p><p className="mt-1 text-xs text-muted-foreground">{metric.label}</p></div>)}</div>}
      <div className="flex gap-1 border-b">{[{id:"setup",label:"Setup"},{id:"recipients",label:"Recipients"},{id:"preview",label:"Preview"}].map(item=><button key={item.id} onClick={()=>setTab(item.id)} className={`px-4 py-3 text-sm ${tab===item.id?"border-b-2 border-blue-400 text-blue-400":"text-muted-foreground"}`}>{item.label}</button>)}</div>
      {tab==="setup" && <div className="space-y-5">
        {editable && <details className="rounded-xl border border-border px-5 py-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">Use a preset</summary>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-xs leading-5 text-muted-foreground">The Premiere Gal course preset sets the sign-in site, selects one year of Gal Toolkit MAX access, and replaces both email templates.</p>
            <Button size="sm" variant="outline" disabled={disabled} onClick={galPreset}>Apply Premiere Gal course preset</Button>
          </div>
        </details>}
        <section className={panel}><h2 className="mb-5 font-semibold">What recipients receive</h2><div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2 text-xs text-muted-foreground">Campaign name<Input placeholder="For example: course student bonus" value={draft.name} disabled={disabled} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
          <label className="space-y-2 text-xs text-muted-foreground">Sign-in site<select className={selectClass} value={draft.site_origin} disabled={disabled} onChange={e=>setDraft({...draft,site_origin:e.target.value})}><option value="https://motionflow.pro">Motion Flow</option><option value="https://premieregal.motionflow.pro">Premiere Gal</option><option value="https://spunkramv2.motionflow.pro">Spunkram</option></select></label>
          <label className="space-y-2 text-xs text-muted-foreground">Access type<select className={selectClass} value={draft.grant.kind} disabled={disabled} onChange={e=>setGrant({kind:e.target.value as CampaignDraft["grant"]["kind"]})}><option value="invite">Site invitation</option><option value="subscription">Subscription</option><option value="item">Product access</option></select></label>
          {draft.grant.kind==="subscription" && <label className="space-y-2 text-xs text-muted-foreground">Subscription<select className={selectClass} value={draft.grant.subscription} disabled={disabled} onChange={e=>setGrant({subscription:e.target.value})}>{SUBSCRIPTIONS.map(sub=><option key={sub.value} value={sub.value}>{sub.label}</option>)}</select></label>}
          {draft.grant.kind!=="invite" && <label className="space-y-2 text-xs text-muted-foreground">Access duration<select className={selectClass} value={draft.grant.duration} disabled={disabled} onChange={e=>setGrant({duration:e.target.value as CampaignDraft["grant"]["duration"]})}><option value="month">1 month</option><option value="year">1 year</option>{draft.grant.kind==="item" && <option value="unlimited">Unlimited</option>}</select></label>}
          {draft.grant.kind==="item" && <div className="space-y-2"><label className="text-xs text-muted-foreground">Product<Input value={itemQuery} placeholder="Product name or ID" disabled={disabled} onChange={e=>setItemQuery(e.target.value)}/></label>{draft.grant.itemId && <p className="text-xs text-blue-400">Selected: {itemName||campaign?.product_name||draft.grant.itemId}</p>}{items.length>0 && <div className="max-h-40 overflow-auto rounded-lg border">{items.map(item=><button key={item.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-foreground/5" disabled={disabled} onClick={()=>{setGrant({itemId:item.id});setItemName(item.name);setItems([]);setItemQuery("");}}>{item.name}<span className="ml-2 text-xs text-muted-foreground">#{item.id}</span></button>)}</div>}</div>}
        </div>{draft.grant.kind==="subscription" && <p className="mt-5 rounded-lg bg-blue-500/10 p-3 text-xs leading-relaxed text-blue-300">Active subscriptions are extended after the current period ends. Paddle renewals are postponed until the bonus access ends, with no additional charge. Canceled subscriptions are not resumed.</p>}</section>
        <section className={panel}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Recipient list</h2><label className="flex cursor-pointer items-center gap-2 text-xs text-blue-400"><Upload className="h-4 w-4"/>Upload CSV / TXT<input type="file" accept=".csv,.txt" className="sr-only" disabled={disabled} onChange={e=>{const file=e.target.files?.[0];if(file)void importRecipients(file);e.target.value="";}}/></label></div><Textarea style={{fieldSizing:"fixed"}} className={compactTextarea} placeholder={'Email,First Name,Last Name\nalex@example.com,Alex,Example\n\nOr enter one email per line'} value={draft.recipients_source} disabled={disabled} onChange={e=>setDraft({...draft,recipients_source:e.target.value})}/><p className="mt-3 text-xs text-muted-foreground">Up to 5,000 recipients. Identical entries are merged. Add an Account Email column if the account address differs from the recipient address.</p></section>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" disabled={disabled} checked={Boolean(draft.extension_template)} onChange={e=>setDraft({...draft,extension_template:e.target.checked?{...generic,subject:"Your {{product_name}} access has been extended"}:null})}/>Use a separate email when extending existing access</label>
        <div className={draft.extension_template?"grid items-start gap-5 xl:grid-cols-2":""}>
          <TemplateEditor title="Welcome & access email" description="Sent for invitations and new access grants, including existing accounts without active access." value={draft.template} previewValues={sampleEmailValues(draft,previewProduct,false)} disabled={disabled} onChange={template=>setDraft({...draft,template})}/>
          {draft.extension_template && <TemplateEditor title="Access extension email" description="Sent when a recipient's existing subscription or product access is extended." value={draft.extension_template} previewValues={sampleEmailValues(draft,previewProduct,true)} disabled={disabled} onChange={template=>setDraft({...draft,extension_template:template})}/>}
        </div>
        <details className="rounded-lg border p-3"><summary className="cursor-pointer text-xs text-muted-foreground">Available template variables</summary><p className="mt-2 font-mono text-xs leading-6 text-muted-foreground">{"{{first_name}} · {{account_email}} · {{product_name}} · {{duration}} · {{access_summary}} · {{starts_at}} · {{expires_at}} · {{account_instructions}} · {{access_url}} · {{access_label}} · {{login_url}}"}</p></details>
      </div>}
      {tab==="recipients" && <section className={panel}>{!campaign?<p className="text-sm text-muted-foreground">Save the campaign to check recipients.</p>:<div className="max-h-[600px] overflow-auto"><table className="w-full text-left text-xs"><thead className="border-b text-muted-foreground"><tr><th className="pb-3">Recipient</th><th>Account</th><th>Grant</th><th>Access until</th><th>Status</th></tr></thead><tbody>{campaign.recipients.map(r=><tr key={r.id} className="border-b align-top last:border-0"><td className="py-3"><p>{r.email}</p>{r.last_error && <p className="mt-1 max-w-xs text-red-400">{r.last_error}</p>}</td><td className="py-3">{r.action?(r.created_user?"New":r.account_email):"Not checked"}</td><td className="py-3">{r.action==="extend_access"?"Extension":r.action==="keep_existing"?"Access preserved":r.action==="grant_access"?"New access":r.action==="invite"?"Invitation":"—"}</td><td className="py-3">{r.action && !r.expires_at && draft.grant.kind!=="invite"?"Unlimited":date(r.expires_at)}</td><td className="py-3">{STATUS[r.state]||r.state}</td></tr>)}</tbody></table></div>}</section>}
      {tab==="preview" && <section className={panel}>{!previews.length?<div className="py-8 text-center"><FileText className="mx-auto mb-3 h-7 w-7 text-blue-400"/><p className="text-sm text-muted-foreground">Click Check and preview emails to see personalized messages.</p></div>:<><div className="mb-4 flex flex-wrap gap-2">{previews.map((p,index)=><Button key={p.kind} size="sm" variant={index===previewIndex?"default":"outline"} onClick={()=>setPreviewIndex(index)}>{p.kind==="new"?"New account":p.kind==="extended"?"Extension":"Existing account"}</Button>)}</div><p className="mb-1 text-xs text-muted-foreground">To: {preview.email}</p><h3 className="mb-4 font-medium">{preview.subject}</h3><iframe title="Email preview" sandbox="" className="h-96 w-full rounded-lg border bg-white" srcDoc={preview.html}/><details className="mt-4"><summary className="cursor-pointer text-xs text-muted-foreground">Plain text</summary><pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-6">{preview.text}</pre></details><p className="mt-3 text-xs text-muted-foreground">Preview links use the inactive PREVIEW_ONLY token. Real tokens are generated when emails are sent.</p></>}</section>}
      <footer className="sticky bottom-3 z-10 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur"><div className="flex flex-wrap items-center justify-between gap-4"><div className="max-w-sm text-xs leading-5 text-muted-foreground">{busy && ["prepare","apply","send"].includes(busy)?<><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>{busy==="prepare"?"Checking":busy==="send"?"Sending":"Granting access"}: {progress} / {campaign?.total}</>:<>Leaving this page stops processing after the current recipient. You can resume the campaign later.</>}</div><div className="flex flex-wrap gap-2">{busy && ["prepare","apply","send"].includes(busy)?<Button variant="outline" onClick={()=>{stop.current=true;}}><Pause className="mr-2 h-4 w-4"/>Stop after current recipient</Button>:<>
        {editable && <Button disabled={Boolean(busy)} onClick={()=>void save()}>{busy==="save"?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Check className="mr-2 h-4 w-4"/>}Save draft</Button>}
        {campaign && ["preparing","prepared"].includes(campaign.status) && <Button variant="ghost" disabled={Boolean(busy)} onClick={()=>void editAgain()}>Edit</Button>}
        {campaign && ["draft","preparing","prepared"].includes(campaign.status) && <Button variant="outline" disabled={Boolean(busy)} onClick={()=>void run("prepare")}>Check and preview emails</Button>}
        {campaign && ["prepared","applying"].includes(campaign.status) && <Button disabled={Boolean(busy)} onClick={()=>void run("apply")}><Gift className="mr-2 h-4 w-4"/>Grant access{campaign.status==="applying"?" · resume":""}</Button>}
        {campaign && ["applied","sending"].includes(campaign.status) && <Button disabled={Boolean(busy)} onClick={()=>void run("send")}><Play className="mr-2 h-4 w-4"/>Send emails{campaign.status==="sending"?" · resume":""}</Button>}
      </>}</div></div></footer>
    </>}
  </div>;
}
