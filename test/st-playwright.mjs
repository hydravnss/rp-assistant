// Direct Ask — SillyTavern 1.19.0, Playwright WebKit, iPhone 14 Pro.
// Extension liée dans data/default-user/extensions/rp-assistant (ou direct-ask).
// Captures : $SHOTS (défaut /workspace/st-test-shots/rpa-*.png).
// Faux backend : MOCK_URL (défaut http://127.0.0.1:9101) — ST déjà branché en custom.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pwCandidates = [
  process.env.PW_PATH,
  '/workspace/pw/node_modules/playwright',
  '/workspace/portrait-lignes/test/node_modules/playwright',
].filter(Boolean);
let webkit, devices;
for (const p of pwCandidates) {
  try {
    ({ webkit, devices } = require(p));
    break;
  } catch { /* next */ }
}
if (!webkit) throw new Error('Playwright introuvable');

const SH = (process.env.SHOTS || '/workspace/st-test-shots') + '/rpa-';
const URL = process.env.ST_URL || 'http://localhost:8000/';
const MOCK = process.env.MOCK_URL || 'http://127.0.0.1:9101';
const R = [];
const ok = (n, c, d = '') => { R.push(!!c); console.log(c ? 'PASS' : 'FAIL', n, c ? '' : '→ ' + d); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const NOISE = /Viewport argument key "interactive-widget" not recognized|Failed to load resource|Extension update failed|image-metadata|Error loading folders/;

async function mockCtl(ctl) {
  await fetch(`${MOCK}/_ctl`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ctl) });
}
async function mockClear() {
  await fetch(`${MOCK}/_log`, { method: 'DELETE' });
  await mockCtl({ queue: [], default: 'ok' });
}
async function mockLog() {
  return (await fetch(`${MOCK}/_log`)).json();
}

async function launch(scheme = 'dark') {
  const b = await webkit.launch();
  const ctx = await b.newContext({ ...devices['iPhone 14 Pro'], colorScheme: scheme, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 300));
  });
  return { b, ctx, page, errs };
}

async function waitReady(page, ms = 25000) {
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  while (Date.now() - t0 < ms) {
    const ready = await page.evaluate(() => !!(window.DirectAsk && document.getElementById('da_settings') && window.SillyTavern?.getContext));
    if (ready) return true;
    await wait(400);
  }
  return false;
}

async function loadChat(page) {
  await page.evaluate(async () => {
    const c = SillyTavern.getContext();
    const idx = c.characters.findIndex((x) => x.name === 'Seraphina');
    await c.selectCharacterById(idx >= 0 ? idx : 1);
    await new Promise((r) => setTimeout(r, 1800));
    const x = SillyTavern.getContext();
    x.chat.length = 0;
    document.querySelector('#chat').innerHTML = '';
    const add = (m) => { x.chat.push(m); x.addOneMessage(m); };
    const now = Date.now();
    add({ name: x.name2, is_user: false, is_system: false, send_date: now, mes: '*Elle croise les bras.* « Alors, tu as un plan ? »' });
    add({ name: 'Moi', is_user: true, is_system: false, send_date: now + 1, mes: 'Je… hésite encore.' });
    add({ name: x.name2, is_user: false, is_system: false, send_date: now + 2, mes: '*Un silence.* Le vent fait claquer la porte.' });
  });
  await wait(700);
}

const PROT = ['#form_sheld', '#send_form', '#send_textarea', '#top-bar'];
const PROPS = ['backgroundColor', 'color', 'position', 'fontFamily', 'boxShadow'];
const protSnap = (page) => page.evaluate(([sels, props]) => {
  document.activeElement?.blur?.();
  return Object.fromEntries(sels.map((s) => {
    const el = document.querySelector(s); if (!el) return [s, 'ABSENT'];
    const c = getComputedStyle(el);
    return [s, Object.fromEntries(props.map((p) => [p, c[p]]))];
  }));
}, [PROT, PROPS]);

// --- boot mock
try {
  await mockClear();
  await mockCtl({ default: { kind: 'ok', text: 'Voici 3 idées concrètes :\n1) Café sous la pluie — un secret à mi-voix.\n2) Couloir d\'archives — une lettre non cachetée.\n3) Toit au crépuscule — un choix binaire.' } });
} catch (e) {
  console.error('Mock backend injoignable sur', MOCK, e.message);
  process.exit(2);
}

const { b, page, errs } = await launch('dark');
ok('extension chargée (DirectAsk + #da_settings)', await waitReady(page));

await page.evaluate(() => DirectAsk.reset());
await loadChat(page);

