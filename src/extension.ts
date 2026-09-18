import * as vscode from 'vscode';
import { getWebviewContent, WebviewData } from './webviewContent';
import { fetchActionPanelData, getAccentColor, getNonce, openLocation } from './providerData';
import { ActionPanelViewProvider, ACTION_PANEL_VIEW_ID } from './panelViewProvider';

/** Reused across invocations so re-triggering the command updates the same panel instead of opening a new tab. Only used in "beside" mode. */
let currentPanel: vscode.WebviewPanel | undefined;

type OpenLocationSetting = 'beside' | 'panel';

export function activate(context: vscode.ExtensionContext): void {
	const viewProvider = new ActionPanelViewProvider(context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ACTION_PANEL_VIEW_ID, viewProvider, {
			webviewOptions: { retainContextWhenHidden: true }
		})
	);

	const disposable = vscode.commands.registerCommand('actionPanel.show', () => {
		void showActionPanel(context, viewProvider);
	});
	context.subscriptions.push(disposable);
}

export function deactivate(): void {
	// Nothing to clean up explicitly; the panel/view dispose themselves with the extension host.
}

async function showActionPanel(
	context: vscode.ExtensionContext,
	viewProvider: ActionPanelViewProvider
): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('Action Panel: no active editor.');
		return;
	}

	const document = editor.document;
	const position = editor.selection.active;

	let data: WebviewData;
	try {
		data = await fetchActionPanelData(document, position);
	} catch (err) {
		vscode.window.showErrorMessage(`Action Panel: failed to resolve usages/implementations: ${String(err)}`);
		return;
	}

	const openLocationSetting = vscode.workspace
		.getConfiguration('actionPanel')
		.get<OpenLocationSetting>('openLocation', 'beside');

	if (openLocationSetting === 'panel') {
		viewProvider.updateData(data);
		// VS Code auto-generates a `<viewId>.focus` command for every contributed view,
		// which reveals it (switching to its tab in the panel area if needed).
		await vscode.commands.executeCommand(`${ACTION_PANEL_VIEW_ID}.focus`);
		return;
	}

	showInWebviewPanel(context, data);
}

function showInWebviewPanel(context: vscode.ExtensionContext, data: WebviewData): void {
	if (currentPanel) {
		currentPanel.title = `Action Panel: ${data.symbolName}`;
		currentPanel.webview.html = renderHtml(currentPanel.webview, data);
		currentPanel.reveal(vscode.ViewColumn.Beside, true);
		return;
	}

	currentPanel = vscode.window.createWebviewPanel(
		'actionPanel',
		`Action Panel: ${data.symbolName}`,
		{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
		{
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: []
		}
	);

	currentPanel.webview.html = renderHtml(currentPanel.webview, data);

	currentPanel.webview.onDidReceiveMessage(
		(message: { command: string; uri: string; line: number; character: number }) => {
			if (message.command === 'open') {
				void openLocation(message.uri, message.line, message.character);
			}
		},
		undefined,
		context.subscriptions
	);

	currentPanel.onDidDispose(
		() => {
			currentPanel = undefined;
		},
		undefined,
		context.subscriptions
	);
}

function renderHtml(webview: vscode.Webview, data: WebviewData): string {
	return getWebviewContent(getNonce(), webview.cspSource, data, getAccentColor());
}
