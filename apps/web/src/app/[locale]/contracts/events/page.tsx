import { ContractEventsTool } from '@/components/tools/contract-events-tool';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ErrorBoundary } from '@/components/tools/error-boundary';
import { Suspense } from 'react';

export default function ContractEventsPage() {
  return (
    <>
      <ToolPageShell
        title="Contract Event Inspector"
        description="Query any Soroban contract's events, decoded from raw ScVal XDR into typed values — then filter them and replay them at your own webhook."
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <ErrorBoundary toolName="Contract Events">
            <ContractEventsTool />
          </ErrorBoundary>
        </Suspense>
      </ToolPageShell>
    </>
  );
}
