import { Module, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./modules/auth/auth.module";
import { PlaygroundModule } from "./modules/playground/playground.module";
import { WorkspaceModule } from "./modules/workspace/workspace.module";
import { MonitorModule } from "./modules/monitor/monitor.module";
import { SdkgenModule } from "./modules/sdkgen/sdkgen.module";
import { ContractsModule } from "./modules/contracts/contracts.module";
import { NetworkModule } from "./modules/network/network.module";
import { StellarTestnetModule } from "./modules/stellar/stellar-testnet.module";
import { WalletModule } from "./modules/wallet/wallet.module";
import { SandboxModule } from "./modules/sandbox/sandbox.module";
import { SimulatorModule } from "./modules/simulator/simulator.module";
import { WebhookModule } from "./modules/webhook/webhook.module";
import { ComposerModule } from "./modules/composer/composer.module";
import { InspectorModule } from "./modules/inspector/inspector.module";
import { TransactionModule } from "./modules/transaction/transaction.module";
import { FederationModule } from "./modules/federation/federation.module";
import { MetricsModule } from "./modules/metrics/metrics.module";
import { Sep10Module } from "./modules/sep10/sep10.module";
import { SorobanStorageModule } from "./modules/soroban-storage/soroban-storage.module";
import { StellarTomlModule } from "./modules/stellar-toml/stellar-toml.module";
import { SequencePlannerModule } from "./modules/sequence-planner/sequence-planner.module";
import { SorobanRpcModule } from "./modules/soroban-rpc/soroban-rpc.module";
import { LiquidityPoolsModule } from "./modules/liquidity-pools/liquidity-pools.module";
import { DataSource } from "typeorm";
import { ALL_ENTITIES, ALL_MIGRATIONS } from "./database/database.registry";
import { validateEnvironment } from "./config/env-validation";
import { CommonModule } from "./common/common.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Tests boot modules with mocked config, so skip startup validation there.
      validate: process.env.NODE_ENV === "test" ? undefined : validateEnvironment,
    }),
ThrottlerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => [
    {
      ttl: config.get<number>("THROTTLE_TTL", 60000),
      limit: config.get<number>("THROTTLE_LIMIT", 100),
      skipIf: (context) => {
        const request = context.switchToHttp().getRequest();
        return request.method === "OPTIONS";
      },
    },
  ],
}),
    

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        url: config.get<string>("DATABASE_URL"),
        entities: ALL_ENTITIES,
        synchronize: config.get<string>("NODE_ENV") !== "production",
        // Same canonical list the CLI data source consumes; see
        // database/database.registry.ts.
        migrations: ALL_MIGRATIONS,
        migrationsRun: config.get<string>("RUN_MIGRATIONS") === "true",
        logging: config.get<string>("NODE_ENV") === "development",
      }),
    }),

    CommonModule,
    AuthModule,
    StellarTestnetModule,
    WalletModule,
    SandboxModule,
    PlaygroundModule,
    WorkspaceModule,
    MonitorModule,
    SdkgenModule,
    ContractsModule,
    NetworkModule,
    SimulatorModule,
    WebhookModule,
    ComposerModule,
    InspectorModule,
    TransactionModule,
    FederationModule,
    MetricsModule,
    Sep10Module,
    SorobanStorageModule,
    StellarTomlModule,
    SequencePlannerModule,
    SorobanRpcModule,
    LiquidityPoolsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(AppModule.name);

  constructor(
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const isProduction =
      this.configService.get<string>("NODE_ENV") === "production";
    const autoRun = this.configService.get<string>("RUN_MIGRATIONS") === "true";

    // Fail fast in production if migrations are behind and auto-run is not enabled
    if (isProduction && !autoRun) {
      const hasPending = await this.dataSource.showMigrations();
      if (hasPending) {
        this.logger.error(
          "Pending migrations detected in production. Failing fast.",
        );
        process.exit(1);
      }
    }
  }
}
