import { z } from "zod";

/** Body of POST /papers/compare. Upper bound mirrors env.COMPARE_MAX_PAPERS (4). */
export const CompareBodySchema = z.object({
  paperIds: z.array(z.string().min(1)).min(2).max(4),
});
export type CompareBody = z.infer<typeof CompareBodySchema>;
