"use client";
import { useEffect } from "react";
import { ServerCrash } from "lucide-react";
import { StatusPage } from "@/components/ui/status-page";

const DEV = process.env.NODE_ENV === "development";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const e = error instanceof Error ? (error as Error & { digest?: string }) : null;
  return (
    <div>
      <StatusPage
        Icon={ServerCrash}
        title="Something went wrong on our side"
        body={
          <>
            <p>
              Nothing was charged. Try again in a minute.{" "}
              <button type="button" className="btn3" onClick={() => retry()}>
                Try again now
              </button>
            </p>
            {/* Development only: the real error, so a crash can be reported and fixed. */}
            {DEV ? (
              <pre className="mono mt-4 max-h-[320px] overflow-auto rounded-[12px] bg-sand p-4 text-[13px] leading-5 whitespace-pre-wrap text-ink">
                {e ? `${e.name}: ${e.message}${e.digest ? `\ndigest ${e.digest}` : ""}\n\n${e.stack ?? ""}` : String(error)}
              </pre>
            ) : null}
          </>
        }
      />
    </div>
  );
}
