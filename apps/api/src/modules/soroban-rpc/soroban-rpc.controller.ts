import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ExecuteSorobanRpcDto } from './dto/execute-soroban-rpc.dto';
import { SorobanRpcService } from './soroban-rpc.service';

@ApiTags('soroban-rpc')
@Controller('soroban-rpc')
export class SorobanRpcController {
  constructor(private readonly sorobanRpc: SorobanRpcService) {}

  @Get('methods')
  @ApiOperation({
    summary: 'List the whitelisted read-only Soroban RPC methods',
    description:
      'Returns every method the console can call together with its parameter schema, so the UI can render schema-aware inputs.',
  })
  listMethods() {
    return this.sorobanRpc.listMethods();
  }

  @Get('methods/:method')
  @ApiOperation({ summary: 'Describe a single Soroban RPC method' })
  @ApiParam({
    name: 'method',
    description: 'Method name, e.g. getLatestLedger',
    example: 'getLatestLedger',
  })
  getMethod(@Param('method') method: string) {
    return this.sorobanRpc.getMethod(method);
  }

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Invoke a whitelisted Soroban RPC method',
    description:
      'Validates the named parameters against the method schema, forwards one JSON-RPC request to the configured endpoint, and returns either the JSON-RPC result or the JSON-RPC error object. Write methods such as sendTransaction are not exposed.',
  })
  execute(@Body() dto: ExecuteSorobanRpcDto) {
    return this.sorobanRpc.execute({
      method: dto.method,
      params: dto.params,
      network: dto.network,
    });
  }
}
