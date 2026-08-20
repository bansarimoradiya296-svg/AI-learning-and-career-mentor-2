import json
import uuid
import urllib.request
import urllib.parse

BASE_URL = "http://127.0.0.1:8000/api/v1"

def test_gen():
    test_email = f"mindmap_test_{uuid.uuid4().hex[:6]}@example.com"
    test_password = "TestPassword123!"

    # 0. Register
    reg_data = json.dumps({
        "email": test_email,
        "password": test_password,
        "first_name": "MindMap",
        "last_name": "Tester"
    }).encode("utf-8")
    try:
        reg_req = urllib.request.Request(f"{BASE_URL}/auth/register", data=reg_data, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(reg_req) as resp:
            reg_res = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print("Registration note:", e)

    # 1. Login
    login_data = json.dumps({"email": test_email, "password": test_password, "device_id": "test_device"}).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/auth/login", data=login_data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as resp:
        login_res = json.loads(resp.read().decode("utf-8"))

    token = login_res["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # 2. Test generate with topic
    gen_data = json.dumps({
        "source_type": "TOPIC",
        "topic": "Neural Networks and Deep Learning",
        "text": "",
        "document_id": None
    }).encode("utf-8")
    gen_req = urllib.request.Request(f"{BASE_URL}/study/mindmaps/generate", data=gen_data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(gen_req) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            print("SUCCESS generate:", res.get("title"), "Nodes:", len(res.get("nodes", [])))
    except urllib.error.HTTPError as e:
        print("HTTP ERROR:", e.code, e.read().decode())

if __name__ == "__main__":
    test_gen()
