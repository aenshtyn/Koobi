"use client";
import { useActionState } from "react";
import { DOC_KINDS } from "@/domain/payouts";
import type { CheckConfig } from "./config";
import { requestTestPayout, submitForCheck, uploadForCheck, type VState } from "./actions";

function ErrorLine({ error }: { error?: string }) {
  return error ? (
    <p className="field-error" role="alert">
      {error}
    </p>
  ) : null;
}

export function UploadForm({ config, path, offeringId }: { config: CheckConfig; path: string; offeringId?: string | null }) {
  const [state, action, pending] = useActionState<VState, FormData>(uploadForCheck, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="type" value={config.type} />
      <input type="hidden" name="path" value={path} />
      {offeringId ? <input type="hidden" name="offering_id" value={offeringId} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label className="label" htmlFor={`kind-${config.type}`}>
            What the file is
          </label>
          <select id={`kind-${config.type}`} name="kind" className="input" defaultValue={config.kinds[0]}>
            {config.kinds.map((k) => (
              <option key={k} value={k}>
                {DOC_KINDS[k] ?? k}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor={`file-${config.type}`}>
            File
          </label>
          <input id={`file-${config.type}`} name="file" type="file" className="input" accept="image/jpeg,image/png,application/pdf" required />
        </div>
      </div>
      <p className="help">JPG, PNG or PDF, up to 4 MB. Only reviewers can open it, and every view is logged.</p>
      <ErrorLine error={state.error} />
      <button className="btn2 self-start" type="submit" disabled={pending}>
        {pending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}

export function DetailsForm({ config, path, offeringId, canSend }: { config: CheckConfig; path: string; offeringId?: string | null; canSend: boolean }) {
  const [state, action, pending] = useActionState<VState, FormData>(submitForCheck, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="type" value={config.type} />
      <input type="hidden" name="path" value={path} />
      {offeringId ? <input type="hidden" name="offering_id" value={offeringId} /> : null}
      {config.fields.map((f) => (
        <div key={f.name} className="field">
          <label className="label" htmlFor={`${config.type}-${f.name}`}>
            {f.label}
          </label>
          {f.kind === "textarea" ? (
            <textarea id={`${config.type}-${f.name}`} name={f.name} className="input min-h-20" maxLength={500} required={f.required} />
          ) : (
            <input
              id={`${config.type}-${f.name}`}
              name={f.name}
              className={f.pattern ? "input mono" : "input"}
              type={f.kind === "url" ? "url" : f.kind === "tel" ? "tel" : "text"}
              pattern={f.pattern}
              maxLength={300}
              required={f.required}
            />
          )}
          {f.help ? <p className="help">{f.help}</p> : null}
        </div>
      ))}
      {config.people
        ? Array.from({ length: config.people.count }, (_, i) => (
            <fieldset key={i} className="card flex flex-col gap-3 p-4">
              <legend className="label px-1">Reference {i + 1}</legend>
              {config.people!.fields.map((f) => (
                <div key={f.name} className="field">
                  <label className="label" htmlFor={`p${i}_${f.name}`}>
                    {f.label}
                  </label>
                  <input id={`p${i}_${f.name}`} name={`p${i}_${f.name}`} className="input" type={f.kind === "tel" ? "tel" : "text"} maxLength={200} required />
                </div>
              ))}
            </fieldset>
          ))
        : null}
      <ErrorLine error={state.error} />
      <button className="btn self-start" type="submit" disabled={pending || !canSend}>
        {pending ? "Sending…" : "Send for review"}
      </button>
      {!canSend ? <p className="help">Upload at least one file first.</p> : null}
    </form>
  );
}

export function TestPayoutForm() {
  const [state, action, pending] = useActionState<VState, FormData>(requestTestPayout, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <ErrorLine error={state.error} />
      <button className="btn self-start" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send the test payout"}
      </button>
    </form>
  );
}
