import { z } from "zod";

export const epicFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string(),
  color: z.string(),
});

export type EpicFormData = z.infer<typeof epicFormSchema>;
