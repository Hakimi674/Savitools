import express from 'express';
import { handleRpcConsole } from '../../controllers/soroban/rpcConsoleController';
import { authMiddleware } from '../../middleware/auth';
import { tenantMiddleware } from '../../middleware/tenant';

const router = express.Router();

router.post('/rpc/console', authMiddleware, tenantMiddleware, handleRpcConsole);

export default router;