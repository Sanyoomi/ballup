const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const scoreEl = document.querySelector('#score');
const overEl = document.querySelector('#game-over');
const W = 720, H = 760, dangerY = 128;
canvas.width = W; canvas.height = H;
const sizes = [18, 25, 34, 45, 59, 76, 96];
const colors = ['#fca5a5','#fdba74','#fde68a','#bef264','#86efac','#67e8f9','#93c5fd'];
let balls, score, gameOver, current, dragging, last = performance.now();
const gravity = 0.22;
function reset() { balls=[]; score=0; gameOver=false; dragging=false; current=null; scoreEl.textContent=score; overEl.classList.add('hidden'); spawnPreview(); }
function spawnPreview() { current={x:W/2,y:58,r:sizes[0],level:0,vy:0}; }
function pointerX(e) { const rect=canvas.getBoundingClientRect(); return (e.clientX-rect.left)*W/rect.width; }
function release() { if (!current || gameOver) return; current.y=62; current.vy=0; balls.push(current); current=null; dragging=false; setTimeout(()=>{ if(!gameOver) spawnPreview(); }, 320); }
canvas.addEventListener('pointerdown', e=>{ if(!gameOver){ dragging=true; canvas.setPointerCapture(e.pointerId); current.x=Math.max(current.r,Math.min(W-current.r,pointerX(e))); }});
canvas.addEventListener('pointermove', e=>{ if(dragging&&current) current.x=Math.max(current.r,Math.min(W-current.r,pointerX(e))); });
canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
document.querySelector('#restart').onclick=reset; document.querySelector('#restart-overlay').onclick=reset;
function merge(a,b) { const level=a.level+1; if(level>=sizes.length) return false; const r=sizes[level]; const c={x:(a.x+b.x)/2,y:Math.min(a.y,b.y),r,level,vy:-2}; balls=balls.filter(x=>x!==a&&x!==b); balls.push(c); score += (level+1)*10; scoreEl.textContent=score; return true; }
function update(dt) { if(gameOver) return; balls.forEach(b=>{ b.vy+=gravity*dt; b.y+=b.vy*dt; b.x += (b.vx||0)*dt; b.vx=(b.vx||0)*.99; if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx)*.55;} if(b.x>W-b.r){b.x=W-b.r;b.vx=-Math.abs(b.vx)*.55;} if(b.y>H-b.r){b.y=H-b.r;b.vy*=-.28;if(Math.abs(b.vy)<.7)b.vy=0;} });
  for(let i=0;i<balls.length;i++) for(let j=i+1;j<balls.length;j++){const a=balls[i],b=balls[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.r+b.r;if(d<min){ if(a.level===b.level){merge(a,b); i=-1; break;} const nx=dx/(d||1),ny=dy/(d||1),push=(min-d)/2;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push; const impact=(a.vy-b.vy)*ny; if(impact>0){a.vy-=impact*.35;b.vy+=impact*.35;} }}
  if(balls.some(b=>b.y-b.r<dangerY && Math.abs(b.vy)<1.2)) { gameOver=true; overEl.classList.remove('hidden'); }
}
function drawBall(b) { const g=ctx.createRadialGradient(b.x-b.r*.3,b.y-b.r*.35,2,b.x,b.y,b.r); g.addColorStop(0,'#fff'); g.addColorStop(.18,colors[b.level]); g.addColorStop(1,colors[b.level]+'99'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#ffffff44'; ctx.lineWidth=2; ctx.stroke(); }
function draw() { ctx.clearRect(0,0,W,H); ctx.fillStyle='#16233b';ctx.fillRect(0,0,W,H); ctx.setLineDash([8,8]);ctx.strokeStyle='#fb7185aa';ctx.beginPath();ctx.moveTo(0,dangerY);ctx.lineTo(W,dangerY);ctx.stroke();ctx.setLineDash([]); balls.forEach(drawBall); if(current){ctx.globalAlpha=.9;drawBall(current);ctx.globalAlpha=1;ctx.strokeStyle='#ffffff33';ctx.beginPath();ctx.moveTo(current.x,70);ctx.lineTo(current.x,current.y-current.r-5);ctx.stroke();} }
function loop(now){const dt=Math.min(2,(now-last)/16.67);last=now;update(dt);draw();requestAnimationFrame(loop);} reset(); requestAnimationFrame(loop);
