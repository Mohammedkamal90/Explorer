import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin as input,stdout as output } from 'node:process';
import { mkdir,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isAddress, type JsonRpcProvider } from 'ethers';
import { NETWORKS, type Network } from './config/networks.js';
import { connectRpc } from './core/rpc.js';
import { parseBlockRange,findDeploymentBlock } from './core/block-range.js';
import { scanFactory,type Pair } from './discovery/pair-scanner.js';
import { dedupeTokens,getTokenMetadata } from './discovery/token-metadata.js';
import { getContractInfo } from './discovery/contract-info.js';
import { renderReport,type TokenRow } from './report/markdown.js';
import { getPairBalances,type PairWithBalances } from './discovery/pair-balances.js';

const REPORT_DIR='/run/media/glitch/Glitch/BUG-Bounty/PRIVATE/Deployed/Token';
const args=Object.fromEntries(process.argv.slice(2).reduce<string[][]>((a,v,i,all)=>{if(v.startsWith('--'))a.push([v.slice(2),all[i+1]??'']);return a},[]));
const prompt=createInterface({input,output});
async function value(key:string,label:string):Promise<string>{return args[key]||await prompt.question(`${label}: `)}
function validChunkSize(v:string|undefined):number{if(v===undefined)return 2000;const n=Number(v);if(!Number.isSafeInteger(n)||n<1||n>10000)throw new Error('Chunk size must be an integer from 1 to 10000 blocks');return n;}
async function main(){
 let network:Network|undefined,provider:JsonRpcProvider|undefined,latestBlock=0;const errors:string[]=[];let pairs:Pair[]=[];let fromBlock=0,toBlock=0;
 try{
  let key=(await value('network','Network (bsc, ethereum, base, arbitrum, optimism, polygon)')).trim().toLowerCase();if(!NETWORKS[key])throw new Error(`Unsupported network "${key}". Choose: ${Object.keys(NETWORKS).join(', ')}`);network=NETWORKS[key];
  const rpc=(args.rpc||process.env[`${key.toUpperCase()}_RPC_URL`]||await prompt.question('RPC URL: ')).trim();
  const chunkSize=validChunkSize(args['chunk-size']);
  const selected=network;
  const connected=await connectRpc(rpc,selected.chainId);provider=connected.provider;latestBlock=connected.latestBlock;
  console.log(`LAST_BLOCK: ${latestBlock}`);
  const fromValue=args['from-block']??await prompt.question('BLOCK_RANGE_FROM: ');
  const toValue=args['to-block']??await prompt.question('BLOCK_RANGE_TO: ');
  ({fromBlock,toBlock}=parseBlockRange(fromValue.trim(),toValue.trim(),latestBlock));
  console.log(`Scanning ${selected.name} blocks ${fromBlock}–${toBlock}`);
  for(const factory of selected.factories){try{
    const deployment=await findDeploymentBlock(provider,factory.address,toBlock);factory.deploymentBlock=deployment;const actualStart=Math.max(fromBlock,deployment);if(actualStart>toBlock)continue;
    console.log(`${factory.dex} V2 factory ${factory.address} (deployed at block ${deployment}); querying ${actualStart}–${toBlock}`);
    await scanFactory(provider,factory,actualStart,toBlock,chunkSize,batch=>pairs.push(...batch));
  }catch(e){factory.deploymentBlock='Unknown';const msg=`${factory.dex} V2 scan failed: ${String(e)}`;console.error(msg);errors.push(msg);}}
  pairs=[...new Map(pairs.map(p=>[`${selected.chainId}:${p.pair.toLowerCase()}`,p])).values()];
  const discoveredPairCount=pairs.length;const date=new Date();const now=Math.floor(date.getTime()/1000);
  let pairsChecked=0;const includedPairs:PairWithBalances[]=[];let tokens:TokenRow[]=[];
  const slug=key;const path=join(REPORT_DIR,`token-discovery-${slug}-${date.toISOString().slice(0,10)}.md`);await mkdir(REPORT_DIR,{recursive:true});
  const tokenAddresses=()=>dedupeTokens(includedPairs,selected.chainId);
  const unknownToken=(address:string):TokenRow=>({address,name:'Unknown',symbol:'Unknown',decimals:'Unknown',totalSupply:'Unknown',verification:'Unknown',proxy:'Unknown',deploymentTimestamp:null,ageDays:null});
  const currentTokens=()=>tokenAddresses().map(address=>tokens.find(t=>t.address.toLowerCase()===address.toLowerCase())??unknownToken(address));
  const writeCurrentReport=()=>writeFile(path,renderReport({network:selected,fromBlock,toBlock,timestamp:date,pairs:includedPairs,discoveredPairCount,pairsChecked,balanceBlock:latestBlock,tokens:currentTokens(),errors}), 'utf8');
  await writeCurrentReport();console.log(`Pair scan complete: ${discoveredPairCount} pairs. Reading token balances at block ${latestBlock}; only pairs with both balances above zero will be reported.`);
  for(let i=0;i<pairs.length;i++){
    const pair=pairs[i]!;
    try{
      const withBalances=await getPairBalances(provider,pair,latestBlock);
      if(withBalances.hasBothBalances)includedPairs.push(withBalances);
    }catch(e){errors.push(`Pair ${pair.pair} balance lookup: ${String(e)}`);}
    pairsChecked++;
    if((i+1)%10===0||i+1===pairs.length){await writeCurrentReport();console.log(`Pair balances ${i+1}/${discoveredPairCount}; ${includedPairs.length} pairs have both nonzero balances; report updated`);}
  }
  const includedTokenAddresses=tokenAddresses();
  tokens=includedTokenAddresses.map(unknownToken);
  await writeCurrentReport();console.log(`Balance filter complete: ${includedPairs.length}/${discoveredPairCount} pairs included; ${includedTokenAddresses.length} unique tokens. Report saved to ${path}`);
  for(let i=0;i<includedTokenAddresses.length;i++){const address=includedTokenAddresses[i]!;try{
    console.log(`Token metadata ${i+1}/${includedTokenAddresses.length}: ${address}`);
    const metadata=await getTokenMetadata(provider,address);tokens[i]={...metadata,verification:'Unknown',proxy:'Unknown',deploymentTimestamp:null,ageDays:null};console.log(`Contract verification/deployment lookup ${i+1}/${includedTokenAddresses.length}`);
    const info=await getContractInfo(selected,address,process.env[selected.apiKeyEnv]||process.env.ETHERSCAN_API_KEY,provider,now);tokens[i]={...metadata,...info};
  }catch(e){errors.push(`Token ${address}: ${String(e)}`);}
  if((i+1)%10===0||i+1===includedTokenAddresses.length){await writeCurrentReport();console.log(`Token details ${i+1}/${includedTokenAddresses.length}; report updated`);}}
  await writeCurrentReport();console.log(`Report written to ${path}`);
  if(errors.length)process.exitCode=2;
 }finally{prompt.close();if(provider)await provider.destroy();}
}
main().catch(e=>{console.error(`Scan failed: ${String(e)}`);process.exitCode=1});
