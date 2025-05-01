const vscode = require('vscode');
const parsers = require('./parsers');
const FlowchartPanel = require('./flowchartPanel');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Code to Flowchart extension is now active');

    let disposable = vscode.commands.registerCommand('code-to-flowchart.generateFlowchart', async function () {
        // Get the active text editor
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showInformationMessage('No code file is open');
            return;
        }

        const document = editor.document;
        const fileName = document.fileName;
        const fileContent = document.getText();
        const fileExtension = fileName.split('.').pop().toLowerCase();
        
        // Determine the language based on file extension
        let language;
        switch (fileExtension) {
            case 'py':
                language = 'python';
                break;
            case 'cs':
                language = 'csharp';
                break;
            case 'js':
            case 'jsx':
            case 'ts':
            case 'tsx':
                if (fileContent.includes('React') || fileContent.includes('react') || 
                    fileContent.includes('jsx') || fileExtension === 'jsx' || fileExtension === 'tsx') {
                    language = 'react';
                } else if (fileContent.includes('Angular') || fileContent.includes('angular') || 
                          fileContent.includes('@Component')) {
                    language = 'angular';
                } else {
                    language = 'javascript';
                }
                break;
            default:
                vscode.window.showInformationMessage('Unsupported file type. Supported languages: Python, C#, React, Angular');
                return;
        }
        
        try {
            // Parse the code according to its language
            const flowchartDefinition = parsers.parseCode(fileContent, language);
            
            // Create and show the flowchart panel
            FlowchartPanel.createOrShow(context.extensionUri, flowchartDefinition, fileName);
        } catch (error) {
            vscode.window.showErrorMessage(`Error generating flowchart: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};