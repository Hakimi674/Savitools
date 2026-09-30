'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, RotateCcw, Terminal } from 'lucide-react';

import { ErrorState, LoadingState } from '@/components/tools/state-display';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import {
  executeSorobanRpc,
  listSorobanRpcMethods,
  type SorobanRpcExecuteResult,
  type SorobanRpcMethodSpec,
  type SorobanRpcNetwork,
  type SorobanRpcParamSpec,
} from '@/lib/api';

type FieldValues = Record<string, string>;

/** Raw input text → the JSON value the API expects for one parameter. */
function coerceParam(
  param: SorobanRpcParamSpec,
  raw: string,
): { ok: true; value?: unknown } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) {
    return param.required
      ? { ok: false, error: `"${param.name}" is required` }
      : { ok: true };
  }

  switch (param.type) {
    case 'string': {
      if (param.enum && !param.enum.includes(text)) {
        return { ok: false, error: `"${param.name}" must be one of: ${param.enum.join(', ')}` };
      }
      if (param.pattern && !new RegExp(param.pattern).test(text)) {
        return { ok: false, error: `"${param.name}" must be ${param.patternHint ?? 'valid'}` };
      }
      return { ok: true, value: text };
    }
    case 'number':
    case 'integer': {
      const value = Number(text);
      if (!Number.isFinite(value)) {
        return { ok: false, error: `"${param.name}" must be a number` };
      }
      if (param.type === 'integer' && !Number.isInteger(value)) {
        return { ok: false, error: `"${param.name}" must be an integer` };
      }
      if (param.min !== undefined && value < param.min) {
        return { ok: false, error: `"${param.name}" must be >= ${param.min}` };
      }
      if (param.max !== undefined && value > param.max) {
        return { ok: false, error: `"${param.name}" must be <= ${param.max}` };
      }
      return { ok: true, value };
    }
    case 'boolean':
      return { ok: true, value: text === 'true' };
    case 'array': {
      let entries: string[];
      if (text.startsWith('[')) {
        try {
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) throw new Error('not an array');
          entries = parsed.map((item) => String(item));
        } catch {
          return { ok: false, error: `"${param.name}" must be a JSON array or one entry per line` };
        }
      } else {
        entries = text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
      }
      if (param.maxItems !== undefined && entries.length > param.maxItems) {
        return { ok: false, error: `"${param.name}" accepts at most ${param.maxItems} entries` };
      }
      if (param.itemType === 'integer') {
        const numbers = entries.map((entry) => Number(entry));
        if (numbers.some((entry) => !Number.isInteger(entry))) {
          return { ok: false, error: `"${param.name}" entries must be integers` };
        }
        return { ok: true, value: numbers };
      }
      return { ok: true, value: entries };
    }
    case 'object': {
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch {
        return { ok: false, error: `"${param.name}" must be valid JSON` };
      }
    }
    default:
      return { ok: false, error: `"${param.name}" has an unsupported schema` };
  }
}

function inputHint(param: SorobanRpcParamSpec): string {
  const bits = [param.description];
  if (param.enum) bits.push(`One of: ${param.enum.join(', ')}`);
  else if (param.patternHint) bits.push(`Must match ${param.patternHint}`);
  if (param.type === 'array') {
    bits.push(param.itemType === 'integer' ? 'One integer per line' : 'One entry per line');
  }
  if (param.type === 'object') bits.push('JSON object');
  return bits.join(' · ');
}

function ParamField({
  param,
  value,
  error,
  onChange,
}: {
  param: SorobanRpcParamSpec;
  value: string;
  error?: string;
  onChange: (next: string) => void;
}) {
  const id = `rpc-param-${param.name}`;
  const describedBy = `${id}-hint`;

  if (param.enum) {
    return (
      <label className="block space-y-1.5" htmlFor={id}>
        <span className="text-xs font-medium text-foreground">
          {param.name}
          {param.required && <span className="text-destructive"> *</span>}
        </span>
        <select
          id={id}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select a value…</option>
          {param.enum.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <p id={describedBy} className="text-[11px] text-muted-foreground">
          {inputHint(param)}
        </p>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </label>
    );
  }

  if (param.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-xs font-medium text-foreground" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={value === 'true'}
          onChange={(event) => onChange(event.target.checked ? 'true' : 'false')}
          className="h-4 w-4 rounded border-border"
        />
        {param.name}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
    );
  }

  const multiline = param.type === 'array' || param.type === 'object';

  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="text-xs font-medium text-foreground">
        {param.name}
        {param.required && <span className="text-destructive"> *</span>}
      </span>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
          placeholder={param.type === 'object' ? '{ }' : ''}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          type={param.type === 'integer' || param.type === 'number' ? 'number' : 'text'}
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <p id={describedBy} className="text-[11px] text-muted-foreground">
        {inputHint(param)}
      </p>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </label>
  );
}

/**
 * Soroban RPC method console (Savitura/Savitools#358).
 *
 * Renders schema-aware inputs straight from the API's method catalog, so a
 * new read-only method shows up here without touching the frontend.
 */
