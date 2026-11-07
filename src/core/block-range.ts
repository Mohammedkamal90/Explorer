import type { JsonRpcProvider } from 'ethers';
export type BlockRange={fromBlock:number;toBlock:number};
export function parseBlockRange(fromValue:string,toValue:string,lastBlock:number):BlockRange{
 const decimal=/^\d+$/;
 if(!decimal.test(fromValue))throw new Error('BLOCK_RANGE_FROM must be a non-negative integer block number');
 if(!decimal.test(toValue))throw new Error('BLOCK_RANGE_TO must be a non-negative integer block number');
 const fromBlock=Number(fromValue),toBlock=Number(toValue);
 if(!Number.isSafeInteger(fromBlock)||!Number.isSafeInteger(toBlock))throw new Error('Block numbers must be safe integers');
 if(fromBlock>toBlock)throw new Error('BLOCK_RANGE_FROM must be less than or equal to BLOCK_RANGE_TO');
 if(toBlock>lastBlock)throw new Error(`BLOCK_RANGE_TO cannot exceed LAST_BLOCK (${lastBlock})`);
 return{fromBlock,toBlock};
}
export async function findBlockAtOrBefore(provider:JsonRpcProvider,targetTimestamp:number,low=0,high?:number):Promise<number>{
  let hi=high??await provider.getBlockNumber(); let lo=low;
  const first=await provider.getBlock(lo); if(!first)throw new Error(`Missing block ${lo}`);
  if(first.timestamp>=targetTimestamp)return lo;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);const b=await provider.getBlock(mid);if(!b)throw new Error(`Missing block ${mid}`);if(b.timestamp<=targetTimestamp)lo=mid;else hi=mid-1;}
  return lo;
}
export async function findBlockAtOrAfter(provider:JsonRpcProvider,targetTimestamp:number,low=0,high?:number):Promise<number>{
 let lo=low,hi=high??await provider.getBlockNumber();const last=await provider.getBlock(hi);if(!last)throw new Error(`Missing block ${hi}`);if(last.timestamp<targetTimestamp)return hi;
 while(lo<hi){const mid=Math.floor((lo+hi)/2);const b=await provider.getBlock(mid);if(!b)throw new Error(`Missing block ${mid}`);if(b.timestamp>=targetTimestamp)hi=mid;else lo=mid+1;}
 return lo;
}
export async function findDeploymentBlock(provider:JsonRpcProvider,address:string,high:number):Promise<number>{
  const code=await provider.getCode(address,high);if(code==='0x')throw new Error(`No contract code at factory ${address}`);
  let lo=0,hi=high;
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(await provider.getCode(address,mid)==='0x')lo=mid+1;else hi=mid;}
  return lo;
}
