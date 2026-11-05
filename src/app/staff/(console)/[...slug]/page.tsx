import { PlannedScreen } from "@/components/app/planned";
import { STAFF_ROLES } from "@/lib/auth";

export default function PlannedStaffPage(props: PageProps<"/staff/[...slug]">) {
  return <PlannedScreen params={props.params} prefix="/staff" area={["staff"]} anyOf={STAFF_ROLES} />;
}
