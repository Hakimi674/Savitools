export type AbiChangeClassification = 'breaking' | 'additive';

export interface AbiChange {
  classification: AbiChangeClassification;
  kind: 'method' | 'event';
  name: string;
  detail: string;
}

interface AbiEntry {
  name: string;
  signature: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getArgs(entry: Record<string, unknown>): string[] {
  const args = entry.arguments ?? entry.args ?? entry.params;
  if (!Array.isArray(args)) return [];
  return args.map((arg) => {
    if (!isRecord(arg)) return 'unknown';
    const type = arg.type ?? arg.argType ?? arg.kind;
    return typeof type === 'string' ? type.trim() : 'unknown';
  });
}

function getEntries(
  schema: unknown,
  kind: 'method' | 'event',
): Map<string, AbiEntry> {
  if (!isRecord(schema)) throw new Error('Each ABI must be a JSON object.');
  const rawEntries = kind === 'method'
    ? schema.methods ?? schema.functions ?? []
    : schema.events ?? [];
  if (!Array.isArray(rawEntries)) {
    throw new Error(`ABI ${kind}s must be an array.`);
  }

  const entries = new Map<string, AbiEntry>();
  for (const rawEntry of rawEntries) {
    if (!isRecord(rawEntry) || typeof (rawEntry.name ?? rawEntry.type) !== 'string') {
      throw new Error(`Every ABI ${kind} must have a name.`);
    }
    const name = String(rawEntry.name ?? rawEntry.type);
    const args = getArgs(rawEntry).join(',');
    const returnType = kind === 'method'
      ? String(rawEntry.returnType ?? rawEntry.return ?? rawEntry.returns ?? 'Void')
      : '';
    const topics = kind === 'event' && Array.isArray(rawEntry.topics)
      ? rawEntry.topics.map((topic) => {
          if (!isRecord(topic)) return 'unknown';
          return `${String(topic.name ?? 'unknown')}:${topic.indexed === true}`;
        }).join(',')
      : '';
    entries.set(name, {
      name,
      signature: `${args}->${returnType}|${topics}`,
    });
  }
  return entries;
}

export function compareAbis(before: unknown, after: unknown): AbiChange[] {
  const changes: AbiChange[] = [];
  for (const kind of ['method', 'event'] as const) {
    const previous = getEntries(before, kind);
    const next = getEntries(after, kind);
    for (const [name, entry] of previous) {
      const replacement = next.get(name);
      if (!replacement) {
        changes.push({
          classification: 'breaking',
          kind,
          name,
          detail: `Removed ${kind} ${name}.`,
        });
      } else if (replacement.signature !== entry.signature) {
        changes.push({
          classification: 'breaking',
          kind,
          name,
          detail: `Changed ${kind} signature for ${name}.`,
        });
      }
    }
    for (const name of next.keys()) {
      if (!previous.has(name)) {
        changes.push({
          classification: 'additive',
          kind,
          name,
          detail: `Added ${kind} ${name}.`,
        });
      }
    }
  }
  return changes;
}