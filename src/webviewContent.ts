/**
 * Builds the HTML/CSS/JS for the Action Panel webview.
 *
 * The webview is plain HTML/CSS/JS (no framework) and receives its data as a
 * JSON payload injected directly into the page. All colors are taken from
 * VS Code's CSS custom properties so the panel matches the active theme, with
 * one optional user-configurable accent color layered on top (see `getWebviewContent`).
 */

/**
 * One syntax-highlighted token of a preview line, as produced by `syntaxHighlight.ts`
 * (shiki) from the user's actual active editor theme. `fontStyle` is a bitmask: 1=italic,
 * 2=bold, 4=underline, 8=strikethrough (matching vscode-textmate's `FontStyle` enum).
 */
export interface HighlightToken {
	text: string;
	/** 6- or 8-digit hex color from the theme, or `undefined` to inherit the default foreground. */
	color?: string;
	fontStyle: number;
}

export interface WebviewEntry {
	/** Location URI, serialized (`vscode.Uri.toString()`), used to jump back. */
	uri: string;
	/** Zero-based line number. */
	line: number;
	/** Zero-based character offset. */
	character: number;
	/** Trimmed, truncated source line text. Used verbatim if `tokens` is absent/empty. */
	preview: string;
	/** Real syntax-highlighted tokens for `preview`, when available; otherwise omitted and `preview` is rendered as plain text. */
	tokens?: HighlightToken[];
}

export interface WebviewFileGroup {
	/** Path relative to the workspace root (or absolute if outside it). */
	filePath: string;
	entries: WebviewEntry[];
}

export interface WebviewData {
	symbolName: string;
	usages: WebviewFileGroup[];
	implementations: WebviewFileGroup[];
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Accepts the value only if it's plausibly a single CSS color literal (hex, `rgb()`/`hsl()`
 * functions, or a named color) -- i.e. safe characters only, no `;`, `{`, `}`, `"`, etc.
 * This is a user-controlled local setting, not untrusted external input, but since the
 * value is interpolated directly into a `<style>` block we still don't want a typo/paste
 * accidentally closing the custom property and injecting arbitrary CSS. Returns `undefined`
 * if the value doesn't look like a plain color literal, in which case the accent override
 * is skipped entirely and the theme-following fallback is used instead.
 */
