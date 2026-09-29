import { notFound } from "next/navigation";
import SponsorTaskStatusList from "@/app/ui/sponsor-task-status-list";

type Props = { params: Promise<{ eventId: string; sponsorId: string; status: string }> };
const allowedStatus = new Set(["awaiting-review", "awaiting-sponsor", "overdue"]);

export default async function AdminSponsorTaskStatusPage({ params }: Props) {
  const { eventId, sponsorId, status } = await params;
  if (!allowedStatus.has(status)) notFound();
  return <SponsorTaskStatusList eventId={eventId} sponsorId={sponsorId} viewingAsAdmin status={status as "awaiting-review" | "awaiting-sponsor" | "overdue"} />;
}
