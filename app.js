const DEV = 'https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/';
const TOOLS = [
  ['React', 'react/react-original.svg'],
  ['React Native', 'react/react-original.svg'],
  ['Angular', 'angular/angular-original.svg'],
  ['TypeScript', 'typescript/typescript-original.svg'],
  ['Spring Boot', 'spring/spring-original.svg'],
  ['Java', 'java/java-original.svg'],
  ['Laravel', 'laravel/laravel-original.svg'],
  ['PHP', 'php/php-original.svg'],
  ['PostgreSQL', 'postgresql/postgresql-original.svg'],
  ['MySQL', 'mysql/mysql-original.svg'],
  ['Firebase', 'firebase/firebase-original.svg'],
  ['Neo4j', 'neo4j/neo4j-original.svg'],
  ['Docker', 'docker/docker-original.svg'],
  ['AWS', 'amazonwebservices/amazonwebservices-plain-wordmark.svg', true],
  ['Git', 'git/git-original.svg'],
  ['Arduino', 'arduino/arduino-original.svg'],
  ['Blender', 'blender/blender-original.svg'],
  ['Photoshop', 'photoshop/photoshop-original.svg'],
];

const PROJECTS = [
  { t: 'Bhookle', f: 'product', k: '100K+ Installs', g: ['#ff8a3d', '#b91c1c'], m: 'BH', tags: ['React Native', 'Angular', 'PostgreSQL', 'iOS + Android'], d: 'Home-cooked food delivery across Bengaluru & Chennai — customer, chef and admin apps, web panel and backend that I build and run.', u: 'https://play.google.com/store/apps/details?id=com.id.Bhookle' },
  { t: 'AgaKural', f: 'product', k: 'SaaS', g: ['#25d366', '#075e54'], m: 'AK', tags: ['Node', 'PostgreSQL', 'WhatsApp API'], d: 'WhatsApp API for Indian businesses with Ban Shield warm-up, signed webhooks, number failover and a web console.', u: 'https://agakural.online/' },
  { t: 'Suvai Pazhagu', f: 'product', k: 'Android App', g: ['#ff8a3d', '#c2410c'], m: 'SP', tags: ['React Native', 'Porter API', 'PhonePe'], d: "India's first dedicated Android app for a brand's own home food — multi-location kitchens with Porter delivery." },
  { t: 'Paviksha Collections', f: 'web', k: 'E-commerce', g: ['#f472b6', '#9d174d'], m: 'P', tags: ['E-commerce', 'Firebase'], d: 'Online storefront for a saree & fashion brand with product catalogue and ordering.', u: 'https://pavikshacollections.com/' },
  { t: 'Blu FLM & PMS', f: 'enterprise', k: 'Singapore', g: ['#3b82f6', '#1e3a8a'], m: 'blu', tags: ['Angular', 'Spring Boot', 'AWS'], d: "Fleet, logistics & parcel management integrated with Singapore's government IO-locker network." },
  { t: 'Bridgestone Supply Tracker', f: 'enterprise', k: 'Vietnam', g: ['#64748b', '#111827'], m: 'BS', tags: ['Angular', 'Laravel', 'MySQL'], d: 'Tracks factories, suppliers and the flow of parts for a global tyre manufacturer.' },
  { t: 'NexG Fleet PaaS', f: 'enterprise', k: 'Singapore', g: ['#a855f7', '#4c1d95'], m: 'NX', tags: ['Laravel', 'Stripe', 'Maps'], d: 'Cloud fleet-management software customised as a PaaS for individual service providers.' },
  { t: 'Viagoo Logistics', f: 'enterprise', k: 'Singapore', g: ['#06b6d4', '#155e75'], m: 'V', tags: ['Laravel', 'Google Maps'], d: 'Web platform connecting carriers and customers for on-demand logistics.' },
  { t: 'Client Websites', f: 'web', k: '6+ Brands', g: ['#f59e0b', '#7c2d12'], m: 'www', tags: ['Red Heera', 'Paviksha', 'Cross Crafts'], d: 'Brand sites for Red Heera Fashion, Paviksha Collections, Minds of Aspirants, Cross Crafts and more.', u: 'https://www.redheerafashion.com/' },
  { t: 'ngMatSelectFilter', f: 'rnd', k: 'Open Source', g: ['#ef4444', '#7f1d1d'], m: 'ng', tags: ['Angular Material', 'npm'], d: 'Multi-select with filter and clear button for Angular Material.', u: 'https://github.com/ramnath1997/ngMatSelectFilter' },
  { t: 'CB Language', f: 'rnd', k: '1st Prize', g: ['#eab308', '#713f12'], m: 'CB', tags: ['Python', 'Compilers'], d: 'A programming language built on binary-tree structures — won a 24-hour hackathon.' },
  { t: 'Smart Irrigation', f: 'rnd', k: '1st Prize', g: ['#10b981', '#064e3b'], m: 'IoT', tags: ['Arduino', 'Embedded C'], d: 'Moisture-sensing Arduino system that automates plant irrigation. Inter-college winner.' },
];

