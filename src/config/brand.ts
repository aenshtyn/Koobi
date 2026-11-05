/**
 * The name variable (BRAND.md §0, PRD NFR-24). Every name string in the app reads from here,
 * so a rename is a one-line change.
 */
export const brand = {
  name: "Koobi",
  wordmark: "koobi",
  tagline: "Where it all begins.",
  domain: "koobi.co.ke",
  supportEmail: "hello@koobi.co.ke",
  city: "Nairobi, Kenya",
  promises: [
    "Verified teachers and experts.",
    "Pay only when the lesson happens.",
    "A replacement if it does not work out.",
  ],
} as const;
