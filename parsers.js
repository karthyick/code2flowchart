const vscode = require('vscode');

/**
 * Main parser function that calls the appropriate language-specific parser
 * @param {string} code - The code to parse
 * @param {string} language - The programming language
 * @returns {string} - Mermaid flowchart definition
 */
function parseCode(code, language) {
    switch (language) {
        case 'python':
            return parsePython(code);
        case 'csharp':
            return parseCSharp(code);
        case 'react':
            return parseReact(code);
        case 'angular':
            return parseAngular(code);
        case 'javascript':
            return parseJavaScript(code);
        default:
            throw new Error(`Unsupported language: ${language}`);
    }
}

/**
 * Helper function to find the closing brace for a code block
 * @param {string} code - The code starting from the opening brace
 * @returns {number} - Index of the closing brace or -1 if not found
 */
function findClosingBrace(code) {
    let braceCount = 0;
    let inString = false;
    let inComment = false;
    let inLineComment = false;
    
    for (let i = 0; i < code.length; i++) {
        // Skip comments
        if (inLineComment) {
            if (code[i] === '\n') {
                inLineComment = false;
            }
            continue;
        }
        
        if (inComment) {
            if (code[i] === '*' && code[i+1] === '/') {
                inComment = false;
                i++;
            }
            continue;
        }
        
        // Check for comment starts
        if (!inString) {
            if (code[i] === '/' && code[i+1] === '/') {
                inLineComment = true;
                i++;
                continue;
            }
            
            if (code[i] === '/' && code[i+1] === '*') {
                inComment = true;
                i++;
                continue;
            }
        }
        
        // Handle strings
        if (code[i] === '"' && (i === 0 || code[i-1] !== '\\')) {
            inString = !inString;
            continue;
        }
        
        if (!inString) {
            if (code[i] === '{') {
                braceCount++;
            } else if (code[i] === '}') {
                braceCount--;
                if (braceCount === 0) {
                    return i;
                }
            }
        }
    }
    
    return -1;
}

/**
 * Parses Python code and generates Mermaid flowchart syntax.
 *
 * @param {string} code The Python code to parse.
 * @param {('low' | 'medium' | 'high')} [detailLevel='medium'] The level of detail ('low', 'medium', 'high').
 * @returns {string} Mermaid flowchart syntax.
 */
