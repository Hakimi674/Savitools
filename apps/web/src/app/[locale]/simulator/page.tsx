import { SimulatorTool } from '@/components/tools/simulator-tool';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ErrorBoundary } from '@/components/tools/error-boundary';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

export default function SimulatorPage() {
  return (
    <ToolPageShell
        title="Payment Simulator"
        description="Simulate path payments, preview routing, and estimate fees."
        docsHref="/docs/simulator"
      >
        <div className="mb-6">
          <Link
            href="/simulator/orderbook"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            View live DEX order book & depth chart
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <ErrorBoundary toolName="Simulator">
            <SimulatorTool />
          </ErrorBoundary>
        </Suspense>
      </ToolPageShell>
  );
}
