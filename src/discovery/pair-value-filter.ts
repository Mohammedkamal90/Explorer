import type { Pair } from './pair-scanner.js';

export type PairOverview = Pair & {
  tokenHoldingsUSD: number | null;
  nativeBalanceUSD: number | null;
  qualifies: boolean;
};

export type PairFilterSummary = {
  thresholdUSD: number;
  discoveredPairs: number;
  tokenHoldingsQualifiedPairs: number;
  nativeBalanceQualifiedPairs: number;
  tokenHoldingsUnknownPairs: number;
  nativeBalanceUnknownPairs: number;
  qualifyingPairs: number;
  excludedPairs: number;
  uniqueTokensAfterFiltering: number;
};

export function qualifiesByOverview(tokenHoldingsUSD: number | null, nativeBalanceUSD: number | null, thresholdUSD: number): boolean {
  return (tokenHoldingsUSD !== null && Number.isFinite(tokenHoldingsUSD) && tokenHoldingsUSD > thresholdUSD)
    || (nativeBalanceUSD !== null && Number.isFinite(nativeBalanceUSD) && nativeBalanceUSD > thresholdUSD);
}

export function filterPairsByOverview<T extends Pair>(pairs: T[], values: (pair: T) => { tokenHoldingsUSD: number | null; nativeBalanceUSD: number | null }, thresholdUSD: number): PairOverview[] {
  return pairs.map(pair => {
    const overview = values(pair);
    return { ...pair, ...overview, qualifies: qualifiesByOverview(overview.tokenHoldingsUSD, overview.nativeBalanceUSD, thresholdUSD) };
  });
}

export function summarizePairFilter(pairs: PairOverview[], thresholdUSD: number): PairFilterSummary {
  const tokenHoldingsQualifiedPairs = pairs.filter(p => p.tokenHoldingsUSD !== null && p.tokenHoldingsUSD > thresholdUSD).length;
  const nativeBalanceQualifiedPairs = pairs.filter(p => p.nativeBalanceUSD !== null && p.nativeBalanceUSD > thresholdUSD).length;
  const qualifying = pairs.filter(p => p.qualifies);
  const tokens = new Set(qualifying.flatMap(p => [p.token0.toLowerCase(), p.token1.toLowerCase()]));
  return {
    thresholdUSD,
    discoveredPairs: pairs.length,
    tokenHoldingsQualifiedPairs,
    nativeBalanceQualifiedPairs,
    tokenHoldingsUnknownPairs: pairs.filter(p => p.tokenHoldingsUSD === null).length,
    nativeBalanceUnknownPairs: pairs.filter(p => p.nativeBalanceUSD === null).length,
    qualifyingPairs: qualifying.length,
    excludedPairs: pairs.length - qualifying.length,
    uniqueTokensAfterFiltering: tokens.size,
  };
}

export function dedupePairTokens(pairs: PairOverview[]): string[] {
  return [...new Set(pairs.filter(p => p.qualifies).flatMap(p => [p.token0, p.token1]).map(a => a.toLowerCase()))];
}

export function parseThreshold(value: string | undefined, fallback = 10_000): number {
  if (value === undefined || value.trim() === '') return fallback;
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('Pair value threshold must be a finite non-negative USD amount');
  return threshold;
}
