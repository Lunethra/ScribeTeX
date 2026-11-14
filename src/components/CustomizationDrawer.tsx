import { RotateCcw, X } from 'lucide-react';
import { SYNTAX_PRESETS } from '../editor/latexLanguage';
import type {
  CompileMode,
  EditorFontFamily,
  EditorSettings,
  PaperLayout,
  PaperMargin,
  PreviewFontFamily,
  PreviewThemeSync,
} from '../types/editor';

interface CustomizationDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: EditorSettings;
  onUpdate: <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => void;
  onReset: () => void;
}

interface ToggleRowProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ id, label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="cursor-pointer select-none">
        <div className="text-xs font-medium text-[var(--text-primary)]">{label}</div>
        {description && (
          <div className="text-[11px] text-[var(--text-muted)] leading-snug">{description}</div>
        )}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
          checked
            ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)]'
            : 'bg-[var(--bg-elevated)] border-[var(--border-hairline)]'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-xs transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export function CustomizationDrawer({
  open,
  onClose,
  settings,
  onUpdate,
  onReset,
}: CustomizationDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <aside
        aria-label="Editor and preview customization"
        className="relative z-10 w-full max-w-md h-full flex flex-col bg-[var(--bg-surface)] border-l border-[var(--border-hairline)] text-[var(--text-primary)] shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-hairline)]">
          <div>
            <h2 className="text-sm font-semibold">Workspace Customization</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Tune theme, syntax highlighting, editor ergonomics, and paper styling.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customization panel"
            className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* 1. Theme & Color Mode */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
              Interface Theme
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdate('theme', 'dark')}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  settings.theme === 'dark'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-3.5 h-3.5 rounded-sm bg-[#0B0C0E] border border-blue-500 inline-block" />
                  <span className="text-xs font-semibold">Coal Black</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Deep coal canvas with vibrant blue accents
                </p>
              </button>

              <button
                type="button"
                onClick={() => onUpdate('theme', 'light')}
                className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  settings.theme === 'light'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-3.5 h-3.5 rounded-sm bg-[#FAF9F6] border border-[#9E9B92] inline-block" />
                  <span className="text-xs font-semibold">Milk White</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Milk white surface, soft grey accents, crisp ink
                </p>
              </button>
            </div>
          </section>

          <hr className="border-[var(--border-hairline)]" />

          {/* 2. Syntax Highlighting */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
              Syntax Highlighting
            </h3>
            <ToggleRow
              id="toggle-syntax"
              label="Enable LaTeX Syntax Highlighting"
              description="Colorize commands, math zones, environments, and comments"
              checked={settings.syntaxHighlighting}
              onChange={(v) => onUpdate('syntaxHighlighting', v)}
            />

            {settings.syntaxHighlighting && (
              <div className="space-y-1.5">
                <label
                  htmlFor="syntax-preset-select"
                  className="block text-xs font-medium text-[var(--text-primary)]"
                >
                  Syntax Color Palette
                </label>
                <select
                  id="syntax-preset-select"
                  value={settings.syntaxPreset}
                  onChange={(e) =>
                    onUpdate('syntaxPreset', e.target.value as EditorSettings['syntaxPreset'])
                  }
                  className="w-full px-3 py-2 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
                >
                  {SYNTAX_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name} — {preset.description}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>

          <hr className="border-[var(--border-hairline)]" />

          {/* 3. Editor Typography & Behavior */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
              Editor Typography &amp; Ergonomics
            </h3>

            <div className="space-y-1.5">
              <label
                htmlFor="editor-font-select"
                className="block text-xs font-medium text-[var(--text-primary)]"
              >
                Monospace Font Family
              </label>
              <select
                id="editor-font-select"
                value={settings.editorFontFamily}
                onChange={(e) =>
                  onUpdate('editorFontFamily', e.target.value as EditorFontFamily)
                }
                className="w-full px-3 py-2 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
              >
                <option value="JetBrains Mono">JetBrains Mono</option>
                <option value="IBM Plex Mono">IBM Plex Mono</option>
                <option value="Fira Code">Fira Code</option>
                <option value="Space Mono">Space Mono</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="editor-font-size">Font Size</label>
                  <span className="font-mono tabular-nums text-[var(--text-muted)]">
                    {settings.editorFontSize}px
                  </span>
                </div>
                <input
                  id="editor-font-size"
                  type="range"
                  min={11}
                  max={24}
                  step={1}
                  value={settings.editorFontSize}
                  onChange={(e) => onUpdate('editorFontSize', Number(e.target.value))}
                  className="w-full accent-[var(--accent-primary)] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="editor-line-height">Line Height</label>
                  <span className="font-mono tabular-nums text-[var(--text-muted)]">
                    {settings.editorLineHeight.toFixed(2)}
                  </span>
                </div>
                <input
                  id="editor-line-height"
                  type="range"
                  min={1.2}
                  max={2.2}
                  step={0.05}
                  value={settings.editorLineHeight}
                  onChange={(e) => onUpdate('editorLineHeight', Number(e.target.value))}
                  className="w-full accent-[var(--accent-primary)] cursor-pointer"
                />
              </div>
            </div>

            <div>
              <div className="text-xs font-medium mb-1.5">Indentation Width</div>
              <div className="grid grid-cols-3 gap-1.5">
                {[2, 4, 8].map((spaces) => (
                  <button
                    key={spaces}
                    type="button"
                    onClick={() => onUpdate('tabSize', spaces)}
                    className={`py-1.5 text-xs font-mono rounded-md border cursor-pointer transition-colors ${
                      settings.tabSize === spaces
                        ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)] border-[var(--accent-primary)]'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-hairline)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {spaces} spaces
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-[var(--border-hairline)]">
              <ToggleRow
                id="toggle-line-numbers"
                label="Line Numbers"
                checked={settings.lineNumbers}
                onChange={(v) => onUpdate('lineNumbers', v)}
              />
              <ToggleRow
                id="toggle-word-wrap"
                label="Soft Word Wrap"
                checked={settings.wordWrap}
                onChange={(v) => onUpdate('wordWrap', v)}
              />
              <ToggleRow
                id="toggle-active-line"
                label="Highlight Active Line"
                checked={settings.activeLineHighlight}
                onChange={(v) => onUpdate('activeLineHighlight', v)}
              />
              <ToggleRow
                id="toggle-bracket-match"
                label="Bracket Matching"
                checked={settings.bracketMatching}
                onChange={(v) => onUpdate('bracketMatching', v)}
              />
              <ToggleRow
                id="toggle-close-brackets"
                label="Auto-Close Braces & Delimiters"
                checked={settings.autoCloseBrackets}
                onChange={(v) => onUpdate('autoCloseBrackets', v)}
              />
              <ToggleRow
                id="toggle-ligatures"
                label="Programming Ligatures"
                checked={settings.fontLigatures}
                onChange={(v) => onUpdate('fontLigatures', v)}
              />
              <ToggleRow
                id="toggle-whitespace"
                label="Show Whitespace Characters"
                checked={settings.showWhitespace}
                onChange={(v) => onUpdate('showWhitespace', v)}
              />
            </div>
          </section>

          <hr className="border-[var(--border-hairline)]" />

          {/* 4. Live Preview & Document Styling */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
              Live Preview &amp; Paper Styling
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium mb-1.5">Paper Layout</div>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
                  {(['paginated', 'continuous'] as PaperLayout[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdate('previewLayout', mode)}
                      className={`py-1 text-xs rounded capitalize cursor-pointer ${
                        settings.previewLayout === mode
                          ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium mb-1.5">Paper Surface</div>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
                  {(
                    [
                      { id: 'match-app', label: 'Match App' },
                      { id: 'always-paper', label: 'White Sheet' },
                    ] as Array<{ id: PreviewThemeSync; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onUpdate('previewThemeSync', opt.id)}
                      className={`py-1 text-xs rounded whitespace-nowrap cursor-pointer ${
                        settings.previewThemeSync === opt.id
                          ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="preview-font-select"
                className="block text-xs font-medium text-[var(--text-primary)]"
              >
                Typeset Document Font
              </label>
              <select
                id="preview-font-select"
                value={settings.previewFontFamily}
                onChange={(e) =>
                  onUpdate('previewFontFamily', e.target.value as PreviewFontFamily)
                }
                className="w-full px-3 py-2 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
              >
                <option value="Source Serif 4">Source Serif 4 (Academic Serif)</option>
                <option value="Lora">Lora (Editorial Serif)</option>
                <option value="Plus Jakarta Sans">Plus Jakarta Sans (Modern Sans)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="preview-font-size">Typeset Size</label>
                  <span className="font-mono tabular-nums text-[var(--text-muted)]">
                    {settings.previewFontSize}px
                  </span>
                </div>
                <input
                  id="preview-font-size"
                  type="range"
                  min={12}
                  max={20}
                  step={1}
                  value={settings.previewFontSize}
                  onChange={(e) => onUpdate('previewFontSize', Number(e.target.value))}
                  className="w-full accent-[var(--accent-primary)] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="preview-zoom">Preview Zoom</label>
                  <span className="font-mono tabular-nums text-[var(--text-muted)]">
                    {settings.previewZoom}%
                  </span>
                </div>
                <input
                  id="preview-zoom"
                  type="range"
                  min={60}
                  max={150}
                  step={5}
                  value={settings.previewZoom}
                  onChange={(e) => onUpdate('previewZoom', Number(e.target.value))}
                  className="w-full accent-[var(--accent-primary)] cursor-pointer"
                />
              </div>
            </div>

            <div>
              <div className="text-xs font-medium mb-1.5">Paper Margins</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['narrow', 'standard', 'wide'] as PaperMargin[]).map((margin) => (
                  <button
                    key={margin}
                    type="button"
                    onClick={() => onUpdate('paperMargin', margin)}
                    className={`py-1.5 text-xs capitalize rounded-md border cursor-pointer ${
                      settings.paperMargin === margin
                        ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)] border-[var(--accent-primary)]'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-hairline)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {margin}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium mb-1.5">Compilation Cadence</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'instant', label: 'Instant' },
                    { id: 'debounced', label: 'Debounced' },
                    { id: 'manual', label: 'Manual' },
                  ] as Array<{ id: CompileMode; label: string }>
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onUpdate('compileMode', mode.id)}
                    className={`py-1.5 text-xs rounded-md border cursor-pointer ${
                      settings.compileMode === mode.id
                        ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-text)] border-[var(--accent-primary)]'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-hairline)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-[var(--border-hairline)]">
              <ToggleRow
                id="toggle-eq-numbering"
                label="Automatic Equation Numbering"
                checked={settings.equationNumbering}
                onChange={(v) => onUpdate('equationNumbering', v)}
              />
              <ToggleRow
                id="toggle-sync-scroll"
                label="Synchronized Editor & Preview Scroll"
                checked={settings.syncScroll}
                onChange={(v) => onUpdate('syncScroll', v)}
              />
            </div>
          </section>
        </div>

        {/* Footer Reset */}
        <div className="px-5 py-3 border-t border-[var(--border-hairline)] flex items-center justify-between">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <RotateCcw size={13} />
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] cursor-pointer"
          >
            Done
          </button>
        </div>
      </aside>
    </div>
  );
}
