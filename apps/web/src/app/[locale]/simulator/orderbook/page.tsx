import { OrderbookTool } from '@/components/tools/orderbook-tool';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ErrorBoundary } from '@/components/tools/error-boundary';
import { Suspense } from 'react';

export default function OrderbookPage() {
  return (
    <ToolPageShell
        title="DEX Order Book"
        description="Live order book, spread analytics, and liquidity depth for any Stellar DEX asset pair."
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <ErrorBoundary toolName="Order Book">
            <OrderbookTool />
          </ErrorBoundary>
        </Suspense>
      </ToolPageShell>
  );
}
