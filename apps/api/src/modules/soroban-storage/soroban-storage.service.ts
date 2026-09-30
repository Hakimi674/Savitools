import {
  Injectable,
  BadRequestException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  SorobanRpc,
  nativeToScVal,
  scValToNative,
  xdr,
  Address,
  Contract,
  StrKey,
} from '@stellar/stellar-sdk';
import { StorageQueryDto } from './dto/storage-query.dto';
import { StorageCompareDto } from './dto/storage-compare.dto';
import { TypedKeyDto } from './dto/typed-key.dto';

export interface StorageEntry {
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

export interface StorageDiff {
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

export interface StorageQueryResult {
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

export interface StorageCompareResult {
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

@Injectable()
export class SorobanStorageService {
  private readonly logger = new Logger(SorobanStorageService.name);
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly storageCache = new Map<string, { data: any; timestamp: number }>();

  private readonly DEFAULT_RPC_ENDPOINTS = {
    testnet: 'https://soroban-testnet.stellar.org',
    mainnet: 'https://soroban-mainnet.stellar.org',
  };

  /**
   * Query a storage entry from a Soroban contract
   */
  async queryStorage(dto: StorageQueryDto): Promise<StorageQueryResult> {
    const startTime = Date.now();
    
    try {
      // Validate contract ID
      if (!StrKey.isValidContract(dto.contractId)) {
        throw new BadRequestException('Invalid contract ID format');
      }

      // Get RPC endpoint
      const rpcEndpoint = dto.rpcEndpoint || this.DEFAULT_RPC_ENDPOINTS[dto.network || 'testnet'];
      const rpcServer = new SorobanRpc.Server(rpcEndpoint, {
        allowHttp: rpcEndpoint.startsWith('http://'),
      });

      // Parse storage key
      const storageKeyXdr = this.parseStorageKey(dto.storageKey);
      
      // Create ledger key for the storage entry
      const ledgerKey = this.createLedgerKey(dto.contractId, storageKeyXdr, dto.durability);

      // Query the storage entry
      const ledgerEntries = await this.queryLedgerEntries(rpcServer, [ledgerKey]);
      const ledgerInfo = await rpcServer.getLatestLedger();

      const responseTime = Date.now() - startTime;
      
      const result: StorageQueryResult = {
        contractId: dto.contractId,
        storageKey: dto.storageKey,
        durability: dto.durability,
        found: false,
        ledgerInfo: {
          sequence: ledgerInfo.sequence,
          closeTime: new Date(ledgerInfo.protocolVersion).getTime(),
        },
        rpcMetadata: {
          endpoint: rpcEndpoint,
          responseTime,
        },
      };

      if (ledgerEntries.entries && ledgerEntries.entries.length > 0) {
        const entry = ledgerEntries.entries[0];
        
        if (entry.val) {
          result.found = true;
          result.entry = await this.parseStorageEntry(storageKeyXdr, entry);
        }
      }

      // Cache the result
      this.cacheResult(`storage:${dto.contractId}:${dto.storageKey}:${dto.durability}`, result);

      return result;

    } catch (error) {
      this.logger.error(`Storage query failed: ${error.message}`, error.stack);
      
      return {
        contractId: dto.contractId,
        storageKey: dto.storageKey,
        durability: dto.durability,
        found: false,
        error: error.message,
        ledgerInfo: {
          sequence: 0,
          closeTime: Date.now(),
        },
        rpcMetadata: {
          endpoint: dto.rpcEndpoint || this.DEFAULT_RPC_ENDPOINTS[dto.network || 'testnet'],
          responseTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Compare storage entries across two different ledgers
   */
  async compareStorage(dto: StorageCompareDto): Promise<StorageCompareResult> {
    const startTime = Date.now();
    
    try {
      // Validate inputs
      if (!StrKey.isValidContract(dto.contractId)) {
        throw new BadRequestException('Invalid contract ID format');
      }

      if (dto.ledgerSeq1 === dto.ledgerSeq2) {
        throw new BadRequestException('Ledger sequences must be different');
      }

      const rpcEndpoint = dto.rpcEndpoint || this.DEFAULT_RPC_ENDPOINTS[dto.network || 'testnet'];
      const rpcServer = new SorobanRpc.Server(rpcEndpoint, {
        allowHttp: rpcEndpoint.startsWith('http://'),
      });

      // Parse storage key
      const storageKeyXdr = this.parseStorageKey(dto.storageKey);

      // Query both ledger states
      const [entry1, entry2] = await Promise.all([
        this.queryStorageAtLedger(rpcServer, dto.contractId, storageKeyXdr, 'persistent', dto.ledgerSeq1),
        this.queryStorageAtLedger(rpcServer, dto.contractId, storageKeyXdr, 'persistent', dto.ledgerSeq2),
      ]);

      // Generate diff
      const diff = this.generateStorageDiff(entry1, entry2);

      return {
        contractId: dto.contractId,
        storageKey: dto.storageKey,
        ledger1: dto.ledgerSeq1,
        ledger2: dto.ledgerSeq2,
        entry1,
        entry2,
        diff,
        rpcMetadata: {
          endpoint: rpcEndpoint,
          totalResponseTime: Date.now() - startTime,
        },
      };

    } catch (error) {
      this.logger.error(`Storage comparison failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Storage comparison failed: ${error.message}`);
    }
  }

  /**
   * Convert typed key to XDR format
   */
  async createTypedStorageKey(dto: TypedKeyDto): Promise<{ xdr: string; decoded: any }> {
    try {
      let scVal: xdr.ScVal;

      switch (dto.keyType) {
        case 'symbol':
          scVal = xdr.ScVal.scvSymbol(dto.keyValue);
          break;
        
        case 'string':
          scVal = nativeToScVal(dto.keyValue);
          break;
        
        case 'address':
          scVal = Address.fromString(dto.keyValue).toScVal();
          break;
        
        case 'instance':
          scVal = xdr.ScVal.scvInstance(xdr.ScInstanceType.scInstanceTypeContract());
          break;
        
        case 'u32':
          scVal = nativeToScVal(parseInt(dto.keyValue, 10), { type: 'u32' });
          break;
        
        case 'i32':
          scVal = nativeToScVal(parseInt(dto.keyValue, 10), { type: 'i32' });
          break;
        
        case 'u64':
          scVal = nativeToScVal(BigInt(dto.keyValue), { type: 'u64' });
          break;
        
        case 'i64':
          scVal = nativeToScVal(BigInt(dto.keyValue), { type: 'i64' });
          break;
        
        case 'bytes':
          const bytes = Buffer.from(dto.keyValue, 'hex');
          scVal = nativeToScVal(bytes);
          break;
        
        default:
          throw new BadRequestException(`Unsupported key type: ${dto.keyType}`);
      }

      // Handle composite keys
      if (dto.additionalKeys) {
        try {
          const additionalKeys = JSON.parse(dto.additionalKeys);
          const keyArray = [scVal];
          
          for (const additionalKey of additionalKeys) {
            keyArray.push(nativeToScVal(additionalKey));
          }
          
          scVal = xdr.ScVal.scvVec(keyArray);
        } catch (parseError) {
          throw new BadRequestException('Invalid additional keys JSON format');
        }
      }

      const xdrString = scVal.toXDR('base64');
      const decoded = scValToNative(scVal);

      return {
        xdr: xdrString,
        decoded,
      };

    } catch (error) {
      this.logger.error(`Typed key creation failed: ${error.message}`);
      throw new BadRequestException(`Typed key creation failed: ${error.message}`);
    }
  }

  /**
   * Get available durability classes and their descriptions
   */
  getDurabilityInfo(): Record<string, { description: string; expiry: string }> {
    return {
      temporary: {
        description: 'Short-lived storage, automatically cleaned up',
        expiry: 'Expires after ~1 day without access',
      },
      persistent: {
        description: 'Long-lived storage, requires explicit cleanup',
        expiry: 'Expires after ~120 days without access',
      },
      instance: {
        description: 'Contract instance storage (code, metadata)',
        expiry: 'Lives with the contract instance',
      },
    };
  }

  private parseStorageKey(keyInput: string): xdr.ScVal {
    try {
      // Try to parse as XDR first
      return xdr.ScVal.fromXDR(keyInput, 'base64');
    } catch (xdrError) {
      // If XDR parsing fails, try to create a symbol key
      try {
        return xdr.ScVal.scvSymbol(keyInput);
      } catch (symbolError) {
        throw new BadRequestException(
          'Storage key must be valid XDR or a symbol string'
        );
      }
    }
  }

  private createLedgerKey(contractId: string, storageKey: xdr.ScVal, durability: string): xdr.LedgerKey {
    const contractAddress = Address.contract(Buffer.from(contractId, 'hex'));
    
    switch (durability) {
      case 'temporary':
        return xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: contractAddress.toScAddress(),
            key: storageKey,
            durability: xdr.ContractDataDurability.temporary(),
          })
        );
      
      case 'persistent':
        return xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: contractAddress.toScAddress(),
            key: storageKey,
            durability: xdr.ContractDataDurability.persistent(),
          })
        );
      
