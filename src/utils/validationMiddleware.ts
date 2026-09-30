import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { buildErrorEnvelope } from './errorEnvelope';

/**
 * Middleware to validate request data against a Joi schema.
 * @param schema Joi schema to validate against.
 * @param target 'body', 'query', or 'params' to specify which part of the request to validate.
 * @returns Express middleware function.
 */
export const validate = (schema: Joi.ObjectSchema, target: 'body' | 'query' | 'params' = 'query') =>
  (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req[target], { abortEarly: false, allowUnknown: true });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.context?.key,
        message: detail.message,
      }));
      return res.status(400).json(buildErrorEnvelope(400, 'Validation Error', errors));
    }
    next();
  };
