import re

filepath = 'backend/app/api/endpoints/settlement.py'

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. get_month_filter를 Optional month 지원으로 수정
old_filter = (
    "def get_month_filter(model_attr, year: int, month: int):\n"
    "    return and_(\n"
    "        extract('year', model_attr) == year,\n"
    "        extract('month', model_attr) == month\n"
    "    )"
)

new_filter = (
    "def get_month_filter(model_attr, year: int, month):\n"
    "    if month:\n"
    "        return and_(\n"
    "            extract('year', model_attr) == year,\n"
    "            extract('month', model_attr) == month\n"
    "        )\n"
    "    else:\n"
    "        return extract('year', model_attr) == year"
)

if old_filter in text:
    text = text.replace(old_filter, new_filter)
    print("get_month_filter replaced")
else:
    print("WARNING: get_month_filter not found!")
    print("Current function:")
    idx = text.find("def get_month_filter")
    print(repr(text[idx:idx+200]))

# 2. month: int = Query(...) -> Optional
count = len(re.findall(r'month: int = Query\(\.\.\.\)', text))
text = re.sub(r'month: int = Query\(\.\.\.\)', 'month: Optional[int] = Query(None)', text)
print(f"month Query replaced: {count} occurrences")

# 3. 대금지급 기안 날짜 필터 수정
old_payment = "if effective_date.year != year or effective_date.month != month:"
new_payment = "if effective_date.year != year or (month and effective_date.month != month):"
if old_payment in text:
    text = text.replace(old_payment, new_payment)
    print("payment filter replaced")
else:
    print("WARNING: payment filter not found")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("Done - saved as UTF-8")
