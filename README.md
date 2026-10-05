# Direct Ask — assistant hors RP (SillyTavern)

Extension **SillyTavern** par [hydravnss](https://github.com/hydravnss) : un assistant à qui parler **en dehors** du roleplay (idées de scènes, relances, tension, dialogues, sorties de blocage, résumé…).

- **Ne s’injecte pas** dans le chat du personnage / l’historique RP
- Utilise **`generateRaw`** (API / modèle déjà configurés dans ST, 1.19.0+)
- Panneau FR, bouton flottant ✨ + entrée menu baguette
- Contexte optionnel : *Inclure les N derniers messages* (off par défaut)
- Historique local (`extensionSettings.direct_ask`), effaçable
- **Copier** / **Insérer dans la barre de saisie** (jamais d’envoi auto)
- N’altère pas la sendbar, Portrait Lignes, etc.

## Installation

1. Extensions → Install from URL :
   `https://github.com/hydravnss/rp-assistant`
2. Activer **Direct Ask**
3. Ouvrir via le bouton flottant ✨ ou le menu baguette

## Réglages

| Option | Défaut | Effet |
|--------|--------|--------|
| Activer | on | Active / désactive l’extension |
| Bouton flottant | on | ✨ sur l’écran de chat |
| Menu baguette | on | Entrée « Direct Ask » |
| Inclure N messages | off | Envoie un extrait lecture seule à l’assistant |
| N | 8 | Nombre de messages (1–40) |

## API test (`window.DirectAsk`)

`open()`, `close()`, `ask(text)`, `set(patch)`, `reset()`, `clearHistory()`, `insertIntoSendbar(text)`, `getSettings()`, `buildContextSnippet(chat, n)`

## Tests

```bash
# Faux backend (si besoin)
node test/mock-openai.mjs 9102

# SillyTavern sur http://localhost:8000 avec l’extension liée
node test/st-playwright.mjs
```

Captures : `/workspace/st-test-shots/rpa-*.png`

## Licence

MIT © hydravnss
