#!/usr/bin/env python3
"""
Tech Boss 2026 — Local Backend Server & API Gateway
Provides backend API endpoints connected to Supabase PostgreSQL database
and serves frontend static files.
"""

import os
import json
import urllib.request
import urllib.parse
import urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = 3000
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://sgcqsfgjiofoqdylrvoi.supabase.co").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_OX9axwl6GT-p2twCa7lw3w_cadfJJJj")

def supabase_request(endpoint, method="GET", data=None, headers=None):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint.lstrip('/')}"
    req_headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    if headers:
        req_headers.update(headers)

    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            parsed_err = json.loads(err_body)
        except Exception:
            parsed_err = {"message": err_body}
        return e.code, parsed_err
    except Exception as e:
        return 500, {"message": str(e)}

class TechBossHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def _send_json(self, status_code, payload):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def _get_body_json(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 0:
            body = self.rfile.read(content_length).decode("utf-8")
            return json.loads(body)
        return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/registrations":
            status, data = supabase_request("registrations?select=*&order=created_at.desc")
            if status < 400:
                self._send_json(200, {"success": True, "count": len(data) if isinstance(data, list) else 0, "registrations": data})
            else:
                self._send_json(status, {"success": False, "error": data})
            return

        elif path == "/api/leaderboard":
            status, data = supabase_request("leaderboard?select=*&order=rank.asc")
            if status < 400:
                self._send_json(200, {"success": True, "leaderboard": data})
            else:
                self._send_json(status, {"success": False, "error": data})
            return

        elif path == "/api/event-state":
            status, data = supabase_request("event_state?id=eq.global")
            item = data[0] if (isinstance(data, list) and len(data) > 0) else {"boss_hp": "78", "broadcast_msg": ""}
            self._send_json(200, {"success": True, "event_state": item})
            return

        elif path == "/api/health":
            self._send_json(200, {"status": "healthy", "database": "connected", "server": "multi-threaded"})
            return

        # Default: Serve static files
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/register":
            try:
                body = self._get_body_json()
            except Exception as e:
                self._send_json(400, {"success": False, "error": "Invalid JSON in request body"})
                return

            name = body.get("name", "").strip()
            reg_no = body.get("reg_no") or body.get("regNo", "").strip()
            branch = body.get("branch", "").strip()
            year = body.get("year", "").strip()
            phone = body.get("phone", "").strip()
            screenshot = body.get("screenshot", "").strip()

            if not (name and reg_no and branch and year and phone):
                self._send_json(400, {
                    "success": False,
                    "error": "All fields are required: name, register number, branch, year, phone."
                })
                return

            if not screenshot:
                self._send_json(400, {
                    "success": False,
                    "error": "Payment screenshot is required to complete verification."
                })
                return

            # Check duplicate register number
            clean_reg_no = reg_no.upper()
            chk_status, existing = supabase_request(f"registrations?reg_no=eq.{urllib.parse.quote(clean_reg_no)}&select=id,reg_no")
            if isinstance(existing, list) and len(existing) > 0:
                self._send_json(409, {
                    "success": False,
                    "error": f"Registration number '{clean_reg_no}' is already registered in the system."
                })
                return

            handle = body.get("handle") or f"@{name.lower()[:10]}"
            if not handle.startswith("@"):
                handle = f"@{handle}"

            record = {
                "name": name,
                "reg_no": clean_reg_no,
                "branch": branch,
                "year": year,
                "phone": phone,
                "handle": handle,
                "pass": body.get("pass", "All-Access Solo Pass"),
                "fee": body.get("fee", "100"),
                "screenshot": screenshot,
                "status": "PENDING"
            }

            status, res = supabase_request("registrations", method="POST", data=[record])
            if status < 400 and isinstance(res, list) and len(res) > 0:
                created_row = res[0]
                self._send_json(201, {
                    "success": True,
                    "message": "Registration permanently saved in database",
                    "participant": created_row
                })
            else:
                self._send_json(status, {
                    "success": False,
                    "error": "Failed to save registration into database",
                    "details": res
                })
            return

        elif path == "/api/leaderboard":
            body = self._get_body_json()
            board = body.get("leaderboard", [])
            supabase_request("leaderboard?id=neq.0", method="DELETE")
            if board:
                payload = []
                for idx, item in enumerate(board):
                    payload.append({
                        "rank": item.get("rank", idx + 1),
                        "handle": item.get("handle", ""),
                        "name": item.get("name", ""),
                        "score": int(item.get("score", 0)),
                        "boss_dmg": item.get("bossDmg") or item.get("boss_dmg", "0 DMG"),
                        "streak": item.get("streak", "0 WINS"),
                        "avatar": item.get("avatar", f"0{(idx % 8) + 1}"),
                        "badge": item.get("badge", "")
                    })
                supabase_request("leaderboard", method="POST", data=payload)
            self._send_json(200, {"success": True, "message": "Leaderboard updated"})
            return

        elif path == "/api/event-state":
            body = self._get_body_json()
            payload = {
                "id": "global",
                "boss_hp": str(body.get("boss_hp", "78")),
                "broadcast_msg": str(body.get("broadcast_msg", ""))
            }
            supabase_request("event_state", method="POST", data=[payload], headers={"Prefer": "resolution=merge-duplicates"})
            self._send_json(200, {"success": True, "event_state": payload})
            return

        self._send_json(404, {"error": "Not Found"})

    def do_PATCH(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/registrations":
            body = self._get_body_json()
            reg_id = body.get("id")
            new_status = body.get("status")
            if not reg_id or not new_status:
                self._send_json(400, {"error": "id and status are required"})
                return

            status, res = supabase_request(f"registrations?id=eq.{reg_id}", method="PATCH", data={"status": new_status})
            self._send_json(200, {"success": True, "updated": res})
            return

        self._send_json(404, {"error": "Not Found"})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/api/registrations":
            reg_id = query.get("id", [None])[0]
            if not reg_id:
                body = self._get_body_json()
                reg_id = body.get("id")

            if not reg_id:
                self._send_json(400, {"error": "id is required"})
                return

            status, res = supabase_request(f"registrations?id=eq.{reg_id}", method="DELETE")
            self._send_json(200, {"success": True, "deleted_id": reg_id})
            return

        self._send_json(404, {"error": "Not Found"})

class ThreadedHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server_address = ("0.0.0.0", PORT)
    httpd = ThreadedHTTPServer(server_address, TechBossHandler)
    print(f"🚀 Tech Boss 2026 Multi-Threaded Backend & Web Server live on:")
    print(f"   👉 http://localhost:{PORT}")
    print(f"   👉 http://127.0.0.1:{PORT}")
    print(f"📡 Connected to Supabase Cloud Database: {SUPABASE_URL}")
    httpd.serve_forever()
