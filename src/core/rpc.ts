import { JsonRpcProvider, isAddress } from 'ethers';
export async function connectRpc(url:string, chainId:number) {
  let parsed: URL; try { parsed = new URL(url); } catch { throw new Error('RPC URL must be a valid http(s) URL'); }
  if (!['http:','https:'].includes(parsed.protocol)) throw new Error('RPC URL must use HTTP or HTTPS');
  const provider = new JsonRpcProvider(url);
  const network = await provider.getNetwork();
  if (Number(network.chainId)!==chainId) { await provider.destroy(); throw new Error(`RPC chain ID ${network.chainId} does not match selected chain ${chainId}`); }
  const block = await provider.getBlockNumber();
  if (!Number.isSafeInteger(block)) throw new Error('RPC did not return a valid block number');
  const block0 = await provider.getBlock(block);
  if (!block0 || !Number.isFinite(block0.timestamp)) throw new Error('RPC block timestamp lookup failed');
  await provider.getLogs({fromBlock:block,toBlock:block});
  await provider.call({to:'0x0000000000000000000000000000000000000001',data:'0x'});
  await provider.getCode('0x0000000000000000000000000000000000000001',block);
  await provider.getTransactionReceipt(`0x${'0'.repeat(64)}`);
  if (!isAddress('0x0000000000000000000000000000000000000001')) throw new Error('RPC address validation unavailable');
  return {provider, latestBlock:block};
}
export async function retry<T>(fn:()=>Promise<T>, attempts=5, baseMs=300):Promise<T> {
  let error:unknown;
  for(let i=0;i<attempts;i++){try{return await fn()}catch(e){error=e;if(i+1<attempts)await new Promise(r=>setTimeout(r,baseMs*2**i));}}
  throw error;
}