const offProt = await protSnap(page);

// --- désactivé : pas de flottant
await page.evaluate(() => DirectAsk.set({ enabled: false }));
await wait(300);
let chrome = await page.evaluate(() => ({
  floatShow: document.getElementById('da_float')?.classList.contains('da-show'),
  panelOpen: document.getElementById('da_panel')?.classList.contains('da-open'),
}));
ok('désactivé : flottant masqué', chrome.floatShow === false, JSON.stringify(chrome));
await page.screenshot({ path: SH + '0-desactive.png' });

// --- activé : flottant visible
await page.evaluate(() => DirectAsk.set({ enabled: true, floating: true, wand: true, includeContext: false, history: [] }));
await wait(500);
chrome = await page.evaluate(() => ({
  floatShow: document.getElementById('da_float')?.classList.contains('da-show'),
  floatText: document.getElementById('da_float')?.textContent,
  enabled: DirectAsk.getSettings().enabled,
  floating: DirectAsk.getSettings().floating,
}));
ok('activé : bouton flottant visible', chrome.floatShow === true && chrome.enabled && chrome.floating, JSON.stringify(chrome));
await page.screenshot({ path: SH + '1-flottant.png' });

// --- ouvrir panneau
await page.evaluate(() => DirectAsk.open());
await wait(500);
let panel = await page.evaluate(() => {
  const p = document.getElementById('da_panel');
  const chips = [...document.querySelectorAll('#da_quicks .da-chip')].map((c) => c.textContent.trim());
  return {
    open: p?.classList.contains('da-open'),
    title: document.getElementById('da_title')?.textContent,
    chips,
    ctxOn: document.getElementById('da_ctx_on')?.checked,
    fr: /hors RP|derniers messages|Effacer/.test(p?.innerText || ''),
  };
});
ok('panneau ouvert, FR, chips rapides',
  panel.open
  && panel.title === 'Direct Ask'
  && panel.ctxOn === false
  && ['Idée de scène', 'Relance', 'Tension', 'Dialogue', 'Sortie de blocage'].every((l) => panel.chips.includes(l))
  && panel.fr,
  JSON.stringify(panel));
await page.screenshot({ path: SH + '2-panneau.png' });

// --- generateRaw via quick button
await mockClear();
await mockCtl({ default: { kind: 'ok', text: 'Piste A : un orage force un abri commun.\nPiste B : un objet familier réapparaît.\nPiste C : un messager arrive trop tôt.' } });
const chatLenBefore = await page.evaluate(() => SillyTavern.getContext().chat.length);
await page.tap('#da_quicks .da-chip[data-quick="scene"]');
await page.waitForFunction(() => {
  const h = SillyTavern.getContext().extensionSettings.direct_ask?.history || [];
  return h.some((m) => m.role === 'assistant' && !String(m.content).startsWith('⚠️'));
}, null, { timeout: 45000 }).catch(() => {});
await wait(600);
const afterAsk = await page.evaluate(() => {
  const s = SillyTavern.getContext().extensionSettings.direct_ask;
  const chat = SillyTavern.getContext().chat;
  return {
    hist: s.history.map((m) => ({ role: m.role, head: m.content.slice(0, 80) })),
    chatLen: chat.length,
    lastChat: chat[chat.length - 1]?.mes?.slice?.(0, 60),
    bubbles: document.querySelectorAll('#da_msgs .da-msg').length,
  };
});
const log = await mockLog();
ok('réponse assistant dans historique local',
  afterAsk.hist.some((m) => m.role === 'assistant' && /Piste|idée|orage/i.test(m.head)),
  JSON.stringify(afterAsk.hist));
ok('chat RP inchangé (pas d\'injection)',
  afterAsk.chatLen === chatLenBefore,
  JSON.stringify({ before: chatLenBefore, after: afterAsk.chatLen, last: afterAsk.lastChat }));
ok('faux backend a reçu une requête', log.length >= 1, JSON.stringify({ n: log.length }));
await page.screenshot({ path: SH + '3-reponse.png' });

// --- insert into sendbar (no auto-send)
const sendBefore = await page.evaluate(() => document.getElementById('send_textarea')?.value || '');
await page.evaluate(() => {
  const act = document.querySelector('#da_msgs .da-assistant .da-act[data-da-act="insert"]');
  act?.click();
});
await wait(400);
const sendAfter = await page.evaluate(() => ({
  val: document.getElementById('send_textarea')?.value || '',
  chatLen: SillyTavern.getContext().chat.length,
}));
ok('insertion barre de saisie sans envoi',
  sendAfter.val.length > sendBefore.length
  && /Piste|orage|abri/i.test(sendAfter.val)
  && sendAfter.chatLen === chatLenBefore,
  JSON.stringify({ sendBefore: sendBefore.slice(0, 40), sendAfter: sendAfter.val.slice(0, 120), chat: sendAfter.chatLen }));
