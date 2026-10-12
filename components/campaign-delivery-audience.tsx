"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampaignTestSend } from "@/components/campaign-test-send";
import type { CampaignDraft } from "@/lib/campaigns/shared";
import { AUDIENCE_OPERATORS, AUDIENCE_OPERATOR_LABELS, emptyCampaignAudience, type AudienceField, type AudiencePreview, type CampaignAudience, type CampaignDelivery, type CampaignMailOptions } from "@/lib/campaigns/audience-shared";

type Options = { fields: AudienceField[]; authors: { id: number; label: string }[]; mail: CampaignMailOptions };
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const panelClass = "space-y-5 rounded-2xl border border-border bg-card/50 p-5";
const filters = [
  { key: "subscription", label: "Subscription", values: [["all", "Any"], ["has", "Has subscription history"], ["none", "No subscriptions"], ["active", "Has active subscription"], ["no_active", "No active subscription"]] },
  { key: "verified", label: "Email confirmed", values: [["all", "Any"], ["verified", "Confirmed"], ["unverified", "Not confirmed"]] },
  { key: "mailing", label: "Mailing preference", values: [["all", "Any"], ["opted_in", "Opted in"], ["opted_out", "Not opted in"]] },
  { key: "purchases", label: "Purchases", values: [["all", "Any"], ["has", "Has purchases"], ["none", "No purchases"]] },
  { key: "devices", label: "Extension devices", values: [["all", "Any"], ["has", "Has active devices"], ["none", "No active devices"]] },
  { key: "role", label: "Account role", values: [["all", "Any"], ["buyer", "Buyer"], ["partner", "Partner"], ["author", "Author"], ["admin", "Admin"]] },
] as const;