      case 'instance':
        return xdr.LedgerKey.contractCode(
          new xdr.LedgerKeyContractCode({
            hash: Buffer.from(contractId, 'hex'),
          })
        );
      
      default:
        throw new BadRequestException(`Invalid durability class: ${durability}`);
    }
  }

  private async queryLedgerEntries(
    rpcServer: SorobanRpc.Server, 
    keys: xdr.LedgerKey[]
  ): Promise<SorobanRpc.Api.GetLedgerEntriesResponse> {
    return await rpcServer.getLedgerEntries(...keys);
  }

  private async queryStorageAtLedger(
    rpcServer: SorobanRpc.Server,
    contractId: string,
    storageKey: xdr.ScVal,
    durability: string,
    ledgerSeq: number
  ): Promise<StorageEntry | undefined> {
    try {
      const ledgerKey = this.createLedgerKey(contractId, storageKey, durability);
      
      // Note: This is a simplified implementation. In practice, you'd need
      // to use historical ledger data or archive access
      const response = await this.queryLedgerEntries(rpcServer, [ledgerKey]);
      
      if (response.entries && response.entries.length > 0) {
        const entry = response.entries[0];
        if (entry.val) {
          return await this.parseStorageEntry(storageKey, entry);
        }
      }
      
      return undefined;
    } catch (error) {
      this.logger.warn(`Failed to query storage at ledger ${ledgerSeq}: ${error.message}`);
      return undefined;
    }
  }

