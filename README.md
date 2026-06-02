# ⚡ Denki (電気) — The Ultimate Spaced Repetition Flashcard Studio

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with React](https://img.shields.io/badge/Built%20with-React%2019-blue?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Bundled%20with-Vite%208-646CFF?logo=vite)](https://vite.dev)
[![Local-First](https://img.shields.io/badge/Database-IndexedDB%20(Dexie)-green)](https://dexie.org)

**Denki** (Japanese for *electricity*) is a premium, local-first flashcard studio engineered for learners who demand both scientific precision and breathtaking aesthetics. 

Powered by the state-of-the-art **FSRS 4.5** memory scheduler, Denki eliminates the friction of studying, replacing cluttered legacy interfaces with a gorgeous glassmorphic, immersive canvas designed to boost retention and keep you in the flow state.

---

## ✨ Key Features

### 🧠 1. State-of-the-Art Spaced Repetition (FSRS 4.5)
Legacy flashcard apps rely on decades-old SM-2 algorithms. Denki implements the **Free Spaced Repetition Scheduler (FSRS) v4.5**, the modern standard in cognitive science.
- **Dynamic Stability & Difficulty Tracking**: Learns how *you* learn.
- **Targeted Retention**: Schedules reviews to optimize a customizable probability of recall (default: 90%).
- **Dual Review Systems**: Choose between classic Anki-style review scores or Brainscape-style 1-to-5 confidence ratings.

### 🎨 2. Immersive, Glowing Interface
- **Premium Glassmorphic Panel Design**: Sleek dark mode with glowing mesh gradient backgrounds.
- **Smooth 3D Card Flipping**: Tactile micro-animations that feel physical and responsive.
- **Gamified Rewards**: Celebratory canvas confetti transitions to keep dopamine high.

### ✍️ 3. Integrated Interactive Canvas & Scratchpad
- Never search for scrap paper again. Sketch kanji, draw diagrams, write mathematical formulas, or trace chemical structures directly on top of your flashcard using the interactive digital scratchpad.

### 📝 4. Rich Markdown & Syntax Highlighting
- Create cards with headings, lists, bold text, code blocks (powered by PrismJS), blockquotes, and **Interactive Cloze Deletions** (fill-in-the-blanks) that reveal themselves with a click.

### 🕹️ 5. Speed Match Game
- Break up long study sessions with a fast-paced, interactive card-matching game. Test your instant recall and beat your high scores!

### 📥 6. Universal Import Suite
- **Anki Importer (`.apkg`)**: Instantly migrate your Anki decks, images, and card formats.
- **CSV Importer**: Drag and drop spreadsheets to batch-generate hundreds of cards in seconds.

### 🔒 7. Local-First & Lightning Fast
- All decks, review history, and cards are stored in your browser using **Dexie.js (IndexedDB)**.
- 100% offline functionality. Your data never leaves your device.

---

## 🛠️ The Tech Stack

Denki is built using modern, lightweight, and high-performance technologies:
- **Frontend Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Build Tool**: [Vite 8](https://vite.dev/)
- **State Management**: [Zustand](https://zustand.docs.pmnd.rs/) (for ultra-fast, reactive atomic state)
- **Local Database**: [Dexie.js](https://dexie.org/) (robust wrapper for IndexedDB)
- **Styling**: Vanilla CSS custom variables (designed for custom glowing themes & GPU-accelerated micro-animations)
- **Utilities**: `marked` + `prismjs` + `canvas-confetti` + `lucide-react`

---

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v18 or higher recommended).

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Dingding-leo/Denki.git
   cd Denki
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:5173`.

---

## 📐 How FSRS 4.5 Works in Denki

Our scheduler updates memory parameters dynamically using mathematical equations:
- **Stability ($S$)**: The number of days it takes for probability of recall to drop to 90%.
- **Difficulty ($D$)**: A rating from 1 to 10 representing the complexity of the card.
- **Retrievability ($R$)**: The probability that you successfully recall a card.

Every time you review a card, Denki recalculates stability:
$$R = 0.9^{\frac{t}{S}}$$

Where $t$ is the elapsed days since the last review. This guarantees that you are tested at the precise point of forgetting, drastically shortening your overall study time.

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:
1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
