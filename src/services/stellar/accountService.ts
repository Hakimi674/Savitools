/**
 * Calculates the minimum reserve required for a Stellar account.
 * The formula is based on Stellar's current reserve requirements:
 * - Base account: 2 * baseReserve
 * - Each trustline: 1 * baseReserve
 * - Each additional signer (beyond the master key): 1 * baseReserve
 * - Each data entry: 1 * baseReserve
 *
 * @param baseReserve The current base reserve value in XLM (e.g., 0.5 XLM).
 * @param numTrustlines The number of trustlines on the account.
 * @param numSigners The total number of signers on the account (including the master key).
 * @param numDataEntries The number of data entries on the account.
 * @returns The calculated minimum reserve in XLM.
 */
export const calculateMinReserve = (
  baseReserve: number,
  numTrustlines: number,
  numSigners: number,
  numDataEntries: number
): number => {
  // The base account itself requires 2 * baseReserve.
  // Each additional signer beyond the master key costs 1 * baseReserve.
  const additionalSignersCost = Math.max(0, numSigners - 1);

  const totalEntries = 2 + numTrustlines + additionalSignersCost + numDataEntries;
  const minReserve = totalEntries * baseReserve;

  // Ensure the result is formatted to a reasonable precision for XLM
  return parseFloat(minReserve.toFixed(7));
};
