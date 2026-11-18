// Outil de capture / interaction via Chrome DevTools Protocol.
// Usage :
//   node tools/shot.mjs <width> <height> <output.png> [scriptFile] [url]
// Exemple :
//   node tools/shot.mjs 390 844 mobile.png
//   node tools/shot.mjs 1440 900 assemblage.png tools/scripts/open-assemblage.js

import fs from 'node:fs';

const width = Number(process.argv[2] || 1440);
const height = Number(process.argv[3] || 900);
const output = process.argv[4] || 'shot.png';
const scriptFile = process.argv[5] || null;
const url = process.argv[6] || 'http://127.0.0.1:8000';

const list = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9222}/json/list`)).json();
const page = list.find(t => t.type === 'page');
if (!page) throw new Error('Aucune page CDP trouvée.');

const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
const logs = [];

ws.addEventListener('message', event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push(`EXCEPTION: ${d.exception?.description || d.text}`);
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map(a => a.value ?? a.description ?? '').join(' ');
    if (msg.params.type === 'error' || msg.params.type === 'warning') {
      logs.push(`CONSOLE ${msg.params.type}: ${text}`);
    }
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 1, mobile: width < 600
});
await send('Page.navigate', { url });
await new Promise(resolve => setTimeout(resolve, 5000));

if (scriptFile && fs.existsSync(scriptFile)) {
  const expression = `(async () => {\n${fs.readFileSync(scriptFile, 'utf8')}\n})()`;
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    logs.push(`SCRIPT EXCEPTION: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
  } else if (result.result?.value !== undefined) {
    console.log('SCRIPT RESULT:', JSON.stringify(result.result.value, null, 2));
  }
  await new Promise(resolve => setTimeout(resolve, 1200));
}

const metrics = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    dpr: window.devicePixelRatio,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    appWidth: document.getElementById('app')?.getBoundingClientRect().width,
    panelWidth: document.getElementById('panel')?.getBoundingClientRect().width,
    tabsWidth: document.getElementById('tabs')?.scrollWidth,
    tabsClient: document.getElementById('tabs')?.clientWidth,
    panelScrollWidth: document.getElementById('panelBody')?.scrollWidth,
    panelClient: document.getElementById('panelBody')?.clientWidth,
    canvas: (() => { const c = document.getElementById('threeCanvas'); return c ? {w:c.clientWidth,h:c.clientHeight} : null; })()
  })`,
  returnByValue: true
});
console.log('METRICS:', metrics.result.value);

const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
fs.writeFileSync(output, Buffer.from(shot.data, 'base64'));
console.log('WROTE', output);

if (logs.length) {
  console.log('\n--- LOGS ---');
  for (const line of logs) console.log(line);
} else {
  console.log('No console errors.');
}

ws.close();
process.exit(0);
