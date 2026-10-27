const { Engine, World, Bodies, Events } = Matter;
const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const scoreEl = document.querySelector('#score');
const overEl = document.querySelector('#game-over');
const W = 720, H = 760, dangerY = 150;
canvas.width = W; canvas.height = H;

const levels = [
  { r: 18, color: '#fb7185', glow: '#fb718566' }, { r: 25, color: '#fb923c', glow: '#fb923c66' },
  { r: 34, color: '#facc15', glow: '#facc1566' }, { r: 45, color: '#a3e635', glow: '#a3e63566' },
  { r: 59, color: '#34d399', glow: '#34d39966' }, { r: 76, color: '#22d3ee', glow: '#22d3ee66' },
  { r: 96, color: '#818cf8', glow: '#818cf866' }
];
const colorNames = ['莓果红', '活力橙', '阳光黄', '青柠绿', '薄荷绿', '天空蓝', '星空紫'];
const themes = {
  dragon: ['#f97316', '#fb923c', '#facc15', '#fde047', '#84cc16', '#22c55e', '#06b6d4'],
  court: ['#f97316', '#fb923c', '#facc15', '#a855f7', '#7c3aed', '#2563eb', '#111827'],
  candy: ['#fb7185', '#fb923c', '#facc15', '#f9a8d4', '#c084fc', '#a5b4fc', '#67e8f9'],
  space: ['#c084fc', '#818cf8', '#6366f1', '#38bdf8', '#22d3ee', '#0ea5e9', '#e0e7ff'],
  ocean: ['#fda4af', '#fdba74', '#fde68a', '#86efac', '#2dd4bf', '#22d3ee', '#60a5fa'],
  dino: ['#fb7185', '#fb923c', '#facc15', '#84cc16', '#22c55e', '#14b8a6', '#64748b'],
  campus: ['#fda4af', '#fdba74', '#fde047', '#86efac', '#67e8f9', '#93c5fd', '#c4b5fd'],
  festival: ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7']
};
const STORAGE_KEY = 'ballup-diy-preset-v1';
const custom = levels.map((_, i) => ({ image: '', audio: '', imageName: '', audioName: '' }));
const audioCache = new Map();
const ballNames = ['草莓球', '橘子球', '太阳球', '青柠球', '睡觉球', '机器人球', '彩虹球'];
const progressKey = 'ballup-progress-v1';
let progress = { discovered: [0], best: 0, totalMerges: 0, maxLevel: 0, tasks: {} };
try { progress = { ...progress, ...(JSON.parse(localStorage.getItem(progressKey) || '{}')) }; } catch (_) {}
let mode = 'classic', timeLeft = 60, combo = 0, lastMergeAt = 0, particles = [], runMerges = 0, audioContext;
const dailyTasks = [{ id: 'merge', label: '完成 5 次合成', goal: 5 }, { id: 'score', label: '本局达到 500 分', goal: 500 }, { id: 'discover', label: '解锁 1 个新球', goal: 1 }];
function saveProgress() { localStorage.setItem(progressKey, JSON.stringify(progress)); updateProgressUI(); }
function updateProgressUI() {
  const best = document.querySelector('#best-score'), discovered = document.querySelector('#discovered'), comboEl = document.querySelector('#combo');
  if (best) best.textContent = progress.best; if (discovered) discovered.textContent = `${progress.discovered.length}/7`; if (comboEl) comboEl.textContent = combo;
  const collection = document.querySelector('#collection'); if (collection) collection.innerHTML = ballNames.map((name, i) => `<div class="entry ${progress.discovered.includes(i) ? '' : 'locked'}"><div class="entry-orb" style="background:${levels[i].color}">${progress.discovered.includes(i) ? '' : '?'}</div><span>${progress.discovered.includes(i) ? name : '未解锁'}</span></div>`).join('');
  const tasks = document.querySelector('#tasks'); if (tasks) tasks.innerHTML = dailyTasks.map(t => { const value = progress.tasks[t.id] || 0, done = value >= t.goal; return `<div class="task ${done ? 'done' : ''}"><span class="task-check"></span><span>${t.label}</span><span class="task-count">${Math.min(value, t.goal)}/${t.goal}</span></div>`; }).join('');
}
function updateTask(id, value) { progress.tasks[id] = Math.max(progress.tasks[id] || 0, value); }
function addParticles(x, y, level) { const color = levels[level].color; for (let i = 0; i < 18; i++) { const angle = Math.random() * Math.PI * 2, speed = 1.5 + Math.random() * 4; particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color }); } }
function playMergeSound(level) { if (custom[level].audio) { playCustomSound(level); return; } try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); const o = audioContext.createOscillator(), g = audioContext.createGain(); o.type = 'sine'; o.frequency.value = 260 + level * 70; g.gain.setValueAtTime(.0001, audioContext.currentTime); g.gain.exponentialRampToValueAtTime(.16, audioContext.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .22); o.connect(g).connect(audioContext.destination); o.start(); o.stop(audioContext.currentTime + .24); } catch (_) {} }
function applyTheme(name) { if (!themes[name]) return; themes[name].forEach((color, i) => { levels[i].color = color; levels[i].glow = `${color}66`; }); renderCustomizer(); saveProgress(); setStatus('主题已切换 ✓'); }
function setStatus(message) { const el = document.querySelector('#save-status'); if (el) { el.textContent = message; clearTimeout(setStatus.timer); setStatus.timer = setTimeout(() => el.textContent = '设置会自动保存在本机', 2200); } }
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(custom)); setStatus('已自动保存 ✓'); }
function applySaved(data) { if (!Array.isArray(data)) return; data.slice(0, levels.length).forEach((item, i) => Object.assign(custom[i], item)); renderCustomizer(); }
function renderCustomizer() {
  const root = document.querySelector('#customizer'); if (!root) return; root.innerHTML = '';
  custom.forEach((item, i) => {
    const card = document.createElement('div'); card.className = 'custom-card';
    card.innerHTML = `<strong><span class="color-chip" style="background:${levels[i].color}"></span>等级 ${i + 1}</strong><span class="color-name">${colorNames[i]} · ${levels[i].color}</span><div class="preview" style="background-color:${levels[i].color};${item.image ? `background-image:url('${item.image}')` : ''}"></div><label>照片<input type="file" accept="image/*" data-image="${i}"></label><label>音效<input type="file" accept="audio/*" data-audio="${i}"></label>`;
    root.appendChild(card);
  });
  root.querySelectorAll('[data-image]').forEach(input => input.addEventListener('change', e => readFile(e.target.files[0], file => { const i = +e.target.dataset.image; custom[i].image = file.data; custom[i].imageName = file.name; persist(); renderCustomizer(); })));
  root.querySelectorAll('[data-audio]').forEach(input => input.addEventListener('change', e => readFile(e.target.files[0], file => { const i = +e.target.dataset.audio; custom[i].audio = file.data; custom[i].audioName = file.name; audioCache.delete(i); persist(); renderCustomizer(); })));
}
function readFile(file, done) { if (!file) return; const reader = new FileReader(); reader.onload = () => done({ data: reader.result, name: file.name }); reader.readAsDataURL(file); }
function playCustomSound(level) { if (!custom[level].audio) return; let audio = audioCache.get(level); if (!audio) { audio = new Audio(custom[level].audio); audio.volume = .6; audioCache.set(level, audio); } audio.currentTime = 0; audio.play().catch(() => {}); }
function setupCustomizer() {
  const dateEl = document.querySelector('#task-date'); if (dateEl) dateEl.textContent = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date());
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); if (saved) applySaved(saved); } catch (_) {}
  renderCustomizer();
  document.querySelector('#save-preset').onclick = () => { persist(); const blob = new Blob([JSON.stringify(custom)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ballup-preset.json'; a.click(); URL.revokeObjectURL(a.href); setStatus('预设已下载 ✓'); };
  document.querySelector('#preset-file').onchange = e => readFile(e.target.files[0], file => { try { applySaved(JSON.parse(atob(file.data.split(',')[1]))); persist(); setStatus('预设已加载 ✓'); } catch (_) { setStatus('预设文件无法读取'); } });
  document.querySelector('#reset-preset').onclick = () => { custom.forEach(x => Object.assign(x, { image: '', audio: '', imageName: '', audioName: '' })); persist(); renderCustomizer(); };
  document.querySelectorAll('[data-theme]').forEach(button => button.onclick = () => applyTheme(button.dataset.theme));
  const worldTheme = document.querySelector('#world-theme'); if (worldTheme) worldTheme.onchange = () => applyTheme(worldTheme.value);
  const share = document.querySelector('#share-result'); if (share) share.onclick = shareResult;
}
function finishResult() { const scoreNode = document.querySelector('#result-score'), levelNode = document.querySelector('#result-level'), comboNode = document.querySelector('#result-combo'); if (scoreNode) scoreNode.textContent = score; if (levelNode) levelNode.textContent = ballNames[progress.maxLevel] || ballNames[0]; if (comboNode) comboNode.textContent = combo; }
function shareResult() { const text = `我在《合成小球》${mode === 'timed' ? '60秒挑战' : ''}中拿到 ${score} 分，最高合成${ballNames[progress.maxLevel]}！`; if (navigator.share) navigator.share({ title: '我的球球战绩', text }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => setStatus('战绩已复制 ✓')); }
const engine = Engine.create({ gravity: { x: 0, y: 1.05 } });
engine.positionIterations = 8; engine.velocityIterations = 6; engine.constraintIterations = 4;
const world = engine.world;
let balls = [], current, score = 0, gameOver = false, dragging = false, last = performance.now();
let dangerSince = 0, mergeLock = false;
const walls = [
  Bodies.rectangle(W / 2, H + 18, W + 80, 36, { isStatic: true, label: 'wall' }),
  Bodies.rectangle(-18, H / 2, 36, H, { isStatic: true, label: 'wall' }),
  Bodies.rectangle(W + 18, H / 2, 36, H, { isStatic: true, label: 'wall' })
];
World.add(world, walls);

function reset() {
  balls.forEach(b => World.remove(world, b.body)); balls = []; score = 0; gameOver = false; dangerSince = 0; combo = 0; lastMergeAt = 0; particles = []; runMerges = 0; timeLeft = 60;
  scoreEl.textContent = score; overEl.classList.add('hidden'); current = preview(); updateProgressUI(); updateTimer();
}
function updateTimer() { const el = document.querySelector('#timer'); if (el) el.textContent = mode === 'timed' ? `${Math.ceil(timeLeft)}s` : '∞'; }
function setMode(next) { mode = next; document.querySelectorAll('.mode').forEach(button => button.classList.toggle('active', button.dataset.mode === mode)); reset(); }
function preview() { return { x: W / 2, y: 64, level: 0, r: levels[0].r }; }
function pointerX(e) { const rect = canvas.getBoundingClientRect(); return (e.clientX - rect.left) * W / rect.width; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function release() {
  if (!current || gameOver) return;
  const data = current; current = null; dragging = false;
  const body = Bodies.circle(data.x, 88, data.r, { restitution: 0.18, friction: 0.48, frictionStatic: 0.75, density: 0.0026, label: 'ball' });
  body.game = { level: data.level, born: performance.now() };
  balls.push({ body, level: data.level }); World.add(world, body);
  setTimeout(() => { if (!gameOver && !current) current = preview(); }, 450);
}
canvas.addEventListener('pointerdown', e => { if (!gameOver) { dragging = true; canvas.setPointerCapture(e.pointerId); current.x = clamp(pointerX(e), current.r, W - current.r); } });
canvas.addEventListener('pointermove', e => { if (dragging && current) current.x = clamp(pointerX(e), current.r, W - current.r); });
canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
document.querySelector('#restart').onclick = reset; document.querySelector('#restart-overlay').onclick = reset;
document.querySelectorAll('.mode').forEach(button => button.onclick = () => setMode(button.dataset.mode));

Events.on(engine, 'collisionStart', event => {
  if (mergeLock || gameOver) return;
  for (const pair of event.pairs) {
    const a = pair.bodyA, b = pair.bodyB;
    if (a.label !== 'ball' || b.label !== 'ball' || !a.game || !b.game || a.game.level !== b.game.level) continue;
    if (a.game.level >= levels.length - 1) continue;
    const foundA = balls.find(x => x.body === a), foundB = balls.find(x => x.body === b);
    if (!foundA || !foundB) continue;
    mergeLock = true;
    const level = a.game.level + 1, x = (a.position.x + b.position.x) / 2, y = (a.position.y + b.position.y) / 2;
    World.remove(world, a); World.remove(world, b); balls = balls.filter(x => x.body !== a && x.body !== b);
    const body = Bodies.circle(x, y, levels[level].r, { restitution: 0.18, friction: 0.48, frictionStatic: 0.75, density: 0.0026, label: 'ball' });
    body.game = { level, born: performance.now() }; balls.push({ body, level }); World.add(world, body);
    const now = performance.now(); combo = now - lastMergeAt < 1500 ? combo + 1 : 1; lastMergeAt = now; runMerges += 1;
    score += (level + 1) * 10 * Math.max(1, combo); scoreEl.textContent = score; progress.discovered = Array.from(new Set([...progress.discovered, level])); progress.maxLevel = Math.max(progress.maxLevel, level); progress.totalMerges += 1; progress.best = Math.max(progress.best, score); updateTask('merge', runMerges); updateTask('score', score); updateTask('discover', progress.discovered.length - 1); saveProgress(); addParticles(x, y, level); playMergeSound(level);
    setTimeout(() => { mergeLock = false; }, 40); break;
  }
});

function update(now) {
  const delta = Math.min(32, now - last); last = now; Engine.update(engine, delta);
  particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .12; p.life -= .035; }); particles = particles.filter(p => p.life > 0);
  if (now - lastMergeAt > 1500 && combo) { combo = 0; updateProgressUI(); }
  if (gameOver) return;
  if (mode === 'timed') { timeLeft -= delta / 1000; updateTimer(); if (timeLeft <= 0) { timeLeft = 0; gameOver = true; finishResult(); overEl.classList.remove('hidden'); } }
  if (mode !== 'free') { const stableAtLine = balls.some(({ body }) => body.position.y - body.circleRadius < dangerY && Math.abs(body.velocity.y) < 0.7 && Math.abs(body.velocity.x) < 0.7 && now - body.game.born > 900); if (stableAtLine) { if (!dangerSince) dangerSince = now; if (now - dangerSince > 850) { gameOver = true; finishResult(); overEl.classList.remove('hidden'); } } else dangerSince = 0; }
}
function drawBall(body, level, alpha = 1) {
  const spec = levels[level], { x, y } = body.position, r = spec.r;
  ctx.save(); ctx.globalAlpha = alpha; ctx.shadowColor = spec.glow; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  if (custom[level].image) { const image = new Image(); image.src = custom[level].image; image.onload = () => draw(); ctx.drawImage(image, x - r, y - r, r * 2, r * 2); }
  else { const gradient = ctx.createRadialGradient(x - r * .32, y - r * .38, 2, x, y, r); gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.17, spec.color); gradient.addColorStop(1, spec.color + 'c7'); ctx.fillStyle = gradient; ctx.fill(); }
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
}
function draw() {
  ctx.clearRect(0, 0, W, H); const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#18264c'); bg.addColorStop(1, '#10172e'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff08'; for (let x = 20; x < W; x += 40) for (let y = 20; y < H; y += 40) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
  const line = ctx.createLinearGradient(0, 0, W, 0); line.addColorStop(0, '#fb718500'); line.addColorStop(.2, '#fb7185'); line.addColorStop(.8, '#fb7185'); line.addColorStop(1, '#fb718500'); ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.setLineDash([7, 8]); ctx.beginPath(); ctx.moveTo(0, dangerY); ctx.lineTo(W, dangerY); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#fb7185'; ctx.font = '700 12px system-ui'; ctx.fillText('DANGER ZONE', 18, dangerY - 10);
  balls.forEach(({ body, level }) => drawBall(body, level));
  particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 3 + p.life * 3, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;
  if (combo > 1) { ctx.fillStyle = '#fde68a'; ctx.font = '900 24px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`${combo} COMBO!`, W / 2, 118); ctx.textAlign = 'left'; }
  if (current) { drawBall({ position: { x: current.x, y: current.y } }, current.level, .92); ctx.strokeStyle = '#ffffff33'; ctx.beginPath(); ctx.moveTo(current.x, 78); ctx.lineTo(current.x, current.y - current.r - 7); ctx.stroke(); }
}
function loop(now) { update(now); draw(); requestAnimationFrame(loop); }
setupCustomizer(); reset(); requestAnimationFrame(loop);
