# 🧠 AI Guidelines for Denki Development

To continue pushing the boundaries of performance and maintaining the highest code quality on the **Denki** project, all AI coding assistants must adhere to the following core guidelines and development strategies:

---

## 🔍 1. Thorough Prior Research (No Guesswork)
- **Always search and read** the target codebase, files, and type definitions before suggesting modifications or writing code.
- Avoid guessing file structures, imports, or variable states. This prevents stale variables, broken layout calculations, and syntax regressions.

## 🧪 2. Strict Verification Loop
- **Verify code immediately** using:
  - TypeScript compilation checking: `npx tsc --noEmit`
  - Production bundler builds: `npm run build`
  - Unit tests: `npx vitest run`
- This guarantees that no code is checked in with type mismatch errors, packaging problems, or broken test cases.

## 🔒 3. User-Centric Data Safety
- Identify any destructive actions in the app layout (e.g., class deletions, deck deletions, progress resets).
- **Proactively add confirmation gates** (`window.confirm()`) in the user interface to guard the user against accidental data loss.

## 🧩 4. Clean Component Architecture
- Avoid coding in large monolithic blocks. Keep files focused and readable.
- When views or pages exceed ~400 lines of complex layouts, **modularize and decompose** them into single-responsibility, reusable sub-components.

## 🎨 5. Modern Design Aesthetics First
- Web layouts must be visually compelling, premium, and interactive:
  - Prioritize customized modern typography (e.g., Google Fonts like **Plus Jakarta Sans**).
  - Incorporate responsive media queries (`@media`) to ensure all screen scales (mobile, tablet, desktop) are structured beautifully.
  - Implement smooth HSL/glowing gradients and micro-animations for hover states.
  - **Optimize performance**: Avoid GPU composition lag by cleaning up permanent rendering hooks (such as unnecessary background `will-change` properties).
