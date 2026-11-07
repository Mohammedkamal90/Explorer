import type { Network } from '../config/networks.js';
import type { JsonRpcProvider } from 'ethers';
import { findDeploymentBlock } from '../core/block-range.js';
export type Verification='Verified'|'Unverified'|'Unknown';export type ProxyStatus='Proxy'|'Implementation'|'Unknown';
export type ContractInfo={verification:Verification;proxy:ProxyStatus;deploymentTimestamp:number|null;ageDays:number|null};
type ScanResult={SourceCode?:string;Proxy?:string;Implementation?:string};
const zero='0x0000000000000000000000000000000000000000';
export function classifyVerification(row:ScanResult|undefined,message=''):Verification{return row?(row.SourceCode&&row.SourceCode!=='Contract source code not verified'?'Verified':'Unverified'):(message.toLowerCase().includes('not verified')?'Unverified':'Unknown');}
export function classifyProxy(row:ScanResult|undefined):ProxyStatus{if(!row)return'Unknown';if(row.Proxy==='1'&&row.Implementation&&row.Implementation.toLowerCase()!==zero)return'Proxy';if(row.Proxy==='0')return'Implementation';return'Unknown';}
async function api(url:URL):Promise<any>{const r=await fetch(url,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error(`Explorer HTTP ${r.status}`);return r.json();}
function traceContainsCreatedAddress(traces:any,address:string):boolean{
 const wanted=address.toLowerCase();const visit=(node:any):boolean=>{
  if(!node)return false;
  const created=String(node.result?.address??node.result?.createdAddress??node.to??node.createdAddress??node.action?.to??'').toLowerCase();
  if((String(node.type??'').toLowerCase()==='create'||String(node.type??'').toUpperCase()==='CREATE'||String(node.type??'').toUpperCase()==='CREATE2')&&created===wanted)return true;
  return (node.result&&typeof node.result==='object'&&visit(node.result))||(Array.isArray(node.calls)&&node.calls.some(visit));
 };
 return Array.isArray(traces)?traces.some(visit):visit(traces);
}
export async function findCreationTimestamp(provider:JsonRpcProvider,address:string):Promise<number|null>{
 try{
  const top=await provider.getBlockNumber();const n=await findDeploymentBlock(provider,address,top);const block=await provider.getBlock(n,true);if(!block)return null;
  for(const tx of block.prefetchedTransactions){if(tx.to!==null)continue;const receipt=await provider.getTransactionReceipt(tx.hash);if(receipt?.contractAddress?.toLowerCase()===address.toLowerCase())return block.timestamp;}
  const blockTag=`0x${n.toString(16)}`;
  try{const traces=await provider.send('trace_block',[blockTag]);if(traceContainsCreatedAddress(traces,address))return block.timestamp;}catch{}
  try{const traces=await provider.send('debug_traceBlockByNumber',[blockTag,{tracer:'callTracer'}]);if(traceContainsCreatedAddress(traces,address))return block.timestamp;}catch{}
 }catch{}
 return null;
}
export async function getContractInfo(network:Network,address:string,apiKey:string|undefined,provider:JsonRpcProvider,nowSeconds=Math.floor(Date.now()/1000)):Promise<ContractInfo>{
 let verification:Verification='Unknown',proxy:ProxyStatus='Unknown';
 if(apiKey)try{
  const u=new URL(network.explorerApi);u.searchParams.set('chainid',String(network.chainId));u.searchParams.set('module','contract');u.searchParams.set('action','getsourcecode');u.searchParams.set('address',address);u.searchParams.set('apikey',apiKey);
  const d=await api(u);const row:ScanResult=Array.isArray(d.result)?d.result[0]:undefined;
  verification=classifyVerification(row,String(d.message??''));proxy=classifyProxy(row);
 }catch{}
 let ts:number|null=null;
 if(apiKey)try{
  const cu=new URL(network.explorerApi);cu.searchParams.set('chainid',String(network.chainId));cu.searchParams.set('module','contract');cu.searchParams.set('action','getcontractcreation');cu.searchParams.set('contractaddresses',address);cu.searchParams.set('apikey',apiKey);
  const c=await api(cu);const creation=Array.isArray(c.result)?c.result[0]:undefined;
  if(creation?.txHash){const rec=await provider.getTransactionReceipt(creation.txHash);if(rec){const b=await provider.getBlock(rec.blockNumber);if(b)ts=b.timestamp;}}
 }catch{}
 if(ts===null)ts=await findCreationTimestamp(provider,address);
 return{verification,proxy,deploymentTimestamp:ts,ageDays:ts===null?null:Math.max(0,(nowSeconds-ts)/86400)};
}
export function calcAgeDays(deployedAt:number,now:number):number{return Math.max(0,(now-deployedAt)/86400)}
