export type PersonFieldKey = "first_name" | "last_name" | "job_title" | "company" | "email";
export const personFieldLabels: Record<PersonFieldKey, string> = {
  first_name: "First name",
  last_name: "Last name",
  job_title: "Job title",
  company: "Company",
  email: "Email",
};

export type TextInputField = {
  type: "textarea";
  key: string;
  label: string;
  required?: boolean;
};

export type SelectInputField = {
  type: "select";
  key: string;
  label: string;
  options: string[];
  required?: boolean;
};

export type PeopleInputField = {
  type: "people" | "ticket_nominees";
  key: string;
  label: string;
  personFields: PersonFieldKey[];
  maxEntries?: number;
};

export type TaskInputField = TextInputField | SelectInputField | PeopleInputField;

export type TaskInputSchema = {
  sponsorEditable: boolean;
  allowFile: boolean;
  fields: TaskInputField[];
};

const personFields: PersonFieldKey[] = ["first_name", "last_name", "job_title", "company", "email"];
const shortPersonFields: PersonFieldKey[] = ["first_name", "last_name", "email"];
const sessionFormats = ["Panel", "Keynote", "Fireside chat", "Roundtable", "Workshop"];
const timeSlots = ["Morning", "Afternoon"];
const meetingOptions = ["Roundtable", "Tour", "10 meetings"];
const tourOptions = ["Site tour", "Building tour", "Neighborhood tour"];

const readOnlySchema: TaskInputSchema = { sponsorEditable: false, allowFile: false, fields: [] };
const fileSchema: TaskInputSchema = { sponsorEditable: true, allowFile: true, fields: [] };
const freeTextSchema = (key: string, label: string, allowFile = false): TaskInputSchema => ({
  sponsorEditable: true,
  allowFile,
  fields: [{ type: "textarea", key, label, required: true }],
});

const schemas: Record<string, TaskInputSchema> = {
  "Submit booth artwork": fileSchema,
  "Submit artwork": fileSchema,
  "Submit pillar artwork": fileSchema,
  "Upload Headshot": fileSchema,
  "Upload Slides": fileSchema,
  "Upload Logo": fileSchema,
  "Submit Headshot": fileSchema,
  "Submit Logo": fileSchema,
  "Submit Slides": fileSchema,
  "Approve artwork": {
    sponsorEditable: true,
    allowFile: false,
    fields: [{ type: "select", key: "artwork_decision", label: "Artwork decision", options: ["Approved", "Changes requested"], required: true }],
  },
  "Confirm booth requirement": readOnlySchema,
  "Confirm booth position": readOnlySchema,
  "Note booth activations": freeTextSchema("activation_details", "Activation details"),
  "Confirm team tickets": {
    sponsorEditable: true,
    allowFile: false,
    fields: [{ type: "ticket_nominees", key: "nominees", label: "Team ticket nominees", personFields: shortPersonFields }],
  },
  "Confirm RE tickets": {
    sponsorEditable: true,
    allowFile: false,
    fields: [{ type: "ticket_nominees", key: "nominees", label: "RE ticket nominees", personFields: shortPersonFields }],
  },
  "Confirm VIP tickets": {
    sponsorEditable: true,
    allowFile: false,
    fields: [{ type: "ticket_nominees", key: "nominees", label: "VIP ticket nominees", personFields: shortPersonFields }],
  },
  "Confirm team ticket allocation": {
    sponsorEditable: true,
    allowFile: false,
    fields: [{ type: "ticket_nominees", key: "nominees", label: "Team ticket nominees", personFields: shortPersonFields }],
  },
  "Confirm RE ticket allocation": {
    sponsorEditable: true,
    allowFile: false,
    fields: [{ type: "ticket_nominees", key: "nominees", label: "RE ticket nominees", personFields: shortPersonFields }],
  },
  "Confirm VIP ticket allocation": {
    sponsorEditable: true,
    allowFile: false,
    fields: [{ type: "ticket_nominees", key: "nominees", label: "VIP ticket nominees", personFields: shortPersonFields }],
  },
  "Confirm panel details": {
    sponsorEditable: true,
    allowFile: false,
    fields: [
      { type: "textarea", key: "session_title", label: "Session title", required: true },
      { type: "textarea", key: "talking_points", label: "Talking points", required: true },
      { type: "select", key: "session_format", label: "Session format", options: sessionFormats, required: true },
      { type: "select", key: "time_slot", label: "Preferred time slot", options: timeSlots, required: true },
      { type: "textarea", key: "speaker_bio", label: "Speaker biography", required: true },
      { type: "people", key: "speakers", label: "Panel speakers and contacts", personFields },
    ],
  },
  "Submit Speaker Name": {
    sponsorEditable: true,
    allowFile: false,
    fields: [{ type: "people", key: "speakers", label: "Panel speakers", personFields }],
  },
  "Submit case study": {
    sponsorEditable: true,
    allowFile: true,
    fields: [
      { type: "textarea", key: "case_study_summary", label: "Case study summary", required: true },
      { type: "textarea", key: "speaker_bio", label: "Case study speaker biography", required: true },
      { type: "people", key: "speakers", label: "Case study speakers and contacts", personFields },
    ],
  },
  "Submit innovation details": freeTextSchema("innovation_details", "Innovation details", true),
  "Confirm workshop details": {
    sponsorEditable: true,
    allowFile: true,
    fields: [
      { type: "textarea", key: "workshop_title", label: "Workshop title", required: true },
      { type: "textarea", key: "talking_points", label: "Workshop talking points", required: true },
      { type: "select", key: "session_format", label: "Workshop format", options: ["Interactive workshop", "Presentation", "Panel discussion"], required: true },
      { type: "select", key: "time_slot", label: "Preferred time slot", options: timeSlots, required: true },
      { type: "people", key: "speakers", label: "Workshop speakers and contacts", personFields },
    ],
  },
  "Confirm private meeting room": {
    sponsorEditable: true,
    allowFile: false,
    fields: [{ type: "select", key: "time_slot", label: "Preferred room slot", options: timeSlots, required: true }],
  },
  "Call Account Manager and Client Success to confirm option": {
    sponsorEditable: true,
    allowFile: false,
    fields: [{ type: "select", key: "option", label: "Option", options: meetingOptions, required: true }],
  },
  "Select a tour": {
    sponsorEditable: true,
    allowFile: false,
    fields: [{ type: "select", key: "tour", label: "Tour", options: tourOptions, required: true }],
  },
  "Confirm 10 meetings": {
    sponsorEditable: true,
    allowFile: false,
    fields: [{ type: "people", key: "meeting_contacts", label: "Meeting contacts", personFields }],
  },
  "Create company profile on the networking app": readOnlySchema,
};

