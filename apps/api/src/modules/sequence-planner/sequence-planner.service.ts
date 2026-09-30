import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { TransactionPlanDto } from './dto/sequence-plan.dto';

interface SequenceConflict {
  type: 'duplicate' | 'gap' | 'out_of_order' | 'dependency_violation';
  severity: 'error' | 'warning';
  message: string;
  transactions: string[];
  accounts: string[];
}

interface AccountSequenceInfo {
  account: string;
  currentSequence: string;
  nextSequence: string;
  plannedSequences: number[];
}

interface PlannedTransaction extends TransactionPlanDto {
  assignedSequence: number;
  status: 'valid' | 'conflict' | 'warning';
  issues: string[];
}

@Injectable()
export class SequencePlannerService {
  private readonly logger = new Logger(SequencePlannerService.name);
  private horizonTestnet: StellarSdk.Horizon.Server;
  private horizonMainnet: StellarSdk.Horizon.Server;

  constructor(private configService: ConfigService) {
    this.horizonTestnet = new StellarSdk.Horizon.Server(
      'https://horizon-testnet.stellar.org'
    );
    this.horizonMainnet = new StellarSdk.Horizon.Server(
      'https://horizon.stellar.org'
    );
  }

  /**
   * Get current sequence number for an account
   */
  async getAccountSequence(
    account: string,
    network: 'testnet' | 'mainnet' = 'testnet'
  ): Promise<{
    account: string;
    currentSequence: string;
    nextSequence: string;
  }> {
    try {
      const horizon = network === 'mainnet' ? this.horizonMainnet : this.horizonTestnet;
      const accountData = await horizon.loadAccount(account);

      return {
        account,
        currentSequence: accountData.sequence,
        nextSequence: (BigInt(accountData.sequence) + BigInt(1)).toString()
      };
    } catch (error) {
      this.logger.error(`Failed to fetch account sequence: ${error.message}`);
      throw new BadRequestException({
        message: 'Failed to fetch account sequence',
        error: error.message,
        account
      });
    }
  }

  /**
   * Validate a proposed sequence number against current account state
   */
  async validateSequence(
    account: string,
    proposedSequence: number,
    network: 'testnet' | 'mainnet' = 'testnet'
  ): Promise<{
    isValid: boolean;
    currentSequence: string;
    nextValidSequence: string;
    gap: number;
    issues: string[];
  }> {
    const sequenceInfo = await this.getAccountSequence(account, network);
    const current = BigInt(sequenceInfo.currentSequence);
    const proposed = BigInt(proposedSequence);
    const nextValid = current + BigInt(1);
    const gap = Number(proposed - nextValid);

    const issues: string[] = [];
    let isValid = true;

    if (proposed <= current) {
      issues.push(`Proposed sequence ${proposedSequence} has already been used (current: ${sequenceInfo.currentSequence})`);
      isValid = false;
    } else if (proposed > nextValid) {
      issues.push(`Proposed sequence ${proposedSequence} creates a gap of ${gap} transactions`);
      isValid = false;
    } else if (proposed === nextValid) {
      issues.push('Sequence number is valid and ready to use');
    }

    return {
      isValid,
      currentSequence: sequenceInfo.currentSequence,
      nextValidSequence: nextValid.toString(),
      gap,
      issues
    };
  }

