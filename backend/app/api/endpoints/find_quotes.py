import sys
path = r'c:\Users\dm\Desktop\MES\backend\app\api\endpoints\production.py'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()
lines = src.splitlines()
for i, line in enumerate(lines):
    if '"""' in line:
        print(f'{i+1}: {line.strip()}')
