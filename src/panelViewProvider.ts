import * as vscode from 'vscode';
import { getWebviewContent, WebviewData } from './webviewContent';
import { getAccentColor, getNonce, openLocation } from './providerData';

/** Must match `contributes.views.panel[0].id` in package.json. */
export const ACTION_PANEL_VIEW_ID = 'actionPanel.panelView';

/**
 * Hosts the Usages & Implementations webview docked in VS Code's bottom panel area
 * (Terminal/Problems/Output row), as an alternative to the ad-hoc `WebviewPanel` opened
 * beside the editor. Registered once in `activate()` via
 * `vscode.window.registerWebviewViewProvider` and reused for the lifetime of the window.
 *
 * A `WebviewView` resolves lazily: VS Code only calls `resolveWebviewView` the first time
 * the user actually reveals this view's tab. If the command runs before that happens, the
 * requested data is held in `pendingData` and rendered as soon as the view does resolve.
 * Once resolved, the same view instance is reused and simply re-rendered in place on every
 * subsequent invocation -- there is no "multiple panels" concern here since the view is a
 * single fixed slot in the panel area.
 */
export class ActionPanelViewProvider implements vscode.WebviewViewProvider {
	private view: vscode.WebviewView | undefined;
	private pendingData: WebviewData | undefined;

	constructor(private readonly context: vscode.ExtensionContext) {}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: []
		};

		webviewView.webview.onDidReceiveMessage(
			(message: { command: string; uri: string; line: number; character: number }) => {
				if (message.command === 'open') {
					void openLocation(message.uri, message.line, message.character);
				}
			},
			undefined,
			this.context.subscriptions
		);

		webviewView.onDidDispose(() => {
			if (this.view === webviewView) {
				this.view = undefined;
			}
		});

		if (this.pendingData) {
			this.render(this.pendingData);
			this.pendingData = undefined;
		}
	}

	/**
	 * Called by the command handler with freshly fetched data. Renders immediately if the
	 * view has already been resolved; otherwise queues it for when `resolveWebviewView` fires.
	 */
	updateData(data: WebviewData): void {
		if (this.view) {
			this.render(data);
		} else {
			this.pendingData = data;
		}
	}

	private render(data: WebviewData): void {
		if (!this.view) {
			return;
		}
		this.view.title = data.symbolName;
		this.view.webview.html = getWebviewContent(getNonce(), this.view.webview.cspSource, data, getAccentColor());
	}
}
