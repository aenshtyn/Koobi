import Link from "next/link";
import type { Category } from "@/domain/taxonomy";
import { CircleArrow, Spark } from "@/components/ui/doodles";
import { CATEGORY_ICONS } from "./offer-card";

const RADII = ["", "r2", "r3", "r4"];

export function CategoryCard({ category, index }: { category: Category; index: number }) {
  const Icon = CATEGORY_ICONS[category.icon];
  return (
    <Link className={`ccard lift ${RADII[index % 4]}`} href={`/explore/${category.slug}`}>
      <Spark className="spark sm" />
      <span className="flex items-center gap-4">
        <span className={`num ${category.numClass}`} aria-hidden="true">
          {category.number}
        </span>
        <Icon size={34} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <span className="ct">{category.label}</span>
      <span className="mt-auto flex items-end gap-2.5">
        <span className="min-w-0 flex-1 text-[15px] leading-[22px] text-ink-2">{category.description}</span>
        <CircleArrow />
      </span>
    </Link>
  );
}
