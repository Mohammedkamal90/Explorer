import type { Network } from '../config/networks.js';
import type { Pair } from '../discovery/pair-scanner.js';
import type { TokenMetadata } from '../discovery/token-metadata.js';
import type { ContractInfo } from '../discovery/contract-info.js';
export type TokenRow=TokenMetadata&ContractInfo;
const esc=(s:string)=>s.replaceAll('|','\\|').replaceAll('\n',' ');
const age=(v:number|null)=>v===null?'Unknown':v.toFixed(2);
export function renderReport(input:{network:Network;fromBlock:number;toBlock:number;timestamp:Date;pairs:Pair[];tokens:TokenRow[];errors:string[]}):string{
 const {network,pairs,tokens}=input;const count=(s:string)=>tokens.filter(t=>t.verification===s).length;
 const rows=[...tokens].sort((a,b)=>(a.ageDays??Infinity)-(b.ageDays??Infinity)).map((t,i)=>`| ${i+1} | ${esc(t.name)} | ${esc(t.symbol)} | \`${t.address}\` | ${t.verification} | ${t.proxy} | [Contract](${network.explorer}/address/${t.address}) | ${age(t.ageDays)} |`).join('\n');
 const pairRows=pairs.map(p=>`| ${p.dex} ${p.version} | \`${p.pair}\` | \`${p.token0}\` | \`${p.token1}\` | ${p.blockNumber} | [${p.transactionHash}](${network.explorer}/tx/${p.transactionHash}) |`).join('\n');
 const factories=network.factories.map(f=>`- ${f.dex} ${f.version}: \`${f.address}\` — deployment block ${typeof f.deploymentBlock==='number'?f.deploymentBlock:'Unknown'}`).join('\n');
 return `# V2 DEX Token Discovery — ${network.name}\n\n## Scan Summary\n\n- Network: ${network.name}\n- Chain ID: ${network.chainId}\n- Block range: ${input.fromBlock}–${input.toBlock}\n- Scan timestamp: ${input.timestamp.toISOString()}\n- Discovered pairs: ${pairs.length}\n- Unique tokens: ${tokens.length}\n- Verified tokens: ${count('Verified')}\n- Unverified tokens: ${count('Unverified')}\n- Unknown verification status: ${count('Unknown')}\n\n### Factories\n\n${factories}\n\n${input.errors.length?`## Scan Errors\n\n${input.errors.map(e=>`- ${esc(e)}`).join('\n')}\n\n`:''}## Tokens\n\n| # | Token Name | Symbol | Token Address | Verified | Proxy | Contract Link | Deployment Age (Days) |\n| - | ---------- | ------ | ------------- | -------- | ----- | ------------- | --------------------- |\n${rows||'| — | No tokens found | — | — | Unknown | Unknown | — | Unknown |'}\n\n## Associated Pairs\n\n| DEX | Pair Address | token0 | token1 | Block Number | Transaction Hash |\n| --- | ------------ | ------ | ------ | ------------ | ---------------- |\n${pairRows||'| — | No pairs found | — | — | — | — |'}\n`;
}
