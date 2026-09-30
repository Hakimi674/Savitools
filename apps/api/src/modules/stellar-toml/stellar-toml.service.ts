import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as TOML from 'smol-toml';

interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  field?: string;
  message: string;
  line?: number;
}

interface ParsedToml {
  VERSION?: string;
  NETWORK_PASSPHRASE?: string;
  FEDERATION_SERVER?: string;
  AUTH_SERVER?: string;
  TRANSFER_SERVER?: string;
  TRANSFER_SERVER_SEP0024?: string;
  KYC_SERVER?: string;
  WEB_AUTH_ENDPOINT?: string;
  SIGNING_KEY?: string;
  HORIZON_URL?: string;
  ACCOUNTS?: string[];
  URI_REQUEST_SIGNING_KEY?: string;
  DIRECT_PAYMENT_SERVER?: string;
  ANCHOR_QUOTE_SERVER?: string;
  DOCUMENTATION?: {
    ORG_NAME?: string;
    ORG_DBA?: string;
    ORG_URL?: string;
    ORG_LOGO?: string;
    ORG_DESCRIPTION?: string;
    ORG_PHYSICAL_ADDRESS?: string;
    ORG_PHYSICAL_ADDRESS_ATTESTATION?: string;
    ORG_PHONE_NUMBER?: string;
    ORG_PHONE_NUMBER_ATTESTATION?: string;
    ORG_KEYBASE?: string;
    ORG_TWITTER?: string;
    ORG_GITHUB?: string;
    ORG_OFFICIAL_EMAIL?: string;
    ORG_LICENSING_AUTHORITY?: string;
    ORG_LICENSE_TYPE?: string;
    ORG_LICENSE_NUMBER?: string;
  };
  PRINCIPALS?: Array<{
    name?: string;
    email?: string;
    keybase?: string;
    telegram?: string;
    twitter?: string;
    github?: string;
    id_photo_hash?: string;
    verification_photo_hash?: string;
  }>;
  CURRENCIES?: Array<{
    code?: string;
    issuer?: string;
    status?: string;
    display_decimals?: number;
    name?: string;
    desc?: string;
    conditions?: string;
    image?: string;
    fixed_number?: number;
    max_number?: number;
    is_unlimited?: boolean;
    is_asset_anchored?: boolean;
    anchor_asset_type?: string;
    anchor_asset?: string;
    attestation_of_reserve?: string;
    redemption_instructions?: string;
    collateral_addresses?: string[];
    collateral_address_messages?: string[];
    collateral_address_signatures?: string[];
    regulated?: boolean;
    approval_server?: string;
    approval_criteria?: string;
  }>;
  VALIDATORS?: Array<{
    ALIAS?: string;
    DISPLAY_NAME?: string;
    HOST?: string;
    PUBLIC_KEY?: string;
    HISTORY?: string;
  }>;
  [key: string]: any;
}

@Injectable()
export class StellarTomlService {
  private readonly logger = new Logger(StellarTomlService.name);

  /**
   * Parse and validate stellar.toml content
   */
  async parse(content: string, strict: boolean = true): Promise<{
    parsed: ParsedToml;
    issues: ValidationIssue[];
    isValid: boolean;
  }> {
    try {
      const parsed = TOML.parse(content) as ParsedToml;
      const issues = strict ? this.validateStrict(parsed) : this.validateBasic(parsed);
      
      return {
        parsed,
        issues,
        isValid: !issues.some(issue => issue.level === 'error')
      };
    } catch (error) {
      this.logger.error(`Failed to parse TOML: ${error.message}`);
      throw new BadRequestException({
        message: 'Invalid TOML syntax',
        error: error.message,
        details: this.extractTomlError(error)
      });
    }
  }

