import { z } from 'zod';
import { SorobanRpc } from '@stellar/stellar-sdk';
import { validateRequest } from '../../middleware/validation';
import { auditLogger } from '../../utils/auditLogger';
import { errorEnvelope } from '../../utils/errorEnvelope';
import { config } from '../../config';

const rpcConsoleSchema = z.object({
  method: z.string().min(1),
  params: z.record(z.unknown()).optional(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
});

type RpcConsoleRequest = z.infer<typeof rpcConsoleSchema>;

export class SorobanRpcConsole {
  private rpcUrl: string;

  constructor() {
    this.rpcUrl = config.soroban.rpcUrl;
  }

  async execute(request: RpcConsoleRequest): Promise<SorobanRpc.Api.Response> {
    const validation = validateRequest(request, rpcConsoleSchema);
    if (!validation.valid) {
      throw errorEnvelope.invalidRequest(validation.errors);
    }

    const audit = auditLogger.create(request.tenantId, request.userId);
    audit.log('soroban_rpc_console_start', { method: request.method });

    try {
      const client = new SorobanRpc.Server(this.rpcUrl);
      const response = await this.executeMethod(client, request.method, request.params);

      audit.log('soroban_rpc_console_success', { method: request.method });
      return response;
    } catch (error) {
      audit.log('soroban_rpc_console_failure', { method: request.method, error: error.message });
      throw errorEnvelope.internalError('Soroban RPC execution failed');
    }
  }

  private async executeMethod(
    client: SorobanRpc.Server,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<SorobanRpc.Api.Response> {
    switch (method) {
      case 'getHealth':
        return client.getHealth();
      case 'getLatestLedger':
        return client.getLatestLedger();
      case 'simulateTransaction':
        if (!params?.transaction) {
          throw new Error('Transaction parameter required for simulateTransaction');
        }
        return client.simulateTransaction(params.transaction as string);
      default:
        throw new Error(`Unsupported RPC method: ${method}`);
    }
  }
}