import { Request, Response } from 'express';
import { SorobanRpcConsole } from '../../services/soroban/rpcConsole';
import { errorEnvelope } from '../../utils/errorEnvelope';

const rpcConsole = new SorobanRpcConsole();

export const handleRpcConsole = async (req: Request, res: Response) => {
  try {
    const response = await rpcConsole.execute({
      method: req.body.method,
      params: req.body.params,
      tenantId: req.tenant.id,
      userId: req.user.id,
    });

    res.json(response);
  } catch (error) {
    const envelope = errorEnvelope.fromError(error);
    res.status(envelope.status).json(envelope);
  }
};