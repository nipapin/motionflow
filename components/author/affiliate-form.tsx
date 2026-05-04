"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const schema = z.object({
  redirect: z.string().url(),
  comment: z.string().max(200).optional(),
});

type Values = z.infer<typeof schema>;

export function AffiliateForm({
  mode,
  id,
  defaults,
}: {
  mode: "create" | "edit";
  id?: number;
  defaults?: Partial<Values>;
}) {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      redirect: defaults?.redirect ?? "",
      comment: defaults?.comment ?? "",
    },
  });

  async function onSubmit(values: Values) {
    const url =
      mode === "create"
        ? "/api/profile/affiliate"
        : `/api/profile/affiliate/${id}`;
    const res = await fetch(url, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ redirect: values.redirect, comment: values.comment || null }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(data.error ?? "Request failed");
      return;
    }
    toast.success(mode === "create" ? "Link created" : "Saved");
    router.push("/profile/affiliate");
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-lg space-y-4 rounded-xl border border-border/60 bg-card/40 p-6">
        <FormField
          control={form.control}
          name="redirect"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Redirect URL</FormLabel>
              <FormControl>
                <Input placeholder="https://…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="comment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Comment (optional)</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {mode === "create" ? "Create" : "Save"}
        </Button>
      </form>
    </Form>
  );
}
