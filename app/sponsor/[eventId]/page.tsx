import SponsorRoadmap from "@/app/ui/sponsor-roadmap";

type Props = { params: Promise<{ eventId: string }> };

export default async function SponsorRoadmapPage({ params }: Props) {
  const { eventId } = await params;
  return <SponsorRoadmap eventId={eventId} />;
}
