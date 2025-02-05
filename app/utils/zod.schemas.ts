import { z } from "zod";

export const newProductSchema = z.object({
  name: z.string(),
  type: z.string(),
});
