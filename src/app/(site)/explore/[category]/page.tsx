import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CATEGORIES, categoryBySlug } from "@/domain/taxonomy";
import { ExploreHeader, ExploreResults, ExploreResultsSkeleton } from "@/components/site/explore-view";

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

export async function generateMetadata(props: PageProps<"/explore/[category]">): Promise<Metadata> {
  const { category } = await props.params;
  const c = categoryBySlug(category);
  return c ? { title: c.label, description: c.description } : {};
}

export default function CategoryPage(props: PageProps<"/explore/[category]">) {
  return (
    <Suspense fallback={<ExploreResultsSkeleton />}>
      <Category {...props} />
    </Suspense>
  );
}

async function Category({ params, searchParams }: PageProps<"/explore/[category]">) {
  const category = categoryBySlug((await params).category);
  if (!category) notFound();
  return (
    <>
      <ExploreHeader category={category} />
      <Suspense fallback={<ExploreResultsSkeleton />}>
        <ExploreResults searchParams={searchParams} category={category} />
      </Suspense>
    </>
  );
}
