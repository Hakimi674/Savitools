'use client';

import * as React from 'react';
import { Suspense } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { ErrorBoundary } from '@/components/tools/error-boundary';
import { SdkCodeBlock } from '@/components/SdkCodeBlock';
import { apiFetch } from '@/lib/api';
import { useNetwork } from '@/lib/network-context';
import { BookOpen, Layers, AlertCircle } from 'lucide-react';
import Link from 'next/link';

const API_OPTIONS = ['Fluxa', 'CrowdPay'];
const LANGUAGE_OPTIONS = ['TypeScript', 'Python', 'Go', 'cURL'];

function SdkGeneratorTool() {
  const { network } = useNetwork();
  const [selectedApi, setSelectedApi] = React.useState('Fluxa');
  const [selectedLang, setSelectedLang] = React.useState('TypeScript');
  const [generatedCode, setGeneratedCode] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchCode = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await apiFetch<{ code?: string }>('/sdkgen/generate', {
          method: 'POST',
          body: JSON.stringify({
            spec: selectedApi.toLowerCase(),
            language: selectedLang.toLowerCase()
          })
        });
        setGeneratedCode(data.code || '');
      } catch (err) {
        console.error('Error fetching SDK code:', err);
        setError(err instanceof Error ? err.message : 'Failed to generate SDK code');
        setGeneratedCode('');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchCode();
  }, [selectedApi, selectedLang]);

  const getInstallCommand = () => {
    switch (selectedLang) {
      case 'TypeScript':
        return 'npm install axios';
      case 'Python':
        return 'pip install requests';
      case 'Go':
        return 'go mod init example \ngo get net/http';
      default:
        return '';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
      <div className="md:col-span-1 space-y-6">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold mb-3">
            API Definition
          </h2>
          <div className="space-y-2" role="radiogroup" aria-label="API Definition">
            {API_OPTIONS.map(api => (
              <button
                key={api}
                onClick={() => setSelectedApi(api)}
                role="radio"
                aria-checked={selectedApi === api}
                className={`w-full text-left px-4 py-2 rounded-md transition ${
                  selectedApi === api 
                    ? 'bg-primary text-primary-foreground font-medium' 
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
              >
                {api}
              </button>
            ))}
          </div>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-2">Instructions</h3>
          <p className="text-sm text-muted-foreground mb-4">
            1. Select the API spec.<br/>
            2. Choose your language.<br/>
            3. Copy the generated code.<br/>
            4. Replace `API_KEY` and variables with your own values.
          </p>
          
          {getInstallCommand() && (
            <>
              <h4 className="text-xs uppercase text-muted-foreground font-semibold mb-2 mt-4">
                Install Dependencies
              </h4>
              <pre className="bg-background p-3 rounded border border-border text-xs text-primary overflow-x-auto whitespace-pre-wrap">
                {getInstallCommand()}
              </pre>
            </>
          )}
        </div>
      </div>

      <div className="md:col-span-3">
        <Tabs.Root value={selectedLang} onValueChange={setSelectedLang}>
          <Tabs.List className="flex border-b border-border mb-4 overflow-x-auto">
            {LANGUAGE_OPTIONS.map(lang => (
              <Tabs.Trigger
                key={lang}
                value={lang}
                className={`px-6 py-3 text-sm font-medium transition border-b-2 whitespace-nowrap ${
                  selectedLang === lang 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
                }`}
              >
                {lang}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          
          {LANGUAGE_OPTIONS.map(lang => (
            <Tabs.Content 
              key={lang}
              value={lang} 
              className="outline-none focus:ring-2 focus:ring-primary rounded-lg"
            >
              {isLoading ? (
                <div className="h-64 flex items-center justify-center border border-border rounded-lg bg-muted">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 flex flex-col items-center justify-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
                    <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1">
                    Failed to generate SDK code
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    {error}
                  </p>
                  <button
                    onClick={() => {
                      setError(null);
                      setSelectedApi(selectedApi);
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <SdkCodeBlock code={generatedCode} language={lang} />
              )}
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </div>
    </div>
  );
}

export default function SdkGeneratorPage() {
  return (
    <>
      <ToolPageShell
        title="SDK Generator"
        description="Copy-paste ready client code for your favorite languages."
        docsHref="/docs/sdk"
      >
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <ErrorBoundary toolName="SDK Generator">
            <SdkGeneratorTool />
          </ErrorBoundary>
        </Suspense>
      </ToolPageShell>
    </>
  );
}
