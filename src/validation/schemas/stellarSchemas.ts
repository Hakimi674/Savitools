import Joi from 'joi';

/**
 * Joi schema for validating input parameters for the Stellar account minimum reserve calculation.
 */
export const getMinReserveSchema = Joi.object({
  baseReserve: Joi.number()
    .min(0.0000001) // Stellar base reserve is typically 0.5 XLM, but can be configured. Min value > 0.
    .required()
    .messages({
      'number.base': 'Base reserve must be a number.',
      'number.min': 'Base reserve must be a positive number.',
      'any.required': 'Base reserve is required.',
    }),
  numTrustlines: Joi.number()
    .integer()
    .min(0)
    .required()
    .messages({
      'number.base': 'Number of trustlines must be an integer.',
      'number.integer': 'Number of trustlines must be an integer.',
      'number.min': 'Number of trustlines cannot be negative.',
      'any.required': 'Number of trustlines is required.',
    }),
  numSigners: Joi.number()
    .integer()
    .min(1) // An account always has at least one signer (master key)
    .required()
    .messages({
      'number.base': 'Number of signers must be an integer.',
      'number.integer': 'Number of signers must be an integer.',
      'number.min': 'Number of signers must be at least 1 (for the master key).',
      'any.required': 'Number of signers is required.',
    }),
  numDataEntries: Joi.number()
    .integer()
    .min(0)
    .required()
    .messages({
      'number.base': 'Number of data entries must be an integer.',
      'number.integer': 'Number of data entries must be an integer.',
      'number.min': 'Number of data entries cannot be negative.',
      'any.required': 'Number of data entries is required.',
    }),
});
