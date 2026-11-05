import { PlannedScreen } from "@/components/app/planned";

export default function PlannedTeachPage(props: PageProps<"/teach/[...slug]">) {
  return <PlannedScreen params={props.params} prefix="/teach" area={["teacher"]} />;
}
