import { GraphTool } from '@/components/tools/graph-tool';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ErrorBoundary } from '@/components/tools/error-boundary';
import { Suspense } from 'react';

export default function GraphPage() {
  return (
    <ToolPageShell
        title="Account Relationship Graph"
        description="Visualize signer networks, offers, and payment relationships between Stellar accounts with an interactive force-directed graph."
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <ErrorBoundary toolName="Graph">
            <GraphTool />
          </ErrorBoundary>
        </Suspense>
      </ToolPageShell>
  );
}