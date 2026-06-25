import type { HandoutFieldSource, HandoutKind } from "@/lib/engine/models";

/** Selectable column sources per handout kind, with human labels for the editor. */
export const FIELD_OPTIONS: Record<HandoutKind, { source: HandoutFieldSource; label: string }[]> = {
  roster: [
    { source: "bib", label: "Bib" },
    { source: "name", label: "Name (Last, First)" },
    { source: "firstName", label: "First name" },
    { source: "lastName", label: "Last name" },
    { source: "gender", label: "Gender" },
    { source: "age", label: "Age" },
    { source: "category", label: "Category" },
    { source: "distance", label: "Distance" },
    { source: "wave", label: "Wave" },
    { source: "seed", label: "Seed level" },
    { source: "phone", label: "Phone" },
    { source: "email", label: "Email" },
    { source: "parentName", label: "Parent" },
    { source: "team", label: "GBP team" },
    { source: "blank", label: "Blank (fill-in)" },
  ],
  podium: [
    { source: "categoryLabel", label: "Category" },
    { source: "waves", label: "Wave numbers" },
    { source: "count", label: "Rider count" },
    { source: "blank", label: "Blank (place)" },
  ],
  schedule: [
    { source: "wave", label: "Wave" },
    { source: "scheduleTime", label: "Approx. start time" },
    { source: "categoryLabel", label: "Category" },
    { source: "count", label: "Rider count" },
    { source: "blank", label: "Blank" },
  ],
};

export const CUSTOM_PREFIX = "custom:";
