import json
import urllib.request
import os

# Read token
hermes_web_ui_home = os.environ.get('HERMES_WEB_UI_HOME', r'H:\App22\hermes-web-ui')
token_path = os.path.join(hermes_web_ui_home, '.token')
with open(token_path) as f:
    token = f.read().strip()

# Build request
request_data = {
    "mode": "text",
    "prompt": "A beautiful seven-spotted ladybug with bright red wings and distinct black spots, detailed illustration, white background, high quality, realistic, nature photography style",
    "size": "1024x1024",
    "output_path": r"C:/Users/leoza/Desktop/气味地图/ladybug.png"
}

url = "http://127.0.0.1:8648/api/hermes/media/apikey-image-generate"
headers = {
    "Authorization": f"Bearer {token}",
    "X-Hermes-Profile": "default",
    "Content-Type": "application/json"
}

req = urllib.request.Request(url, data=json.dumps(request_data).encode(), headers=headers, method="POST")

try:
    with urllib.request.urlopen(req, timeout=300) as resp:
        result = json.loads(resp.read().decode())
        print(json.dumps(result, ensure_ascii=False, indent=2))
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(e.read().decode())
except Exception as e:
    print(f"Error: {e}")
