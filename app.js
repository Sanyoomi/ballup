/* Canvas artwork is drawn locally; the game needs no network requests. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  if(!window.PlanetGame) { $('game-status').textContent='加载失败';$('toast').textContent='物理引擎未加载，请刷新页面';$('toast').classList.add('visible');return; }
  const {Game,PLANETS:planets,WIDTH:W,HEIGHT:H,FLOOR,LIMIT,SPAWN}=PlanetGame;
  const canvas=$('game'), ctx=canvas.getContext('2d');
  $('board-wrap').style.aspectRatio=`${W} / ${H}`;
  document.documentElement.style.setProperty('--danger-position',`${LIMIT/H*100}%`);
  const style=getComputedStyle(document.documentElement);
  const boardColors=Object.fromEntries(['board','board-line','board-floor','board-floor-line','board-note','board-aim'].map(name=>[name,style.getPropertyValue('--'+name).trim()]));
  const skinConfig=window.MemeSkins||{levels:[],sources:{}};
  const customSkinKey='planet-merge-custom-skins-v1';let storedSkins={};
  const customAudioKey='planet-merge-custom-merge-audio-v1';let customMergeAudioData='';let customMergeAudio=null;
  try{customMergeAudioData=localStorage.getItem(customAudioKey)||'';if(customMergeAudioData)customMergeAudio=new Audio(customMergeAudioData);}catch{}
  try{storedSkins=JSON.parse(localStorage.getItem(customSkinKey)||'{}')||{};}catch{storedSkins={};}
  function persistSkins(){try{localStorage.setItem(customSkinKey,JSON.stringify(storedSkins));return true;}catch{$('skin-feedback').textContent='图片已应用，但浏览器存储空间不足，请减少已保存图片后重试。';return false;}}
  function playCustomMergeAudio(){if(!customMergeAudioData)return false;try{customMergeAudio=customMergeAudio||new Audio(customMergeAudioData);customMergeAudio.currentTime=0;customMergeAudio.volume=.72;customMergeAudio.play().catch(()=>{});return true;}catch{return false;}}
  function updateCustomAudioUI(){const status=$('audio-custom-status');if(status)status.textContent=customMergeAudioData?'已保存自定义合成音效':'使用默认音效';}
  const textures=new Array(10), originalNames=planets.map(p=>p.name), customVersions=new Array(10).fill(0);
  const stageNames=['刚破壳','乖乖球','傻乐球','干饭球','发呆球','爆哭球','逐渐离谱','开始膨胀','小球得志','究极大球'];
  stageNames.forEach((name,i)=>planets[i].name=name);
  let best=0,sound=true,particles=[],specialEffects=[],floaters=[],toastTimer,mode='pause',previousFocus=null,playMode='classic',pendingMode=null,dailyMerges=0,dailyScore=0,dailyDiscover=0,lastDiscoveryCount=0;
  try { const savedDaily=JSON.parse(localStorage.getItem('planet-merge-daily')||'{}'); const today=new Date().toISOString().slice(0,10); if(savedDaily.date===today){dailyMerges=savedDaily.merges||0;dailyScore=savedDaily.score||0;dailyDiscover=savedDaily.discover||0;} else localStorage.setItem('planet-merge-daily',JSON.stringify({date:today,merges:0,score:0,discover:0})); } catch{}
  try {best=Number(localStorage.getItem('planet-merge-best'))||0;const saved=localStorage.getItem('planet-merge-sound');if(saved!==null)sound=saved==='true';}catch{}
  const soundPlayer=new MemeAudio.SoundEngine({assets:window.MemeSounds,enabled:sound,onUnavailable:()=>toast('大笑音效暂不可用，已改用弹跳音效')});
  soundPlayer.preload();
  $('best').textContent=best.toLocaleString();
  function saveBest() {if(game.score>best){best=game.score;$('best').textContent=best.toLocaleString();try{localStorage.setItem('planet-merge-best',best);}catch{}}}
  function renderLeaderboard(){const root=$('leaderboard-list');if(!root)return;let list=[];try{list=JSON.parse(localStorage.getItem('planet-merge-leaderboard')||'[]');}catch{}const labels={timed:'60秒',free:'轻松',task:'任务',challenge:'挑战',endless:'无尽',classic:'经典'};root.innerHTML=(list.slice(0,3).map((row,i)=>`<div class="leader-row"><span>#${i+1} · ${labels[row.mode]||'经典'}</span><strong>${Number(row.score||0).toLocaleString()}</strong><em>${new Date(row.date).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})}</em></div>`).join(''))||'<div class="leader-row"><span>先完成一局，留下你的记录</span></div>';}
  function recordLeaderboard(){try{const list=JSON.parse(localStorage.getItem('planet-merge-leaderboard')||'[]');list.push({score:game.score,mode:playMode,date:new Date().toISOString()});list.sort((a,b)=>b.score-a.score);localStorage.setItem('planet-merge-leaderboard',JSON.stringify(list.slice(0,10)));}catch{}renderLeaderboard();}
  function toast(text) {$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
  function updateDaily(){const merge=$('daily-task'),scoreNode=$('task-extra'),discover=$('task-discover');if(merge)merge.textContent=`完成 5 次合成 · ${Math.min(5,dailyMerges)} / 5`;if(scoreNode)scoreNode.textContent=`达到 500 分 · ${Math.min(500,dailyScore)} / 500`;if(discover)discover.textContent=`解锁 1 个新形态 · ${Math.min(1,dailyDiscover)} / 1`;}
  function saveDaily(){try{localStorage.setItem('planet-merge-daily',JSON.stringify({date:new Date().toISOString().slice(0,10),merges:dailyMerges,score:dailyScore,discover:dailyDiscover}));}catch{}updateDaily();}
  const specialMeta={bomb:['✹','炸弹球','清除附近'],rainbow:['✦','彩虹球','跨级合成'],freeze:['❄','冰冻球','暂停附近'],magnet:['↯','磁铁球','吸引附近'],split:['Ⅱ','分裂球','分裂成两个']};let toolInventory={bomb:0,rainbow:0,freeze:0,magnet:0,split:0};
  try{const saved=JSON.parse(localStorage.getItem('planet-merge-tool-inventory')||'null');if(saved&&typeof saved==='object')toolInventory={...toolInventory,...saved};else{const legacy=JSON.parse(localStorage.getItem('planet-merge-unlocked-tools')||'[]');if(Array.isArray(legacy))legacy.forEach(type=>{toolInventory[type]=(toolInventory[type]||0)+1;});}}catch{}
  function saveInventory(){try{localStorage.setItem('planet-merge-tool-inventory',JSON.stringify(toolInventory));}catch{}}
  function renderTools(){const root=$('special-tools');if(!root)return;root.innerHTML=Object.entries(specialMeta).map(([type,meta])=>{const count=toolInventory[type]||0,active=game?.selectedSpecial===type;return `<button class="tool-option ${count?'':'locked'} ${active?'active':''}" data-tool="${type}" title="${meta[1]}：${meta[2]}" aria-label="${meta[1]}：${meta[2]}，库存 ${count} 个"><span class="tool-icon">${meta[0]}</span><div><strong>${meta[1]}</strong><small>${meta[2]}</small><em>${count?'库存 ×'+count:'看广告随机获得'}</em></div></button>`;}).join('');root.querySelectorAll('[data-tool]').forEach(button=>button.onclick=()=>{const type=button.dataset.tool;if(!(toolInventory[type]>0)){$('ad-status').textContent='数量不足，点击上方按钮看广告随机获得';return;}game.chooseSpecial(game.selectedSpecial===type?null:type);renderTools();$('ad-status').textContent=game.selectedSpecial?`下一球使用${specialMeta[type][1]}，投放后消耗 1 个`:'已取消道具';});}
  async function watchRewarded(){const button=$('watch-ad');button.disabled=true;$('ad-status').textContent='奖励广告播放中 · 请稍候';try{if(window.BallUpAds?.showRewarded)await window.BallUpAds.showRewarded();else await new Promise(resolve=>setTimeout(resolve,2200));const types=Object.keys(specialMeta),target=types[Math.floor(Math.random()*types.length)];toolInventory[target]=(toolInventory[target]||0)+1;saveInventory();renderTools();$('ad-status').textContent=`获得 1 个${specialMeta[target][1]}，可叠加保存`;}catch{$('ad-status').textContent='广告未完成，道具没有获得';}finally{button.disabled=false;}}
  const game=new Game({
    onMerge(e){
      if(!playCustomMergeAudio())soundPlayer.merge(e.level);
      dailyMerges++;dailyScore+=e.points;if(game.discovered.size>lastDiscoveryCount){dailyDiscover++;lastDiscoveryCount=game.discovered.size;}saveDaily();
      const color=planets[e.level].color;
      for(let i=0;i<15;i++){const a=Math.random()*Math.PI*2,s=30+Math.random()*90;particles.push({x:e.x,y:e.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.7,max:.7,size:2+Math.random()*3,color});}
      floaters.push({x:e.x,y:e.y,text:'+'+e.points,life:1,max:1});
      $('score').textContent=game.score.toLocaleString();saveBest();updateDiscovery();
      const reactions=['刚出生就开始碰瓷','乖巧，但只有一点','笑得有点太早了','先干饭，再说别的','大脑正在加载中…','哭了，但还是要长大','这表情逐渐不对劲','已经开始膨胀了','小球得志，拿捏了','究极大球球，登场！'];
      $('combo').textContent=e.combo>1?`${e.combo} 连合成 · 越来越离谱！`:reactions[e.level];
      $('announcer').textContent=`合成${planets[e.level].name}，获得${e.points}分，总分${game.score}分`;
      if(playMode==='task'&&game.merges>=5&&game.score>=500){game.ended=true;recordLeaderboard();toast('今日任务完成！');openModal('over');}
    },
    onSpecial(e){const labels={bomb:'炸弹球清场！',rainbow:'彩虹球：跨级合成！',freeze:'冰冻球：时间暂停！',magnet:'磁铁球：吸过来！',split:'分裂球：一变二！'};toast(labels[e.type]||'特殊球触发');specialEffects.push({type:e.type,x:e.x,y:e.y,life:1});const effectColors={bomb:'#d86b4d',rainbow:'#c99038',freeze:'#6ea6b4',magnet:'#7d8fca',split:'#ae7a49'};for(let i=0;i<28;i++){const a=Math.random()*Math.PI*2,s=45+Math.random()*120;particles.push({x:e.x,y:e.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.85,max:.85,size:2+Math.random()*4,color:effectColors[e.type]||'#c99038'});}},
    onDrop(ball){soundPlayer.drop();if(ball?.special&&toolInventory[ball.special]>0){toolInventory[ball.special]--;saveInventory();$('ad-status').textContent=`${specialMeta[ball.special][1]}已使用 1 个`; }updateNext();renderTools();},
    onEnd(){saveBest();recordLeaderboard();openModal('over');},
    onWin(){toast('究极大球球诞生！这局有点离谱 ✨');}
  });
  renderTools();$('watch-ad').addEventListener('click',watchRewarded);
  lastDiscoveryCount=game.discovered.size;
  function chooseMode(next){if(next===playMode)return;pendingMode=next;openModal('mode-switch');}
  function confirmModeSwitch(){if(!pendingMode)return;playMode=pendingMode;game.mode=playMode;pendingMode=null;document.querySelectorAll('.mode-button').forEach(button=>button.classList.toggle('active',button.dataset.mode===playMode));const labels={timed:'60秒挑战',free:'轻松模式',endless:'无尽模式',task:'任务模式',challenge:'挑战模式',classic:'经典模式'};toast(`已切换到${labels[playMode]||'经典模式'}`);restart();}
  document.querySelectorAll('.mode-button').forEach(button=>button.addEventListener('click',()=>chooseMode(button.dataset.mode)));
  // Draw planets with surface markings, faces and light; rotation follows the body.
  function planet(c,level,x,y,r,angle=0,alpha=1,time=0) {
    const p=planets[level];
    c.save();c.globalAlpha=alpha;c.translate(x,y);
    c.fillStyle='#52644413';c.beginPath();c.ellipse(1,r*.89,r*.8,r*.16,0,0,Math.PI*2);c.fill();
    c.rotate(angle);
    const texture=textures[level];
    if(texture&&texture.image.complete) {
      c.save();c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.clip();c.fillStyle='#fff5c9';c.fillRect(-r,-r,r*2,r*2);
      const image=texture.image,crop=texture.crop||[0,0,image.naturalWidth,image.naturalHeight];
      const [sx,sy,sw,sh]=crop,side=Math.min(sw,sh);
      c.drawImage(image,sx+(sw-side)/2,sy+(sh-side)/2,side,side,-r,-r,r*2,r*2);
      const light=c.createLinearGradient(-r,-r,r,r);light.addColorStop(0,'#ffffff18');light.addColorStop(.6,'#ffffff00');light.addColorStop(1,'#80501326');
      c.fillStyle=light;c.fillRect(-r,-r,r*2,r*2);c.restore();
      c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.lineWidth=Math.max(1.4,r*.025);c.strokeStyle=['#e9c675','#e9b974','#e2a861','#df9555','#d98c50','#dd8d65','#cc8056','#c9723e','#c56631','#ab4b27'][level];c.stroke();c.restore();return;
    }
    if(level===9){c.save();c.strokeStyle='#e7c37b66';c.lineWidth=2;for(let i=0;i<12;i++){const a=i*Math.PI/6;c.beginPath();c.moveTo(Math.cos(a)*r*1.06,Math.sin(a)*r*1.06);c.lineTo(Math.cos(a)*r*1.16,Math.sin(a)*r*1.16);c.stroke();}c.restore();}
    const grad=c.createRadialGradient(-r*.35,-r*.45,r*.08,r*.15,r*.2,r*1.25);grad.addColorStop(0,p.light);grad.addColorStop(.65,p.color);grad.addColorStop(1,p.dark);
    c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fillStyle=grad;c.fill();c.strokeStyle=p.dark+'55';c.lineWidth=1;c.stroke();
    c.save();c.beginPath();c.arc(0,0,r-1,0,Math.PI*2);c.clip();
    c.globalAlpha=alpha*.22;c.fillStyle=p.dark;
    if(level===0){[[-.47,-.22,.19],[.35,.4,.16],[.42,-.45,.11],[-.3,.52,.09]].forEach(([a,b,s])=>{c.beginPath();c.arc(a*r,b*r,s*r,0,Math.PI*2);c.fill();});}
    else if([3,5,7,8].includes(level)) {
      c.rotate(-.32);c.lineWidth=r*.19;c.strokeStyle=p.light;
      for(let i=-2;i<=2;i++){c.beginPath();c.ellipse(0,i*r*.48,r*1.3,r*.29,0,0,Math.PI);c.stroke();}
    }else{for(let i=0;i<8;i++){const a=i*2.399+level;c.beginPath();c.ellipse(Math.cos(a)*r*.65,Math.sin(a)*r*.65,r*(.08+(i%3)*.03),r*.075,a,0,Math.PI*2);c.fill();}}
    c.restore();
    if(level===8){c.save();c.rotate(-.36);c.strokeStyle='#ac925dc0';c.lineWidth=r*.1;c.beginPath();c.ellipse(0,0,r*1.03,r*.31,0,0,Math.PI);c.stroke();c.strokeStyle='#f5e2b0';c.lineWidth=r*.03;c.stroke();c.restore();}
    c.fillStyle='#fff';c.globalAlpha=alpha*.25;c.beginPath();c.ellipse(-r*.32,-r*.48,r*.27,r*.11,-.5,0,Math.PI*2);c.fill();c.globalAlpha=alpha;
    // Quiet, friendly faces make the ball's physical rotation visible.
    c.fillStyle='#43503f';const eye=Math.max(1.4,r*.043),ey=-r*.035;
    [-1,1].forEach(sign=>{c.beginPath();c.ellipse(sign*r*.2,ey,eye,eye*1.3,0,0,Math.PI*2);c.fill();});
    c.strokeStyle='#526044';c.lineWidth=Math.max(1,r*.025);c.beginPath();c.arc(0,r*.09,r*.095,.12,Math.PI-.12);c.stroke();
    c.fillStyle='#ce7f7b';c.globalAlpha=alpha*.25;[-1,1].forEach(sign=>{c.beginPath();c.ellipse(sign*r*.34,r*.1,r*.09,r*.045,0,0,Math.PI*2);c.fill();});
    c.restore();
  }
  function drawSpecial(c,special,x,y,r){if(!special)return;const icons={bomb:'✹',rainbow:'✦',freeze:'❄',magnet:'↯',split:'Ⅱ'};c.save();c.translate(x+r*.45,y-r*.45);c.fillStyle='#fffdf0';c.strokeStyle='#78603a';c.lineWidth=Math.max(1,r*.035);c.beginPath();c.arc(0,0,Math.max(7,r*.25),0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#78603a';c.font=`700 ${Math.max(9,r*.25)}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(icons[special]||'✦',0,1);c.restore();}
  function drawSpecialEffect(c,e){const t=e.life,x=e.x,y=e.y;c.save();c.globalAlpha=Math.max(0,t);c.translate(x,y);if(e.type==='bomb'){c.strokeStyle='#d86b4d';c.lineWidth=3;for(let i=0;i<2;i++){c.beginPath();c.arc(0,0,(1-t)*92+i*9,0,Math.PI*2);c.stroke();}c.fillStyle='#d86b4d';for(let i=0;i<10;i++){const a=i*Math.PI/5;c.beginPath();c.moveTo(Math.cos(a)*18,Math.sin(a)*18);c.lineTo(Math.cos(a)*(42+(1-t)*35),Math.sin(a)*(42+(1-t)*35));c.stroke();}}else if(e.type==='rainbow'){const colors=['#e97878','#e6a14b','#d5be58','#7eaa76','#6ea6b4','#858fc1'];c.lineWidth=4;colors.forEach((color,i)=>{c.strokeStyle=color;c.beginPath();c.arc(0,0,(1-t)*70+i*5,Math.PI*1.08,Math.PI*1.92);c.stroke();});}else if(e.type==='freeze'){c.strokeStyle='#6ea6b4';c.lineWidth=2;c.beginPath();c.arc(0,0,20+(1-t)*62,0,Math.PI*2);c.stroke();c.fillStyle='#d8f1ef';for(let i=0;i<8;i++){const a=i*Math.PI/4,r=18+(1-t)*55;c.save();c.rotate(a);c.beginPath();c.moveTo(0,-r);c.lineTo(5,-r+10);c.lineTo(0,-r+18);c.lineTo(-5,-r+10);c.fill();c.restore();}}else if(e.type==='magnet'){c.strokeStyle='#7d8fca';c.lineWidth=2;for(let i=0;i<4;i++){c.beginPath();c.arc(0,0,20+i*12,Math.PI*.2,Math.PI*.8);c.stroke();}c.fillStyle='#7d8fca';c.beginPath();c.arc(-28,0,4,0,Math.PI*2);c.arc(28,0,4,0,Math.PI*2);c.fill();}else if(e.type==='split'){c.strokeStyle='#ae7a49';c.lineWidth=3;c.beginPath();c.moveTo(0,0);c.lineTo(-(1-t)*72,-(1-t)*45);c.moveTo(0,0);c.lineTo((1-t)*72,-(1-t)*45);c.stroke();c.fillStyle='#e8c47f';c.beginPath();c.arc(-(1-t)*72,-(1-t)*45,8,0,Math.PI*2);c.arc((1-t)*72,-(1-t)*45,8,0,Math.PI*2);c.fill();}c.restore();}
  const thumbCanvases=[];
  planets.forEach((p,i)=>{
    const item=document.createElement('div');item.className='planet-item';item.title=`${p.name} · 第${i+1}级`;
    const mini=document.createElement('canvas');mini.width=104;mini.height=96;mini.setAttribute('aria-label',p.name);
    const label=document.createElement('span');label.textContent=p.name;item.append(mini,label);$('evolution').append(item);thumbCanvases.push({item,canvas:mini});
    const size=20+i*.9;planet(mini.getContext('2d'),i,52,45,size,0);
  });
  function repaintThumbs(){thumbCanvases.forEach((p,i)=>{const c=p.canvas.getContext('2d');c.clearRect(0,0,104,96);planet(c,i,52,45,20+i*.9);p.item.querySelector('span').textContent=planets[i].name;});updateNext();updateDiscovery();}
  const imageCache={};
  function loadDefaultSkins(){
    const stamp=customVersions.slice();
    return Promise.all(Object.entries(skinConfig.sources).map(([key,src])=>new Promise(resolve=>{
      const image=imageCache[key]||new Image();imageCache[key]=image;
      const done=()=>{skinConfig.levels.forEach((s,i)=>{if(s.source===key&&customVersions[i]===stamp[i])textures[i]={image,crop:s.crop};});resolve();};
      if(image.complete&&image.naturalWidth){done();return;}image.onload=done;image.onerror=()=>{resolve();toast('部分图片加载失败，可在图片编辑器中替换');};image.src=src;
    }))).then(()=>{repaintThumbs();repaintEditor();});
  }
  const editor=$('skin-editor'), editorItems=[];let editorWasPaused=false;
  for(let i=0;i<10;i++){
    const item=document.createElement('div');item.className='skin-slot';
    const label=document.createElement('label');label.className='skin-upload';label.htmlFor=`skin-${i}`;label.title=`替换第${i+1}级图片`;
    const preview=document.createElement('canvas');preview.width=112;preview.height=112;preview.setAttribute('aria-label',`第${i+1}级图片`);
    const caption=document.createElement('span');caption.textContent=`${String(i+1).padStart(2,'0')} · 换图`;label.append(preview,caption);
    const input=document.createElement('input');input.id=`skin-${i}`;input.type='file';input.accept='image/png,image/jpeg,image/webp';input.className='sr-only';input.setAttribute('aria-label',`替换第${i+1}级图片`);
    const name=document.createElement('input');name.type='text';name.value=planets[i].name;name.maxLength=10;name.className='skin-name';name.setAttribute('aria-label',`第${i+1}级名称`);
    name.addEventListener('change',()=>{planets[i].name=name.value.trim()||(stageNames[i]||originalNames[i]);name.value=planets[i].name;if(storedSkins[i]){storedSkins[i].name=planets[i].name;persistSkins();}repaintThumbs();});
    input.addEventListener('change',async()=>{if(input.files[0])await importSkin(i,input.files[0]);input.value='';});
    item.append(label,input,name);$('skin-slots').append(item);editorItems.push({preview,name});
  }
  function repaintEditor(){editorItems.forEach((item,i)=>{const c=item.preview.getContext('2d');c.clearRect(0,0,112,112);planet(c,i,56,56,48);item.name.value=planets[i].name;});}
  async function importSkin(i,file){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){$('skin-feedback').textContent='请选择不超过 8 MB 的 PNG、JPG 或 WebP 图片。';return false;}
    const version=++customVersions[i],url=URL.createObjectURL(file);
    try{
      const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});
      if(image.naturalWidth*image.naturalHeight>80000000)throw new Error('图片尺寸过大');
      const small=document.createElement('canvas');small.width=256;small.height=256;const c=small.getContext('2d'),side=Math.min(image.naturalWidth,image.naturalHeight);
      c.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,256,256);
      const prepared=await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.src=small.toDataURL('image/webp',.78);});
      if(customVersions[i]!==version)return false;textures[i]={image:prepared};storedSkins[i]={src:prepared.src,name:planets[i].name};persistSkins();repaintThumbs();repaintEditor();$('skin-feedback').textContent=`第 ${i + 1} 级已替换并保存：${file.name}`;return true;
    }catch{$('skin-feedback').textContent='这张图片无法读取，请换一张。';return false;}finally{URL.revokeObjectURL(url);}
  }
  function loadStoredSkins(){return Promise.all(Object.entries(storedSkins).map(([key,data])=>new Promise(resolve=>{const i=Number(key);if(!data?.src||!Number.isInteger(i)||i<0||i>=planets.length){resolve();return;}const image=new Image();image.onload=()=>{textures[i]={image};if(data.name)planets[i].name=data.name;resolve();};image.onerror=()=>resolve();image.src=data.src;}))).then(()=>{repaintThumbs();repaintEditor();});}
  $('skin-batch').addEventListener('change',async e=>{const files=Array.from(e.target.files).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})).slice(0,10);let count=0;for(let i=0;i<files.length;i++)if(await importSkin(i,files[i]))count++;e.target.value='';$('skin-feedback').textContent=`已替换 ${count} 个等级，顺序按文件名排列。`;});
  $('custom-merge-audio').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;if(!file.type.startsWith('audio/')||file.size>3*1024*1024){$('skin-feedback').textContent='请选择不超过 3 MB 的音频文件。';e.target.value='';return;}const reader=new FileReader();reader.onload=()=>{try{customMergeAudioData=reader.result;localStorage.setItem(customAudioKey,customMergeAudioData);customMergeAudio=new Audio(customMergeAudioData);updateCustomAudioUI();$('skin-feedback').textContent=`合成音效已保存：${file.name}`;}catch{$('skin-feedback').textContent='音效保存失败，请换一个较小的文件。';}};reader.readAsDataURL(file);e.target.value='';});
  $('preview-merge-audio').addEventListener('click',()=>{if(!playCustomMergeAudio())soundPlayer.preview(game.current);});
  $('reset-merge-audio').addEventListener('click',()=>{customMergeAudioData='';customMergeAudio=null;try{localStorage.removeItem(customAudioKey);}catch{}updateCustomAudioUI();$('skin-feedback').textContent='已恢复默认合成音效。';});
  $('edit-skins').addEventListener('click',()=>{activePointer=null;editorWasPaused=game.paused;game.paused=true;soundPlayer.stopAll();repaintEditor();editor.showModal();});
  $('edit-audio').addEventListener('click',()=>{activePointer=null;editorWasPaused=game.paused;game.paused=true;soundPlayer.stopAll();repaintEditor();editor.showModal();setTimeout(()=>$('custom-merge-audio').focus(),50);});
  $('close-skins').addEventListener('click',()=>editor.close());$('done-skins').addEventListener('click',()=>editor.close());
  editor.addEventListener('close',()=>{game.paused=editorWasPaused;lastTime=performance.now();accumulator=0;});
  $('reset-skins').addEventListener('click',()=>{customVersions.forEach((v,i)=>{customVersions[i]++;textures[i]=null;planets[i].name=stageNames[i]||originalNames[i];});storedSkins={};try{localStorage.removeItem(customSkinKey);}catch{}loadDefaultSkins();$('skin-feedback').textContent='已恢复默认球球成长图片。';});
  const reviveButton=document.createElement('button');reviveButton.id='revive';reviveButton.className='primary revive-button';reviveButton.textContent='免费复活一次 · 试玩版';reviveButton.hidden=true;$('modal-primary').before(reviveButton);
  reviveButton.addEventListener('click',()=>{if(game.revive()){closeModal();toast('已清理上方球体，这局还能救！');}});
  function updateDiscovery(){thumbCanvases.forEach((p,i)=>{const found=game.discovered.has(i);p.item.className='planet-item '+(found?'unlocked':'locked');p.item.title=`${planets[i].name} · 第${i+1}级 · ${found?'已发现':'尚未发现'}`;});$('discovered').textContent=`已发现 ${game.discovered.size} / 10 种形态`;}
  function updateNext(){const p=planets[game.next],c=$('next').getContext('2d');const specialInfo={bomb:['炸弹球','碰撞后清除附近的小球'],rainbow:['彩虹球','可以和不同等级的小球合成'],freeze:['冰冻球','让附近的小球暂时停止'],magnet:['磁铁球','把附近的小球吸到身边'],split:['分裂球','碰撞后分裂成两个小球']};c.clearRect(0,0,120,100);planet(c,game.next,60,49,Math.min(32,p.radius*1.15),-.14);drawSpecial(c,game.nextSpecial,60,49,Math.min(32,p.radius*1.15));const info=game.nextSpecial?specialInfo[game.nextSpecial]:null;$('next-name').textContent=info?`${info[0]} · ${p.name}`:p.name;$('next-level').textContent=info?'SPECIAL':`LEVEL ${String(game.next+1).padStart(2,'0')}`;$('next-note-text').textContent=info?info[1]:'它来了，它又来了';$('next').setAttribute('aria-label',info?`下一个${info[0]}：${info[1]}`:`下一个星球：${p.name}`);}
  function updateSound(){
    $('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');$('sound').title=sound?'关闭音效':'开启音效';
    $('sound').innerHTML=`<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z${sound?'m4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14':'m5 4 5 6m0-6-5 6'}"/></svg>`;
  }
  $('sound').addEventListener('click',()=>{sound=!sound;soundPlayer.setEnabled(sound);updateSound();try{localStorage.setItem('planet-merge-sound',sound);}catch{}if(sound)soundPlayer.unlock();});
  const soundPreview=document.createElement('button');soundPreview.id='sound-preview';soundPreview.className='small-pill';soundPreview.textContent='试听';soundPreview.setAttribute('aria-label','试听当前球球的完整笑声');$('sound').before(soundPreview);
  soundPreview.addEventListener('click',()=>{sound=true;soundPlayer.setEnabled(true);updateSound();try{localStorage.setItem('planet-merge-sound',true);}catch{}soundPlayer.preview(game.current);});
  function openModal(type) {
    if(type!=='over')soundPlayer.stopAll();
    previousFocus=document.activeElement;mode=type;game.paused=true;$('overlay').hidden=false;
    reviveButton.hidden=type!=='over'||game.reviveCount>=1;
    const labels={timed:'60秒挑战',free:'轻松模式',endless:'无尽模式',task:'任务模式',challenge:'挑战模式',classic:'经典模式'};
    const modeRules={free:'无危险线，特殊球出现更频繁',endless:'无危险线，专注冲击最高分',timed:'60 秒内尽可能合成',task:'完成 5 次合成并达到 500 分',challenge:'固定球序，考验规划'};
    const config=type==='over'?['TOO MUCH BALL ENERGY','这下，真装不下了',`本次获得 ${game.score} 分，合成 ${game.merges} 次。再碰一局，还能更离谱。`,'再来一局','回看这一局']:type==='mode-switch'?['CHANGE PLAY MODE',`切换到${labels[pendingMode]||'新模式'}？`,`当前模式的分数、球堆和进度会清零。新规则：${modeRules[pendingMode]||'标准危险线玩法'}。`,'确认切换','保留当前模式']:type==='restart'?['ONE MORE. EVEN WEIRDER.','再养一窝球球？','当前这一局将重新开始，个人最佳会保留。','重新开始','继续这一局']:['TAKE A LITTLE BREAK','球球也要歇会儿','歇够了，继续碰一碰。','继续碰一碰','重新开始'];
    ['modal-eyebrow','modal-title','modal-description'].forEach((id,i)=>$(id).textContent=config[i]);
    $('modal-primary').innerHTML=config[3]+' <span>↗</span>';$('modal-secondary').textContent=config[4];
    const stats=$('modal-stats'),share=$('share-result');if(stats){stats.hidden=type!=='over';$('modal-score').textContent=game.score.toLocaleString();$('modal-combo').textContent=game.combo;$('modal-mode').textContent={timed:'60秒',free:'轻松',task:'任务',challenge:'挑战',endless:'无尽',classic:'经典'}[playMode]||'经典';}if(share)share.hidden=type!=='over';
    $('game-status').textContent=type==='over'?'本局已结束':'球球休息中';$('pause').setAttribute('aria-label','继续游戏');$('modal-primary').focus();
  }
  $('share-result').addEventListener('click',async()=>{const text=`我在《球球碰碰》${{timed:'60秒挑战',free:'轻松模式',task:'任务模式',challenge:'挑战模式',endless:'无尽模式',classic:'经典模式'}[playMode]||'经典模式'}拿到 ${game.score} 分，连续合成 ${game.combo} 次！`;try{if(navigator.share)await navigator.share({title:'我的球球战绩',text});else{await navigator.clipboard.writeText(text);toast('战绩文案已复制，去分享给朋友吧');}}catch{}});
  function closeModal(){ $('overlay').hidden=true;game.paused=false;$('game-status').textContent=game.ended?'本局已结束':'球球营业中';$('pause').setAttribute('aria-label','暂停游戏');(previousFocus&&previousFocus!==document.body?previousFocus:canvas).focus({preventScroll:true}); }
  function restart(){soundPlayer.stopAll();game.reset();lastDiscoveryCount=game.discovered.size;particles=[];specialEffects=[];floaters=[];$('score').textContent='0';$('combo').textContent='重开了，这把一定！';$('board-wrap').classList.remove('danger');closeModal();updateNext();updateDiscovery();renderTools();lastTime=performance.now();accumulator=0;}
  $('modal-primary').addEventListener('click',()=>mode==='pause'?closeModal():mode==='mode-switch'?confirmModeSwitch():restart());
  $('modal-secondary').addEventListener('click',()=>mode==='pause'?openModal('restart'):mode==='mode-switch'?(pendingMode=null,closeModal()):closeModal());
  $('pause').addEventListener('click',()=>{if(game.ended){openModal('over');return;}game.paused?closeModal():openModal('pause');});
  $('restart').addEventListener('click',restart);
  function aimAt(event){const rect=canvas.getBoundingClientRect();game.setAim((event.clientX-rect.left)/rect.width*W);}
  let activePointer=null;
  canvas.addEventListener('pointerdown',e=>{if(game.paused||game.ended||activePointer!==null||e.button>0)return;e.preventDefault();activePointer=e.pointerId;canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});aimAt(e);if(sound)soundPlayer.unlock();});
  canvas.addEventListener('pointermove',e=>{if(!game.paused&&!game.ended&&(activePointer===null||activePointer===e.pointerId))aimAt(e);});
  canvas.addEventListener('pointerup',e=>{if(e.pointerId!==activePointer)return;aimAt(e);activePointer=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);game.drop();});
  canvas.addEventListener('pointercancel',()=>{activePointer=null;});
  canvas.addEventListener('lostpointercapture',()=>{activePointer=null;});
  document.addEventListener('keydown',e=>{
    if(editor.open)return;
    if(!$('overlay').hidden){
      if(e.key==='Tab'){const first=reviveButton.hidden?$('modal-primary'):reviveButton,last=$('modal-secondary');if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
      if(e.key==='Escape'||e.key.toLowerCase()==='p'){e.preventDefault();closeModal();}return;
    }
    if(e.target instanceof HTMLButtonElement||e.target instanceof HTMLAnchorElement)return;
    if(['ArrowLeft','ArrowRight',' '].includes(e.key)){e.preventDefault();if(sound)soundPlayer.unlock();}
    if(e.key==='ArrowLeft')game.setAim(game.aim-14);else if(e.key==='ArrowRight')game.setAim(game.aim+14);
    else if(e.key===' '&&!e.repeat)game.drop();else if(e.key.toLowerCase()==='p'&&!game.ended)openModal('pause');
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!game.paused&&!game.ended)openModal('pause');});
  function resize(){const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
  window.addEventListener('resize',resize);resize();
  function drawBackground(){
    ctx.clearRect(0,0,W,H);ctx.fillStyle=boardColors.board;ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#9c968431';for(let x=18;x<W;x+=22)for(let y=17;y<H;y+=22){ctx.beginPath();ctx.arc(x,y,.7,0,Math.PI*2);ctx.fill();}
    if(!['free','endless'].includes(playMode)){ctx.strokeStyle=game.overflow?'#a94f3a':boardColors['board-line'];ctx.lineWidth=1.3;ctx.setLineDash([5,6]);ctx.beginPath();ctx.moveTo(14,LIMIT);ctx.lineTo(W-14,LIMIT);ctx.stroke();ctx.setLineDash([]);}
    ctx.fillStyle=boardColors['board-floor'];ctx.fillRect(0,FLOOR,W,H-FLOOR);ctx.strokeStyle=boardColors['board-floor-line'];ctx.beginPath();ctx.moveTo(0,FLOOR);ctx.lineTo(W,FLOOR);ctx.stroke();
    if(game.balls.length<12){ctx.save();ctx.textAlign='center';ctx.fillStyle=boardColors['board-note'];ctx.font='11px "Segoe UI",sans-serif';ctx.fillText('地方小了，球球可没变小。',W/2,H*.54);ctx.font='9px "Segoe UI",sans-serif';ctx.fillText('LESS SPACE. MORE BALL.',W/2,H*.585);ctx.restore();}
  }
  function drawAim(){
    if(game.ended)return;const r=planets[game.current].radius,available=game.time>=game.readyAt;
    let bottom=FLOOR-r;
    for(const b of game.balls){const dx=Math.abs(b.position.x-game.aim),sum=b.circleRadius+r;if(dx<sum){bottom=Math.min(bottom,b.position.y-Math.sqrt(sum*sum-dx*dx));}}
    bottom=Math.max(SPAWN,bottom);
    ctx.save();ctx.globalAlpha=available?.85:.4;ctx.lineWidth=1;ctx.strokeStyle=boardColors['board-aim'];ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(game.aim,SPAWN+r+9);ctx.lineTo(game.aim,bottom);ctx.stroke();ctx.setLineDash([]);
    ctx.globalAlpha=.22;ctx.fillStyle=planets[game.current].color;ctx.beginPath();ctx.arc(game.aim,bottom,r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=available?.7:.35;ctx.strokeStyle=boardColors['board-aim'];ctx.stroke();ctx.restore();
    planet(ctx,game.current,game.aim,SPAWN,r,0,available?1:.35);drawSpecial(ctx,game.selectedSpecial||game.currentSpecial,game.aim,SPAWN,r);
    ctx.fillStyle=boardColors['board-aim'];ctx.beginPath();ctx.moveTo(game.aim-3,20);ctx.lineTo(game.aim+3,20);ctx.lineTo(game.aim,24);ctx.fill();
  }
  let lastTime=performance.now(),accumulator=0;
  function frame(now){
    const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;
    if(!game.paused&&!game.ended){accumulator+=dt*1000;let count=0;while(accumulator>=1000/120&&count++<8){game.step();accumulator-=1000/120;}if(game.paused||game.ended)accumulator=0;}else accumulator=0;
    const safeMode=['free','endless'].includes(playMode);$('board-wrap').classList.toggle('safe',safeMode);$('limit-label').hidden=safeMode;drawBackground();drawAim();
    for(const b of game.balls){const age=game.time-b.born;const scale=age<180?.78+.22*Math.min(1,age/180):1;planet(ctx,b.level,b.position.x,b.position.y,b.circleRadius*scale,b.angle);drawSpecial(ctx,b.special,b.position.x,b.position.y,b.circleRadius*scale,b.angle);}
    if(!game.paused){
      for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=110*dt;}
      for(const f of floaters){f.life-=dt;f.y-=30*dt;}
      for(const e of specialEffects)e.life-=dt*1.35;
      particles=particles.filter(p=>p.life>0);floaters=floaters.filter(f=>f.life>0);
      specialEffects=specialEffects.filter(e=>e.life>0);
    }
    for(const e of specialEffects)drawSpecialEffect(ctx,e);
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size*p.life/p.max,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    for(const f of floaters){ctx.globalAlpha=Math.min(1,f.life*2);ctx.font='600 18px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.fillStyle='#527340';ctx.fillText(f.text,f.x,f.y);}ctx.globalAlpha=1;
    $('board-wrap').classList.toggle('danger',game.overflow>100);
    if(game.overflow>0&&!game.ended)$('game-status').textContent=`空间不足 · ${Math.max(1,Math.ceil((2200-game.overflow)/1000))} 秒`;
    else if(!game.paused&&!game.ended)$('game-status').textContent='球球营业中';
    const timer=$('mode-timer');if(timer)timer.textContent=playMode==='timed'?`${Math.ceil(game.timeLeft/1000)}s`:'∞';
    requestAnimationFrame(frame);
  }
  updateNext();updateDiscovery();updateSound();updateDaily();updateCustomAudioUI();renderLeaderboard();loadDefaultSkins().then(loadStoredSkins);requestAnimationFrame(frame);
})();
