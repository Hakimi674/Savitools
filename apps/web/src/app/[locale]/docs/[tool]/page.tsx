import { toolDocs } from '@/lib/tool-docs';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen,
  CheckCircle2,
  Wrench,
  ListOrdered,
  ArrowLeft,
  TriangleAlert,
} from 'lucide-react';

export function generateStaticParams() {
  return toolDocs.map((tool) => ({ tool: tool.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool: slug } = await params;
  const doc = toolDocs.find((entry) => entry.slug === slug);
  if (!doc) return { title: 'Not Found — SaviTools Docs' };
  return {
    title: `${doc.name} — SaviTools Documentation`,
    description: doc.tagline,
  };
}

function SectionHeading({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold mt-8 mb-3">
      {icon}
      {children}
    </h2>
  );
}

export default async function ToolDocPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool: slug } = await params;
  const doc = toolDocs.find((entry) => entry.slug === slug);
  if (!doc) notFound();

  return (
    <>
      <main className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <Link
            href="/docs"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All documentation
          </Link>

          <header className="mb-8">
            <h1 className="text-2xl font-semibold mb-2">{doc.name}</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">{doc.tagline}</p>
            <Link
              href={doc.href}
              className="inline-flex items-center gap-1.5 mt-4 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Open {doc.name}
              <BookOpen className="h-3 w-3" aria-hidden="true" />
            </Link>
          </header>

          <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
            {doc.overview.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>

          <SectionHeading icon={<CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />}>
            Prerequisites
          </SectionHeading>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground">
            {doc.prerequisites.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <SectionHeading icon={<Wrench className="h-4 w-4 text-primary" aria-hidden="true" />}>
            Setup
          </SectionHeading>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground">
            {doc.setup.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <SectionHeading icon={<ListOrdered className="h-4 w-4 text-primary" aria-hidden="true" />}>
            Usage
          </SectionHeading>
          <div className="space-y-6">
            {doc.usage.map((section) => (
              <div key={section.title}>
                <h3 className="text-sm font-medium mb-2">{section.title}</h3>
                <ol className="list-decimal pl-5 space-y-1.5 text-sm text-muted-foreground">
                  {section.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <SectionHeading
            icon={<TriangleAlert className="h-4 w-4 text-amber-500" aria-hidden="true" />}
          >
            Troubleshooting
          </SectionHeading>
          <div className="space-y-3">
            {doc.troubleshooting.map((entry, i) => (
              <div key={i} className="rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-sm font-medium mb-1">{entry.issue}</p>
                <p className="text-xs text-muted-foreground mb-2">
                  <span className="font-medium text-foreground/70">Cause:</span> {entry.cause}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/70">Fix:</span> {entry.fix}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-10 text-xs text-muted-foreground/70">
            Still stuck?{' '}
            <a
              href="https://github.com/Savitura/Savitools/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Open an issue on GitHub
            </a>
            .
          </p>
        </div>
      </main>
    </>
  );
}