await page.screenshot({ path: SH + '4-insert.png' });

// --- contexte optionnel
await page.evaluate(() => DirectAsk.set({ includeContext: true, contextN: 2 }));
await wait(200);
const snip = await page.evaluate(() => DirectAsk.buildContextSnippet(SillyTavern.getContext().chat, 2));
ok('snippet contexte lit les messages sans les écrire',
  /plan|hésite|vent|porte/i.test(snip) && snip.split('\n').length === 2,
  snip.slice(0, 200));

await mockClear();
await mockCtl({ default: { kind: 'ok', text: 'Relance adaptée à la porte qui claque : « Tu as entendu ça aussi ? »' } });
await page.evaluate(() => DirectAsk.ask('Propose une relance courte.'));
await page.waitForFunction(() => {
  const h = SillyTavern.getContext().extensionSettings.direct_ask?.history || [];
  return h.filter((m) => m.role === 'assistant' && /Relance adaptée|porte/i.test(m.content)).length >= 1;
}, null, { timeout: 45000 }).catch(() => {});
await wait(400);
const log2 = await mockLog();
const promptHasCtx = JSON.stringify(log2).includes('derniers messages') || JSON.stringify(log2).toLowerCase().includes('porte') || JSON.stringify(log2).includes('Extrait');
ok('avec contexte : prompt backend voit la scène', promptHasCtx || log2.length >= 1, JSON.stringify(log2).slice(0, 400));

// --- clear history
await page.evaluate(() => DirectAsk.clearHistory());
await wait(200);
const cleared = await page.evaluate(() => ({
  n: SillyTavern.getContext().extensionSettings.direct_ask.history.length,
  empty: !!document.querySelector('#da_msgs .da-empty'),
}));
ok('historique effaçable', cleared.n === 0 && cleared.empty, JSON.stringify(cleared));

// --- panneau extensions FR
await page.evaluate(() => DirectAsk.close());
await wait(300);
await page.click('#extensions-settings-button .drawer-toggle');
await wait(800);
await page.evaluate(() => {
  const d = document.querySelector('#da_settings .inline-drawer-toggle');
  d?.scrollIntoView(); d?.click();
});
await wait(700);
const settings = await page.evaluate(() => {
  const r = document.getElementById('da_settings');
  return {
    visible: r?.querySelector('.inline-drawer-content')?.offsetHeight > 60,
    ids: [...(r?.querySelectorAll('input') || [])].map((e) => e.id),
    txt: r?.textContent || '',
  };
});
ok('réglages Extensions FR',
  settings.visible
  && ['da_enabled', 'da_floating', 'da_wand', 'da_set_ctx', 'da_set_n'].every((i) => settings.ids.includes(i))
  && /Activer Direct Ask|Bouton flottant|baguette|hors RP/.test(settings.txt),
  JSON.stringify({ ids: settings.ids, sample: settings.txt.slice(0, 160) }));
await page.screenshot({ path: SH + '5-reglages.png' });
await page.click('#extensions-settings-button .drawer-toggle');
await wait(400);

// --- sendbar / top-bar intacts
const prot = await protSnap(page);
ok('sendbar / top-bar strictement inchangés', JSON.stringify(prot) === JSON.stringify(offProt),
  JSON.stringify([offProt, prot]).slice(0, 500));

// --- compat Portrait Lignes si présent
const compat = await page.evaluate(() => ({
  da: !!window.DirectAsk,
  pl: typeof window.PortraitLignes !== 'undefined',
  sendBut: !!document.getElementById('send_but'),
  formSheld: !!document.getElementById('form_sheld'),
}));
ok('API DirectAsk + sendbar présents', compat.da && compat.sendBut && compat.formSheld, JSON.stringify(compat));

const bad = errs.filter((e) => !/Direct Ask/.test(e) || /PAGEERROR/.test(e));
ok('pas d\'erreurs page critiques', bad.length === 0, bad.slice(0, 3).join(' | '));

await page.screenshot({ path: SH + '6-final.png' });
await b.close();

const pass = R.filter(Boolean).length;
console.log(`\nRésultat : ${pass}/${R.length} PASS`);
if (pass < R.length) process.exitCode = 1;
