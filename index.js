/**
 * Direct Ask — extension SillyTavern (v1.0.0) — hydravnss
 *
 * Assistant HORS RP : idées de scènes, relances, conseils, résumé, suggestions.
 * Panneau chat dédié. N'écrit JAMAIS dans l'historique du personnage / chat RP.
 * Utilise generateRaw (modèle déjà configuré dans ST).
 *
 * Ne touche PAS #form_sheld / #send_form / #send_but / Portrait Lignes / stickers
 * (sauf insertion volontaire dans #send_textarea, sans envoi auto).
 *
 * Réglages : extension_settings.direct_ask
 */

const KEY = 'direct_ask';
const LOG = '[Direct Ask]';
const PANEL_ID = 'da_panel';
const FLOAT_ID = 'da_float';
const WAND_ID = 'da_wand_button';
const STYLE_GUARD = 'da-no-sendbar-touch';

const DEFAULT_SYSTEM = `Tu es un assistant de jeu de rôle (hors personnage / OOC) qui parle français.
Tu aides le joueur à préparer ou relancer une scène : idées concrètes, relances, tension, dialogues possibles, sorties de blocage, résumés.
Règles :
- Sois créatif, concret et actionnable (listes courtes, options chiffrées quand utile).
- Ne force pas de spoilers majeurs ; propose des pistes ouvertes.
- Ne parle JAMAIS à la place du personnage dans le chat RP : tu réponds uniquement ici, à l'utilisateur.
- Reste concis (sauf si on te demande un développement). Pas de méta technique SillyTavern.`;

const QUICK = Object.freeze([
    { id: 'scene', label: 'Idée de scène', prompt: 'Propose 3 idées de scènes concrètes et jouables (lieu, enjeu, amorce). Varie le ton.' },
    { id: 'relance', label: 'Relance', prompt: 'Propose 3 relances courtes que je pourrais écrire pour faire avancer la scène sans forcer le PNJ.' },
    { id: 'tension', label: 'Tension', prompt: 'Suggère 3 façons d\'augmenter la tension dramatique ou émotionnelle, sans spoiler forcé.' },
    { id: 'dialogue', label: 'Dialogue', prompt: 'Propose 3 répliques / amorces de dialogue que mon personnage pourrait dire dans la situation actuelle (ou une scène typique).' },
    { id: 'blocage', label: 'Sortie de blocage', prompt: 'Je suis bloqué·e. Donne 4 pistes concrètes pour débloquer la scène (actions, révélations douces, changements d\'angle).' },
]);

export const DEFAULTS = Object.freeze({
    enabled: true,
    floating: true,
    wand: true,
    includeContext: false,
    contextN: 8,
    history: Object.freeze([]),
});

function ctx() {
    try { return globalThis.SillyTavern?.getContext?.() ?? null; } catch { return null; }
}

export function sanitize(src) {
    const o = (src && typeof src === 'object') ? src : {};
    const s = {};
    s.enabled = typeof o.enabled === 'boolean' ? o.enabled : DEFAULTS.enabled;
    s.floating = typeof o.floating === 'boolean' ? o.floating : DEFAULTS.floating;
    s.wand = typeof o.wand === 'boolean' ? o.wand : DEFAULTS.wand;
    s.includeContext = typeof o.includeContext === 'boolean' ? o.includeContext : DEFAULTS.includeContext;
    let n = Number(o.contextN);
    if (!Number.isFinite(n)) n = DEFAULTS.contextN;
    s.contextN = Math.min(40, Math.max(1, Math.round(n)));
    const hist = Array.isArray(o.history) ? o.history : [];
    s.history = hist
        .filter((m) => m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-80)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 12000), ts: Number(m.ts) || Date.now() }));
    return s;
}

let S = sanitize({});
let busy = false;
let panelOpen = false;

function loadSettings() {
    const c = ctx();
    const store = c?.extensionSettings;
    S = sanitize(store?.[KEY]);
    if (store) store[KEY] = S;
    return S;
}

