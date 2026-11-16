import type { Network } from '../config/networks.js';
import type { PairWithBalances } from '../discovery/pair-balances.js';
import type { TokenMetadata } from '../discovery/token-metadata.js';
import type { ContractInfo } from '../discovery/contract-info.js';

export type TokenRow = TokenMetadata & ContractInfo;
const esc = (s: string) => s.replaceAll('|', '\\|').replaceAll('\n', ' ');
const age = (v: number | null) => v === null ? 'Unknown' : v.toFixed(2);

const PAIR_GROUPS = [
  { name: 'WBNB', address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c' },
  { name: 'USDT', address: '0x55d398326f99059ff775485246999027b3197955' },
  { name: 'BUSD', address: '0xe9e7cea3dedca5984780bafc599bd69add087d56' },
  { name: 'USDC', address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d' },
  { name: 'ETH', address: '0x2170ed0880ac9a755fd29b2688956bd959f933f8' },
  { name: 'WETH', address: '0x4db5a66e937a9f4473fa95b1caf1d1e1d62e29ea' },
];
const pairTableHeader = '| # | DEX | Pair Address | token0 | token0 Balance | token1 | token1 Balance | Block Number | Transaction Hash |\n| - | --- | ------------ | ------ | ------------- | ------ | ------------- | ------------ | ---------------- |';

export function renderReport(input: { network: Network; fromBlock: number; toBlock: number; timestamp: Date; pairs: PairWithBalances[]; discoveredPairCount: number; pairsChecked: number; nonzeroPairs: number; deadPairsExcluded: number; balanceBlock: number; tokens: TokenRow[]; errors: string[] }): string {
  const { network, pairs, tokens } = input;
  const count = (status: string) => tokens.filter(t => t.verification === status).length;
  const rows = [...tokens].sort((a, b) => (a.ageDays ?? Infinity) - (b.ageDays ?? Infinity)).map((t, i) => `| ${i + 1} | ${esc(t.name)} | ${esc(t.symbol)} | \`${t.address}\` | ${t.verification} | ${t.proxy} | [Contract](${network.explorer}/address/${t.address}) | ${age(t.ageDays)} |`).join('\n');
  const pairRow = (p: PairWithBalances, index: number) => `| ${index + 1} | ${p.dex} ${p.version} | [\`${p.pair}\`](${network.explorer}/address/${p.pair}) | \`${p.token0}\` | ${p.token0Balance} | \`${p.token1}\` | ${p.token1Balance} | ${p.blockNumber} | [${p.transactionHash}](${network.explorer}/tx/${p.transactionHash}) |`;
  const groupedPairs = PAIR_GROUPS.map(group => {
    const matches = pairs.filter(p => p.token0.toLowerCase() === group.address || p.token1.toLowerCase() === group.address);
    return matches.length ? `### ${group.name} pairs\n\n${pairTableHeader}\n${matches.map((p, i) => pairRow(p, i)).join('\n')}` : '';
  }).filter(Boolean);
  const otherPairs = pairs.filter(p => !PAIR_GROUPS.some(group => p.token0.toLowerCase() === group.address || p.token1.toLowerCase() === group.address));
  if (otherPairs.length) groupedPairs.push(`### Other pairs\n\n${pairTableHeader}\n${otherPairs.map((p, i) => pairRow(p, i)).join('\n')}`);
  const pairSections = groupedPairs.join('\n\n') || 'No pairs with confirmed nonzero balances.';
  const factories = network.factories.map(f => `- ${f.dex} ${f.version}: \`${f.address}\` — deployment block ${typeof f.deploymentBlock === 'number' ? f.deploymentBlock : 'Unknown'}`).join('\n');

  return `# V2 DEX Token Discovery — ${network.name}\n\n## Scan Summary\n\n- Network: ${network.name}\n- Chain ID: ${network.chainId}\n- Block range: ${input.fromBlock}–${input.toBlock}\n- Scan timestamp: ${input.timestamp.toISOString()}\n- Discovered pairs: ${input.discoveredPairCount}\n- Pair balances checked: ${input.pairsChecked}/${input.discoveredPairCount}\n- Pairs with nonzero balances for both tokens: ${input.nonzeroPairs}\n- Pairs excluded for zero or unknown balances: ${input.pairsChecked - input.nonzeroPairs}\n- Pairs excluded by dead-token thresholds: ${input.deadPairsExcluded}\n- Pairs included: ${pairs.length}\n- Balance snapshot block: ${input.balanceBlock}\n- Unique tokens in included pairs: ${tokens.length}\n- Verified tokens: ${count('Verified')}\n- Unverified tokens: ${count('Unverified')}\n- Unknown verification status: ${count('Unknown')}\n\n> Dead-pair rule (BSC): exclude a pair if its WBNB, BEP-20 ETH, or listed Wormhole WETH balance is below 10 tokens, or its USDT, BUSD, or USDC balance is below 10,000 tokens (nominal $1 each). These checks use token balances and decimals only; no price feeds are queried. Unknown balance or decimals do not trigger this filter.\n\n### Factories\n\n${factories}\n\n${input.errors.length ? `## Scan Errors\n\n${input.errors.map(e => `- ${esc(e)}`).join('\n')}\n\n` : ''}## Tokens\n\n| # | Token Name | Symbol | Token Address | Verified | Proxy | Contract Link | Deployment Age (Days) |\n| - | ---------- | ------ | ------------- | -------- | ----- | ------------- | --------------------- |\n${rows || '| — | No tokens with confirmed pair balances | — | — | Unknown | Unknown | — | Unknown |'}\n\n## Associated Pairs\n\nPairs containing more than one listed token appear in each matching group.\n\n${pairSections}\n`;
}
