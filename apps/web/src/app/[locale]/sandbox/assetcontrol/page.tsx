'use client';

import { Suspense } from 'react';
import { AssetControlTool } from '@/components/tools/asset-control-tool';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ErrorBoundary } from '@/components/tools/error-boundary';

/**
 * Asset Control workstation (Savitura/Savitools#81): inspect an asset issuer's
 * authorization flags, audit every trustline holder and assemble the
 * SetTrustlineFlags / Clawback / SetOptions transactions for the issuer to sign.
 */
export default function AssetControlPage() {
  return (
    <>
      <ToolPageShell
        title="Asset Control"
        description="Inspect issuer authorization flags, audit trustlines, and assemble SetTrustlineFlags, Clawback and SetOptions transactions."
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <ErrorBoundary toolName="Asset Control">
            <AssetControlTool />
          </ErrorBoundary>
        </Suspense>
      </ToolPageShell>
    </>
  );
}
