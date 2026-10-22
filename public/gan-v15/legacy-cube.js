import {AES} from './gan-driver.js?v=15';
export const LEGACY_POLL_MS=500;
const uuid=n=>'0000'+n+'-0000-1000-8000-00805f9b34fb';
const KEYS=[[0xc6,0xca,0x15,0xdf,0x4f,0x6e,0x13,0xb6,0x77,0x0d,0xe6,0x59,0x3a,0xaf,0xba,0xa2],[0x43,0xe2,0x5b,0xd6,0x7d,0xdc,0x78,0xd8,0x07,0x60,0xa3,0xda,0x82,0x3c,0x01,0xf1]];
export function legacyKey(version,hardware){if(version.length<3||version[0]!==1||version[1]>1||hardware.length<6)throw new Error('نسخه پروتکل قدیمی پشتیبانی نمی‌شود.');const key=Uint8Array.from(KEYS[version[1]]);for(let i=0;i<6;i++)key[i]=(key[i]+hardware[5-i])&255;return key;}
export function legacyDecrypt(raw,key){const out=new Uint8Array(raw);if(out.length<=16)throw new Error('پیام قدیمی کوتاه‌تر از حد لازم است.');const aes=new AES.ModeOfOperation.ecb(key);out.set(aes.decrypt(out.slice(-16)),out.length-16);out.set(aes.decrypt(out.slice(0,16)),0);return out;}
export function legacyFacelets(bytes){if(bytes.length<18)throw new Error('وضعیت مکعب ناقص است.');let facelets='';for(let f=0;f<6;f++){const i=f*3;const word=(bytes[i^1]<<16)|(bytes[(i+1)^1]<<8)|bytes[(i+2)^1];for(let j=0;j<8;j++){if(j===4)facelets+='URFDLB'[f];const color=(word>>((7-j)*3))&7;if(color>=6)throw new Error('رنگ نامعتبر از روبیک دریافت شد.');facelets+='URFDLB'[color];}}return facelets;}
function cubeEvent(cube){const s=cube.toJSON();return {type:'FACELETS',timestamp:performance.now(),facelets:cube.asString(),state:{CP:s.cp,CO:s.co,EP:s.ep,EO:s.eo}};}
export async function connectLegacyCube(device,service,validate,signal,options={}){
 let key,stateChar,movesChar,batteryChar;
 let cube=null,lastCount=null,closed=false,timer=null,retryTimer=null,queue=Promise.resolve(),failures=0,ready=false,recovering=false,epoch=0,reconnectAttempts=0,testing=false,testResolve=null,testTimer=null,timeoutDisconnect=false;
 const operationTimeoutMs=options.operationTimeoutMs??8000,reconnectDelayMs=options.reconnectDelayMs??250,maxReconnectAttempts=options.maxReconnectAttempts??5,pending=new Set();
 const listeners=new Set(),diagnostics={reads:0,readErrors:0,timeouts:0,reconnectAttempts:0,recoveryStage:null,lastTimeout:null,linkLosses:0,reconnections:0,mode:'FFF5 move counter / 500ms',readLengths:{},readsByCharacteristic:{},lastError:null,lastReadError:null,lastOperation:null,lastSuccessAt:null,sessionStartedAt:performance.now(),lastSessionMs:null,trace:[]};
 const emit=e=>{for(const l of listeners)l.next?.(e)};
 const run=fn=>{const task=queue.then(()=>{if(closed)throw new Error('اتصال بسته است.');return fn()});queue=task.catch(()=>{});return task};
 function trace(event,detail=''){diagnostics.trace.push({ms:Math.round(performance.now()),event,detail});diagnostics.trace=diagnostics.trace.slice(-40);}
 async function operation(label,fn){
  if(closed)throw new DOMException('اتصال بسته است.','AbortError');
  diagnostics.lastOperation=label;diagnostics.recoveryStage=recovering?label:null;
  if(recovering){trace('recovery-step',label);diagnostic('recovery-step');}
  let deadline,cancel;const began=performance.now();
  try{return await new Promise((resolve,reject)=>{
   let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(deadline);pending.delete(cancel);error?reject(error):resolve(value)};
   cancel=()=>finish(new DOMException('اتصال لغو شد.','AbortError'));pending.add(cancel);
   deadline=setTimeout(()=>{const error=new DOMException('پاسخ بلوتوث در مهلت تعیین‌شده دریافت نشد.','TimeoutError');diagnostics.timeouts++;diagnostics.lastTimeout={operation:label,durationMs:Math.round(performance.now()-began)};trace('operation-timeout',JSON.stringify(diagnostics.lastTimeout));finish(error);timeoutDisconnect=device.gatt.connected;device.gatt.disconnect();},operationTimeoutMs);
   Promise.resolve().then(()=>{if(closed)throw new DOMException('اتصال بسته است.','AbortError');return fn()}).then(value=>finish(null,value),error=>finish(error));
  });}finally{clearTimeout(deadline);pending.delete(cancel);}
 }
 const readBytes=async c=>{const label='read '+(c.uuid||'unknown'),began=performance.now();try{const v=await operation(label,()=>c.readValue());diagnostics.reads++;diagnostics.readsByCharacteristic[c.uuid||'unknown']=(diagnostics.readsByCharacteristic[c.uuid||'unknown']||0)+1;diagnostics.readLengths[c.uuid||'unknown']=v.byteLength;diagnostics.lastSuccessAt=performance.now();return new Uint8Array(v.buffer,v.byteOffset,v.byteLength)}catch(e){diagnostics.lastReadError={operation:label,name:e.name,message:e.message,durationMs:Math.round(performance.now()-began)};trace('read-error',JSON.stringify(diagnostics.lastReadError));throw e}};
 const read=async c=>legacyDecrypt(await readBytes(c),key);
 async function loadGatt(initialService){
  const server=await operation('connect',()=>device.gatt.connect()),info=await operation('service 180a',()=>server.getPrimaryService(uuid('180a')));
  const version=await readBytes(await operation('characteristic 2a28',()=>info.getCharacteristic(uuid('2a28')))),hardware=await readBytes(await operation('characteristic 2a23',()=>info.getCharacteristic(uuid('2a23'))));key=legacyKey(version,hardware);
  const data=initialService||await operation('service fff0',()=>server.getPrimaryService(uuid('fff0')));stateChar=await operation('characteristic fff2',()=>data.getCharacteristic(uuid('fff2')));movesChar=await operation('characteristic fff5',()=>data.getCharacteristic(uuid('fff5')));batteryChar=null;try{batteryChar=await operation('characteristic fff7',()=>data.getCharacteristic(uuid('fff7')))}catch(e){if(e.name==='TimeoutError'||e.name==='AbortError')throw e;}
 }
 function parsed(bytes){const current=globalThis.Cube.fromString(legacyFacelets(bytes));const event=cubeEvent(current);if(!validate(event))throw new Error('وضعیت رمزگشایی‌شده معتبر نیست.');return {current,event,count:bytes.length===19?bytes[18]:null};}
 async function snapshot(){
  // This device serves FFF2/FFF3 from an older snapshot. Read the live FFF5
  // counter first, then accept only a matching FFF2 snapshot where available.
  for(let attempt=0;attempt<4;attempt++){
   const moves=await read(movesChar);if(moves.length<19)throw new Error('تاریخچه زنده ناقص است.');
   const data=parsed(await read(stateChar));if(data.count!=null&&data.count!==moves[12]){await new Promise(r=>setTimeout(r,100));continue;}
   cube=data.current;lastCount=moves[12];return data.event;
  }throw new Error('وضعیت مکعب هنوز به‌روز نشده؛ چند لحظه روبیک را ثابت نگه دار.');
 }

 function diagnostic(reason){emit({type:'CONNECTION_DIAGNOSTIC',reason,...diagnostics});}
 function close(reason){if(closed)return;closed=true;epoch++;for(const cancel of [...pending])cancel();clearTimeout(timer);clearTimeout(retryTimer);clearTimeout(testTimer);testResolve?.({cancelled:true});device.removeEventListener('gattserverdisconnected',lost);signal?.removeEventListener('abort',abort);emit({type:'DISCONNECT',reason});listeners.clear();}
 const abort=()=>{close();device.gatt.disconnect()};
 function reconnect(reason){
  if(closed||recovering)return;recovering=true;ready=false;epoch++;clearTimeout(timer);reconnectAttempts=0;
  emit({type:'CONNECTION_PAUSED',reason});diagnostic(reason);
  async function attempt(){if(closed)return;reconnectAttempts++;diagnostics.reconnectAttempts=reconnectAttempts;trace('reconnect-attempt',String(reconnectAttempts));diagnostic('reconnect-start');
   try{const state=await run(async()=>{await loadGatt();return snapshot()});if(closed)return;recovering=false;ready=true;failures=0;diagnostics.sessionStartedAt=performance.now();diagnostics.reconnections++;diagnostics.recoveryStage=null;emit(state);emit({type:'CONNECTION_RESUMED'});diagnostic('reconnected');timer=setTimeout(poll,LEGACY_POLL_MS);}
   catch(e){if(closed)return;diagnostics.lastError=e.name+': '+e.message;trace('reconnect-error',diagnostics.lastError);diagnostic('reconnect-error');if(reconnectAttempts>=maxReconnectAttempts){trace('recovery-exhausted',diagnostics.lastError);diagnostic('recovery-exhausted');close('recovery-exhausted');device.gatt.disconnect();return;}retryTimer=setTimeout(attempt,options.reconnectDelayMs??Math.min(5000,500*2**Math.min(reconnectAttempts,4)));}
  }
  retryTimer=setTimeout(attempt,reconnectDelayMs);
 }
 function lost(){if(closed)return;if(timeoutDisconnect){timeoutDisconnect=false;trace('watchdog-disconnect');if(!testing&&ready)reconnect('operation-timeout');return;}diagnostics.linkLosses++;diagnostics.lastSessionMs=Math.round(performance.now()-diagnostics.sessionStartedAt);trace('gattserverdisconnected','sessionMs='+diagnostics.lastSessionMs);diagnostic('link-lost');if(testing){testResolve?.({survived:false,elapsedMs:Math.round(performance.now()-diagnostics.sessionStartedAt)});return}if(ready)reconnect('physical-link-lost');}
 const connection={deviceName:device.name,get diagnostics(){return structuredClone(diagnostics)},events$:{subscribe(observer){const l=typeof observer==='function'?{next:observer}:observer;listeners.add(l);return {unsubscribe(){listeners.delete(l)}}}},async disconnect(){trace('manual-disconnect');close();device.gatt.disconnect()},async probeMotion({samples=11,interval=1000}={}){
 if(closed||recovering||testing)throw new Error('ابتدا منتظر اتصال بمان.');testing=true;clearTimeout(timer);emit({type:'CONNECTION_PAUSED',reason:'motion-test'});const result={samples:[],summary:null};
 try{await run(()=>{});const channels={FFF2:stateChar};const server=await operation('connect probe',()=>device.gatt.connect());const data=await operation('service fff0 probe',()=>server.getPrimaryService(uuid('fff0')));for(const name of ['FFF3','FFF5']){try{channels[name]=await operation('characteristic '+name,()=>data.getCharacteristic(uuid(name.toLowerCase())))}catch(e){result[name+'Error']=e.message;}}
 for(let i=0;i<samples;i++){
  if(closed||!device.gatt.connected)break;const row={sample:i};
  await run(async()=>{for(const [name,c] of Object.entries(channels)){try{const bytes=await read(c);row[name]={length:bytes.length,counter:name==='FFF2'?bytes[18]:name==='FFF5'?bytes[12]:bytes[0],value:name==='FFF2'?Array.from(bytes.slice(0,18)).join(','):Array.from(bytes.slice(-6)).join(',')};}catch(e){row[name]={error:e.name+': '+e.message};if(!device.gatt.connected)break;}}});
  result.samples.push(row);emit({type:'MOTION_TEST_PROGRESS',sample:i,total:samples});
  if(i<samples-1){const waitResult=await new Promise(resolve=>{testResolve=resolve;testTimer=setTimeout(()=>resolve(null),interval)});clearTimeout(testTimer);testResolve=null;if(waitResult)break;}
 }
 }catch(e){result.error=e.name+': '+e.message;}finally{clearTimeout(testTimer);testResolve=null;testing=false;}
 const unique=(channel,key)=>[...new Set(result.samples.map(row=>row[channel]?.[key]).filter(v=>v!==undefined))];
 result.summary={samples:result.samples.length,f2Counters:unique('FFF2','counter'),f5Counters:unique('FFF5','counter'),f3Counters:unique('FFF3','counter'),f2States:unique('FFF2','value').length,f5Histories:unique('FFF5','value'),f3Histories:unique('FFF3','value'),errors:result.samples.flatMap(row=>Object.entries(row).filter(([k,v])=>v?.error).map(([k,v])=>k+': '+v.error)),error:result.error||null,channelErrors:{FFF3:result.FFF3Error||null,FFF5:result.FFF5Error||null}};diagnostics.motionProbe=result;trace('motion-probe-result',JSON.stringify(result.summary));diagnostic('motion-probe-result');
 if(!closed){if(device.gatt.connected){try{emit(await run(snapshot));emit({type:'CONNECTION_RESUMED'});timer=setTimeout(poll,LEGACY_POLL_MS);}catch(e){diagnostics.lastError=e.name+': '+e.message;reconnect('post-probe-read-error');}}else reconnect('post-probe-link-lost');}return result;
 },async testIdleLink(duration=60000){if(closed||recovering||testing)throw new Error('ابتدا منتظر اتصال پایدار بمان.');testing=true;clearTimeout(timer);emit({type:'CONNECTION_PAUSED',reason:'link-test'});let result;try{await run(()=>{});trace('no-read-test-start');result=await new Promise(resolve=>{testResolve=resolve;testTimer=setTimeout(()=>resolve({survived:true,elapsedMs:duration}),duration);if(!device.gatt.connected)resolve({survived:false,elapsedMs:0})});diagnostics.lastNoReadTest=result;trace('no-read-test-result',JSON.stringify(result));diagnostic('no-read-test-result');}finally{clearTimeout(testTimer);testResolve=null;testing=false;}if(!closed){if(device.gatt.connected){try{emit(await run(snapshot));emit({type:'CONNECTION_RESUMED'});timer=setTimeout(poll,LEGACY_POLL_MS);}catch(e){diagnostics.lastError=e.name+': '+e.message;trace('post-test-read-error',diagnostics.lastError);reconnect('post-test-read-error');}}else reconnect('after-no-read-test');diagnostic('no-read-test-result');}return result;},sendCubeCommand(command){return run(async()=>{
  if(!ready||testing)throw new Error('اتصال در حال بازیابی یا آزمایش است.');
  if(command.type==='REQUEST_FACELETS'){emit(await snapshot());return}
  if(command.type==='REQUEST_BATTERY'){if(batteryChar){const b=await read(batteryChar);if(b.length>=8&&b[7]<=100)emit({type:'BATTERY',batteryLevel:b[7]})}return}
  if(command.type==='REQUEST_RESET'){if(!stateChar.properties?.write&&!stateChar.properties?.writeWithoutResponse)throw new Error('این دستگاه اجازه بازنشانی از این مسیر را نمی‌دهد. از «خواندن وضعیت» استفاده کن.');const solved=new Uint8Array([0,0,36,0,73,146,36,73,109,146,219,182,73,146,182,36,109,219]);await operation('write fff2 reset',()=>stateChar.writeValue(solved));emit(await snapshot());return}
  throw new Error('فرمان در این مدل پشتیبانی نمی‌شود.');
 })}};
 async function poll(){if(closed||recovering||testing)return;const currentEpoch=epoch;try{await run(async()=>{
  const bytes=await read(movesChar);if(closed||currentEpoch!==epoch)return;if(bytes.length<19)throw new Error('تاریخچه زنده ناقص است.');
  const count=bytes[12],diff=(count-lastCount)&255;if(!diff)return;
  if(diff>6){emit({type:'SYNC_LOST'});emit(await snapshot());trace('state-resync','more than six moves missed');return;}
  const codes=Array.from(bytes.slice(19-diff,19));if(codes.some(c=>c>=18))throw new Error('کد حرکت زنده نامعتبر است.');
  for(const code of codes){const move='URFDLB'[Math.floor(code/3)]+['','2',"'"][code%3];cube.move(move);emit({type:'MOVE',move,timestamp:performance.now()});}
  lastCount=count;

 });failures=0;}catch(e){if(closed||recovering)return;diagnostics.readErrors++;diagnostics.lastError=e.name+': '+e.message;failures++;trace('poll-error',diagnostics.lastError);diagnostic('read-error');
  // A read error is not proof of a lost Bluetooth link. Reinitialize the same
  // permitted device after repeated errors instead of disconnecting it.
  if(!device.gatt.connected||failures>=3){reconnect(device.gatt.connected?'read-recovery':'physical-link-lost');return;}
 }if(!closed&&!recovering&&!testing)timer=setTimeout(poll,failures?250:LEGACY_POLL_MS);}
 signal?.addEventListener('abort',abort,{once:true});device.addEventListener('gattserverdisconnected',lost);
 try{if(signal?.aborted)throw new DOMException('لغو شد','AbortError');const state=await run(async()=>{await loadGatt(service);return snapshot()});ready=true;diagnostics.sessionStartedAt=performance.now();trace('connected');timer=setTimeout(poll,LEGACY_POLL_MS);return {connection,state};}
 catch(e){close();device.gatt.disconnect();throw e;}
}
