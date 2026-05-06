"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  parsePageSettingForEdit,
  type PageSettingRow,
} from "@/lib/admin/page-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createPageSettingAction,
  updatePageSettingAction,
} from "@/app/(adminzone)/_actions/page-settings";

export function PageSettingForm({ setting }: { setting?: PageSettingRow }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const initial = setting ? parsePageSettingForEdit(setting) : { isJson: 0, contentForForm: "" };

  const [pageName, setPageName] = React.useState(setting?.page ?? "");
  const [key, setKey] = React.useState(setting?.key ?? "");
  const [isJson, setIsJson] = React.useState<number>(initial.isJson);
  const [content, setContent] = React.useState(initial.contentForForm);

  function submit() {
    startTransition(async () => {
      const payload = {
        page: pageName,
        key,
        isJson: isJson === 0 ? null : isJson,
        content,
      };
      const r = setting
        ? await updatePageSettingAction({ id: setting.id, ...payload })
        : await createPageSettingAction(payload);
      if (r.ok) {
        toast.success(setting ? "Updated" : "Created");
        if (!setting && r.id) {
          router.push(`/adminzone/page_settings/edit?id=${r.id}`);
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
          <Label htmlFor="page">Page</Label>
          <Input
            id="page"
            value={pageName}
            onChange={(e) => setPageName(e.target.value)}
            maxLength={50}
            placeholder="e.g. main, pricing, item"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="key">Key</Label>
          <Input
            id="key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            maxLength={50}
            placeholder="e.g. hero_title, banner_offer"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="isJson">Format</Label>
        <select
          id="isJson"
          value={String(isJson)}
          onChange={(e) => setIsJson(Number(e.target.value))}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:max-w-xs"
        >
          <option value="0">Plain text / HTML</option>
          <option value="1">Raw JSON</option>
          <option value="2">Key=value pairs (comma separated)</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Content</Label>
        <Textarea
          id="content"
          rows={isJson === 0 ? 6 : 12}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className={isJson === 1 ? "font-mono text-sm" : undefined}
          placeholder={
            isJson === 1
              ? '{"title":"Hello"}'
              : isJson === 2
                ? "title=Hello, subtitle=World"
                : "Some text…"
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={submit} disabled={pending || !pageName.trim() || !key.trim()}>
          {setting ? "Save changes" : "Create setting"}
        </Button>
        <Button variant="outline" type="button" disabled={pending} onClick={() => router.push("/adminzone/page_settings")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
