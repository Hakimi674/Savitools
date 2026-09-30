'use client';

import { Suspense } from 'react';
import { SandboxTool } from '@/components/tools/sandbox-tool';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ErrorBoundary } from '@/components/tools/error-boundary';

export default function SandboxPage() {
  return (
    <>
      <ToolPageShell
        title="Wallet Sandbox"
        description="Generate keypairs, fund testnet accounts, and create trustlines."
        docsHref="/docs/sandbox"
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <ErrorBoundary toolName="Sandbox">
            <SandboxTool />
          </ErrorBoundary>
        </Suspense>
      </ToolPageShell>
    </>
  );
}
