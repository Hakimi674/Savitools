import { EcosystemStrip } from '@/components/onboarding/ecosystem-strip';
import { QuickstartChecklist } from '@/components/onboarding/quickstart-checklist';
import { tools } from '@/lib/tools';
import { EXAMPLE_TX_HASH } from '@/lib/examples';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-background">

      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 mb-16">
          <div className="lg:col-span-3">
            <h1 className="text-3xl font-semibold tracking-tight mb-4">
              Build on Stellar without the boilerplate
            </h1>
            <p className="text-muted-foreground max-w-xl leading-relaxed mb-2">
              SaviTools is a developer workstation for inspecting transactions, testing wallets,
              simulating payments, and debugging webhooks on the Stellar network.
            </p>
            <p className="text-sm text-muted-foreground mb-8">
              Built for developers integrating payments — whether you&apos;re new to Stellar or
              shipping your next Fluxa or CrowdPay integration.
            </p>
            <Link
              href={`/inspector?hash=${EXAMPLE_TX_HASH}&example=1`}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Get started in 5 minutes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="lg:col-span-2">
            <QuickstartChecklist />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-4">Tools</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tools.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="group border border-border rounded-lg p-5 hover:border-foreground/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-sm font-medium">{tool.label}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                      tool.status === 'MVP'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {tool.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{tool.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <EcosystemStrip />
    </main>
  );
}
