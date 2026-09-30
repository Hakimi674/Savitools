import {
  Controller,
  Post,
  Get,
  Body,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { SorobanStorageService } from './soroban-storage.service';
import { StorageQueryDto } from './dto/storage-query.dto';
import { StorageCompareDto } from './dto/storage-compare.dto';
import { TypedKeyDto } from './dto/typed-key.dto';

@ApiTags('soroban-storage')
@Controller('soroban-storage')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SorobanStorageController {
  constructor(private readonly storageService: SorobanStorageService) {}

  @Post('query')
  @ApiOperation({
    summary: 'Query Soroban contract storage entry',
    description: 'Retrieve and decode a storage entry from a Soroban contract with TTL and modification details',
  })
  @ApiResponse({
    status: 200,
    description: 'Storage entry retrieved and decoded successfully',
    schema: {
      type: 'object',
      properties: {
        contractId: { type: 'string', description: 'Contract ID that was queried' },
        storageKey: { type: 'string', description: 'Storage key that was queried' },
        durability: { type: 'string', description: 'Durability class of the storage entry' },
        found: { type: 'boolean', description: 'Whether the storage entry was found' },
        entry: {
          type: 'object',
          description: 'Decoded storage entry with key, value, and metadata',
          properties: {
            key: { type: 'object', description: 'Decoded storage key with XDR and type' },
            value: { type: 'object', description: 'Decoded storage value with XDR and type' },
            durability: { type: 'string', description: 'Storage durability class' },
            liveUntilLedger: { type: 'number', description: 'Ledger sequence when entry expires' },
            lastModifiedLedger: { type: 'number', description: 'Ledger sequence when entry was last modified' },
          },
        },
        ledgerInfo: { type: 'object', description: 'Current ledger information' },
        rpcMetadata: { type: 'object', description: 'RPC request metadata and performance metrics' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid request parameters or storage query failed',
  })
  async queryStorage(@Body() dto: StorageQueryDto) {
    return await this.storageService.queryStorage(dto);
  }

  @Post('compare')
  @ApiOperation({
    summary: 'Compare storage entry across ledgers',
    description: 'Compare the same storage entry at two different ledger sequences to see changes over time',
  })
  @ApiResponse({
    status: 200,
    description: 'Storage comparison completed successfully',
    schema: {
      type: 'object',
      properties: {
        contractId: { type: 'string', description: 'Contract ID that was compared' },
        storageKey: { type: 'string', description: 'Storage key that was compared' },
        ledger1: { type: 'number', description: 'First ledger sequence' },
        ledger2: { type: 'number', description: 'Second ledger sequence' },
        entry1: { type: 'object', description: 'Storage entry at first ledger' },
        entry2: { type: 'object', description: 'Storage entry at second ledger' },
        diff: {
          type: 'object',
          description: 'Detailed difference analysis between the two entries',
          properties: {
            status: { type: 'string', enum: ['added', 'removed', 'modified', 'unchanged'] },
            oldValue: { description: 'Value at first ledger' },
            newValue: { description: 'Value at second ledger' },
            changes: { type: 'array', description: 'Detailed changes for nested values' },
          },
        },
        rpcMetadata: { type: 'object', description: 'RPC performance metrics' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid request parameters or comparison failed',
  })
  async compareStorage(@Body() dto: StorageCompareDto) {
    return await this.storageService.compareStorage(dto);
  }

  @Post('create-typed-key')
  @ApiOperation({
    summary: 'Create typed storage key XDR',
    description: 'Convert a typed key specification to XDR format for use in storage queries',
  })
  @ApiResponse({
    status: 200,
    description: 'Typed key converted to XDR successfully',
    schema: {
      type: 'object',
      properties: {
        xdr: { type: 'string', description: 'XDR representation of the typed key' },
        decoded: { description: 'Human-readable representation of the key' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid key type or value format',
  })
  async createTypedKey(@Body() dto: TypedKeyDto) {
    return await this.storageService.createTypedStorageKey(dto);
  }

  @Get('durability-info')
  @ApiOperation({
    summary: 'Get durability class information',
    description: 'Retrieve information about available storage durability classes and their characteristics',
  })
  @ApiResponse({
    status: 200,
    description: 'Durability information retrieved successfully',
    schema: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Description of the durability class' },
          expiry: { type: 'string', description: 'Expiry behavior for this durability class' },
        },
      },
    },
  })
  getDurabilityInfo() {
    return this.storageService.getDurabilityInfo();
  }
}