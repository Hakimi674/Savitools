# Soroban RPC Console

The Soroban RPC Console provides a schema-aware interface for executing Soroban RPC methods.

## Endpoints

### POST /api/soroban/rpc/console

Executes a Soroban RPC method with schema validation.

**Headers:**
- Authorization: Bearer <token>

**Body:**
```json
{
  "method": "getHealth",
  "params": {}
}
```

**Supported Methods:**
- `getHealth`
- `getLatestLedger`
- `simulateTransaction`

**Response:**
```json
{
  "status": "healthy"
}
```

## Error Handling

All errors follow the standard error envelope format with appropriate status codes.