import * as vscode from 'vscode';
// Type-only import: erased at compile time, so this doesn't force a `require('shiki')` at
// module load. `shiki` ships ESM-only (its package.json `main`/`exports` all point at
// `.mjs` files) while this extension bundles to a single CommonJS file for the VS Code
// extension host, so the actual module is loaded lazily via `await import('shiki')` inside
// `getHighlighter()` below -- never a static top-level `import`/`require`.
import type { BundledLanguage, BundledTheme, Highlighter } from 'shiki';
import type { HighlightToken } from './webviewContent';

/**
 * TextMate/vscode-textmate `FontStyle` bit flags, hardcoded rather than imported: it's
 * declared as a `const enum` in `@shikijs/vscode-textmate`, which isolatedModules-style
 * bundling can't safely import across module boundaries at runtime. These values are
 * stable and documented (vscode-textmate's `FontStyle` enum).
 */
const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;
const FONT_STYLE_STRIKETHROUGH = 8;
export { FONT_STYLE_ITALIC, FONT_STYLE_BOLD, FONT_STYLE_UNDERLINE, FONT_STYLE_STRIKETHROUGH };

/**
 * Maps a VS Code theme *display name* (the value of the `workbench.colorTheme` setting,
 * e.g. "Default Dark Modern", "One Dark Pro", "GitHub Dark Default") to one of shiki's
 * bundled theme ids. Shiki ships its own copies of many popular built-in and marketplace
 * VS Code themes (see `bundledThemes` in `shiki`) -- this table covers the common ones.
 * Anything not listed here falls back to `resolveFallbackThemeId` based on light/dark kind,
 * which is a reasonable approximation but won't match a custom/obscure theme exactly.
 * Keys are lowercased for case-insensitive matching.
 */
const THEME_NAME_TO_SHIKI_ID: Record<string, string> = {
	// VS Code built-in themes (no exact shiki equivalent for the newer "Modern" themes,
	// so they map to shiki's classic dark-plus/light-plus, which are visually close).
	'default dark modern': 'dark-plus',
	'dark modern': 'dark-plus',
	'dark+ (default dark)': 'dark-plus',
	'default dark+': 'dark-plus',
	'default light modern': 'light-plus',
	'light modern': 'light-plus',
	'light+ (default light)': 'light-plus',
	'default light+': 'light-plus',
	'visual studio dark': 'dark-plus',
	'visual studio light': 'light-plus',
	'quiet light': 'light-plus',
	abyss: 'dark-plus',
	'kimbie dark': 'dark-plus',
	'tomorrow night blue': 'dark-plus',
	'solarized dark': 'solarized-dark',
	'solarized light': 'solarized-light',
	monokai: 'monokai',
	'monokai dimmed': 'monokai',
	red: 'red',
	// Popular marketplace themes shiki ships matching/near-matching copies of.
	'one dark pro': 'one-dark-pro',
	'one light': 'one-light',
	dracula: 'dracula',
	'dracula theme': 'dracula',
	'dracula official': 'dracula',
	'dracula soft': 'dracula-soft',
	'night owl': 'night-owl',
	'night owl light': 'night-owl-light',
	nord: 'nord',
	'github dark default': 'github-dark-default',
	'github dark': 'github-dark',
	'github dark dimmed': 'github-dark-dimmed',
	'github dark high contrast': 'github-dark-high-contrast',
	'github light default': 'github-light-default',
	'github light': 'github-light',
	'github light high contrast': 'github-light-high-contrast',
	'catppuccin frappé': 'catppuccin-frappe',
	'catppuccin frappe': 'catppuccin-frappe',
	'catppuccin latte': 'catppuccin-latte',
	'catppuccin macchiato': 'catppuccin-macchiato',
	'catppuccin mocha': 'catppuccin-mocha',
	'ayu dark': 'ayu-dark',
	'ayu light': 'ayu-light',
	'ayu mirage': 'ayu-mirage',
	'gruvbox dark hard': 'gruvbox-dark-hard',
	'gruvbox dark medium': 'gruvbox-dark-medium',
	'gruvbox dark soft': 'gruvbox-dark-soft',
	'gruvbox light hard': 'gruvbox-light-hard',
	'gruvbox light medium': 'gruvbox-light-medium',
	'gruvbox light soft': 'gruvbox-light-soft',
	'material theme': 'material-theme',
	'material theme darker': 'material-theme-darker',
	'material theme lighter': 'material-theme-lighter',
	'material theme ocean': 'material-theme-ocean',
	'material theme palenight': 'material-theme-palenight',
	'everforest dark': 'everforest-dark',
	'everforest light': 'everforest-light',
	'kanagawa wave': 'kanagawa-wave',
	'kanagawa dragon': 'kanagawa-dragon',
	'kanagawa lotus': 'kanagawa-lotus',
	'rosé pine': 'rose-pine',
	'rose pine': 'rose-pine',
	'rosé pine moon': 'rose-pine-moon',
	'rose pine moon': 'rose-pine-moon',
	'rosé pine dawn': 'rose-pine-dawn',
	'rose pine dawn': 'rose-pine-dawn',
	'slack dark': 'slack-dark',
	'slack ochin': 'slack-ochin',
	'snazzy light': 'snazzy-light',
	"synthwave '84": 'synthwave-84',
	'synthwave 84': 'synthwave-84',
	'tokyo night': 'tokyo-night',
	vesper: 'vesper',
	'vitesse dark': 'vitesse-dark',
	'vitesse light': 'vitesse-light',
	'vitesse black': 'vitesse-black',
	poimandres: 'poimandres',
	horizon: 'horizon',
	'horizon bright': 'horizon-bright',
	laserwave: 'laserwave',
	houston: 'houston',
	'min dark': 'min-dark',
	'min light': 'min-light',
	plastic: 'plastic',
	'aurora x': 'aurora-x',
	andromeeda: 'andromeeda'
};