  /**
   * Format stellar.toml content
   */
  async format(
    content: string,
    indent: 'spaces' | 'tabs' = 'spaces',
    indentSize: number = 2
  ): Promise<string> {
    try {
      const parsed = TOML.parse(content);
      
      // Convert back to TOML with formatting
      const formatted = TOML.stringify(parsed);
      
      // Apply indentation preferences
      if (indent === 'tabs') {
        return formatted.replace(/^  /gm, '\t');
      } else if (indentSize !== 2) {
        const spaces = ' '.repeat(indentSize);
        return formatted.replace(/^  /gm, spaces);
      }
      
      return formatted;
    } catch (error) {
      this.logger.error(`Failed to format TOML: ${error.message}`);
      throw new BadRequestException({
        message: 'Invalid TOML content - cannot format',
        error: error.message
      });
    }
  }

  /**
   * Validate stellar.toml content against SEP-1
   */
  async validate(
    content: string,
    level: 'basic' | 'strict' = 'basic',
    network: 'testnet' | 'mainnet' = 'testnet'
  ): Promise<{
    isValid: boolean;
    issues: ValidationIssue[];
    summary: {
      errors: number;
      warnings: number;
      infos: number;
    };
  }> {
    try {
      const parsed = TOML.parse(content) as ParsedToml;
      const issues = level === 'strict' 
        ? this.validateStrict(parsed, network)
        : this.validateBasic(parsed);

      const summary = {
        errors: issues.filter(i => i.level === 'error').length,
        warnings: issues.filter(i => i.level === 'warning').length,
        infos: issues.filter(i => i.level === 'info').length
      };

      return {
        isValid: summary.errors === 0,
        issues,
        summary
      };
    } catch (error) {
      return {
        isValid: false,
        issues: [{
          level: 'error',
          message: `TOML parsing failed: ${error.message}`
        }],
        summary: { errors: 1, warnings: 0, infos: 0 }
      };
    }
  }

  /**
   * Get a template stellar.toml file
   */
  getTemplate(type: 'minimal' | 'anchor' | 'issuer' | 'validator' = 'minimal'): string {
    const templates = {
      minimal: `# Basic stellar.toml configuration
VERSION="2.0.0"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

[DOCUMENTATION]
ORG_NAME="Your Organization"
ORG_URL="https://www.example.com"
ORG_DESCRIPTION="Description of your organization"`,

      anchor: `# Anchor service stellar.toml configuration
VERSION="2.0.0"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
FEDERATION_SERVER="https://api.example.com/federation"
AUTH_SERVER="https://api.example.com/auth"
TRANSFER_SERVER="https://api.example.com/transfer"
TRANSFER_SERVER_SEP0024="https://api.example.com/sep24"
KYC_SERVER="https://api.example.com/kyc"
WEB_AUTH_ENDPOINT="https://api.example.com/auth"
SIGNING_KEY="GABC..."

[DOCUMENTATION]
ORG_NAME="Example Anchor"
ORG_URL="https://www.example.com"
ORG_LOGO="https://www.example.com/logo.png"
ORG_DESCRIPTION="A Stellar anchor providing fiat on/off ramps"
ORG_OFFICIAL_EMAIL="support@example.com"

[[CURRENCIES]]
code="USD"
issuer="GABC..."
status="live"
display_decimals=2
name="US Dollar"
desc="United States Dollar issued by Example Anchor"
is_asset_anchored=true
anchor_asset_type="fiat"
anchor_asset="USD"`,

      issuer: `# Asset issuer stellar.toml configuration
VERSION="2.0.0"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
ACCOUNTS=["GABC..."]

[DOCUMENTATION]
ORG_NAME="Example Issuer"
ORG_URL="https://www.example.com"
ORG_LOGO="https://www.example.com/logo.png"
ORG_DESCRIPTION="Digital asset issuer on Stellar"
ORG_OFFICIAL_EMAIL="issuer@example.com"

[[CURRENCIES]]
code="XYZ"
issuer="GABC..."
status="live"
display_decimals=7
name="Example Token"
desc="A custom token on the Stellar network"
image="https://www.example.com/token-logo.png"
conditions="Terms and conditions at https://www.example.com/terms"`,

      validator: `# Validator stellar.toml configuration
VERSION="2.0.0"
NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"

[DOCUMENTATION]
ORG_NAME="Example Validator"
ORG_URL="https://www.example.com"
ORG_DESCRIPTION="Stellar network validator"

[[VALIDATORS]]
ALIAS="example-validator"
DISPLAY_NAME="Example Validator"
HOST="validator.example.com:11625"
PUBLIC_KEY="GABC..."
HISTORY="https://history.example.com"`
    };

    return templates[type];
  }

