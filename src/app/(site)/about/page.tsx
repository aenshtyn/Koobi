import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { PageIntro, PromisesBand } from "@/components/site/sections";
import { Plant } from "@/components/ui/doodles";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <PageIntro
        title={
          <>
            {brand.name}. <span className="swash">{brand.tagline.replace(".", "")}</span>.
          </>
        }
        lead="A place where Kenyan teachers, professionals and practitioners teach what they have done, to anyone who wants to learn it."
      />
      <section className="page-wrap relative grid gap-10 pb-20 lg:grid-cols-2">
        <div className="prose-k">
          <h2>The name</h2>
          <p>
            Koobi Fora is on the eastern shore of Lake Turkana, where some of the most important early human fossils were
            found. It is a reminder that learning is where every career, business and farm starts, and that it starts here.
          </p>
          <h2>What we believe</h2>
          <ul>
            <li>The best teacher for a skill is someone who has used it, at work, in a classroom or on a farm.</li>
            <li>Trust should be a fact you can check: what we verified, and when.</li>
            <li>Money belongs to the learner until the lesson happens.</li>
            <li>A person should answer when something goes wrong.</li>
          </ul>
        </div>
        <div className="prose-k">
          <h2>How we work</h2>
          <p>
            We check every teacher and expert before their learning experiences appear, hold payments until lessons happen, and pay teachers
            weekly to M-Pesa with a statement. We never show a rating, review or credential we do not have.
          </p>
          <h2>Talk to us</h2>
          <p>
            We are in {brand.city}. Write to <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>, or see the{" "}
            <Link href="/help">help centre</Link>.
          </p>
        </div>
        <Plant className="plant dood hide-sm" style={{ right: 24, bottom: 24, width: 70, height: 122 }} />
      </section>
      <PromisesBand />
    </>
  );
}
