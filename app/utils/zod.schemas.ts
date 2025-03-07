import { z } from "zod";

const templateSchema = z.object({
  ctaText: z.string().optional(),
  templateName: z.string().optional(),
  domain: z.string().optional(),
});

const extraSchema = z.object({
  stock: z.number().optional(),
  sold: z.number().default(0),
  showReviews: z.boolean().default(true),
});

export const newAssetSchema = z.object({
  slug: z.string().min(3),
  title: z.string().min(3),
  type: z.string().min(3),
  price: z.number().default(0),
  gallery: z.array(z.string()).optional(),
  fileIds: z.array(z.string()).optional(),
  template: templateSchema.optional(),
  published: z.boolean().default(false),
  publicLink: z.string().optional(),
  extra: extraSchema.optional(),
  userId: z.string().min(5),
});

export type NewAssetSchema = z.infer<typeof newProductSchema>;