  /**
   * Basic validation - checks for required fields and basic structure
   */
  private validateBasic(parsed: ParsedToml): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check VERSION
    if (!parsed.VERSION) {
      issues.push({
        level: 'error',
        field: 'VERSION',
        message: 'VERSION field is required'
      });
    } else if (parsed.VERSION !== '2.0.0') {
      issues.push({
        level: 'warning',
        field: 'VERSION',
        message: `VERSION should be "2.0.0", found "${parsed.VERSION}"`
      });
    }

    // Check NETWORK_PASSPHRASE
    if (!parsed.NETWORK_PASSPHRASE) {
      issues.push({
        level: 'warning',
        field: 'NETWORK_PASSPHRASE',
        message: 'NETWORK_PASSPHRASE is recommended for clarity'
      });
    }

    // Validate URLs if present
    const urlFields = [
      'FEDERATION_SERVER', 'AUTH_SERVER', 'TRANSFER_SERVER',
      'TRANSFER_SERVER_SEP0024', 'KYC_SERVER', 'WEB_AUTH_ENDPOINT',
      'HORIZON_URL', 'DIRECT_PAYMENT_SERVER', 'ANCHOR_QUOTE_SERVER'
    ];

    for (const field of urlFields) {
      if (parsed[field] && !this.isValidUrl(parsed[field] as string)) {
        issues.push({
          level: 'error',
          field,
          message: `${field} must be a valid HTTPS URL`
        });
      }
    }

    // Validate CURRENCIES array
    if (parsed.CURRENCIES) {
      if (!Array.isArray(parsed.CURRENCIES)) {
        issues.push({
          level: 'error',
          field: 'CURRENCIES',
          message: 'CURRENCIES must be an array'
        });
      } else {
        parsed.CURRENCIES.forEach((currency, index) => {
          if (!currency.code) {
            issues.push({
              level: 'error',
              field: `CURRENCIES[${index}].code`,
              message: 'Currency code is required'
            });
          }
          if (!currency.issuer) {
            issues.push({
              level: 'error',
              field: `CURRENCIES[${index}].issuer`,
              message: 'Currency issuer is required'
            });
          } else if (!this.isValidStellarAddress(currency.issuer)) {
            issues.push({
              level: 'error',
              field: `CURRENCIES[${index}].issuer`,
              message: 'Invalid Stellar address format'
            });
          }
        });
      }
    }

    // Validate VALIDATORS array
    if (parsed.VALIDATORS) {
      if (!Array.isArray(parsed.VALIDATORS)) {
        issues.push({
          level: 'error',
          field: 'VALIDATORS',
          message: 'VALIDATORS must be an array'
        });
      } else {
        parsed.VALIDATORS.forEach((validator, index) => {
          if (!validator.PUBLIC_KEY) {
            issues.push({
              level: 'error',
              field: `VALIDATORS[${index}].PUBLIC_KEY`,
              message: 'Validator PUBLIC_KEY is required'
            });
          } else if (!this.isValidStellarAddress(validator.PUBLIC_KEY)) {
            issues.push({
              level: 'error',
              field: `VALIDATORS[${index}].PUBLIC_KEY`,
              message: 'Invalid Stellar address format'
            });
          }
        });
      }
    }

