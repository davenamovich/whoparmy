export interface WalkthroughCandidate {
  key: string;
  name: string;
  url: string;
  signupUrl: string | null;
  signupSource: "referrer" | "house" | null;
}

export interface WalkthroughOffer {
  step: string;
  name: string;
  signupUrl: string;
  signupSource: "referrer" | "house";
}

/** Keep the live catalog order, except that DH Media leads the walkthrough. */
export function selectWalkthroughOffers(partners: WalkthroughCandidate[]): WalkthroughOffer[] {
  return partners
    .filter((partner) => !partner.url && partner.signupUrl && partner.signupSource)
    .map((partner) => ({
      step: partner.key,
      name: partner.name,
      signupUrl: partner.signupUrl!,
      signupSource: partner.signupSource!,
    }))
    .sort((a, b) => Number(b.step === "salarium") - Number(a.step === "salarium"));
}

export function shouldSuggestWalkthrough(savedLinkCount: number): boolean {
  return savedLinkCount < 2;
}