function save() {
    const c = ctx();
    if (c?.extensionSettings) c.extensionSettings[KEY] = S;
    try { c?.saveSettingsDebounced?.(); } catch (e) { console.warn(LOG, 'sauvegarde', e); }
}

function $id(id) { return document.getElementById(id); }

/* ------------------------------------------------------------------ contexte chat RP (lecture seule) */

export function buildContextSnippet(chat, n) {
    const list = Array.isArray(chat) ? chat : [];
    const take = Math.min(40, Math.max(1, Number(n) || 8));
    const slice = list.filter((m) => m && !m.is_system).slice(-take);
    if (!slice.length) return '';
    return slice.map((m) => {
        const who = m.is_user ? (m.name || 'Utilisateur') : (m.name || 'Personnage');
        const text = String(m.mes || '').replace(/\s+/g, ' ').trim().slice(0, 600);
        return `${who}: ${text}`;
    }).join('\n');
}

function buildPrompt(userText) {
    const parts = [];
    if (S.includeContext) {
        const snip = buildContextSnippet(ctx()?.chat, S.contextN);
        if (snip) {
            parts.push(`Extrait des ${S.contextN} derniers messages du chat RP (lecture seule, ne pas y écrire) :\n${snip}`);
            parts.push('---');
        }
    }
    // Historique local de l'assistant (hors derniers tours pour éviter explosion)
    const prior = S.history.slice(-10);
    if (prior.length) {
        parts.push('Conversation récente avec l\'assistant (hors RP) :');
        for (const m of prior) {
            parts.push(`${m.role === 'user' ? 'Joueur' : 'Assistant'}: ${m.content.slice(0, 1500)}`);
        }
        parts.push('---');
    }
    parts.push(`Demande du joueur :\n${userText}`);
    return parts.join('\n\n');
}

/* ------------------------------------------------------------------ génération */

async function askAssistant(userText) {
    const c = ctx();
    if (!c?.generateRaw) throw new Error('generateRaw indisponible (SillyTavern trop ancien ?)');
    const prompt = buildPrompt(userText);
    const reply = await c.generateRaw({
        prompt,
        systemPrompt: DEFAULT_SYSTEM,
        responseLength: 500,
        instructOverride: true,
        trimNames: false,
    });
    return String(reply || '').trim();
}

function pushHistory(role, content) {
    S.history = sanitize({
        ...S,
        history: [...S.history, { role, content, ts: Date.now() }],
    }).history;
    save();
}

function clearHistory() {
    S.history = [];
    save();
    renderMessages();
}

/* ------------------------------------------------------------------ insertion / copie (PAS d'envoi) */

function insertIntoSendbar(text) {
    const ta = document.getElementById('send_textarea');
    if (!ta) throw new Error('#send_textarea introuvable');
    const cur = String(ta.value || '');
    const next = cur && !/\s$/.test(cur) ? `${cur}\n${text}` : `${cur}${text}`;
    if (typeof globalThis.$ === 'function') {
        globalThis.$('#send_textarea').val(next)[0].dispatchEvent(new Event('input', { bubbles: true }));
    } else {
        ta.value = next;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Ne jamais cliquer #send_but
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            return true;
        } catch { return false; }
    }
}

/* ------------------------------------------------------------------ UI panneau */

