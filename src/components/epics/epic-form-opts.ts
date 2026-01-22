import { formOptions } from "@tanstack/react-form-start";
import type { EpicFormData } from "./epic-form-schema";

// Color defaults to empty - component provides PRESET_COLORS[0] on init
const defaultEpic: EpicFormData = {
  title: "",
  description: "",
  color: "",
};

export const epicFormOpts = formOptions({
  defaultValues: defaultEpic,
});
