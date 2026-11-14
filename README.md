# ScribeTeX — Real-Time LaTeX Studio

A real-time LaTeX document editor and live typesetting workspace built with React, TypeScript, CodeMirror 6, KaTeX, and Tailwind CSS v4.

Write LaTeX with instant live preview, a 249-symbol interactive math keyboard, customizable syntax highlighting, dual **Coal Black** and **Milk White** themes, and automatic `localStorage` persistence.

---

## Key Features

### Real-Time LaTeX Editor & Live Preview
- **Live Split, Editor-Only, or Preview-Only Views** with a draggable split-pane divider (`25%`–`75%`) and keyboard resizing (`ArrowLeft` / `ArrowRight`).
- **Compilation Cadence**: Switch between **Instant**, **Debounced** (`220ms`), or **Manual** compilation modes.
- **Synchronized Scrolling**: Scroll positions stay aligned between the source editor and typeset preview, with clickable headings in the Document Outline jumping directly to source lines and preview sections.
- **Non-Fatal Diagnostics**: Inline KaTeX parse errors and math warnings surface in a collapsible diagnostics banner without interrupting editing.

### Custom LaTeX Symbol Keyboard (249 Symbols)
- **11 Toolbar Categories**:
  - **Recent / Pinned** (tracks recently used symbols and user-starred favorites)
  - **Greek Letters** (`\alpha`–`\Omega`, variants like `\varepsilon`, `\varphi`)
  - **Operators & Fractions** (`\frac`, `\sqrt`, `\pm`, `\cdot`, `\otimes`, etc.)
  - **Calculus & Big Ops** (`\int`, `\iint`, `\oint`, `\sum`, `\prod`, `\lim`, `\nabla`, `\partial`)
  - **Relations** (`\leq`, `\geq`, `\approx`, `\equiv`, `\subset`, `\in`, `\perp`, etc.)
  - **Logic & Sets** (`\forall`, `\exists`, `\land`, `\lor`, `\mathbb{R}`, `\mathbb{N}`, etc.)
  - **Arrows** (`\rightarrow`, `\Rightarrow`, `\leftrightarrow`, `\mapsto`, etc.)
  - **Accents & Fonts** (`\hat`, `\bar`, `\vec`, `\ddot`, `\mathbf`, `\mathcal`, `\mathrm`, etc.)
  - **Delimiters & Matrices** (`bmatrix`, `pmatrix`, `vmatrix`, `cases`, `\left( ... \right)`, etc.)
  - **Functions & Constants** (`\sin`, `\cos`, `\log`, `\exp`, `\det`, `\infty`, `\hbar`, etc.)
  - **Document & Environments** (`section`, `equation`, `align`, `theorem`, `proof`, `itemize`, `tabular`, etc.)
- **Search & Smart Insertion**: Filter symbols by name, command, or keyword; clicking any symbol inserts its snippet at the cursor or wraps the current selection at `$0`.

### Deep Customization & Dual Themes
- **Coal Black (Default Dark Mode)**: Deep coal canvas (`#0B0C0E`) and elevated slate surfaces paired with vibrant blue accents (`#2563EB` / `#3B82F6`).
- **Milk White (Light Mode)**: Warm milk-white surface (`#FAF9F6`) with soft grey accents and high-contrast ink typography (`#111113`).
- **6 Syntax Highlighting Palettes** (or toggle syntax highlighting off completely):
  - *Coal & Cobalt*, *Milk & Graphite*, *Vibrant Prism*, *Nordic Frost*, *Solar Academic*, *Monochrome Ink*
