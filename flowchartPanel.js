const vscode = require('vscode');

/**
 * Manages the webview panel for displaying flowcharts
 */
class FlowchartPanel {
    static currentPanel = undefined;
    static viewType = 'codeToFlowchart';

    static createOrShow(extensionUri, flowchartDefinition, fileName) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (FlowchartPanel.currentPanel) {
            FlowchartPanel.currentPanel._panel.reveal(column);
            FlowchartPanel.currentPanel._update(flowchartDefinition, fileName);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            FlowchartPanel.viewType,
            `Flowchart: ${fileName.split('/').pop()}`,
            column || vscode.ViewColumn.One,
            {
                // Enable JavaScript in the webview
                enableScripts: true,
                // Restrict the webview to only loading content from our extension directory
                localResourceRoots: [extensionUri]
            }
        );

        FlowchartPanel.currentPanel = new FlowchartPanel(panel, extensionUri, flowchartDefinition, fileName);
    }

    constructor(panel, extensionUri, flowchartDefinition, fileName) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._disposables = [];

        // Set the webview's initial html content
        this._update(flowchartDefinition, fileName);

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    dispose() {
        FlowchartPanel.currentPanel = undefined;
        
        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    _update(flowchartDefinition, fileName) {
        const webview = this._panel.webview;
        this._panel.title = `Flowchart: ${fileName.split('/').pop()}`;
        webview.html = this._getHtmlForWebview(webview, flowchartDefinition, fileName);
    }

    _getHtmlForWebview(webview, flowchartDefinition, fileName) {
        // Sanitize the flowchart definition
        const sanitizedFlow = flowchartDefinition.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Code Flowchart</title>
            <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                    padding: 0;
                    margin: 0;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .container {
                    padding: 20px;
                    max-width: 100%;
                    box-sizing: border-box;
                }
                .file-info {
                    margin-bottom: 20px;
                    font-size: 1.2em;
                }
                .flowchart-container {
                    overflow: auto;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 20px;
                    background-color: white; /* Changed to white background */
                }
                .controls {
                    margin-top: 20px;
                    display: flex;
                    gap: 10px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 12px;
                    cursor: pointer;
                    border-radius: 2px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                pre {
                    white-space: pre-wrap;
                    background-color: var(--vscode-textBlockQuote-background);
                    padding: 10px;
                    border-radius: 4px;
                    display: none;
                }
                /* Make text and nodes dark for better contrast on white background */
                .mermaid text {
                    fill: #333 !important;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="file-info">
                    <h2>Flowchart for: ${fileName.split('/').pop()}</h2>
                </div>
                <div class="flowchart-container">
                    <div class="mermaid">
    ${sanitizedFlow}
                    </div>
                </div>
                <div class="controls">
                    <button id="zoomIn">Zoom In</button>
                    <button id="zoomOut">Zoom Out</button>
                    <button id="reset">Reset Zoom</button>
                    <button id="exportSVG">Export SVG</button>
                    <button id="showCode">Show Mermaid Code</button>
                </div>
                <pre id="codeDisplay">${sanitizedFlow}</pre>
            </div>
            <script>
                // Initialize mermaid
                mermaid.initialize({
                    startOnLoad: true,
                    theme: 'default',
                    logLevel: 'error',
                    securityLevel: 'strict',
                    flowchart: {
                        curve: 'basis',
                        htmlLabels: true
                    },
                    themeCSS: '.node rect { fill: white; stroke: #999; } .edgeLabel { background-color: white; } .edgePath .path { stroke: #666; }'
                });
                
                // Variables for zoom control
                let currentZoom = 1;
                const zoomFactor = 0.1;
                const flowchartContainer = document.querySelector('.flowchart-container');
                const mermaidDiv = document.querySelector('.mermaid');
                
                // Add event listeners for zoom buttons
                document.getElementById('zoomIn').addEventListener('click', () => {
                    currentZoom += zoomFactor;
                    applyZoom();
                });
                
                document.getElementById('zoomOut').addEventListener('click', () => {
                    currentZoom = Math.max(0.1, currentZoom - zoomFactor);
                    applyZoom();
                });
                
                document.getElementById('reset').addEventListener('click', () => {
                    currentZoom = 1;
                    applyZoom();
                });
                
                document.getElementById('exportSVG').addEventListener('click', () => {
                    const svgElement = document.querySelector('.mermaid svg');
                    if (svgElement) {
                        const svgData = new XMLSerializer().serializeToString(svgElement);
                        const blob = new Blob([svgData], { type: 'image/svg+xml' });
                        const url = URL.createObjectURL(blob);
                        
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = '${fileName.split('/').pop().replace(/\.[^/.]+$/, '')}_flowchart.svg';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }
                });
                
                const codeDisplay = document.getElementById('codeDisplay');
                document.getElementById('showCode').addEventListener('click', () => {
                    if (codeDisplay.style.display === 'block') {
                        codeDisplay.style.display = 'none';
                        document.getElementById('showCode').textContent = 'Show Mermaid Code';
                    } else {
                        codeDisplay.style.display = 'block';
                        document.getElementById('showCode').textContent = 'Hide Mermaid Code';
                    }
                });
                
                function applyZoom() {
                    mermaidDiv.style.transform = \`scale(\${currentZoom})\`;
                    mermaidDiv.style.transformOrigin = 'top left';
                }
                
                // Initialize after mermaid renders
                window.addEventListener('load', () => {
                    // Apply initial zoom (which is 1)
                    applyZoom();
                });
            </script>
        </body>
        </html>`;
    }
}

module.exports = FlowchartPanel;