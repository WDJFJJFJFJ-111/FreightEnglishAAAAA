# Freight English Trainer 货代英语训练器

A mobile-friendly Progressive Web App (PWA) for learning freight forwarding English vocabulary, sentences, and dialogues.

## What is it?

Freight English Trainer is a self-contained web app designed to help freight forwarding professionals and learners build their English skills through:

- **Daily Freight Vocabulary** — Learn key terms used in shipping, customs, and logistics
- **Example Sentences** — See vocabulary used in real freight forwarding contexts
- **Pronunciation** — Listen to correct pronunciation of words and phrases
- **Practice Dialogues** — Study realistic conversations between freight agents and clients
- **Learning Progress** — Track your daily study streaks and reviewed words

No account required. No server needed. All data stays on your device.

## Run Locally

> You must serve the files over HTTP — do not open `index.html` directly in the browser.

**Option 1 — npx serve (recommended, no install needed):**
```bash
cd FreightEnglish
npx serve .
```
Then open http://localhost:3000 in your browser.

**Option 2 — Python:**
```bash
cd FreightEnglish
python -m http.server 3000
```

**Option 3 — VS Code Live Server:**
Install the "Live Server" extension, right-click `index.html` → Open with Live Server.

## Open the Online Version

Visit the live site at:

```
https://YOUR_GITHUB_USERNAME.github.io/FreightEnglish/
```

*(Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username after deploying via GitHub Pages.)*

## Install as a Mobile App (PWA)

Once the online version is open in your mobile browser:

- **iOS Safari:** Tap Share → "Add to Home Screen"
- **Android Chrome:** Tap the menu → "Add to Home Screen"

The app works fully offline after the first visit.

## Project Structure

```
FreightEnglish/
├── index.html          # Main app shell
├── style.css           # Styles
├── app.js              # App logic
├── vocabulary.json     # Freight vocabulary data
├── sentences.json      # Example sentences
├── dialogues.json      # Practice dialogues
├── manifest.json       # PWA manifest
├── service-worker.js   # Offline caching
└── icons/              # App icons (SVG)
```

## Tech Stack

Pure HTML + CSS + JavaScript. No frameworks, no build tools, no dependencies.
