import { PlaygroundService, maskApiKey } from "./playground.service";
import { ApiKey, ApiKeyProvider } from "./entities/api-key.entity";

/**
 * The list endpoints used to decrypt every stored key — one AES-256-GCM
 * operation per key per request, plus a write for legacy rows — purely to render
 * a `first8...last4` mask. These tests pin the replacement contract
 * (Savitura/Savitools#293): the mask is computed when the plaintext is in hand
 * and served from storage afterwards.
 */
describe("PlaygroundService key masks (Savitura/Savitools#293)", () => {
  const PLAINTEXT = "sk_live_1234567890abcdef";
  const MASK = "sk_live_...cdef";

  let service: PlaygroundService;
  let apiKeysRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let encryptionService: {
    encryptForUser: jest.Mock;
    decryptForUser: jest.Mock;
  };

  function storedKey(overrides: Partial<ApiKey> = {}): ApiKey {
    return {
      id: "key-1",
      userId: "user-1",
      provider: ApiKeyProvider.FLUXA,
      label: "Prod",
      encryptedKey: "encrypted",
      iv: "iv",
      authTag: "authTag",
      keyVersion: 2,
      providerOrigin: null,
      openApiSpec: null,
      maskedKey: null,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      ...overrides,
    } as ApiKey;
  }

  beforeEach(() => {
    apiKeysRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((entity) => entity),
      save: jest.fn(async (entity) => ({
        ...entity,
        id: entity.id ?? "key-1",
        createdAt: entity.createdAt ?? new Date("2026-09-01T00:00:00Z"),
      })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const historyRepository = {
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const configService = { get: jest.fn(), getOrThrow: jest.fn() };
    const authService = { resolveKey: jest.fn() };
    encryptionService = {
      encryptForUser: jest.fn(() => ({
        encrypted: "encrypted",
        iv: "iv",
        authTag: "authTag",
      })),
      decryptForUser: jest.fn(async () => PLAINTEXT),
    };

    service = new PlaygroundService(
      apiKeysRepository as never,
      historyRepository as never,
      configService as never,
      authService as never,
      encryptionService as never,
    );
  });

  it("masks as first8...last4 of the plaintext", () => {
    expect(maskApiKey(PLAINTEXT)).toBe(MASK);
  });

  it("serves listKeys from the stored mask without decrypting anything", async () => {
    apiKeysRepository.find.mockResolvedValue([
      storedKey({ id: "key-1", maskedKey: MASK }),
      storedKey({ id: "key-2", label: "Test", maskedKey: "sk_test_...1234" }),
    ]);

    const keys = await service.listKeys("user-1");

    expect(keys.map((key) => key.maskedKey)).toEqual([MASK, "sk_test_...1234"]);
    expect(encryptionService.decryptForUser).not.toHaveBeenCalled();
    expect(apiKeysRepository.update).not.toHaveBeenCalled();
  });

  it("serves listProviders from the stored mask without decrypting anything", async () => {
    apiKeysRepository.find.mockResolvedValue([
      storedKey({ id: "key-1", maskedKey: MASK }),
    ]);

    const providers = await service.listProviders("user-1");

    expect(providers[0].maskedKey).toBe(MASK);
    expect(encryptionService.decryptForUser).not.toHaveBeenCalled();
    expect(apiKeysRepository.update).not.toHaveBeenCalled();
  });

  it("backfills a row with no mask once, then reads are decrypt-free", async () => {
    const legacy = storedKey({ id: "key-1", maskedKey: null });
    apiKeysRepository.find.mockResolvedValue([legacy]);

    const first = await service.listKeys("user-1");

    expect(first[0].maskedKey).toBe(MASK);
    expect(encryptionService.decryptForUser).toHaveBeenCalledTimes(1);
    expect(apiKeysRepository.update).toHaveBeenCalledWith("key-1", {
      maskedKey: MASK,
    });

    // The row now carries the mask: the next read decrypts nothing.
    legacy.maskedKey = MASK;
    encryptionService.decryptForUser.mockClear();
    apiKeysRepository.update.mockClear();

    const second = await service.listKeys("user-1");

    expect(second[0].maskedKey).toBe(MASK);
    expect(encryptionService.decryptForUser).not.toHaveBeenCalled();
    expect(apiKeysRepository.update).not.toHaveBeenCalled();
  });

  it("persists the mask together with the legacy re-encryption, in one write", async () => {
    jest
      .spyOn(
        service as unknown as { legacyDecrypt: () => string },
        "legacyDecrypt",
      )
      .mockReturnValue("sk_live_legacy123456");
    apiKeysRepository.find.mockResolvedValue([
      storedKey({ id: "key-1", keyVersion: 1, maskedKey: null }),
    ]);

    const keys = await service.listKeys("user-1");

    expect(keys[0].maskedKey).toBe("sk_live_...3456");
    expect(apiKeysRepository.update).toHaveBeenCalledTimes(1);
    expect(apiKeysRepository.update).toHaveBeenCalledWith(
      "key-1",
      expect.objectContaining({
        keyVersion: 2,
        maskedKey: "sk_live_...3456",
      }),
    );
  });

  it("stores the mask when a key is created", async () => {
    await service.saveKey("user-1", {
      provider: ApiKeyProvider.FLUXA,
      label: "Prod",
      apiKey: PLAINTEXT,
    } as never);

    expect(apiKeysRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ keyVersion: 2, maskedKey: MASK }),
    );
  });

  it("answers importProvider from the plaintext instead of decrypting the new row", async () => {
    const result = await service.importProvider("user-1", {
      name: "Custom",
      openApiJson: { openapi: "3.0.0", paths: {} },
      origin: "https://api.example.com",
      apiKey: PLAINTEXT,
    } as never);

    expect(result.maskedKey).toBe(MASK);
    expect(apiKeysRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ maskedKey: MASK }),
    );
    expect(encryptionService.decryptForUser).not.toHaveBeenCalled();
  });

  it("refreshes the mask when a key is replaced", async () => {
    apiKeysRepository.findOne.mockResolvedValue(
      storedKey({ id: "key-1", maskedKey: MASK }),
    );

    await service.updateKey("key-1", "user-1", {
      apiKey: "sk_live_newkey000000",
    } as never);

    expect(apiKeysRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ maskedKey: "sk_live_...0000" }),
    );
  });

  it("leaves the stored mask alone when only the label changes", async () => {
    apiKeysRepository.findOne.mockResolvedValue(
      storedKey({ id: "key-1", maskedKey: MASK }),
    );

    await service.updateKey("key-1", "user-1", { label: "Renamed" } as never);

    expect(apiKeysRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Renamed", maskedKey: MASK }),
    );
  });
});
