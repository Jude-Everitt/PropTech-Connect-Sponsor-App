export function isGeneratedCopyTask(title: string) {
  return /^copy of\b/i.test(title.trim());
}

export function isObsoleteBrandingArtworkTask(title: string, category: string) {
  const normalizedTitle = title.trim().toLowerCase();
  return /branding/i.test(category) && (
    normalizedTitle === "submit artwork"
    || /^submit tier [1-4] branding artwork$/.test(normalizedTitle)
    || normalizedTitle === "submit pillar branding artwork"
  );
}

export function isObsoleteBoothApprovalTask(title: string, category: string) {
  return title.trim().toLowerCase() === "approve artwork" && /booth|exhibition/i.test(category);
}

export function isSponsorContactFieldTask(title: string, category: string) {
  const normalizedCategory = category.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalizedCategory === "pocs"
    || normalizedTitle.startsWith("pocsdealcontact")
    || normalizedTitle.startsWith("pocscampaigncontact")
    || normalizedTitle.startsWith("copyofdubai27contactname");
}

export function isBrandingDeliverableCategory(category: string) {
  const normalized = category.trim().toLowerCase();
  return normalized.includes("branding")
    || normalized.includes("pillar")
    || normalized === "coffee cart sponsor"
    || normalized === "wifi sponsor";
}
// Deliverable groups as shown on the sponsors page tabs: every branding-style category collapses into "Branding".
export function deliverableGroup(category: string) {
  return isBrandingDeliverableCategory(category) ? "Branding" : category;
}
