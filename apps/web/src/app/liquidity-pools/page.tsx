import { LiquidityPoolsTool } from '@/components/tools/liquidity-pools-tool';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ErrorBoundary } from '@/components/tools/error-boundary';
import { Suspense } from 'react';

export default function LiquidityPoolsPage() {
  return (
    <ToolPageShell
      title="Liquidity Pool Explorer"
      description="Search Stellar liquidity pools, calculate LP share values, and track your favorite pools."
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <ErrorBoundary toolName="Liquidity Pool Explorer">
          <LiquidityPoolsTool />
        </ErrorBoundary>
      </Suspense>
    </ToolPageShell>
  );
}
