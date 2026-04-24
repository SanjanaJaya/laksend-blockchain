/* ================================================================
   LAKSEND UI Enhancement Patch v3 — visual extras only
   Balance/portfolio/transaction rendering is now in script.js
================================================================ */

/* ── Premium notification override ── */
window.showNotification = function(type, title, message) {
  const container = document.getElementById('notification-container');
  if (!container) return;
  const icons = { success:'✅', error:'❌', info:'💡', warning:'⚠️' };
  const notif = document.createElement('div');
  notif.className = 'notification ' + type;
  notif.innerHTML =
    '<div class="notification-icon">' + (icons[type]||'•') + '</div>' +
    '<div class="notification-content">' +
      '<div class="notification-title">' + title + '</div>' +
      '<div class="notification-message">' + message + '</div>' +
    '</div>' +
    '<button class="notification-close" onclick="this.closest(\'.notification\').remove()">×</button>';
  container.appendChild(notif);
  if (!document.getElementById('notif-fade-style')) {
    const s = document.createElement('style');
    s.id = 'notif-fade-style';
    s.textContent = '@keyframes notifOut{to{opacity:0;transform:translateX(30px) scale(0.95);}}';
    document.head.appendChild(s);
  }
  setTimeout(() => {
    notif.style.animation = 'notifOut 0.35s ease forwards';
    setTimeout(() => notif.remove(), 380);
  }, 4500);
};

/* ── Wallet address mirror ── */
(function() {
  const source  = document.getElementById('wallet-address');
  const mobile  = document.getElementById('mobile-wallet-address');
  const sidebar = document.getElementById('sidebar-wallet-address');
  if (!source) return;
  const sync = () => {
    const v = source.textContent;
    if (mobile)  mobile.textContent  = v;
    if (sidebar) sidebar.textContent = v;
  };
  sync();
  new MutationObserver(sync).observe(source, { childList:true, characterData:true, subtree:true });
})();

/* ── Ripple on buttons ── */
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.primary-btn,.hero-action-btn');
  if (!btn) return;
  const ripple = document.createElement('span');
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  ripple.style.cssText =
    'position:absolute;width:'+size+'px;height:'+size+'px;' +
    'left:'+(e.clientX-rect.left-size/2)+'px;top:'+(e.clientY-rect.top-size/2)+'px;' +
    'background:rgba(255,255,255,0.12);border-radius:50%;pointer-events:none;' +
    'transform:scale(0);animation:rippleAnim 0.5s ease-out forwards;';
  if (!document.getElementById('ripple-style')) {
    const s = document.createElement('style'); s.id='ripple-style';
    s.textContent = '@keyframes rippleAnim{to{transform:scale(1);opacity:0;}}';
    document.head.appendChild(s);
  }
  if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
  btn.style.overflow = 'hidden';
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

/* ── Nav haptic scale ── */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('touchstart', function(){ this.style.transform='scale(0.92)'; }, {passive:true});
  item.addEventListener('touchend',   function(){ this.style.transform=''; },            {passive:true});
});

/* ── Auth screen particle system ── */
(function() {
  const canvas = document.getElementById('auth-particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];
  const resize = () => { W = canvas.width = canvas.offsetWidth; H = canvas.height = canvas.offsetHeight; };
  const mkP = () => ({
    x: Math.random()*W, y: Math.random()*H,
    r: Math.random()*1.8+0.3,
    vx: (Math.random()-0.5)*0.3, vy: -Math.random()*0.4-0.1,
    alpha: Math.random()*0.5+0.1, gold: Math.random()>0.5
  });
  const animate = () => {
    ctx.clearRect(0,0,W,H);
    particles.forEach((p,i) => {
      p.x += p.vx; p.y += p.vy;
      if (p.y<-10 || p.x<-10 || p.x>W+10) { particles[i]=mkP(); particles[i].y=H+5; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = p.gold
        ? 'rgba(212,168,50,'+p.alpha+')'
        : 'rgba(77,159,255,'+(p.alpha*0.5)+')';
      ctx.fill();
    });
    requestAnimationFrame(animate);
  };
  window.addEventListener('resize', resize);
  resize(); particles = Array.from({length:80}, mkP); animate();
})();

/* ── PWA Service Worker ── */
if ('serviceWorker' in navigator)
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));

/* ── Theme toggle ── */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('laksend-theme', theme);
  const btn = document.getElementById('theme-toggle-btn');
  const lbl = document.getElementById('theme-label');
  if (btn) btn.classList.toggle('active', theme === 'light');
  if (lbl) lbl.textContent = theme === 'light' ? 'Light mode' : 'Dark mode';
}

window.toggleTheme = function() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
};

// Apply saved theme on load
(function() {
  const saved = localStorage.getItem('laksend-theme') || 'dark';
  applyTheme(saved);
})();