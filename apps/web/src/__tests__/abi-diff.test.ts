import { compareAbis } from '@/lib/abi-diff';

describe('compareAbis', () => {
  it('classifies added methods and events as additive', () => {
    const changes = compareAbis({}, {
      methods: [{ name: 'get', args: [], returns: 'u32' }],
      events: [{ name: 'Updated', args: [] }],
    });

    expect(changes.map(({ classification, kind, name }) => [classification, kind, name])).toEqual([
      ['additive', 'method', 'get'],
      ['additive', 'event', 'Updated'],
    ]);
  });

  it('classifies removed and signature-changed entries as breaking', () => {
    const changes = compareAbis(
      {
        methods: [
          { name: 'keep', args: [{ name: 'amount', type: 'i128' }], returns: 'bool' },
          { name: 'remove', args: [] },
        ],
      },
      { methods: [{ name: 'keep', args: [{ name: 'amount', type: 'i64' }], returns: 'bool' }] },
    );

    expect(changes.map(({ classification, name }) => [classification, name])).toEqual([
      ['breaking', 'keep'],
      ['breaking', 'remove'],
    ]);
  });

  it('rejects malformed ABI documents with a useful error', () => {
    expect(() => compareAbis([], {})).toThrow('Each ABI must be a JSON object.');
  });
});