  /**
   * Plan transaction sequences with conflict detection
   */
  async planSequences(
    transactions: TransactionPlanDto[],
    network: 'testnet' | 'mainnet' = 'testnet'
  ): Promise<{
    plannedTransactions: PlannedTransaction[];
    conflicts: SequenceConflict[];
    accountSequences: AccountSequenceInfo[];
    summary: {
      total: number;
      valid: number;
      conflicts: number;
      warnings: number;
    };
  }> {
    // Group transactions by source account
    const accountGroups = this.groupByAccount(transactions);
    
    // Fetch current sequences for all accounts
    const accountSequences: AccountSequenceInfo[] = [];
    const accountCurrentSequences = new Map<string, bigint>();

    for (const account of accountGroups.keys()) {
      try {
        const seqInfo = await this.getAccountSequence(account, network);
        accountCurrentSequences.set(account, BigInt(seqInfo.currentSequence));
        accountSequences.push({
          account,
          currentSequence: seqInfo.currentSequence,
          nextSequence: seqInfo.nextSequence,
          plannedSequences: []
        });
      } catch (error) {
        this.logger.warn(`Could not fetch sequence for ${account}: ${error.message}`);
      }
    }

    // Assign sequences and detect conflicts
    const plannedTransactions: PlannedTransaction[] = [];
    const conflicts: SequenceConflict[] = [];
    const usedSequences = new Map<string, Set<number>>();

    // Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(transactions);

    for (const tx of transactions) {
      const issues: string[] = [];
      let status: 'valid' | 'conflict' | 'warning' = 'valid';

      // Check dependencies
      const dependencyIssues = this.checkDependencies(tx, dependencyGraph, plannedTransactions);
      issues.push(...dependencyIssues);

      // Assign or validate sequence number
      let assignedSequence: number;
      
      if (tx.sequenceNumber !== undefined) {
        // User provided sequence - validate it
        assignedSequence = tx.sequenceNumber;
        
        const currentSeq = accountCurrentSequences.get(tx.sourceAccount);
        if (currentSeq !== undefined) {
          if (BigInt(assignedSequence) <= currentSeq) {
            issues.push(`Sequence ${assignedSequence} has already been used`);
            status = 'conflict';
          }
        }

        // Check for duplicates
        if (!usedSequences.has(tx.sourceAccount)) {
          usedSequences.set(tx.sourceAccount, new Set());
        }
        
        if (usedSequences.get(tx.sourceAccount)!.has(assignedSequence)) {
          issues.push(`Duplicate sequence number ${assignedSequence} for account ${tx.sourceAccount}`);
          status = 'conflict';
          conflicts.push({
            type: 'duplicate',
            severity: 'error',
            message: `Duplicate sequence number ${assignedSequence}`,
            transactions: [tx.id],
            accounts: [tx.sourceAccount]
          });
        }
        
        usedSequences.get(tx.sourceAccount)!.add(assignedSequence);
      } else {
        // Auto-assign sequence
        const currentSeq = accountCurrentSequences.get(tx.sourceAccount);
        if (currentSeq === undefined) {
          issues.push(`Cannot fetch current sequence for ${tx.sourceAccount}`);
          status = 'warning';
          assignedSequence = 0;
        } else {
          const usedSeqs = usedSequences.get(tx.sourceAccount) || new Set();
          let nextSeq = currentSeq + BigInt(1);
          
          // Find next available sequence
          while (usedSeqs.has(Number(nextSeq))) {
            nextSeq += BigInt(1);
          }
          
          assignedSequence = Number(nextSeq);
          
          if (!usedSequences.has(tx.sourceAccount)) {
            usedSequences.set(tx.sourceAccount, new Set());
          }
          usedSequences.get(tx.sourceAccount)!.add(assignedSequence);
        }
      }

      plannedTransactions.push({
        ...tx,
        assignedSequence,
        status,
        issues
      });

      // Update account sequences info
      const accountSeqInfo = accountSequences.find(a => a.account === tx.sourceAccount);
      if (accountSeqInfo) {
        accountSeqInfo.plannedSequences.push(assignedSequence);
      }
    }

    // Detect sequence gaps
    for (const [account, sequences] of usedSequences.entries()) {
      const sortedSeqs = Array.from(sequences).sort((a, b) => a - b);
      const currentSeq = accountCurrentSequences.get(account);
      
      if (currentSeq !== undefined) {
        const expectedNext = Number(currentSeq) + 1;
        
        for (let i = 0; i < sortedSeqs.length; i++) {
          const expectedSeq = expectedNext + i;
          const actualSeq = sortedSeqs[i];
          
          if (actualSeq !== expectedSeq) {
            conflicts.push({
              type: 'gap',
              severity: 'error',
              message: `Gap detected: expected sequence ${expectedSeq}, found ${actualSeq}`,
              transactions: plannedTransactions
                .filter(t => t.sourceAccount === account && t.assignedSequence === actualSeq)
                .map(t => t.id),
              accounts: [account]
            });
          }
        }
      }
    }

    // Calculate summary
    const summary = {
      total: plannedTransactions.length,
      valid: plannedTransactions.filter(t => t.status === 'valid').length,
      conflicts: plannedTransactions.filter(t => t.status === 'conflict').length,
      warnings: plannedTransactions.filter(t => t.status === 'warning').length
    };

    return {
      plannedTransactions,
      conflicts,
      accountSequences,
      summary
    };
  }

  /**
   * Group transactions by source account
   */
  private groupByAccount(transactions: TransactionPlanDto[]): Map<string, TransactionPlanDto[]> {
    const groups = new Map<string, TransactionPlanDto[]>();
    
    for (const tx of transactions) {
      if (!groups.has(tx.sourceAccount)) {
        groups.set(tx.sourceAccount, []);
      }
      groups.get(tx.sourceAccount)!.push(tx);
    }
    
    return groups;
  }

  /**
   * Build dependency graph for transactions
   */
  private buildDependencyGraph(transactions: TransactionPlanDto[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    for (const tx of transactions) {
      graph.set(tx.id, tx.dependencies || []);
    }
    
    return graph;
  }

  /**
   * Check transaction dependencies
   */
  private checkDependencies(
    tx: TransactionPlanDto,
    graph: Map<string, string[]>,
    planned: PlannedTransaction[]
  ): string[] {
    const issues: string[] = [];
    const dependencies = graph.get(tx.id) || [];
    
    for (const depId of dependencies) {
      const depTx = planned.find(t => t.id === depId);
      
      if (!depTx) {
        issues.push(`Dependency '${depId}' not found in plan`);
        continue;
      }
      
      // Check if dependency is on same account and has lower sequence
      if (depTx.sourceAccount === tx.sourceAccount) {
        if (tx.sequenceNumber !== undefined && depTx.assignedSequence >= tx.sequenceNumber) {
          issues.push(`Dependency '${depId}' has sequence ${depTx.assignedSequence} >= current transaction sequence ${tx.sequenceNumber}`);
        }
      }
    }
    
    return issues;
  }
}
