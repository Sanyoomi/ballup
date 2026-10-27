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
const STORAGE_KEY = 'ballup-diy-preset-v1';
const custom = levels.map((_, i) => ({ image: '', audio: '', imageName: '', audioName: '' }));
const audioCache = new Map();
function setStatus(message) { const el = document.querySelector('#save-status'); if (el) { el.textContent = message; clearTimeout(setStatus.timer); setStatus.timer = setTimeout(() => el.textContent = '设置会自动保存在本机', 2200); } }
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(custom)); setStatus('已自动保存 ✓'); }
function applySaved(data) { if (!Array.isArray(data)) return; data.slice(0, levels.length).forEach((item, i) => Object.assign(custom[i], item)); renderCustomizer(); }
function renderCustomizer() {
  const root = document.querySelector('#customizer'); if (!root) return; root.innerHTML = '';
  custom.forEach((item, i) => {
    const card = document.createElement('div'); card.className = 'custom-card';
    card.innerHTML = `<strong>等级 ${i + 1}</strong><div class="preview" style="background-color:${levels[i].color};${item.image ? `background-image:url('${item.image}')` : ''}"></div><label>照片<input type="file" accept="image/*" data-image="${i}"></label><label>音效<input type="file" accept="audio/*" data-audio="${i}"></label>`;
    root.appendChild(card);
  });
  root.querySelectorAll('[data-image]').forEach(input => input.addEventListener('change', e => readFile(e.target.files[0], file => { const i = +e.target.dataset.image; custom[i].image = file.data; custom[i].imageName = file.name; persist(); renderCustomizer(); })));
  root.querySelectorAll('[data-audio]').forEach(input => input.addEventListener('change', e => readFile(e.target.files[0], file => { const i = +e.target.dataset.audio; custom[i].audio = file.data; custom[i].audioName = file.name; audioCache.delete(i); persist(); renderCustomizer(); })));
}
function readFile(file, done) { if (!file) return; const reader = new FileReader(); reader.onload = () => done({ data: reader.result, name: file.name }); reader.readAsDataURL(file); }
function playCustomSound(level) { if (!custom[level].audio) return; let audio = audioCache.get(level); if (!audio) { audio = new Audio(custom[level].audio); audio.volume = .6; audioCache.set(level, audio); } audio.currentTime = 0; audio.play().catch(() => {}); }
function setupCustomizer() {
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); if (saved) applySaved(saved); } catch (_) {}
  renderCustomizer();
  document.querySelector('#save-preset').onclick = () => { persist(); const blob = new Blob([JSON.stringify(custom)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ballup-preset.json'; a.click(); URL.revokeObjectURL(a.href); setStatus('预设已下载 ✓'); };
  document.querySelector('#load-preset').onclick = () => document.querySelector('#preset-file').click();
  document.querySelector('#preset-file').onchange = e => readFile(e.target.files[0], file => { try { applySaved(JSON.parse(atob(file.data.split(',')[1]))); persist(); setStatus('预设已加载 ✓'); } catch (_) { setStatus('预设文件无法读取'); } });
  document.querySelector('#reset-preset').onclick = () => { custom.forEach(x => Object.assign(x, { image: '', audio: '', imageName: '', audioName: '' })); persist(); renderCustomizer(); };
}
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
  balls.forEach(b => World.remove(world, b.body)); balls = []; score = 0; gameOver = false; dangerSince = 0;
  scoreEl.textContent = score; overEl.classList.add('hidden'); current = preview();
}
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
    score += (level + 1) * 10; scoreEl.textContent = score; playCustomSound(level);
    setTimeout(() => { mergeLock = false; }, 40); break;
  }
});

function update(now) {
  const delta = Math.min(32, now - last); last = now; Engine.update(engine, delta);
  if (gameOver) return;
  const stableAtLine = balls.some(({ body }) => body.position.y - body.circleRadius < dangerY && Math.abs(body.velocity.y) < 0.7 && Math.abs(body.velocity.x) < 0.7 && now - body.game.born > 900);
  if (stableAtLine) { if (!dangerSince) dangerSince = now; if (now - dangerSince > 850) { gameOver = true; overEl.classList.remove('hidden'); } } else dangerSince = 0;
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
  if (current) { drawBall({ position: { x: current.x, y: current.y } }, current.level, .92); ctx.strokeStyle = '#ffffff33'; ctx.beginPath(); ctx.moveTo(current.x, 78); ctx.lineTo(current.x, current.y - current.r - 7); ctx.stroke(); }
}
function loop(now) { update(now); draw(); requestAnimationFrame(loop); }
setupCustomizer(); reset(); requestAnimationFrame(loop);
