import type { ValidationPipeOptions } from '@nestjs/common';

/**
 * The one ValidationPipe configuration the API boots with.
 *
 * Exported so `main.spec.ts` can exercise the pipe's real behaviour (rejecting
 * unknown properties, coercing query primitives, rejecting validator failures)
 * against the options the application actually uses, instead of asserting that
 * the text of `main.ts` contains a given string.
 */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
};