    return issues;
  }

  /**
   * Strict validation - comprehensive SEP-1 compliance check
   */
  private validateStrict(parsed: ParsedToml, network?: 'testnet' | 'mainnet'): ValidationIssue[] {
    const issues = this.validateBasic(parsed);

    // Check DOCUMENTATION section
    if (!parsed.DOCUMENTATION) {
      issues.push({
        level: 'warning',
        field: 'DOCUMENTATION',
        message: 'DOCUMENTATION section is recommended for discoverability'
      });
    } else {
      const doc = parsed.DOCUMENTATION;
      
      if (!doc.ORG_NAME) {
        issues.push({
          level: 'warning',
          field: 'DOCUMENTATION.ORG_NAME',
          message: 'Organization name is recommended'
        });
      }

      if (!doc.ORG_URL) {
        issues.push({
          level: 'warning',
          field: 'DOCUMENTATION.ORG_URL',
          message: 'Organization URL is recommended'
        });
      } else if (!this.isValidUrl(doc.ORG_URL)) {
        issues.push({
          level: 'error',
          field: 'DOCUMENTATION.ORG_URL',
          message: 'ORG_URL must be a valid HTTPS URL'
        });
      }

      if (!doc.ORG_OFFICIAL_EMAIL) {
        issues.push({
          level: 'info',
          field: 'DOCUMENTATION.ORG_OFFICIAL_EMAIL',
          message: 'Official email is recommended for support'
        });
      }
    }

    // Check network passphrase matches expected network
    if (network && parsed.NETWORK_PASSPHRASE) {
      const expectedPassphrase = network === 'mainnet'
        ? 'Public Global Stellar Network ; September 2015'
        : 'Test SDF Network ; September 2015';
      
      if (parsed.NETWORK_PASSPHRASE !== expectedPassphrase) {
        issues.push({
          level: 'error',
          field: 'NETWORK_PASSPHRASE',
          message: `NETWORK_PASSPHRASE doesn't match ${network} network`
        });
      }
    }

    // Validate PRINCIPALS array
    if (parsed.PRINCIPALS) {
      if (!Array.isArray(parsed.PRINCIPALS)) {
        issues.push({
          level: 'error',
          field: 'PRINCIPALS',
          message: 'PRINCIPALS must be an array'
        });
      } else {
        parsed.PRINCIPALS.forEach((principal, index) => {
          if (!principal.name && !principal.email) {
            issues.push({
              level: 'warning',
              field: `PRINCIPALS[${index}]`,
              message: 'Principal should have at least name or email'
            });
          }
        });
      }
    }

    // Check for anchor-specific fields consistency
    const hasAnchorEndpoints = !!(
      parsed.AUTH_SERVER ||
      parsed.TRANSFER_SERVER ||
      parsed.KYC_SERVER
    );

    if (hasAnchorEndpoints && !parsed.SIGNING_KEY) {
      issues.push({
        level: 'warning',
        field: 'SIGNING_KEY',
        message: 'SIGNING_KEY is recommended for anchor services'
      });
    }

    if (parsed.WEB_AUTH_ENDPOINT && !parsed.SIGNING_KEY) {
      issues.push({
        level: 'error',
        field: 'SIGNING_KEY',
        message: 'SIGNING_KEY is required when WEB_AUTH_ENDPOINT is specified'
      });
    }

    return issues;
  }

  /**
   * Validate URL format (must be HTTPS)
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Validate Stellar address format (basic check)
   */
  private isValidStellarAddress(address: string): boolean {
    // Basic validation: starts with G, 56 characters long
    return /^G[A-Z2-7]{55}$/.test(address);
  }

  /**
   * Extract meaningful error information from TOML parsing errors
   */
  private extractTomlError(error: any): { line?: number; column?: number; message: string } {
    return {
      line: error.line,
      column: error.column,
      message: error.message || 'Unknown parsing error'
    };
  }
}
