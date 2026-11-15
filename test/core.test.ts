import { describe,it,expect,vi } from 'vitest';
import { JsonRpcProvider } from 'ethers';
import { decodePairCreated,FACTORY_IFACE,scanFactory,isRateLimitError,parseLogRangeLimit } from '../src/discovery/pair-scanner.js';
import { dedupeTokens,readOptionalField } from '../src/discovery/token-metadata.js';
import { calcAgeDays,classifyProxy,classifyVerification,findCreationTimestamp } from '../src/discovery/contract-info.js';
import { renderReport } from '../src/report/markdown.js';
import { NETWORKS } from '../src/config/networks.js';
import { findBlockAtOrAfter,parseBlockRange } from '../src/core/block-range.js';
import { retry } from '../src/core/rpc.js';
const factory=NETWORKS.ethereum.factories[0]!;
function logAt(blockNumber:number,token='00000000000000000000000000000000000000aa'){
 const encoded=FACTORY_IFACE.encodeEventLog(FACTORY_IFACE.getEvent('PairCreated')!,[`0x${token}`,'0x00000000000000000000000000000000000000bb','0x0000000000000000000000000000000000000003',1n]);
 return{topics:encoded.topics,data:encoded.data,blockNumber,transactionHash:`0x${String(blockNumber).padStart(64,'0')}`};
}
describe('pair discovery primitives',()=>{
 it('decodes PairCreated and extracts token0/token1',()=>{const p=decodePairCreated(logAt(12),factory)!;expect(p.token0.toLowerCase()).toBe('0x00000000000000000000000000000000000000aa');expect(p.token1.toLowerCase()).toBe('0x00000000000000000000000000000000000000bb');expect(p.blockNumber).toBe(12);});
 it('deduplicates tokens across multiple pairs and addresses with different casing',()=>expect(dedupeTokens([{token0:'0xAA',token1:'0xBB'},{token0:'0xaa',token1:'0xCC'}],1)).toEqual(['0xaa','0xbb','0xcc']));
 it('calculates timestamp based block range with binary search without starting before the requested timestamp',async()=>{const times=[10,20,30,40,50];const p={getBlockNumber:async()=>4,getBlock:async(n:number)=>({timestamp:times[n]})};expect(await findBlockAtOrAfter(p as never,35)).toBe(3);});
 it('validates a user-entered block interval against LAST_BLOCK',()=>{expect(parseBlockRange('100','200',200)).toEqual({fromBlock:100,toBlock:200});expect(()=>parseBlockRange('201','200',300)).toThrow('less than or equal');expect(()=>parseBlockRange('100','201',200)).toThrow('cannot exceed LAST_BLOCK');expect(()=>parseBlockRange('1.5','2',10)).toThrow('non-negative integer');});
 it('chunks getLogs ranges, keeps the successful size, and preserves unique events',async()=>{const getLogs=vi.fn(async(f:{fromBlock:number;toBlock:number})=>{if(f.toBlock-f.fromBlock>1)throw Error('range too large');return f.fromBlock<=2&&f.toBlock>=2?[logAt(2),logAt(2)]:[];});const p={getLogs};const rows=await scanFactory(p as never,factory,1,4,4);expect(rows).toHaveLength(1);expect(getLogs).toHaveBeenCalledWith(expect.objectContaining({fromBlock:1,toBlock:4}));expect(getLogs).toHaveBeenCalledWith(expect.objectContaining({fromBlock:3,toBlock:4}));});
 it('delivers completed chunks to the partial-result callback before a later failure',async()=>{const getLogs=vi.fn(async(f:{fromBlock:number;toBlock:number})=>{if(f.fromBlock>=2)throw Error('provider unavailable');return[logAt(1)];});const batches:unknown[]=[];await expect(scanFactory({getLogs} as never,factory,1,3,1,batch=>batches.push(...batch))).rejects.toThrow('one-block range 2–2');expect(batches).toHaveLength(1);});
 it('retries transient RPC errors with backoff',async()=>{let calls=0;const value=await retry(async()=>{calls++;if(calls<3)throw Error('temporary');return'OK'},3,1);expect(value).toBe('OK');expect(calls).toBe(3);});
 it('recognizes provider range caps and compute-unit throttling',()=>{const range={info:{error:{message:'Free tier supports up to a 10 block range'}}};expect(parseLogRangeLimit(range)).toBe(10);expect(isRateLimitError(Error('exceeded its compute units per second capacity'))).toBe(true);});
 it('finds top-level token creation without scanning every transaction receipt',async()=>{const address='0x00000000000000000000000000000000000000aa';const p={getBlockNumber:async()=>0,getCode:async()=> '0x01',getBlock:async()=>({timestamp:123,prefetchedTransactions:[{to:null,hash:'0xtx'}]}),getTransactionReceipt:async()=>({contractAddress:address}),send:vi.fn()};expect(await findCreationTimestamp(p as never,address)).toBe(123);expect(p.send).not.toHaveBeenCalled();});
 it('uses one block trace for internal contract creation',async()=>{const address='0x00000000000000000000000000000000000000aa';const p={getBlockNumber:async()=>0,getCode:async()=> '0x01',getBlock:async()=>({timestamp:456,prefetchedTransactions:[{to:'0x00000000000000000000000000000000000000bb',hash:'0xtx'}]}),getTransactionReceipt:vi.fn(),send:async(method:string)=>method==='trace_block'?[{type:'create',result:{address}}]:[]};expect(await findCreationTimestamp(p as never,address)).toBe(456);expect(p.getTransactionReceipt).not.toHaveBeenCalled();});
 it('retains failed token metadata fields as Unknown',async()=>{expect(await readOptionalField(async()=>{throw Error('reverted')})).toBe('Unknown');expect(await readOptionalField(async()=>18)).toBe('18');});
});
describe('explorer classification and reports',()=>{
 it('classifies verified, unverified, and unknown source status',()=>{expect(classifyVerification({SourceCode:'contract X {}'})).toBe('Verified');expect(classifyVerification({SourceCode:''})).toBe('Unverified');expect(classifyVerification(undefined,'Contract source code not verified')).toBe('Unverified');expect(classifyVerification(undefined,'error')).toBe('Unknown');});
 it('classifies proxy, implementation/non-proxy, and unknown proxy status',()=>{expect(classifyProxy({Proxy:'1',Implementation:'0x0000000000000000000000000000000000000001'})).toBe('Proxy');expect(classifyProxy({Proxy:'0'})).toBe('Implementation');expect(classifyProxy({Proxy:'1'})).toBe('Unknown');expect(classifyProxy(undefined)).toBe('Unknown');});
 it('calculates age in days from deployment timestamp',()=>expect(calcAgeDays(100,100+86400*4)).toBe(4));
 it('generates Markdown summary, token and associated-pair sections',()=>{const report=renderReport({network:NETWORKS.ethereum,fromBlock:2,toBlock:3,timestamp:new Date('2026-01-01T00:00:00Z'),pairs:[{dex:'Uniswap',version:'V2',token0:'0xaa',token1:'0xbb',pair:'0xcc',blockNumber:3,transactionHash:'0xtx'}],tokens:[{address:'0xaa',name:'A',symbol:'A',decimals:'18',totalSupply:'100',verification:'Verified',proxy:'Implementation',deploymentTimestamp:100,ageDays:1}],errors:[]});expect(report).toContain('Block range: 2–3');expect(report).toContain('| 1 | A | A | `0xaa` | Verified');expect(report).toContain('| Uniswap V2 | [`0xcc`](https://etherscan.io/address/0xcc) | `0xaa` | `0xbb` | 3 |');});
});
const integration=process.env.INTEGRATION_RPC_URL;
describe('real network integration',()=>{
 (integration?it:it.skip)('connects to a real Ethereum RPC and retrieves block data',async()=>{const provider=new JsonRpcProvider(integration);expect(Number((await provider.getNetwork()).chainId)).toBe(1);expect(await provider.getBlockNumber()).toBeGreaterThan(0);await provider.destroy();});
});
