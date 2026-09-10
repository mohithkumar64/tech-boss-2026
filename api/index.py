"""
Tech Boss 2026 — Vercel Serverless Function API Handler
Handles /api/register, /api/registrations, /api/leaderboard, /api/event-state
"""

import os
import json
import urllib.request
import urllib.parse
import urllib.error
from http.server import BaseHTTPRequestHandler

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
        with urllib.request.urlopen(req, timeout=10) as resp:
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

class handler(BaseHTTPRequestHandler):
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

        if "registrations" in path:
            status, data = supabase_request("registrations?select=*&order=created_at.desc")
            if status < 400:
                self._send_json(200, {"success": True, "count": len(data), "registrations": data})
            else:
                self._send_json(status, {"success": False, "error": data})
            return

        elif "leaderboard" in path:
            status, data = supabase_request("leaderboard?select=*&order=rank.asc")
            if status < 400:
                self._send_json(200, {"success": True, "leaderboard": data})
            else:
                self._send_json(status, {"success": False, "error": data})
            return

        elif "event-state" in path:
            status, data = supabase_request("event_state?id=eq.global")
            item = data[0] if (isinstance(data, list) and len(data) > 0) else {"boss_hp": "78", "broadcast_msg": ""}
            self._send_json(200, {"success": True, "event_state": item})
            return

        self._send_json(200, {"status": "ok", "service": "tech-boss-api"})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if "register" in path:
            try:
                body = self._get_body_json()
            except Exception:
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
                "fee": body.get("fee", "60"),
                "screenshot": screenshot,
                "status": "PENDING"
            }

            status, res = supabase_request("registrations", method="POST", data=[record])
            if status < 400 and isinstance(res, list) and len(res) > 0:
                self._send_json(201, {
                    "success": True,
                    "message": "Registration permanently saved in database",
                    "participant": res[0]
                })
            else:
                self._send_json(status, {
                    "success": False,
                    "error": "Failed to save registration into database",
                    "details": res
                })
            return

        elif "leaderboard" in path:
            try:
                body = self._get_body_json()
            except Exception:
                self._send_json(400, {"success": False, "error": "Invalid JSON in request body"})
                return

            board = body.get("leaderboard", [])
            # Deduplicate by tag name / handle
            dedup_map = {}
            for item in board:
                if not item:
                    continue
                raw_handle = (item.get("handle") or "").strip()
                if raw_handle and not raw_handle.startswith("@"):
                    raw_handle = f"@{raw_handle}"
                name = (item.get("name") or "").strip()
                key = (raw_handle or name).lower().replace(" ", "")
                if not key:
                    continue

                score_val = int(item.get("score", 0))
                if key in dedup_map:
                    # Update existing single entry with highest score
                    if score_val > dedup_map[key]["score"]:
                        dedup_map[key]["score"] = score_val
                    if name and not dedup_map[key]["name"]:
                        dedup_map[key]["name"] = name
                else:
                    dedup_map[key] = {
                        "handle": raw_handle or (f"@{name.lower()[:10]}" if name else "@challenger"),
                        "name": name,
                        "score": score_val,
                        "boss_dmg": item.get("boss_dmg", item.get("bossDmg", f"{score_val} DMG")),
                        "streak": item.get("streak", "0 WINS"),
                        "avatar": item.get("avatar", "01"),
                        "badge": item.get("badge", "")
                    }

            deduped_board = sorted(dedup_map.values(), key=lambda x: x["score"], reverse=True)
            for idx, entry in enumerate(deduped_board):
                entry["rank"] = idx + 1
                if not entry.get("avatar"):
                    entry["avatar"] = f"0{(idx % 8) + 1}"

            # Clear and repopulate cleanly
            supabase_request("leaderboard?id=neq.0", method="DELETE")
            if deduped_board:
                supabase_request("leaderboard", method="POST", data=deduped_board)

            self._send_json(200, {
                "success": True,
                "message": f"Leaderboard updated with {len(deduped_board)} unique contenders",
                "leaderboard": deduped_board
            })
            return

        self._send_json(404, {"error": "Not Found"})

    def do_PATCH(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if "registrations" in path:
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

        if "registrations" in path:
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
