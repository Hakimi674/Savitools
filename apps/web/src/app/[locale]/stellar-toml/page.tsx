'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { FileText, Check, AlertCircle, Info, Download, Upload } from 'lucide-react';

interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  field?: string;
  message: string;
  line?: number;
}

interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
}

export default function StellarTomlPage() {
  const [content, setContent] = useState('');
  const [formattedContent, setFormattedContent] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Editor settings
  const [validationLevel, setValidationLevel] = useState<'basic' | 'strict'>('basic');
  const [network, setNetwork] = useState<'testnet' | 'mainnet'>('testnet');
  const [indentStyle, setIndentStyle] = useState<'spaces' | 'tabs'>('spaces');
  const [indentSize, setIndentSize] = useState<number>(2);

  const handleValidate = async () => {
    setLoading(true);
    setError(null);
    setValidationResult(null);

    try {
      const response = await fetch('/api/stellar-toml/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          level: validationLevel,
          network
        })
      });

      if (!response.ok) {
        throw new Error('Validation failed');
      }

      const result = await response.json();
      setValidationResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFormat = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/stellar-toml/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          indent: indentStyle,
          indentSize
        })
      });

      if (!response.ok) {
        throw new Error('Formatting failed');
      }

      const result = await response.json();
      setFormattedContent(result.formatted);
      setContent(result.formatted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Formatting failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadTemplate = async (type: 'minimal' | 'anchor' | 'issuer' | 'validator') => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/stellar-toml/template?type=${type}`);

      if (!response.ok) {
        throw new Error('Failed to load template');
      }

      const result = await response.json();
      setContent(result.template);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load template');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stellar.toml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setContent(text);
      };
      reader.readAsText(file);
    }
  };

  const getIssueBadgeVariant = (level: string) => {
    switch (level) {
      case 'error': return 'destructive';
      case 'warning': return 'default';
      case 'info': return 'secondary';
      default: return 'default';
    }
  };

  const getIssueIcon = (level: string) => {
    switch (level) {
      case 'error': return <AlertCircle className="h-4 w-4" />;
      case 'warning': return <AlertCircle className="h-4 w-4" />;
      case 'info': return <Info className="h-4 w-4" />;
      default: return null;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="h-8 w-8" />
            Stellar.toml Editor
          </h1>
          <p className="text-muted-foreground mt-2">
            Create, edit, validate, and lint stellar.toml files according to SEP-1 standards
          </p>
        </div>
      </div>

      <Tabs defaultValue="editor" className="space-y-4">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Editor</CardTitle>
              <CardDescription>
                Edit your stellar.toml content with real-time syntax validation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button onClick={handleFormat} disabled={loading || !content}>
                  Format
                </Button>
                <Button onClick={handleValidate} disabled={loading || !content} variant="outline">
                  Validate
                </Button>
                <Button onClick={handleDownload} disabled={!content} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Label htmlFor="upload-file" className="cursor-pointer">
                  <Button variant="outline" asChild>
                    <span>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </span>
                  </Button>
                  <input
                    id="upload-file"
                    type="file"
                    accept=".toml"
                    className="hidden"
                    onChange={handleUpload}
                  />
                </Label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Indent Style</Label>
                  <Select value={indentStyle} onValueChange={(v) => setIndentStyle(v as 'spaces' | 'tabs')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="spaces">Spaces</SelectItem>
                      <SelectItem value="tabs">Tabs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Indent Size</Label>
                  <Select value={String(indentSize)} onValueChange={(v) => setIndentSize(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Network</Label>
                  <Select value={network} onValueChange={(v) => setNetwork(v as 'testnet' | 'mainnet')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="testnet">Testnet</SelectItem>
                      <SelectItem value="mainnet">Mainnet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste or type your stellar.toml content here..."
                  className="font-mono text-sm min-h-[400px]"
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Validation Settings</CardTitle>
              <CardDescription>
                Configure validation rules and run compliance checks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Validation Level</Label>
                  <Select value={validationLevel} onValueChange={(v) => setValidationLevel(v as 'basic' | 'strict')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="strict">Strict (SEP-1)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Target Network</Label>
                  <Select value={network} onValueChange={(v) => setNetwork(v as 'testnet' | 'mainnet')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="testnet">Testnet</SelectItem>
                      <SelectItem value="mainnet">Mainnet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleValidate} disabled={loading || !content} className="w-full">
                Run Validation
              </Button>

              {validationResult && (
                <div className="space-y-4 mt-6">
                  <div className="flex items-center gap-2">
                    {validationResult.isValid ? (
                      <Badge variant="default" className="bg-green-500">
                        <Check className="h-3 w-3 mr-1" />
                        Valid
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Invalid
                      </Badge>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {validationResult.summary.errors} errors, {validationResult.summary.warnings} warnings, {validationResult.summary.infos} infos
                    </span>
                  </div>

                  {validationResult.issues.length > 0 && (
                    <div className="space-y-2">
                      <Label>Issues</Label>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {validationResult.issues.map((issue, index) => (
                          <Alert key={index} variant={issue.level === 'error' ? 'destructive' : 'default'}>
                            <div className="flex items-start gap-2">
                              {getIssueIcon(issue.level)}
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant={getIssueBadgeVariant(issue.level)} className="text-xs">
                                    {issue.level}
                                  </Badge>
                                  {issue.field && (
                                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                      {issue.field}
                                    </code>
                                  )}
                                </div>
                                <AlertDescription>{issue.message}</AlertDescription>
                              </div>
                            </div>
                          </Alert>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Templates</CardTitle>
              <CardDescription>
                Start with a pre-configured template for your use case
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="cursor-pointer hover:border-primary" onClick={() => handleLoadTemplate('minimal')}>
                  <CardHeader>
                    <CardTitle className="text-lg">Minimal</CardTitle>
                    <CardDescription>
                      Basic stellar.toml with essential fields
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="cursor-pointer hover:border-primary" onClick={() => handleLoadTemplate('anchor')}>
                  <CardHeader>
                    <CardTitle className="text-lg">Anchor Service</CardTitle>
                    <CardDescription>
                      Complete setup for SEP-24/31 anchor services
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="cursor-pointer hover:border-primary" onClick={() => handleLoadTemplate('issuer')}>
                  <CardHeader>
                    <CardTitle className="text-lg">Asset Issuer</CardTitle>
                    <CardDescription>
                      Configuration for token issuers
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="cursor-pointer hover:border-primary" onClick={() => handleLoadTemplate('validator')}>
                  <CardHeader>
                    <CardTitle className="text-lg">Validator</CardTitle>
                    <CardDescription>
                      Setup for Stellar network validators
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
