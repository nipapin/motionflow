export type CampaignTemplate = { subject: string; text: string; html: string };
export type CampaignGrant = {kind: "invite" | "subscription" | "item"; subscription: string; duration: "month" | "year" | "unlimited"; itemId: number | null};
export type CampaignDraft = {name: string; site_origin: string; grant: CampaignGrant; template: CampaignTemplate; extension_template: CampaignTemplate | null; recipients_source: string};
export type CampaignRecipient = {id:number;email:string;account_email:string;first_name:string;user_id:number|null;created_user:number;action:string|null;base_at:string|null;expires_at:string|null;state:string;last_error:string|null;provider_id:string|null};
export type Campaign = CampaignDraft & {id:string;status:string;product_name:string;created_at:string;recipients:CampaignRecipient[];counts:Record<string,number>;total:number;environment:string|null};
export const SUBSCRIPTIONS = [
  {value:"premiere_gal",label:"Gal Toolkit MAX"},
  {value:"motionflow_creator",label:"Motion Flow Creator"},
  {value:"motionflow_creator_ai",label:"Motion Flow Creator + AI"},
  {value:"spunkram_library",label:"Spunkram Editor"},
  {value:"spunkram_ai",label:"Spunkram Editor AI"},
] as const;
