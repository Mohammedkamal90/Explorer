import { Contract, formatUnits, type JsonRpcProvider } from 'ethers';
import type { Pair } from './pair-scanner.js';

const TOKEN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export type PairWithBalances = Pair & {
  token0Balance: string;
  token1Balance: string;
  hasBothBalances: boolean;
  excludedAsDead: boolean;
};

type TokenBalance = { raw: bigint | null; display: string; decimals: number | null };

const DEAD_BALANCE_THRESHOLDS = new Map<string, bigint>([
  ['0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', 10n], // WBNB
  ['0x55d398326f99059ff775485246999027b3197955', 10000n], // USDT (nominal $1)
  ['0xe9e7cea3dedca5984780bafc599bd69add087d56', 10000n], // BUSD (nominal $1)
  ['0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', 10000n], // USDC (nominal $1)
  ['0x2170ed0880ac9a755fd29b2688956bd959f933f8', 10n], // BEP-20 ETH
  ['0x4db5a66e937a9f4473fa95b1caf1d1e1d62e29ea', 10n], // Wormhole WETH on BSC
]);
async function readTokenBalance(provider: JsonRpcProvider, token: string, pair: string, blockTag: number): Promise<TokenBalance> {
  const contract = new Contract(token, TOKEN_ABI, provider);
  let raw: bigint;
  try {
    raw = BigInt(await contract.balanceOf(pair, { blockTag }));
  } catch {
    return { raw: null, display: 'Unknown', decimals: null };
  }

  try {
    const decimals = Number(await contract.decimals({ blockTag }));
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('invalid decimals');
    return { raw, display: formatUnits(raw, decimals), decimals };
  } catch {
    return { raw, display: `${raw.toString()} raw units (decimals Unknown)`, decimals: null };
  }
}

function isBelowDeadThreshold(address: string, balance: TokenBalance): boolean {
  const threshold = DEAD_BALANCE_THRESHOLDS.get(address.toLowerCase());
  if (threshold === undefined || balance.raw === null || balance.decimals === null) return false;
  return balance.raw < threshold * 10n ** BigInt(balance.decimals);
}

/** Reads each underlying ERC-20's actual balance at the supplied block snapshot. */
export async function getPairBalances(provider: JsonRpcProvider, pair: Pair, blockTag: number, chainId: number): Promise<PairWithBalances> {
  const [token0, token1] = await Promise.all([
    readTokenBalance(provider, pair.token0, pair.pair, blockTag),
    readTokenBalance(provider, pair.token1, pair.pair, blockTag),
  ]);
  return {
    ...pair,
    token0Balance: token0.display,
    token1Balance: token1.display,
    hasBothBalances: token0.raw !== null && token0.raw > 0n && token1.raw !== null && token1.raw > 0n,
    excludedAsDead: chainId === 56 && (isBelowDeadThreshold(pair.token0, token0) || isBelowDeadThreshold(pair.token1, token1)),
  };
}
