import { z } from "zod";

const MARKET_CODES = ["NG", "KE", "UG", "GH", "IC", "SN", "EGY", "MA", "DZ"] as const;

export const CampaignSchema = z.object({
  id: z.string().regex(/^[A-Z]{2,5}-\d{1,6}$/, "ID must look like JFLG-001"),
  name: z.string().min(3).max(200),
  contentType: z.enum(["educational", "product", "brand", "awareness"]),
  brief: z.string().min(10).max(8000),
  keyMessage: z.string().min(5).max(4000),
  audience: z.string().min(5).max(4000),
  cta: z.string().min(3).max(500),
  ramadanMode: z.boolean().default(false),
  markets: z.array(z.enum(MARKET_CODES)).min(1, "Select at least one market").max(9),
  knowledgeIds: z.array(z.string()).default([]),
});
export type CampaignInput = z.infer<typeof CampaignSchema>;

export const MarketUpdateSchema = z.object({
  ytUrl: z.string().url().or(z.literal("")).optional(),
  ytChannelId: z.string().max(40).optional(),
  active: z.boolean().optional(),
});

export const SettingsSchema = z.object({
  toolUrl: z.string().url(),
  defaultCta: z.string().max(500),
  hashtags: z.string().max(2000),
  heygenAvatar: z.string().max(80).optional(),
  voiceEn: z.string().max(80).optional(),
  voiceFr: z.string().max(80).optional(),
  voiceAr: z.string().max(80).optional(),
});

// Publish-only: push already-rendered videos (e.g. NotebookLM Video Overviews
// staged in Drive) straight to the CodeWords /publish_only endpoint, skipping
// the HeyGen generate+render pipeline. Video values may be a `drive://<id>`
// reference or any https URL the workflow can fetch.
export const PublishRequestSchema = z.object({
  videos: z
    .record(z.string().min(1))
    .refine((v) => Object.keys(v).length > 0, "Provide at least one video URL"),
  privacyStatus: z.enum(["public", "unlisted", "private"]).default("unlisted"),
  metadata: z
    .record(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(5000).default(""),
      }),
    )
    .optional(),
});
export type PublishRequest = z.infer<typeof PublishRequestSchema>;

export const WebhookCallbackSchema = z.object({
  campaignId: z.string(),
  phase: z.enum(["scripts_ready", "videos_ready", "published", "partial", "error"]),
  payload: z.object({
    scripts: z.record(z.any()).optional(),
    videos: z.record(z.string().url()).optional(),
    ytUrls: z.record(z.string().url()).optional(),
    error: z.string().optional(),
  }).optional(),
});
