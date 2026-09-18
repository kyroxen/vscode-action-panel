import * as vscode from 'vscode';
import { HighlightToken, WebviewData, WebviewEntry, WebviewFileGroup } from './webviewContent';
import { highlightLine, resolveShikiThemeId } from './syntaxHighlight';

const MAX_PREVIEW_LENGTH = 120;

/**
 * Resolves the symbol under `position` plus its usages and implementations, grouped by
 * file. Shared by both display destinations (the `WebviewPanel` opened beside the editor
 * and the `WebviewView` docked in the bottom panel) so the fetching/grouping logic is
 * never duplicated.
 */
export async function fetchActionPanelData(
	document: vscode.TextDocument,
	position: vscode.Position
): Promise<WebviewData> {
	const wordRange = document.getWordRangeAtPosition(position);
	const symbolName = wordRange ? document.getText(wordRange) : 'Symbol';

	const [usagesResult, implementationsResult] = await Promise.all([
		vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
			'vscode.executeReferenceProvider',
			document.uri,
			position
		),
		vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
			'vscode.executeImplementationProvider',
			document.uri,
			position
		)
	]);

	const usageLocations = normalizeLocations(usagesResult);
	const implementationLocations = normalizeLocations(implementationsResult);

	// Resolved once per render (matches the "picked up on next render" pattern already used
	// for `actionPanel.accentColor`/`openLocation` -- no theme-change listener needed) and
	// shared by both tabs so usages/implementations always highlight against the same theme.
	const themeId = resolveShikiThemeId();

	const [usages, implementations] = await Promise.all([
		buildFileGroups(usageLocations, themeId),
		buildFileGroups(implementationLocations, themeId)
	]);

	return { symbolName, usages, implementations };
}

/** `vscode.executeReferenceProvider`/`executeImplementationProvider` can return `Location` or `LocationLink` depending on provider. */
function normalizeLocations(
	results: Array<vscode.Location | vscode.LocationLink> | undefined
): vscode.Location[] {
	if (!results) {
		return [];
	}
	return results.map((item) => {
		if (item instanceof vscode.Location) {
			return item;
		}
		const link = item as vscode.LocationLink;
		return new vscode.Location(link.targetUri, link.targetSelectionRange ?? link.targetRange);
	});
}

async function buildFileGroups(locations: vscode.Location[], themeId: string): Promise<WebviewFileGroup[]> {
	const byFile = new Map<string, vscode.Location[]>();
	for (const location of locations) {
		const key = location.uri.toString();
		const list = byFile.get(key);
		if (list) {
			list.push(location);
		} else {
			byFile.set(key, [location]);
		}
	}

	const groups: WebviewFileGroup[] = [];
	for (const [uriString, fileLocations] of byFile) {
		const uri = fileLocations[0].uri;
		fileLocations.sort((a, b) => a.range.start.line - b.range.start.line);

		let textDocument: vscode.TextDocument | undefined;
		try {
			textDocument = await vscode.workspace.openTextDocument(uri);
		} catch {
			textDocument = undefined;
		}

		const entries: WebviewEntry[] = await Promise.all(
			fileLocations.map(async (location): Promise<WebviewEntry> => {
				const line = location.range.start.line;
				const character = location.range.start.character;
				let preview = '';
				let tokens: HighlightToken[] | undefined;

				if (textDocument && line < textDocument.lineCount) {
					const rawLine = textDocument.lineAt(line).text.trim();
					preview = rawLine.length > MAX_PREVIEW_LENGTH ? rawLine.slice(0, MAX_PREVIEW_LENGTH) + '…' : rawLine;

					// Best-effort real syntax highlighting (shiki, tokenized against the resolved
					// theme). `highlightLine` never throws -- it resolves to `undefined` for any
					// failure (unsupported language, grammar/theme load failure, etc.), in which
					// case `tokens` stays unset and the webview falls back to plain `preview` text.
					const highlighted = await highlightLine(rawLine, textDocument.languageId, themeId);
					if (highlighted && highlighted.length > 0) {
						tokens = truncateTokens(highlighted, MAX_PREVIEW_LENGTH);
					}
				}

				return { uri: uriString, line, character, preview, tokens };
			})
		);

		groups.push({ filePath: vscode.workspace.asRelativePath(uri, false), entries });
	}

	groups.sort((a, b) => a.filePath.localeCompare(b.filePath));
	return groups;
}

/**
 * Caps the combined text length of a token list at `maxLength`, truncating (never
 * splitting a token's color across a cut) and appending a plain `…` marker if anything
 * was cut -- mirrors the plain-text truncation behavior this replaces.
 */
function truncateTokens(tokens: HighlightToken[], maxLength: number): HighlightToken[] {
	const totalLength = tokens.reduce((sum, token) => sum + token.text.length, 0);
	if (totalLength <= maxLength) {
		return tokens;
	}

	const result: HighlightToken[] = [];
	let consumed = 0;
	for (const token of tokens) {
		const remaining = maxLength - consumed;
		if (remaining <= 0) {
			break;
		}
		if (token.text.length <= remaining) {
			result.push(token);
			consumed += token.text.length;
		} else {
			result.push({ ...token, text: token.text.slice(0, remaining) });
			consumed = maxLength;
			break;
		}
	}
	result.push({ text: '…', fontStyle: 0 });
	return result;
}

/** Jumps to a location reported by the webview, without closing/hiding whichever panel or view sent the message. */
export async function openLocation(uriString: string, line: number, character: number): Promise<void> {
	const uri = vscode.Uri.parse(uriString);
	const position = new vscode.Position(line, character);
	const range = new vscode.Range(position, position);
	await vscode.window.showTextDocument(uri, {
		selection: range,
		viewColumn: vscode.ViewColumn.One,
		preserveFocus: false,
		preview: false
	});
}

/** Reads the `actionPanel.accentColor` setting live (called fresh on every render). */
export function getAccentColor(): string {
	return vscode.workspace.getConfiguration('actionPanel').get<string>('accentColor', '');
}

export function getNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let text = '';
	for (let i = 0; i < 32; i++) {
		text += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return text;
}
