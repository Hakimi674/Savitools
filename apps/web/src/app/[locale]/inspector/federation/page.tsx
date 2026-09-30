import { FederationTool } from '@/components/tools/federation-tool';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ErrorBoundary } from '@/components/tools/error-boundary';
import { Suspense } from 'react';

export default function FederationPage() {
  return (
    <ToolPageShell
        title="Federation & TOML Inspector"
        description="Resolve Stellar federation addresses, inspect anchor stellar.toml files, and check SEP compliance."
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <ErrorBoundary toolName="Federation">
            <FederationTool />
          </ErrorBoundary>
        </Suspense>
      </ToolPageShell>
  );
}