export function CampaignDeliveryAudience({ draft, productName, disabled, testDisabled, onChange, onBusyChange }: {
  draft: CampaignDraft; productName: string; disabled: boolean; testDisabled: boolean; onChange: (draft: CampaignDraft) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [listName, setListName] = useState("");
  const listKey = useRef<string | null>(null);
  const delivery: CampaignDelivery = draft.delivery || { provider: "resend", from_email: options?.mail.resend.addresses[0] || "", from_name: draft.site_origin.includes("premieregal") ? "Premiere Gal" : "Motion Flow" };
  const audience = draft.audience;
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/campaigns/options", { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load audience fields and sender options");
      if (!controller.signal.aborted) setOptions(data);
    }).catch(err => { if (!controller.signal.aborted) setOptionsError(err.message); });
    return () => controller.abort();
  }, []);

  function setAudience(next: CampaignAudience | null) {
    setPreview(null); setError(""); listKey.current = null;
    onChange({ ...draft, audience: next, recipients_source: "", delivery: { ...delivery, mailing_list: null } });
  }
  function setDelivery(patch: Partial<CampaignDelivery>) { onChange({ ...draft, delivery: { ...delivery, ...patch } }); }
  function changeRule(index: number, patch: Partial<CampaignAudience["rules"][number]>) {
    if (audience) setAudience({ ...audience, rules: audience.rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule) });
  }
  async function run(action: "preview" | "import" | "mailing_list") {
    if (!audience || busy || disabled) return;
    setBusy(action); onBusyChange(true); setError("");
    if (action === "mailing_list" && !listKey.current) listKey.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/admin/campaigns/audience", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, audience, ...(action === "mailing_list" ? { key: listKey.current, name: listName || draft.name } : {}) }),
      });
      const data = await response.json() as AudiencePreview & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load the audience");
      setPreview(data);
      if (data.recipients_source) onChange({ ...draft, recipients_source: data.recipients_source, delivery: { ...delivery, mailing_list: data.mailing_list || null } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load the audience";
      if (/different audience|membership changed/.test(message)) listKey.current = null;
      setError(message);
    }
    finally { setBusy(""); onBusyChange(false); }
  }

  return <>
    <section className={panelClass}>
      <div><h2 className="font-semibold">Email delivery</h2><p className="mt-1 text-xs text-muted-foreground">Choose the service and the sender recipients will see.</p></div>
      {optionsError ? <p role="alert" className="text-sm text-destructive">{optionsError}</p> : null}
      <fieldset disabled={disabled || !options} className="grid min-w-0 gap-5 md:grid-cols-3">
        <label className="space-y-2 text-xs text-muted-foreground">Sending service<select aria-label="Sending service" className={selectClass} value={delivery.provider} onChange={e => {
          const provider = e.target.value as CampaignDelivery["provider"];
          setDelivery({ provider, from_email: options?.mail[provider].addresses[0] || "", mailing_list: null });
        }}><option value="resend">Resend</option><option value="mailgun">Mailgun</option></select></label>
        <label className="space-y-2 text-xs text-muted-foreground">Sender name<Input value={delivery.from_name} maxLength={100} onChange={e => setDelivery({ from_name: e.target.value })} placeholder="Motion Flow" /></label>
        <label className="space-y-2 text-xs text-muted-foreground">From email<Input type="email" list="campaign-sender-addresses" value={delivery.from_email} maxLength={254} onChange={e => setDelivery({ from_email: e.target.value })} placeholder="hello@example.com" /><datalist id="campaign-sender-addresses">{options?.mail[delivery.provider].addresses.map(address => <option key={address} value={address} />)}</datalist></label>
      </fieldset>
      {options ? <p className="text-xs text-muted-foreground">{options.mail[delivery.provider].configured ? `Sending domains: ${options.mail[delivery.provider].domains.join(", ")}. Choose a suggested address or enter an address on these domains.` : `${delivery.provider === "mailgun" ? "Mailgun" : "Resend"} credentials are not configured on this server.`}</p> : <p className="text-xs text-muted-foreground">Loading sender options…</p>}
      <CampaignTestSend draft={draft} delivery={delivery} productName={productName} disabled={testDisabled || !options?.mail[delivery.provider].configured} onBusyChange={onBusyChange} />
    </section>
    <section className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Audience</h2><p className="mt-1 text-xs text-muted-foreground">Choose recipients using account fields and access filters.</p></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(audience)} disabled={disabled || !options} onChange={e => setAudience(e.target.checked ? emptyCampaignAudience() : null)} /> Choose users from database</label>
      </div>
      {audience && options ? <>
        <fieldset disabled={disabled} className="min-w-0 space-y-5">
          <div className="space-y-2"><p className="text-xs text-muted-foreground">Author audience — no selection includes all users</p><div className="flex flex-wrap gap-3 rounded-lg border border-border/50 p-3">{options.authors.map(author => <label key={author.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={audience.authorIds.includes(author.id)} onChange={e => setAudience({ ...audience, authorIds: e.target.checked ? [...audience.authorIds, author.id] : audience.authorIds.filter(id => id !== author.id) })} />{author.label}</label>)}</div><p className="text-xs text-muted-foreground">Author users include subscription records, purchases and extension devices.</p></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filters.map(filter => <label key={filter.key} className="space-y-2 text-xs text-muted-foreground">{filter.label}<select aria-label={filter.label} className={selectClass} value={audience[filter.key]} onChange={e => setAudience({ ...audience, [filter.key]: e.target.value })}>{filter.values.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}</div>
          <div className="space-y-3 border-t border-border/50 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-medium">User field conditions</h3><label className="flex items-center gap-2 text-xs text-muted-foreground">Match<select className={selectClass} value={audience.match} onChange={e => setAudience({ ...audience, match: e.target.value as "all" | "any" })}><option value="all">All conditions</option><option value="any">Any condition</option></select></label></div>
            {audience.rules.map((rule, index) => {
              const field = options.fields.find(field => field.name === rule.field);
              return <div key={index} className="grid items-center gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <select aria-label={`Condition ${index + 1} field`} className={selectClass} value={rule.field} onChange={e => changeRule(index, { field: e.target.value, operator: "eq", value: "" })}>{options.fields.map(field => <option key={field.name} value={field.name}>{field.label}</option>)}</select>
                <select aria-label={`Condition ${index + 1} operator`} className={selectClass} value={rule.operator} onChange={e => changeRule(index, { operator: e.target.value })}>{AUDIENCE_OPERATORS[field?.kind || "text"].map(operator => <option key={operator} value={operator}>{AUDIENCE_OPERATOR_LABELS[operator]}</option>)}</select>
                <Input aria-label={`Condition ${index + 1} value`} type={field?.kind === "date" ? "datetime-local" : field?.kind === "number" ? "number" : "text"} value={rule.value} disabled={["empty", "not_empty"].includes(rule.operator)} placeholder="Value" onChange={e => changeRule(index, { value: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove condition ${index + 1}`} onClick={() => setAudience({ ...audience, rules: audience.rules.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /></Button>
              </div>;
            })}
            <Button type="button" variant="outline" size="sm" disabled={audience.rules.length >= 30 || !options.fields.length} onClick={() => setAudience({ ...audience, rules: [...audience.rules, { field: options.fields.find(field => field.name === "email")?.name || options.fields[0].name, operator: "eq", value: "" }] })}><Plus className="mr-2 h-3.5 w-3.5" />Add condition</Button>
          </div>
          {delivery.provider === "mailgun" ? <label className="block space-y-2 text-xs text-muted-foreground">Mailgun mailing list name<Input value={listName} placeholder={draft.name || "Author audience"} maxLength={150} onChange={e => { setListName(e.target.value); listKey.current = null; }} /></label> : null}
        </fieldset>
        <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={disabled} onClick={() => void run("preview")}>{busy === "preview" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Preview audience</Button><Button type="button" disabled={disabled} onClick={() => void run("import")}>Use audience in campaign</Button>{delivery.provider === "mailgun" ? <Button type="button" variant="outline" disabled={disabled || !options.mail.mailgun.configured || !(listName || draft.name).trim()} onClick={() => void run("mailing_list")}>{busy === "mailing_list" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create Mailgun mailing list</Button> : null}</div>
        <p className="text-xs text-muted-foreground">Changing filters clears the previous recipient snapshot. Preview and load the new audience before saving. Up to 5,000 recipients per campaign.</p>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {draft.delivery?.mailing_list ? <p className="break-all text-sm text-blue-400">Mailgun list: {draft.delivery.mailing_list}</p> : null}
        {preview ? <div className="space-y-3 rounded-lg border border-border/50 p-4"><p role="status" className="text-sm"><strong>{preview.total.toLocaleString()}</strong> matching users{preview.recipients != null ? ` · ${preview.recipients} recipients loaded` : " · showing up to 50"}</p><div className="max-h-48 overflow-auto"><table className="w-full text-left text-xs"><thead className="text-muted-foreground"><tr><th className="py-2">User</th><th>Email</th></tr></thead><tbody>{preview.users.map(user => <tr key={user.id} className="border-t border-border/40"><td className="py-2">{user.name || `#${user.id}`}</td><td>{user.email}</td></tr>)}</tbody></table></div></div> : null}
      </> : <p className="text-sm text-muted-foreground">Enter recipients or upload a CSV below, or enable the database audience builder.</p>}
    </section>
  </>;
}
