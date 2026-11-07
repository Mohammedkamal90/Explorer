# V2 DEX Token Discovery

Terminal tool to find tokens in newly created pairs from official PancakeSwap V2 and Uniswap V2 factories. It is intentionally V2 only.

## Installation

Requirements: Node.js 20 or newer.

```sh
npm install
cp .env.example .env
```

Add an explorer key to `.env` if available. Etherscan V2 uses `ETHERSCAN_API_KEY`; network aliases are `BSCSCAN_API_KEY`, `BASESCAN_API_KEY`, `ARBISCAN_API_KEY`, `OPTIMISM_ETHERSCAN_API_KEY`, and `POLYGONSCAN_API_KEY`. The tool continues without a key.

RPC URLs can be provided as `BSC_RPC_URL`, `ETHEREUM_RPC_URL`, `BASE_RPC_URL`, `ARBITRUM_RPC_URL`, `OPTIMISM_RPC_URL`, or `POLYGON_RPC_URL`, or passed with `--rpc`.

## Run

Interactive:

```sh
npm start
```

Command line:

```sh
npm start -- --network bsc --rpc 'https://your-bsc-rpc.example'
```

After validating RPC connectivity and chain ID, the CLI prints `LAST_BLOCK: <number>`, then prompts for `BLOCK_RANGE_FROM:` and `BLOCK_RANGE_TO:`. Enter decimal block numbers with `0 <= from <= to <= LAST_BLOCK`. You can pass `--from-block <number> --to-block <number>` to avoid the prompts.

Networks: `bsc`, `ethereum`, `base`, `arbitrum`, `optimism`, `polygon`. Reports are written to `/run/media/glitch/Glitch/BUG-Bounty/PRIVATE/Deployed/Token/token-discovery-<network>-<UTC-date>.md`. Use a private RPC with historical state/log support for broad scans. `--chunk-size 2000` is optional; the scanner reduces its chunk after RPC range errors and keeps the accepted size. It backs off and retries rate limits without reducing the chunk, reports progress, and preserves completed chunks if a later call fails.

## Report example

Values below are placeholders showing the generated layout; the program does not emit sample token data.

```md
# V2 DEX Token Discovery — <network>

## Scan Summary
- Network: <selected network>
- Chain ID: <validated chain ID>
- Block range: <entered start>–<entered end>
- Scan timestamp: <UTC timestamp>
- Discovered pairs: <count>
- Unique tokens: <count>
- Verified tokens: <count>
- Unverified tokens: <count>
- Unknown verification status: <count>

## Tokens
| # | Token Name | Symbol | Token Address | Verified | Proxy | Contract Link | Deployment Age (Days) |
| - | ---------- | ------ | ------------- | -------- | ----- | ------------- | --------------------- |
| 1 | <RPC result or Unknown> | <RPC result or Unknown> | <address> | <explorer result> | <explorer result> | <network explorer> | <creation time or Unknown> |

## Associated Pairs
| DEX | Pair Address | token0 | token1 | Block Number | Transaction Hash |
| --- | ------------ | ------ | ------ | ------------ | ---------------- |
| <DEX> V2 | <pair> | <token0> | <token1> | <block> | <transaction> |
```

## Network/factory sources

The Uniswap V2 factory map is based on [Uniswap's maintained SDK address map](https://github.com/Uniswap/sdks/blob/main/sdks/sdk-core/src/addresses.ts). PancakeSwap is enabled on BNB Smart Chain and Ethereum; its official docs identify those V2 deployments, with the BSC factory documented as Factory V2 and the Ethereum V2 factory linked to its explorer contract: [PancakeSwap BSC V2 docs](https://docs.pancakeswap.finance/trade/trading-faq/swap-faq), [BSC Factory V2 contract](https://bscscan.com/address/0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73), [PancakeSwap V2 on BNB Chain and Ethereum](https://docs.pancakeswap.finance/trade/pancakeswap-exchange/trade), [Ethereum Factory V2](https://etherscan.io/address/0x1097053fd2ea711dad45caccc45eff7548fcb362).

Factory creation blocks are not hard-coded. At scan time the program binary-searches `eth_getCode` to establish each official factory's actual creation block, then starts at the later of that block or the requested timestamp boundary.

## Explorer and RPC limitations

- Verification and proxy labels use Etherscan-compatible `getsourcecode` metadata. Without a key or a reliable explorer response, those statuses are `Unknown`.
- Deployment age uses the explorer `getcontractcreation` result when available. If that lookup fails, the tool finds the first block with contract code, checks top-level contract-creation receipts, then tries block-level trace methods. It avoids tracing every transaction in a block. Explorer requests have an 8-second timeout; if the lookup methods cannot establish creation, age is `Unknown`.
- Historical `eth_getCode`, `eth_getLogs`, block, receipt, and trace access depend on the RPC provider. The scanner backs off and reduces `eth_getLogs` chunk size when range limits are hit. If a factory scan still fails, collected pairs and tokens are written to a partial report with the error recorded.
- Explorer service rate limits may leave individual statuses or ages Unknown. RPC metadata call failures are isolated per field.
- Some free RPCs prune old state or restrict large log ranges. Chunking and retries cannot overcome provider retention limits.
- Alchemy currently documents a 10-block `eth_getLogs` range on its Free tier, so multi-day scans can take a very long time at that tier. Use a plan/RPC endpoint with a larger range for practical scans; see [Alchemy's range limits](https://www.alchemy.com/docs/chains/ethereum/ethereum-api-endpoints/eth-get-logs).

## Tests

```sh
npm test
npm run build
```

Set `INTEGRATION_RPC_URL` to an Ethereum RPC URL to enable the optional live-network test. Unit tests use mocks and do not require network access.
