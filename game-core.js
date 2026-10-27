/* Planet Merge: deterministic fixed-step simulation shared by the game and tests. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/matter.min.js'));
  else root.PlanetGame = factory(root.Matter);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(Matter) {
  'use strict';
  if (!Matter) throw new Error('物理引擎加载失败，请刷新页面。');
  const { Engine, Bodies, Body, Composite, Events } = Matter;
  const WIDTH = 360, HEIGHT = 500, FLOOR = 488, LIMIT = 118, SPAWN = 50;
  const SPECIALS = ['bomb','rainbow','freeze','magnet','split'];
  const PLANETS = [
    { name:'小小月', radius:17, color:'#b4c4a3', light:'#dce3c9', dark:'#8cA17d', score:2 },
    { name:'桃桃星', radius:24, color:'#e7b59e', light:'#f5d6be', dark:'#cc937e', score:4 },
    { name:'柠檬星', radius:31, color:'#e8cd7c', light:'#f7e4a1', dark:'#c9af60', score:8 },
    { name:'海盐星', radius:39, color:'#91b9c1', light:'#c6dfe0', dark:'#6e9fa9', score:16 },
    { name:'莓莓星', radius:48, color:'#beabc8', light:'#dfd0e3', dark:'#a38db0', score:32 },
    { name:'橘子星', radius:58, color:'#dfa078', light:'#f3c99d', dark:'#c18260', score:64 },
    { name:'森林星', radius:69, color:'#829e74', light:'#b7c7a2', dark:'#617f57', score:128 },
    { name:'泡泡星', radius:81, color:'#92b9d0', light:'#cbdfea', dark:'#709bb7', score:256 },
    { name:'土星', radius:94, color:'#d6bc82', light:'#f2dcac', dark:'#b59b69', score:512 },
    { name:'小太阳', radius:108, color:'#e8b65f', light:'#ffe2a0', dark:'#cc9941', score:1024 }
  ];
  class Game {
    constructor(options = {}) {
      this.random = options.random || Math.random;
      this.onMerge = options.onMerge || (() => {});
      this.onEnd = options.onEnd || (() => {});
      this.onDrop = options.onDrop || (() => {});
      this.onWin = options.onWin || (() => {});
      this.onSpecial = options.onSpecial || (() => {});
      this.engine = Engine.create({enableSleeping:true,positionIterations:8,velocityIterations:8});
      this.engine.gravity.y = 1.25;
      this.queue = [];
      const collisions = event => {
        for (const pair of event.pairs) {
          const a=pair.bodyA, b=pair.bodyB;
          if (a.planet && b.planet && (a.special || b.special || (a.level===b.level && a.level<PLANETS.length-1))) this.queue.push([a,b]);
        }
      };
      Events.on(this.engine,'collisionStart',collisions);
      Events.on(this.engine,'collisionActive',collisions);
      this.reset();
    }
    roll() { if(this.mode==='challenge'){const sequence=[0,1,0,2,1,0,3,0,1,2,0,1,0,3];const value=sequence[this.challengeIndex%sequence.length];this.challengeIndex++;return value;} const n=this.random(); return n<.48?0:n<.78?1:n<.94?2:3; }
    rollSpecial() { const n=this.random(); return n<.035?'bomb':n<.06?'rainbow':n<.082?'freeze':n<.104?'magnet':n<.126?'split':null; }
    reset(seed = true) {
      Composite.clear(this.engine.world,false); Engine.clear(this.engine);
      this.time=0; this.score=0; this.drops=0; this.merges=0; this.ended=false; this.paused=false; this.won=false;
      this.mode=this.mode||'classic'; this.timeLeft=60000; this.challengeIndex=0;
      this.current=0; this.currentSpecial=null; this.next=this.roll(); this.nextSpecial=this.rollSpecial(); this.aim=WIDTH/2; this.readyAt=0; this.overflow=0; this.reviveCount=0;
      this.lastMerge=-10000; this.combo=0; this.queue=[]; this.discovered=new Set([0]);
      Composite.add(this.engine.world,[
        Bodies.rectangle(-20,HEIGHT/2,40,HEIGHT*4,{isStatic:true,friction:.45}),
        Bodies.rectangle(WIDTH+20,HEIGHT/2,40,HEIGHT*4,{isStatic:true,friction:.45}),
        Bodies.rectangle(WIDTH/2,FLOOR+30,WIDTH+80,60,{isStatic:true,friction:.55,restitution:.12})
      ]);
      if(seed) {
        [[1,.14],[0,.255],[2,.395],[0,.535],[1,.655],[0,.77]].forEach(([level,fraction])=>this.add(level,WIDTH*fraction,FLOOR-PLANETS[level].radius-5));
      }
    }
    get balls() { return this.engine.world.bodies.filter(b=>b.planet); }
    add(level,x,y,velocity,angle=0,special=null) {
      const r=PLANETS[level].radius;
      const b=Bodies.circle(Math.max(r,Math.min(WIDTH-r,x)),Math.min(FLOOR-r,y),r,{
        restitution:.25,friction:.32,frictionStatic:.65,frictionAir:.0035,density:.0016,slop:.025,
        label:PLANETS[level].name
      },Math.max(24,Math.ceil(r*1.5)));
      Object.assign(b,{planet:true,level,born:this.time,visualSeed:this.random()*10,special,freezeUntil:0,magnetUntil:0});
      Body.setAngle(b,angle);
      if(velocity) Body.setVelocity(b,velocity);
      Composite.add(this.engine.world,b); this.discovered.add(level); return b;
    }
    setAim(x) { const r=PLANETS[this.current].radius; this.aim=Math.max(r+3,Math.min(WIDTH-r-3,x)); }
    revive() {
      if(!this.ended||this.reviveCount>=1) return false;
      for(const b of this.balls) if(b.position.y-b.circleRadius<LIMIT+140) Composite.remove(this.engine.world,b);
      this.queue=[]; this.ended=false; this.paused=false; this.overflow=0; this.reviveCount++;
      this.readyAt=this.time+500;
      return true;
    }
    drop() {
      if(this.paused||this.ended||this.time<this.readyAt) return false;
      const ball=this.add(this.current,this.aim,SPAWN,{x:0,y:.8},0,this.currentSpecial);
      this.drops++; this.current=this.next; this.currentSpecial=this.nextSpecial; this.next=this.roll(); this.nextSpecial=this.rollSpecial(); this.setAim(this.aim); this.readyAt=this.time+440;
      this.onDrop(ball); return true;
    }
    resolveSpecial(a,b,type) {
      const source=type==='rainbow'?(a.special==='rainbow'?a:b):(a.special? a:b), target=source===a?b:a;
      if(type==='bomb') {
        const radius=86;for(const other of this.balls){if(Math.hypot(other.position.x-source.position.x,other.position.y-source.position.y)<radius)Composite.remove(this.engine.world,other);}
        this.onSpecial({type,x:source.position.x,y:source.position.y});return;
      }
      if(type==='freeze') {for(const other of this.balls)if(other!==source&&Math.hypot(other.position.x-source.position.x,other.position.y-source.position.y)<105)other.freezeUntil=this.time+1800;Composite.remove(this.engine.world,source);this.onSpecial({type,x:source.position.x,y:source.position.y});return;}
      if(type==='magnet') {source.magnetUntil=this.time+2600;this.onSpecial({type,x:source.position.x,y:source.position.y});return;}
      if(type==='split') {const level=Math.max(0,source.level-1);const x=source.position.x,y=source.position.y;Composite.remove(this.engine.world,source);this.add(level,x-10,y,{x:-1.5,y:-2});this.add(level,x+10,y,{x:1.5,y:-2});this.onSpecial({type,x,y});return;}
      if(type==='rainbow'&&target&&target.level<PLANETS.length-1) {
        const level=target.level+1,x=(source.position.x+target.position.x)/2,y=(source.position.y+target.position.y)/2;Composite.remove(this.engine.world,[source,target]);const c=this.add(level,x,y,{x:0,y:-2});this.combo=this.time-this.lastMerge<1400?this.combo+1:1;this.lastMerge=this.time;const points=PLANETS[level].score;this.score+=points;this.merges++;this.onMerge({x,y,level,points,combo:this.combo,special:type});
      }
    }
    step(dt=1000/120) {
      if(this.paused||this.ended) return;
      this.time+=dt;
      for(const b of this.balls){
        if(b.freezeUntil>this.time){Body.setVelocity(b,{x:0,y:0});Body.setAngularVelocity(b,0);}
        if(b.magnetUntil>this.time){for(const other of this.balls){if(other===b)continue;const dx=b.position.x-other.position.x,dy=b.position.y-other.position.y,d=Math.hypot(dx,dy);if(d>1&&d<150)Body.applyForce(other,other.position,{x:dx/d*0.000012,y:dy/d*0.000012});}}
      }
      Engine.update(this.engine,dt);
      const used=new Set();
      for(const [a,b] of this.queue) {
        if(used.has(a.id)||used.has(b.id)||this.time-a.born<130||this.time-b.born<130) continue;
        if(!Composite.get(this.engine.world,a.id,'body')||!Composite.get(this.engine.world,b.id,'body')) continue;
        used.add(a.id);used.add(b.id);
        const special=a.special||b.special;
        if(special){this.resolveSpecial(a,b,special);used.add(a.id);used.add(b.id);continue;}
        if(a.level!==b.level||a.level>=PLANETS.length-1)continue;
        const level=a.level+1, mass=a.mass+b.mass;
        const velocity={x:(a.velocity.x*a.mass+b.velocity.x*b.mass)/mass,y:(a.velocity.y*a.mass+b.velocity.y*b.mass)/mass};
        const x=(a.position.x*a.mass+b.position.x*b.mass)/mass, y=(a.position.y*a.mass+b.position.y*b.mass)/mass;
        const spin=(a.angularVelocity*a.mass+b.angularVelocity*b.mass)/mass;
        Composite.remove(this.engine.world,[a,b]);
        const c=this.add(level,x,y,velocity,(a.angle+b.angle)/2); Body.setAngularVelocity(c,spin);
        this.combo=this.time-this.lastMerge<1400?this.combo+1:1; this.lastMerge=this.time;
        const points=PLANETS[level].score; this.score+=points; this.merges++;
        this.onMerge({x:c.position.x,y:c.position.y,level,points,combo:this.combo});
        if(level===PLANETS.length-1&&!this.won) {this.won=true;this.onWin();}
      }
      this.queue=[];
      // Growing balls can briefly push a sleeping neighbor into a wall.
      // Keep the full circular artwork within the physical container as well.
      for(const b of this.balls) {
        if(b.isStatic) continue;
        const r=b.circleRadius, x=Math.max(r,Math.min(WIDTH-r,b.position.x)), y=Math.min(FLOOR-r,b.position.y);
        if(x!==b.position.x||y!==b.position.y) {
          const vx=x!==b.position.x?0:b.velocity.x, vy=y!==b.position.y?Math.min(0,b.velocity.y):b.velocity.y;
          Body.setPosition(b,{x,y}); Body.setVelocity(b,{x:vx,y:vy});
        }
      }
      if(this.mode==='timed') {this.timeLeft-=dt;if(this.timeLeft<=0){this.timeLeft=0;this.ended=true;this.onEnd(this.score);}}
      const overflow=this.mode!=='free'&&this.balls.some(b=>this.time-b.born>1100&&b.position.y-b.circleRadius<LIMIT&&b.speed<2);
      this.overflow=overflow?this.overflow+dt:0;
      if(this.mode!=='free'&&this.overflow>=2200) {this.ended=true;this.onEnd(this.score);}
    }
  }
  return {Game, PLANETS, SPECIALS, WIDTH, HEIGHT, FLOOR, LIMIT, SPAWN};
});
