import { Request, Response, NextFunction } from 'express';
import { calculateMinReserve } from '../../services/stellar/accountService';
import { sendSuccessResponse, sendErrorResponse } from '../../utils/errorEnvelope';

/**
 * Handles the request to calculate the minimum reserve for a Stellar account.
 * Expects query parameters: baseReserve, numTrustlines, numSigners, numDataEntries.
 */
export const getMinReserve = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baseReserve, numTrustlines, numSigners, numDataEntries } = req.query;

    // Parameters are already validated by validationMiddleware, so we can cast directly.
    const minReserve = calculateMinReserve(
      parseFloat(baseReserve as string),
      parseInt(numTrustlines as string, 10),
      parseInt(numSigners as string, 10),
      parseInt(numDataEntries as string, 10)
    );

    sendSuccessResponse(res, { minReserve: minReserve }, 'Stellar account minimum reserve calculated successfully.');
  } catch (error) {
    // Pass unexpected errors to the next middleware (global error handler)
    next(error);
  }
};
