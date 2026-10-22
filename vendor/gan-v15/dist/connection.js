import {connectGanDevice,GEN2_SERVICE,GEN3_SERVICE,GEN4_SERVICE,GEN2_NOTIFY} from './gan-driver.js?v=15';
import {cipherFor,matches,nameCandidates} from './recovery-core.js?v=15';
import {connectLegacyCube} from './legacy-cube.js?v=15';
const validMac=v=>/^([\da-f]{2}:){5}[\da-f]{2}$/i.test(v||'');
const LEGACY_SERVICE='0000fff0-0000-1000-8000-00805f9b34fb',INFO_SERVICE='0000180a-0000-1000-8000-00805f9b34fb',NORDIC_SERVICE='6e400001-b5a3-f393-e0a9-e50e24dcca9e';
let lastDevice=null,pickerPending=false;
export async function forgetLastDevice(){if(!lastDevice)return false;if(typeof lastDevice.forget!=='function')throw new Error('برای این مرورگر، از تنظیمات سایت در Chrome مجوز بلوتوث را حذف کن.');lastDevice.gatt?.disconnect();await lastDevice.forget();try{const all=JSON.parse(localStorage.getItem('gan-fa-addresses')||'{}');delete all[lastDevice.id];localStorage.setItem('gan-fa-addresses',JSON.stringify(all))}catch{}lastDevice=null;return true;}
function abortError(){return new DOMException('اتصال لغو شد.','AbortError')}
function check(signal){if(signal?.aborted)throw abortError()}
// requestDevice has no AbortSignal: abandon our wait without starting a
// connection if Chrome later returns an obsolete selection.
function bluetoothOperation(fn,{signal,timeoutMs,label,onStop=()=>{}}){
 check(signal);
 return new Promise((resolve,reject)=>{
  let settled=false,timer;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value)};
  const stop=error=>{finish(error);onStop()};
  const abort=()=>stop(abortError());
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{const error=new DOMException(label==='select'?'انتخاب دستگاه پاسخی نداد. اگر پنجره بلوتوث باز نیست، صفحه را تازه‌سازی کن و دوباره تلاش کن.':'پاسخ بلوتوث هنگام '+label+' دریافت نشد؛ روبیک را با چند حرکت بیدار کن و دوباره تلاش کن.','TimeoutError');error.operation=label;stop(error)},timeoutMs);
  // Invoke immediately so Chrome retains the click's user activation.
  try{Promise.resolve(fn()).then(value=>finish(null,value),error=>finish(error))}catch(error){finish(error)}
 });
}
async function chooseDevice(options,signal,timeoutMs){
 if(pickerPending){const error=new Error('درخواست انتخاب قبلی هنوز در Chrome باز مانده است. پنجره قبلی را ببند؛ اگر پنجره‌ای نیست، صفحه را تازه‌سازی کن.');error.name='PickerPendingError';throw error;}
 return bluetoothOperation(()=>{
  pickerPending=true;
  try{return Promise.resolve(navigator.bluetooth.requestDevice(options)).finally(()=>{pickerPending=false})}catch(error){pickerPending=false;throw error;}
 },{signal,timeoutMs,label:'select'});
}
export function readAdvertisement(data){
  const entries=data instanceof DataView?[[0,new DataView(data.buffer,data.byteOffset+2,data.byteLength-2)]]:Array.from(data||[]);
  for(const [id,view] of entries){if((id===0||(id&255)===1)&&view.byteLength>=9){const a=[];for(let i=1;i<=6;i++)a.push(view.getUint8(view.byteLength-i).toString(16).padStart(2,'0'));return a.join(':').toUpperCase()}}return null;
}
async function advertisement(device,signal){
 if(typeof device.watchAdvertisements!=='function')return null;
 return new Promise((resolve,reject)=>{const controller=new AbortController();let timer;const finish=(mac,error)=>{clearTimeout(timer);device.removeEventListener('advertisementreceived',listener);signal?.removeEventListener('abort',abort);controller.abort();error?reject(error):resolve(mac)};const abort=()=>finish(null,abortError());const listener=e=>{const mac=readAdvertisement(e.manufacturerData);if(mac)finish(mac)};device.addEventListener('advertisementreceived',listener);signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>finish(null),12000);device.watchAdvertisements({signal:controller.signal}).catch(()=>finish(null));});
}
export async function detectProtocol(device,onProgress=()=>{},signal,timeoutMs=8000){
 const op=(label,fn)=>{onProgress('gatt',{name:device.name,operation:label});return bluetoothOperation(fn,{signal,timeoutMs,label,onStop:()=>device.gatt?.disconnect()})};
 const fatal=e=>{if(e.name==='AbortError'||e.name==='TimeoutError')throw e};
 let services=[];let failures=[];
 // Discover permitted services independently too: some Chrome/platform stacks
 // fail the all-services request even when individual discovery works.
 for(let attempt=0;attempt<2;attempt++){
  const server=await op('connect',()=>device.gatt.connect());try{services=await op('services',()=>server.getPrimaryServices())}catch(e){fatal(e);failures.push('all: '+e.name)}
  if(!services.length){for(const uuid of [GEN2_SERVICE,GEN3_SERVICE,GEN4_SERVICE,LEGACY_SERVICE,INFO_SERVICE,NORDIC_SERVICE]){try{services.push(await op('service '+uuid,()=>server.getPrimaryService(uuid)))}catch(e){fatal(e);failures.push(uuid+': '+e.name)}}}
  if(services.length)break;
  if(attempt===0){onProgress('reconnect');device.gatt.disconnect();await bluetoothOperation(()=>new Promise(r=>setTimeout(r,700)),{signal,timeoutMs:1000,label:'reconnect-wait'});}
 }
 const found=services.map(s=>s.uuid.toLowerCase());onProgress('services',{uuid:found.join(', ')||'none'});
 if(!services.length)throw new Error('هیچ سرویس بلوتوثی خوانده نشد؛ تشخیص پروتکل ممکن نیست. دکمه «بازنشانی مجوز روبیک» را بزن و دوباره دستگاه را انتخاب کن. جزئیات: '+failures.join(' | '));
 const candidates=[{version:2,uuid:GEN2_SERVICE,notify:GEN2_NOTIFY},{version:3,uuid:GEN3_SERVICE,notify:'8653000b-43e6-47b7-9cb0-5fc21d4ae340'},{version:4,uuid:GEN4_SERVICE,notify:'0000fff6-0000-1000-8000-00805f9b34fb'},{version:1,uuid:LEGACY_SERVICE}];
 const selected=candidates.find(c=>found.includes(c.uuid));if(!selected){let info='';const service=services.find(s=>s.uuid.toLowerCase()===INFO_SERVICE);if(service){for(const id of ['00002a24-0000-1000-8000-00805f9b34fb','00002a26-0000-1000-8000-00805f9b34fb','00002a28-0000-1000-8000-00805f9b34fb']){try{const ch=await op('characteristic '+id,()=>service.getCharacteristic(id));const v=await op('read '+id,()=>ch.readValue());info+=' | '+id+': '+new TextDecoder().decode(v)}catch(e){fatal(e)}}}throw new Error('سرویس دستگاه با مسیرهای فعلی سازگار نیست. UUIDهای قابل دسترس: '+found.join(', ')+info);}
 return {...selected,service:services.find(s=>s.uuid.toLowerCase()===selected.uuid)};
}
async function collectPackets(device,protocol,signal,onProgress){
 const characteristic=await protocol.service.getCharacteristic(protocol.notify);
 return new Promise((resolve,reject)=>{const packets=[];let timer;
 const cleanup=()=>{clearTimeout(timer);characteristic.removeEventListener('characteristicvaluechanged',listener);signal?.removeEventListener('abort',abort);device.removeEventListener('gattserverdisconnected',lost)};
 const fail=e=>{cleanup();characteristic.stopNotifications().catch(()=>{});reject(e)};
 const abort=()=>fail(abortError()),lost=()=>fail(new Error('ارتباط هنگام شناسایی قطع شد. دوباره تلاش کن.'));
 const listener=e=>{const v=e.target.value;if(v?.byteLength!==(protocol.version===3?16:20))return;const a=Array.from(new Uint8Array(v.buffer,v.byteOffset,v.byteLength));if(packets.some(p=>p.every((x,i)=>x===a[i])))return;packets.push(a);onProgress('turns',{count:packets.length,protocol:protocol.version});if(packets.length>=5){cleanup();characteristic.stopNotifications().then(()=>resolve(packets)).catch(reject)}};
 characteristic.addEventListener('characteristicvaluechanged',listener);signal?.addEventListener('abort',abort,{once:true});device.addEventListener('gattserverdisconnected',lost);timer=setTimeout(()=>fail(new Error('پنج حرکت دریافت نشد. CubeStation را ببند و دوباره امتحان کن.')),60000);
 characteristic.startNotifications().then(()=>{check(signal);onProgress('turns',{count:0})}).catch(fail);
 });
}
async function recover(device,packets,protocol,signal,onProgress){
 for(const mac of nameCandidates(device.name))if(matches(cipherFor(mac),packets,protocol.version))return mac;
 return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./recovery-worker.js?v=15',import.meta.url),{type:'module'});let timer;
 const finish=(mac,error)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(mac)};const abort=()=>finish(null,abortError());signal?.addEventListener('abort',abort,{once:true});worker.onerror=()=>finish(null,new Error('بازیابی خودکار اجرا نشد. صفحه را تازه‌سازی کن.'));
 worker.onmessage=({data})=>{if(data.type==='progress')onProgress('search',data);else if(data.type==='result')finish(data.mac);else finish(null,new Error(data.message))};timer=setTimeout(()=>finish(null,new Error('زمان بازیابی تمام شد. این خانواده آدرس هنوز شناسایی نشد.')),240000);worker.postMessage({packets,name:device.name,protocol:protocol.version});
 });
}
export async function connectCube({manualMac='',signal,onProgress=()=>{},selectionTimeoutMs=45000,operationTimeoutMs=8000}={}){
 check(signal);onProgress('select');
 const device=await chooseDevice({filters:[{namePrefix:'GAN'},{namePrefix:'MG'},{namePrefix:'AiCube'}],optionalServices:[GEN2_SERVICE,GEN3_SERVICE,GEN4_SERVICE,LEGACY_SERVICE,INFO_SERVICE,NORDIC_SERVICE],optionalManufacturerData:[0,...Array.from({length:256},(_,i)=>(i<<8)|1)]},signal,selectionTimeoutMs);check(signal);lastDevice=device;
 let connection=null;try{check(signal);onProgress('prepare',{name:device.name});const protocol=await detectProtocol(device,onProgress,signal,operationTimeoutMs);check(signal);onProgress('protocol',{name:device.name,protocol:protocol.version,uuid:protocol.uuid});
 if(protocol.version===1){onProgress('legacy',{name:device.name,protocol:1,uuid:protocol.uuid});const result=await connectLegacyCube(device,protocol.service,validFacelets,signal);connection=result.connection;check(signal);return result;}
 let cached=null;try{cached=JSON.parse(localStorage.getItem('gan-fa-addresses')||'{}')[device.id]}catch{}
 let mac=manualMac||cached;if(!validMac(mac)){onProgress('advertisement',{name:device.name});mac=await advertisement(device,signal)}check(signal);
 if(!mac){const packets=await collectPackets(device,protocol,signal,onProgress);check(signal);onProgress('search',{checked:0,total:16777216,protocol:protocol.version});mac=await recover(device,packets,protocol,signal,onProgress);if(!mac)throw new Error('آدرس این روبیک در محدوده‌های پشتیبانی‌شده پیدا نشد. گزارش اتصال را بفرست تا بررسی کنیم.');}
 check(signal);onProgress('verify');connection=await connectGanDevice(device,mac);
 // Do not label the device connected until a valid cube state is received.
 const state=await new Promise((resolve,reject)=>{let sub;const timer=setTimeout(()=>done(null,new Error('آدرس تأیید نشد؛ وضعیت معتبر روبیک دریافت نشد.')),7000);const done=(value,error)=>{clearTimeout(timer);sub?.unsubscribe();signal?.removeEventListener('abort',abort);error?reject(error):resolve(value)};const abort=()=>done(null,abortError());signal?.addEventListener('abort',abort,{once:true});sub=connection.events$.subscribe({next:e=>{if(e.type==='FACELETS'&&validFacelets(e))done(e);else if(e.type==='DISCONNECT')done(null,new Error('اتصال هنگام تأیید قطع شد.'))},error:e=>done(null,e)});connection.sendCubeCommand({type:'REQUEST_FACELETS'}).catch(e=>done(null,e));});
 check(signal);try{const all=JSON.parse(localStorage.getItem('gan-fa-addresses')||'{}');all[device.id]=mac;localStorage.setItem('gan-fa-addresses',JSON.stringify(all))}catch{}
 return {connection,state};
 }catch(e){if(connection)await connection.disconnect().catch(()=>{});else device.gatt?.disconnect();if(!manualMac){try{const all=JSON.parse(localStorage.getItem('gan-fa-addresses')||'{}');delete all[device.id];localStorage.setItem('gan-fa-addresses',JSON.stringify(all))}catch{}}throw e;}
}
export function validFacelets(e){
 if(typeof e.facelets!=='string'||e.facelets.length!==54||[...'URFDLB'].some(c=>[...e.facelets].filter(x=>x===c).length!==9))return false;
 const s=e.state;if(!s)return false;const permutation=(a,n)=>Array.isArray(a)&&a.length===n&&new Set(a).size===n&&a.every(v=>Number.isInteger(v)&&v>=0&&v<n);const parity=a=>a.reduce((n,v,i)=>n+a.slice(i+1).filter(w=>w<v).length,0)%2;
 return permutation(s.CP,8)&&permutation(s.EP,12)&&s.CO?.length===8&&s.CO.every(v=>Number.isInteger(v)&&v>=0&&v<3)&&s.CO.reduce((a,b)=>a+b,0)%3===0&&s.EO?.length===12&&s.EO.every(v=>v===0||v===1)&&s.EO.reduce((a,b)=>a+b,0)%2===0&&parity(s.CP)===parity(s.EP);
}
