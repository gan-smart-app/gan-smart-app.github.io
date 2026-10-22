import {Gen2Cipher,GAN_KEYS} from './gan-driver.js?v=15';
export const macOf = n => 'AB:12:34:'+[(n>>>16)&255,(n>>>8)&255,n&255].map(v=>v.toString(16).padStart(2,'0')).join(':').toUpperCase();
export function nameCandidates(name){
  const out=[];const modern=/^GAN-([0-9a-f]{5,6})$/i.exec(name||'');
  if(modern)out.push(macOf(parseInt(modern[1],16)));
  const legacy=/^GANic([0-9A-Za-z]{3})$/.exec(name||'');
  if(legacy&&legacy[1]!=='XXX'){const chars='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';let n=0;for(const c of legacy[1])n=n*62+chars.indexOf(c);out.push(macOf(n));}
  return out;
}
export function cipherFor(mac){return new Gen2Cipher(new Uint8Array(GAN_KEYS[0].key),new Uint8Array(GAN_KEYS[0].iv),new Uint8Array(mac.split(':').map(v=>parseInt(v,16)).reverse()))}
export function bits(a,pos,n){let v=0;for(let i=0;i<n;i++)v=v*2+((a[(pos+i)>>3]>>(7-((pos+i)&7)))&1);return v;}
// Require five different, consecutive Gen2 move frames with consistent history.
// No command is written to the cube until a unique candidate passes validation.
export function matches(cipher,packets,protocol=2){
  if(protocol!==2)return matchesModern(cipher,packets,protocol);
  if(packets.length<5)return false;let previous=null;
  for(const raw of packets){if(raw.length!==20)return false;const p=cipher.decrypt(new Uint8Array(raw));if(bits(p,0,4)!==2)return false;
    const serial=bits(p,4,8),moves=Array.from({length:7},(_,i)=>bits(p,12+i*5,5));if(moves.some(v=>v>=12))return false;
    if(previous){const delta=(serial-previous.serial)&255;if(delta<1||delta>7)return false;for(let i=delta;i<7;i++)if(moves[i]!==previous.moves[i-delta])return false;}
    previous={serial,moves};
  }return true;
}
export function matchesModern(cipher,packets,protocol){
 if(packets.length<5)return false;let previous=null,moves=0;
 for(const raw of packets){if(raw.length!==(protocol===3?16:20))return false;const p=cipher.decrypt(new Uint8Array(raw));
  let offset;if(protocol===3){if(p[0]!==0x55||p[1]!==1||p[2]<7||p[2]>13)return false;offset=3}else{if(p[0]!==1||p[1]<7||p[1]>18)return false;offset=2}
  const serial=p[offset+4]|(p[offset+5]<<8),code=p[offset+6];if((code>>6)>1||![1,2,4,8,16,32].includes(code&63))return false;
  const time=(p[offset]|p[offset+1]<<8|p[offset+2]<<16|p[offset+3]<<24)>>>0;
  if(previous){const delta=(serial-previous.serial)&65535,dt=(time-previous.time)>>>0;if(delta<1||delta>7||dt===0||dt>120000)return false;}previous={serial,time};moves++;
 }return moves>=5;
}
export async function searchPackets(packets,name,onProgress=()=>{},prefixes,protocol=2){
  const fast=nameCandidates(name);for(const mac of fast)if(matches(cipherFor(mac),packets,protocol))return {mac,checked:fast.length,method:'name'};
  const priority=[0,1,2,3,90,91,92,93];
  // Historical i Carry devices use AB:12:34. Newer address families may differ.
  const ranges=prefixes||[...priority,...Array.from({length:256},(_,i)=>i).filter(i=>!priority.includes(i))];let checked=0;let found=null;
  for(const prefix of ranges){for(let lo=0;lo<65536;lo++){
    const mac=macOf((prefix<<16)|lo);if(matches(cipherFor(mac),packets,protocol)){if(found&&found!==mac){const canonical=v=>v.split(':').map(x=>parseInt(x,16)%255).join(':');if(canonical(found)!==canonical(mac))return {mac:null,ambiguous:true,checked};}else found=mac;}
    checked++;if((lo&4095)===4095){onProgress(checked,ranges.length*65536);await new Promise(r=>setTimeout(r,0));}
  }if(found)return {mac:found,checked,method:'search'};}
  return {mac:null,checked};
}
