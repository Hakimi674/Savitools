import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../utils/validationMiddleware';
import { getMinReserve } from '../controllers/stellar/accountController';
import { getMinReserveSchema } from '../../validation/schemas/stellarSchemas';

const router = Router();

// Example of an existing route (if any)
// router.get('/some-existing-endpoint', authenticate, authorize(['user']), (req, res) => {
//   res.json({ message: 'Existing Stellar endpoint' });
// });

/**
 * @route GET /api/stellar/account/min-reserve
 * @description Calculates the minimum reserve required for a Stellar account.
 * @access Public (or authenticated based on middleware)
 * @queryParam baseReserve - The current base reserve value in XLM (e.g., 0.5).
 * @queryParam numTrustlines - The number of trustlines on the account.
 * @queryParam numSigners - The total number of signers on the account (including master key).
 * @queryParam numDataEntries - The number of data entries on the account.
 */
router.get(
  '/account/min-reserve',
  authenticate, // Apply authentication
  authorize(['user', 'admin']), // Apply authorization, adjust roles as needed
  validate(getMinReserveSchema, 'query'), // Validate query parameters
  getMinReserve
);

export default router;
