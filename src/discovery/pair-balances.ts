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
};

type TokenBalance = { raw: bigint | null; display: string };

async function readTokenBalance(provider: JsonRpcProvider, token: string, pair: string, blockTag: number): Promise<TokenBalance> {
  const contract = new Contract(token, TOKEN_ABI, provider);
  let raw: bigint;
  try {
    raw = BigInt(await contract.balanceOf(pair, { blockTag }));
  } catch {
    return { raw: null, display: 'Unknown' };
  }

  try {
    const decimals = Number(await contract.decimals({ blockTag }));
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('invalid decimals');
    return { raw, display: formatUnits(raw, decimals) };
  } catch {
    return { raw, display: `${raw.toString()} raw units (decimals Unknown)` };
  }
}

/** Reads each underlying ERC-20's actual balance at the supplied block snapshot. */
export async function getPairBalances(provider: JsonRpcProvider, pair: Pair, blockTag: number): Promise<PairWithBalances> {
  const [token0, token1] = await Promise.all([
    readTokenBalance(provider, pair.token0, pair.pair, blockTag),
    readTokenBalance(provider, pair.token1, pair.pair, blockTag),
  ]);
  return {
    ...pair,
    token0Balance: token0.display,
    token1Balance: token1.display,
    hasBothBalances: token0.raw !== null && token0.raw > 0n && token1.raw !== null && token1.raw > 0n,
  };
}
