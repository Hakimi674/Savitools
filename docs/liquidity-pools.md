# Liquidity Pool Explorer

Search Stellar AMM pools, calculate LP share values, and track your favorite pools.

## Overview

The Liquidity Pool Explorer lets you:
- Search for Stellar constant-product AMM pools by asset pair
- View pool details including reserves, fees, and spot prices
- Calculate the value of your LP shares
- Save pools to a watchlist for quick access (requires authentication)

## Asset Format

Assets are specified in one of two formats:
- **Native XLM**: `XLM`
- **Custom assets**: `CODE:ISSUER` (e.g., `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`)

## Using the Tool

### 1. Search for Pools

1. Select the network (testnet or mainnet)
2. Enter the two assets you want to search for
   - Click "XLM (Native)" for native assets
   - Or enter `CODE:ISSUER` for custom assets
3. Click "Search Pools"

The tool will return up to 10 matching constant-product AMM pools.

### 2. View Pool Details

Click on any pool in the search results to see:
- Pool ID (64-character hex)
- Asset pair
- Reserves for both assets
- Total shares outstanding
- Pool fee percentage
- Number of trustlines
- Spot prices (A per B and B per A)

### 3. Calculate Share Value

After selecting a pool:
1. Enter the number of LP shares you hold
2. Click "Calculate Value"

The tool will show:
- Value of your shares in Asset A
- Value of your shares in Asset B
- Your ownership percentage of the pool

### 4. Watchlist (Authenticated Users)

If you're logged in, you can:
- Click the star icon to add a pool to your watchlist
- Optionally add a label for easy identification
- Load watched pools with one click
- Remove pools from your watchlist

## API Endpoints

The tool uses the following API endpoints:

- `GET /liquidity-pools/search` - Search pools by asset pair
- `GET /liquidity-pools/details` - Get pool details by ID
- `POST /liquidity-pools/share-value` - Calculate share value
- `POST /liquidity-pools/watch` - Add to watchlist (authenticated)
- `POST /liquidity-pools/unwatch` - Remove from watchlist (authenticated)
- `GET /liquidity-pools/watched` - Get watched pools (authenticated)

See the [API Reference](api-reference.md#liquidity-pools) for detailed request/response formats.

## Limits and Considerations

- Only constant-product AMM pools are supported
- Pool data is fetched live from Stellar Horizon
- Share calculations use exact integer arithmetic (stroops) for precision
- Empty pools (zero total shares) cannot calculate values
- Shares cannot exceed the pool's total shares

## Example Use Cases

### Check Your LP Position

1. Search for the pool you're invested in (e.g., XLM/USDC)
2. Select the pool
3. Enter your LP share balance
4. Calculate to see your position's current value

### Compare Pool Options

1. Search for an asset pair (e.g., XLM/USDC)
2. Review multiple pools returned
3. Compare fees, reserves, and trustlines
4. Calculate share values for each to find the best option

### Monitor Favorite Pools

1. Log in to your account
2. Search and select pools you care about
3. Add them to your watchlist with descriptive labels
4. Quickly reload and calculate values as needed
