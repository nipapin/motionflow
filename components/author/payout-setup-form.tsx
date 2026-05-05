"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const schema = z
  .object({
    paymentMethod: z.enum(["paypal", "payoneer", "swift", "payproglobal"]),
    paymentMinWithdraw: z.coerce.number().min(50).max(20000),
    payoneerEmail: z.string().email().optional().or(z.literal("")),
    payProVendorId: z.string().optional(),
    payProEmail: z.string().email().optional().or(z.literal("")),
    paypalEmail: z.string().email().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethod === "payoneer" && !data.payoneerEmail) {
      ctx.addIssue({ code: "custom", path: ["payoneerEmail"], message: "Required for Payoneer" });
    }
    if (data.paymentMethod === "payproglobal") {
      if (!data.payProEmail) ctx.addIssue({ code: "custom", path: ["payProEmail"], message: "Required" });
      if (!data.payProVendorId?.trim()) ctx.addIssue({ code: "custom", path: ["payProVendorId"], message: "Required" });
    }
    if (data.paymentMethod === "paypal" && !data.paypalEmail) {
      ctx.addIssue({ code: "custom", path: ["paypalEmail"], message: "Required for PayPal" });
    }
  });

type FormValues = z.infer<typeof schema>;

function parseInitialAccount(method: string | null, json: string | null): Partial<FormValues> {
  if (!json) return {};
  try {
    const o = JSON.parse(json) as Record<string, string>;
    if (method === "payproglobal") {
      return { payProEmail: o.email ?? "", payProVendorId: o.vendor_id != null ? String(o.vendor_id) : "" };
    }
    if (method === "payoneer" || method === "paypal") {
      return { payoneerEmail: o.email ?? "", paypalEmail: o.email ?? "" };
    }
  } catch {
    /* ignore */
  }
  return {};
}

interface PayoutSetupFormProps {
  initialMethod: string;
  initialMin: number;
  initialAccountJson: string | null;
}

export function PayoutSetupForm({ initialMethod, initialMin, initialAccountJson }: PayoutSetupFormProps) {
  const router = useRouter();
  const acct = parseInitialAccount(initialMethod, initialAccountJson);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      paymentMethod: (initialMethod as FormValues["paymentMethod"]) ?? "payproglobal",
      paymentMinWithdraw: initialMin,
      payoneerEmail: acct.payoneerEmail ?? "",
      payProVendorId: acct.payProVendorId ?? "",
      payProEmail: acct.payProEmail ?? "",
      paypalEmail: acct.paypalEmail ?? "",
    },
  });

  const method = form.watch("paymentMethod");

  async function onSubmit(values: FormValues) {
    const res = await fetch("/api/profile/payouts/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(values),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(data.error ?? "Save failed");
      return;
    }
    toast.success("Saved");
    router.push("/profile/payouts");
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 rounded-xl border border-border/60 bg-card/40 p-6">
        <FormField
          control={form.control}
          name="paymentMethod"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Method</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="payproglobal">PayPro Global</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="payoneer">Payoneer</SelectItem>
                  <SelectItem value="swift">SWIFT</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="paymentMinWithdraw"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Minimum withdraw ($)</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {method === "payproglobal" ? (
          <>
            <FormField
              control={form.control}
              name="payProEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PayPro email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="payProVendorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor ID</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : null}

        {method === "payoneer" ? (
          <FormField
            control={form.control}
            name="payoneerEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payoneer email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        {method === "paypal" ? (
          <FormField
            control={form.control}
            name="paypalEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PayPal email</FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        <Button type="submit" disabled={form.formState.isSubmitting}>
          Save
        </Button>
      </form>
    </Form>
  );
}
