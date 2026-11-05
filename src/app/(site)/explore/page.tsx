import type { Metadata } from "next";
import { Suspense } from "react";
import { ExploreHeader, ExploreResults, ExploreResultsSkeleton } from "@/components/site/explore-view";

export const metadata: Metadata = {
  title: "Explore learning",
  description: "Lessons, group classes, workshops and programmes from verified Kenyan teachers and experts.",
};

export default function ExplorePage(props: PageProps<"/explore">) {
  return (
    <>
      <ExploreHeader />
      <Suspense fallback={<ExploreResultsSkeleton />}>
        <ExploreResults searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
