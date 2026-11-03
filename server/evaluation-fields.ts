import { z } from "zod";

export const score = z.number().int().min(0).max(5);

export const evaluationFields = {
  employeeName: z.string().trim().min(1, "Employee name is required").max(120),
  position: z.string().trim().max(120).default(""),
  department: z.string().trim().max(120).default(""),
  cycle: z.string().trim().max(60).default(""),
  teaching: score.default(0),
  research: score.default(0),
  service: score.default(0),
  comments: z.string().max(5000).default(""),
  status: z.enum(["draft", "submitted"]).default("draft"),
};
