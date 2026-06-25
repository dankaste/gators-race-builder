import { z } from "zod";

/** Zod schemas mirroring the engine config types in lib/engine/models.ts. */

export const handoutColumnSchema = z.object({
  header: z.string(),
  source: z.string(),
});

export const handoutTemplateSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(["roster", "podium", "schedule"]),
  columns: z.array(handoutColumnSchema).min(1),
  sort: z.enum(["name", "wave", "category", "none"]).optional(),
  filter: z.enum(["all", "hasWave"]).optional(),
});

export const categorySchema = z.object({
  label: z.string().min(1),
  distanceLabel: z.string(),
  genders: z.array(z.enum(["M", "F"])).min(1),
  ages: z.array(z.number().int()).optional(),
  ageMin: z.number().int().optional(),
  ageMax: z.number().int().optional(),
  packages: z.array(z.string()).optional(),
  maxSize: z.number().int().positive(),
  ordering: z.enum(["isolate-slow-heat", "seed-ascending", "registration", "manual"]),
});

export const relaySchema = z.object({
  teamSize: z.number().int().positive(),
  cups: z.array(z.string().min(1)).min(1),
  characters: z.array(z.string().min(1)).min(1),
  friendRequestField: z.string().optional(),
});

export const eventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["individual", "relay"]),
  order: z.number().int(),
  nameFormat: z.string().min(1),
  categories: z.array(categorySchema),
  relay: relaySchema.optional(),
  handoutTemplates: z.array(handoutTemplateSchema).optional(),
});

export const raceConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, and hyphens only"),
  name: z.string().min(1),
  raceDate: z.string().optional(),
  events: z.array(eventSchema).min(1),
});
