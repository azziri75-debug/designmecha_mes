import urllib.request
import urllib.error

try:
    req = urllib.request.Request("http://localhost:8000/api/v1/purchasing/purchase/orders")
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        print("Body:", response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print("HTTPError Code:", e.code)
    print("Error Body:", e.read().decode('utf-8'))
except Exception as e:
    print("Other Error:", e)