/** The few VS Code `languageId`s that don't already match a shiki bundled language id 1:1. */
const LANGUAGE_ID_OVERRIDES: Record<string, string> = {
	typescriptreact: 'tsx',
	javascriptreact: 'jsx',
	jade: 'pug'
};

function resolveFallbackThemeId(kind: vscode.ColorThemeKind): string {
	switch (kind) {
		case vscode.ColorThemeKind.Light:
		case vscode.ColorThemeKind.HighContrastLight:
			return 'light-plus';
		case vscode.ColorThemeKind.Dark:
		case vscode.ColorThemeKind.HighContrast:
		default:
			return 'dark-plus';
	}
}

/**
 * Resolves the active VS Code theme to a shiki bundled theme id. Reads the setting fresh
 * every call (cheap, and matches the "no config-change listener, picked up on next render"
 * pattern already used for `actionPanel.accentColor`/`openLocation`).
 */
export function resolveShikiThemeId(): string {
	const themeName = vscode.workspace.getConfiguration().get<string>('workbench.colorTheme') ?? '';
	const mapped = THEME_NAME_TO_SHIKI_ID[themeName.trim().toLowerCase()];
	return mapped ?? resolveFallbackThemeId(vscode.window.activeColorTheme.kind);
}

/** Maps a VS Code `TextDocument.languageId` to the id shiki expects (usually identical). */
function resolveShikiLanguageId(vscodeLanguageId: string): string {
	return LANGUAGE_ID_OVERRIDES[vscodeLanguageId] ?? vscodeLanguageId;
}

type ShikiModule = typeof import('shiki');
type CachedHighlighter = { themeId: string; promise: Promise<Highlighter> };

let shikiModulePromise: Promise<ShikiModule> | undefined;
let cachedHighlighter: CachedHighlighter | undefined;

function loadShiki(): Promise<ShikiModule> {
	if (!shikiModulePromise) {
		shikiModulePromise = import('shiki');
	}
	return shikiModulePromise;
}

/**
 * One highlighter instance per resolved theme id, created lazily and reused. Recreated only
 * if the resolved theme id changes between renders (i.e. the user switched their VS Code
 * theme). `themeId` is a runtime-resolved string (from user settings/our name map), not a
 * compile-time-known literal, so it's cast to shiki's `BundledTheme` union at this one
 * boundary -- an invalid id simply makes `createHighlighter` reject, which `highlightLine`'s
 * try/catch below turns into a graceful "no highlighting" fallback.
 */
async function getHighlighter(themeId: string): Promise<Highlighter> {
	if (cachedHighlighter && cachedHighlighter.themeId === themeId) {
		return cachedHighlighter.promise;
	}
	const promise = (async () => {
		const shiki = await loadShiki();
		return shiki.createHighlighter({
			themes: [themeId as BundledTheme],
			langs: [],
			engine: shiki.createJavaScriptRegexEngine()
		});
	})();
	cachedHighlighter = { themeId, promise };
	return promise;
}

/**
 * Tokenizes a single line of source text with real TextMate grammar + theme colors,
 * matching the user's actual active editor theme. Returns `undefined` on ANY failure
 * (unsupported/unrecognized language, grammar load failure, shiki init failure, unexpected
 * API shape) so callers can fall back to today's plain-text preview rendering -- this is a
 * visual enhancement and must never be able to break the panel.
 */
export async function highlightLine(
	text: string,
	vscodeLanguageId: string,
	themeId: string
): Promise<HighlightToken[] | undefined> {
	if (!text) {
		return undefined;
	}
	try {
		const langId = resolveShikiLanguageId(vscodeLanguageId) as BundledLanguage;
		const highlighter = await getHighlighter(themeId);
		if (!highlighter.getLoadedLanguages().includes(langId)) {
			await highlighter.loadLanguage(langId);
		}
		const lines = highlighter.codeToTokensBase(text, { lang: langId, theme: themeId as BundledTheme });
		const line = lines[0];
		if (!line || line.length === 0) {
			return undefined;
		}
		return line.map((token) => ({
			text: token.content,
			color: token.color,
			fontStyle: token.fontStyle ?? 0
		}));
	} catch {
		return undefined;
	}
}
