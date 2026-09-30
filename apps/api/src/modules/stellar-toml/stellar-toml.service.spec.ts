import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StellarTomlService } from './stellar-toml.service';

describe('StellarTomlService', () => {
  let service: StellarTomlService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StellarTomlService],
    }).compile();

    service = module.get<StellarTomlService>(StellarTomlService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parse', () => {
    it('should parse valid stellar.toml content', async () => {
      const content = `VERSION="2.0.0"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
FEDERATION_SERVER="https://api.example.com/federation"

[DOCUMENTATION]
ORG_NAME="Example Org"
ORG_URL="https://www.example.com"`;

      const result = await service.parse(content, false);

      expect(result.parsed.VERSION).toBe('2.0.0');
      expect(result.parsed.NETWORK_PASSPHRASE).toBe('Test SDF Network ; September 2015');
      expect(result.parsed.FEDERATION_SERVER).toBe('https://api.example.com/federation');
      expect(result.parsed.DOCUMENTATION?.ORG_NAME).toBe('Example Org');
      expect(result.isValid).toBe(true);
    });

    it('should parse CURRENCIES array', async () => {
      const content = `VERSION="2.0.0"

[[CURRENCIES]]
code="USD"
issuer="GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU"
display_decimals=2
name="US Dollar"

[[CURRENCIES]]
code="EUR"
issuer="GCKFBEIYTKP6JY4DOUCTNBQG2FWHUB7ETGJZ7RCDYA32U4E6T2WDDMWU"
display_decimals=2
name="Euro"`;

      const result = await service.parse(content, false);

      expect(result.parsed.CURRENCIES).toHaveLength(2);
      expect(result.parsed.CURRENCIES?.[0].code).toBe('USD');
      expect(result.parsed.CURRENCIES?.[1].code).toBe('EUR');
    });

    it('should throw BadRequestException for invalid TOML syntax', async () => {
      const invalidContent = `VERSION="2.0.0"
INVALID SYNTAX HERE
[DOCUMENTATION`;

      await expect(service.parse(invalidContent)).rejects.toThrow(BadRequestException);
    });

    it('should detect missing VERSION in strict mode', async () => {
      const content = `NETWORK_PASSPHRASE="Test SDF Network ; September 2015"`;

      const result = await service.parse(content, true);

      expect(result.isValid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            level: 'error',
            field: 'VERSION',
            message: 'VERSION field is required'
          })
        ])
      );
    });

    it('should warn about incorrect VERSION', async () => {
      const content = `VERSION="1.0.0"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"`;

      const result = await service.parse(content, true);

      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            level: 'warning',
            field: 'VERSION',
            message: expect.stringContaining('should be "2.0.0"')
          })
        ])
      );
    });

    it('should validate URLs are HTTPS', async () => {
      const content = `VERSION="2.0.0"
FEDERATION_SERVER="http://api.example.com/federation"`;

      const result = await service.parse(content, true);

      expect(result.isValid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            level: 'error',
            field: 'FEDERATION_SERVER',
            message: expect.stringContaining('HTTPS URL')
          })
        ])
      );
    });

    it('should validate currency issuer addresses', async () => {
      const content = `VERSION="2.0.0"

[[CURRENCIES]]
code="USD"
issuer="INVALID_ADDRESS"`;

      const result = await service.parse(content, true);

      expect(result.isValid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            level: 'error',
            field: 'CURRENCIES[0].issuer',
            message: expect.stringContaining('Invalid Stellar address')
          })
        ])
      );
    });

    it('should require currency code and issuer', async () => {
      const content = `VERSION="2.0.0"

[[CURRENCIES]]
name="US Dollar"`;

      const result = await service.parse(content, true);

      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'CURRENCIES[0].code'
          }),
          expect.objectContaining({
            field: 'CURRENCIES[0].issuer'
          })
        ])
      );
    });
  });

  describe('format', () => {
    it('should format valid stellar.toml content', async () => {
      const content = `VERSION="2.0.0"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"`;

      const formatted = await service.format(content);

      expect(formatted).toContain('VERSION = "2.0.0"');
      expect(formatted).toContain('NETWORK_PASSPHRASE');
    });

    it('should throw BadRequestException for invalid content', async () => {
      const invalidContent = `INVALID [ TOML`;

      await expect(service.format(invalidContent)).rejects.toThrow(BadRequestException);
    });

    it('should handle different indentation styles', async () => {
      const content = `VERSION="2.0.0"

[DOCUMENTATION]
ORG_NAME="Test"`;

      const withSpaces = await service.format(content, 'spaces', 4);
      const withTabs = await service.format(content, 'tabs');

      expect(withSpaces).toBeTruthy();
      expect(withTabs).toBeTruthy();
    });
  });

  describe('validate', () => {
    it('should validate correct stellar.toml', async () => {
      const content = `VERSION="2.0.0"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

[DOCUMENTATION]
ORG_NAME="Example"
ORG_URL="https://www.example.com"`;

      const result = await service.validate(content, 'basic', 'testnet');

      expect(result.isValid).toBe(true);
      expect(result.summary.errors).toBe(0);
    });

    it('should detect errors in basic validation', async () => {
      const content = `FEDERATION_SERVER="http://insecure.com"`;

      const result = await service.validate(content, 'basic');

      expect(result.isValid).toBe(false);
      expect(result.summary.errors).toBeGreaterThan(0);
    });

    it('should perform strict validation', async () => {
      const content = `VERSION="2.0.0"`;

      const result = await service.validate(content, 'strict', 'testnet');

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            level: 'warning'
          })
        ])
      );
    });

    it('should validate network passphrase matches network', async () => {
      const content = `VERSION="2.0.0"
NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"`;

      const result = await service.validate(content, 'strict', 'testnet');

      expect(result.isValid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            level: 'error',
            field: 'NETWORK_PASSPHRASE',
            message: expect.stringContaining("doesn't match testnet")
          })
        ])
      );
    });

    it('should handle parsing errors gracefully', async () => {
      const invalidContent = `INVALID TOML [[[`;

      const result = await service.validate(invalidContent);

      expect(result.isValid).toBe(false);
      expect(result.summary.errors).toBe(1);
      expect(result.issues[0].message).toContain('parsing failed');
    });

    it('should validate anchor service consistency', async () => {
      const content = `VERSION="2.0.0"
WEB_AUTH_ENDPOINT="https://api.example.com/auth"`;

      const result = await service.validate(content, 'strict');

      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            level: 'error',
            field: 'SIGNING_KEY',
            message: expect.stringContaining('required when WEB_AUTH_ENDPOINT')
          })
        ])
      );
    });

    it('should validate VALIDATORS array', async () => {
      const content = `VERSION="2.0.0"

[[VALIDATORS]]
ALIAS="validator1"
PUBLIC_KEY="INVALID_KEY"`;

      const result = await service.validate(content, 'basic');

      expect(result.isValid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'VALIDATORS[0].PUBLIC_KEY',
            message: expect.stringContaining('Invalid Stellar address')
          })
        ])
      );
    });
  });

  describe('getTemplate', () => {
    it('should generate minimal template', () => {
      const template = service.getTemplate('minimal');

      expect(template).toContain('VERSION="2.0.0"');
      expect(template).toContain('[DOCUMENTATION]');
      expect(template).toContain('ORG_NAME');
    });

    it('should generate anchor template', () => {
      const template = service.getTemplate('anchor');

      expect(template).toContain('VERSION="2.0.0"');
      expect(template).toContain('FEDERATION_SERVER');
      expect(template).toContain('AUTH_SERVER');
      expect(template).toContain('TRANSFER_SERVER');
      expect(template).toContain('[[CURRENCIES]]');
    });

    it('should generate issuer template', () => {
      const template = service.getTemplate('issuer');

      expect(template).toContain('VERSION="2.0.0"');
      expect(template).toContain('ACCOUNTS');
      expect(template).toContain('[[CURRENCIES]]');
    });

    it('should generate validator template', () => {
      const template = service.getTemplate('validator');

      expect(template).toContain('VERSION="2.0.0"');
      expect(template).toContain('[[VALIDATORS]]');
      expect(template).toContain('PUBLIC_KEY');
    });
  });
});
