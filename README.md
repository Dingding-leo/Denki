<div align="center">

<!-- Logo Placeholder: Use an animated SVG or GIF here -->
<img src="./src/assets/logo.png" alt="Denki Logo" width="150" />

# ⚡ Denki (電気)

**The Ultimate Local-First Spaced Repetition Studio that feels like magic.**

[![GitHub Stars](https://img.shields.io/github/stars/Dingding-leo/Denki?style=for-the-badge&logo=github&color=6366f1)](https://github.com/Dingding-leo/Denki/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Built with React](https://img.shields.io/badge/React-19-000000?style=for-the-badge&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite)](https://vite.dev)
[![Local-First](https://img.shields.io/badge/Database-Dexie-green?style=for-the-badge)](https://dexie.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](http://makeapullrequest.com)

[**🚀 Live Demo**](https://dingding-leo.github.io/Denki/) • [**Quick Start**](#-quick-start) • [**Contributing**](#-contributing)

</div>

---

## 🌟 Why Denki?

**Denki** (Japanese for *electricity*) is a premium, offline-first flashcard studio engineered for learners who demand scientific precision wrapped in breathtaking aesthetics. 

Powered by the state-of-the-art **FSRS 4.5** memory scheduler, Denki eliminates the friction of studying. We replaced cluttered, legacy interfaces with a glowing, glassmorphic canvas designed to boost retention and keep you in the ultimate flow state.

---

## 🏆 How We Compare

| Feature | ⚡ **Denki** | 🟦 **Anki** | 🟪 **Quizlet** | 🔵 **RemNote** |
| :--- | :---: | :---: | :---: | :---: |
| **Spaced Repetition Algorithm** | FSRS 4.5 | SM-2 / FSRS | Basic | SM-2 variant |
| **Offline First** | 🟢 Yes (100%) | 🟢 Yes | 🔴 No | 🟡 Partial |
| **UI / UX Aesthetics** | ✨ Stunning Glassmorphism | 💀 Legacy / Clunky | 🎨 Modern | 📋 Utilitarian |
| **Built-in Scratchpad** | 🟢 Yes (Native) | 🟡 Needs Plugin | 🔴 No | 🔴 No |
| **Speed Match Game** | 🟢 Yes | 🔴 No | 🟢 Yes | 🔴 No |
| **Native Cloze Deletions** | 🟢 Yes | 🟢 Yes | 🔴 No | 🟢 Yes |
| **Open Source** | 🟢 Yes | 🟢 Yes | 🔴 No | 🔴 No |

---

## 📸 Sneak Peek

*Replace these placeholders with actual high-quality screenshots:*

> **[🖼️ Screenshot 1 Placeholder]** 
> *Showcase the Glowing Glassmorphic Study Dashboard with study streaks and progress rings.*

> **[🖼️ Screenshot 2 Placeholder]** 
> *Highlight the interactive Canvas/Scratchpad mode where users draw directly on flashcards.*

> **[🖼️ Screenshot 3 Placeholder]** 
> *Show the fast-paced Match Game interface with confetti and high scores.*

---

## ✨ Features that Spark Joy

- 🧠 **Next-Gen Memory Engine (FSRS 4.5)**: Denki utilizes the Free Spaced Repetition Scheduler v4.5, optimizing your reviews for a targeted 90% recall probability. Study less, remember more.
- 🎨 **Immersive, Glowing Interface**: A sleek dark mode with mesh gradients, 3D card flips, and buttery-smooth micro-animations that make learning feel tactile.
- ✍️ **Integrated Scratchpad**: Never look for scrap paper again. Sketch kanji, trace formulas, or draw diagrams right on top of your flashcards.
- 🕹️ **Speed Match Game**: Break the monotony of reviews with an integrated arcade-style matching game.
- 📥 **1-Click Import Suite**: Drag-and-drop your `.apkg` files to instantly migrate from Anki, or upload CSVs to batch-create hundreds of cards.
- ⚡ **Lightning Fast & Local-First**: Built on Dexie.js (IndexedDB). Your cards load instantly, work 100% offline, and your data never leaves your device.
- 📝 **Rich Markdown & Syntax Highlighting**: Fully supports code blocks, math, blockquotes, and interactive Cloze Deletions (fill-in-the-blanks).

---

## 🆚 Why Denki over Anki?

Anki is a phenomenal tool that popularized spaced repetition, but let's be honest—its interface feels like it's stuck in 2005. 

**Denki is built for the modern learner.** 
We took the most powerful scheduling algorithms available today (FSRS) and wrapped them in an interface you'll *actually want* to use. 
- **Zero Configuration**: No need to download 15 plugins just to make the app look good or get a functional scratchpad. Denki is gorgeous and feature-rich out of the box.
- **Web Native**: Runs entirely in your browser without desktop clients, yet works perfectly offline.
- **Micro-interactions**: From tactile card flips to celebratory confetti, Denki uses psychological rewards to keep your dopamine high and study fatigue low.

---

## 🛠️ The Tech Stack

Denki is crafted with modern, lightweight, and high-performance technologies:

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![Zustand](https://img.shields.io/badge/zustand-%2320232a.svg?style=for-the-badge&logo=react)
![Dexie.js](https://img.shields.io/badge/Dexie.js-IndexedDB-4B8BBE?style=for-the-badge)
![Tailwind/CSS](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)

*(Powered by `marked`, `prismjs`, `canvas-confetti`, and `lucide-react`)*

---

## 🚀 Quick Start

Get your local Denki studio running in seconds. Make sure you have [Node.js](https://nodejs.org/) installed (v18+).

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Dingding-leo/Denki.git
   cd Denki
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Ignite the development server:**
   ```bash
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:5173`. Boom. ⚡

---

## 📈 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Dingding-leo/Denki&type=Date)](https://star-history.com/#Dingding-leo/Denki&Date)

*Help us go viral! If you love Denki, please give us a ⭐️.*

---

## 🤝 Contributing

We want to make Denki the ultimate open-source study tool, and we'd love your help! 

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

<div align="center">
  <p>Built with ❤️ and ⚡ for learners everywhere.</p>
</div>
