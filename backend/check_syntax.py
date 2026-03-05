import ast
import traceback
import sys

filename = sys.argv[1]
with open(filename, 'r', encoding='utf-8') as f:
    source = f.read()

try:
    ast.parse(source)
    print("No syntax errors found.")
except SyntaxError as e:
    print(f"Syntax error in {filename} at line {e.lineno}, offset {e.offset}:")
    print(e.text)
    print(e.msg)
except Exception as e:
    traceback.print_exc()
