import { redirect } from "next/navigation";

type Props = { params: Promise<{ eventId: string }> };

export default async function AdminReviewQueuePage({ params }: Props) {
  const { eventId } = await params;
  redirect(`/admin/${eventId}/deliverables`);
}