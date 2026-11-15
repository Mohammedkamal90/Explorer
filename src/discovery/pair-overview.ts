import { formatEther } from 'ethers';
import type { Network } from '../config/networks.js';

type Holding = { TokenQuantity?: unknown; TokenDivisor?: unknown; TokenPriceUSD?: unknown };
type ApiResponse<T> = { status?: string; message?: string; result?: T | string };
let lastHoldingsRequestAt = 0;

async function waitForHoldingsRateLimit(): Promise<void> {
  const delay = Math.max(0, 500 - (Date.now() - lastHoldingsRequestAt));
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  lastHoldingsRequestAt = Date.now();
}

function positiveOrZero(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function totalHoldingsUsd(rows: Holding[]): number | null {
  let total = 0;
  for (const row of rows) {
    const quantity = positiveOrZero(row.TokenQuantity);
    const divisor = positiveOrZero(row.TokenDivisor);
    const price = positiveOrZero(row.TokenPriceUSD);
    if (quantity === null || divisor === null || !Number.isInteger(divisor) || divisor > 255 || price === null) return null;
    const value = quantity / (10 ** divisor) * price;
    if (!Number.isFinite(value)) return null;
    total += value;
    if (!Number.isFinite(total)) return null;
  }
  return total;
}

async function explorerRequest<T>(network: Network, apiKey: string, params: Record<string, string>): Promise<ApiResponse<T>> {
  const url = new URL(network.explorerApi);
  url.searchParams.set('chainid', String(network.chainId));
  url.searchParams.set('apikey', apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Explorer HTTP ${response.status}`);
  return await response.json() as ApiResponse<T>;
}

/** Returns null unless every paginated explorer holding row has a usable explorer USD price. */
export async function getPairTokenHoldingsUsd(network: Network, pairAddress: string, apiKey?: string, onDiagnostic?: (message: string) => void): Promise<number | null> {
  if (!apiKey) return null;
  try {
    const rows: Holding[] = [];
    const pageSize = 100;
    for (let page = 1; page <= 1000; page++) {
      await waitForHoldingsRateLimit();
      const data = await explorerRequest<Holding[]>(network, apiKey, {
        module: 'account', action: 'addresstokenbalance', address: pairAddress,
        page: String(page), offset: String(pageSize),
      });
      if (data.status !== '1' || !Array.isArray(data.result)) {
        onDiagnostic?.(`Token holdings API returned status ${data.status ?? 'Unknown'}: ${data.message ?? 'no message'}${typeof data.result === 'string' ? ` (${data.result})` : ''}`);
        return null;
      }
      rows.push(...data.result);
      if (data.result.length < pageSize) return totalHoldingsUsd(rows);
    }
  } catch (error) {
    onDiagnostic?.(`Token holdings request failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  return null;
}

export async function getNativeTokenPriceUsd(network: Network, apiKey: string | undefined, onDiagnostic?: (message: string) => void): Promise<number | null> {
  if (!apiKey) return null;
  const actions = network.chainId === 56 ? ['bnbprice', 'ethprice'] : ['ethprice'];
  const failures: string[] = [];
  for (const action of actions) {
    try {
      const data = await explorerRequest<Record<string, unknown>>(network, apiKey, { module: 'stats', action });
      if (data.status === '1' && typeof data.result === 'object' && data.result !== null) {
        const result = data.result as Record<string, unknown>;
        for (const field of ['bnbusd', 'ethusd', 'maticusd', 'polusd']) {
          const price = positiveOrZero(result[field]);
          if (price !== null) return price;
        }
      }
      failures.push(`${action}: ${data.message ?? `status ${data.status ?? 'Unknown'}`}${typeof data.result === 'string' ? ` (${data.result})` : ''}`);
    } catch (error) {
      failures.push(`${action}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  onDiagnostic?.(`Native-token price lookup failed (${failures.join('; ')})`);
  return null;
}

export async function getNativeBalanceUsd(pairAddress: string, priceUsd: number | null, getBalance: (address: string) => Promise<bigint>): Promise<number | null> {
  if (priceUsd === null) return null;
  try {
    const balance = await getBalance(pairAddress);
    const value = Number(formatEther(balance)) * priceUsd;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export async function getPairOverviewValues(network: Network, pairAddress: string, apiKey: string | undefined, nativePriceUsd: number | null, getBalance: (address: string) => Promise<bigint>, onDiagnostic?: (message: string) => void): Promise<{ tokenHoldingsUSD: number | null; nativeBalanceUSD: number | null }> {
  const [tokenHoldingsUSD, nativeBalanceUSD] = await Promise.all([
    getPairTokenHoldingsUsd(network, pairAddress, apiKey, onDiagnostic),
    getNativeBalanceUsd(pairAddress, nativePriceUsd, getBalance),
  ]);
  return { tokenHoldingsUSD, nativeBalanceUSD };
}