export function getTaskInputSchema(title: string, quantity = 1): TaskInputSchema {
  const configured = schemas[title] ?? freeTextSchema("submission_details", "Submission details", true);
  return {
    ...configured,
    fields: configured.fields.map((field) => field.type === "ticket_nominees" ? { ...field, maxEntries: quantity } : field),
  };
}

export function validateTaskInputValues(schema: TaskInputSchema, values: Record<string, unknown>): string | null {
  const fieldsByKey = new Map(schema.fields.map((field) => [field.key, field]));
  for (const key of Object.keys(values)) {
    if (!fieldsByKey.has(key)) return `Unsupported input field: ${key}`;
  }

  for (const field of schema.fields) {
    const value = values[field.key];
    if (field.type === "textarea") {
      if (field.required && (typeof value !== "string" || !value.trim())) return `${field.label} is required`;
      if (value !== undefined && typeof value !== "string") return `${field.label} must be text`;
      continue;
    }
    if (field.type === "select") {
      if (field.required && (typeof value !== "string" || !field.options.includes(value))) return `Choose a valid ${field.label.toLowerCase()}`;
      if (value !== undefined && (typeof value !== "string" || !field.options.includes(value))) return `Choose a valid ${field.label.toLowerCase()}`;
      continue;
    }

    if (!Array.isArray(value) || value.length === 0) return `Add at least one ${field.type === "ticket_nominees" ? "nominee" : "person"} for ${field.label}`;
    if (field.maxEntries && value.length > field.maxEntries) return `${field.label} cannot exceed the allocated ${field.maxEntries} tickets`;
    for (const person of value) {
      if (!person || typeof person !== "object" || Array.isArray(person)) return `Each entry in ${field.label} must be a person record`;
      const record = person as Record<string, unknown>;
      if (Object.keys(record).some((key) => !field.personFields.includes(key as PersonFieldKey))) return `${field.label} contains an unsupported person field`;
      for (const personField of field.personFields) {
        if (typeof record[personField] !== "string" || !(record[personField] as string).trim()) return `${personField.replace(/_/g, " ")} is required for every person in ${field.label}`;
      }
      if (typeof record.email === "string" && !/^\S+@\S+\.\S+$/.test(record.email.trim())) return `Enter a valid email for every person in ${field.label}`;
    }
  }
  return null;
}
