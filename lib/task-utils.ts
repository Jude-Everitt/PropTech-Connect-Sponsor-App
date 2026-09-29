export function isGeneratedCopyTask(title: string) {
  return /^copy of\b/i.test(title.trim());
}

export function isObsoleteBrandingArtworkTask(title: string, category: string) {
  return title.trim().toLowerCase() === "submit artwork" && /branding/i.test(category);
}