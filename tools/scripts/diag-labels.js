const { ui, scene } = window.__CHIMERE__;
const layer = document.getElementById('actorLabels');
const labels = [...document.querySelectorAll('.actor-label')];
return {
  layer: layer ? { children: layer.children.length, html: layer.outerHTML.slice(0, 300) } : null,
  labels: labels.map(el => ({
    text: el.textContent,
    style: el.getAttribute('style'),
    rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
    opacity: getComputedStyle(el).opacity,
    display: getComputedStyle(el).display,
    z: getComputedStyle(el).zIndex
  })),
  mode: scene.isExpeditionMode(),
  actors: scene.getGroup ? 'idle' : 'expedition'
};