export default function SorobanRpcTool() {
  const [methods, setMethods] = useState<SorobanRpcMethodSpec[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const [network, setNetwork] = useState<SorobanRpcNetwork>('testnet');
  const [methodName, setMethodName] = useState('');
  const [values, setValues] = useState<FieldValues>({});
  const [fieldErrors, setFieldErrors] = useState<FieldValues>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SorobanRpcExecuteResult | null>(null);
  const [runError, setRunError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadError('');

    listSorobanRpcMethods()
      .then((payload) => {
        if (cancelled) return;
        setMethods(payload.methods);
        setMethodName((current) => current || payload.methods[0]?.name || '');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMethods([]);
        setLoadError(error instanceof Error ? error.message : 'Could not load methods');
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const selected = useMemo(
    () => methods?.find((method) => method.name === methodName) ?? null,
    [methods, methodName],
  );

  const selectMethod = useCallback((name: string) => {
    setMethodName(name);
    setValues({});
    setFieldErrors({});
    setResult(null);
    setRunError('');
  }, []);

  const loadExample = useCallback(() => {
    if (!selected) return;
    const next: FieldValues = {};
    for (const param of selected.params) {
      if (param.example === undefined) continue;
      next[param.name] =
        typeof param.example === 'string' ? param.example : JSON.stringify(param.example);
    }
    setValues(next);
    setFieldErrors({});
  }, [selected]);

  const run = useCallback(async () => {
    if (!selected) return;

    const params: Record<string, unknown> = {};
    const errors: FieldValues = {};
    for (const param of selected.params) {
      const raw = values[param.name] ?? (param.type === 'boolean' ? 'false' : '');
      const coerced = coerceParam(param, raw);
      if (!coerced.ok) {
        if (param.required || raw.trim()) errors[param.name] = coerced.error;
        continue;
      }
      if (coerced.ok && coerced.value !== undefined) params[param.name] = coerced.value;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setRunning(true);
    setRunError('');
    setResult(null);
    try {
      const response = await executeSorobanRpc({
        method: selected.name,
        params,
        network,
      });
      setResult(response);
    } catch (error: unknown) {
      setRunError(error instanceof Error ? error.message : 'Request failed');
    } finally {
      setRunning(false);
    }
  }, [network, selected, values]);

  const reset = useCallback(() => {
    setValues({});
    setFieldErrors({});
    setResult(null);
    setRunError('');
  }, []);

  return (
    <ToolPageShell
      title="Soroban RPC Console"
      description="Call read-only Soroban RPC methods with schema-aware inputs — the API validates every parameter before it forwards the request."
      docsHref="/docs/rpc"
    >
      <div className="space-y-6">
        {loadError && (
          <ErrorState
            title="Could not load the method catalog"
            message={loadError}
            onRetry={() => setReloadToken((token) => token + 1)}
          />
        )}

        {methods === null && !loadError && (
          <LoadingState label="Loading Soroban RPC methods…" />
        )}

        {methods !== null && methods.length === 0 && !loadError && (
          <ErrorState
            title="No methods available"
            message="The API returned an empty Soroban RPC catalog."
            onRetry={() => setReloadToken((token) => token + 1)}
          />
        )}

        {methods && methods.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
                Network
                <select
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={network}
                  onChange={(event) => setNetwork(event.target.value as SorobanRpcNetwork)}
                >
                  <option value="testnet">Testnet</option>
                  <option value="mainnet">Mainnet</option>
                </select>
              </label>

              <label className="flex flex-1 min-w-[16rem] flex-col gap-1.5 text-xs font-medium text-foreground">
                Method
                <select
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                  value={methodName}
                  onChange={(event) => selectMethod(event.target.value)}
                >
                  {methods.map((method) => (
                    <option key={method.name} value={method.name}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selected && (
              <div className="rounded-md border border-border/60 bg-muted/30 p-4 space-y-1">
                <p className="text-sm font-medium text-foreground">{selected.summary}</p>
                <p className="text-xs text-muted-foreground">{selected.description}</p>
                {selected.params.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No parameters.</p>
                )}
              </div>
            )}
          </div>
        )}

        {selected && (
          <div className="rounded-lg border border-border bg-card p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Parameters</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={loadExample}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
                  Load example
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear
                </button>
              </div>
            </div>

            {selected.params.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                This method takes no parameters — press Run to call it.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {selected.params.map((param) => (
                  <ParamField
                    key={param.name}
                    param={param}
                    value={values[param.name] ?? (param.type === 'boolean' ? 'false' : '')}
                    error={fieldErrors[param.name]}
                    onChange={(next) =>
                      setValues((current) => ({ ...current, [param.name]: next }))
                    }
                  />
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={run}
                disabled={running}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                {running ? 'Running…' : 'Run'}
              </button>
              <p className="text-[11px] text-muted-foreground">
                Write methods such as <span className="font-mono">sendTransaction</span> are not
                exposed here.
              </p>
            </div>
          </div>
        )}

        {runError && (
          <ErrorState title="Request failed" message={runError} />
        )}

        {result && (
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {result.error ? 'JSON-RPC error' : 'Result'}
              </h2>
              <p className="text-[11px] text-muted-foreground font-mono">
                {result.method} · {result.network} · {result.tookMs}ms
              </p>
            </div>
            <pre
              data-testid="rpc-output"
              className={`overflow-x-auto rounded-md border p-4 text-xs font-mono whitespace-pre-wrap ${
                result.error
                  ? 'border-destructive/40 bg-destructive/5 text-destructive'
                  : 'border-border bg-muted/30 text-foreground'
              }`}
            >
              {JSON.stringify(result.error ?? result.result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </ToolPageShell>
  );
}
