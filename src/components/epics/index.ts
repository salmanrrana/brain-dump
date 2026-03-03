// Epics components
export { CreateEpicModal, type CreateEpicModalProps } from "./CreateEpicModal";
export { EpicLearnings, type EpicLearningsProps, type LearningEntry } from "./EpicLearnings";
export { EpicProgressOverview, type EpicProgressOverviewProps } from "./EpicProgressOverview";
export { EpicTicketsList, type EpicTicketsListProps } from "./EpicTicketsList";

// Form schema and options for TanStack Form
export { epicFormSchema, type EpicFormData } from "./epic-form-schema";
export { epicFormOpts } from "./epic-form-opts";

// NOTE: Server-side validation (epic-server-validate.ts) is NOT exported here
// because it imports Node.js-only modules (logger). Import it directly where needed
// on the server side: import { serverValidateEpic } from "./epic-server-validate"
