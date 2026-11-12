import { z } from "zod";
import { TECHNICAL_SKILLS } from "@trend/shared-types";
export const researchClassificationSchema = z.object({
  nodeIds: z.array(z.string().uuid()).max(20),
  keywordIds: z.array(z.string().uuid()).max(30),
  skillIds: z.array(z.string().refine(id => TECHNICAL_SKILLS.some(skill => skill.id === id), "Unknown technical skill")).max(30),
}).strict().refine(value => Object.values(value).every(ids => new Set(ids).size === ids.length), "Duplicate classification references");
