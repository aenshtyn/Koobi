import type { Metadata } from "next";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import { Guarded } from "@/components/app/shell";
import { DocumentAdder, DocumentList } from "@/components/expert/uploaders";
import { getCredentials } from "@/lib/data/expert";
import { BackToProfile, loadDraft } from "../shared";

export const metadata: Metadata = { title: "Verified credentials" };

export default function CredentialsPage() {
  return (
    <Guarded next="/teach/profile/credentials">
      <Credentials />
    </Guarded>
  );
}

async function Credentials() {
  const { app } = await loadDraft();
  const docs = await getCredentials(app.id);
  const identity = docs.filter((d) => d.kind === "identity");
  const others = docs.filter((d) => d.kind !== "identity");
  const idRejected = identity.length > 0 && identity.every((d) => d.status === "rejected");
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <BackToProfile />
      <div className="flex flex-col gap-2">
        <h1 className="t1">Verified Credentials</h1>
        <p className="text-ink-2">Each qualification, certification and licence is verified by Koobi on its own. Only verified ones appear on your public profile, with their name and type.</p>
      </div>
      <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="cred-h">
        <h2 id="cred-h" className="t2 flex items-center gap-2.5">
          <BadgeCheck size={22} aria-hidden="true" className="text-orange" />
          Your qualifications
        </h2>
        {others.length ? <DocumentList rows={others} canRemove /> : <p className="help">None yet. Qualifications are optional: many experts teach from practical experience.</p>}
      </section>
      <section className="card flex flex-col gap-5 p-5 sm:p-6" aria-labelledby="add-h">
        <div className="flex flex-col gap-1">
          <h2 id="add-h" className="t2">
            Submit another credential
          </h2>
          <p className="help">Name it as learners should read it, then choose the document. A reviewer checks it against the document.</p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="t3">Educational qualification</h3>
          <DocumentAdder kind="education" button="Add a document" />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="t3">Professional certification</h3>
          <DocumentAdder kind="certification" button="Add a document" />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="t3">Professional licence</h3>
          <DocumentAdder kind="licence" button="Add a document" />
        </div>
      </section>
      <section className="card flex flex-col gap-3 p-5 sm:p-6" aria-labelledby="id-h">
        <h2 id="id-h" className="t2 flex items-center gap-2.5">
          <ShieldCheck size={22} aria-hidden="true" className="text-forest" />
          Identity document
        </h2>
        <p className="help">Seen only by Koobi reviewers. It never appears on your public profile. Upload a new one if your legal name changes.</p>
        <DocumentList rows={identity} canRemove={false} />
        {idRejected || !identity.length ? <DocumentAdder kind="identity" button="Upload identification document" /> : null}
      </section>
    </div>
  );
}
