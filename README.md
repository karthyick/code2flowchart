# Code to Flowchart Extension for VS Code

This VS Code extension automatically generates mermaid flowcharts from your code files, providing visual representations of code structure and logic flow.

## Features

- **Multi-language Support**: Works with Python, C#, JavaScript, React, and Angular files
- **Interactive Flowcharts**: Zoom, pan, and export flowcharts as SVG
- **Customizable Detail Level**: Configure how detailed the generated flowcharts should be
- **One-Click Generation**: Generate flowcharts with a single command

## Supported Languages

- **Python**: Functions, classes, control flow, return statements (high detail)
- **C#**: Namespaces, classes, methods, control flow (medium detail)
- **React**: Components, hooks, state management, event handlers (low detail)
- **Angular**: Components, services, inputs/outputs, lifecycle hooks
- **JavaScript**: Functions, classes, control flow

## Usage

1. Open a code file in VS Code (Python, C#, JavaScript, React, or Angular)
2. Run the command "Generate Flowchart from Code" from the command palette (Ctrl+Shift+P)
3. A new panel will open displaying the flowchart

## Configuration

You can adjust the detail level of generated flowcharts in your VS Code settings:

- **Low**: Only show major structural elements (classes, functions)
- **Medium**: Include control flow (if statements, loops) (default)
- **High**: Include detailed elements like function calls, return statements

## Installation

1. Open VS Code
2. Go to Extensions view (Ctrl+Shift+X)
3. Search for "Code to Flowchart"
4. Click Install

## Repository Details

### Getting the Code

```bash
git clone https://github.com/yourusername/code2flowchart.git
cd code2flowchart
npm install
```

Debugging

Open the extension in VS Code
Press F5 to start debugging
In the new window, open a code file and run the "Generate Flowchart from Code" command

Known Issues

Complex nested structures may result in large flowcharts
Very large files may take longer to process

Release Notes
0.1.0

Initial release with support for Python, C#, React, Angular, and JavaScript

License
MIT