import { ComposerTool } from '@/components/tools/composer';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ErrorBoundary } from '@/components/tools/error-boundary';
import { Suspense } from 'react';

export default function ComposerPage() {
  return (
    <>
      <ToolPageShell
        title="Transaction Composer"
        description="Visual builder for multi-operation Stellar transactions."
        docsHref="/docs/composer"
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <ErrorBoundary toolName="Composer">
            <ComposerTool />
          </ErrorBoundary>
        </Suspense>
      </ToolPageShell>
    </>
  );
}
