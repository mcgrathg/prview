import contextlib
import io
import importlib.metadata
import json
import sys
import lizard

def measured_comments(tokens, reader):
    for token in tokens:
        comment = reader.get_comment_from_token(token)
        if comment is None:
            yield token
        else:
            for _ in comment.splitlines()[1:]:
                yield "\n"

analyzer = lizard.FileAnalyzer([lizard.preprocessing, measured_comments, lizard.line_counter, lizard.token_counter, lizard.condition_counter])
units = json.load(sys.stdin)
result = []
for unit in units:
    warnings = io.StringIO()
    with contextlib.redirect_stderr(warnings):
        analysis = analyzer.analyze_source_code(unit["path"], unit["content"])
    result.append({"id": unit["id"], "functions": [
        {"name": function.name, "signature": function.long_name,
         "start": function.start_line, "end": function.end_line,
         "complexity": function.cyclomatic_complexity, "nloc": function.nloc}
        for function in analysis.function_list[:500]
    ], "limited": len(analysis.function_list) > 500 or bool(warnings.getvalue())})
json.dump({"version": importlib.metadata.version("lizard"), "units": result}, sys.stdout)
