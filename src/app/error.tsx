"use client";
import { ServerCrash } from "lucide-react";
import { StatusPage } from "@/components/ui/status-page";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div>
      <StatusPage
        Icon={ServerCrash}
        title="Something went wrong on our side"
        body={
          <p>
            Nothing was charged. Try again in a minute.{" "}
            <button type="button" className="btn3" onClick={reset}>
              Try again now
            </button>
          </p>
        }
      />
    </div>
  );
}
