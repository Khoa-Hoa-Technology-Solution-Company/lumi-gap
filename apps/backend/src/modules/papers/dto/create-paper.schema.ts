import { z } from "zod";

const DOI_REGEX = /^10\.\d{4,9}\/\S+$/i;

function countWords(str: string) {
  return str
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w)).length;
}

export const CreatePaperSchema = z.object({
  title: z
    .string()
    .trim()
    .min(8, "Paper title must be at least 8 characters")
    .max(500, "Paper title is too long")
    .refine((v) => countWords(v) >= 3, "Please enter a clearer paper title (at least 3 words)"),

  doi: z
    .string()
    .trim()
    .regex(DOI_REGEX, "Please enter a valid DOI (e.g. 10.1145/3065386)"),

  paperLink: z
    .string()
    .trim()
    .url("Please enter a valid paper link URL"),

  abstractText: z
    .string()
    .trim()
    .refine(
      (v) => countWords(v) >= 50,
      "Word Count Limit: The abstract must contain at least 50 words.",
    )
    .refine(
      (v) => countWords(v) <= 350,
      "Word Count Limit: The abstract must not exceed 350 words.",
    ),

  publicationYear: z.coerce
    .number()
    .int()
    .min(1900, "Publication year must be 1900 or later")
    .max(new Date().getFullYear(), "Publication year cannot be in the future"),

  paperKind: z
    .enum(["article", "proceedings", "preprint", "review", "book-chapter", "other"])
    .default("article"),

  authors: z
    .array(
      z.object({
        displayName: z.string().trim().min(2, "Author name must be at least 2 characters"),
        position: z.number().int().min(1),
        isCorresponding: z.boolean().optional().default(false),
      }),
    )
    .min(1, "At least one author is required")
    .refine(
      (authors) => authors.every((a) => a.displayName.length >= 2),
      "Please enter valid author names",
    ),

  keywords: z
    .array(
      z.object({
        keywordName: z.string().trim().min(2, "Keyword must be at least 2 characters"),
      }),
    )
    .min(1, "At least one keyword is required"),

  topics: z
    .array(
      z.object({
        topicName: z.string().trim().min(2, "Topic name must be at least 2 characters"),
      }),
    )
    .default([]),

  openAccessUrl: z
    .string()
    .trim()
    .url("Invalid Open Access URL")
    .optional()
    .or(z.literal("")),
});

export type CreatePaperInput = z.infer<typeof CreatePaperSchema>;
