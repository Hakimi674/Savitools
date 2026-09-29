import { cn } from '@/lib/utils';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { ShareToolLink } from './share-tool-link';

interface ToolPageShellProps {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
  /** Link to this tool's usage documentation page (see Savitura/Savitools#146). */
  docsHref?: string;
}

export function ToolPageShell({ title, description, children, className, docsHref }: ToolPageShellProps) {
  return (
    <main className={cn('min-h-screen bg-background', className)}>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-8">
          <div>
            <h1 className="text-xl font-semibold mb-2">{title}</h1>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            <ShareToolLink />
            {docsHref && (
              <Link
                href={docsHref}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Usage docs
              </Link>
            )}
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
