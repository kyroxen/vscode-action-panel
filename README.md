# Action Panel

Shows **Usages** and **Implementations** for the symbol under the cursor side by side in a single persistent panel — the IntelliJ-style gesture VS Code's built-in `Cmd+Click`/`F12` can't be remapped to (VS Code hardwires those to "Go to Definition"; see [microsoft/vscode#100904](https://github.com/microsoft/vscode/issues/100904)).

It doesn't implement any language intelligence itself — it calls VS Code's generic `vscode.executeReferenceProvider` and `vscode.executeImplementationProvider` commands, which proxy to whatever language server is already registered for the current file (Java via Red Hat's Java extension, TypeScript, etc.).

## Usage

Put your cursor on a symbol, then trigger the command any of these ways:

- Keybinding: **`Ctrl+Alt+U`** (**`Cmd+Alt+U`** on macOS)
- Command Palette → `Action Panel: Show Usages & Implementations`
- Editor right-click context menu → `Action Panel: Show Usages & Implementations`

A panel opens with two tabs, **Usages (N)** and **Implementations (N)**, each grouped by file. Click any entry to jump there — the panel stays open so you can keep working through the list, and re-running the command on a different symbol updates the same panel/view in place instead of opening a new one.

Each entry's code preview line renders with real syntax highlighting (keywords, types, strings, etc., each in their proper color) matching your active editor theme — powered by [shiki](https://shiki.style), the same TextMate-grammar tokenizer VS Code itself is built on. This is best-effort for themes shiki doesn't ship a bundled copy of (falls back to a close dark/light approximation) and for languages/files it can't recognize (falls back to plain, unstyled text) — it never breaks the panel, worst case it just looks like plain text.

## Choosing where the view opens

By default the view opens as a webview panel **beside** the active editor (in the editor grid). You can instead dock it in the **bottom panel area**, alongside Terminal, Problems, and Output, via the setting:

- Open Settings (UI) and search for **`Action Panel: Open Location`** (setting id `actionPanel.openLocation`), or add it directly to `settings.json`:
  ```json
  "actionPanel.openLocation": "panel"
  ```
- Values:
  - `"beside"` (default) — opens in a webview panel beside the active editor, in the editor grid.
  - `"panel"` — opens in a persistent view docked in the bottom panel area, alongside Terminal, Problems, and Output. The first time you use this mode, run the command once to reveal the **Action Panel** tab at the bottom (it also appears there on its own once revealed); after that it stays available and its content updates in place on every subsequent invocation.

Switching the setting takes effect the next time you run the command — no reload needed.

## Accent color

The panel already follows your VS Code theme automatically. If you also want it to visually stand out from other panels/peek views, you can set a single accent color:

- Open Settings (UI) and search for **`Action Panel: Accent Color`** (setting id `actionPanel.accentColor`), or add it directly to `settings.json`:
  ```json
  "actionPanel.accentColor": "#ff8800"
  ```
- Default is `""` (empty) — no override, the panel uses the theme's own link/focus color exactly as before.
- Any literal CSS color works (a hex value like `#ff8800`, or `rgb(...)`/a named color) — it is applied narrowly, to the active tab's underline and label, the file headers, and a left-edge highlight when hovering/focusing an entry. Backgrounds and body text always stay on theme colors.

Like `openLocation`, this takes effect the next time you run the command — no reload needed.

## Development

```bash
npm install
```

Press **F5** in VS Code (with this folder open) to launch an Extension Development Host with the extension loaded — it runs `npm: watch` automatically first, so edits to `src/` rebuild live. Open any file whose language has a references/implementations provider (Java, TypeScript, etc.), put the cursor on a symbol, and try the command.

Useful scripts:

- `npm run watch` — esbuild in watch mode (used by the F5 launch config)
- `npm run compile` — one-off production build to `dist/extension.js`
- `npm run typecheck` — `tsc --noEmit` type checking only

## Packaging

```bash
npm run package
```

This produces a `.vsix` file in the project root. Install it in any VS Code instance via the Command Palette: **Extensions: Install from VSIX...**, then pick the generated file.
