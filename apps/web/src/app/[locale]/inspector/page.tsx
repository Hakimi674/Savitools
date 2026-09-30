import { InspectorTool } from '@/components/tools/inspector-tool';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ErrorBoundary } from '@/components/tools/error-boundary';
import { Suspense } from 'react';

export default function InspectorPage() {
  return (
    <ToolPageShell
        title="Transaction Inspector"
        description="Decode and visualize Stellar transactions, operations, and XDR."
        docsHref="/docs/inspector"
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <ErrorBoundary toolName="Inspector">
            <InspectorTool />
          </ErrorBoundary>
        </Suspense>
      </ToolPageShell>
  );
}
