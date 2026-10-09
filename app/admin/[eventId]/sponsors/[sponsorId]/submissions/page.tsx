import { redirect } from "next/navigation";

type Props = { params: Promise<{ eventId: string; sponsorId: string }> };

export default async function AdminSubmissionsPage({ params }: Props) {
  const { eventId, sponsorId } = await params;
  redirect(`/admin/${eventId}/sponsors/${sponsorId}`);
}