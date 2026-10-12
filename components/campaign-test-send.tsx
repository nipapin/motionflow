"use client";

import { useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CampaignDraft } from "@/lib/campaigns/shared";
import type { CampaignDelivery } from "@/lib/campaigns/audience-shared";

export function CampaignTestSend({ draft, delivery, productName, disabled, onBusyChange }: {
  draft: CampaignDraft; delivery: CampaignDelivery; productName: string;
  disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<"welcome" | "extension">("welcome");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const inFlight = useRef(false);
  const attempt = useRef<{ snapshot: string; key: string } | null>(null);
  const selectedKind = kind === "extension" && draft.extension_template ? "extension" : "welcome";
  const provider = delivery.provider === "mailgun" ? "Mailgun" : "Resend";

  async function send() {
    if (disabled || inFlight.current) return;
    const input = {
      to: email.trim(), kind: selectedKind, delivery,
      site_origin: draft.site_origin, grant: draft.grant, product_name: productName,
      template: selectedKind === "extension" ? draft.extension_template! : draft.template,
    };
    const snapshot = JSON.stringify(input);
    if (attempt.current?.snapshot !== snapshot) attempt.current = { snapshot, key: crypto.randomUUID() };
    inFlight.current = true; setSending(true); onBusyChange(true); setError(""); setResult("");
    try {
      const response = await fetch("/api/admin/campaigns/test-send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, key: attempt.current!.key }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send the test email");
      setResult(`Test email accepted by ${data.provider === "mailgun" ? "Mailgun" : "Resend"} for ${data.to}. Check your inbox and spam folder.`);
      attempt.current = null;
    } catch (err) {
      setError(`${err instanceof Error ? err.message : "Could not send the test email"}. If receipt is uncertain, check the provider before sending another test.`);
    } finally { inFlight.current = false; setSending(false); onBusyChange(false); }
  }

  return <form className="space-y-3 border-t border-border/50 pt-5" onSubmit={event => { event.preventDefault(); void send(); }}>
    <div><h3 className="text-sm font-medium">Test email</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Send the current template to one email before launching. Uses sample details; account links open the website. No accounts or access are changed.</p></div>
    <fieldset disabled={disabled || sending} className="grid min-w-0 gap-3 md:grid-cols-3">
      <label className="space-y-2 text-xs text-muted-foreground">Test recipient email<Input type="email" required maxLength={254} value={email} onChange={event => { setEmail(event.target.value); setResult(""); setError(""); }} placeholder="you@example.com" /></label>
      <label className="space-y-2 text-xs text-muted-foreground">Test template<select aria-label="Test template" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedKind} onChange={event => { setKind(event.target.value as typeof kind); setResult(""); setError(""); }}><option value="welcome">Welcome & access email</option>{draft.extension_template ? <option value="extension">Access extension email</option> : null}</select></label>
      <div className="flex items-end"><Button type="submit" variant="outline" className="w-full" disabled={disabled || sending || !email.trim()}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send test via {provider}</Button></div>
    </fieldset>
    {error ? <p role="alert" className="break-words text-sm text-destructive">{error}</p> : null}
    {result ? <p role="status" className="break-words text-sm text-blue-400">{result}</p> : null}
  </form>;
}
