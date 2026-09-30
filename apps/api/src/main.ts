import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  Logger,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { AppModule } from "./app.module";
import { enableGracefulShutdown } from "./config/graceful-shutdown";
import { parseWebOrigins } from "./config/web-origins";
import { VALIDATION_PIPE_OPTIONS } from "./config/validation-pipe.config";
import { WebSocketCorsAdapter } from "./config/websocket-cors.adapter";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  const config = app.get(ConfigService);
  const maxWasmFileSize = Number(config.get<string>('MAX_WASM_FILE_SIZE') ?? '5242880');
  const resolvedMaxWasmFileSize = Number.isFinite(maxWasmFileSize) && maxWasmFileSize > 0 ? maxWasmFileSize : 5 * 1024 * 1024;

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: resolvedMaxWasmFileSize } });

  const port = config.get<number>('API_PORT', 3001);
  const prefix = config.get<string>('API_PREFIX', 'api');
  // One allow-list for HTTP CORS, Socket.IO CORS and the gateway check.
  const webOrigins = parseWebOrigins(config.get<string>('WEB_ORIGIN'));
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  app.setGlobalPrefix(prefix, {
    exclude: [{ path: "metrics", method: RequestMethod.GET }],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.enableCors({
    origin: webOrigins,
    credentials: true,
  });
  app.useWebSocketAdapter(new WebSocketCorsAdapter(app, webOrigins));

  // The options live in config/validation-pipe.config.ts so they can be
  // exercised as behaviour by main.spec.ts.
  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));

  // Block GraphQL introspection in production
  if (nodeEnv === 'production') {
    /* eslint-disable @typescript-eslint/no-explicit-any -- raw Fastify instance and request/reply shapes are not worth typing here */
    const fastify = app.getHttpAdapter().getInstance() as any;
    fastify.addHook('preHandler', async (request: any, reply: any) => {
      const body = request.body;
      const rawQuery =
        (body && typeof body === 'object' && body.query) ||
        (typeof body === 'string' ? body : null) ||
        (request.query && request.query.query) ||
        null;

      if (
        typeof rawQuery === 'string' &&
        /\b___schema|__type\b/i.test(rawQuery)
      ) {
        await reply.code(400).send({
          errors: [{ message: 'GraphQL introspection is not allowed in production.' }],
        });
        return;
      }
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  // Only enable Swagger in development and staging environments
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("SaviTools API")
      .setDescription("Developer infrastructure for the Stellar ecosystem")
      .setVersion("1.0")
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${prefix}/docs`, app, document);
  }

  // Nest only registers its SIGTERM/SIGINT listeners when this is called, and
  // without it none of the OnModuleDestroy/OnApplicationShutdown hooks run on
  // container stop. Must happen before listen() so the handlers exist for the
  // whole lifetime of the process.
  enableGracefulShutdown(app);

  await app.listen(port, "0.0.0.0");
  console.log(`SaviTools API running on http://localhost:${port}/${prefix}`);
  console.log(`Swagger docs at http://localhost:${port}/${prefix}/docs`);
}

bootstrap().catch((error) => {
  new Logger("Bootstrap").error(
    `Savitools API failed to start: ${
      error instanceof Error ? error.message : String(error)
    }`,
    error instanceof Error ? error.stack : undefined,
  );
  process.exit(1);
});
