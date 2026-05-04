"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(2).max(100),
  extraSlug: z.string().max(80).optional(),
  description: z.string().max(20000).optional(),
});

type Values = z.infer<typeof schema>;

export function UploadDraftForm({ indexCategorySlug }: { indexCategorySlug: string }) {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", extraSlug: "", description: "" },
  });

  async function onSubmit(values: Values) {
    const res = await fetch("/api/profile/upload/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        indexCategorySlug,
        name: values.name,
        description: values.description ?? "",
        extraSlug: values.extraSlug || null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; id?: number };
    if (!res.ok) {
      toast.error(data.error ?? "Failed");
      return;
    }
    toast.success(`Draft #${data.id} created`);
    router.push("/profile/items");
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Common</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project name</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Motion Elements Pack" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="extraSlug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Extra payment gateway slug (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: gal-premiere-pr" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea rows={8} placeholder="Describe your project…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Save draft
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="border-border/60 border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Upload files</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Preview image / video / archive uploads will use the same R2 paths as Laravel (
            <code className="rounded bg-muted px-1">preview/&#123;itemId&#125;/…</code>
            ). Wire-up is tracked in <code className="rounded bg-muted px-1">ADMIN_MIGRATION.md</code> Phase 7.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