  private async parseStorageEntry(
    keyXdr: xdr.ScVal, 
    ledgerEntry: SorobanRpc.Api.LedgerEntryResult
  ): Promise<StorageEntry> {
    try {
      const key = {
        xdr: keyXdr.toXDR('base64'),
        decoded: scValToNative(keyXdr),
        type: this.getScValTypeName(keyXdr),
      };

      // Parse the value
      const valueXdr = xdr.LedgerEntryData.fromXDR(ledgerEntry.xdr, 'base64');
      let value: any = { xdr: '', decoded: null, type: 'unknown' };
      
      if (valueXdr.contractData && valueXdr.contractData().val) {
        const val = valueXdr.contractData().val();
        value = {
          xdr: val.toXDR('base64'),
          decoded: scValToNative(val),
          type: this.getScValTypeName(val),
        };
      }

      return {
        key,
        value,
        durability: 'persistent', // This would need to be determined from the actual entry
        liveUntilLedger: ledgerEntry.liveUntilLedgerSeq,
        lastModifiedLedger: ledgerEntry.lastModifiedLedgerSeq,
      };
    } catch (error) {
      this.logger.error(`Failed to parse storage entry: ${error.message}`);
      throw new BadRequestException(`Failed to parse storage entry: ${error.message}`);
    }
  }

