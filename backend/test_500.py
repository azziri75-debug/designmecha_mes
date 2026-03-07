import urllib.request, urllib.error
try:
    urllib.request.urlopen("http://localhost:8000/api/v1/purchasing/purchase/orders")
except urllib.error.HTTPError as e:
    print("Error Code:", e.code)
    print(e.read().decode("utf-8"))
