import { Controller, Post, Req } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import type { FastifyRequest } from "fastify";
import { AuthController, clientAddress } from "./auth.controller";
import { AuthService } from "./auth.service";

/** Echoes the address the limiter would key on, over a real Fastify server. */
@Controller("probe")
class ProbeController {
  @Post("forgot-password")
  probe(@Req() req: FastifyRequest) {
    return { address: clientAddress(req) };
  }
}

describe("clientAddress (Savitura/Savitools#297)", () => {
  function makeRequest(ip: string, forwarded?: string): FastifyRequest {
    return {
      ip,
      headers: forwarded ? { "x-forwarded-for": forwarded } : {},
    } as unknown as FastifyRequest;
  }

  it("uses the socket address and never a caller-supplied X-Forwarded-For", () => {
    expect(clientAddress(makeRequest("10.0.0.5", "203.0.113.7"))).toBe(
      "10.0.0.5",
    );
    expect(
      clientAddress(makeRequest("10.0.0.5", "203.0.113.7, 198.51.100.9")),
    ).toBe("10.0.0.5");
  });

  it("keys the password-reset limit on the socket address across rotated headers", async () => {
    const requestPasswordReset = jest
      .fn()
      .mockResolvedValue({ message: "generic" });
    const controller = new AuthController(
      { requestPasswordReset } as unknown as AuthService,
      {} as never,
      {} as never,
    );
    const dto = { email: "user@example.com" } as never;

    await controller.forgotPassword(
      dto,
      makeRequest("10.0.0.5", "203.0.113.7"),
    );
    await controller.forgotPassword(
      dto,
      makeRequest("10.0.0.5", "198.51.100.9"),
    );

    const keys = requestPasswordReset.mock.calls.map((call) => call[1]);
    // One bucket, not one per header value: the second call cannot buy a fresh
    // allowance by rotating X-Forwarded-For.
    expect(new Set(keys).size).toBe(1);
    expect(keys).toEqual(["10.0.0.5", "10.0.0.5"]);
  });

  describe("over HTTP", () => {
    let app: NestFastifyApplication;

    beforeEach(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [ProbeController],
      }).compile();

      app = moduleRef.createNestApplication<NestFastifyApplication>(
        new FastifyAdapter(),
      );
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it("returns the same address for two different X-Forwarded-For values", async () => {
      const spoofed = ["203.0.113.7", "198.51.100.9"];
      const addresses: string[] = [];

      for (const forwarded of spoofed) {
        const response = await app.inject({
          method: "POST",
          url: "/probe/forgot-password",
          headers: { "x-forwarded-for": forwarded },
        });

        expect(response.statusCode).toBe(201);
        addresses.push(response.json().address as string);
      }

      expect(addresses[0]).toBe(addresses[1]);
      expect(spoofed).not.toContain(addresses[0]);
    });
  });
});
