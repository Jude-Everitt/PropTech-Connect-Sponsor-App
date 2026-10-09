import SponsorRoadmap from "@/app/ui/sponsor-roadmap";

type Props = { params: Promise<{ eventId: string; sponsorId: string }> };

export default async function AdminSponsorRoadmapPage({ params }: Props) {
  const { eventId, sponsorId } = await params;
  return <SponsorRoadmap eventId={eventId} sponsorId={sponsorId} />;
}
