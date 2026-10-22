import {searchPackets} from './recovery-core.js?v=15';
self.onmessage=async({data})=>{try{const result=await searchPackets(data.packets,data.name,(checked,total)=>self.postMessage({type:'progress',checked,total}),undefined,data.protocol);self.postMessage({type:'result',...result})}catch(e){self.postMessage({type:'error',message:e.message})}};
