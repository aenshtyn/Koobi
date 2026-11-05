/**
 * React 19 resets a form after its action runs. When the server answers with an error, hand back what
 * was typed so the fields can show it again (defaultValue reads from the returned state). Files and
 * hidden ids are left out.
 */
export type Echo = Record<string, string>;

export function echo(form: FormData, skip: string[] = []): Echo {
  const out: Echo = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string" && !k.startsWith("$") && !skip.includes(k)) out[k] = v;
  }
  return out;
}
