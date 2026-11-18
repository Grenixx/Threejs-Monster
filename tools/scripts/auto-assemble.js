document.querySelector('[data-tab="assemblage"]').click();
await new Promise(r => setTimeout(r, 250));
document.querySelector('[data-action="auto-assemble"]').click();
document.querySelector('[data-tab="labo"]').click();
