import { redirect } from "next/navigation";
import { Suspense } from "react";

/** Card checkout starts from the pay screen ("Pay by card instead"); this route keeps old links working. */
export default function CardPage(props: PageProps<"/checkout/[id]/card">) {
  return (
    <Suspense fallback={null}>
      <Go params={props.params} />
    </Suspense>
  );
}

async function Go({ params }: { params: Promise<{ id: string }> }): Promise<null> {
  const { id } = await params;
  redirect(`/checkout/${id}/pay`);
}