function ensurePanel() {
    let panel = $id(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'da-panel';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
<div class="da-backdrop" data-da-close="1"></div>
<div class="da-sheet" role="dialog" aria-labelledby="da_title">
  <header class="da-head">
    <div class="da-head-left">
      <span class="da-logo" aria-hidden="true">✨</span>
      <div>
        <div id="da_title" class="da-title">Direct Ask</div>
        <div class="da-sub">Assistant hors RP — n'écrit pas dans le chat</div>
      </div>
    </div>
    <button type="button" class="da-iconbtn" id="da_close" title="Fermer" aria-label="Fermer">✕</button>
  </header>
  <div class="da-quicks" id="da_quicks"></div>
  <div class="da-toolbar">
    <label class="da-check" title="Inclure les N derniers messages du chat RP (lecture seule)">
      <input type="checkbox" id="da_ctx_on" />
      <span>Inclure les <input type="number" id="da_ctx_n" min="1" max="40" step="1" class="da-n" /> derniers messages</span>
    </label>
    <button type="button" class="da-linkbtn" id="da_clear" title="Effacer l'historique local">Effacer l'historique</button>
  </div>
  <div class="da-msgs" id="da_msgs"></div>
  <div class="da-status" id="da_status" hidden></div>
  <form class="da-compose" id="da_form">
    <textarea id="da_input" rows="2" placeholder="Demande à l'assistant (hors RP)…" autocomplete="off"></textarea>
    <button type="submit" class="da-send" id="da_ask" title="Envoyer à l'assistant">➤</button>
  </form>
</div>`;
    document.body.appendChild(panel);

    const quicks = $id('da_quicks');
    for (const q of QUICK) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'da-chip';
        b.dataset.quick = q.id;
        b.textContent = q.label;
        quicks.appendChild(b);
    }

    panel.querySelector('.da-backdrop').addEventListener('click', () => setPanel(false));
    $id('da_close').addEventListener('click', () => setPanel(false));
    $id('da_clear').addEventListener('click', () => {
        if (!confirm('Effacer tout l\'historique local de Direct Ask ?')) return;
        clearHistory();
        setStatus('Historique effacé.');
    });
    $id('da_ctx_on').addEventListener('change', (e) => {
        S.includeContext = !!e.target.checked;
        save();
    });
    $id('da_ctx_n').addEventListener('change', (e) => {
        S.contextN = sanitize({ ...S, contextN: e.target.value }).contextN;
        e.target.value = String(S.contextN);
        save();
    });
    $id('da_form').addEventListener('submit', (e) => {
        e.preventDefault();
        const t = String($id('da_input').value || '').trim();
        if (!t || busy) return;
        $id('da_input').value = '';
        runAsk(t);
    });
    quicks.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-quick]');
        if (!btn || busy) return;
        const q = QUICK.find((x) => x.id === btn.dataset.quick);
        if (q) runAsk(q.prompt);
    });
    $id('da_msgs').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-da-act]');
        if (!btn) return;
        const bubble = btn.closest('.da-msg');
        const text = bubble?.querySelector('.da-msg-body')?.innerText || '';
        if (!text) return;
        if (btn.dataset.daAct === 'copy') {
            const ok = await copyText(text);
            setStatus(ok ? 'Copié.' : 'Copie impossible.');
        } else if (btn.dataset.daAct === 'insert') {
            try {
                insertIntoSendbar(text);
                setStatus('Inséré dans la barre de saisie (non envoyé).');
            } catch (err) {
                setStatus('Insertion impossible : ' + err.message);
            }
        }
    });

    return panel;
}

function setStatus(msg) {
    const el = $id('da_status');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
    clearTimeout(setStatus._t);
    setStatus._t = setTimeout(() => { el.hidden = true; }, 3500);
}

function renderMessages() {
    const box = $id('da_msgs');
    if (!box) return;
    box.innerHTML = '';
    if (!S.history.length) {
        const empty = document.createElement('div');
        empty.className = 'da-empty';
        empty.textContent = 'Pose une question ou utilise un bouton rapide. Rien n\'est écrit dans le chat RP.';
        box.appendChild(empty);
        return;
    }
    for (const m of S.history) {
        const row = document.createElement('div');
        row.className = `da-msg da-${m.role}`;
        const body = document.createElement('div');
        body.className = 'da-msg-body';
        body.textContent = m.content;
        row.appendChild(body);
        if (m.role === 'assistant') {
            const acts = document.createElement('div');
            acts.className = 'da-acts';
            acts.innerHTML = `
<button type="button" class="da-act" data-da-act="copy">Copier</button>
<button type="button" class="da-act" data-da-act="insert">Insérer dans la barre de saisie</button>`;
            row.appendChild(acts);
        }
        box.appendChild(row);
    }
    box.scrollTop = box.scrollHeight;
}

function syncPanelControls() {
    const on = $id('da_ctx_on');
    const n = $id('da_ctx_n');
    if (on) on.checked = !!S.includeContext;
    if (n) n.value = String(S.contextN);
}

function setPanel(open) {
    ensurePanel();
    panelOpen = !!open && S.enabled;
    const panel = $id(PANEL_ID);
    panel.classList.toggle('da-open', panelOpen);
    panel.setAttribute('aria-hidden', panelOpen ? 'false' : 'true');
    if (panelOpen) {
        syncPanelControls();
        renderMessages();
        setTimeout(() => $id('da_input')?.focus(), 50);
    }
    updateChrome();
}

async function runAsk(text) {
    if (!S.enabled) { setStatus('Direct Ask est désactivé.'); return; }
    if (busy) return;
    busy = true;
    pushHistory('user', text);
    renderMessages();
    setStatus('Génération…');
    $id('da_ask')?.setAttribute('disabled', 'true');
    try {
        const reply = await askAssistant(text);
        pushHistory('assistant', reply || '(réponse vide)');
        renderMessages();
        setStatus('');
    } catch (e) {
        console.warn(LOG, e);
        const msg = String(e?.message || e);
        pushHistory('assistant', `⚠️ Erreur : ${msg}`);
        renderMessages();
        setStatus('Erreur de génération.');
    } finally {
        busy = false;
        $id('da_ask')?.removeAttribute('disabled');
    }
}

/* ------------------------------------------------------------------ flottant + baguette */

function ensureFloat() {
    let el = $id(FLOAT_ID);
    if (el) return el;
    el = document.createElement('button');
    el.id = FLOAT_ID;
    el.type = 'button';
    el.className = 'da-float';
    el.title = 'Direct Ask — assistant hors RP';
    el.setAttribute('aria-label', 'Ouvrir Direct Ask');
    el.textContent = '✨';
    el.addEventListener('click', () => setPanel(!panelOpen));
    document.body.appendChild(el);
    return el;
}

function placeWand() {
    let item = $id(WAND_ID);
    if (!S.enabled || !S.wand) { item?.remove(); return; }
    const menu = $id('extensionsMenu');
    if (!menu) return;
    if (!item) {
        item = document.createElement('div');
        item.id = WAND_ID;
        item.className = 'list-group-item flex-container flexGap5 interactable';
        item.tabIndex = 0;
        item.innerHTML = '<div class="extensionsMenuExtensionButton">✨</div><span>Direct Ask</span>';
        item.addEventListener('click', () => {
            try { globalThis.$?.('#extensionsMenuButton')?.click(); } catch { /* ignore */ }
            setPanel(true);
        });
        menu.appendChild(item);
    }
}

function updateChrome() {
    // Afficher dès qu'activé : l'assistant hors RP reste utile même sans personnage sélectionné.
    const showFloat = !!(S.enabled && S.floating);
    const fl = ensureFloat();
    fl.classList.toggle('da-show', showFloat);
    placeWand();
    if (!S.enabled && panelOpen) setPanel(false);
}

/* ------------------------------------------------------------------ panneau Extensions (réglages FR) */

function panelHtml() {
    return `
<div id="da_settings" class="da-settings ${STYLE_GUARD}">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>✨ Direct Ask — assistant hors RP</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <p class="da-help">Parle à un assistant <b>en dehors</b> du RP (idées, relances, conseils). Rien n'est injecté dans le chat du personnage. Utilise le modèle déjà configuré (<code>generateRaw</code>).</p>
      <label class="checkbox_label"><input type="checkbox" id="da_enabled" /><span>Activer Direct Ask</span></label>
      <label class="checkbox_label"><input type="checkbox" id="da_floating" /><span>Bouton flottant ✨</span></label>
      <label class="checkbox_label"><input type="checkbox" id="da_wand" /><span>Entrée dans le menu baguette</span></label>
      <hr>
      <label class="checkbox_label"><input type="checkbox" id="da_set_ctx" /><span>Inclure les N derniers messages du chat (défaut : off)</span></label>
      <label for="da_set_n">Nombre de messages (N)</label>
      <input type="number" id="da_set_n" class="text_pole" min="1" max="40" step="1" />
      <hr>
      <div id="da_set_clear" class="menu_button">Effacer l'historique local</div>
      <small class="opacity50">Ne modifie pas la barre d'envoi, Portrait Lignes, ni l'historique RP. « Insérer » remplit seulement la zone de saisie, sans envoyer.</small>
    </div>
  </div>
</div>`;
}

function refreshSettingsUi() {
    if (!$id('da_settings')) return;
    $id('da_enabled').checked = S.enabled;
    $id('da_floating').checked = S.floating;
    $id('da_wand').checked = S.wand;
    $id('da_set_ctx').checked = S.includeContext;
    $id('da_set_n').value = String(S.contextN);
}

function bindSettingsUi() {
    const on = (id, ev, fn) => $id(id)?.addEventListener(ev, fn);
    on('da_enabled', 'change', (e) => { S.enabled = e.target.checked; save(); updateChrome(); });
    on('da_floating', 'change', (e) => { S.floating = e.target.checked; save(); updateChrome(); });
    on('da_wand', 'change', (e) => { S.wand = e.target.checked; save(); updateChrome(); });
    on('da_set_ctx', 'change', (e) => {
        S.includeContext = e.target.checked;
        save();
        syncPanelControls();
    });
    on('da_set_n', 'change', (e) => {
        S.contextN = sanitize({ ...S, contextN: e.target.value }).contextN;
        e.target.value = String(S.contextN);
        save();
        syncPanelControls();
    });
    on('da_set_clear', 'click', () => {
        if (!confirm('Effacer l\'historique local de Direct Ask ?')) return;
        clearHistory();
        setStatus('Historique effacé.');
    });
}

/* ------------------------------------------------------------------ API publique (tests) */

function refresh() {
    loadSettings();
    updateChrome();
    refreshSettingsUi();
    syncPanelControls();
    if (panelOpen) renderMessages();
}

globalThis.DirectAsk = {
    KEY,
    DEFAULTS,
    QUICK,
    DEFAULT_SYSTEM,
    sanitize,
    buildContextSnippet,
    getSettings: () => JSON.parse(JSON.stringify(S)),
    set: (patch) => {
        S = sanitize({ ...S, ...(patch && typeof patch === 'object' ? patch : {}) });
        save();
        refresh();
        return S;
    },
    reset: () => {
        S = sanitize({ enabled: true });
        save();
        refresh();
        return S;
    },
    open: () => setPanel(true),
    close: () => setPanel(false),
    isOpen: () => panelOpen,
    ask: (text) => runAsk(String(text || '')),
    clearHistory: () => { clearHistory(); },
    insertIntoSendbar,
    refresh,
    version: '1.0.0',
};

/* ------------------------------------------------------------------ init */

try { loadSettings(); } catch (e) { console.warn(LOG, 'init précoce', e); }

jQuery(async () => {
    try {
        loadSettings();
        ensurePanel();
        ensureFloat();
        const host = $id('extensions_settings2') || $id('extensions_settings');
        if (host && !$id('da_settings')) {
            host.insertAdjacentHTML('beforeend', panelHtml());
            bindSettingsUi();
            refreshSettingsUi();
        }
        updateChrome();

        const c = ctx();
        const es = c?.eventSource;
        const et = c?.eventTypes || c?.event_types;
        if (es && et) {
            const bump = () => updateChrome();
            for (const name of ['CHAT_CHANGED', 'CHAT_CREATED', 'CHARACTER_PAGE_LOADED', 'GROUP_UPDATED', 'APP_READY']) {
                const key = et[name];
                if (key) es.on(key, bump);
            }
        }
        // baguette parfois montée plus tard
        let tries = 0;
        const t = setInterval(() => {
            placeWand();
            if ($id(WAND_ID) || !S.wand || ++tries > 40) clearInterval(t);
        }, 500);

        console.log(LOG, 'prêt v1.0.0');
    } catch (e) {
        console.error(LOG, 'init', e);
    }
});
