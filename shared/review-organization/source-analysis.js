import ts from 'typescript';

export function changedHeadLines(patch) {
  const changed = new Set();
  let lineNumber = 0;
  for (const line of (patch || '').split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) { lineNumber = Number(hunk[1]); continue; }
    if (line.startsWith('+')) { changed.add(lineNumber); lineNumber++; }
    else if (line.startsWith(' ')) lineNumber++;
  }
  return changed;
}

export function extractSourceFacts(units) {
  const options = { noLib: true, noResolve: true, allowJs: true, target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext };
  const sourceByName = new Map(units.map(unit => [`/pr/${unit.path}`, ts.createSourceFile(`/pr/${unit.path}`, unit.content, ts.ScriptTarget.Latest, true)]));
  const host = {
    getSourceFile: name => sourceByName.get(name),
    getDefaultLibFileName: () => '',
    writeFile: () => {},
    getCurrentDirectory: () => '/pr',
    getDirectories: () => [],
    fileExists: name => sourceByName.has(name),
    readFile: name => sourceByName.get(name)?.text,
    getCanonicalFileName: name => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const program = ts.createProgram([...sourceByName.keys()], options, host);
  const checker = program.getTypeChecker();

  return units.map(unit => {
    const source = program.getSourceFile(`/pr/${unit.path}`);
    const diagnostics = source.parseDiagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
    const sourceLines = source.text.split('\n');
    const changedLines = [...(unit.changedLines || [])].sort((left, right) => left - right);
    const at = node => {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const endLine = source.getLineAndCharacterOfPosition(node.end).line + 1;
      let low = 0, high = changedLines.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (changedLines[middle] < line) low = middle + 1; else high = middle;
      }
      const changed = low < changedLines.length && changedLines[low] <= endLine;
      return { line, excerpt: sourceLines[line - 1].trim().slice(0, 240), changed };
    };
    if (diagnostics.length) return { path: unit.path, status: 'parse_error', diagnostics, imports: [], importedCalls: [], fileReferences: [] };
    const imports = [];
    const bindings = new Map();
    const references = [];
    const declarations = {};
    const reference = (node, specifier, imported, trim = 0) => {
      const start = source.getLineAndCharacterOfPosition(node.getStart(source) + trim);
      const end = source.getLineAndCharacterOfPosition(node.end - trim);
      if (start.line === end.line) references.push({ line: start.line + 1, start: start.character, end: end.character, specifier, imported });
    };

    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      reference(statement.moduleSpecifier, statement.moduleSpecifier.text, undefined, 1);
      const clause = statement.importClause;
      const names = [];
      const remember = (name, imported, typeOnly, namespace = false) => {
        const binding = { local: name.text, imported, typeOnly, namespace };
        names.push(binding);
        const symbol = checker.getSymbolAtLocation(name);
        if (symbol) bindings.set(symbol, { ...binding, specifier: statement.moduleSpecifier.text });
      };
      if (clause?.name) remember(clause.name, 'default', clause.isTypeOnly);
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        remember(clause.namedBindings.name, '*', clause.isTypeOnly, true);
      } else if (clause?.namedBindings) {
        for (const element of clause.namedBindings.elements) remember(element.name, (element.propertyName || element.name).text, clause.isTypeOnly || element.isTypeOnly);
      }
      imports.push({ specifier: statement.moduleSpecifier.text, typeOnly: Boolean(clause?.isTypeOnly || (names.length && names.every(name => name.typeOnly))), bindings: names, ...at(statement) });
    }

    const importedCalls = [];
    const fileReferences = [];
    function visit(node) {
      if (ts.isIdentifier(node)) {
        const binding = bindings.get(checker.getSymbolAtLocation(node));
        if (binding) reference(node, binding.specifier, binding.imported);
      }
      if (ts.isImportSpecifier(node) && node.propertyName) {
        const binding = bindings.get(checker.getSymbolAtLocation(node.name));
        if (binding) reference(node.propertyName, binding.specifier, binding.imported);
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        let root = node.expression;
        while (ts.isPropertyAccessExpression(root)) root = root.expression;
        if (ts.isIdentifier(root)) {
          const binding = bindings.get(checker.getSymbolAtLocation(root));
          if (binding && !binding.typeOnly) importedCalls.push({
            specifier: binding.specifier,
            imported: binding.imported,
            expression: node.expression.getText(source),
            kind: ts.isNewExpression(node) ? 'imported_constructor' : ts.isIdentifier(node.expression) ? 'imported_function_call' : 'imported_member_call',
            ...at(node),
          });
          if (binding && !binding.typeOnly && ts.isCallExpression(node) && ['node:path', 'path'].includes(binding.specifier)) {
            const method = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : binding.imported;
            const [directory, ...parts] = node.arguments;
            if (['join', 'resolve'].includes(method) && directory && ts.isIdentifier(directory) && directory.text === '__dirname' && !checker.getSymbolAtLocation(directory)
              && parts.length && parts.every(part => ts.isStringLiteral(part) && !part.text.startsWith('/') && !part.text.includes('\\'))) {
              fileReferences.push({ specifier: './' + parts.map(part => part.text).join('/'), kind: 'path_join_candidate', ...at(node) });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const statement of source.statements) {
      if (!statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      const names = ts.isVariableStatement(statement) ? statement.declarationList.declarations.map(item => item.name) : [statement.name];
      for (const name of names) if (name && ts.isIdentifier(name)) declarations[name.text] = at(name).line;
      if (statement.modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)) declarations.default = at(statement).line;
    }
    return { path: unit.path, status: 'ok', diagnostics: [], imports, importedCalls, fileReferences, lineCount: source.text.split('\n').length,
      code: { content: source.text, references, declarations } };
  });
}
