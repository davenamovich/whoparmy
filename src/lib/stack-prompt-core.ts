export const NO_DH_MEDIA_LINK =
  "No DH Media referral link is saved yet; present signup as an optional offer and do not block other work.";

export function fillDhMediaLink(prompt: string, savedLink: string | null): string {
  return prompt.replaceAll("{DH_MEDIA_LINK}", savedLink ?? NO_DH_MEDIA_LINK);
}