- **Editor Ergonomics**:
  - Monospace font selector (`JetBrains Mono`, `IBM Plex Mono`, `Fira Code`, `Space Mono`)
  - Adjustable font size (`11px`–`24px`), line height (`1.20`–`2.20`), and tab width (`2`, `4`, or `8` spaces)
  - Toggles for line numbers, soft word wrap, active line highlight, bracket matching, auto-closing braces/delimiters, programming ligatures, and visible whitespace
  - `\` command autocomplete and built-in Find & Replace (`Ctrl+F`)
- **Paper & Preview Styling**:
  - **Paginated** or **Continuous** paper layout
  - Paper surface sync (*Match App* vs. *Always White Sheet*)
  - Typeset font selector (`Source Serif 4`, `Lora`, `Plus Jakarta Sans`), size (`12px`–`20px`), zoom (`60%`–`150%`), and paper margins (*Narrow*, *Standard*, *Wide*)
  - Automatic equation numbering toggle

### Welcome Screen, Templates & Local Auto-Save
- **VS Code–Style Welcome View**: Opens when no document is active, with centered **New file** and **Use a template** actions, a **Recent** documents list, and quick keyboard tips.
- **Starter Structure for New Files**: Clicking **New file** creates a clean `Untitled.tex` with a basic header and base section:
  ```latex
  \documentclass{article}
  \title{}
  \author{}
  \date{}

  \begin{document}
  \maketitle

  \section{}

  \end{document}
  ```
- **Templates & Import/Export**:
  - Built-in templates (*Variational Calculus & Spectral Analysis*, *Linear Algebra & Matrix Decomposition*, *Quantum Mechanics & Electrodynamics*, *Blank Document*)
  - Import existing `.tex` files from disk, export `.tex` source, or print/save to PDF (`window.print()` with dedicated `@media print` styling)
- **Synchronous `localStorage` Auto-Save**: Persists document content, title updates, document list, active file ID, and editor settings synchronously on every edit and on `beforeunload`.

---

## Supported LaTeX Features

The client-side compiler (`src/latex/parser.ts`) supports:
- **Preamble & Macros**: `\documentclass`, `\title`, `\author`, `\date`, `\today`, `\newcommand` (including positional arguments `[n]`), and `\DeclareMathOperator`
- **Document Structure**: `\maketitle`, `\tableofcontents`, `\part`, `\chapter`, `\section`, `\subsection`, `\subsubsection`, `\paragraph`, `\begin{abstract}`
- **Mathematics (via KaTeX)**: Inline (`$...$`, `\(...\)`) and display math (`$$...$$`, `\[...\]`), `equation`, `equation*`, `align`, `align*`, `gather`, `multline`, with optional auto-numbering
- **Cross-References & Citations**: `\label`, `\ref`, `\eqref`, `\cite`, `\href`, `\url`
- **Environments & Formatting**: `theorem`, `lemma`, `proposition`, `corollary`, `definition`, `remark`, `example`, `proof`, `itemize`, `enumerate`, `tabular` (with `\hline` and column alignments), `center`, `quote`, `verbatim`, `\textbf`, `\textit`, `\emph`, `\underline`, `\texttt`, and `%` comment stripping

---

## Tech Stack

- **Framework**: React 19 + TypeScript + Vite 8
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Code Editor**: CodeMirror 6 (`@codemirror/state`, `view`, `commands`, `language`, `search`, `autocomplete`, `@lezer/highlight`)
- **Math Rendering**: KaTeX (`katex`)
- **Icons**: Lucide React (`lucide-react`)

---

## Getting Started

### Prerequisites
- Node.js 20+ and npm (or Bun)

### Installation
```bash
npm install
```

### Run Development Server
Starts Vite on port `3000`:
```bash
npm run dev
```

### Production Build & Type Check
```bash
npm run lint     # TypeScript check (tsc --noEmit)
npm run build    # Production bundle in dist/
npm run preview  # Preview built bundle locally
```

### Run Unit Tests
Tests cover the LaTeX parser (`src/latex/parser.test.ts`), `$0` snippet insertion utilities (`src/editor/snippetUtils.test.ts`), and `localStorage` auto-save persistence (`src/utils/documentStorage.test.ts`):
```bash
npx tsx --test src/latex/parser.test.ts src/editor/snippetUtils.test.ts src/utils/documentStorage.test.ts
```

---

## Project Structure

```text
├── index.html                        # HTML entry point & Google Fonts (JetBrains Mono, Source Serif 4, etc.)
├── metadata.json                     # App metadata
├── package.json                      # Dependencies & scripts
├── src/
│   ├── App.tsx                       # Main workspace layout, toolbar, split pane & state wiring
│   ├── index.css                     # Tailwind CSS v4, Coal Black / Milk White tokens, KaTeX & print styles
│   ├── main.tsx                      # React root mount
│   ├── components/
│   │   ├── CustomizationDrawer.tsx   # Theme, syntax palette, editor & preview settings drawer
│   │   ├── LatexEditorPane.tsx       # CodeMirror 6 wrapper with dynamic compartment reconfiguration
│   │   ├── LatexPreviewPane.tsx      # Live KaTeX typeset preview & collapsible diagnostics bar
│   │   ├── OutlineSidebar.tsx        # Document switcher & clickable section outline
│   │   ├── SymbolKeyboardToolbar.tsx # Categorized 249-symbol math & structure keyboard
│   │   ├── TemplatesModal.tsx        # Template picker & local .tex file importer
│   │   └── WelcomeScreen.tsx         # VS Code–style welcome screen when no file is open
│   ├── data/
│   │   ├── latexSymbols.ts           # Full symbol catalog & category metadata
│   │   └── templates.ts              # Academic templates & blank document starter
│   ├── editor/
│   │   ├── latexLanguage.ts          # CodeMirror LaTeX StreamLanguage, autocomplete & 6 highlight presets
│   │   ├── snippetUtils.ts           # $0 cursor & selection-wrapping insertion logic
│   │   └── snippetUtils.test.ts      # Unit tests for snippet insertion
│   ├── hooks/
│   │   └── usePersistentState.ts     # Default editor settings & persistent state hook
│   ├── latex/
│   │   ├── parser.ts                 # Client-side LaTeX compiler & KaTeX math renderer
│   │   └── parser.test.ts            # Unit tests for LaTeX parsing & diagnostics
│   ├── types/
│   │   └── editor.ts                 # Shared TypeScript interfaces
│   └── utils/
│       ├── documentStorage.ts        # Synchronous localStorage auto-save & draft reconciliation
│       └── documentStorage.test.ts   # Unit tests for storage persistence & cleanup
```

---

## Browser Storage Keys

All user data stays local to your browser via `localStorage`:

| Key | Purpose |
| :--- | :--- |
| `scribetex:docs:v1` | Saved documents array |
| `scribetex:activeDocId:v1` | Currently open document ID (`null` when on Welcome screen) |
| `scribetex:autosave:<docId>` | Per-document synchronous auto-save draft record |
| `scribetex:lastSavedAt:v1` | Timestamp of the most recent auto-save |
| `scribetex:settings:v1` | Theme, syntax palette, font, and preview preferences |
| `scribetex:recentSymbols:v1` | Recently used symbol IDs |
| `scribetex:favoriteSymbols:v1` | Pinned favorite symbol IDs |
