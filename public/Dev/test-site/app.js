const timeEl = document.getElementById('time');
const btn = document.getElementById('btn');
let clicks = 0;

function tick() {
  timeEl.textContent = new Date().toLocaleTimeString('es-MX');
  requestAnimationFrame(tick);
}
tick();

btn.addEventListener('click', () => {
  clicks++;
  btn.textContent = `Clicks: ${clicks}`;
});
