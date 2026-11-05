/** What each check asks for (FR-VER-2..5). Shared by the pages and the server actions. */

export type Field = { name: string; label: string; help?: string; kind?: "text" | "textarea" | "url" | "tel"; pattern?: string; required?: boolean };

export type CheckConfig = {
  type: string;
  title: string;
  intro: string;
  kinds: string[];
  fields: Field[];
  /** References are collected as two people with the same fields. */
  people?: { count: number; fields: Field[] };
};

const REF_FIELDS: Field[] = [
  { name: "name", label: "Name", required: true },
  { name: "phone", label: "Phone", kind: "tel", required: true },
  { name: "relationship", label: "How they know your teaching", required: true },
];

export const CHECKS: Record<string, CheckConfig> = {
  identity_iprs: {
    type: "identity_iprs",
    title: "Identity",
    intro: "Upload both sides of your national ID and a photo of you holding it. A reviewer checks the photo and number match.",
    kinds: ["id_front", "id_back", "selfie"],
    fields: [{ name: "id_number", label: "ID number", pattern: "[0-9]{6,9}", required: true }],
  },
  certificate_kcse: { type: "certificate_kcse", title: "KCSE certificate", intro: "A clear scan or photo of the certificate.", kinds: ["certificate"], fields: [] },
  certificate_degree: {
    type: "certificate_degree",
    title: "Degree or diploma",
    intro: "The certificate, and the transcript if you have it.",
    kinds: ["certificate"],
    fields: [{ name: "institution", label: "Institution", required: true }],
  },
  certificate_tsc: { type: "certificate_tsc", title: "TSC certificate", intro: "Your TSC registration certificate.", kinds: ["certificate"], fields: [] },
  tsc_lookup: {
    type: "tsc_lookup",
    title: "TSC number",
    intro: "We look you up on the TSC register.",
    kinds: [],
    fields: [{ name: "tsc_number", label: "TSC number", pattern: "[0-9]{4,8}", required: true }],
  },
  credential_professional: {
    type: "credential_professional",
    title: "Professional credential",
    intro: "A licence or membership certificate (for example ICPAK, LSK, EBK).",
    kinds: ["certificate"],
    fields: [{ name: "body", label: "Awarding body", required: true }],
  },
  good_conduct: {
    type: "good_conduct",
    title: "Certificate of Good Conduct",
    intro: "The DCI certificate, issued in the last 12 months.",
    kinds: ["good_conduct"],
    fields: [],
  },
  experience_evidence: {
    type: "experience_evidence",
    title: "Evidence of practice",
    intro: "Show the work you teach: letters from employers, portfolio pages, published work.",
    kinds: ["portfolio", "reference", "other"],
    fields: [{ name: "summary", label: "In a sentence, what this shows", kind: "textarea", required: true }],
  },
  teaching_reference: {
    type: "teaching_reference",
    title: "Two references",
    intro: "People who have seen you teach: past learners, parents or a head of department. We may call them.",
    kinds: [],
    fields: [],
    people: { count: 2, fields: REF_FIELDS },
  },
  demo_lesson: {
    type: "demo_lesson",
    title: "Demo lesson",
    intro: "Record 10 minutes of a real lesson and share an unlisted link (YouTube, Google Drive). A reviewer scores it.",
    kinds: [],
    fields: [
      { name: "video_url", label: "Link to the recording", kind: "url", required: true, help: "Starts with https://" },
      { name: "topic", label: "What the lesson covers", required: true },
    ],
  },
  subject_test: {
    type: "subject_test",
    title: "Subject test",
    intro: "A short test in the subject of this offer, booked with a reviewer.",
    kinds: [],
    fields: [{ name: "preferred_times", label: "Two times that suit you this week", kind: "textarea", required: true }],
  },
};

/** Builds the details sent to submit_check from known fields only. */
export function detailsFrom(config: CheckConfig, form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of config.fields) out[f.name] = String(form.get(f.name) ?? "").trim().slice(0, 500);
  if (config.people) {
    out.references = Array.from({ length: config.people.count }, (_, i) =>
      Object.fromEntries(config.people!.fields.map((f) => [f.name, String(form.get(`p${i}_${f.name}`) ?? "").trim().slice(0, 200)])),
    ).filter((r) => Object.values(r).every((v) => v));
  }
  return out;
}
