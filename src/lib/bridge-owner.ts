export type BridgeOwnerCredential =
  | { kind: "spend"; session: { user: { id: string } } }
  | { kind: "update"; userId: string };

export function bearerToken(authorization: string | null): string | null {
  return /^Bearer\s+(\S+)$/i.exec((authorization ?? "").trim())?.[1] ?? null;
}

/** Resolve a bridge request's tenant. A valid bearer token is authoritative. */
export async function resolveBridgeOwnerId(args: {
  authorization: string | null;
  verifyToken: (token: string) => Promise<BridgeOwnerCredential | null>;
  sessionUserId: () => Promise<string | null>;
}): Promise<string | null> {
  const token = bearerToken(args.authorization);
  if (token) {
    const credential = await args.verifyToken(token);
    if (!credential) return null;
    return credential.kind === "spend" ? credential.session.user.id : credential.userId;
  }
  return args.sessionUserId();
}
