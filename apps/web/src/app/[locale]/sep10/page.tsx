'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, AlertCircle, Shield, Clock, Globe, Key } from 'lucide-react';

interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

interface ChallengeDetails {
  xdr: string;
  hash: string;
  networkPassphrase: string;
  sourceAccount: string;
  sequenceNumber: string;
  fee: string;
  memo?: {
    type: string;
    value?: string;
  };
  timeBounds?: {
    minTime: string;
    maxTime: string;
  };
  operations: any[];
  signatures: any[];
}

interface HttpDiagnostics {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
  };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: any;
    timing: number;
  };
}

export default function Sep10DebuggerPage() {
  const t = useTranslations('sep10');
  
  // State for fetch challenge
  const [fetchForm, setFetchForm] = useState({
    domain: '',
    account: '',
    network: 'testnet' as 'testnet' | 'mainnet',
    homeDomain: '',
    clientDomain: '',
  });

  // State for validate challenge
  const [validateForm, setValidateForm] = useState({
    challengeXdr: '',
    serverAccountId: '',
    clientAccountId: '',
    network: 'testnet' as 'testnet' | 'mainnet',
    homeDomain: '',
    webAuthDomain: '',
  });

  // State for sign challenge
  const [signForm, setSignForm] = useState({
    challengeXdr: '',
    clientKeypair: '',
    clientDomainKeypair: '',
  });

  // State for token exchange
  const [tokenForm, setTokenForm] = useState({
    signedChallengeXdr: '',
    domain: '',
  });

  // Results state
  const [fetchResult, setFetchResult] = useState<{
    challenge?: ChallengeDetails;
    httpDiagnostics?: HttpDiagnostics;
    validationChecks?: ValidationCheck[];
  } | null>(null);

  const [validateResult, setValidateResult] = useState<{
    challenge?: ChallengeDetails;
    validationChecks?: ValidationCheck[];
  } | null>(null);

  const [signResult, setSignResult] = useState<{
    signedXdr?: string;
    signatures?: any[];
    redactionNotice?: string;
  } | null>(null);

  const [tokenResult, setTokenResult] = useState<{
    token?: string;
    decodedClaims?: any;
    httpDiagnostics?: HttpDiagnostics;
    redactionNotice?: string;
  } | null>(null);

  // Loading states
  const [loading, setLoading] = useState({
    fetch: false,
    validate: false,
    sign: false,
    token: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleFetchChallenge = async () => {
    setLoading({ ...loading, fetch: true });
    setErrors({ ...errors, fetch: '' });

    try {
      const response = await fetch('/api/sep10/fetch-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fetchForm),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setFetchResult(result);

      // Auto-populate validate form
      setValidateForm({
        ...validateForm,
        challengeXdr: result.challenge.xdr,
        serverAccountId: result.challenge.sourceAccount,
        clientAccountId: fetchForm.account,
        network: fetchForm.network,
        homeDomain: fetchForm.homeDomain,
      });

      // Auto-populate sign form
      setSignForm({
        ...signForm,
        challengeXdr: result.challenge.xdr,
      });
      
    } catch (error) {
      setErrors({ ...errors, fetch: error.message });
    } finally {
      setLoading({ ...loading, fetch: false });
    }
  };

  const handleValidateChallenge = async () => {
    setLoading({ ...loading, validate: true });
    setErrors({ ...errors, validate: '' });

    try {
      const response = await fetch('/api/sep10/validate-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validateForm),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setValidateResult(result);
      
    } catch (error) {
      setErrors({ ...errors, validate: error.message });
    } finally {
      setLoading({ ...loading, validate: false });
    }
  };

  const handleSignChallenge = async () => {
    setLoading({ ...loading, sign: true });
    setErrors({ ...errors, sign: '' });

    try {
      const response = await fetch('/api/sep10/sign-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signForm),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setSignResult(result);

      // Auto-populate token exchange form
      setTokenForm({
        ...tokenForm,
        signedChallengeXdr: result.signedXdr,
        domain: fetchForm.domain,
      });
      
    } catch (error) {
      setErrors({ ...errors, sign: error.message });
    } finally {
      setLoading({ ...loading, sign: false });
    }
  };

  const handleTokenExchange = async () => {
    setLoading({ ...loading, token: true });
    setErrors({ ...errors, token: '' });

    try {
      const response = await fetch('/api/sep10/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokenForm),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setTokenResult(result);
      
    } catch (error) {
      setErrors({ ...errors, token: error.message });
    } finally {
      setLoading({ ...loading, token: false });
    }
  };

  const ValidationCheckList: React.FC<{ checks: ValidationCheck[] }> = ({ checks }) => (
    <div className="space-y-2">
      {checks.map((check, index) => (
        <div key={index} className="flex items-center gap-2 p-2 rounded border">
          {check.passed ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <div className="flex-1">
            <div className="font-medium">{check.name}</div>
            <div className="text-sm text-gray-600">{check.message}</div>
            {check.details && (
              <pre className="text-xs mt-1 p-2 bg-gray-100 rounded overflow-auto">
                {JSON.stringify(check.details, null, 2)}
              </pre>
            )}
          </div>
          <Badge variant={check.passed ? 'success' : 'destructive'}>
            {check.passed ? 'PASS' : 'FAIL'}
          </Badge>
        </div>
      ))}
    </div>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">{t('title', 'SEP-10 Web Authentication Debugger')}</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          {t('description', 'Debug SEP-10 challenge transactions, validate signatures, and test token exchange flows without exposing secrets.')}
        </p>
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          {t('securityNotice', 'This tool never stores or logs secret keys. All sensitive data is redacted from responses for security.')}
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="fetch" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="fetch" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Fetch Challenge
          </TabsTrigger>
          <TabsTrigger value="validate" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Validate
          </TabsTrigger>
          <TabsTrigger value="sign" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Sign
          </TabsTrigger>
          <TabsTrigger value="exchange" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Exchange Token
          </TabsTrigger>
        </TabsList>

        {/* Fetch Challenge Tab */}
        <TabsContent value="fetch">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Fetch SEP-10 Challenge</CardTitle>
                <CardDescription>
                  Fetch a challenge transaction from an anchor domain
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="domain">Anchor Domain</Label>
                  <Input
                    id="domain"
                    placeholder="https://anchor.example.com"
                    value={fetchForm.domain}
                    onChange={(e) => setFetchForm({ ...fetchForm, domain: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="account">Client Account</Label>
                  <Input
                    id="account"
                    placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                    value={fetchForm.account}
                    onChange={(e) => setFetchForm({ ...fetchForm, account: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="network">Network</Label>
                  <select
                    id="network"
                    className="w-full p-2 border rounded"
                    value={fetchForm.network}
                    onChange={(e) => setFetchForm({ ...fetchForm, network: e.target.value as 'testnet' | 'mainnet' })}
                  >
                    <option value="testnet">Testnet</option>
                    <option value="mainnet">Mainnet</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="homeDomain">Home Domain (Optional)</Label>
                  <Input
                    id="homeDomain"
                    placeholder="client.example.com"
                    value={fetchForm.homeDomain}
                    onChange={(e) => setFetchForm({ ...fetchForm, homeDomain: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="clientDomain">Client Domain (Optional)</Label>
                  <Input
                    id="clientDomain"
                    placeholder="wallet.example.com"
                    value={fetchForm.clientDomain}
                    onChange={(e) => setFetchForm({ ...fetchForm, clientDomain: e.target.value })}
                  />
                </div>

                <Button 
                  onClick={handleFetchChallenge} 
                  disabled={loading.fetch || !fetchForm.domain || !fetchForm.account}
                  className="w-full"
                >
                  {loading.fetch ? 'Fetching...' : 'Fetch Challenge'}
                </Button>

                {errors.fetch && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.fetch}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {fetchResult && (
              <Card>
                <CardHeader>
                  <CardTitle>Challenge Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div><strong>Hash:</strong> {fetchResult.challenge?.hash}</div>
                    <div><strong>Source Account:</strong> {fetchResult.challenge?.sourceAccount}</div>
                    <div><strong>Sequence:</strong> {fetchResult.challenge?.sequenceNumber}</div>
                    <div><strong>Fee:</strong> {fetchResult.challenge?.fee}</div>
                    {fetchResult.challenge?.timeBounds && (
                      <div>
                        <strong>Time Bounds:</strong> {new Date(parseInt(fetchResult.challenge.timeBounds.minTime) * 1000).toISOString()} - {new Date(parseInt(fetchResult.challenge.timeBounds.maxTime) * 1000).toISOString()}
                      </div>
                    )}
                    <div><strong>Operations:</strong> {fetchResult.challenge?.operations.length}</div>
                  </div>

                  {fetchResult.validationChecks && (
                    <div>
                      <h4 className="font-medium mb-2">Validation Results</h4>
                      <ValidationCheckList checks={fetchResult.validationChecks} />
                    </div>
                  )}

                  {fetchResult.httpDiagnostics && (
                    <div>
                      <h4 className="font-medium mb-2">HTTP Diagnostics</h4>
                      <div className="text-sm space-y-1">
                        <div><strong>Request:</strong> {fetchResult.httpDiagnostics.request.method} {fetchResult.httpDiagnostics.request.url}</div>
                        <div><strong>Response:</strong> {fetchResult.httpDiagnostics.response.status} {fetchResult.httpDiagnostics.response.statusText}</div>
                        <div><strong>Timing:</strong> {fetchResult.httpDiagnostics.response.timing}ms</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Validate Challenge Tab */}
        <TabsContent value="validate">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Validate Challenge</CardTitle>
                <CardDescription>
                  Validate a challenge against SEP-10 rules
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="challengeXdr">Challenge XDR</Label>
                  <Textarea
                    id="challengeXdr"
                    placeholder="AAAAAgAAAAD..."
                    value={validateForm.challengeXdr}
                    onChange={(e) => setValidateForm({ ...validateForm, challengeXdr: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="serverAccountId">Server Account</Label>
                    <Input
                      id="serverAccountId"
                      placeholder="GXXXXXXX..."
                      value={validateForm.serverAccountId}
                      onChange={(e) => setValidateForm({ ...validateForm, serverAccountId: e.target.value })}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="clientAccountId">Client Account</Label>
                    <Input
                      id="clientAccountId"
                      placeholder="GXXXXXXX..."
                      value={validateForm.clientAccountId}
                      onChange={(e) => setValidateForm({ ...validateForm, clientAccountId: e.target.value })}
                    />
                  </div>
                </div>

                <Button 
                  onClick={handleValidateChallenge}
                  disabled={loading.validate || !validateForm.challengeXdr}
                  className="w-full"
                >
                  {loading.validate ? 'Validating...' : 'Validate Challenge'}
                </Button>

                {errors.validate && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.validate}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {validateResult && (
              <Card>
                <CardHeader>
                  <CardTitle>Validation Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <ValidationCheckList checks={validateResult.validationChecks || []} />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Sign Challenge Tab */}
        <TabsContent value="sign">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Sign Challenge</CardTitle>
                <CardDescription>
                  Sign the challenge with your keypairs (secrets are never logged)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="signChallengeXdr">Challenge XDR</Label>
                  <Textarea
                    id="signChallengeXdr"
                    placeholder="AAAAAgAAAAD..."
                    value={signForm.challengeXdr}
                    onChange={(e) => setSignForm({ ...signForm, challengeXdr: e.target.value })}
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="clientKeypair">Client Secret Key</Label>
                  <Input
                    id="clientKeypair"
                    type="password"
                    placeholder="SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                    value={signForm.clientKeypair}
                    onChange={(e) => setSignForm({ ...signForm, clientKeypair: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="clientDomainKeypair">Client Domain Secret (Optional)</Label>
                  <Input
                    id="clientDomainKeypair"
                    type="password"
                    placeholder="SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                    value={signForm.clientDomainKeypair}
                    onChange={(e) => setSignForm({ ...signForm, clientDomainKeypair: e.target.value })}
                  />
                </div>

                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    Secret keys are processed locally and never stored or logged
                  </AlertDescription>
                </Alert>

                <Button 
                  onClick={handleSignChallenge}
                  disabled={loading.sign || !signForm.challengeXdr || !signForm.clientKeypair}
                  className="w-full"
                >
                  {loading.sign ? 'Signing...' : 'Sign Challenge'}
                </Button>

                {errors.sign && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.sign}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {signResult && (
              <Card>
                <CardHeader>
                  <CardTitle>Signing Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Signed Transaction XDR</Label>
                    <Textarea 
                      value={signResult.signedXdr || ''}
                      readOnly
                      rows={3}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div>
                    <Label>Signatures ({signResult.signatures?.length || 0})</Label>
                    <div className="space-y-2">
                      {signResult.signatures?.map((sig, index) => (
                        <div key={index} className="p-2 border rounded text-sm">
                          <div><strong>Key Hint:</strong> {sig.publicKey}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {signResult.redactionNotice && (
                    <Alert>
                      <Shield className="h-4 w-4" />
                      <AlertDescription>{signResult.redactionNotice}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Token Exchange Tab */}
        <TabsContent value="exchange">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Exchange Token</CardTitle>
                <CardDescription>
                  Exchange signed challenge for JWT token
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="signedChallengeXdr">Signed Challenge XDR</Label>
                  <Textarea
                    id="signedChallengeXdr"
                    placeholder="AAAAAgAAAAD..."
                    value={tokenForm.signedChallengeXdr}
                    onChange={(e) => setTokenForm({ ...tokenForm, signedChallengeXdr: e.target.value })}
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="tokenDomain">Anchor Domain</Label>
                  <Input
                    id="tokenDomain"
                    placeholder="https://anchor.example.com"
                    value={tokenForm.domain}
                    onChange={(e) => setTokenForm({ ...tokenForm, domain: e.target.value })}
                  />
                </div>

                <Button 
                  onClick={handleTokenExchange}
                  disabled={loading.token || !tokenForm.signedChallengeXdr || !tokenForm.domain}
                  className="w-full"
                >
                  {loading.token ? 'Exchanging...' : 'Exchange Token'}
                </Button>

                {errors.token && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.token}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {tokenResult && (
              <Card>
                <CardHeader>
                  <CardTitle>Token Exchange Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {tokenResult.decodedClaims && (
                    <div>
                      <Label>JWT Claims (Non-sensitive)</Label>
                      <pre className="text-xs p-2 bg-gray-100 rounded overflow-auto">
                        {JSON.stringify(tokenResult.decodedClaims, null, 2)}
                      </pre>
                    </div>
                  )}

                  {tokenResult.httpDiagnostics && (
                    <div>
                      <Label>HTTP Response</Label>
                      <div className="text-sm space-y-1">
                        <div><strong>Status:</strong> {tokenResult.httpDiagnostics.response.status} {tokenResult.httpDiagnostics.response.statusText}</div>
                        <div><strong>Timing:</strong> {tokenResult.httpDiagnostics.response.timing}ms</div>
                      </div>
                    </div>
                  )}

                  {tokenResult.redactionNotice && (
                    <Alert>
                      <Shield className="h-4 w-4" />
                      <AlertDescription>{tokenResult.redactionNotice}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}