import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { EncryptionService } from './encryption.service';
import { ApiExceptionFilter } from './filters/api-exception.filter';
import { RequestIdInterceptor } from './interceptors/request-id.interceptor';

/**
 * Cross-cutting providers every module gets for free.
 *
 * `AppModule` is the only importer, so the APP_FILTER/APP_INTERCEPTOR tokens are
 * registered exactly once for the whole application.
 */
@Global()
@Module({
  providers: [
    EncryptionService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
  ],
  exports: [EncryptionService],
})
export class CommonModule {}
