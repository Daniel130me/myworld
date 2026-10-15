import { z } from 'zod';

// Input validation contracts (ported from backend/src/modules/contracts.ts, adapted to zod v4).

export const coordinatesSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180)
});

export const placeInputSchema = coordinatesSchema.extend({
  placeId: z.string().max(180).optional(),
  wikiId: z.string().regex(/^wiki-\d+$/).optional()
});

export const nearbyInputSchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
  radius: z.coerce.number().int().min(100).max(10000).default(8500)
});

export const recommendationInputSchema = coordinatesSchema.extend({
  seen: z.array(z.string().max(180)).max(100).default([]),
  recentTopics: z.array(z.string().max(50)).max(30).default([]),
  exclude: z.array(z.string().max(180)).max(100).default([]),
  preferredTopics: z.array(z.string().max(50)).max(20).default([]),
  mode: z.enum(['nearby', 'surprise']).default('nearby')
});

export const answerInputSchema = z.object({
  placeId: z.string().max(180),
  question: z.string().trim().min(1).max(650),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(650)
  })).max(8).default([])
});

export const searchInputSchema = z.object({ q: z.string().trim().min(2).max(90) });

export const placeIdParamSchema = z.object({
  id: z.string().regex(/^(wiki-\d+|demo-[1-6]--?\d{1,2}\.\d{1,3}--?\d{1,3}\.\d{1,3}|google-[\w-]+)$/)
});
