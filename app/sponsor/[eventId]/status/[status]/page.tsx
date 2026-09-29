import { notFound } from "next/navigation";
import SponsorTaskStatusList from "@/app/ui/sponsor-task-status-list";

type Props = { params: Promise<{ eventId: string; status: string }> };
const allowedStatus = new Set(["awaiting-review", "awaiting-sponsor", "overdue"]);

export default async function SponsorTaskStatusPage({ params }: Props) {
  const { eventId, status } = await params;
  if (!allowedStatus.has(status)) notFound();
  return <SponsorTaskStatusList eventId={eventId} status={status as "awaiting-review" | "awaiting-sponsor" | "overdue"} />;
}
