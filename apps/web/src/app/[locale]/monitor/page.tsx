import { MonitorDashboard } from '@/components/monitor/monitor-dashboard';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ErrorBoundary } from '@/components/tools/error-boundary';

export default function MonitorPage() {
  return (
    <>
      <ToolPageShell
        title="Ledger Monitor"
        description="Watch Stellar addresses and contracts for live activity."
        docsHref="/docs/monitor"
      >
        <ErrorBoundary toolName="Monitor">
          <MonitorDashboard />
        </ErrorBoundary>
      </ToolPageShell>
    </>
  );
}