const ext = '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

document.getElementById('tools').innerHTML = TOOLS.map(([n, p, inv]) =>
  `<div class="tool rv"><img src="${DEV}${p}" alt="" loading="lazy" ${inv ? 'class="inv"' : ''} onerror="this.outerHTML='<i class=fb>${n.slice(0, 2)}</i>'"><span>${n}</span></div>`
).join('') + '<div class="tool rv"><i class="fb">+</i><span>and more…</span></div>';

document.getElementById('projectGrid').innerHTML = PROJECTS.map(p => `
  <article class="proj rv" data-f="${p.f}">
    <div class="thumb" style="background:linear-gradient(135deg,${p.g[0]},${p.g[1]})"><b>${p.m}</b><small>${p.k}</small></div>
    <div class="in">
      <h4>${p.u ? `<a href="${p.u}" target="_blank" rel="noopener">${p.t}</a> ${ext}` : p.t}</h4>
      <div class="tags">${p.tags.map(t => `<span>${t}</span>`).join('')}</div>
      <p>${p.d}</p>
    </div>
  </article>`).join('');

document.querySelectorAll('.filters button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.filters button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.proj').forEach(p => p.classList.toggle('hide', b.dataset.f !== 'all' && p.dataset.f !== b.dataset.f));
}));

document.querySelectorAll('.sec:not(.hero) .col > *, .sec:not(.hero) .script, .cards4 .card, .cards3 .card, .steps li, .timeline li, .ct').forEach(el => el.classList.add('rv'));
let pending = [...document.querySelectorAll('.rv')];
pending.forEach((el, i) => el.style.transitionDelay = `${(i % 6) * 60}ms`);
const reveal = () => {
  const lim = innerHeight * .92;
  pending = pending.filter(el => {
    const r = el.getBoundingClientRect();
    if (r.top < lim && r.bottom > 0) { el.classList.add('in'); return false; }
    return true;
  });
};
reveal();

const counters = document.querySelectorAll('[data-count]');
const runCount = () => counters.forEach(el => {
  const to = +el.dataset.count, t0 = performance.now();
  const tick = t => { const k = Math.min((t - t0) / 1400, 1); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
setTimeout(runCount, 500);

const nav = document.querySelector('.nav');
const sections = [...document.querySelectorAll('main .sec')];
const navLinks = [...document.querySelectorAll('.links a, .menu nav a')];
const onScroll = () => {
  reveal();
  nav.classList.toggle('scrolled', scrollY > 30);
  const mid = scrollY + innerHeight * .45;
  const cur = sections.findLast(s => s.offsetTop <= mid) || sections[0];
  navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + cur.id));
  document.body.classList.toggle('v-r', cur.classList.contains('side-r'));
  document.body.classList.toggle('v-c', cur.classList.contains('side-c'));
};
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
document.querySelectorAll('.filters button').forEach(b => b.addEventListener('click', () => requestAnimationFrame(reveal)));
onScroll();

const burger = document.querySelector('.burger');
const setMenu = open => {
  document.body.classList.toggle('menu-open', open);
  burger.setAttribute('aria-expanded', open);
  document.querySelector('.menu').setAttribute('aria-hidden', !open);
};
burger.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
document.querySelectorAll('.menu a').forEach(a => a.addEventListener('click', () => setMenu(false)));