  private getScValTypeName(scVal: xdr.ScVal): string {
    switch (scVal.switch()) {
      case xdr.ScValType.scvBool():
        return 'Bool';
      case xdr.ScValType.scvVoid():
        return 'Void';
      case xdr.ScValType.scvU32():
        return 'U32';
      case xdr.ScValType.scvI32():
        return 'I32';
      case xdr.ScValType.scvU64():
        return 'U64';
      case xdr.ScValType.scvI64():
        return 'I64';
      case xdr.ScValType.scvTimepoint():
        return 'Timepoint';
      case xdr.ScValType.scvDuration():
        return 'Duration';
      case xdr.ScValType.scvU128():
        return 'U128';
      case xdr.ScValType.scvI128():
        return 'I128';
      case xdr.ScValType.scvU256():
        return 'U256';
      case xdr.ScValType.scvI256():
        return 'I256';
      case xdr.ScValType.scvBytes():
        return 'Bytes';
      case xdr.ScValType.scvString():
        return 'String';
      case xdr.ScValType.scvSymbol():
        return 'Symbol';
      case xdr.ScValType.scvVec():
        return 'Vec';
      case xdr.ScValType.scvMap():
        return 'Map';
      case xdr.ScValType.scvAddress():
        return 'Address';
      case xdr.ScValType.scvContractInstance():
        return 'ContractInstance';
      default:
        return 'Unknown';
    }
  }

  private generateStorageDiff(entry1?: StorageEntry, entry2?: StorageEntry): StorageDiff {
    if (!entry1 && !entry2) {
      return {
        key: 'unknown',
        status: 'unchanged',
      };
    }

    if (!entry1 && entry2) {
      return {
        key: entry2.key.xdr,
        status: 'added',
        newValue: entry2.value.decoded,
      };
    }

    if (entry1 && !entry2) {
      return {
        key: entry1.key.xdr,
        status: 'removed',
        oldValue: entry1.value.decoded,
      };
    }

    if (entry1 && entry2) {
      const key = entry1.key.xdr;
      
      // Deep compare values
      if (JSON.stringify(entry1.value.decoded) === JSON.stringify(entry2.value.decoded)) {
        return {
          key,
          status: 'unchanged',
          oldValue: entry1.value.decoded,
          newValue: entry2.value.decoded,
        };
      } else {
        // Generate detailed changes
        const changes = this.generateDetailedChanges(entry1.value.decoded, entry2.value.decoded);
        
        return {
          key,
          status: 'modified',
          oldValue: entry1.value.decoded,
          newValue: entry2.value.decoded,
          changes,
        };
      }
    }

    return {
      key: 'unknown',
      status: 'unchanged',
    };
  }

  private generateDetailedChanges(oldValue: any, newValue: any, path = ''): any[] {
    const changes: any[] = [];
    
    if (typeof oldValue !== typeof newValue) {
      changes.push({
        path: path || 'root',
        oldValue,
        newValue,
      });
      return changes;
    }

    if (typeof oldValue === 'object' && oldValue !== null) {
      // Handle arrays
      if (Array.isArray(oldValue) && Array.isArray(newValue)) {
        const maxLength = Math.max(oldValue.length, newValue.length);
        for (let i = 0; i < maxLength; i++) {
          const currentPath = path ? `${path}[${i}]` : `[${i}]`;
          if (i >= oldValue.length) {
            changes.push({ path: currentPath, oldValue: undefined, newValue: newValue[i] });
          } else if (i >= newValue.length) {
            changes.push({ path: currentPath, oldValue: oldValue[i], newValue: undefined });
          } else {
            changes.push(...this.generateDetailedChanges(oldValue[i], newValue[i], currentPath));
          }
        }
      } else {
        // Handle objects
        const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
        for (const key of allKeys) {
          const currentPath = path ? `${path}.${key}` : key;
          if (!(key in oldValue)) {
            changes.push({ path: currentPath, oldValue: undefined, newValue: newValue[key] });
          } else if (!(key in newValue)) {
            changes.push({ path: currentPath, oldValue: oldValue[key], newValue: undefined });
          } else {
            changes.push(...this.generateDetailedChanges(oldValue[key], newValue[key], currentPath));
          }
        }
      }
    } else if (oldValue !== newValue) {
      changes.push({
        path: path || 'root',
        oldValue,
        newValue,
      });
    }

    return changes;
  }

  private cacheResult(key: string, data: any): void {
    // Simple cache implementation with TTL
    if (this.storageCache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entries
      const entries = Array.from(this.storageCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.2));
      toRemove.forEach(([cacheKey]) => this.storageCache.delete(cacheKey));
    }

    this.storageCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  private getCachedResult(key: string): any | null {
    const cached = this.storageCache.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() - cached.timestamp > this.CACHE_TTL_MS) {
      this.storageCache.delete(key);
      return null;
    }

    return cached.data;
  }
}