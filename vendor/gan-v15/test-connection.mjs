import assert from 'node:assert/strict';
import {cipherFor,macOf,matches,nameCandidates,searchPackets} from './dist/recovery-core.js';
import {readAdvertisement,validFacelets,connectCube,detectProtocol} from './dist/connection.js';
import {GEN2_SERVICE,GEN2_NOTIFY,GEN3_SERVICE,GEN4_SERVICE} from './dist/gan-driver.js';
function put(a,offset,n,value){for(let i=0;i<n;i++){const p=offset+i;const bit=(value>>>(n-1-i))&1;a[p>>3]=(a[p>>3]&~(1<<(7-(p&7))))|(bit<<(7-(p&7)));}}
function packetsFor(mac){const cipher=cipherFor(mac);return Array.from({length:5},(_,i)=>{const a=new Uint8Array(20);put(a,0,4,2);put(a,4,8,10+i);for(let j=0;j<7;j++)put(a,12+j*5,5,(10+i-j)%12);for(let j=0;j<7;j++)put(a,47+j*16,16,350);return Array.from(cipher.encrypt(a));});}
const mac='AB:12:34:07:51:5B',packets=packetsFor(mac);
assert.equal(nameCandidates('GAN-7515b')[0],mac);
assert(matches(cipherFor(mac),packets));assert(!matches(cipherFor(macOf(99)),packets));assert(!matches(cipherFor(mac),packets.slice(0,1)));
assert(!matches(cipherFor(mac),[packets[0],packets[0],...packets.slice(2)]));
assert.equal((await searchPackets(packets,'GAN-7515b')).mac,mac);
const started=performance.now();const recovered=await searchPackets(packetsFor('AB:12:34:00:02:03'),'GANicXXX',()=>{},[0]);
assert.equal(recovered.mac,'AB:12:34:00:02:03');console.log('PASS recovery search, elapsed ms:',Math.round(performance.now()-started));
const manufacturer=new Map([[1,new DataView(Uint8Array.from([0,0,0,0x5b,0x51,7,0x34,0x12,0xab]).buffer)]]);
assert.equal(readAdvertisement(manufacturer),mac);assert.equal(readAdvertisement(new Map()),null);
const state={type:'FACELETS',facelets:'U'.repeat(9)+'R'.repeat(9)+'F'.repeat(9)+'D'.repeat(9)+'L'.repeat(9)+'B'.repeat(9),state:{CP:[0,1,2,3,4,5,6,7],CO:Array(8).fill(0),EP:Array.from({length:12},(_,i)=>i),EO:Array(12).fill(0)}};
assert(validFacelets(state));assert(!validFacelets({...state,facelets:'U'.repeat(54)}));assert(!validFacelets({...state,state:{...state.state,CO:[1,0,0,0,0,0,0,0]}}));
// End-to-end fake BLE: no advertisement API, passive recovery, state verification,
// persistence and reconnect without another five turns. No physical device used.
class Characteristic extends EventTarget{async startNotifications(){if(this.started)return;this.started=true;packets.forEach((raw,i)=>setTimeout(()=>this.deliver(raw),10*(i+1)));}async stopNotifications(){this.started=false;}deliver(raw){this.value=new DataView(Uint8Array.from(raw).buffer);this.dispatchEvent(new Event('characteristicvaluechanged'));}}
const notify=new Characteristic();const writes=[];const cipher=cipherFor(mac);
const write={async writeValue(bytes){writes.push(cipher.decrypt(bytes));if(writes.at(-1)[0]===4){const a=new Uint8Array(20);put(a,0,4,4);put(a,4,8,15);for(let i=0;i<7;i++){put(a,12+i*3,3,i);put(a,33+i*2,2,0)}for(let i=0;i<11;i++){put(a,47+i*4,4,i);put(a,91+i,1,0)}setTimeout(()=>notify.deliver(cipher.encrypt(a)),1);}}};
const device=new EventTarget();device.id='test-cube';device.name='GAN-7515b';device.gatt={connected:false,async connect(){this.connected=true;return this},async getPrimaryServices(){return [service]},async getPrimaryService(id){assert.equal(id,GEN2_SERVICE);return service},disconnect(){this.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'))}};
const service={uuid:GEN2_SERVICE,async getCharacteristic(id){return id===GEN2_NOTIFY?notify:write}};const values={};globalThis.localStorage={getItem:k=>values[k],setItem:(k,v)=>values[k]=v};Object.defineProperty(globalThis,'navigator',{value:{bluetooth:{async requestDevice(){return device}}},configurable:true});
const stages=[];const result=await connectCube({onProgress:s=>stages.push(s)});assert(validFacelets(result.state));assert(stages.includes('turns'));assert.equal(JSON.parse(values['gan-fa-addresses'])['test-cube'],mac);assert.equal(writes.length,1);await result.connection.disconnect();
const reconnectStages=[];const second=await connectCube({onProgress:s=>reconnectStages.push(s)});assert(!reconnectStages.includes('turns'));await second.connection.disconnect();
const controller=new AbortController();controller.abort();await assert.rejects(()=>connectCube({signal:controller.signal}),e=>e.name==='AbortError');
console.log('PASS: five-packet validation, name recovery, full 65K range, invalid state rejection, fake BLE handshake, cached reconnect, cancellation');

for(const version of [3,4]){
 const cipher=cipherFor(mac);const frames=Array.from({length:5},(_,i)=>{const p=new Uint8Array(version===3?16:20);const offset=version===3?3:2;if(version===3)p.set([0x55,1,7]);else p.set([1,7]);const dv=new DataView(p.buffer);dv.setUint32(offset,1000+i*400,true);dv.setUint16(offset+4,50+i,true);p[offset+6]=[1,2,4,8,16][i];return Array.from(cipher.encrypt(p))});
 assert(matches(cipher,frames,version));assert(!matches(cipherFor(macOf(2)),frames,version));assert(!matches(cipher,frames,2));assert.equal((await searchPackets(frames,'GAN-7515b',()=>{},undefined,version)).mac,mac);
 const uuid=version===3?GEN3_SERVICE:GEN4_SERVICE;let requested=null;const fake={gatt:{async connect(){return this},async getPrimaryServices(){return [{uuid,async getCharacteristic(id){requested=id}}]}}};const selected=await detectProtocol(fake);assert.equal(selected.version,version);await selected.service.getCharacteristic(selected.notify);assert.equal(requested,version===3?'8653000b-43e6-47b7-9cb0-5fc21d4ae340':'0000fff6-0000-1000-8000-00805f9b34fb');
}
await assert.rejects(()=>detectProtocol({gatt:{async connect(){return this},async getPrimaryServices(){return [{uuid:'unexpected-service'}]}}}),/unexpected-service/);
console.log('PASS: Gen3/Gen4 discovery, encrypted five-frame recovery, correct notification UUID and unsupported service diagnostics');

let enumerations=0;const individual={uuid:GEN4_SERVICE};const individualOnly={gatt:{async connect(){return this},async getPrimaryServices(){enumerations++;throw new DOMException('No Services found in device.','NotFoundError')},async getPrimaryService(uuid){if(uuid===GEN4_SERVICE)return individual;throw new DOMException('absent','NotFoundError')},disconnect(){}}};assert.equal((await detectProtocol(individualOnly)).version,4);assert.equal(enumerations,1);
let retries=0;const retryDevice={gatt:{async connect(){retries++;return this},async getPrimaryServices(){if(retries===2)return [{uuid:GEN2_SERVICE}];throw new DOMException('none','NotFoundError')},async getPrimaryService(){throw new DOMException('none','NotFoundError')},disconnect(){}}};assert.equal((await detectProtocol(retryDevice)).version,2);assert.equal(retries,2);
console.log('PASS: individual service discovery after Chrome enumeration failure and bounded reconnect');

// Chrome can leave requestDevice unresolved: cancellation must not await it.
let finishPicker,requestCount=0,lateGattCalls=0;
const lateDevice={id:'late',gatt:{connect(){lateGattCalls++;throw new Error('obsolete selection connected')},disconnect(){}}};
navigator.bluetooth.requestDevice=()=>{requestCount++;return new Promise(resolve=>{finishPicker=resolve})};
const pickerAbort=new AbortController();const waiting=connectCube({signal:pickerAbort.signal});pickerAbort.abort();await assert.rejects(waiting,e=>e.name==='AbortError');
await assert.rejects(()=>connectCube(),e=>e.name==='PickerPendingError');assert.equal(requestCount,1);
finishPicker(lateDevice);await new Promise(r=>setTimeout(r,0));assert.equal(lateGattCalls,0);
const timed=connectCube({selectionTimeoutMs:20});await assert.rejects(timed,e=>e.name==='TimeoutError'&&e.operation==='select');finishPicker(lateDevice);await new Promise(r=>setTimeout(r,0));assert.equal(lateGattCalls,0);
navigator.bluetooth.requestDevice=async()=>{throw new DOMException('user cancelled','NotFoundError')};await assert.rejects(()=>connectCube(),e=>e.name==='NotFoundError');
let stopped=0;const stalled={name:'GAN',gatt:{connect:()=>new Promise(()=>{}),disconnect(){stopped++}}};
await assert.rejects(()=>detectProtocol(stalled,()=>{},undefined,20),e=>e.name==='TimeoutError'&&e.operation==='connect');assert.equal(stopped,1);
const discoveryAbort=new AbortController();const discovering=detectProtocol(stalled,()=>{},discoveryAbort.signal);discoveryAbort.abort();await assert.rejects(discovering,e=>e.name==='AbortError');assert.equal(stopped,2);
console.log('PASS unresolved chooser cancellation, duplicate native request blocked, obsolete selection ignored, selection deadline, stalled discovery timeout and cancellation');
