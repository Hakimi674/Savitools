import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import {
  DecodedContractEvent,
  EventFilterCriterion,
  applyEventFilters,
  describeCriterion,
  eventFilterCriteriaError,
  matchesCriterion,
} from './event-filters';
import { decodeScVal } from './scval-decoder';

const CONTRACT_ID = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
const FROM = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';

function event(
  overrides: Partial<DecodedContractEvent> & {
    topicVals?: xdr.ScVal[];
    valueVal?: xdr.ScVal;
  } = {},
): DecodedContractEvent {
  const { topicVals, valueVal, ...rest } = overrides;
  return {
    id: 'evt-1',
    type: 'contract',
    ledger: 100,
    ledgerClosedAt: '2024-01-01T00:00:00Z',
    pagingToken: 'token-1',
    inSuccessfulContractCall: true,
    txHash: 'abc123',
    contractId: CONTRACT_ID,
    topic: (topicVals ?? [nativeToScVal('transfer', { type: 'symbol' })]).map(decodeScVal),
    value: decodeScVal(valueVal ?? nativeToScVal(1000n, { type: 'i128' })),
    ...rest,
  };
}

describe('event filters', () => {
  const transferEvent = event({
    id: 'transfer',
    topicVals: [
      nativeToScVal('transfer', { type: 'symbol' }),
      new Address(FROM).toScVal(),
    ],
    valueVal: nativeToScVal(1000n, { type: 'i128' }),
    ledger: 100,
  });

  const mintEvent = event({
    id: 'mint',
    topicVals: [nativeToScVal('mint', { type: 'symbol' })],
    valueVal: nativeToScVal(42, { type: 'u32' }),
    ledger: 200,
  });

  const approveEvent = event({
    id: 'approve',
    topicVals: [nativeToScVal('approve', { type: 'symbol' })],
    valueVal: xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: nativeToScVal('amount', { type: 'symbol' }),
        val: nativeToScVal(7n, { type: 'i128' }),
      }),
    ]),
    ledger: 300,
  });

  const all = [transferEvent, mintEvent, approveEvent];

  describe('eventFilterCriteriaError', () => {
    it('accepts valid text and inclusive ledger criteria', () => {
      expect(
        eventFilterCriteriaError([
          { kind: 'topic_contains', value: 'transfer' },
          { kind: 'ledger_range', from: 0, to: 0 },
        ]),
      ).toBeNull();
    });

    it.each([
      [[{ kind: 'ledger_range' }], 'requires from or to'],
      [[{ kind: 'ledger_range', from: -1 }], 'non-negative safe integers'],
      [[{ kind: 'ledger_range', from: 0.5 }], 'non-negative safe integers'],
      [[{ kind: 'ledger_range', from: Number.MAX_SAFE_INTEGER + 1 }], 'non-negative safe integers'],
      [[{ kind: 'ledger_range', from: 20, to: 10 }], 'from must not exceed to'],
      [[{ kind: 'value_equals', value: '  ' }], 'non-empty string'],
      [[{ kind: 'topic_contains', value: 'x'.repeat(257) }], '256 characters or fewer'],
      [[{ kind: 'other', value: 'x' }], 'not supported'],
    ])('rejects invalid criteria %#', (criteria, message) => {
      expect(eventFilterCriteriaError(criteria)).toContain(message);
    });

    it('caps the number of criteria', () => {
      expect(
        eventFilterCriteriaError(
          Array.from({ length: 11 }, () => ({ kind: 'value_equals', value: 'x' })),
        ),
      ).toContain('at most 10');
    });
  });

  describe('matchesCriterion', () => {
    const cases: Array<[string, EventFilterCriterion, string[]]> = [
      ['topic_contains transfer', { kind: 'topic_contains', value: 'transfer' }, ['transfer']],
      ['topic_contains is case-insensitive', { kind: 'topic_contains', value: 'TRANSFER' }, ['transfer']],
      ['topic_contains is a substring match', { kind: 'topic_contains', value: 'ansfe' }, ['transfer']],
      ['topic_contains searches every topic, not just the first', { kind: 'topic_contains', value: FROM }, ['transfer']],
      ['topic_contains matching nothing', { kind: 'topic_contains', value: 'burn' }, []],
      ['value_type_is scvI128', { kind: 'value_type_is', value: 'scvI128' }, ['transfer']],
      ['value_type_is accepts the bare name', { kind: 'value_type_is', value: 'i128' }, ['transfer']],
      ['value_type_is scvU32', { kind: 'value_type_is', value: 'scvU32' }, ['mint']],
      ['value_type_is scvMap', { kind: 'value_type_is', value: 'scvMap' }, ['approve']],
      ['value_equals on a stringified i128', { kind: 'value_equals', value: '1000' }, ['transfer']],
      ['value_equals on a u32', { kind: 'value_equals', value: '42' }, ['mint']],
      ['value_equals reaches inside a map', { kind: 'value_equals', value: '7' }, ['approve']],
      ['value_equals is exact, not substring', { kind: 'value_equals', value: '100' }, []],
      ['ledger_range lower bound only', { kind: 'ledger_range', from: 200 }, ['mint', 'approve']],
      ['ledger_range upper bound only', { kind: 'ledger_range', to: 200 }, ['transfer', 'mint']],
      ['ledger_range both bounds', { kind: 'ledger_range', from: 150, to: 250 }, ['mint']],
      ['ledger_range is inclusive', { kind: 'ledger_range', from: 100, to: 100 }, ['transfer']],
      ['ledger_range unbounded', { kind: 'ledger_range' }, ['transfer', 'mint', 'approve']],
    ];

    it.each(cases)('%s', (_label, criterion, expected) => {
      expect(all.filter((e) => matchesCriterion(e, criterion)).map((e) => e.id)).toEqual(expected);
    });
  });

  describe('applyEventFilters', () => {
    it('narrows to a single event with Symbol("transfer")', () => {
      const result = applyEventFilters(all, [{ kind: 'topic_contains', value: 'transfer' }]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('transfer');
      expect(result[0].matchedCriteria).toEqual(['topic contains transfer']);
    });

    it('ANDs multiple criteria', () => {
      const result = applyEventFilters(all, [
        { kind: 'topic_contains', value: 'transfer' },
        { kind: 'value_type_is', value: 'scvI128' },
        { kind: 'ledger_range', from: 50, to: 150 },
      ]);

      expect(result.map((e) => e.id)).toEqual(['transfer']);
      expect(result[0].matchedCriteria).toEqual([
        'topic contains transfer',
        'value type is scvI128',
        'ledger 50..150',
      ]);
    });

    it('returns nothing when criteria conflict', () => {
      expect(
        applyEventFilters(all, [
          { kind: 'topic_contains', value: 'transfer' },
          { kind: 'value_type_is', value: 'scvU32' },
        ]),
      ).toEqual([]);
    });

    it('is a no-op for an empty criteria list', () => {
      const result = applyEventFilters(all, []);
      expect(result.map((e) => e.id)).toEqual(['transfer', 'mint', 'approve']);
      expect(result.every((e) => e.matchedCriteria?.length === 0)).toBe(true);
    });

    it('does not mutate the input events', () => {
      applyEventFilters(all, [{ kind: 'topic_contains', value: 'transfer' }]);
      expect(transferEvent.matchedCriteria).toBeUndefined();
    });

    it('handles an empty event list', () => {
      expect(applyEventFilters([], [{ kind: 'topic_contains', value: 'x' }])).toEqual([]);
    });
  });

  describe('nested value search', () => {
    it('finds a scalar nested deep inside a vec', () => {
      const nested = event({
        valueVal: xdr.ScVal.scvVec([
          xdr.ScVal.scvVec([nativeToScVal('deep', { type: 'symbol' })]),
        ]),
      });

      expect(matchesCriterion(nested, { kind: 'value_equals', value: 'deep' })).toBe(true);
    });

    it('finds a map key as well as its value', () => {
      const withMap = event({
        valueVal: xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: nativeToScVal('amount', { type: 'symbol' }),
            val: nativeToScVal(5n, { type: 'i128' }),
          }),
        ]),
      });

      expect(matchesCriterion(withMap, { kind: 'value_equals', value: 'amount' })).toBe(true);
      expect(matchesCriterion(withMap, { kind: 'value_equals', value: '5' })).toBe(true);
    });

    it('searches an exotic-key map stored as key/value pairs', () => {
      const exotic = event({
        valueVal: xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvVec([nativeToScVal('k', { type: 'symbol' })]),
            val: nativeToScVal('v', { type: 'symbol' }),
          }),
        ]),
      });

      expect(matchesCriterion(exotic, { kind: 'value_equals', value: 'k' })).toBe(true);
      expect(matchesCriterion(exotic, { kind: 'value_equals', value: 'v' })).toBe(true);
    });

    it('does not match a void value', () => {
      const empty = event({ valueVal: xdr.ScVal.scvVoid() });
      expect(matchesCriterion(empty, { kind: 'value_equals', value: 'null' })).toBe(false);
      expect(matchesCriterion(empty, { kind: 'value_type_is', value: 'scvVoid' })).toBe(true);
    });
  });

  describe('describeCriterion', () => {
    it.each([
      [{ kind: 'topic_contains', value: 'transfer' } as EventFilterCriterion, 'topic contains transfer'],
      [{ kind: 'value_type_is', value: 'scvI128' } as EventFilterCriterion, 'value type is scvI128'],
      [{ kind: 'value_equals', value: '1000' } as EventFilterCriterion, 'value equals 1000'],
      [{ kind: 'ledger_range', from: 1, to: 2 } as EventFilterCriterion, 'ledger 1..2'],
      [{ kind: 'ledger_range', from: 1 } as EventFilterCriterion, 'ledger 1..*'],
      [{ kind: 'ledger_range' } as EventFilterCriterion, 'ledger *..*'],
    ])('renders %o', (criterion, expected) => {
      expect(describeCriterion(criterion)).toBe(expected);
    });
  });
});
