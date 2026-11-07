export type DexFactory = { dex: 'PancakeSwap' | 'Uniswap'; version: 'V2'; address: string; deploymentBlock: number | 'discover' | 'Unknown'; source: string };
export type Network = { name: string; chainId: number; explorer: string; explorerApi: string; apiKeyEnv: string; factories: DexFactory[] };

// Factories only appear here where protocol-maintained deployment inventories list them.
// Deployment block is found by binary-searching eth_getCode on the selected RPC.
const uni = (address: string): DexFactory => ({dex:'Uniswap',version:'V2',address,deploymentBlock:'discover',source:'https://github.com/Uniswap/sdks/blob/main/sdks/sdk-core/src/addresses.ts'});
const cake = (address: string): DexFactory => ({dex:'PancakeSwap',version:'V2',address,deploymentBlock:'discover',source:'https://docs.pancakeswap.finance/trade/trading-faq/swap-faq'});
export const NETWORKS: Record<string, Network> = {
  bsc: {name:'BNB Smart Chain',chainId:56,explorer:'https://bscscan.com',explorerApi:'https://api.etherscan.io/v2/api',apiKeyEnv:'BSCSCAN_API_KEY',factories:[cake('0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'),uni('0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6')]},
  ethereum: {name:'Ethereum',chainId:1,explorer:'https://etherscan.io',explorerApi:'https://api.etherscan.io/v2/api',apiKeyEnv:'ETHERSCAN_API_KEY',factories:[uni('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'),{...cake('0x1097053Fd2ea711dad45caCcc45EfF7548fCB362'),source:'https://docs.pancakeswap.finance/trade/pancakeswap-exchange/trade; https://etherscan.io/address/0x1097053fd2ea711dad45caccc45eff7548fcb362'}]},
  base: {name:'Base',chainId:8453,explorer:'https://basescan.org',explorerApi:'https://api.etherscan.io/v2/api',apiKeyEnv:'BASESCAN_API_KEY',factories:[uni('0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6')]},
  arbitrum: {name:'Arbitrum One',chainId:42161,explorer:'https://arbiscan.io',explorerApi:'https://api.etherscan.io/v2/api',apiKeyEnv:'ARBISCAN_API_KEY',factories:[uni('0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9')]},
  optimism: {name:'Optimism',chainId:10,explorer:'https://optimistic.etherscan.io',explorerApi:'https://api.etherscan.io/v2/api',apiKeyEnv:'OPTIMISM_ETHERSCAN_API_KEY',factories:[uni('0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf')]},
  polygon: {name:'Polygon',chainId:137,explorer:'https://polygonscan.com',explorerApi:'https://api.etherscan.io/v2/api',apiKeyEnv:'POLYGONSCAN_API_KEY',factories:[uni('0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C')]}
};
