document.querySelector('[data-tab="assemblage"]').click();
await new Promise(r => setTimeout(r, 250));
document.querySelector('.part-row[data-uid]').click();
