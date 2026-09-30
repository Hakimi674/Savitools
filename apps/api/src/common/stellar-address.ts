/**
 * Shape check for a Stellar `G…` ed25519 public key.
 *
 * Several call sites (federation input parsing, SEP request links, the
 * playground/sdkgen paths) need to tell an account id apart from a domain or a
 * federation address *before* doing network work. The pattern lived in each of
 * them; it lives here once so the length/alphabet cannot drift between them.
 *
 * This is a shape check only. Checksum validation belongs to `StrKey` /
 * `parseDestination`, which is what actually decides whether an address exists.
 */
export const STELLAR_PUBLIC_KEY_PATTERN = /^G[A-Z2-7]{55}$/;

export function isStellarPublicKey(value: unknown): value is string {
  return typeof value === 'string' && STELLAR_PUBLIC_KEY_PATTERN.test(value);
}
