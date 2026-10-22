import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const elements=new Map();const el=()=>({textContent:'',value:'',disabled:false,style:{},classList:{toggle(){}},append(){},replaceChildren(){},click(){}});
const context={console,AbortController,Intl,Date,JSON,Math,Number,Blob,URL,performance,navigator:{},localStorage:{getItem:()=>null,setItem(){}},document:{getElementById:id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id)},createElement:el},requestAnimationFrame(){},setTimeout,clearTimeout,setInterval,clearInterval,confirm:()=>true};vm.createContext(context);vm.runInContext(fs.readFileSync('dist/cube.js','utf8'),context);vm.runInContext(fs.readFileSync('dist/app.js','utf8').replace(/^import.*\n/,''),context);
await elements.get('motiontest').onclick();assert.match(elements.get('motionresult').value,/متصل نیست/);
vm.runInContext('conn={deviceName:"GAN"};connectionPaused=true;',context);await elements.get('motiontest').onclick();assert.match(elements.get('motionresult').value,/بازیابی/);
vm.runInContext('connectionPaused=false;',context);await elements.get('motiontest').onclick();assert.match(elements.get('motionresult').value,/قدیمی/);
vm.runInContext('conn={probeMotion:async()=>{throw new Error("sample BLE failure")}};',context);await elements.get('motiontest').onclick();assert.match(elements.get('motionresult').value,/sample BLE failure/);assert.equal(elements.get('motiontest').disabled,false);
vm.runInContext('conn={probeMotion:async()=>({summary:{samples:11}})};',context);await elements.get('motiontest').onclick();assert.equal(JSON.parse(elements.get('motionresult').value).samples,11);assert.equal(elements.get('linktest').disabled,false);
vm.runInContext('event({type:"MOTION_TEST_PROGRESS",sample:2,total:11});',context);assert.match(elements.get('motionresult').value,/نمونه/);
console.log('PASS inline feedback for disconnected, reconnecting, stale driver, BLE failure, success and progress; controls restored');

vm.runInContext('event({type:"DISCONNECT",reason:"recovery-exhausted"});',context);assert.equal(elements.get('connect').disabled,false);assert.match(elements.get('notice').textContent,/۵ تلاش/);console.log('PASS recovery exhaustion unlocks connect and explains retry');

// UI cancellation must release controls even if the driver never settles.
const requests=[];let obsoleteClosed=0;
context.navigator.bluetooth={};context.connectCube=options=>{options.onProgress('select');return new Promise(resolve=>requests.push({options,resolve}))};
const firstClick=elements.get('connect').onclick();assert.equal(elements.get('connect').disabled,true);
await elements.get('disconnect').onclick();assert.equal(elements.get('connect').disabled,false);assert(requests[0].options.signal.aborted);assert.equal(elements.get('reloadconnection').hidden,false);
const secondClick=elements.get('connect').onclick();assert.equal(elements.get('connect').disabled,true);
requests[0].resolve({connection:{async disconnect(){obsoleteClosed++}}});await firstClick;assert.equal(obsoleteClosed,1);assert.equal(elements.get('connect').disabled,true,'old completion must not unlock a newer attempt');
await elements.get('disconnect').onclick();requests[1].resolve({connection:{async disconnect(){obsoleteClosed++}}});await secondClick;assert.equal(elements.get('connect').disabled,false);
context.connectCube=async()=>{const e=new Error('native chooser still pending');e.name='PickerPendingError';throw e};await elements.get('connect').onclick();assert.equal(elements.get('connect').disabled,false);assert.equal(elements.get('reloadconnection').hidden,false);assert.match(elements.get('notice').textContent,/native chooser/);
console.log('PASS immediate cancel despite stuck driver, abort dispatched, stale completions isolated, picker recovery guidance');
