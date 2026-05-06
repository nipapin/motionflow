"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MAILING_FOOTER,
  MAILING_RECIPIENTS,
  MAILING_SAMPLING_DAYS,
  MAILING_SUBSCRIBE_TYPES,
  MAILING_TYPES,
  type MailingRow,
} from "@/lib/admin/mailing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createMailingAction,
  updateMailingAction,
} from "@/app/(adminzone)/_actions/mailing";

function isoLocal(s: string | null | undefined): string {
  if (!s) return "";
  try {
    const d = new Date(s);
    const off = d.getTimezoneOffset() * 60 * 1000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

export function MailingForm({ mailing }: { mailing?: MailingRow }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [type, setType] = React.useState(mailing?.type ?? "custom");
  const [recipients, setRecipients] = React.useState(mailing?.recipients ?? "all");
  const [subscribeType, setSubscribeType] = React.useState<number>(Number(mailing?.subscribe_type ?? -1));
  const [samplingDays, setSamplingDays] = React.useState<number>(Number(mailing?.sampling_days ?? 0));
  const [maxEmails, setMaxEmails] = React.useState<number>(Number(mailing?.max_emails ?? 0));
  const [unlimited, setUnlimited] = React.useState(mailing ? mailing.max_emails == null : true);
  const [autoTypePicks, setAutoTypePicks] = React.useState(Boolean(mailing?.auto_type_picks ?? 1));
  const [title, setTitle] = React.useState(mailing?.title ?? "");
  const [subject, setSubject] = React.useState(mailing?.subject ?? "");
  const [subtitle, setSubtitle] = React.useState(mailing?.subtitle ?? "");
  const [customItems, setCustomItems] = React.useState(mailing?.custom_items ?? "");
  const [assignedOffer, setAssignedOffer] = React.useState<number>(Number(mailing?.assigned_offer ?? 0));
  const [footer, setFooter] = React.useState(mailing?.footer ?? "");
  const [startAt, setStartAt] = React.useState(isoLocal(mailing?.start_at));
  const [endAt, setEndAt] = React.useState(isoLocal(mailing?.end_at));

  function submit() {
    startTransition(async () => {
      const payload = {
        type,
        recipients,
        subscribeType: Number(subscribeType),
        samplingDays: Number(samplingDays),
        maxEmails: unlimited ? null : Number(maxEmails),
        title,
        subject: subject || null,
        subtitle: subtitle || null,
        customItems: customItems || null,
        assignedOffer: assignedOffer || null,
        footer: footer || null,
        startAt: startAt || null,
        endAt: endAt || null,
        autoTypePicks,
      };
      const r = mailing
        ? await updateMailingAction({ id: mailing.id, ...payload })
        : await createMailingAction(payload);
      if (r.ok) {
        toast.success(mailing ? "Mailing updated" : "Mailing created");
        if (!mailing && r.id) {
          router.push(`/adminzone/mailing_marketing/edit?id=${r.id}`);
          router.refresh();
        } else {
          router.refresh();
        }
      } else {
        toast.error(r.error ?? "Failed");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Internal title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subject">Email subject</Label>
          <Input id="subject" value={subject ?? ""} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subtitle">Subtitle / preview text</Label>
        <Textarea id="subtitle" rows={2} value={subtitle ?? ""} onChange={(e) => setSubtitle(e.target.value)} maxLength={250} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="type">Mailing type</Label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {Object.entries(MAILING_TYPES).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="recipients">Recipients</Label>
          <select
            id="recipients"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {Object.entries(MAILING_RECIPIENTS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="subscribe">Subscribe type</Label>
          <select
            id="subscribe"
            value={String(subscribeType)}
            onChange={(e) => setSubscribeType(Number(e.target.value))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {Object.entries(MAILING_SUBSCRIBE_TYPES).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="sampling">Sampling window</Label>
          <select
            id="sampling"
            value={String(samplingDays)}
            onChange={(e) => setSamplingDays(Number(e.target.value))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {Object.entries(MAILING_SAMPLING_DAYS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="max">Max emails</Label>
          <div className="flex items-center gap-2">
            <Switch checked={unlimited} onCheckedChange={setUnlimited} />
            <span className="text-xs text-muted-foreground">{unlimited ? "Unlimited" : "Capped"}</span>
          </div>
          {!unlimited ? (
            <Input id="max" type="number" min={1} value={maxEmails} onChange={(e) => setMaxEmails(Number(e.target.value))} />
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="footer">Footer block</Label>
          <select
            id="footer"
            value={footer ?? ""}
            onChange={(e) => setFooter(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— None —</option>
            {Object.entries(MAILING_FOOTER).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="custom">Custom items / coupons (CSV)</Label>
          <Input id="custom" value={customItems ?? ""} onChange={(e) => setCustomItems(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="offer">Assigned offer ID</Label>
          <Input
            id="offer"
            type="number"
            min={0}
            value={assignedOffer}
            onChange={(e) => setAssignedOffer(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="start">Active from</Label>
          <Input id="start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end">Active until</Label>
          <Input id="end" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3">
        <div>
          <p className="text-sm font-medium">Auto-pick body items</p>
          <p className="text-xs text-muted-foreground">For Discount/Free/New mailings, the worker picks items at send time.</p>
        </div>
        <Switch checked={autoTypePicks} onCheckedChange={setAutoTypePicks} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={submit} disabled={pending || !title.trim()}>
          {mailing ? "Save changes" : "Create mailing"}
        </Button>
        <Button variant="outline" type="button" disabled={pending} onClick={() => router.push("/adminzone/mailing_marketing")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
