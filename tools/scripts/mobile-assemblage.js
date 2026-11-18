document.querySelector('[data-tab="assemblage"]').click();
await new Promise(r => setTimeout(r, 300));
document.querySelector('.part-row[data-uid]')?.click();
