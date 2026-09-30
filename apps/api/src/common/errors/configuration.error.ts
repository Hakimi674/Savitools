import { InternalServerErrorException } from '@nestjs/common';

/**
 * A deployment/configuration mistake found while a provider is being built, as
 * opposed to a malformed request.
 *
 * It extends a Nest HTTP exception so that it is rendered by `ApiExceptionFilter`
 * like every other failure instead of surfacing as an unbranded 500, and so
 * `instanceof HttpException` checks keep behaving the same way.
 */
export class ConfigurationError extends InternalServerErrorException {
  constructor(message: string) {
    super(message);
    this.name = ConfigurationError.name;
  }
}
