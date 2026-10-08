import { z } from "zod";
const template = z.object({subject:z.string().trim().min(1).max(250),text:z.string().min(1).max(250000),html:z.string().min(1).max(250000)});
export const campaignDraftSchema = z.object({
  name:z.string().trim().min(1).max(150),
  site_origin:z.string().url().refine(value => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash && ["motionflow.pro","premieregal.motionflow.pro","spunkramv2.motionflow.pro"].includes(url.hostname);
  }, "Choose a Motion Flow public site origin"),
  grant:z.object({kind:z.enum(["invite","subscription","item"]),subscription:z.enum(["premiere_gal","motionflow_creator","motionflow_creator_ai","spunkram_library","spunkram_ai"]),duration:z.enum(["month","year","unlimited"]),itemId:z.number().int().positive().nullable()}),
  template,extension_template:template.nullable(),recipients_source:z.string().min(1).max(2000000),
}).refine(value => value.grant.kind !== "item" || value.grant.itemId != null, {message:"Choose an item",path:["grant","itemId"]})
  .refine(value => value.grant.kind !== "subscription" || value.grant.duration !== "unlimited", {message:"Choose one month or one year for a subscription",path:["grant","duration"]});
