import {
  STELLAR_PUBLIC_KEY_PATTERN,
  isStellarPublicKey,
} from './stellar-address';

/** 56 characters: `G` plus 55 base32 symbols. */
const PUBLIC_KEY = 'G' + 'A'.repeat(55);
const MUXED = 'M' + 'A'.repeat(68);

describe('stellar address validators', () => {
  it('accepts a G… public key', () => {
    expect(isStellarPublicKey(PUBLIC_KEY)).toBe(true);
    expect(STELLAR_PUBLIC_KEY_PATTERN.test(PUBLIC_KEY)).toBe(true);
  });

  it('rejects a muxed M… account, a domain and a malformed key', () => {
    for (const value of [MUXED, 'example.com', 'user*example.com', '', 'G']) {
      expect(isStellarPublicKey(value)).toBe(false);
    }
  });

  it('rejects keys of the wrong length or alphabet', () => {
    expect(isStellarPublicKey('G' + 'A'.repeat(54))).toBe(false);
    expect(isStellarPublicKey('G' + 'A'.repeat(56))).toBe(false);
    expect(isStellarPublicKey('g' + 'a'.repeat(55))).toBe(false);
    expect(isStellarPublicKey('G' + '0'.repeat(55))).toBe(false);
  });

  it('rejects non-string input without throwing', () => {
    for (const value of [undefined, null, 42, {}, []]) {
      expect(isStellarPublicKey(value)).toBe(false);
    }
  });
});
