'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GitBranch, Plus, Trash2, AlertCircle, CheckCircle2, Info, Play } from 'lucide-react';

interface Transaction {
  id: string;
  sourceAccount: string;
  sequenceNumber?: number;
  description?: string;
  dependencies?: string[];
}

interface PlannedTransaction extends Transaction {
  assignedSequence: number;
  status: 'valid' | 'conflict' | 'warning';
  issues: string[];
}

interface PlanResult {
  plannedTransactions: PlannedTransaction[];
  conflicts: any[];
  accountSequences: any[];
  summary: {
    total: number;
    valid: number;
    conflicts: number;
    warnings: number;
  };
}

export default function SequencePlannerPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([
    {
      id: 'tx-1',
      sourceAccount: '',
      description: ''
    }
  ]);
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [network, setNetwork] = useState<'testnet' | 'mainnet'>('testnet');

  // Single account validation
  const [singleAccount, setSingleAccount] = useState('');
  const [proposedSequence, setProposedSequence] = useState('');
  const [validationResult, setValidationResult] = useState<any>(null);

  const addTransaction = () => {
    setTransactions([
      ...transactions,
      {
        id: `tx-${transactions.length + 1}`,
        sourceAccount: '',
        description: ''
      }
    ]);
  };

  const removeTransaction = (id: string) => {
    setTransactions(transactions.filter(tx => tx.id !== id));
  };

  const updateTransaction = (id: string, field: keyof Transaction, value: any) => {
    setTransactions(transactions.map(tx => 
      tx.id === id ? { ...tx, [field]: value } : tx
    ));
  };

  const handlePlanSequences = async () => {
    setLoading(true);
    setError(null);
    setPlanResult(null);

    try {
      const response = await fetch('/api/sequence-planner/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: transactions.filter(tx => tx.sourceAccount),
          network
        })
      });

      if (!response.ok) {
        throw new Error('Failed to plan sequences');
      }

      const result = await response.json();
      setPlanResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to plan sequences');
    } finally {
      setLoading(false);
    }
  };

  const handleValidateSingle = async () => {
    setLoading(true);
    setError(null);
    setValidationResult(null);

    try {
      const response = await fetch('/api/sequence-planner/validate-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: singleAccount,
          proposedSequence: parseInt(proposedSequence),
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'valid':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Valid</Badge>;
      case 'conflict':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Conflict</Badge>;
      case 'warning':
        return <Badge variant="default"><Info className="h-3 w-3 mr-1" />Warning</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <GitBranch className="h-8 w-8" />
            Sequence Number Planner
          </h1>
          <p className="text-muted-foreground mt-2">
            Plan and validate transaction sequences to avoid conflicts
          </p>
        </div>
      </div>

      <Tabs defaultValue="planner" className="space-y-4">
        <TabsList>
          <TabsTrigger value="planner">Transaction Planner</TabsTrigger>
          <TabsTrigger value="validate">Single Validation</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="planner" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction Planner</CardTitle>
              <CardDescription>
                Add multiple transactions and plan their sequence numbers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
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

              <div className="space-y-4">
                {transactions.map((tx, index) => (
                  <Card key={tx.id} className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Transaction ID</Label>
                            <Input
                              value={tx.id}
                              onChange={(e) => updateTransaction(tx.id, 'id', e.target.value)}
                              placeholder="tx-1"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Source Account</Label>
                            <Input
                              value={tx.sourceAccount}
                              onChange={(e) => updateTransaction(tx.id, 'sourceAccount', e.target.value)}
                              placeholder="GABC..."
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Sequence Number (optional)</Label>
                            <Input
                              type="number"
                              value={tx.sequenceNumber || ''}
                              onChange={(e) => updateTransaction(tx.id, 'sequenceNumber', e.target.value ? parseInt(e.target.value) : undefined)}
                              placeholder="Auto-assign if empty"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Input
                              value={tx.description || ''}
                              onChange={(e) => updateTransaction(tx.id, 'description', e.target.value)}
                              placeholder="Payment transaction"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Dependencies (comma-separated IDs)</Label>
                          <Input
                            value={tx.dependencies?.join(', ') || ''}
                            onChange={(e) => updateTransaction(tx.id, 'dependencies', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                            placeholder="tx-0, setup-tx"
                          />
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTransaction(tx.id)}
                        disabled={transactions.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="flex gap-2">
                <Button onClick={addTransaction} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Transaction
                </Button>

                <Button onClick={handlePlanSequences} disabled={loading || !transactions.some(tx => tx.sourceAccount)}>
                  <Play className="h-4 w-4 mr-2" />
                  Plan Sequences
                </Button>
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

        <TabsContent value="validate" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Single Sequence Validation</CardTitle>
              <CardDescription>
                Validate a proposed sequence number for an account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Account Address</Label>
                  <Input
                    value={singleAccount}
                    onChange={(e) => setSingleAccount(e.target.value)}
                    placeholder="GABC..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Proposed Sequence</Label>
                  <Input
                    type="number"
                    value={proposedSequence}
                    onChange={(e) => setProposedSequence(e.target.value)}
                    placeholder="12346"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Network</Label>
                <Select value={network} onValueChange={(v) => setNetwork(v as 'testnet' | 'mainnet')}>
                  <SelectTrigger className="w-full md:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="testnet">Testnet</SelectItem>
                    <SelectItem value="mainnet">Mainnet</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleValidateSingle} disabled={loading || !singleAccount || !proposedSequence}>
                Validate Sequence
              </Button>

              {validationResult && (
                <div className="space-y-4 mt-6">
                  <div className="flex items-center gap-2">
                    {validationResult.isValid ? (
                      <Badge className="bg-green-500">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Valid
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Invalid
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Current Sequence</Label>
                      <p className="text-lg font-mono">{validationResult.currentSequence}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Next Valid Sequence</Label>
                      <p className="text-lg font-mono">{validationResult.nextValidSequence}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Gap</Label>
                      <p className="text-lg font-mono">{validationResult.gap}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Issues</Label>
                    {validationResult.issues.map((issue: string, index: number) => (
                      <Alert key={index} variant={validationResult.isValid ? 'default' : 'destructive'}>
                        <AlertDescription>{issue}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {planResult && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Total</Label>
                      <p className="text-2xl font-bold">{planResult.summary.total}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Valid</Label>
                      <p className="text-2xl font-bold text-green-500">{planResult.summary.valid}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Conflicts</Label>
                      <p className="text-2xl font-bold text-red-500">{planResult.summary.conflicts}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Warnings</Label>
                      <p className="text-2xl font-bold text-yellow-500">{planResult.summary.warnings}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Planned Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Sequence</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {planResult.plannedTransactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="font-mono">{tx.id}</TableCell>
                          <TableCell className="font-mono text-xs">{tx.sourceAccount.slice(0, 8)}...</TableCell>
                          <TableCell className="font-mono">{tx.assignedSequence}</TableCell>
                          <TableCell>{getStatusBadge(tx.status)}</TableCell>
                          <TableCell>
                            {tx.issues.length > 0 ? (
                              <div className="space-y-1">
                                {tx.issues.map((issue, idx) => (
                                  <p key={idx} className="text-xs text-muted-foreground">{issue}</p>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No issues</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {planResult.conflicts.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Conflicts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {planResult.conflicts.map((conflict, index) => (
                        <Alert key={index} variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle className="capitalize">{conflict.type.replace('_', ' ')}</AlertTitle>
                          <AlertDescription>{conflict.message}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Account Sequences</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {planResult.accountSequences.map((acc, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <p className="font-mono text-sm mb-2">{acc.account}</p>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <Label className="text-xs text-muted-foreground">Current</Label>
                            <p className="font-mono">{acc.currentSequence}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Next</Label>
                            <p className="font-mono">{acc.nextSequence}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Planned</Label>
                            <p className="font-mono">{acc.plannedSequences.join(', ')}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {!planResult && (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">No plan results yet. Use the Transaction Planner to generate a plan.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
