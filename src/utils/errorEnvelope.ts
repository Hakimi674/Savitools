import { Response } from 'express';

/**
 * Builds a standardized error response envelope.
 * @param statusCode HTTP status code.
 * @param message A human-readable message describing the error.
 * @param details Optional, additional details about the error (e.g., validation errors).
 * @returns An object conforming to the error envelope structure.
 */
export const buildErrorEnvelope = (statusCode: number, message: string, details?: any) => ({
  statusCode,
  message,
  details,
  timestamp: new Date().toISOString(),
});

/**
 * Builds a standardized success response envelope.
 * @param data The primary data payload of the response.
 * @param message Optional, a human-readable message describing the success.
 * @returns An object conforming to the success envelope structure.
 */
export const buildSuccessEnvelope = (data: any, message: string = 'Success') => ({
  statusCode: 200,
  message,
  data,
  timestamp: new Date().toISOString(),
});

/**
 * Sends an error response using the standardized envelope.
 * @param res Express response object.
 * @param statusCode HTTP status code.
 * @param message Error message.
 * @param details Optional error details.
 */
export const sendErrorResponse = (res: Response, statusCode: number, message: string, details?: any) => {
  res.status(statusCode).json(buildErrorEnvelope(statusCode, message, details));
};

/**
 * Sends a success response using the standardized envelope.
 * @param res Express response object.
 * @param data Data payload.
 * @param message Optional success message.
 */
export const sendSuccessResponse = (res: Response, data: any, message?: string) => {
  res.status(200).json(buildSuccessEnvelope(data, message));
};
