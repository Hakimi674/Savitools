# New Features Documentation

This document provides comprehensive documentation for the newly implemented features in Savitools.

## Table of Contents

1. [SEP-10 Web Authentication Debugger](#sep-10-web-authentication-debugger)
2. [Soroban Contract Storage Explorer](#soroban-contract-storage-explorer)
3. [Stellar.toml Editor, Linter, and Preview](#stellartoml-editor-linter-and-preview)
4. [Stellar Sequence Number Planner](#stellar-sequence-number-planner)

---

## SEP-10 Web Authentication Debugger

**Issue**: #342  
**API Endpoint**: `/api/sep10`  
**Frontend Route**: `/sep10`

### Overview

The SEP-10 debugger helps developers test and debug SEP-10 Web Authentication flows. It provides tools to fetch, validate, sign challenges, and exchange tokens with anchor services.

### Features

- **Fetch Challenge**: Request authentication challenges from SEP-10 servers
- **Validate Challenge**: Verify challenge structure and signatures
- **Sign Challenge**: Sign challenges with test keypairs
- **Token Exchange**: Exchange signed challenges for JWT tokens

### API Endpoints

#### POST /api/sep10/fetch-challenge

Fetches an authentication challenge from a SEP-10 server.

**Request Body**:
```json
{
  "webAuthEndpoint": "https://testanchor.stellar.org/auth",
  "clientAccountId": "GABC...",
  "homeDomain": "testanchor.stellar.org",
  "clientDomain": "example.com"
}
```

**Response**:
```json
{
  "transaction": "AAAAAgAAAA...",
  "network_passphrase": "Test SDF Network ; September 2015",
  "parsed": {
    "source": "GABC...",
    "sequence": "0",
    "timeBounds": {
      "minTime": "1234567890",
      "maxTime": "1234567990"
    }
  }
}
```

#### POST /api/sep10/validate-challenge

Validates a SEP-10 challenge transaction.

**Request Body**:
```json
{
  "challengeXdr": "AAAAAgAAAA...",
  "serverSigningKey": "GABC...",
  "network": "testnet"
}
```

**Response**:
```json
{
  "isValid": true,
  "clientAccountId": "GABC...",
  "matchedHomeDomain": "testanchor.stellar.org",
  "timeBounds": {
    "minTime": "1234567890",
    "maxTime": "1234567990",
    "isValid": true
  },
  "memo": null,
  "issues": []
}
```

#### POST /api/sep10/sign-challenge

Signs a challenge transaction with a keypair.

**Request Body**:
```json
{
  "challengeXdr": "AAAAAgAAAA...",
  "signerSecretKey": "SABC...",
  "network": "testnet"
}
```

**Response**:
```json
{
  "signedTransaction": "AAAAAgAAAA..."
}
```

#### POST /api/sep10/token-exchange

Exchanges a signed challenge for a JWT token.

**Request Body**:
```json
{
  "webAuthEndpoint": "https://testanchor.stellar.org/auth",
  "signedChallengeXdr": "AAAAAgAAAA..."
}
```

**Response**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Security Features

- All secret keys are redacted from logs and responses
- Comprehensive validation of challenge structure
- Time bounds validation
- Signature verification
- Network passphrase validation

### Usage Example

```typescript
// 1. Fetch challenge
const challenge = await fetch('/api/sep10/fetch-challenge', {
  method: 'POST',
  body: JSON.stringify({
    webAuthEndpoint: 'https://testanchor.stellar.org/auth',
    clientAccountId: 'GABC...',
    homeDomain: 'testanchor.stellar.org'
  })
});

// 2. Sign challenge
const signed = await fetch('/api/sep10/sign-challenge', {
  method: 'POST',
  body: JSON.stringify({
    challengeXdr: challenge.transaction,
    signerSecretKey: 'SABC...',
    network: 'testnet'
  })
});

// 3. Exchange for token
const token = await fetch('/api/sep10/token-exchange', {
  method: 'POST',
  body: JSON.stringify({
    webAuthEndpoint: 'https://testanchor.stellar.org/auth',
    signedChallengeXdr: signed.signedTransaction
  })
});
```

---

## Soroban Contract Storage Explorer

**Issue**: #343  
**API Endpoint**: `/api/soroban-storage`  
**Frontend Route**: `/soroban-storage`

### Overview

The Soroban Storage Explorer allows developers to query, compare, and inspect contract storage on Stellar's Soroban smart contract platform.

### Features

- **Query Storage**: Retrieve contract storage entries by key
- **Compare Storage**: Compare storage between two contracts or networks
- **Typed Keys**: Generate properly typed storage keys for complex types

### API Endpoints

#### POST /api/soroban-storage/query

Queries contract storage for a specific key.

**Request Body**:
```json
{
  "contractId": "CABC...",
  "key": "balance",
  "network": "testnet",
  "keyType": "symbol"
}
```

**Response**:
```json
{
  "key": "balance",
  "value": {
    "type": "u128",
    "value": "1000000"
  },
  "lastModified": 12345,
  "ttl": 5184000
}
```

#### POST /api/soroban-storage/compare

Compares storage between two contracts.

**Request Body**:
```json
{
  "contractId1": "CABC...",
  "contractId2": "CDEF...",
  "key": "balance",
  "network": "testnet"
}
```

**Response**:
```json
{
  "key": "balance",
  "contract1": {
    "value": { "type": "u128", "value": "1000000" },
    "exists": true
  },
  "contract2": {
    "value": { "type": "u128", "value": "2000000" },
    "exists": true
  },
  "differences": [
    {
      "field": "value",
      "contract1Value": "1000000",
      "contract2Value": "2000000"
    }
  ]
}
```

#### POST /api/soroban-storage/typed-key

Generates a properly typed storage key.

**Request Body**:
```json
{
  "keyType": "map",
  "keyComponents": [
    { "type": "symbol", "value": "balances" },
    { "type": "address", "value": "GABC..." }
  ]
}
```

**Response**:
```json
{
  "key": "AAAADwAAAAhiYWxhbmNlcwAAAAEAAAATAAAA...",
  "components": [
    { "type": "symbol", "value": "balances" },
    { "type": "address", "value": "GABC..." }
  ]
}
```

### Supported Key Types

- `symbol`: String symbols
- `u32`, `u64`, `u128`: Unsigned integers
- `i32`, `i64`, `i128`: Signed integers
- `address`: Stellar addresses
- `bytes`: Raw byte arrays
- `map`: Composite keys

### Usage Example

```typescript
// Query contract storage
const storage = await fetch('/api/soroban-storage/query', {
  method: 'POST',
  body: JSON.stringify({
    contractId: 'CABC...',
    key: 'balance',
    network: 'testnet',
    keyType: 'symbol'
  })
});

// Compare storage
const comparison = await fetch('/api/soroban-storage/compare', {
  method: 'POST',
  body: JSON.stringify({
    contractId1: 'CABC...',
    contractId2: 'CDEF...',
    key: 'balance',
    network: 'testnet'
  })
});
```

---

## Stellar.toml Editor, Linter, and Preview

**Issue**: #348  
**API Endpoint**: `/api/stellar-toml`  
**Frontend Route**: `/stellar-toml`

### Overview

The stellar.toml editor helps developers create, validate, and format stellar.toml files according to SEP-1 standards.

### Features

- **Parse & Validate**: Parse TOML and validate against SEP-1
- **Format**: Auto-format with customizable indentation
- **Lint**: Check for errors, warnings, and best practices
- **Templates**: Pre-configured templates for common use cases

### API Endpoints

#### POST /api/stellar-toml/parse

Parses and validates stellar.toml content.

**Request Body**:
```json
{
  "content": "VERSION=\"2.0.0\"\nNETWORK_PASSPHRASE=\"Test SDF Network ; September 2015\"",
  "strict": true
}
```

**Response**:
```json
{
  "parsed": {
    "VERSION": "2.0.0",
    "NETWORK_PASSPHRASE": "Test SDF Network ; September 2015"
  },
  "issues": [],
  "isValid": true
}
```

#### POST /api/stellar-toml/format

Formats stellar.toml content.

**Request Body**:
```json
{
  "content": "VERSION=\"2.0.0\"\n[DOCUMENTATION]\nORG_NAME=\"Example\"",
  "indent": "spaces",
  "indentSize": 2
}
```

**Response**:
```json
{
  "formatted": "VERSION = \"2.0.0\"\n\n[DOCUMENTATION]\nORG_NAME = \"Example\""
}
```

#### POST /api/stellar-toml/validate

Validates stellar.toml against SEP-1.

**Request Body**:
```json
{
  "content": "VERSION=\"2.0.0\"",
  "level": "strict",
  "network": "testnet"
}
```

**Response**:
```json
{
  "isValid": true,
  "issues": [
    {
      "level": "warning",
      "field": "DOCUMENTATION",
      "message": "DOCUMENTATION section is recommended"
    }
  ],
  "summary": {
    "errors": 0,
    "warnings": 1,
    "infos": 0
  }
}
```

#### GET /api/stellar-toml/template

Gets a pre-configured template.

**Query Parameters**:
- `type`: `minimal`, `anchor`, `issuer`, or `validator`

**Response**:
```json
{
  "template": "VERSION=\"2.0.0\"\nNETWORK_PASSPHRASE=\"Test SDF Network ; September 2015\"\n..."
}
```

### Validation Levels

- **Basic**: Checks required fields and basic structure
- **Strict**: Full SEP-1 compliance validation

### Template Types

- **Minimal**: Basic configuration with essential fields
- **Anchor**: Complete setup for SEP-24/31 anchor services
- **Issuer**: Configuration for token issuers
- **Validator**: Setup for Stellar network validators

### Usage Example

```typescript
// Load a template
const template = await fetch('/api/stellar-toml/template?type=anchor');

// Validate content
const validation = await fetch('/api/stellar-toml/validate', {
  method: 'POST',
  body: JSON.stringify({
    content: template.template,
    level: 'strict',
    network: 'testnet'
  })
});

// Format content
const formatted = await fetch('/api/stellar-toml/format', {
  method: 'POST',
  body: JSON.stringify({
    content: template.template,
    indent: 'spaces',
    indentSize: 2
  })
});
```

---

## Stellar Sequence Number Planner

**Issue**: #345  
**API Endpoint**: `/api/sequence-planner`  
**Frontend Route**: `/sequence-planner`

### Overview

The Sequence Number Planner helps developers plan and validate transaction sequences to avoid sequence number conflicts when submitting multiple transactions.

### Features

- **Sequence Fetching**: Get current sequence from Horizon
- **Sequence Validation**: Validate proposed sequences
- **Conflict Detection**: Detect duplicates, gaps, and dependencies
- **Auto-Assignment**: Automatically assign valid sequences
- **Dependency Tracking**: Validate transaction dependencies

### API Endpoints

#### GET /api/sequence-planner/account-sequence

Gets the current sequence number for an account.

**Query Parameters**:
- `account`: Account address
- `network`: `testnet` or `mainnet`

**Response**:
```json
{
  "account": "GABC...",
  "currentSequence": "12345",
  "nextSequence": "12346"
}
```

#### POST /api/sequence-planner/validate-sequence

Validates a proposed sequence number.

**Request Body**:
```json
{
  "account": "GABC...",
  "proposedSequence": 12346,
  "network": "testnet"
}
```

**Response**:
```json
{
  "isValid": true,
  "currentSequence": "12345",
  "nextValidSequence": "12346",
  "gap": 0,
  "issues": ["Sequence number is valid and ready to use"]
}
```

#### POST /api/sequence-planner/plan

Plans sequences for multiple transactions.

**Request Body**:
```json
{
  "transactions": [
    {
      "id": "payment-1",
      "sourceAccount": "GABC...",
      "description": "Payment transaction",
      "dependencies": []
    },
    {
      "id": "payment-2",
      "sourceAccount": "GABC...",
      "sequenceNumber": 12347,
      "description": "Second payment",
      "dependencies": ["payment-1"]
    }
  ],
  "network": "testnet"
}
```

**Response**:
```json
{
  "plannedTransactions": [
    {
      "id": "payment-1",
      "sourceAccount": "GABC...",
      "assignedSequence": 12346,
      "status": "valid",
      "issues": []
    },
    {
      "id": "payment-2",
      "sourceAccount": "GABC...",
      "assignedSequence": 12347,
      "status": "valid",
      "issues": []
    }
  ],
  "conflicts": [],
  "accountSequences": [
    {
      "account": "GABC...",
      "currentSequence": "12345",
      "nextSequence": "12346",
      "plannedSequences": [12346, 12347]
    }
  ],
  "summary": {
    "total": 2,
    "valid": 2,
    "conflicts": 0,
    "warnings": 0
  }
}
```

### Conflict Types

- **duplicate**: Same sequence number used multiple times
- **gap**: Missing sequence numbers between transactions
- **out_of_order**: Sequences not in correct order
- **dependency_violation**: Dependency transaction has higher sequence

### Usage Example

```typescript
// Get current sequence
const current = await fetch('/api/sequence-planner/account-sequence?account=GABC...&network=testnet');

// Plan multiple transactions
const plan = await fetch('/api/sequence-planner/plan', {
  method: 'POST',
  body: JSON.stringify({
    transactions: [
      {
        id: 'tx-1',
        sourceAccount: 'GABC...',
        description: 'First transaction'
      },
      {
        id: 'tx-2',
        sourceAccount: 'GABC...',
        description: 'Second transaction',
        dependencies: ['tx-1']
      }
    ],
    network: 'testnet'
  })
});

// Validate specific sequence
const validation = await fetch('/api/sequence-planner/validate-sequence', {
  method: 'POST',
  body: JSON.stringify({
    account: 'GABC...',
    proposedSequence: 12346,
    network: 'testnet'
  })
});
```

### Best Practices

1. Always fetch current sequences before planning
2. Use dependencies to enforce transaction ordering
3. Avoid manual sequence assignment when possible
4. Check for conflicts before submitting transactions
5. Consider using sequence bumps for complex workflows

---

## Common Error Codes

### SEP-10 Debugger

- `400`: Invalid request parameters
- `401`: Authentication failed
- `500`: Server error or network issue

### Soroban Storage Explorer

- `400`: Invalid contract ID or key
- `404`: Storage entry not found
- `500`: Soroban RPC error

### Stellar.toml Editor

- `400`: Invalid TOML syntax
- `422`: Validation failed

### Sequence Planner

- `400`: Invalid account or sequence
- `404`: Account not found
- `500`: Horizon connection error

---

## Testing

All features include comprehensive test suites covering:

- Unit tests for services
- Integration tests for controllers
- Edge case handling
- Error scenarios
- Validation logic

Run tests with:
```bash
npm test
```

Run specific module tests:
```bash
npm test -- sep10
npm test -- soroban-storage
npm test -- stellar-toml
npm test -- sequence-planner
```

---

## Contributing

When extending these features:

1. Add tests for new functionality
2. Update API documentation
3. Follow existing code patterns
4. Validate against standards (SEP-1, SEP-10, etc.)
5. Handle errors gracefully

---

## Support

For issues or questions:

- GitHub Issues: [https://github.com/your-org/savitools/issues](https://github.com/your-org/savitools/issues)
- Documentation: [https://docs.savitools.dev](https://docs.savitools.dev)
