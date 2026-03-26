import os
import re

src_dir = r'c:\Users\dm\Desktop\MES\frontend\src'
pattern_use = re.compile(r'safeParseJSON\s*\(')
pattern_import = re.compile(r'import\s+.*safeParseJSON.*from')

missing_imports = []

for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith(('.jsx', '.js')):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
                if pattern_use.search(content) and not pattern_import.search(content):
                    missing_imports.append(path)

if missing_imports:
    print("Files with missing safeParseJSON import:")
    for m in missing_imports:
        print(m)
else:
    print("No files with missing safeParseJSON import found.")
