// Epics components
export { CreateEpicModal, type CreateEpicModalProps } from "./CreateEpicModal";

// Form schema and options for TanStack Form
export { epicFormSchema, type EpicFormData } from "./epic-form-schema";
export { epicFormOpts } from "./epic-form-opts";

// NOTE: Server-side validation (epic-server-validate.ts) is NOT exported here
// because it imports Node.js-only modules (logger). Import it directly where needed
// on the server side: import { serverValidateEpic } from "./epic-server-validate"
