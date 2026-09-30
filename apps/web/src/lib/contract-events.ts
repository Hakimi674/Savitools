import type { DecodedContractEvent, DecodedScVal } from './api';

/**
 * Client-side mirror of the API's `event-filters.ts`, so narrowing a loaded
 * event set is instant with no round-trip. The predicates must stay
 * behaviourally identical to the server's — the API keeps the authoritative
 * copy and its test table.
 */
export type EventFilterCriterion =
  | { kind: 'topic_contains'; value: string }
  | { kind: 'value_type_is'; value: string }
  | { kind: 'value_equals'; value: string }
  | { kind: 'ledger_range'; from?: number; to?: number };

export const MAX_EVENT_FILTER_CRITERIA = 10;
export const MAX_EVENT_FILTER_VALUE_LENGTH = 256;

export type EventFilterBuildResult =
  | { criterion: EventFilterCriterion; error: null }
  | { criterion: null; error: string };

/** Parse builder inputs without accepting NaN, unsafe integers, or inverted ranges. */
export function buildEventFilterCriterion(
  kind: EventFilterCriterion['kind'],
  value: string,
  from: string,
  to: string,
): EventFilterBuildResult {
  if (kind !== 'ledger_range') {
    const normalized = value.trim();
    if (!normalized) return { criterion: null, error: 'Enter a value for this filter.' };
    if (normalized.length > MAX_EVENT_FILTER_VALUE_LENGTH) {
      return {
        criterion: null,
        error: `Filter values must be ${MAX_EVENT_FILTER_VALUE_LENGTH} characters or fewer.`,
      };
    }
    return { criterion: { kind, value: normalized }, error: null };
  }

  const parseBound = (raw: string): number | null | 'invalid' => {
    const normalized = raw.trim();
    if (!normalized) return null;
    if (!/^\d+$/.test(normalized)) return 'invalid';
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : 'invalid';
  };

  const lower = parseBound(from);
  const upper = parseBound(to);
  if (lower === 'invalid' || upper === 'invalid') {
    return { criterion: null, error: 'Ledger bounds must be non-negative safe integers.' };
  }
  if (lower === null && upper === null) {
    return { criterion: null, error: 'Enter at least one ledger bound.' };
  }
  if (lower !== null && upper !== null && lower > upper) {
    return { criterion: null, error: 'The lower ledger bound must not exceed the upper bound.' };
  }

  return {
    criterion: {
      kind: 'ledger_range',
      ...(lower !== null ? { from: lower } : {}),
      ...(upper !== null ? { to: upper } : {}),
    },
    error: null,
  };
}

export function describeCriterion(criterion: EventFilterCriterion): string {
  switch (criterion.kind) {
    case 'topic_contains':
      return `topic contains ${criterion.value}`;
    case 'value_type_is':
      return `value type is ${criterion.value}`;
    case 'value_equals':
      return `value equals ${criterion.value}`;
    case 'ledger_range':
      return `ledger ${criterion.from ?? '*'}..${criterion.to ?? '*'}`;
  }
}

function searchableStrings(decoded: DecodedScVal, out: string[] = []): string[] {
  const { value } = decoded;

  if (value === null || value === undefined) {
    // Nothing searchable, but the type still matters to value_type_is.
  } else if (typeof value === 'string') {
    out.push(value);
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
  } else if (Array.isArray(value)) {
    for (const item of value) {
      // A vec holds DecodedScVal (which always carries `raw`); an exotic-key
      // map holds { key, value } pairs, which do not.
      const entry = item as DecodedScVal | { key: DecodedScVal; value: DecodedScVal };
      if (typeof (entry as DecodedScVal).raw === 'string') {
        searchableStrings(entry as DecodedScVal, out);
      } else {
        const pair = entry as { key: DecodedScVal; value: DecodedScVal };
        searchableStrings(pair.key, out);
        searchableStrings(pair.value, out);
      }
    }
  } else if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out.push(key);
      if (typeof nested === 'string' || typeof nested === 'number' || typeof nested === 'boolean') {
        out.push(String(nested));
      } else if (nested && typeof nested === 'object') {
        out.push(...searchableStrings({ type: '', value: nested, raw: '' }));
      }
    }
  }

  return out;
}

export function matchesCriterion(
  event: DecodedContractEvent,
  criterion: EventFilterCriterion,
): boolean {
  switch (criterion.kind) {
    case 'topic_contains': {
      const target = criterion.value.toLowerCase();
      return event.topic.some((topic) =>
        searchableStrings(topic).some((s) => s.toLowerCase().includes(target)),
      );
    }
    case 'value_type_is': {
      const target = criterion.value.toLowerCase();
      const actual = event.value.type.toLowerCase();
      return actual === target || actual === `scv${target}`;
    }
    case 'value_equals': {
      const target = criterion.value.toLowerCase();
      return searchableStrings(event.value).some((s) => s.toLowerCase() === target);
    }
    case 'ledger_range': {
      if (criterion.from !== undefined && event.ledger < criterion.from) return false;
      if (criterion.to !== undefined && event.ledger > criterion.to) return false;
      return true;
    }
  }
}

export function applyEventFilters(
  events: DecodedContractEvent[],
  criteria: EventFilterCriterion[],
): DecodedContractEvent[] {
  if (criteria.length === 0) {
    return events.map((event) => ({ ...event, matchedCriteria: [] }));
  }

  const result: DecodedContractEvent[] = [];
  for (const event of events) {
    const matched: string[] = [];
    let survives = true;

    for (const criterion of criteria) {
      if (matchesCriterion(event, criterion)) {
        matched.push(describeCriterion(criterion));
      } else {
        survives = false;
        break;
      }
    }

    if (survives) result.push({ ...event, matchedCriteria: matched });
  }

  return result;
}

/** Renders a decoded value as compact one-line text for a chip or summary row. */
export function formatDecodedValue(decoded: DecodedScVal): string {
  const { value } = decoded;

  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    const items = value.map((item) => {
      const entry = item as DecodedScVal | { key: DecodedScVal; value: DecodedScVal };
      if (typeof (entry as DecodedScVal).raw === 'string') {
        return formatDecodedValue(entry as DecodedScVal);
      }
      const pair = entry as { key: DecodedScVal; value: DecodedScVal };
      return `${formatDecodedValue(pair.key)}: ${formatDecodedValue(pair.value)}`;
    });
    return `[${items.join(', ')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).map(
    ([key, nested]) =>
      `${key}: ${
        nested && typeof nested === 'object'
          ? formatDecodedValue({ type: '', value: nested, raw: '' })
          : String(nested)
      }`,
  );
  return `{ ${entries.join(', ')} }`;
}

/** Strips the `scv` prefix for display: `scvI128` → `i128`. */
export function shortTypeName(type: string): string {
  return type.startsWith('scv') ? type.slice(3).toLowerCase() : type;
}
