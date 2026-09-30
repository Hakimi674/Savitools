import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ContractsTool } from '@/components/tools/contracts-tool';
import Link from 'next/link';
import { Suspense } from 'react';

export default function ContractsPage() {
  return (
    <>
      <ToolPageShell
        title="Contract Deployer"
        description="Upload a compiled Soroban WASM and deploy it to testnet."
        docsHref="/docs/contracts"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Looking for what a deployed contract emits?{' '}
          <Link href="/contracts/events" className="text-primary hover:underline">
            Inspect its events
          </Link>{' '}
          — decoded from raw ScVal XDR, filterable, and replayable at your own webhook.
        </p>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <ContractsTool />
        </Suspense>
      </ToolPageShell>
    </>
  );
}