function parsePython(code, detailLevel = 'medium') {
    // Initialize flowchart string and data structures
    let flowchart = 'flowchart TD\n';
    const lines = code.split('\n');
    const nodes = [];          // Array to hold Mermaid node definition strings
    const connections = [];    // Array to hold Mermaid connection strings
    let nodeId = 0;            // Counter for generating unique node IDs
    let parentNodes = [];      // Stack to keep track of parent nodes based on indentation
                               // Stack item: { id: string, indent: number, type: string, lastDirectChildId?: string }
    const nodeMap = new Map(); // Map node ID to its details for richer connection logic if needed

    // --- Helper Function: Safely create Mermaid node labels ---
    function createSafeLabel(text, maxLength = 35) {
        if (!text) return '';
        let safeText = text.trim();
        safeText = safeText.length > maxLength ? safeText.substring(0, maxLength - 3) + '...' : safeText;

        // Escape characters critical for Mermaid syntax
        safeText = safeText
            .replace(/"/g, '#quot;')    // Escape double quotes
            .replace(/\{/g, '#lbrace;') // Escape opening brace
            .replace(/\}/g, '#rbrace;') // Escape closing brace
            // Optionally escape others if they cause issues, but prefer readability
            // .replace(/</g, '#lt;')
            // .replace(/>/g, '#gt;')
            // .replace(/\[/g, '#lsqb;')
            // .replace(/\]/g, '#rsqb;')
            // .replace(/\(/g, '#lpar;')
            // .replace(/\)/g, '#rpar;')
            // .replace(/\|/g, '#vert;') // Pipe can break table syntax if used later
            ;
        return safeText;
    }

    // --- Regular Expressions for Python Constructs ---
    // Improved regex patterns (still not a full parser)
    const commentRegex = /^\s*#/;
    const multiLineStringStartRegex = /^\s*("""|''')/; // Matches start of multi-line string
    const multiLineStringEndRegex = /("""|''')$/;   // Matches end of multi-line string
    let inMultiLineString = false;                  // Flag to track if inside a multi-line string

    // Function Definition: Handles async def as well
    const defRegex = /^\s*(async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)\s*:/;
    // Class Definition: Handles inheritance
    const classRegex = /^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\((.*?)\))?\s*:/;
    // Control Flow: if, elif, for, while, try, except, finally, with, async with, match, case
    const controlRegex = /^\s*(if|elif|for|while|try|except|finally|else|with|async\s+with|match|case)\b(.*?)?\s*:/;
    // Standalone else/finally/except need slight adjustment if no condition part exists
    const elseFinallyRegex = /^\s*(else|finally|except)\s*:/;
     // Return Statement
    const returnRegex = /^\s*return\b(.*)/;
    // Special Case: if __name__ == "__main__":
    const mainCheckRegex = /^\s*if\s+__name__\s*==\s*("|')__main__\1\s*:/;
    // Yield Statement (relevant for generators)
    const yieldRegex = /^\s*yield\b(.*)/;


    // --- Process Each Line ---
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // 1. Skip Empty Lines and Comments
        if (!trimmedLine) continue; // Skip empty lines

        // Handle Multi-line String State
        if (inMultiLineString) {
            if (multiLineStringEndRegex.test(trimmedLine)) {
                inMultiLineString = false; // Exited multi-line string
            }
            continue; // Skip lines inside multi-line strings
        }
        // Check for start of multi-line string *unless* it also ends on the same line
        if (multiLineStringStartRegex.test(trimmedLine)) {
             const startMatch = trimmedLine.match(multiLineStringStartRegex);
             const quoteStyle = startMatch[1]; // """ or '''
             const endRegex = new RegExp(quoteStyle.replace(/(\"|\')/g, '\\$1') + '$'); // Dynamic end regex based on start quotes
             if (!trimmedLine.endsWith(quoteStyle) || trimmedLine.indexOf(quoteStyle) === trimmedLine.lastIndexOf(quoteStyle)) { // Check if it's not just start==end
                 inMultiLineString = true;
                 continue; // Skip this line as it starts the multi-line string
             }
        }
        // Skip Single Line Comments after checking for strings
        if (commentRegex.test(trimmedLine)) continue;

        // 2. Calculate Indentation
        const indentMatch = line.match(/^(\s*)/);
        const currentIndent = indentMatch ? indentMatch[1].length : 0;

        // 3. Adjust Parent Scope Based on Indentation
        let currentParent = parentNodes.length > 0 ? parentNodes[parentNodes.length - 1] : null;
        // Pop nodes off the stack until the parent's indent is less than the current line's indent
        while (currentParent && currentParent.indent >= currentIndent) {
            parentNodes.pop();
            currentParent = parentNodes.length > 0 ? parentNodes[parentNodes.length - 1] : null;
        }

        // 4. Identify Node Type and Create Node Definition
        let newNodeId = null;
        let newNodeType = null;
        let nodeLabel = '';
        let nodeShape = '["#content#"]'; // Default rectangle
        let isBlockStarter = trimmedLine.endsWith(':'); // Heuristic: does this line start a new block?
        let match;

        if ((match = trimmedLine.match(mainCheckRegex))) {
            newNodeId = `mainchk${nodeId++}`;
            newNodeType = 'main_check';
            nodeLabel = 'if __name__ == \\"__main__\\"';
            nodeShape = '{{"#content#"}}'; // Diamond shape
        } else if ((match = trimmedLine.match(defRegex))) {
            newNodeId = `func${nodeId++}`;
            newNodeType = 'function';
            const asyncKeyword = match[1] ? 'async ' : '';
            nodeLabel = `${asyncKeyword}Function: ${match[2]}(${createSafeLabel(match[3])})`;
        } else if ((match = trimmedLine.match(classRegex))) {
            newNodeId = `class${nodeId++}`;
            newNodeType = 'class';
            nodeLabel = `Class: ${match[1]}${match[2] ? `(${createSafeLabel(match[2])})` : ''}`;
        } else if ((match = trimmedLine.match(controlRegex)) || (match = trimmedLine.match(elseFinallyRegex))) {
             // Handle control flow keywords (if, for, while, else, etc.)
            newNodeId = `ctrl${nodeId++}`;
            newNodeType = 'control';
            const controlType = match[1];
            const condition = match[2] ? match[2].trim() : ''; // Condition might be undefined for else/finally

            nodeLabel = controlType;
            if (condition) {
                nodeLabel += ` ${createSafeLabel(condition)}`;
            }

            // Choose shape based on control type
            if (['if', 'elif', 'while', 'for', 'case'].includes(controlType)) {
                nodeShape = '{{"#content#"}}'; // Diamond for conditions/loops
            } else if (['try', 'except', 'finally', 'else', 'with', 'async with', 'match'].includes(controlType)) {
                nodeShape = '["#content#"]'; // Rectangle for blocks
            }
            // Ensure isBlockStarter is true for these even if regex didn't capture ':' (like bare except:)
            isBlockStarter = true;

        } else if (detailLevel !== 'low' && (match = trimmedLine.match(returnRegex))) {
            newNodeId = `ret${nodeId++}`;
            newNodeType = 'return';
            nodeLabel = `Return: ${createSafeLabel(match[1])}`;
            nodeShape = '(["#content#"])'; // Stadium shape
            isBlockStarter = false;
        } else if (detailLevel !== 'low' && (match = trimmedLine.match(yieldRegex))) {
             newNodeId = `yield${nodeId++}`;
             newNodeType = 'yield';
             nodeLabel = `Yield: ${createSafeLabel(match[1])}`;
             nodeShape = '(["#content#"])'; // Stadium shape
             isBlockStarter = false;
        } else if (detailLevel === 'high' && !isBlockStarter) {
             // Generic statement node for high detail, only if not starting a block
             // Avoid creating statement nodes for lines like `else:` which are handled by controlRegex
             newNodeId = `stmt${nodeId++}`;
             newNodeType = 'statement';
             nodeLabel = createSafeLabel(trimmedLine, 40); // Show statement content
             isBlockStarter = false; // Statements don't start blocks
        }

        // 5. Add Node and Connections if a Node was Identified
        if (newNodeId) {
            const nodeDefinition = `${newNodeId}${nodeShape.replace('#content#', nodeLabel)}`;
            nodes.push(nodeDefinition);
            const newNodeData = { id: newNodeId, indent: currentIndent, type: newNodeType };
            nodeMap.set(newNodeId, newNodeData);

            // Connect to the parent scope or the last node in the same scope
            if (currentParent) {
                // Check if there was a previous direct child of this parent
                if (currentParent.lastDirectChildId) {
                    // Connect sequentially within the same block
                    connections.push(`${currentParent.lastDirectChildId} --> ${newNodeId}`);
                } else {
                    // First child of this parent block
                    connections.push(`${currentParent.id} --> ${newNodeId}`);
                }
                // Update the last direct child of this parent
                currentParent.lastDirectChildId = newNodeId;
            } else {
                 // This is a top-level node (indent 0 or less than any parent)
                 // Find the absolute last node added *at the same top level*
                 const lastTopLevelNode = Array.from(nodeMap.values())
                     .filter(n => n.indent === currentIndent && n.id !== newNodeId) // Same indent level
                     .pop(); // Get the last one added
                 if (lastTopLevelNode) {
                     // Check if the last node was a block starter; avoid connecting *into* a finished block sequentially
                     const lastNodeEndsBlock = lines[lines.findIndex(l => l.includes(lastTopLevelNode.id))]?.trim().endsWith(':'); // Rough check
                     // Only connect sequentially if the previous node wasn't a block starter or this isn't a block starter
                     // This logic is tricky and might need refinement
                      connections.push(`${lastTopLevelNode.id} --> ${newNodeId}`);

                 }
             }


            // 6. Update Parent Stack if Node Starts a New Block
            if (isBlockStarter) {
                parentNodes.push({ ...newNodeData, lastDirectChildId: null }); // Add to stack, reset last child
            }
        }
    }

    // --- Combine and Return ---
    flowchart += nodes.join('\n') + '\n\n'; // Add nodes
    flowchart += connections.join('\n') + '\n'; // Add connections

    return flowchart;
}

/**
 * Sanitize text for use in Mermaid flowchart
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeForMermaid(text) {
    if (!text) return '';
    
    // Limit length for better visualization
    if (text.length > 30) {
        text = text.substring(0, 27) + '...';
    }
    
    // Handle special Python identifiers
    text = text.replace(/__([a-zA-Z0-9_]+)__/g, '__$1__');
    
    // Replace problematic characters for mermaid
    text = text.replace(/"/g, '\\"')       // Escape double quotes
             .replace(/</g, '&lt;')        // Replace < with HTML entity
             .replace(/>/g, '&gt;')        // Replace > with HTML entity
             .replace(/\{/g, '\\{')        // Escape curly braces
             .replace(/\}/g, '\\}')        // Escape curly braces
             .replace(/\|/g, '\\|');       // Escape pipe characters
    
    return text;
}
/**
 * Sanitize text for use in Mermaid flowchart
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeForMermaid(text) {
    if (!text) return '';
    
    // Limit length for better visualization
    if (text.length > 30) {
        text = text.substring(0, 27) + '...';
    }
    
    // Handle special Python identifiers
    text = text.replace(/__([a-zA-Z0-9_]+)__/g, '__$1__');
    
    // Replace problematic characters for mermaid
    text = text.replace(/"/g, '\\"')       // Escape double quotes
             .replace(/</g, '&lt;')        // Replace < with HTML entity
             .replace(/>/g, '&gt;')        // Replace > with HTML entity
             .replace(/\{/g, '\\{')        // Escape curly braces
             .replace(/\}/g, '\\}')        // Escape curly braces
             .replace(/\|/g, '\\|');       // Escape pipe characters
    
    return text;
}

/**
 * Parse C# code and generate a flowchart
 * @param {string} code - C# code
 * @returns {string} - Mermaid flowchart definition
 */
function parseCSharp(code) {
    // Get the detail level from configuration
    const config = vscode.workspace.getConfiguration('codeToFlowchart');
    const detailLevel = config.get('detailLevel') || 'medium';
    
    // Initialize flowchart
    let flowchart = 'flowchart TD\n';
    
    // Track namespaces, classes, methods and control structures
    const namespaces = [];
    const classes = [];
    const methods = [];
    const controlFlows = [];
    const connections = [];
    
    // Node counter for unique IDs
    let nodeId = 0;
    
    // Track current namespace
    let currentNamespaceId = null;
    
    // Process namespace declarations
    const namespaceMatches = code.match(/namespace\s+([a-zA-Z0-9_.]+)\s*{/g);
    if (namespaceMatches) {
        for (const match of namespaceMatches) {
            const namespaceName = match.replace(/namespace\s+/, '').replace(/\s*{/, '');
            const namespaceId = `namespace${nodeId++}`;
            namespaces.push(`${namespaceId}["Namespace: ${namespaceName}"]`);
            currentNamespaceId = namespaceId;
        }
    }
    
    // Process class declarations
    const classMatches = code.match(/(?:public|private|internal|protected)?\s*(?:static|abstract|sealed)?\s*class\s+([a-zA-Z0-9_]+)(?:\s*:\s*([^{]*))?/g);
    if (classMatches) {
        for (const match of classMatches) {
            // Extract class name and inheritance
            const classNameMatch = match.match(/class\s+([a-zA-Z0-9_]+)/);
            if (classNameMatch) {
                const className = classNameMatch[1];
                const inheritanceMatch = match.match(/:\s*([^{]*)/);
                const inheritance = inheritanceMatch ? inheritanceMatch[1].trim() : '';
                
                const classId = `class${nodeId++}`;
                classes.push(`${classId}["Class: ${className}${inheritance ? ` : ${inheritance}` : ''}"]`);
                
                // Connect namespace to class if namespaces exist
                if (currentNamespaceId) {
                    connections.push(`${currentNamespaceId} --> ${classId}`);
                }
                
                // Process method declarations within this class
                const methodRegex = new RegExp(`(?:public|private|internal|protected)?\\s*(?:static|virtual|abstract|override)?\\s*(?:[a-zA-Z0-9_<>\\[\\]]+)\\s+([a-zA-Z0-9_]+)\\s*\\(([^)]*)\\)\\s*(?:{|=>)`, 'g');
                const methodMatches = code.match(methodRegex);
                
                if (methodMatches) {
                    for (const methodMatch of methodMatches) {
                        const methodNameMatch = methodMatch.match(/([a-zA-Z0-9_]+)\s*\(/);
                        if (methodNameMatch) {
                            const methodName = methodNameMatch[1];
                            
                            // Skip constructors (same name as class)
                            if (methodName === className) continue;
                            
                            // Extract parameters
                            const paramsMatch = methodMatch.match(/\((.*?)\)/);
                            const params = paramsMatch ? paramsMatch[1].trim() : '';
                            
                            const methodId = `method${nodeId++}`;
                            methods.push(`${methodId}["Method: ${methodName}(${params})"]`);
                            connections.push(`${classId} --> ${methodId}`);
                            
                            // Extract method body for control flow
                            const methodBody = code.substring(code.indexOf(methodMatch) + methodMatch.length);
                            const closeBraceIndex = findClosingBrace(methodBody);
                            if (closeBraceIndex !== -1) {
                                const methodContent = methodBody.substring(0, closeBraceIndex);
                                
                                // Process control flow for high detail levels
                                if (detailLevel !== 'low') {
                                    let lastId = methodId;
                                    
                                    // Find if statements with proper condition sanitization
                                    const ifMatches = methodContent.match(/if\s*\([^{;]*\)/g);
                                    if (ifMatches) {
                                        for (const ifMatch of ifMatches) {
                                            // Extract and sanitize condition
                                            let condition = '';
                                            try {
                                                // Get text between first '(' and last ')'
                                                condition = ifMatch.substring(ifMatch.indexOf('(') + 1, ifMatch.lastIndexOf(')'));
                                                
                                                // Sanitize condition for mermaid
                                                condition = sanitizeForMermaid(condition);
                                            } catch (error) {
                                                condition = "condition";
                                            }
                                            
                                            const controlId = `control${nodeId++}`;
                                            controlFlows.push(`${controlId}{{"if ${condition}"}}`);
                                            connections.push(`${lastId} --> ${controlId}`);
                                            lastId = controlId;
                                        }
                                    }
                                    
                                    // Find loops with proper condition sanitization
                                    const loopMatches = methodContent.match(/(?:for|foreach|while)\s*\([^{;]*\)/g);
                                    if (loopMatches) {
                                        for (const loopMatch of loopMatches) {
                                            const loopTypeMatch = loopMatch.match(/(for|foreach|while)/);
                                            const loopType = loopTypeMatch ? loopTypeMatch[1] : 'loop';
                                            
                                            // Extract and sanitize condition
                                            let condition = '';
                                            try {
                                                // Get text between first '(' and last ')'
                                                condition = loopMatch.substring(loopMatch.indexOf('(') + 1, loopMatch.lastIndexOf(')'));
                                                
                                                // Sanitize condition for mermaid
                                                condition = sanitizeForMermaid(condition);
                                            } catch (error) {
                                                condition = "condition";
                                            }
                                            
                                            const controlId = `control${nodeId++}`;
                                            controlFlows.push(`${controlId}{{"${loopType} ${condition}"}}`);
                                            connections.push(`${lastId} --> ${controlId}`);
                                            lastId = controlId;
                                        }
                                    }
                                    
                                    // Find return statements
                                    const returnMatches = methodContent.match(/return\s+[^;]*;/g);
                                    if (returnMatches) {
                                        for (const returnMatch of returnMatches) {
                                            // Extract and sanitize return value
                                            let returnValue = '';
                                            try {
                                                returnValue = returnMatch.replace(/return\s+/, '').replace(/;$/, '');
                                                
                                                // Sanitize return value for mermaid
                                                returnValue = sanitizeForMermaid(returnValue);
                                            } catch (error) {
                                                returnValue = "value";
                                            }
                                            
                                            const returnId = `return${nodeId++}`;
                                            controlFlows.push(`${returnId}(["Return: ${returnValue}"])`);
                                            connections.push(`${lastId} --> ${returnId}`);
                                            lastId = returnId;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Combine all elements into the flowchart
    flowchart += namespaces.join('\n') + '\n';
    flowchart += classes.join('\n') + '\n';
    flowchart += methods.join('\n') + '\n';
    flowchart += controlFlows.join('\n') + '\n';
    flowchart += connections.join('\n') + '\n';
    
    return flowchart;
}

/**
 * Sanitize text for use in Mermaid flowchart
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeForMermaid(text) {
    // Limit length
    if (text.length > 30) {
        text = text.substring(0, 27) + '...';
    }
    
    // Replace characters that might cause issues in mermaid
    text = text.replace(/"/g, "'")          // Replace double quotes with single quotes
             .replace(/</g, '&lt;')         // Replace < with HTML entity
             .replace(/>/g, '&gt;')         // Replace > with HTML entity
             .replace(/\{/g, '&#123;')      // Replace { with HTML entity
             .replace(/\}/g, '&#125;')      // Replace } with HTML entity
             .replace(/\(/g, '&#40;')       // Replace ( with HTML entity
             .replace(/\)/g, '&#41;')       // Replace ) with HTML entity
             .replace(/\[/g, '&#91;')       // Replace [ with HTML entity
             .replace(/\]/g, '&#93;')       // Replace ] with HTML entity
             .replace(/\|/g, '&#124;');     // Replace | with HTML entity
    
    return text;
}
/**
 * Parse React code and generate a flowchart
 * @param {string} code - React code
 * @returns {string} - Mermaid flowchart definition
 */
function parseReact(code) {
    // Get the detail level from configuration
    const config = vscode.workspace.getConfiguration('codeToFlowchart');
    const detailLevel = config.get('detailLevel') || 'high';
    
    // Initialize flowchart
    let flowchart = 'flowchart TD\n';
    
    // Track components, hooks, functions, constants, and event handlers
    const components = [];
    const hooks = [];
    const eventHandlers = [];
    const effects = [];
    const states = [];
    const functions = [];
    const constants = [];
    const connections = [];
    
    // Node counter for unique IDs
    let nodeId = 0;
    
    // Find component declarations (functions or classes)
    const functionComponentMatches = code.match(/(?:export\s+(?:default\s+)?)?(?:const|function)\s+([A-Z][a-zA-Z0-9_]*)\s*=?\s*(?:\([^)]*\)|[^=]*=>\s*)/g);
    const classComponentMatches = code.match(/(?:export\s+(?:default\s+)?)?class\s+([A-Z][a-zA-Z0-9_]*)\s+extends\s+(?:React\.)?Component/g);
    
    // Find helper functions (not starting with uppercase - not components)
    const helperFunctionMatches = code.match(/(?:const|let|var|function)\s+([a-z][a-zA-Z0-9_]*)\s*=?\s*(?:\([^)]*\)\s*=>|function\s*\([^)]*\)\s*{)/g);
    
    // Find constants (excluding functions)
    const constantMatches = code.match(/(?:const|let|var)\s+([a-z][a-zA-Z0-9_]*)\s*=\s*(?!function|\(|.*=>)([^;]*);/g);
    
    // Process function components
    if (functionComponentMatches) {
        for (const match of functionComponentMatches) {
            const componentNameMatch = match.match(/(?:const|function)\s+([A-Z][a-zA-Z0-9_]*)/);
            if (componentNameMatch) {
                const componentName = componentNameMatch[1];
                const componentId = `component${nodeId++}`;
                components.push(`${componentId}["Component: ${componentName}"]`);
                
                // Extract the component body
                const componentStartIndex = code.indexOf(match);
                if (componentStartIndex !== -1) {
                    const componentBody = code.substring(componentStartIndex);
                    
                    // Find useState hooks
                    const useStateMatches = componentBody.match(/const\s+\[\s*([a-zA-Z0-9_]+)\s*,\s*set([a-zA-Z0-9_]+)\s*\]\s*=\s*useState\s*\(?([^)]*)\)?/g);
                    if (useStateMatches) {
                        for (const stateMatch of useStateMatches) {
                            const stateVarMatch = stateMatch.match(/\[\s*([a-zA-Z0-9_]+)\s*,\s*set([a-zA-Z0-9_]+)\s*\]/);
                            if (stateVarMatch) {
                                const stateVar = stateVarMatch[1];
                                const initialValueMatch = stateMatch.match(/useState\s*\(([^)]*)\)/);
                                const initialValue = initialValueMatch ? initialValueMatch[1] : '';
                                
                                const stateId = `state${nodeId++}`;
                                states.push(`${stateId}["State: ${stateVar}${initialValue ? ` = ${initialValue}` : ''}"]`);
                                connections.push(`${componentId} --> ${stateId}`);
                            }
                        }
                    }
                    
                    // Find useEffect hooks
                    const useEffectMatches = componentBody.match(/useEffect\s*\(\s*(?:\(?(?:async)?\s*\(\s*\)\s*=>|function\s*\(\s*\))?.*?\}\s*,\s*\[(.*?)\]\s*\)/gs);
                    if (useEffectMatches) {
                        for (const effectMatch of useEffectMatches) {
                            const depsMatch = effectMatch.match(/,\s*\[(.*?)\]\s*\)/s);
                            const deps = depsMatch ? depsMatch[1] : '';
                            
                            const effectId = `effect${nodeId++}`;
                            effects.push(`${effectId}["useEffect(${deps ? ` [${deps}]` : ''}"]`);
                            connections.push(`${componentId} --> ${effectId}`);
                        }
                    }
                    
                    // Find other hooks (useCallback, useMemo, useRef, etc.)
                    const otherHooksMatches = componentBody.match(/(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*use[A-Z][a-zA-Z0-9_]*\(/g);
                    if (otherHooksMatches) {
                        for (const hookMatch of otherHooksMatches) {
                            // Skip already processed useState and useEffect
                            if (hookMatch.includes('useState') || hookMatch.includes('useEffect')) {
                                continue;
                            }
                            
                            const hookNameMatch = hookMatch.match(/([a-zA-Z0-9_]+)\s*=\s*(use[A-Z][a-zA-Z0-9_]*)/);
                            if (hookNameMatch) {
                                const hookVarName = hookNameMatch[1];
                                const hookType = hookNameMatch[2];
                                
                                const hookId = `hook${nodeId++}`;
                                hooks.push(`${hookId}["${hookType}: ${hookVarName}"]`);
                                connections.push(`${componentId} --> ${hookId}`);
                            }
                        }
                    }
                    
                    // Find internal functions specific to this component
                    const internalFuncMatches = componentBody.match(/(?:const|function)\s+([a-zA-Z0-9_]+)\s*=\s*(?:\([^)]*\)\s*=>|function\s*\([^)]*\)\s*{)/g);
                    if (internalFuncMatches) {
                        for (const funcMatch of internalFuncMatches) {
                            const funcNameMatch = funcMatch.match(/(?:const|function)\s+([a-zA-Z0-9_]+)/);
                            if (funcNameMatch) {
                                const funcName = funcNameMatch[1];
                                
                                // Skip if this is an event handler (will be processed separately)
                                if (funcName.startsWith('handle')) {
                                    continue;
                                }
                                
                                const funcId = `func${nodeId++}`;
                                functions.push(`${funcId}["Function: ${funcName}"]`);
                                connections.push(`${componentId} --> ${funcId}`);
                            }
                        }
                    }
                    
                    // Find component constants
                    const internalConstMatches = componentBody.match(/(?:const|let|var)\s+([A-Z0-9_]+|[a-z][a-zA-Z0-9_]*)\s*=\s*(?!function|\(|.*=>)([^;]*);/g);
                    if (internalConstMatches) {
                        for (const constMatch of internalConstMatches) {
                            const constNameMatch = constMatch.match(/(?:const|let|var)\s+([A-Z0-9_]+|[a-z][a-zA-Z0-9_]*)/);
                            if (constNameMatch) {
                                const constName = constNameMatch[1];
                                
                                // Skip state variables from useState
                                if (states.some(state => state.includes(`"State: ${constName}`))) {
                                    continue;
                                }
                                
                                const constId = `const${nodeId++}`;
                                constants.push(`${constId}["Constant: ${constName}"]`);
                                connections.push(`${componentId} --> ${constId}`);
                            }
                        }
                    }
                    
                    // Find event handlers
                    const handlerMatches = componentBody.match(/(?:const|function)\s+handle([A-Z][a-zA-Z0-9_]*)\s*=\s*(?:\([^)]*\)\s*=>|[^=]*=>|function\s*\([^)]*\)\s*{)/g);
                    if (handlerMatches) {
                        for (const handlerMatch of handlerMatches) {
                            const handlerNameMatch = handlerMatch.match(/handle([A-Z][a-zA-Z0-9_]*)/);
                            if (handlerNameMatch) {
                                const handlerName = 'handle' + handlerNameMatch[1];
                                
                                const handlerId = `handler${nodeId++}`;
                                eventHandlers.push(`${handlerId}["Handler: ${handlerName}"]`);
                                connections.push(`${componentId} --> ${handlerId}`);
                                
                                // For high detail, look for state updates in handlers
                                if (detailLevel === 'high') {
                                    const handlerStartIndex = componentBody.indexOf(handlerMatch);
                                    if (handlerStartIndex !== -1) {
                                        const handlerBody = componentBody.substring(handlerStartIndex);
                                        const setStateMatches = handlerBody.match(/set[A-Z][a-zA-Z0-9_]*\s*\([^)]*\)/g);
                                        
                                        if (setStateMatches) {
                                            for (const setStateMatch of setStateMatches) {
                                                const setterMatch = setStateMatch.match(/set([A-Z][a-zA-Z0-9_]*)/);
                                                if (setterMatch) {
                                                    const stateName = setterMatch[1].charAt(0).toLowerCase() + setterMatch[1].slice(1);
                                                    
                                                    // Find the corresponding state node
                                                    for (let i = 0; i < states.length; i++) {
                                                        if (states[i].includes(`State: ${stateName}`)) {
                                                            const stateId = `state${i + nodeId - states.length}`;
                                                            connections.push(`${handlerId} --> ${stateId}`);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Process helper functions (non-component functions)
    if (helperFunctionMatches) {
        for (const match of helperFunctionMatches) {
            const funcNameMatch = match.match(/(?:const|function|let|var)\s+([a-zA-Z0-9_]+)/);
            if (funcNameMatch) {
                const funcName = funcNameMatch[1];
                
                // Skip if already included elsewhere or if it's an event handler
                if (functions.some(f => f.includes(`Function: ${funcName}`)) || 
                    funcName.startsWith('handle') || 
                    /^[A-Z]/.test(funcName)) { // Skip component names (start with uppercase)
                    continue;
                }
                
                const funcId = `func${nodeId++}`;
                functions.push(`${funcId}["Helper Function: ${funcName}"]`);
                
                // No parent to connect to for top-level functions
            }
        }
    }
    
    // Process constants (not functions)
    if (constantMatches) {
        for (const match of constantMatches) {
            const constNameMatch = match.match(/(?:const|let|var)\s+([a-zA-Z0-9_]+)/);
            if (constNameMatch) {
                const constName = constNameMatch[1];
                
                // Skip if already included elsewhere
                if (constants.some(c => c.includes(`Constant: ${constName}`))) {
                    continue;
                }
                
                const constId = `const${nodeId++}`;
                constants.push(`${constId}["Global Constant: ${constName}"]`);
                
                // No parent to connect to for top-level constants
            }
        }
    }
    
    // Process class components - simplified for brevity
    if (classComponentMatches) {
        // Class component parsing logic (similar to previous implementation)
        // ...
    }
    
    // Combine all elements into the flowchart
    flowchart += components.join('\n') + '\n';
    flowchart += states.join('\n') + '\n';
    flowchart += effects.join('\n') + '\n';
    flowchart += hooks.join('\n') + '\n';
    flowchart += functions.join('\n') + '\n';
    flowchart += constants.join('\n') + '\n';
    flowchart += eventHandlers.join('\n') + '\n';
    flowchart += connections.join('\n') + '\n';
    
    return flowchart;
}

/**
 * Parse Angular code and generate a flowchart
 * @param {string} code - Angular code
 * @returns {string} - Mermaid flowchart definition
 */
function parseAngular(code) {
    // Get the detail level from configuration
    const config = vscode.workspace.getConfiguration('codeToFlowchart');
    const detailLevel = config.get('detailLevel') || 'medium';
    
    // Initialize flowchart
    let flowchart = 'flowchart TD\n';
    
    // Track components, services, methods, and properties
    const components = [];
    const services = [];
    const methods = [];
    const inputs = [];
    const outputs = [];
    const properties = [];
    const connections = [];
    
    // Node counter for unique IDs
    let nodeId = 0;
    
    // Find @Component decorators
    const componentMatches = code.match(/@Component\s*\(\s*{[^}]*}\s*\)/g);
    if (componentMatches) {
        for (const match of componentMatches) {
            // Extract component metadata
            const selectorMatch = match.match(/selector\s*:\s*['"]([^'"]*)['"]/);
            const selector = selectorMatch ? selectorMatch[1] : '';
            
            // Find the class name following the decorator
            const componentIndex = code.indexOf(match) + match.length;
            const classMatch = code.substring(componentIndex).match(/\s*export\s+class\s+([a-zA-Z0-9_]+)/);
            
            if (classMatch) {
                const className = classMatch[1];
                const componentId = `component${nodeId++}`;
                components.push(`${componentId}["Component: ${className}${selector ? ` (${selector})` : ''}"]`);
                
                // Extract lifecycle hooks, inputs/outputs, and methods
                const classBody = code.substring(componentIndex);
                
                // Check for ngOnInit and other lifecycle hooks
                const lifecycleHooks = ['ngOnInit', 'ngOnChanges', 'ngDoCheck', 'ngAfterContentInit', 
                                       'ngAfterContentChecked', 'ngAfterViewInit', 'ngAfterViewChecked', 'ngOnDestroy'];
                
                for (const hook of lifecycleHooks) {
                    if (classBody.includes(hook)) {
                        const hookId = `hook${nodeId++}`;
                        methods.push(`${hookId}["Lifecycle: ${hook}"]`);
                        connections.push(`${componentId} --> ${hookId}`);
                    }
                }
                
                // Find @Input() decorators
                const inputMatches = classBody.match(/@Input\s*\(\s*(?:['"][^'"]*['"])?\s*\)\s*([a-zA-Z0-9_]+)/g);
                if (inputMatches) {
                    for (const inputMatch of inputMatches) {
                        const inputNameMatch = inputMatch.match(/([a-zA-Z0-9_]+)(?:\s*:|;|\s*=)/);
                        if (inputNameMatch) {
                            const inputName = inputNameMatch[1];
                            const inputId = `input${nodeId++}`;
                            inputs.push(`${inputId}>["Input: ${inputName}"]`);
                            connections.push(`${componentId} --> ${inputId}`);
                        }
                    }
                }
                
                // Find @Output() decorators
                const outputMatches = classBody.match(/@Output\s*\(\s*(?:['"][^'"]*['"])?\s*\)\s*([a-zA-Z0-9_]+)/g);
                if (outputMatches) {
                    for (const outputMatch of outputMatches) {
                        const outputNameMatch = outputMatch.match(/([a-zA-Z0-9_]+)(?:\s*:|;|\s*=)/);
                        if (outputNameMatch) {
                            const outputName = outputNameMatch[1];
                            const outputId = `output${nodeId++}`;
                            outputs.push(`${outputId}<["Output: ${outputName}"]`);
                            connections.push(`${componentId} --> ${outputId}`);
                        }
                    }
                }
                
                // Find methods
                const methodMatches = classBody.match(/(?:public|private|protected)?\s*([a-zA-Z0-9_]+)\s*\([^)]*\)\s*(?:{|=>)/g);
                if (methodMatches) {
                    for (const methodMatch of methodMatches) {
                        const methodNameMatch = methodMatch.match(/([a-zA-Z0-9_]+)\s*\(/);
                        if (methodNameMatch) {
                            const methodName = methodNameMatch[1];
                            
                            // Skip lifecycle hooks as they're already handled
                            if (lifecycleHooks.includes(methodName)) continue;
                            
                            const methodId = `method${nodeId++}`;
                            methods.push(`${methodId}["Method: ${methodName}"]`);
                            connections.push(`${componentId} --> ${methodId}`);
                        }
                    }
                }
            }
        }
    }
    
    // Find @Injectable decorators (services)
    const serviceMatches = code.match(/@Injectable\s*\(\s*{[^}]*}\s*\)/g);
    if (serviceMatches) {
        for (const match of serviceMatches) {
            // Find the class name following the decorator
            const serviceIndex = code.indexOf(match) + match.length;
            const classMatch = code.substring(serviceIndex).match(/\s*export\s+class\s+([a-zA-Z0-9_]+)/);
            
            if (classMatch) {
                const className = classMatch[1];
                const serviceId = `service${nodeId++}`;
                services.push(`${serviceId}["Service: ${className}"]`);
                
                // Extract methods
                const classBody = code.substring(serviceIndex);
                const methodMatches = classBody.match(/(?:public|private|protected)?\s*([a-zA-Z0-9_]+)\s*\([^)]*\)\s*(?:{|=>)/g);
                
                if (methodMatches) {
                    for (const methodMatch of methodMatches) {
                        const methodNameMatch = methodMatch.match(/([a-zA-Z0-9_]+)\s*\(/);
                        if (methodNameMatch) {
                            const methodName = methodNameMatch[1];
                            const methodId = `serviceMethod${nodeId++}`;
                            methods.push(`${methodId}["Method: ${methodName}"]`);
                            connections.push(`${serviceId} --> ${methodId}`);
                        }
                    }
                }
            }
        }
    }
    
    // Combine all elements into the flowchart
    flowchart += components.join('\n') + '\n';
    flowchart += services.join('\n') + '\n';
    flowchart += inputs.join('\n') + '\n';
    flowchart += outputs.join('\n') + '\n';
    flowchart += methods.join('\n') + '\n';
    flowchart += connections.join('\n') + '\n';
    
    return flowchart;
}

/**
 * Parse JavaScript code and generate a flowchart
 * @param {string} code - JavaScript code
 * @returns {string} - Mermaid flowchart definition
 */
function parseJavaScript(code) {
    // Get the detail level from configuration
    const config = vscode.workspace.getConfiguration('codeToFlowchart');
    const detailLevel = config.get('detailLevel') || 'medium';
    
    // Initialize flowchart
    let flowchart = 'flowchart TD\n';
    
    // Track functions, classes, and control structures
    const functions = [];
    const classes = [];
    const controlFlows = [];
    const connections = [];
    
    // Node counter for unique IDs
    let nodeId = 0;
    
    // Find function declarations
    const functionMatches = code.match(/(?:function|const|let|var)\s+([a-zA-Z0-9_]+)\s*(?:=\s*(?:function|\([^)]*\)\s*=>)|[^=]*\([^)]*\)\s*{)/g);
    if (functionMatches) {
        for (const match of functionMatches) {
            let functionName;
            if (match.startsWith('function')) {
                const nameMatch = match.match(/function\s+([a-zA-Z0-9_]+)/);
                if (nameMatch) functionName = nameMatch[1];
            } else {
                const nameMatch = match.match(/(?:const|let|var)\s+([a-zA-Z0-9_]+)/);
                if (nameMatch) functionName = nameMatch[1];
            }
            
            if (functionName) {
                const functionId = `func${nodeId++}`;
                functions.push(`${functionId}["Function: ${functionName}"]`);
                
                // Extract function body for high detail level
                if (detailLevel === 'high') {
                    const functionIndex = code.indexOf(match);
                    if (functionIndex !== -1) {
                        const functionBody = code.substring(functionIndex);
                        const closeBraceIndex = findClosingBrace(functionBody);
                        
                        if (closeBraceIndex !== -1) {
                            const functionContent = functionBody.substring(0, closeBraceIndex);
                            
                            // Find control structures
                            let lastNodeId = functionId;
                            
                            // If statements
                            const ifMatches = functionContent.match(/if\s*\([^)]*\)/g);
                            if (ifMatches) {
                                for (const ifMatch of ifMatches) {
                                    const condition = ifMatch.match(/\(([^)]*)\)/)[1];
                                    const controlId = `control${nodeId++}`;
                                    controlFlows.push(`${controlId}{{"if ${condition}"}}`)
                                    connections.push(`${lastNodeId} --> ${controlId}`);
                                    lastNodeId = controlId;
                                }
                            }
                            
                            // Loops
                            const loopMatches = functionContent.match(/(?:for|while)\s*\([^)]*\)/g);
                            if (loopMatches) {
                                for (const loopMatch of loopMatches) {
                                    const loopTypeMatch = loopMatch.match(/(for|while)/);
                                    const loopType = loopTypeMatch ? loopTypeMatch[1] : 'loop';
                                    const condition = loopMatch.match(/\(([^)]*)\)/)[1];
                                    const controlId = `control${nodeId++}`;
                                    controlFlows.push(`${controlId}{{"${loopType} ${condition}"}}`)
                                    connections.push(`${lastNodeId} --> ${controlId}`);
                                    lastNodeId = controlId;
                                }
                            }
                            
                            // Return statements
                            const returnMatches = functionContent.match(/return\s+[^;]*/g);
                            if (returnMatches) {
                                for (const returnMatch of returnMatches) {
                                    const returnValue = returnMatch.replace(/return\s+/, '');
                                    const returnId = `return${nodeId++}`;
                                    controlFlows.push(`${returnId}(["Return: ${returnValue}"])`)
                                    connections.push(`${lastNodeId} --> ${returnId}`);
                                    lastNodeId = returnId;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Find class declarations
    const classMatches = code.match(/class\s+([a-zA-Z0-9_]+)(?:\s+extends\s+([a-zA-Z0-9_]+))?\s*{/g);
    if (classMatches) {
        for (const match of classMatches) {
            const nameMatch = match.match(/class\s+([a-zA-Z0-9_]+)/);
            if (nameMatch) {
                const className = nameMatch[1];
                
                // Check for inheritance
                const extendsMatch = match.match(/extends\s+([a-zA-Z0-9_]+)/);
                const parentClass = extendsMatch ? extendsMatch[1] : '';
                
                const classId = `class${nodeId++}`;
                classes.push(`${classId}["Class: ${className}${parentClass ? ` extends ${parentClass}` : ''}"]`);
                
                // Extract class methods
                const classIndex = code.indexOf(match);
                if (classIndex !== -1) {
                    const classBody = code.substring(classIndex);
                    const closeBraceIndex = findClosingBrace(classBody);
                    
                    if (closeBraceIndex !== -1) {
                        const classContent = classBody.substring(0, closeBraceIndex);
                        
                        // Find methods
                        const methodMatches = classContent.match(/(?:async\s+)?(?:static\s+)?(?:get|set|[a-zA-Z0-9_]+)\s*\([^)]*\)\s*{/g);
                        if (methodMatches) {
                            for (const methodMatch of methodMatches) {
                                let methodName;
                                if (methodMatch.includes('get ') || methodMatch.includes('set ')) {
                                    const accessorMatch = methodMatch.match(/(?:get|set)\s+([a-zA-Z0-9_]+)/);
                                    if (accessorMatch) methodName = accessorMatch[0]; // Include "get" or "set"
                                } else {
                                    const nameMatch = methodMatch.match(/([a-zA-Z0-9_]+)\s*\(/);
                                    if (nameMatch) methodName = nameMatch[1];
                                }
                                
                                if (methodName) {
                                    const methodId = `method${nodeId++}`;
                                    functions.push(`${methodId}["Method: ${methodName}"]`);
                                    connections.push(`${classId} --> ${methodId}`);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Combine all elements into the flowchart
    flowchart += classes.join('\n') + '\n';
    flowchart += functions.join('\n') + '\n';
    flowchart += controlFlows.join('\n') + '\n';
    flowchart += connections.join('\n') + '\n';
    
    return flowchart;
}

module.exports = {
    parseCode
};