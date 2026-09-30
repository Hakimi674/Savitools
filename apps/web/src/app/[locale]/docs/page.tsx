import { toolDocs } from '@/lib/tool-docs';
import { BookOpen, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'SaviTools Documentation',
  description:
    'Per-tool usage guides for all fifteen SaviTools: setup, step-by-step usage, and troubleshooting.',
};

export default function DocsIndexPage() {
  return (
    <>
      <main className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-semibold">SaviTools Documentation</h1>
          </div>
          <p className="text-muted-foreground text-sm mb-10 max-w-2xl">
            How-to guides for every SaviTools tool (all fifteen tools): what each one does, what you need
            to get started, step-by-step usage, and common troubleshooting tips.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {toolDocs.map((tool) => (
              <Link
                key={tool.slug}
                href={`/docs/${tool.slug}`}
                className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-muted/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold group-hover:text-primary transition-colors">
                      {tool.name}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      {tool.tagline}
                    </p>
                  </div>
                  <ArrowRight
                    className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-3 font-mono">
                  {tool.href}
                </p>
              </Link>
            ))}
          </div>

          <div className="mt-10 rounded-xl border border-border bg-muted/20 p-5">
            <h2 className="text-sm font-semibold mb-2">Need the API reference instead?</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              These guides cover using the tools in the web app. For endpoint-by-endpoint
              API documentation (request/response examples, parameters, error codes), see the{' '}
              <Link href="/api/docs" className="text-primary hover:underline">
                Swagger UI
              </Link>{' '}
              or the{' '}
              <a
                href="https://github.com/Savitura/Savitools/blob/main/docs/api-reference.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                API Reference
              </a>
              .
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
