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
import { CheckCircle, XCircle, AlertCircle, Database, GitCompare, Key, Clock, Info } from 'lucide-react';

interface StorageEntry {
  key: {
    xdr: string;
    decoded: any;
    type: string;
  };
  value: {
    xdr: string;
    decoded: any;
    type: string;
  };
  durability: string;
  liveUntilLedger?: number;
  lastModifiedLedger?: number;
}

interface StorageQueryResult {
  contractId: string;
  storageKey: string;
  durability: string;
  entry?: StorageEntry;
  found: boolean;
  error?: string;
  ledgerInfo: {
    sequence: number;
    closeTime: number;
  };
  rpcMetadata: {
    endpoint: string;
    responseTime: number;
  };
}

interface StorageDiff {
  key: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  oldValue?: any;
  newValue?: any;
  changes?: {
    path: string;
    oldValue: any;
    newValue: any;
  }[];
}

interface StorageCompareResult {
  contractId: string;
  storageKey: string;
  ledger1: number;
  ledger2: number;
  entry1?: StorageEntry;
  entry2?: StorageEntry;
  diff: StorageDiff;
  rpcMetadata: {
    endpoint: string;
    totalResponseTime: number;
  };
}

export default function SorobanStoragePage() {
  const t = useTranslations('sorobanStorage');
  
  // State for query form
  const [queryForm, setQueryForm] = useState({
    contractId: '',
    storageKey: '',
    durability: 'persistent' as 'temporary' | 'persistent' | 'instance',
    network: 'testnet' as 'testnet' | 'mainnet',
    rpcEndpoint: '',
  });

  // State for compare form
  const [compareForm, setCompareForm] = useState({
    contractId: '',
    storageKey: '',
    ledgerSeq1: '',
    ledgerSeq2: '',
    network: 'testnet',
    rpcEndpoint: '',
  });

  // State for typed key form
  const [typedKeyForm, setTypedKeyForm] = useState({
    keyType: 'symbol' as 'symbol' | 'string' | 'address' | 'instance' | 'u32' | 'i32' | 'u64' | 'i64' | 'bytes',
    keyValue: '',
    additionalKeys: '',
  });

  // Results state
  const [queryResult, setQueryResult] = useState<StorageQueryResult | null>(null);
  const [compareResult, setCompareResult] = useState<StorageCompareResult | null>(null);
  const [typedKeyResult, setTypedKeyResult] = useState<{ xdr: string; decoded: any } | null>(null);
  const [durabilityInfo, setDurabilityInfo] = useState<Record<string, { description: string; expiry: string }> | null>(null);

  // Loading states
  const [loading, setLoading] = useState({
    query: false,
    compare: false,
    typedKey: false,
    durability: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  React.useEffect(() => {
    // Load durability info on component mount
    loadDurabilityInfo();
  }, []);

  const loadDurabilityInfo = async () => {
    setLoading({ ...loading, durability: true });
    try {
      const response = await fetch('/api/soroban-storage/durability-info');
      if (response.ok) {
        const info = await response.json();
        setDurabilityInfo(info);
      }
    } catch (error) {
      console.error('Failed to load durability info:', error);
    } finally {
      setLoading({ ...loading, durability: false });
    }
  };

  const handleQueryStorage = async () => {
    setLoading({ ...loading, query: true });
    setErrors({ ...errors, query: '' });

    try {
      const response = await fetch('/api/soroban-storage/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queryForm),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setQueryResult(result);
      
    } catch (error) {
      setErrors({ ...errors, query: error.message });
    } finally {
      setLoading({ ...loading, query: false });
    }
  };

  const handleCompareStorage = async () => {
    setLoading({ ...loading, compare: true });
    setErrors({ ...errors, compare: '' });

    try {
      const response = await fetch('/api/soroban-storage/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...compareForm,
          ledgerSeq1: parseInt(compareForm.ledgerSeq1),
          ledgerSeq2: parseInt(compareForm.ledgerSeq2),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setCompareResult(result);
      
    } catch (error) {
      setErrors({ ...errors, compare: error.message });
    } finally {
      setLoading({ ...loading, compare: false });
    }
  };

  const handleCreateTypedKey = async () => {
    setLoading({ ...loading, typedKey: true });
    setErrors({ ...errors, typedKey: '' });

    try {
      const response = await fetch('/api/soroban-storage/create-typed-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(typedKeyForm),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setTypedKeyResult(result);

      // Auto-populate query form with the generated key
      setQueryForm({
        ...queryForm,
        storageKey: result.xdr,
      });
      
    } catch (error) {
      setErrors({ ...errors, typedKey: error.message });
    } finally {
      setLoading({ ...loading, typedKey: false });
    }
  };

  const formatValue = (value: any, type: string) => {
    if (value === null || value === undefined) {
      return 'null';
    }
    
    if (type === 'Bytes') {
      return `0x${Buffer.from(value).toString('hex')}`;
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    
    return String(value);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'added': return 'bg-green-100 text-green-800';
      case 'removed': return 'bg-red-100 text-red-800';
      case 'modified': return 'bg-yellow-100 text-yellow-800';
      case 'unchanged': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">{t('title', 'Soroban Contract Storage Explorer')}</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          {t('description', 'Inspect Soroban contract storage keys, decode values, and compare changes across ledgers with comprehensive history tracking.')}
        </p>
      </div>

      <Tabs defaultValue="query" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="query" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Query Storage
          </TabsTrigger>
          <TabsTrigger value="compare" className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            Compare History
          </TabsTrigger>
          <TabsTrigger value="typed-key" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Typed Keys
          </TabsTrigger>
        </TabsList>

        {/* Query Storage Tab */}
        <TabsContent value="query">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Query Contract Storage</CardTitle>
                <CardDescription>
                  Retrieve and decode a storage entry from a Soroban contract
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="contractId">Contract ID</Label>
                  <Input
                    id="contractId"
                    placeholder="CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K"
                    value={queryForm.contractId}
                    onChange={(e) => setQueryForm({ ...queryForm, contractId: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="storageKey">Storage Key (XDR or Symbol)</Label>
                  <Input
                    id="storageKey"
                    placeholder="counter or AAAABAAAABBjb3VudGVy"
                    value={queryForm.storageKey}
                    onChange={(e) => setQueryForm({ ...queryForm, storageKey: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="durability">Durability Class</Label>
                    <select
                      id="durability"
                      className="w-full p-2 border rounded"
                      value={queryForm.durability}
                      onChange={(e) => setQueryForm({ ...queryForm, durability: e.target.value as any })}
                    >
                      <option value="persistent">Persistent</option>
                      <option value="temporary">Temporary</option>
                      <option value="instance">Instance</option>
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="network">Network</Label>
                    <select
                      id="network"
                      className="w-full p-2 border rounded"
                      value={queryForm.network}
                      onChange={(e) => setQueryForm({ ...queryForm, network: e.target.value as any })}
                    >
                      <option value="testnet">Testnet</option>
                      <option value="mainnet">Mainnet</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="rpcEndpoint">Custom RPC Endpoint (Optional)</Label>
                  <Input
                    id="rpcEndpoint"
                    placeholder="https://soroban-testnet.stellar.org"
                    value={queryForm.rpcEndpoint}
                    onChange={(e) => setQueryForm({ ...queryForm, rpcEndpoint: e.target.value })}
                  />
                </div>

                {durabilityInfo && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <strong>{queryForm.durability}:</strong> {durabilityInfo[queryForm.durability]?.description} - {durabilityInfo[queryForm.durability]?.expiry}
                    </AlertDescription>
                  </Alert>
                )}

                <Button 
                  onClick={handleQueryStorage} 
                  disabled={loading.query || !queryForm.contractId || !queryForm.storageKey}
                  className="w-full"
                >
                  {loading.query ? 'Querying...' : 'Query Storage'}
                </Button>

                {errors.query && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.query}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {queryResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Storage Entry
                    {queryResult.found ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </CardTitle>
                  <CardDescription>
                    {queryResult.found ? 'Entry found and decoded' : 'Entry not found'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><strong>Contract:</strong> {queryResult.contractId}</div>
                    <div><strong>Durability:</strong> {queryResult.durability}</div>
                    <div><strong>Ledger:</strong> {queryResult.ledgerInfo.sequence}</div>
                    <div><strong>Response Time:</strong> {queryResult.rpcMetadata.responseTime}ms</div>
                  </div>

                  {queryResult.found && queryResult.entry && (
                    <div className="space-y-4">
                      <div>
                        <Label>Storage Key</Label>
                        <div className="p-2 border rounded bg-gray-50">
                          <div className="text-xs text-gray-500">Type: {queryResult.entry.key.type}</div>
                          <div className="font-mono text-sm">
                            {formatValue(queryResult.entry.key.decoded, queryResult.entry.key.type)}
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label>Storage Value</Label>
                        <div className="p-2 border rounded bg-gray-50">
                          <div className="text-xs text-gray-500">Type: {queryResult.entry.value.type}</div>
                          <pre className="font-mono text-sm whitespace-pre-wrap">
                            {formatValue(queryResult.entry.value.decoded, queryResult.entry.value.type)}
                          </pre>
                        </div>
                      </div>

                      {queryResult.entry.liveUntilLedger && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span className="text-sm">
                            Expires at ledger: {queryResult.entry.liveUntilLedger}
                          </span>
                        </div>
                      )}

                      {queryResult.entry.lastModifiedLedger && (
                        <div className="text-sm text-gray-500">
                          Last modified at ledger: {queryResult.entry.lastModifiedLedger}
                        </div>
                      )}

                      <details className="border rounded p-2">
                        <summary className="cursor-pointer font-medium">Raw XDR Data</summary>
                        <div className="mt-2 space-y-2">
                          <div>
                            <Label>Key XDR:</Label>
                            <Textarea
                              value={queryResult.entry.key.xdr}
                              readOnly
                              rows={2}
                              className="font-mono text-xs"
                            />
                          </div>
                          <div>
                            <Label>Value XDR:</Label>
                            <Textarea
                              value={queryResult.entry.value.xdr}
                              readOnly
                              rows={2}
                              className="font-mono text-xs"
                            />
                          </div>
                        </div>
                      </details>
                    </div>
                  )}

                  {queryResult.error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{queryResult.error}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Compare History Tab */}
        <TabsContent value="compare">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Compare Storage Across Ledgers</CardTitle>
                <CardDescription>
                  Compare the same storage entry at two different ledger sequences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="compareContractId">Contract ID</Label>
                  <Input
                    id="compareContractId"
                    placeholder="CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K"
                    value={compareForm.contractId}
                    onChange={(e) => setCompareForm({ ...compareForm, contractId: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="compareStorageKey">Storage Key</Label>
                  <Input
                    id="compareStorageKey"
                    placeholder="counter or XDR format"
                    value={compareForm.storageKey}
                    onChange={(e) => setCompareForm({ ...compareForm, storageKey: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="ledgerSeq1">First Ledger Sequence</Label>
                    <Input
                      id="ledgerSeq1"
                      type="number"
                      placeholder="1000"
                      value={compareForm.ledgerSeq1}
                      onChange={(e) => setCompareForm({ ...compareForm, ledgerSeq1: e.target.value })}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="ledgerSeq2">Second Ledger Sequence</Label>
                    <Input
                      id="ledgerSeq2"
                      type="number"
                      placeholder="1100"
                      value={compareForm.ledgerSeq2}
                      onChange={(e) => setCompareForm({ ...compareForm, ledgerSeq2: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="compareRpcEndpoint">Custom RPC Endpoint (Optional)</Label>
                  <Input
                    id="compareRpcEndpoint"
                    placeholder="https://soroban-testnet.stellar.org"
                    value={compareForm.rpcEndpoint}
                    onChange={(e) => setCompareForm({ ...compareForm, rpcEndpoint: e.target.value })}
                  />
                </div>

                <Button 
                  onClick={handleCompareStorage}
                  disabled={loading.compare || !compareForm.contractId || !compareForm.storageKey || !compareForm.ledgerSeq1 || !compareForm.ledgerSeq2}
                  className="w-full"
                >
                  {loading.compare ? 'Comparing...' : 'Compare Storage'}
                </Button>

                {errors.compare && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.compare}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {compareResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Storage Comparison
                    <Badge className={getStatusColor(compareResult.diff.status)}>
                      {compareResult.diff.status.toUpperCase()}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Ledger {compareResult.ledger1} vs {compareResult.ledger2}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-gray-500">
                    Response time: {compareResult.rpcMetadata.totalResponseTime}ms
                  </div>

                  {compareResult.diff.status === 'modified' && compareResult.diff.changes && (
                    <div>
                      <Label>Detailed Changes</Label>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {compareResult.diff.changes.map((change, index) => (
                          <div key={index} className="p-2 border rounded text-sm">
                            <div className="font-medium">{change.path}</div>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              <div>
                                <div className="text-xs text-red-600">Old:</div>
                                <pre className="text-xs bg-red-50 p-1 rounded">
                                  {JSON.stringify(change.oldValue, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <div className="text-xs text-green-600">New:</div>
                                <pre className="text-xs bg-green-50 p-1 rounded">
                                  {JSON.stringify(change.newValue, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {compareResult.diff.status !== 'unchanged' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Ledger {compareResult.ledger1}</Label>
                        <pre className="text-xs p-2 border rounded bg-gray-50 max-h-32 overflow-y-auto">
                          {compareResult.diff.oldValue !== undefined 
                            ? JSON.stringify(compareResult.diff.oldValue, null, 2)
                            : 'Entry not found'
                          }
                        </pre>
                      </div>
                      <div>
                        <Label>Ledger {compareResult.ledger2}</Label>
                        <pre className="text-xs p-2 border rounded bg-gray-50 max-h-32 overflow-y-auto">
                          {compareResult.diff.newValue !== undefined 
                            ? JSON.stringify(compareResult.diff.newValue, null, 2)
                            : 'Entry not found'
                          }
                        </pre>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Typed Key Tab */}
        <TabsContent value="typed-key">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Create Typed Storage Key</CardTitle>
                <CardDescription>
                  Convert typed key specifications to XDR format for storage queries
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="keyType">Key Type</Label>
                  <select
                    id="keyType"
                    className="w-full p-2 border rounded"
                    value={typedKeyForm.keyType}
                    onChange={(e) => setTypedKeyForm({ ...typedKeyForm, keyType: e.target.value as any })}
                  >
                    <option value="symbol">Symbol</option>
                    <option value="string">String</option>
                    <option value="address">Address</option>
                    <option value="instance">Instance</option>
                    <option value="u32">U32</option>
                    <option value="i32">I32</option>
                    <option value="u64">U64</option>
                    <option value="i64">I64</option>
                    <option value="bytes">Bytes</option>
                  </select>
                </div>
                
                <div>
                  <Label htmlFor="keyValue">Key Value</Label>
                  <Input
                    id="keyValue"
                    placeholder="Enter value for the selected type"
                    value={typedKeyForm.keyValue}
                    onChange={(e) => setTypedKeyForm({ ...typedKeyForm, keyValue: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="additionalKeys">Additional Keys (JSON Array, Optional)</Label>
                  <Input
                    id="additionalKeys"
                    placeholder='["key2", "key3"]'
                    value={typedKeyForm.additionalKeys}
                    onChange={(e) => setTypedKeyForm({ ...typedKeyForm, additionalKeys: e.target.value })}
                  />
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{typedKeyForm.keyType}:</strong> {
                      typedKeyForm.keyType === 'symbol' ? 'Short string identifier (max 32 chars)' :
                      typedKeyForm.keyType === 'string' ? 'UTF-8 string value' :
                      typedKeyForm.keyType === 'address' ? 'Stellar account or contract address' :
                      typedKeyForm.keyType === 'bytes' ? 'Hexadecimal byte array' :
                      'Numeric value in the specified format'
                    }
                  </AlertDescription>
                </Alert>

                <Button 
                  onClick={handleCreateTypedKey}
                  disabled={loading.typedKey || !typedKeyForm.keyValue}
                  className="w-full"
                >
                  {loading.typedKey ? 'Creating...' : 'Create Typed Key'}
                </Button>

                {errors.typedKey && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.typedKey}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {typedKeyResult && (
              <Card>
                <CardHeader>
                  <CardTitle>Generated Key</CardTitle>
                  <CardDescription>
                    XDR representation of your typed key
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>XDR Format</Label>
                    <Textarea
                      value={typedKeyResult.xdr}
                      readOnly
                      rows={3}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div>
                    <Label>Decoded Value</Label>
                    <pre className="text-xs p-2 border rounded bg-gray-50 max-h-32 overflow-y-auto">
                      {JSON.stringify(typedKeyResult.decoded, null, 2)}
                    </pre>
                  </div>

                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Key has been automatically copied to the Query tab
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}