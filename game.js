(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    distance: $('distance'), best: $('best'), score: $('score'), coins: $('coins'), combo: $('combo'),
    phaseText: $('phaseText'), phaseMeter: $('phaseMeter'), intro: $('introScreen'), pause: $('pauseScreen'),
    over: $('gameoverScreen'), center: $('centerMessage'), hint: $('hint'), toast: $('toast')
  };
  const bestKey = 'neon-run-best';
  let best = Number(localStorage.getItem(bestKey) || 0);
  let w = 0, h = 0, dpr = 1, last = 0, soundOn = true, audio;
  let state = 'intro', lane = 0, laneVisual = 0, distance = 0, score = 0, shards = 0, combo = 1;
  let phase = 0, phaseTime = 0, magnetTime = 0, boostTime = 0, jumpTime = 0, slideTime = 0;
  let speed = .34, spawnTime = 0, objects = [], particles = [], stripes = 0, shake = 0, toastTimer = 0, flash = 0;
  let touchStart = null;
  const rand = (a,b) => a + Math.random() * (b-a);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const ease = (a,b,t) => a + (b-a)*t;

  function resize(){
    const rect=canvas.getBoundingClientRect(); dpr=Math.min(devicePixelRatio||1,2); w=rect.width; h=rect.height;
    canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener('resize',resize); resize();
  ui.best.innerHTML = `${String(best).padStart(4,'0')}<span>m</span>`;

  function playSound(freq=440,duration=.08,type='sine',volume=.035){
    if(!soundOn)return;
    try{audio ||= new (window.AudioContext||window.webkitAudioContext)(); const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch(_e){}
  }
  function notify(text){ui.toast.textContent=text;ui.toast.classList.add('show');toastTimer=1.6}
  function message(text){ui.center.textContent=text;ui.center.classList.add('show');setTimeout(()=>ui.center.classList.remove('show'),900)}
  function reset(){
    lane=0;laneVisual=0;distance=0;score=0;shards=0;combo=1;phase=0;phaseTime=0;magnetTime=0;boostTime=0;jumpTime=0;slideTime=0;
    speed=.34;spawnTime=.8;objects=[];particles=[];shake=0;flash=0;stripes=0;
    state='playing';ui.intro.classList.add('hidden');ui.over.classList.add('hidden');ui.pause.classList.add('hidden');ui.hint.innerHTML='← → CHANGE LANE <span>•</span> ↑ JUMP <span>•</span> ↓ SLIDE';
    spawnInitial(); updateHud(); last=performance.now();
  }
  function spawnInitial(){
    // Start with a readable line of shards and first obstacle well ahead.
    for(let i=0;i<6;i++)objects.push({kind:'shard',lane:0,z:.48+i*.075,spin:rand(0,6)});
  }
  function spawnWave(){
    const lanes=[-1,0,1], free=lanes[Math.floor(Math.random()*3)], choices=lanes.filter(x=>x!==free);
    const r=Math.random();
    if(r<.20){
      const lanePick=choices[Math.floor(Math.random()*choices.length)];
      const kind=Math.random()<.54?'barrier':'overhead';
      objects.push({kind,lane:lanePick,z:1});
      for(let i=0;i<4;i++)objects.push({kind:'shard',lane:free,z:1.04+i*.075});
    }else if(r<.38){
      const hazardLane=choices[Math.floor(Math.random()*choices.length)];
      objects.push({kind:'train',lane:hazardLane,z:1});
      objects.push({kind:'shard',lane:free,z:1.08,spin:0},{kind:'shard',lane:free,z:1.17,spin:1});
    }else if(r<.56){
      // A paired jump / slide decision, with one safe lane.
      objects.push({kind:'barrier',lane:choices[0],z:1},{kind:'overhead',lane:choices[1],z:1});
      for(let i=0;i<3;i++)objects.push({kind:'shard',lane:free,z:1+i*.08});
    }else if(r<.70){
      for(let i=0;i<5;i++)objects.push({kind:'shard',lane:free,z:1+i*.08});
      if(Math.random()<.5)objects.push({kind:'phase',lane:choices[0],z:1.12});
    }else{
      const kind=Math.random()<.5?'barrier':'overhead';
      objects.push({kind,lane:choices[0],z:1});
      if(Math.random()<.56)objects.push({kind:'shard',lane:free,z:1.04,spin:0},{kind:'shard',lane:free,z:1.13,spin:1},{kind:'shard',lane:free,z:1.22,spin:2});
      if(Math.random()<.25)objects.push({kind:Math.random()<.5?'magnet':'boost',lane:free,z:1.3});
    }
  }
  function start(){if(state==='intro'||state==='over')reset();else if(state==='paused')resume()}
  function pause(){if(state!=='playing')return;state='paused';ui.pause.classList.remove('hidden')}
  function resume(){if(state!=='paused')return;state='playing';ui.pause.classList.add('hidden');last=performance.now()}
  function endRun(){
    if(state!=='playing')return;state='over';
    best=Math.max(best,Math.floor(distance));localStorage.setItem(bestKey,String(best));
    ui.best.innerHTML=`${String(best).padStart(4,'0')}<span>m</span>`;
    $('runSummary').textContent=`You made it ${Math.floor(distance)}m before the last train caught up.`;
    $('finalScore').textContent=String(score).padStart(6,'0');$('finalCoins').textContent=String(shards).padStart(2,'0');
    ui.over.classList.remove('hidden');playSound(115,.28,'sawtooth',.06);
  }
  function move(dir){if(state!=='playing')return;lane=clamp(lane+dir,-1,1);playSound(300+lane*70,.045,'triangle',.018)}
  function act(action){
    if(state!=='playing')return;
    if(action==='jump'&&jumpTime<=0&&slideTime<=0){jumpTime=.78;playSound(540,.09,'triangle')}
    if(action==='slide'&&jumpTime<=0){slideTime=.68;playSound(190,.08,'sine')}
    if(action==='phase'){
      if(phase>=100&&phaseTime<=0){phase=0;phaseTime=2.5;flash=.4;message('PHASE SHIFT');playSound(760,.16,'sawtooth');}
      else if(phase<100)notify('PHASE DRIVE NEEDS CHARGE');
    }
  }
  function controls(e){
    const k=e.key.toLowerCase();
    if(['arrowleft','arrowright','arrowup','arrowdown',' ','a','d','w','s'].includes(k))e.preventDefault();
    if(k==='escape'||k==='p'){state==='paused'?resume():pause();return}
    if(state==='intro'&&(k==='enter'||k===' ')){start();return}
    if(state==='over'&&(k==='enter'||k===' ')){start();return}
    if(k==='arrowleft'||k==='a')move(-1);else if(k==='arrowright'||k==='d')move(1);else if(k==='arrowup'||k==='w')act('jump');else if(k==='arrowdown'||k==='s')act('slide');else if(k===' ')act('phase');
  }
  addEventListener('keydown',controls);
  $('playButton').onclick=start;$('retryButton').onclick=start;$('resumeButton').onclick=resume;$('pauseButton').onclick=()=>state==='paused'?resume():pause();
  $('soundButton').onclick=()=>{soundOn=!soundOn;$('soundButton').innerHTML=`${soundOn?'♫':'×'} <span>${soundOn?'SOUND':'MUTED'}</span>`;if(soundOn)playSound(620,.08)};
  canvas.addEventListener('pointerdown',e=>{touchStart={x:e.clientX,y:e.clientY};canvas.setPointerCapture?.(e.pointerId)});
  canvas.addEventListener('pointerup',e=>{if(!touchStart)return;const dx=e.clientX-touchStart.x,dy=e.clientY-touchStart.y;touchStart=null;if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;if(Math.abs(dx)>Math.abs(dy))move(dx>0?1:-1);else act(dy<0?'jump':'slide')});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')pause()});

  function updateHud(){
    ui.distance.innerHTML=`${String(Math.floor(distance)).padStart(4,'0')}<span>m</span>`;ui.score.textContent=String(score).padStart(6,'0');ui.coins.textContent=String(shards).padStart(2,'0');ui.combo.textContent=`x${combo.toFixed(1)}`;
    ui.phaseMeter.style.width=`${phase}%`;ui.phaseText.textContent=phaseTime>0?'ACTIVE':phase>=100?'READY':'CHARGING';ui.phaseText.style.color=phaseTime>0?'#afffbd':'';
    ui.best.innerHTML=`${String(best).padStart(4,'0')}<span>m</span>`;
    document.querySelectorAll('.lane-indicator i').forEach((el,i)=>el.classList.toggle('active',i===lane+1));
  }
  function addParticles(x,y,color,n=8){for(let i=0;i<n;i++)particles.push({x,y,vx:rand(-100,100),vy:rand(-155,45),life:rand(.35,.8),max:.8,color,size:rand(1.5,4)})}
  function collect(o){
    if(o.kind==='shard'){
      shards++;score+=Math.round(100*combo);phase=Math.min(100,phase+8);combo=Math.min(5,combo+.08);playSound(720+Math.random()*180,.055,'sine',.022);
    }else if(o.kind==='phase'){
      phase=Math.min(100,phase+36);score+=250;notify('PHASE CELL +36%');message('PHASE CHARGED');playSound(540,.16,'triangle',.05);
    }else if(o.kind==='magnet'){
      magnetTime=7;score+=180;notify('SHARD MAGNET — 7 SEC');message('MAGNET ONLINE');playSound(660,.2,'sine',.05);
    }else if(o.kind==='boost'){
      boostTime=4;score+=180;notify('OVERCLOCK — 4 SEC');message('OVERCLOCK');playSound(850,.17,'sawtooth',.04);
    }
    const p=project(o.lane,o.z);addParticles(p.x,p.y,o.kind==='shard'?'#d8ff67':o.kind==='phase'?'#69faff':'#afffbd',o.kind==='shard'?4:12);
  }
  function update(dt){
    if(state!=='playing')return;
    dt=Math.min(dt,.035);stripes+=dt*(speed*3.2);speed=Math.min(.59,.34+distance*.00075+(boostTime>0?.16:0));distance+=dt*speed*27;score+=Math.floor(dt*speed*115*combo);
    laneVisual=ease(laneVisual,lane,Math.min(1,dt*11));jumpTime=Math.max(0,jumpTime-dt);slideTime=Math.max(0,slideTime-dt);phaseTime=Math.max(0,phaseTime-dt);magnetTime=Math.max(0,magnetTime-dt);boostTime=Math.max(0,boostTime-dt);
    spawnTime-=dt;if(spawnTime<=0){spawnWave();spawnTime=Math.max(.78,1.34-distance*.00055)+rand(-.16,.22)}
    for(const o of objects){o.z-=speed*dt;if(magnetTime>0&&o.kind==='shard'&&o.z<.48&&Math.abs(o.lane-lane)<1.15)o.lane=lane;
      if(!o.done&&o.z<.22&&o.z>-.015){
        if(o.kind==='shard'||o.kind==='phase'||o.kind==='magnet'||o.kind==='boost'){if(o.lane===lane||magnetTime>0&&o.kind==='shard'){o.done=true;collect(o)}}
        else if(o.lane===lane){
          const safe=phaseTime>0||(o.kind==='barrier'&&jumpTime>.12)||(o.kind==='overhead'&&slideTime>.1);
          if(safe){o.done=true;score+=250;combo=Math.min(5,combo+.35);addParticles(w/2,h*.75,'#afffbd',10);message(phaseTime>0?'PHASED THROUGH':`CLEAN ${o.kind==='barrier'?'VAULT':'SLIDE'}`);playSound(470,.11,'triangle',.04)}
          else{shake=.35;flash=.25;addParticles(w/2,h*.77,'#ff598f',15);endRun()}
        }
      }
    }
    objects=objects.filter(o=>o.z>-.14&&!o.done);
    if(magnetTime>0)objects.forEach(o=>{if(!o.done&&o.kind==='shard'&&o.z<.33&&o.z>.08){o.done=true;collect(o)}});
    particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=200*dt});particles=particles.filter(p=>p.life>0);
    if(shake>0)shake=Math.max(0,shake-dt);if(flash>0)flash=Math.max(0,flash-dt);if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show')}
    combo=Math.max(1,combo-dt*.035);updateHud();
  }

  function project(l,z){
    const horizon=h*.34, t=clamp(1-z,0,1.2), y=horizon+Math.pow(t,1.75)*(h*.74), roadW=ease(w*.14,w*.76,Math.pow(t,.85));
    return{x:w*.5+l*roadW*.285,y,scale:.16+1.15*t,roadW};
  }
  function drawBackground(time){
    const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#091625');g.addColorStop(.42,'#172a3a');g.addColorStop(.68,'#304249');g.addColorStop(1,'#101d27');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    const horizon=h*.34;
    // Distant electric haze
    const glow=ctx.createRadialGradient(w*.52,horizon,0,w*.52,horizon,w*.52);glow.addColorStop(0,'rgba(118,232,205,.21)');glow.addColorStop(.42,'rgba(69,147,157,.08)');glow.addColorStop(1,'rgba(10,21,32,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h*.7);
    // distant towers with lit windows
    const bw=w/18;
    for(let i=-1;i<20;i++){
      const x=i*bw+(i%2)*8, bh=h*(.12+((i*37+91)%13)/100), top=horizon-bh;
      ctx.fillStyle=i%3===0?'#142b39':'#102431';ctx.fillRect(x,top,bw*.82,bh);
      ctx.fillStyle='rgba(128,236,208,.19)';ctx.fillRect(x+bw*.1,top+bh*.15,2,bh*.65);
      for(let row=0;row<5;row++)for(let col=0;col<2;col++)if((i*row+col*3+9)%4===0){ctx.fillStyle=(i+row)%3===0?'rgba(255,200,112,.36)':'rgba(131,246,214,.32)';ctx.fillRect(x+bw*.18+col*bw*.24,top+12+row*13,3,5)}
    }
    // distant rail line
    ctx.fillStyle='#101e29';ctx.fillRect(0,horizon,w,6);ctx.strokeStyle='rgba(186,234,203,.18)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,horizon+6);ctx.lineTo(w,horizon+6);ctx.stroke();
    // side structures and track bed
    ctx.fillStyle='#172630';ctx.beginPath();ctx.moveTo(w*.37,horizon);ctx.lineTo(w*.63,horizon);ctx.lineTo(w*1.12,h);ctx.lineTo(-w*.12,h);ctx.closePath();ctx.fill();
    const nearW=w*.38, farW=w*.105;
    // track shoulders
    ctx.fillStyle='#243b3d';ctx.beginPath();ctx.moveTo(w*.5-farW,horizon);ctx.lineTo(w*.5+farW,horizon);ctx.lineTo(w*.5+nearW,h);ctx.lineTo(w*.5-nearW,h);ctx.closePath();ctx.fill();
    ctx.fillStyle='#26353a';ctx.beginPath();ctx.moveTo(w*.5-farW*.81,horizon);ctx.lineTo(w*.5+farW*.81,horizon);ctx.lineTo(w*.5+nearW*.81,h);ctx.lineTo(w*.5-nearW*.81,h);ctx.closePath();ctx.fill();
    // track glow rails
    for(const side of [-1,1]){ctx.strokeStyle='rgba(143,255,194,.48)';ctx.lineWidth=Math.max(1,w*.002);ctx.beginPath();ctx.moveTo(w*.5+side*farW*.76,horizon);ctx.lineTo(w*.5+side*nearW*.76,h);ctx.stroke();ctx.strokeStyle='rgba(92,197,173,.14)';ctx.lineWidth=Math.max(3,w*.009);ctx.beginPath();ctx.moveTo(w*.5+side*farW*.76,horizon);ctx.lineTo(w*.5+side*nearW*.76,h);ctx.stroke()}
    // ties and lane dashed markers flow toward camera
    const laneWidth=(nearW-farW)/2;
    for(let i=0;i<16;i++){
      const q=((i/16+stripes*.18)%1), t=q*q, y=horizon+t*(h-horizon), rw=farW+(nearW-farW)*t;
      ctx.strokeStyle=`rgba(184,198,174,${.12+t*.28})`;ctx.lineWidth=1+t*3;ctx.beginPath();ctx.moveTo(w*.5-rw*.78,y);ctx.lineTo(w*.5+rw*.78,y);ctx.stroke();
    }
    for(const side of [-1,1]){ctx.strokeStyle='rgba(172,240,201,.24)';ctx.setLineDash([12,18]);ctx.lineDashOffset=-stripes*40;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(w*.5+side*laneWidth*.68,horizon);ctx.lineTo(w*.5+side*nearW*.68,h);ctx.stroke();ctx.setLineDash([])}
    // edge warning lights
    for(let i=0;i<8;i++){const t=((i/8+stripes*.09)%1),y=horizon+t*t*(h-horizon),rw=farW+(nearW-farW)*t;for(const side of [-1,1]){ctx.fillStyle=`rgba(216,255,103,${.22+t*.42})`;ctx.beginPath();ctx.arc(w*.5+side*rw*1.05,y,1+t*2,0,Math.PI*2);ctx.fill()}}
    // speed streaks in boosted mode
    if(boostTime>0){ctx.strokeStyle='rgba(171,255,211,.23)';for(let i=0;i<12;i++){let x=(i/12*w+(time*230)%w)%w;ctx.beginPath();ctx.moveTo(x,h*.38);ctx.lineTo(x+(x-w/2)*.08,h*.72);ctx.stroke()}}
  }
  function drawShard(p,o,time){
    const s=p.scale, bob=Math.sin(time*5+(o.spin||0))*2*s, x=p.x,y=p.y-bob,r=7*s;
    ctx.save();ctx.translate(x,y);ctx.rotate(time*2.7+(o.spin||0));ctx.shadowColor='#ddff5d';ctx.shadowBlur=15*s;ctx.fillStyle='#dcff70';ctx.beginPath();ctx.moveTo(0,-r*1.28);ctx.lineTo(r*.72,0);ctx.lineTo(0,r*1.28);ctx.lineTo(-r*.72,0);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#f8ffd0';ctx.beginPath();ctx.moveTo(0,-r*.68);ctx.lineTo(r*.3,0);ctx.lineTo(0,r*.68);ctx.lineTo(-r*.3,0);ctx.fill();ctx.restore();
  }
  function drawPickup(p,o,time){
    const s=p.scale,x=p.x,y=p.y-12*s+Math.sin(time*4)*3*s;const col=o.kind==='phase'?'#63f4ff':o.kind==='magnet'?'#ff75b1':'#afffbd';
    ctx.save();ctx.translate(x,y);ctx.shadowColor=col;ctx.shadowBlur=19*s;ctx.strokeStyle=col;ctx.lineWidth=2*s;ctx.beginPath();ctx.arc(0,0,10*s,time,Math.PI*1.65+time);ctx.stroke();ctx.fillStyle=col;ctx.beginPath();if(o.kind==='phase'){ctx.moveTo(2*s,-8*s);ctx.lineTo(-4*s,1*s);ctx.lineTo(0,1*s);ctx.lineTo(-2*s,8*s);ctx.lineTo(5*s,-2*s);ctx.lineTo(1*s,-2*s);ctx.closePath()}else if(o.kind==='magnet'){ctx.arc(0,0,4*s,0,Math.PI*2)}else{ctx.moveTo(-2*s,-7*s);ctx.lineTo(4*s,-7*s);ctx.lineTo(4*s,0);ctx.quadraticCurveTo(4*s,7*s,-3*s,7*s);ctx.lineTo(-3*s,3*s);ctx.quadraticCurveTo(0,3*s,0,0);ctx.closePath()}ctx.fill();ctx.restore();
  }
  function drawObstacle(p,o){
    const s=p.scale,x=p.x,y=p.y,base=y+14*s;ctx.save();ctx.translate(x,base);
    if(o.kind==='barrier'){
      ctx.shadowColor='#ff597f';ctx.shadowBlur=16*s;ctx.fillStyle='#a42e4c';ctx.beginPath();ctx.moveTo(-29*s,-37*s);ctx.lineTo(27*s,-37*s);ctx.lineTo(30*s,0);ctx.lineTo(-30*s,0);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#ff7790';ctx.fillRect(-28*s,-32*s,56*s,5*s);ctx.fillStyle='#f4ddc4';ctx.beginPath();ctx.moveTo(-16*s,-24*s);ctx.lineTo(-7*s,-24*s);ctx.lineTo(-14*s,-10*s);ctx.lineTo(-23*s,-10*s);ctx.fill();ctx.beginPath();ctx.moveTo(5*s,-24*s);ctx.lineTo(14*s,-24*s);ctx.lineTo(7*s,-10*s);ctx.lineTo(-2*s,-10*s);ctx.fill();ctx.fillStyle='#19282d';ctx.fillRect(-32*s,-3*s,64*s,4*s);
    }else if(o.kind==='overhead'){
      ctx.shadowColor='#ffad67';ctx.shadowBlur=14*s;ctx.fillStyle='#d27b46';ctx.fillRect(-31*s,-42*s,8*s,43*s);ctx.fillRect(23*s,-42*s,8*s,43*s);ctx.fillStyle='#eea568';ctx.fillRect(-33*s,-45*s,66*s,12*s);ctx.shadowBlur=0;ctx.fillStyle='#362a2a';ctx.fillRect(-22*s,-29*s,44*s,2*s);ctx.fillStyle='#ffd38e';ctx.font=`${7*s}px monospace`;ctx.textAlign='center';ctx.fillText('DUCK',0,-34*s);
    }else{
      ctx.shadowColor='#ff486f';ctx.shadowBlur=24*s;ctx.fillStyle='#27343c';ctx.beginPath();ctx.moveTo(-38*s,-72*s);ctx.lineTo(30*s,-72*s);ctx.lineTo(37*s,0);ctx.lineTo(-37*s,0);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#a8e7d3';ctx.beginPath();ctx.moveTo(-25*s,-56*s);ctx.lineTo(20*s,-56*s);ctx.lineTo(24*s,-31*s);ctx.lineTo(-24*s,-31*s);ctx.closePath();ctx.fill();ctx.fillStyle='rgba(21,51,59,.8)';ctx.fillRect(-20*s,-52*s,38*s,15*s);ctx.fillStyle='#fc5f78';ctx.fillRect(-34*s,-10*s,11*s,5*s);ctx.fillRect(23*s,-10*s,11*s,5*s);ctx.fillStyle='#40535a';ctx.fillRect(-40*s,-2*s,80*s,5*s);
    }
    ctx.restore();
  }
  function drawRunner(time){
    const p=project(laneVisual,-.03), scale=Math.min(1.25,w/720), x=p.x, ground=h*.82, jumping=jumpTime>0, jumpProgress=jumping?1-jumpTime/.78:0, lift=jumping?Math.sin(jumpProgress*Math.PI)*h*.19:0, sliding=slideTime>0;
    const bob=jumping?0:Math.sin(time*13)*2*scale, y=ground-lift+bob;ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    // ground shadow
    ctx.fillStyle=`rgba(3,10,14,${jumping?.15:.4})`;ctx.beginPath();ctx.ellipse(0,5+lift*.2,25+lift*.1,8,0,0,Math.PI*2);ctx.fill();
    if(phaseTime>0){ctx.strokeStyle='rgba(104,255,216,.82)';ctx.lineWidth=2;ctx.shadowColor='#65ffe0';ctx.shadowBlur=17;ctx.beginPath();ctx.ellipse(0,-42,24,44,time*3,time*2,time*2+Math.PI*1.5);ctx.stroke();ctx.shadowBlur=0}
    const run=Math.sin(time*15), lean=lane!==laneVisual?(lane-laneVisual)*.13:0;ctx.rotate(lean);
    if(sliding){
      ctx.rotate(-.08);ctx.fillStyle='#e8f4dc';ctx.beginPath();ctx.ellipse(1,-16,24,12,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#dbff69';ctx.fillRect(-14,-24,24,16);ctx.fillStyle='#f1c99a';ctx.beginPath();ctx.arc(22,-21,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#182a36';ctx.fillRect(-19,-8,24,5);ctx.fillRect(5,-9,24,5);
    }else{
      // trailing limbs
      ctx.strokeStyle='#142833';ctx.lineWidth=8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-6,-23);ctx.lineTo(-12-run*5,0);ctx.moveTo(7,-24);ctx.lineTo(13+run*5,0);ctx.stroke();ctx.fillStyle='#d8ff67';ctx.fillRect(-19-run*5,-3,13,5);ctx.fillRect(8+run*5,-3,13,5);
      ctx.strokeStyle='#e9f2df';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-7,-47);ctx.lineTo(-18-run*5,-29);ctx.moveTo(8,-47);ctx.lineTo(17+run*5,-36);ctx.stroke();
      ctx.fillStyle='#e9f2df';ctx.beginPath();ctx.moveTo(-12,-54);ctx.lineTo(11,-54);ctx.lineTo(9,-27);ctx.lineTo(-9,-27);ctx.closePath();ctx.fill();
      ctx.fillStyle='#aefbb4';ctx.beginPath();ctx.moveTo(-12,-52);ctx.lineTo(10,-52);ctx.lineTo(8,-43);ctx.lineTo(-12,-41);ctx.closePath();ctx.fill();
      ctx.fillStyle='#f1c99a';ctx.beginPath();ctx.arc(0,-66,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#172632';ctx.beginPath();ctx.arc(0,-70,10,Math.PI,Math.PI*2);ctx.lineTo(9,-64);ctx.lineTo(-8,-64);ctx.fill();
      ctx.fillStyle='#f6fbf0';ctx.fillRect(2,-67,6,2);
    }
    ctx.restore();
    // lane tracking glimmer
    if(phaseTime>0){ctx.fillStyle='rgba(108,255,224,.13)';ctx.beginPath();ctx.ellipse(x,ground,42,12,0,0,Math.PI*2);ctx.fill()}
  }
  function render(time){
    ctx.save();if(shake>0)ctx.translate(rand(-7,7)*shake*2,rand(-5,5)*shake*2);
    drawBackground(time);
    const sorted=objects.slice().sort((a,b)=>b.z-a.z);
    for(const o of sorted){if(o.z>1.3||o.z<-.12)continue;const p=project(o.lane,o.z);if(o.kind==='shard')drawShard(p,o,time);else if(['phase','magnet','boost'].includes(o.kind))drawPickup(p,o,time);else drawObstacle(p,o)}
    drawRunner(time);
    for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=8;ctx.fillRect(p.x,p.y,p.size,p.size);ctx.shadowBlur=0}ctx.globalAlpha=1;
    if(phaseTime>0){ctx.fillStyle=`rgba(101,255,220,${.045+Math.sin(time*17)*.02})`;ctx.fillRect(0,0,w,h)}if(flash>0){ctx.fillStyle=`rgba(255,82,112,${flash*1.4})`;ctx.fillRect(0,0,w,h)}ctx.restore();
  }
  function frame(now){const dt=(now-last)/1000||0;last=now;if(state==='playing')update(dt);render(now/1000);requestAnimationFrame(frame)}
  last=performance.now();requestAnimationFrame(frame);
})();
