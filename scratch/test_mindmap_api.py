import json
import uuid
import urllib.request
import urllib.parse

BASE_URL = "http://127.0.0.1:8000/api/v1"

def request_json(url, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    
    encoded_data = None
    if data is not None:
        if isinstance(data, dict) and headers.get("Content-Type") == "application/x-www-form-urlencoded":
            encoded_data = urllib.parse.urlencode(data).encode("utf-8")
        else:
            encoded_data = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        res_body = resp.read().decode("utf-8")
        return json.loads(res_body)

def test_mindmap_workflow():
    test_email = f"mindmap_test_{uuid.uuid4().hex[:6]}@example.com"
    test_password = "TestPassword123!"

    # 0. Register
    reg_data = json.dumps({
        "email": test_email,
        "password": test_password,
        "first_name": "MindMap",
        "last_name": "Tester"
    }).encode("utf-8")
    reg_req = urllib.request.Request(f"{BASE_URL}/auth/register", data=reg_data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(reg_req) as resp:
        reg_res = json.loads(resp.read().decode("utf-8"))

    # 1. Login
    login_data = json.dumps({"email": test_email, "password": test_password, "device_id": "test_device"}).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/auth/login", data=login_data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as resp:
        login_res = json.loads(resp.read().decode("utf-8"))

    token = login_res["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("[SUCCESS] 1. Registration & Login successful")

    # 2. Generate Mind Map from Topic
    map_data = request_json(
        f"{BASE_URL}/study/mindmaps/generate",
        method="POST",
        data={
            "source_type": "TOPIC",
            "topic": "Supervised Machine Learning",
            "text": None,
            "document_id": None
        },
        headers=headers
    )
    print(f"[SUCCESS] 2. Dynamic Mind Map generated! Title: {map_data.get('title')}, Nodes count: {len(map_data.get('nodes', []))}")
    print(f"   Root concept: {map_data['nodes'][0]['name']}")
    print(f"   Sample concept mastery: {map_data['nodes'][0]['mastery']}")

    # 3. Expand Concept Node with AI
    expand_res = request_json(
        f"{BASE_URL}/study/mindmaps/expand-node",
        method="POST",
        data={
            "concept_name": "Classification",
            "parent_context": "Supervised Learning task predicting discrete class labels."
        },
        headers=headers
    )
    sub_nodes = expand_res["sub_nodes"]
    print(f"[SUCCESS] 3. Node expanded with {len(sub_nodes)} sub-concepts! First sub-concept: {sub_nodes[0]['name']}")

    # 4. Explain Concept Node in Exam Mode
    explain_res = request_json(
        f"{BASE_URL}/study/mindmaps/explain-node",
        method="POST",
        data={
            "concept_name": "Classification",
            "mode": "Exam Explanation",
            "context": "Supervised learning algorithm"
        },
        headers=headers
    )
    explanation = explain_res["explanation"]
    safe_exp = explanation[:80].encode("ascii", "ignore").decode("ascii")
    print(f"[SUCCESS] 4. Node explained in Exam mode! Snippet: {safe_exp}...")

    # 5. Save Mind Map
    saved_map = request_json(
        f"{BASE_URL}/study/mindmaps/save",
        method="POST",
        data={
            "title": "Supervised Machine Learning Knowledge Map",
            "source_type": "TOPIC",
            "nodes_data": map_data,
            "layout_type": "radial"
        },
        headers=headers
    )
    map_id = saved_map["id"]
    print(f"[SUCCESS] 5. Saved Mind Map to DB! ID: {map_id}")

    # 6. List Saved Mind Maps
    maps_list = request_json(f"{BASE_URL}/study/mindmaps", method="GET", headers=headers)
    print(f"[SUCCESS] 6. Listed saved mind maps! Count: {len(maps_list)}")

    # 7. Get Mind Map by ID
    got_map = request_json(f"{BASE_URL}/study/mindmaps/{map_id}", method="GET", headers=headers)
    print(f"[SUCCESS] 7. Retrieved Mind Map by ID successfully! Title: {got_map['title']}")

    # 8. Delete Mind Map
    del_res = request_json(f"{BASE_URL}/study/mindmaps/{map_id}", method="DELETE", headers=headers)
    print(f"[SUCCESS] 8. Deleted Mind Map successfully! Message: {del_res['message']}")

if __name__ == "__main__":
    test_mindmap_workflow()
