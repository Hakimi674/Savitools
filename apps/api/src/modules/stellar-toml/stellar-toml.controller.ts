import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { StellarTomlService } from './stellar-toml.service';
import {
  StellarTomlParseDto,
  StellarTomlFormatDto,
  StellarTomlValidateDto
} from './dto/stellar-toml-parse.dto';

@ApiTags('stellar-toml')
@Controller('stellar-toml')
export class StellarTomlController {
  private readonly logger = new Logger(StellarTomlController.name);

  constructor(private readonly stellarTomlService: StellarTomlService) {}

  @Post('parse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Parse and validate stellar.toml content',
    description: 'Parses stellar.toml TOML content and validates it according to SEP-1 standards'
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully parsed stellar.toml content',
    schema: {
      example: {
        parsed: {
          VERSION: '2.0.0',
          NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
          DOCUMENTATION: {
            ORG_NAME: 'Example Org'
          }
        },
        issues: [
          {
            level: 'warning',
            field: 'FEDERATION_SERVER',
            message: 'FEDERATION_SERVER is recommended for discoverability'
          }
        ],
        isValid: true
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid TOML syntax or content'
  })
  async parse(@Body() dto: StellarTomlParseDto) {
    this.logger.log('Parsing stellar.toml content');
    return this.stellarTomlService.parse(dto.content, dto.strict);
  }

  @Post('format')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Format stellar.toml content',
    description: 'Formats stellar.toml content with proper indentation and structure'
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully formatted stellar.toml content',
    schema: {
      example: {
        formatted: 'VERSION="2.0.0"\nNETWORK_PASSPHRASE="Test SDF Network ; September 2015"\n'
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid TOML content'
  })
  async format(@Body() dto: StellarTomlFormatDto) {
    this.logger.log('Formatting stellar.toml content');
    const formatted = await this.stellarTomlService.format(
      dto.content,
      dto.indent,
      dto.indentSize
    );
    return { formatted };
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate stellar.toml content',
    description: 'Validates stellar.toml content against SEP-1 specifications'
  })
  @ApiResponse({
    status: 200,
    description: 'Validation results',
    schema: {
      example: {
        isValid: true,
        issues: [],
        summary: {
          errors: 0,
          warnings: 1,
          infos: 2
        }
      }
    }
  })
  async validate(@Body() dto: StellarTomlValidateDto) {
    this.logger.log(`Validating stellar.toml content (level: ${dto.level}, network: ${dto.network})`);
    return this.stellarTomlService.validate(dto.content, dto.level, dto.network);
  }

  @Get('template')
  @ApiOperation({
    summary: 'Get a stellar.toml template',
    description: 'Returns a template stellar.toml file for different use cases'
  })
  @ApiQuery({
    name: 'type',
    enum: ['minimal', 'anchor', 'issuer', 'validator'],
    required: false,
    description: 'Type of template to generate'
  })
  @ApiResponse({
    status: 200,
    description: 'Template content',
    schema: {
      example: {
        template: 'VERSION="2.0.0"\nNETWORK_PASSPHRASE="Test SDF Network ; September 2015"\n...'
      }
    }
  })
  getTemplate(
    @Query('type') type: 'minimal' | 'anchor' | 'issuer' | 'validator' = 'minimal'
  ) {
    this.logger.log(`Generating ${type} template`);
    const template = this.stellarTomlService.getTemplate(type);
    return { template };
  }
}
