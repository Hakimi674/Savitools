# Soroban contract events

The Contract Event Inspector reads events from the selected Soroban RPC network and decodes their ScVal topics and values. Enter a contract ID, choose testnet or mainnet, and optionally set a start ledger, event type, and page size. Queries are read-only and do not require a connected wallet.

## Building filters

After loading events, add up to 10 filters. Text filters accept a non-empty value of at most 256 characters. Topic matching is case-insensitive and searches nested topic values; value-type matching accepts either `i128` or the wire form `scvI128`; value matching is case-insensitive and exact. Ledger ranges are inclusive and accept either bound, but require at least one non-negative safe integer. The lower bound cannot exceed the upper bound.

Multiple filters are combined with AND. Filters run against the events already loaded in the browser, so they update immediately and do not make another RPC request. Use **Load older events** to extend the local result set; the active filters remain applied. Clear an individual chip or all filters to widen the result set.

## API

- `GET /api/v1/contracts/events` queries and decodes events. The query supports `contractId`, `network`, `type`, `startLedger` or `cursor`, and `limit` (maximum 200).
- `POST /api/v1/contracts/events/filter` filters up to 1,000 decoded events using up to 10 criteria. Supported `kind` values are `topic_contains`, `value_type_is`, `value_equals`, and `ledger_range`. Text values are limited to 256 characters. A ledger range must include at least one valid bound and cannot be inverted.
- `POST /api/v1/contracts/events/replay` sends matching events to a webhook. It requires authentication; the filter and query endpoints are read-only. Replay destinations are checked against the server's SSRF protections.

Invalid criteria return HTTP 400 with a validation error. Query and network failures are shown separately from a valid query that returns no events. See the [API reference](api-reference.md) for request and response details.
