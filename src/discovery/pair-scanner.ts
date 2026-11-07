import { Interface, type JsonRpcProvider } from 'ethers';
import type { DexFactory } from '../config/networks.js';
export const FACTORY_IFACE=new Interface(['event PairCreated(address indexed token0,address indexed token1,address pair,uint256)']);
export type Pair={dex:string;version:string;token0:string;token1:string;pair:string;blockNumber:number;transactionHash:string};
function safeRpcError(error:unknown):string{
  const e=error as {shortMessage?:string;info?:{error?:{message?:string};responseBody?:string};error?:{message?:string};message?:string};
  let body='';try{body=JSON.parse(e?.info?.responseBody??'{}')?.error?.message??''}catch{}
  return String(e?.info?.error?.message||e?.error?.message||body||e?.shortMessage||e?.message||error).replace(/https?:\/\/[^\s"']+/g,'[RPC endpoint]');
}
export function isRateLimitError(error:unknown):boolean{return /compute units per second|rate.?limit|too many requests|throttl|\b429\b/i.test(safeRpcError(error));}
export function parseLogRangeLimit(error:unknown):number|undefined{const m=safeRpcError(error).match(/up to (?:a|an)\s+(\d+)\s+block range/i);const n=m?Number(m[1]):NaN;return Number.isSafeInteger(n)&&n>0?n:undefined;}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));let nextLogRequestAt=0;
async function queryLogs(provider:JsonRpcProvider,filter:Parameters<JsonRpcProvider['getLogs']>[0]){
  let retried=0;
  while(true){const wait=Math.max(0,nextLogRequestAt-Date.now());if(wait)await sleep(wait);nextLogRequestAt=Date.now()+300;
    try{return await provider.getLogs(filter)}catch(e){const message=safeRpcError(e);const rateLimited=isRateLimitError(e);const transient=/\b5\d\d\b|timeout|temporar|ECONNRESET|ETIMEDOUT|socket/i.test(message);
      if((rateLimited||transient)&&retried<5){const delay=rateLimited?Math.min(30_000,1000*2**retried):Math.min(10_000,500*2**retried);retried++;nextLogRequestAt=Date.now()+delay;console.warn(`eth_getLogs ${rateLimited?'rate limited':'temporarily failed'}; retry ${retried}/5 in ${delay/1000}s`);continue;}throw e;
    }
  }
}
export function decodePairCreated(log:{topics:readonly string[];data:string;blockNumber:number;transactionHash:string},factory:DexFactory):Pair|null{
  try{const p=FACTORY_IFACE.parseLog({topics:log.topics,data:log.data});if(!p)return null;return{dex:factory.dex,version:factory.version,token0:String(p.args.token0),token1:String(p.args.token1),pair:String(p.args.pair),blockNumber:log.blockNumber,transactionHash:log.transactionHash};}catch{return null;}
}
export async function scanFactory(provider:JsonRpcProvider,factory:DexFactory,from:number,to:number,chunkSize=2000,onPairs?:(pairs:Pair[])=>void):Promise<Pair[]>{
  const out:Pair[]=[];const seen=new Set<string>();let start=from,chunk=chunkSize,chunksDone=0,smallChunkWarning=false;
  while(start<=to){let end=Math.min(to,start+chunk-1);try{
    const logs=await queryLogs(provider,{address:factory.address,fromBlock:start,toBlock:end,topics:[FACTORY_IFACE.getEvent('PairCreated')!.topicHash]});
    const batch:Pair[]=[];for(const log of logs){const p=decodePairCreated(log,factory);if(!p)continue;const key=`${p.blockNumber}:${p.transactionHash}:${p.pair.toLowerCase()}`;if(!seen.has(key)){seen.add(key);out.push(p);batch.push(p);}}
    onPairs?.(batch);chunksDone++;start=end+1;
    const progressEvery=Math.max(1,Math.ceil(100_000/chunk));if(chunksDone%progressEvery===0||start>to)console.log(`${factory.dex} V2: scanned through block ${end}/${to}; ${out.length} pairs found (chunk ${chunk}, ${chunksDone} requests)`);
  }catch(e){const reason=safeRpcError(e);if(isRateLimitError(e))throw new Error(`eth_getLogs remained rate limited after backoff at blocks ${start}–${end}: ${reason}`);if(chunk>1){const advertisedLimit=parseLogRangeLimit(e);chunk=advertisedLimit?Math.min(chunk-1,advertisedLimit):Math.max(1,Math.floor(chunk/2));console.warn(`eth_getLogs blocks ${start}–${end} failed (${reason}); retrying with ${chunk}-block chunks`);if(chunk<=10&&!smallChunkWarning){smallChunkWarning=true;console.warn(`At ${chunk} blocks per request, about ${Math.ceil((to-start+1)/chunk).toLocaleString()} requests remain. A higher-range RPC plan may make this scan practical.`);}continue;}throw new Error(`eth_getLogs failed at one-block range ${start}–${end}: ${reason}`);}}
  return out;
}