function cssColorLiteral(value: string): string | undefined {
	return /^[a-zA-Z0-9#(),.%\-\s]{1,64}$/.test(value) ? value : undefined;
}

/**
 * `accentColor` is an optional literal CSS color (e.g. `#ff8800`) coming from the
 * `actionPanel.accentColor` setting. When empty/unset, the accent falls back to the
 * theme's own link color, so the panel keeps following the active theme exactly as
 * before. Only a few, deliberately narrow spots in the CSS below reference this
 * accent (active tab, file headers, entry hover/focus) -- everything else (background,
 * body text, empty-state text) stays on plain `var(--vscode-*)` theme tokens.
 */
export function getWebviewContent(
	nonce: string,
	cspSource: string,
	data: WebviewData,
	accentColor?: string
): string {
	const usageCount = data.usages.reduce((sum, g) => sum + g.entries.length, 0);
	const implCount = data.implementations.reduce((sum, g) => sum + g.entries.length, 0);
	const title = escapeHtml(data.symbolName);
	const payload = JSON.stringify(data).replace(/</g, '\\u003c');
	const trimmedAccent = (accentColor ?? '').trim();
	const safeAccent = trimmedAccent ? cssColorLiteral(trimmedAccent) : undefined;
	const accentDeclaration = safeAccent ? `--action-panel-accent: ${safeAccent};` : '';

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Action Panel: ${title}</title>
	<style nonce="${nonce}">
		:root {
			--ap-gap: 4px;
			${accentDeclaration}
		}
		* {
			box-sizing: border-box;
		}
		html, body {
			margin: 0;
			padding: 0;
			height: 100%;
			color: var(--vscode-editor-foreground);
			background-color: var(--vscode-editor-background);
			font-family: var(--vscode-font-family, sans-serif);
			font-size: var(--vscode-font-size, 13px);
		}
		body {
			display: flex;
			flex-direction: column;
			height: 100vh;
			overflow: hidden;
		}
		.symbol-header {
			padding: 8px 12px 4px 12px;
			font-weight: 600;
			font-size: 1.05em;
			flex-shrink: 0;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		.tabs {
			display: flex;
			flex-shrink: 0;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		.tab {
			padding: 8px 14px;
			cursor: pointer;
			background-color: var(--vscode-tab-inactiveBackground);
			color: var(--vscode-tab-inactiveForeground, var(--vscode-editor-foreground));
			border: none;
			border-right: 1px solid var(--vscode-panel-border);
			outline-offset: -2px;
			font-family: inherit;
			font-size: inherit;
		}
		.tab:hover {
			background-color: var(--vscode-list-hoverBackground);
		}
		.tab.active {
			background-color: var(--vscode-tab-activeBackground);
			color: var(--action-panel-accent, var(--vscode-tab-activeForeground, var(--vscode-editor-foreground)));
			border-bottom: 2px solid var(--action-panel-accent, var(--vscode-focusBorder));
		}
		.tab:focus-visible {
			outline: 1px solid var(--vscode-focusBorder);
		}
		.search-bar {
			flex-shrink: 0;
			padding: 6px 12px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		.search-input {
			display: block;
			width: 100%;
			padding: 4px 8px;
			font-family: inherit;
			font-size: inherit;
			color: var(--vscode-input-foreground);
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
			border-radius: 2px;
		}
		.search-input::placeholder {
			color: var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground));
		}
		.search-input:focus {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: -1px;
			border-color: var(--vscode-focusBorder);
		}
		.visually-hidden {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
			white-space: nowrap;
		}
		/* Author rule, so it reliably beats the .entry{display:flex}/.file-group/.empty-state
		   rules above for elements toggled via the native hidden property/attribute --
		   otherwise those rules' own display value would win over the browser's UA-stylesheet
		   default for [hidden] and the element would stay visible despite being "hidden". */
		.entry[hidden],
		.file-group[hidden],
		.empty-state[hidden] {
			display: none !important;
		}
		.panels {
			flex: 1;
			overflow-y: auto;
			min-height: 0;
		}
		.panel {
			display: none;
			padding: 4px 0;
		}
		.panel.active {
			display: block;
		}
		.file-group {
			margin: 6px 0;
		}
		.file-header {
			padding: 4px 12px;
			font-weight: 600;
			color: var(--action-panel-accent, var(--vscode-textLink-foreground));
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.entry {
			display: flex;
			gap: 8px;
			padding: 3px 12px 3px 25px;
			cursor: pointer;
			align-items: baseline;
			border-radius: 3px;
			border-left: 3px solid transparent;
		}
		.entry:hover {
			background-color: var(--vscode-list-hoverBackground);
			border-left-color: var(--action-panel-accent, var(--vscode-focusBorder));
		}
		.entry:focus-visible {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: -1px;
			border-left-color: var(--action-panel-accent, var(--vscode-focusBorder));
		}
		/* The keyboard-navigated "current" entry -- distinct from plain :hover, and not
		   tied to the accent color (uses the theme's own list-selection tokens instead). */
		.entry.selected {
			background-color: var(--vscode-list-activeSelectionBackground);
			color: var(--vscode-list-activeSelectionForeground, var(--vscode-editor-foreground));
		}
		.entry-line {
			flex-shrink: 0;
			color: var(--vscode-descriptionForeground);
			min-width: 3.5em;
			text-align: right;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 0.95em;
		}
		.entry-preview {
			white-space: pre;
			overflow: hidden;
			text-overflow: ellipsis;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 0.95em;
		}
		.empty-state {
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100%;
			min-height: 200px;
			color: var(--vscode-descriptionForeground);
			font-style: italic;
			text-align: center;
			padding: 24px;
		}
		@media (prefers-reduced-motion: no-preference) {
			.tab {
				transition: background-color 120ms ease-out, color 120ms ease-out, border-bottom-color 120ms ease-out;
			}
			.entry {
				transition: background-color 120ms ease-out, border-left-color 120ms ease-out;
			}
		}
	</style>
</head>
<body>
	<div class="symbol-header" id="symbol-header"></div>
	<div class="tabs" role="tablist">
		<button class="tab active" id="tab-usages" role="tab" aria-selected="true" aria-controls="panel-usages" data-tab="usages">Usages (${usageCount})</button>
		<button class="tab" id="tab-implementations" role="tab" aria-selected="false" aria-controls="panel-implementations" data-tab="implementations">Implementations (${implCount})</button>
	</div>
	<div class="search-bar">
		<label class="visually-hidden" for="filter-input">Filter usages and implementations by file path or code</label>
		<input
			type="text"
			id="filter-input"
			class="search-input"
			placeholder="Filter by file or code..."
			autocomplete="off"
		/>
	</div>
	<div class="panels">
		<div class="panel active" id="panel-usages" role="tabpanel" aria-labelledby="tab-usages"></div>
		<div class="panel" id="panel-implementations" role="tabpanel" aria-labelledby="tab-implementations"></div>
	</div>

	<script nonce="${nonce}">
		(function () {
			const vscode = acquireVsCodeApi();
			/** @type {{symbolName: string, usages: Array, implementations: Array}} */
			const data = ${payload};

			document.getElementById('symbol-header').textContent = data.symbolName;

			function renderGroups(container, groups, emptyMessage) {
				container.innerHTML = '';

				// Shown/hidden later by applyFilter() when a query hides every entry in this
				// tab -- distinct from emptyMessage below, which covers "zero results at all".
				const filterEmptyEl = document.createElement('div');
				filterEmptyEl.className = 'empty-state filter-empty-state';
				filterEmptyEl.textContent = 'No matches';
				filterEmptyEl.hidden = true;
				container.appendChild(filterEmptyEl);

				if (!groups || groups.length === 0) {
					const empty = document.createElement('div');
					empty.className = 'empty-state';
					empty.textContent = emptyMessage;
					container.appendChild(empty);
					return;
				}
				for (const group of groups) {
					const groupEl = document.createElement('div');
					groupEl.className = 'file-group';

					const header = document.createElement('div');
					header.className = 'file-header';
					header.textContent = group.filePath;
					header.title = group.filePath;
					groupEl.appendChild(header);

					for (const entry of group.entries) {
						const entryEl = document.createElement('div');
						entryEl.className = 'entry';
						entryEl.tabIndex = 0;
						entryEl.setAttribute('role', 'button');
						// Precomputed once so filtering on every keystroke is a cheap substring
						// check, not a re-derivation. Matches file path OR preview text.
						entryEl.dataset.searchText = (group.filePath + ' ' + entry.preview).toLowerCase();

						const lineEl = document.createElement('span');
						lineEl.className = 'entry-line';
						lineEl.textContent = String(entry.line + 1) + ':';

						const previewEl = document.createElement('span');
						previewEl.className = 'entry-preview';
						if (entry.tokens && entry.tokens.length > 0) {
							for (const token of entry.tokens) {
								const tokenEl = document.createElement('span');
								tokenEl.textContent = token.text;
								if (token.color) {
									// Setting the CSSOM property directly (not the style attribute) is
									// exempt from the page's style-src CSP, so this needs no relaxation
									// of the nonce-only policy declared above.
									tokenEl.style.color = token.color;
								}
								if (token.fontStyle & 1) {
									tokenEl.style.fontStyle = 'italic';
								}
								if (token.fontStyle & 2) {
									tokenEl.style.fontWeight = 'bold';
								}
								if (token.fontStyle & 4) {
									tokenEl.style.textDecorationLine = 'underline';
								}
								if (token.fontStyle & 8) {
									tokenEl.style.textDecorationLine =
										(tokenEl.style.textDecorationLine ? tokenEl.style.textDecorationLine + ' ' : '') +
										'line-through';
								}
								previewEl.appendChild(tokenEl);
							}
						} else {
							previewEl.textContent = entry.preview;
						}

						entryEl.appendChild(lineEl);
						entryEl.appendChild(previewEl);

						const openEntry = () => {
							vscode.postMessage({
								command: 'open',
								uri: entry.uri,
								line: entry.line,
								character: entry.character
							});
						};
						entryEl.addEventListener('click', openEntry);
						entryEl.addEventListener('keydown', (e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								openEntry();
							}
						});
						// Keeps the "selected" visual state in sync with wherever DOM focus
						// actually is -- via click, Tab, or the arrow-key navigation below --
						// so there's a single, coherent notion of "current entry".
						entryEl.addEventListener('focus', () => {
							setSelectedEntry(entryEl, { focus: false });
						});

						groupEl.appendChild(entryEl);
					}

					container.appendChild(groupEl);
				}
			}

			renderGroups(document.getElementById('panel-usages'), data.usages, 'No usages found');
			renderGroups(document.getElementById('panel-implementations'), data.implementations, 'No implementations found');

			// -- Keyboard-navigated selection, scoped to whichever tab is active. Cleared on
			// tab switch (selection intentionally doesn't persist across tabs).
			let selectedEntry = null;

			function getActivePanel() {
				return document.querySelector('.panel.active');
			}

			function getVisibleEntries(panel) {
				return Array.prototype.filter.call(panel.querySelectorAll('.entry'), (el) => !el.hidden);
			}

			function setSelectedEntry(entryEl, options) {
				if (selectedEntry && selectedEntry !== entryEl) {
					selectedEntry.classList.remove('selected');
				}
				selectedEntry = entryEl || null;
				if (!selectedEntry) {
					return;
				}
				selectedEntry.classList.add('selected');
				if (options && options.focus) {
					selectedEntry.focus();
				}
			}

			function clearSelection() {
				if (selectedEntry) {
					selectedEntry.classList.remove('selected');
					selectedEntry = null;
				}
			}

			function moveSelection(delta) {
				const panel = getActivePanel();
				if (!panel) {
					return;
				}
				const visible = getVisibleEntries(panel);
				if (visible.length === 0) {
					clearSelection();
					return;
				}
				const currentIndex = selectedEntry ? visible.indexOf(selectedEntry) : -1;
				let nextIndex;
				if (currentIndex === -1) {
					nextIndex = delta > 0 ? 0 : visible.length - 1;
				} else {
					nextIndex = Math.min(Math.max(currentIndex + delta, 0), visible.length - 1);
				}
				setSelectedEntry(visible[nextIndex], { focus: true });
			}

			// -- Global filter box: matches file path OR preview text, case-insensitively,
			// applies to both tabs at once, and persists across tab switches (it's never
			// cleared by the tab-click handler below).
			const filterInput = document.getElementById('filter-input');

			function refreshSelectionAfterFilter() {
				if (!selectedEntry || !selectedEntry.hidden) {
					return;
				}
				const panel = getActivePanel();
				const visible = panel ? getVisibleEntries(panel) : [];
				if (visible.length > 0) {
					setSelectedEntry(visible[0], { focus: false });
				} else {
					clearSelection();
				}
			}

			function applyFilter() {
				const query = filterInput.value.trim().toLowerCase();
				['panel-usages', 'panel-implementations'].forEach((panelId) => {
					const panel = document.getElementById(panelId);
					if (!panel) {
						return;
					}
					let anyVisible = false;
					let anyEntries = false;
					panel.querySelectorAll('.file-group').forEach((groupEl) => {
						let groupHasVisible = false;
						groupEl.querySelectorAll('.entry').forEach((entryEl) => {
							anyEntries = true;
							const matches = !query || (entryEl.dataset.searchText || '').indexOf(query) !== -1;
							entryEl.hidden = !matches;
							if (matches) {
								groupHasVisible = true;
								anyVisible = true;
							}
						});
						groupEl.hidden = !groupHasVisible;
					});
					const filterEmptyEl = panel.querySelector('.filter-empty-state');
					if (filterEmptyEl) {
						filterEmptyEl.hidden = !anyEntries || anyVisible;
					}
				});
				refreshSelectionAfterFilter();
			}

			filterInput.addEventListener('input', applyFilter);

			// Arrow keys form one coherent flow whether focus is in the filter input or
			// already on an entry: always move the selection AND move real DOM focus onto
			// the newly selected entry (so repeated presses keep working the same way).
			document.addEventListener('keydown', (e) => {
				if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
					return;
				}
				const target = e.target;
				const isFilterInput = target === filterInput;
				const isEntry = target && target.classList && target.classList.contains('entry');
				if (!isFilterInput && !isEntry) {
					return;
				}
				e.preventDefault();
				moveSelection(e.key === 'ArrowDown' ? 1 : -1);
			});

			const tabs = document.querySelectorAll('.tab');
			tabs.forEach((tab) => {
				tab.addEventListener('click', () => {
					const target = tab.getAttribute('data-tab');
					tabs.forEach((t) => {
						const isActive = t === tab;
						t.classList.toggle('active', isActive);
						t.setAttribute('aria-selected', String(isActive));
					});
					document.querySelectorAll('.panel').forEach((p) => {
						p.classList.toggle('active', p.id === 'panel-' + target);
					});
					// Selection is scoped to the active tab only -- the filter query itself
					// is left untouched, it applies globally across both tabs.
					clearSelection();
				});
			});
			// Deliberately no autofocus on the filter input: focus stays wherever VS Code
			// put it (matching preserveFocus: true on both webview creation paths, which
			// keeps the code editor focused) until the user clicks/tabs into the input
			// themselves, same as any other input on the page.
		})();
	</script>
</body>
</html>`;
}
