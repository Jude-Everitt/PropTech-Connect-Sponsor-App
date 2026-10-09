import { notFound } from "next/navigation";
import AdminTaskStatusList from "@/app/ui/admin-task-status-list";

type Props = { params: Promise<{ eventId: string; sponsorId: string; status: string }> };
const allowedStatus = new Set(["incomplete", "overdue"]);

export default async function AdminSponsorTaskStatusPage({ params }: Props) {
  const { eventId, sponsorId, status } = await params;
  if (!allowedStatus.has(status)) notFound();
  return <AdminTaskStatusList eventId={eventId} sponsorId={sponsorId} state={status === "overdue" ? "Overdue" : "Incomplete"} />;
}
