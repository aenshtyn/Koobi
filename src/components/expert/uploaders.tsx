"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileText, Trash2, UploadCloud } from "lucide-react";
import { CREDENTIAL_KINDS, CREDENTIAL_STATUS, DOCUMENT, PHOTO, type CredentialKind } from "@/domain/expert";
import { removeDocument, saveDocument, savePhoto, startUpload } from "@/app/teach/apply/actions";
import { putFile } from "./direct-upload";

function Progress({ pct }: { pct: number }) {
  return (
    <span className="flex items-center gap-2 text-sm text-ink-2" role="status">
      <span className="h-2 w-32 overflow-hidden rounded-full bg-sand">
        <span className="block h-full bg-forest" style={{ width: `${pct}%` }} />
      </span>
      <span className="mono">{pct}%</span>
    </span>
  );
}

/** The profile photo: shows the current one and uploads a new one straight to storage. */
export function PhotoUploader({ url, name, error }: { url: string | null; name: string; error?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(url);
  const [pct, setPct] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    setPending(false);
    if (!(PHOTO.types as readonly string[]).includes(file.type)) return setProblem("Use a JPG or PNG.");
    if (file.size > PHOTO.maxBytes) return setProblem("The photo is over 5 MB. Choose a smaller one.");
    setPct(0);
    try {
      const started = await startUpload("photo", file.type, file.size);
      if (!started.target) throw new Error(started.error ?? "The upload could not start.");
      await putFile(started.target.url, file, setPct);
      const saved = await savePhoto(started.target.path);
      if (!saved.url) throw new Error(saved.error ?? "The photo could not be saved.");
      setCurrent(saved.url);
      setPending(!!saved.pending);
      router.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The upload did not go through.");
    } finally {
      setPct(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element -- the expert's own photo, from our storage
        <img src={current} alt={`Photo of ${name || "you"}`} className="h-[132px] w-[132px] flex-none rounded-[18px] border-[1.5px] border-ink object-cover" />
      ) : (
        <span className="flex h-[132px] w-[132px] flex-none items-center justify-center rounded-[18px] border-[1.5px] border-dashed border-line-2 bg-paper text-ink-2" aria-hidden="true">
          <Camera size={30} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <input ref={input} type="file" accept="image/jpeg,image/png" className="sr-only" id="photo-file" onChange={(e) => choose(e.target.files?.[0])} />
        <label htmlFor="photo-file" className={`btn2 ink cursor-pointer ${pct !== null ? "pointer-events-none opacity-60" : ""}`}>
          <Camera size={18} aria-hidden="true" />
          {current ? "Change photo" : "Choose photo"}
        </label>
        <p className="help">A clear, professional photograph of yourself. {PHOTO.label}.</p>
        {pct !== null ? <Progress pct={pct} /> : null}
        {pending ? (
          <p className="help" role="status">
            Sent for review. Learners keep seeing your current photo until it is approved.
          </p>
        ) : null}
        {problem || error ? (
          <p className="field-error" role="alert">
            {problem ?? error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export type DocRow = { id: string; kind: CredentialKind; title: string; issuer: string | null; file_name: string | null; status: string; note: string | null };

/** One list of uploaded documents with their own status, and a remove button where removing is allowed. */
export function DocumentList({ rows, canRemove }: { rows: DocRow[]; canRemove: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (!rows.length) return null;
  return (
    <ul className="flex flex-col">
      {rows.map((d) => {
        const st = CREDENTIAL_STATUS[d.status] ?? CREDENTIAL_STATUS.submitted;
        const locked = d.kind === "identity" && d.status === "approved";
        return (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-dashed border-line-2 py-2.5 last:border-0">
            <FileText size={18} aria-hidden="true" className="flex-none text-ink-2" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{d.title}</span>
              <span className="help truncate">
                {[d.issuer, d.file_name].filter(Boolean).join(" · ")}
                {d.status === "rejected" && d.note ? ` · ${d.note}` : ""}
              </span>
            </span>
            <span className={`pill ${st.tone}`}>{d.status === "submitted" ? "Uploaded" : st.label}</span>
            {canRemove && !locked ? (
              <button
                type="button"
                className="iconbtn ghost"
                aria-label={`Remove ${d.title}`}
                disabled={busy === d.id}
                onClick={async () => {
                  setBusy(d.id);
                  setProblem(null);
                  const r = await removeDocument(d.id);
                  if (r.error) setProblem(r.error);
                  setBusy(null);
                  router.refresh();
                }}
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            ) : null}
          </li>
        );
      })}
      {problem ? (
        <li className="field-error" role="alert">
          {problem}
        </li>
      ) : null}
    </ul>
  );
}

/**
 * Adds one document. For identity the name is the kind of document; for a qualification the expert
 * names it, because the name is what learners read once it is verified.
 */
export function DocumentAdder({ kind, button, error }: { kind: CredentialKind; button: string; error?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const identity = kind === "identity";
  const [title, setTitle] = useState(identity ? "National ID" : "");
  const [issuer, setIssuer] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const id = `doc-${kind}`;

  async function choose(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    const reset = () => {
      if (input.current) input.current.value = "";
    };
    if (!identity && title.trim().length < 2) {
      reset();
      return setProblem("Name the document first, for example Bachelor of Commerce.");
    }
    if (!(DOCUMENT.types as readonly string[]).includes(file.type)) {
      reset();
      return setProblem("Use a PDF, JPG or PNG.");
    }
    if (file.size > DOCUMENT.maxBytes) {
      reset();
      return setProblem("The file is over 10 MB.");
    }
    setPct(0);
    try {
      const started = await startUpload("document", file.type, file.size);
      if (!started.target) throw new Error(started.error ?? "The upload could not start.");
      await putFile(started.target.url, file, setPct);
      const saved = await saveDocument({ kind, title: title.trim(), issuer: issuer.trim() || undefined, path: started.target.path, fileName: file.name });
      if (saved.error) throw new Error(saved.error);
      if (!identity) {
        setTitle("");
        setIssuer("");
      }
      router.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The upload did not go through.");
    } finally {
      setPct(null);
      reset();
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border-[1.5px] border-dashed border-line-2 bg-paper p-4">
      {identity ? (
        <div className="field">
          <label className="label" htmlFor={`${id}-title`}>
            Which document
          </label>
          <span className="sel block">
            <select id={`${id}-title`} className="select" value={title} onChange={(e) => setTitle(e.target.value)}>
              <option>National ID</option>
              <option>Passport</option>
            </select>
          </span>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field">
            <label className="label" htmlFor={`${id}-title`}>
              Name of the {kind === "education" ? "qualification" : kind === "licence" ? "licence" : "certification"}
            </label>
            <input id={`${id}-title`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={kind === "education" ? "Bachelor of Commerce" : "Certified Public Accountant"} />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-issuer`}>
              Issued by <span className="font-normal text-ink-2">(optional)</span>
            </label>
            <input id={`${id}-issuer`} className="input" value={issuer} onChange={(e) => setIssuer(e.target.value)} maxLength={120} placeholder={kind === "education" ? "University of Nairobi" : "KASNEB"} />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} id={id} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
        <label htmlFor={id} className={`btn2 ink cursor-pointer ${pct !== null ? "pointer-events-none opacity-60" : ""}`}>
          <UploadCloud size={18} aria-hidden="true" />
          {button}
        </label>
        {pct !== null ? <Progress pct={pct} /> : <span className="help">{DOCUMENT.label}</span>}
      </div>
      {problem || error ? (
        <p className="field-error" role="alert">
          {problem ?? error}
        </p>
      ) : null}
    </div>
  );
}

export const credentialKindLabel = (k: CredentialKind) => CREDENTIAL_KINDS[k];
