import { Contract, type JsonRpcProvider } from 'ethers';
export type TokenMetadata={address:string;name:string;symbol:string;decimals:string;totalSupply:string};
const ABI=['function name() view returns (string)','function symbol() view returns (string)','function decimals() view returns (uint8)','function totalSupply() view returns (uint256)'];
export async function readOptionalField(fn:()=>Promise<unknown>):Promise<string>{try{return String(await fn())}catch{return 'Unknown'}}
export async function getTokenMetadata(provider:JsonRpcProvider,address:string):Promise<TokenMetadata>{const c=new Contract(address,ABI,provider);const [name,symbol,decimals,totalSupply]=await Promise.all(['name','symbol','decimals','totalSupply'].map(m=>readOptionalField(()=>c[m]())));return{address,name,symbol,decimals,totalSupply};}
export function dedupeTokens(pairs:{token0:string;token1:string}[],chainId:number):string[]{return [...new Set(pairs.flatMap(p=>[p.token0,p.token1]).map(a=>`${chainId}:${a.toLowerCase()}`))].map(s=>s.slice(String(chainId).length+1));}
