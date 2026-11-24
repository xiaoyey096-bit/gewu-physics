import { BASE, CANVAS, RIGHT, enterStudy, openExisting, runProbe, timeState } from './cdp.mjs';

await runProbe('v4-motion', { port: 9360 }, async ({browser:b,expect,shot,log}) => {
  await b.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await b.goto(BASE); await enterStudy(b); await openExisting(b);
  const input = label => `input[aria-label^="自定义${label}"]`;
  const slider = label => `[role="slider"][aria-label^="${label}"]`;
  const value = label => b.evaluate(`Number(document.querySelector(${JSON.stringify(slider(label))}).getAttribute('aria-valuenow'))`);
  const set = async (label,n,blur=false) => {
    // 右侧三个页签都 forceMount 常驻 DOM，改参数前必须把「动画参数」切到前台，否则输入框是隐藏的。
    await b.click('动画参数',`${RIGHT} [role="tab"]`);
    await b.wait(`!!document.querySelector(${JSON.stringify(input(label))})?.getClientRects().length`);
    await b.type(input(label), String(n));
    if (blur) await b.key('Tab','Tab',9); else await b.key('Enter','Enter',13);
    await b.wait(`Number(document.querySelector(${JSON.stringify(slider(label))}).getAttribute('aria-valuenow')) === ${n}`);
  };
  // 临界状态与定位按钮在「对象与受力」页签里，任何一次 set() 之后都要重新切回来。
  const showStates = async () => {
    await b.click('对象与受力',`${RIGHT} [role="tab"]`);
    await b.wait(`!!document.querySelector('div[aria-label="题目临界状态"]')?.getClientRects().length`,'临界状态面板可见');
  };
  const initial = await b.evaluate(`Object.fromEntries([...document.querySelectorAll('input[aria-label^="自定义"]')].map(el=>[el.getAttribute('aria-label'),el.value]))`);
  expect('fourEditableFields',Object.keys(initial).length===4,initial);
  for(const [label,n] of [['初速度',23.75],['抛射角',36.25],['初始高度',5.125],['重力加速度',9.81]]) {
    const before = await value(label);
    await b.type(input(label),String(n));
    expect(`${label}DraftNotApplied`,await value(label)===before,{before});
    await b.key(label==='初始高度'?'Tab':'Enter',label==='初始高度'?'Tab':'Enter',label==='初始高度'?9:13);
    expect(`${label}DecimalCommitted`,await value(label)===n,await value(label));
  }
  expect('gravityPresetKeepsPrecision',await b.evaluate(`document.querySelector('[aria-label="重力加速度预设"]').textContent.includes('9.81')`));
  await b.type(input('初速度'),'201'); await b.key('Enter','Enter',13);
  expect('outOfRangeRejected',await value('初速度')===23.75 && await b.evaluate(`document.querySelector(${JSON.stringify(input('初速度'))}).getAttribute('aria-invalid') === 'true'`));
  await b.key('Tab','Tab',9);
  expect('invalidBlurNotApplied',await value('初速度')===23.75);
  await b.clickSelector(input('初速度')); await b.key('Escape','Escape',27);
  expect('escapeRestoresValue',await b.evaluate(`document.querySelector(${JSON.stringify(input('初速度'))}).value === '23.75'`));
  await b.clickSelector(input('初速度')); await b.key('a','KeyA',65,2); await b.key('Backspace','Backspace',8); await b.key('Enter','Enter',13);
  expect('emptyRejected',await value('初速度')===23.75 && await b.evaluate(`document.querySelector(${JSON.stringify(input('初速度'))}).value === ''`));
  await b.key('Escape','Escape',27);
  await b.type(input('初速度'),'222');
  await b.dragSlider('初速度',0.21);
  const sliderValue=await value('初速度');
  expect('sliderReplacesInvalidDraft',await b.evaluate(`Number(document.querySelector(${JSON.stringify(input('初速度'))}).value)===${sliderValue} && !document.querySelector(${JSON.stringify(input('初速度'))}).hasAttribute('aria-invalid')`),sliderValue);
  await b.click('重置参数','button',{exact:true});
  expect('resetUpdatesAllInputs',await b.evaluate(`JSON.stringify(Object.fromEntries([...document.querySelectorAll('input[aria-label^="自定义"]')].map(el=>[el.getAttribute('aria-label'),el.value])))===${JSON.stringify(JSON.stringify(initial))}`));
  for(const [label,n] of [['初速度',20],['抛射角',30],['初始高度',5],['重力加速度',10]]) await set(label,n);
  const T=1+Math.sqrt(2);
  expect('manualParamsRecomputeDuration',Math.abs((await timeState(b)).duration-T)<1e-9,await timeState(b));
  // 右侧面板三个页签都常驻 DOM，靠 data-state + CSS 隐藏，所以断言可见性而不是存在性。
  expect('criticalPanelHiddenUntilForcesTab',await b.evaluate(`(() => {
    const box = document.querySelector('div[aria-label="题目临界状态"]');
    return !!box && box.closest('aside')?.getAttribute('aria-label') === '动画参数与对话'
      && box.closest('[role="tabpanel"]')?.dataset.state === 'inactive' && !box.getClientRects().length;
  })()`));
  await b.click('对象与受力',`${RIGHT} [role="tab"]`);
  await b.wait(`!!document.querySelector('div[aria-label="题目临界状态"]')?.getClientRects().length`,'临界状态面板可见');
  expect('fourAnalyticCriticalStates',await b.evaluate(`document.querySelectorAll('button[aria-label^="临界状态 "]').length===4`));
  const double = async label => {
    const p=await b.box(`button[aria-label="临界状态 ${label}"]`);
    for (const clickCount of [1,2]) {
      await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount});
      await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',buttons:0,clickCount});
    }
  };
  await double('最高点');
  await b.wait(`Math.abs(Number(document.querySelector('[aria-label="动画时间轴"]').getAttribute('aria-valuenow'))-1)<1e-8`);
  expect('doubleClickApexPauses',Math.abs((await timeState(b)).time-1)<1e-8 && !await b.evaluate(`[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='暂停')`));
  await b.click('定位回到出发高度');
  expect('returnHeightTime',Math.abs((await timeState(b)).time-2)<1e-9);
  await b.click('定位落地前瞬间');
  expect('landingTime',Math.abs((await timeState(b)).time-T)<1e-9);
  await b.clickSelector('button[aria-label="临界状态 出发点"]'); await b.key('Enter','Enter',13);
  expect('criticalKeyboardSeek',(await timeState(b)).time===0);
  // 取景公式（worldW/worldH/pad）会随渲染层演进，探针不复制它：直接动态 import 应用自己的
  // sceneTransform，把物理时刻换算成画布像素，避免镜像公式过期后误判成产品 bug。
  const coords = async (t, angle=30, scroll=true) => {
    if(scroll) await b.box(CANVAS);
    return b.evaluate(`(async () => {
      const r=document.querySelector(${JSON.stringify(CANVAS)}).getBoundingClientRect();
      const [{sceneTransform},{solveProjectile}]=await Promise.all([import('/lib/motion.ts'),import('/lib/physics.ts')]);
      const read=(label,fallback)=>{const el=document.querySelector('[role="slider"][aria-label^="'+label+'"]');const n=Number(el?.getAttribute('aria-valuenow'));return Number.isFinite(n)&&el?n:fallback;};
      const params={v0:read('初速度',20),angleDeg:${angle},h0:read('初始高度',5),g:read('重力加速度',9.8)};
      const view=sceneTransform(r.width,r.height,solveProjectile(params));
      const rad=${angle}*Math.PI/180,vx=params.v0*Math.cos(rad),vy=params.v0*Math.sin(rad);
      const time=${t??"Number(document.querySelector('[aria-label=\"动画时间轴\"]').getAttribute('aria-valuenow'))"};
      return {x:r.x+view.X(vx*time),y:r.y+view.Y(params.h0+vy*time-params.g*time*time/2)};
    })()`);
  };
  const drag=async(from,to,angle=30,extra={x:0,y:0})=>{
    const end=await coords(to,angle),a=await coords(from,angle,false),z={x:end.x+extra.x,y:end.y+extra.y};
    await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',...a});
    await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',buttons:1,clickCount:1});
    for(let i=1;i<=10;i++) await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:a.x+(z.x-a.x)*i/10,y:a.y+(z.y-a.y)*i/10,button:'left',buttons:1});
    await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...z,button:'left',buttons:0,clickCount:1});
  };
  await drag(0,1.5);
  expect('actorDragFindsPhysicalTime',Math.abs((await timeState(b)).time-1.5)<0.02,await timeState(b));
  const stable=(await timeState(b)).time;
  await b.wait(`document.querySelector(${JSON.stringify(CANVAS)}).classList.contains('cursor-grab')`);
  expect('dragEndsPaused',!await b.evaluate(`[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='暂停')`));
  const unrelated=await b.box(CANVAS); await b.clickAt(unrelated.x,unrelated.y-80);
  expect('backgroundClickDoesNotSeek',Math.abs((await timeState(b)).time-stable)<1e-9);
  await drag(stable,0.6,30,{x:0,y:-80});
  const constrained=(await timeState(b)).time;
  expect('offTrajectoryConstrained',constrained>=0&&constrained<=T&&Math.abs(constrained-stable)>0.1,{constrained});
  await b.clickSelector(CANVAS); await b.key('Home','Home',36);
  expect('canvasHome',(await timeState(b)).time===0);
  await b.key('ArrowRight','ArrowRight',39);
  expect('canvasArrow',Math.abs((await timeState(b)).time-T/100)<1e-9);
  await b.key('End','End',35);
  expect('canvasEnd',Math.abs((await timeState(b)).time-T)<1e-9);
  await b.key('Home','Home',36); await b.click('播放','button',{exact:true});
  await drag(null,1.1);
  expect('dragInterruptsPlayback',Math.abs((await timeState(b)).time-1.1)<0.03&&!await b.evaluate(`[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='暂停')`),await timeState(b));
  await b.clickSelector(CANVAS); await b.key('Home','Home',36);
  expect('dragFocusSupportsKeyboardReset',(await timeState(b)).time===0 && await b.evaluate(`document.activeElement===document.querySelector(${JSON.stringify(CANVAS)})`));
  await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:2,mobile:true});
  await b.wait(`document.querySelector(${JSON.stringify(CANVAS)}).width===document.querySelector(${JSON.stringify(CANVAS)}).parentElement.clientWidth*2`);
  const touchStart=await coords(0),touchEnd=await coords(1.3);
  await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touchStart,id:1}]});
  await b.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touchEnd,id:1}]});
  await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect('touchDragAtDoublePixelDensity',Math.abs((await timeState(b)).time-1.3)<0.03,await timeState(b));
  const cancelStart=await coords((await timeState(b)).time);
  await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...cancelStart,id:1}]});
  await b.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  expect('touchCancelReleasesCapture',await b.evaluate(`document.querySelector(${JSON.stringify(CANVAS)}).classList.contains('cursor-grab')`));
  await shot('touch-drag-mobile.png'); await b.metrics(1440,900);
  await showStates();
  await set('抛射角',90);
  await showStates();
  await b.click('定位出发点');
  expect('verticalBranchControls',await b.exists('[role="group"][aria-label="竖直运动拖动分支"]'));
  await drag(0,1,90);
  expect('verticalAscendingBranch',Math.abs((await timeState(b)).time-1)<0.03,await timeState(b));
  await b.click('下落段拖动','button',{exact:true});
  await drag((await timeState(b)).time,3,90);
  expect('verticalDescendingSameHeight',Math.abs((await timeState(b)).time-3)<0.03,await timeState(b));
  await shot('vertical-drag.png');
  await b.click('对话','[role="tab"]',{exact:true}); await b.click('编辑题目','button',{exact:true});
  await b.type('textarea[aria-label="编辑题目内容"]','一滑块以20 m/s的速度从5 m高处竖直向上抛出，忽略空气阻力，g取10 m/s²。求飞行时间和最大高度。');
  await b.click('保存题目','button',{exact:true}); await b.wait(`!document.querySelector('[role="dialog"]')`);
  expect('blockIdentified',await b.evaluate(`document.querySelector(${JSON.stringify(CANVAS)}).getAttribute('aria-label').includes('拖动滑块')`));
  await showStates();
  await b.click('定位最高点'); await shot('block-and-critical.png');
  await b.click('动画参数','[role="tab"]',{exact:true});
  await set('抛射角',0); await set('初始高度',0);
  const zeroDuration = {
    time: (await timeState(b)).time,
    states: await b.evaluate(`[...document.querySelectorAll('button[aria-label^="临界状态 "]')].map(el=>el.getAttribute('aria-label'))`),
    playDisabled: await b.evaluate(`[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='播放'&&el.disabled)`),
  };
  // 零飞行时间时出发点/最高点/落地前瞬间都落在 t=0，临界状态按时刻去重后只剩出发点。
  expect('zeroDurationCriticalStates',zeroDuration.time===0&&zeroDuration.states.length===1&&zeroDuration.states[0]==='临界状态 出发点'&&zeroDuration.playDisabled,zeroDuration);
  await b.clickSelector(CANVAS); await b.key('End','End',35);
  expect('zeroDurationKeySafe',(await timeState(b)).time===0);
  await set('初始高度',5);
  const flatLaunch = await b.evaluate(`[...document.querySelectorAll('button[aria-label^="临界状态 "]')].map(el=>el.getAttribute('aria-label'))`);
  expect('flatLaunchMergesApexIntoStart',flatLaunch.join('|')==='临界状态 出发点|临界状态 落地前瞬间',flatLaunch);
  await set('抛射角',37.125); await set('初始高度',6.25);
  await b.send('Page.reload'); await b.wait(`!![...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='进入学习空间')`); await enterStudy(b); await openExisting(b);
  const restored={angle:await value('抛射角'),height:await value('初始高度'),title:await b.evaluate(`document.querySelector('header')?.textContent`)};
  expect('customValuesPersisted',restored.angle===37.125&&restored.height===6.25,restored);
  for(const width of [1100,390,1440]){
    await b.metrics(width,900,width<500);
    const layout=await b.evaluate(`({w:innerWidth,scroll:document.documentElement.scrollWidth,canvas:document.querySelector(${JSON.stringify(CANVAS)}).getBoundingClientRect().width})`);
    expect(`viewport${width}NoOverflow`,layout.scroll<=layout.w+1&&layout.canvas>200,layout);
    if(width===390){
      const phases=await b.evaluate(`(()=>{const g=document.querySelector('[aria-label="动画过程阶段"]'),r=g.getBoundingClientRect();return {width:r.width,height:r.height,buttons:[...g.querySelectorAll('button')].map(el=>el.getBoundingClientRect().width)};})()`);
      expect('mobilePhasesKeepReadableRows',phases.width>250&&phases.height<72&&phases.buttons.every(w=>w>40),phases);
    }
    await shot(`motion-${width}.png`);
  }
  const numerical=await b.evaluate(`(async()=>{
    const {solveProjectile}=await import('/lib/physics.ts');
    const {criticalStates,stateAt,trajectoryTimeAt,sceneTransform,motionObject}=await import('/lib/motion.ts');
    let checks=0;const failures=[];
    for(const v0 of [.5,20,200])for(const angleDeg of [0,30,89.99,90])for(const h0 of [0,5,200])for(const g of [1,9.81,20]){
      const params={v0,angleDeg,h0,g},problem={version:1,template:'projectile',statement:'小球',params,ask:['range']},r=solveProjectile(params);
      const points=criticalStates(problem,r);
      for(const point of points){
        const energy=(point.vx**2+point.vy**2)/2+g*point.y,initial=v0*v0/2+g*h0;
        checks++;if(Math.abs(energy-initial)>1e-7||point.time<0||point.time>r.flightTime+1e-7)failures.push({params,point,energy,initial});
      }
      for(const x of [-80,320,760])for(const y of [-60,200,520]){
        const view=sceneTransform(640,400,r),distance=t=>{const p=stateAt(params,t);return (view.X(p.x)-x)**2+(view.Y(p.y)-y)**2;};
        const selected=trajectoryTimeAt(problem,r,640,400,x,y,0);
        let sampled=Infinity;for(let i=0;i<=1000;i++)sampled=Math.min(sampled,distance(r.flightTime*i/1000));
        checks++;if(selected<0||selected>r.flightTime||distance(selected)>sampled+1e-6)failures.push({params,x,y,selected,sampled,actual:distance(selected)});
      }
      for(const fraction of [.1,.5,.9]){
        const t=r.flightTime*fraction,p=stateAt(params,t),view=sceneTransform(640,400,r),branch=angleDeg===90?(t<r.apexTime?'rise':'fall'):undefined;
        const recovered=trajectoryTimeAt(problem,r,640,400,view.X(p.x),view.Y(p.y),t,branch);
        checks++;if(Math.abs(recovered-t)>Math.max(.0001,r.flightTime*.00001))failures.push({params,t,recovered});
      }
    }
    for(const [label,shape] of [['小球','ball'],['滑块','box'],['木块','box'],['物资包','box'],['样本舱','box']]){checks++;if(motionObject({statement:label}).shape!==shape)failures.push(label);}
    for(const [statement,label] of [['在月球表面抛出一枚样本舱','样本舱'],['在地球表面抛出一个物资包','物资包'],['月球表面有一个物体','物体']]){checks++;if(motionObject({statement}).label!==label)failures.push(statement);}
    return {checks,failures:failures.slice(0,10),failureCount:failures.length};
  })()`);
  expect('analyticStateProjectionAndEnergy',numerical.failureCount===0,numerical); log('numericCoverage',numerical.checks);
});
