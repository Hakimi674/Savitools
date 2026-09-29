import { calculateMinReserve } from '../../../../src/services/stellar/accountService';

describe('Stellar Account Service - calculateMinReserve', () => {
  // Test case 1: Minimum account (2 * baseReserve)
  test('should calculate minimum reserve for a basic account (1 signer, 0 trustlines, 0 data entries)', () => {
    const baseReserve = 0.5;
    const numTrustlines = 0;
    const numSigners = 1; // Master key only
    const numDataEntries = 0;
    expect(calculateMinReserve(baseReserve, numTrustlines, numSigners, numDataEntries)).toBe(1.0);
  });

  // Test case 2: Account with one trustline
  test('should calculate reserve with one trustline', () => {
    const baseReserve = 0.5;
    const numTrustlines = 1;
    const numSigners = 1;
    const numDataEntries = 0;
    expect(calculateMinReserve(baseReserve, numTrustlines, numSigners, numDataEntries)).toBe(1.5);
  });

  // Test case 3: Account with multiple trustlines
  test('should calculate reserve with multiple trustlines', () => {
    const baseReserve = 0.5;
    const numTrustlines = 5;
    const numSigners = 1;
    const numDataEntries = 0;
    expect(calculateMinReserve(baseReserve, numTrustlines, numSigners, numDataEntries)).toBe(3.5);
  });

  // Test case 4: Account with an additional signer
  test('should calculate reserve with one additional signer (total 2 signers)', () => {
    const baseReserve = 0.5;
    const numTrustlines = 0;
    const numSigners = 2; // Master key + 1 additional
    const numDataEntries = 0;
    expect(calculateMinReserve(baseReserve, numTrustlines, numSigners, numDataEntries)).toBe(1.5);
  });

  // Test case 5: Account with multiple additional signers
  test('should calculate reserve with multiple additional signers (total 4 signers)', () => {
    const baseReserve = 0.5;
    const numTrustlines = 0;
    const numSigners = 4; // Master key + 3 additional
    const numDataEntries = 0;
    expect(calculateMinReserve(baseReserve, numTrustlines, numSigners, numDataEntries)).toBe(2.5);
  });

  // Test case 6: Account with one data entry
  test('should calculate reserve with one data entry', () => {
    const baseReserve = 0.5;
    const numTrustlines = 0;
    const numSigners = 1;
    const numDataEntries = 1;
    expect(calculateMinReserve(baseReserve, numTrustlines, numSigners, numDataEntries)).toBe(1.5);
  });

  // Test case 7: Account with multiple data entries
  test('should calculate reserve with multiple data entries', () => {
    const baseReserve = 0.5;
    const numTrustlines = 0;
    const numSigners = 1;
    const numDataEntries = 3;
    expect(calculateMinReserve(baseReserve, numTrustlines, numSigners, numDataEntries)).toBe(2.5);
  });

  // Test case 8: Account with all components (trustlines, signers, data entries)
  test('should calculate reserve with all components', () => {
    const baseReserve = 0.5;
    const numTrustlines = 2;
    const numSigners = 3; // Master key + 2 additional
    const numDataEntries = 4;
    // (2 + 2 + (3-1) + 4) * 0.5 = (2 + 2 + 2 + 4) * 0.5 = 10 * 0.5 = 5.0
    expect(calculateMinReserve(baseReserve, numTrustlines, numSigners, numDataEntries)).toBe(5.0);
  });

  // Test case 9: Different base reserve value
  test('should calculate reserve with a different base reserve value', () => {
    const baseReserve = 1.0; // Example: if base reserve changes
    const numTrustlines = 1;
    const numSigners = 2;
    const numDataEntries = 1;
    // (2 + 1 + (2-1) + 1) * 1.0 = (2 + 1 + 1 + 1) * 1.0 = 5 * 1.0 = 5.0
    expect(calculateMinReserve(baseReserve, numTrustlines, numSigners, numDataEntries)).toBe(5.0);
  });

  // Test case 10: Zero base reserve (edge case, though unlikely in practice)
  test('should return 0 if base reserve is 0', () => {
    const baseReserve = 0;
    const numTrustlines = 10;
    const numSigners = 5;
    const numDataEntries = 10;
    expect(calculateMinReserve(baseReserve, numTrustlines, numSigners, numDataEntries)).toBe(0);
  });

  // Test case 11: Large numbers
  test('should handle large numbers of components', () => {
    const baseReserve = 0.5;
    const numTrustlines = 100;
    const numSigners = 50;
    const numDataEntries = 200;
    // (2 + 100 + (50-1) + 200) * 0.5 = (2 + 100 + 49 + 200) * 0.5 = 351 * 0.5 = 175.5
    expect(calculateMinReserve(baseReserve, numTrustlines, numSigners, numDataEntries)).toBe(175.5);
  });

  // Test case 12: Precision check
  test('should return a precise value for non-integer results', () => {
    const baseReserve = 0.00001;
    const numTrustlines = 1;
    const numSigners = 1;
    const numDataEntries = 1;
    // (2 + 1 + 0 + 1) * 0.00001 = 4 * 0.00001 = 0.00004
    expect(calculateMinReserve(baseReserve, numTrustlines, numSigners, numDataEntries)).toBe(0.00004);
  });
});
