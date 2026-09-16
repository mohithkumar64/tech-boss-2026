"""
Tech Boss 2026 — Vercel Serverless Function API Handler
Handles /api/register, /api/registrations, /api/leaderboard, /api/event-state
"""

import os
import json
import time
import datetime
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
            query = urllib.parse.parse_qs(parsed.query)
            state_id = query.get("id", ["global"])[0]
            status, data = supabase_request(f"event_state?id=eq.{state_id}")
            item = data[0] if (isinstance(data, list) and len(data) > 0) else {"id": state_id, "boss_hp": "78", "broadcast_msg": ""}
            self._send_json(200, {"success": True, "event_state": item})
            return

        elif "rounds" in path:
            status, data = supabase_request("tournament_rounds?select=*&order=round_number.asc")
            if status < 400 and isinstance(data, list) and len(data) > 0:
                self._send_json(200, {"success": True, "rounds": data})
                return

            st, es_data = supabase_request("event_state?id=eq.tournament_rounds&select=*")
            if st < 400 and isinstance(es_data, list) and len(es_data) > 0:
                msg = es_data[0].get("broadcast_msg")
                if msg:
                    try:
                        parsed_r = json.loads(msg)
                        if isinstance(parsed_r, list) and len(parsed_r) > 0:
                            self._send_json(200, {"success": True, "rounds": parsed_r})
                            return
                    except Exception:
                        pass

            def_rounds = [
                {"round_number": 1, "title": "The Awakening", "format": "Individual", "type": "INDIVIDUAL", "status": "OPEN", "total_players": None},
                {"round_number": 2, "title": "Quad Synergy", "format": "Teams of 4", "type": "TEAM", "status": "NOT_STARTED", "total_players": None},
                {"round_number": 3, "title": "Dual Clash", "format": "Teams of 4", "type": "TEAM", "status": "NOT_STARTED", "total_players": None},
                {"round_number": 4, "title": "Hex Havoc", "format": "Teams of 4", "type": "TEAM", "status": "NOT_STARTED", "total_players": None},
                {"round_number": 5, "title": "Solo Gauntlet", "format": "Individual", "type": "INDIVIDUAL", "status": "NOT_STARTED", "total_players": None},
                {"round_number": 6, "title": "Trinity Strife", "format": "Teams of 3", "type": "TEAM", "status": "NOT_STARTED", "total_players": None},
                {"round_number": 7, "title": "Squad Blitz", "format": "Teams of 4", "type": "TEAM", "status": "NOT_STARTED", "total_players": None},
                {"round_number": 8, "title": "Elimination Trial", "format": "Individual", "type": "INDIVIDUAL", "status": "NOT_STARTED", "total_players": None},
                {"round_number": 9, "title": "Grand Finale (Boss Battle)", "format": "Individual", "type": "INDIVIDUAL", "status": "NOT_STARTED", "total_players": None}
            ]
            self._send_json(200, {"success": True, "rounds": def_rounds})
            return

        elif "teams" in path:
            query = urllib.parse.parse_qs(parsed.query)
            scope = query.get("scope", query.get("round_scope", [None]))[0]
            url = "tournament_teams?select=*,tournament_team_members(*)&order=id.asc"
            if scope:
                url += f"&round_scope=eq.{urllib.parse.quote(scope)}"
            status, data = supabase_request(url)
            teams = []
            if status < 400 and isinstance(data, list) and len(data) > 0:
                for t in data:
                    teams.append({
                        "id": t.get("id"),
                        "team_name": t.get("team_name"),
                        "round_scope": t.get("round_scope"),
                        "members": [
                            {
                                "player_handle": m.get("player_handle"),
                                "player_name": m.get("player_name"),
                                "reg_no": m.get("reg_no")
                            }
                            for m in t.get("tournament_team_members", [])
                        ]
                    })
            else:
                st, es_data = supabase_request("event_state?id=eq.tournament_teams&select=*")
                if st < 400 and isinstance(es_data, list) and len(es_data) > 0:
                    msg = es_data[0].get("broadcast_msg")
                    if msg:
                        try:
                            parsed_t = json.loads(msg)
                            if isinstance(parsed_t, dict):
                                if scope:
                                    teams = parsed_t.get(scope, [])
                                else:
                                    teams = [t for sub in parsed_t.values() for t in sub]
                        except Exception:
                            pass
            self._send_json(200, {"success": True, "teams": teams})
            return

        elif "scores" in path:
            query = urllib.parse.parse_qs(parsed.query)
            r_num = query.get("round", [None])[0]
            mapped = {}

            # 1. Try Supabase event_state: id=tournament_scores
            st, es_data = supabase_request("event_state?id=eq.tournament_scores&select=*")
            if st < 400 and isinstance(es_data, list) and len(es_data) > 0:
                msg = es_data[0].get("broadcast_msg")
                if msg:
                    try:
                        cloud_scores = json.loads(msg)
                        if r_num:
                            mapped = cloud_scores.get(str(r_num), {})
                        else:
                            mapped = cloud_scores
                    except Exception:
                        pass

            if not mapped:
                url = "tournament_scores?select=*&order=player_handle.asc"
                if r_num:
                    url += f"&round_number=eq.{urllib.parse.quote(r_num)}"
                status, data = supabase_request(url)
                if status < 400 and isinstance(data, list):
                    for row in data:
                        raw_h = (row.get("player_handle") or "").lower()
                        mapped[raw_h] = {
                            "player_handle": row.get("player_handle"),
                            "player_name": row.get("player_name") or "",
                            "individual_score": int(row.get("individual_score") or 0),
                            "team_id": row.get("team_id"),
                            "team_score": int(row.get("team_score") or 0),
                            "round_total": int(row.get("round_total") or (int(row.get("individual_score") or 0) + int(row.get("team_score") or 0)))
                        }

            self._send_json(200, {"success": True, "scores": mapped})
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

        elif "teams" in path:
            try:
                body = self._get_body_json()
            except Exception:
                self._send_json(400, {"error": "Invalid JSON"})
                return

            scope = body.get("scope", "ROUND_2")

            # Support bulk replace of teams for a scope
            bulk_teams = body.get("teams")
            if isinstance(bulk_teams, list):
                try:
                    st, es_data = supabase_request("event_state?id=eq.tournament_teams&select=*")
                    all_teams_map = {}
                    if st < 400 and isinstance(es_data, list) and len(es_data) > 0:
                        msg = es_data[0].get("broadcast_msg")
                        if msg:
                            try:
                                all_teams_map = json.loads(msg)
                            except Exception:
                                all_teams_map = {}
                    all_teams_map[scope] = bulk_teams
                    supabase_request("event_state", method="POST", data=[{
                        "id": "tournament_teams",
                        "boss_hp": "0",
                        "broadcast_msg": json.dumps(all_teams_map),
                        "updated_at": datetime.datetime.utcnow().isoformat()
                    }], headers={"Prefer": "resolution=merge-duplicates"})
                except Exception:
                    pass
                self._send_json(200, {"success": True, "teams": bulk_teams, "count": len(bulk_teams)})
                return

            team = body.get("team", {})
            team_name = team.get("team_name", "").strip()
            if not team_name:
                self._send_json(400, {"error": "team_name is required"})
                return

            team_payload = {"team_name": team_name, "round_scope": scope}
            tid = team.get("id")
            if isinstance(tid, int) or (isinstance(tid, str) and tid.isdigit()):
                team_payload["id"] = int(tid)

            t_status, t_res = supabase_request(
                "tournament_teams",
                method="POST",
                data=[team_payload],
                headers={"Prefer": "resolution=merge-duplicates,return=representation"}
            )
            created_team = (t_res[0] if isinstance(t_res, list) and len(t_res) > 0 else team)
            actual_tid = created_team.get("id") or tid

            members = team.get("members", [])
            if actual_tid and isinstance(members, list) and len(members) > 0:
                supabase_request(f"tournament_team_members?team_id=eq.{actual_tid}", method="DELETE")
                mem_payload = [
                    {
                        "team_id": actual_tid,
                        "player_handle": m.get("player_handle"),
                        "player_name": m.get("player_name", ""),
                        "reg_no": m.get("reg_no", "")
                    }
                    for m in members
                ]
                supabase_request("tournament_team_members", method="POST", data=mem_payload)

            self._send_json(200, {"success": True, "team": created_team})
            return

        elif "scores" in path:
            try:
                body = self._get_body_json()
            except Exception:
                self._send_json(400, {"error": "Invalid JSON"})
                return

            r_num = body.get("round_number")
            scores = body.get("scores", [])
            scores_map = body.get("scoresMap") or {}
            if not r_num:
                self._send_json(400, {"error": "round_number is required"})
                return

            r_key = str(r_num)
            if scores:
                supabase_request(
                    "tournament_scores",
                    method="POST",
                    data=scores,
                    headers={"Prefer": "resolution=merge-duplicates"}
                )

            # Persist to Supabase event_state: id=tournament_scores
            try:
                st, es_data = supabase_request("event_state?id=eq.tournament_scores&select=*")
                cloud_scores = {}
                if st < 400 and isinstance(es_data, list) and len(es_data) > 0:
                    msg = es_data[0].get("broadcast_msg")
                    if msg:
                        try:
                            cloud_scores = json.loads(msg)
                        except Exception:
                            cloud_scores = {}
                if scores_map:
                    cloud_scores[r_key] = scores_map
                elif scores:
                    cloud_scores[r_key] = {
                        (sc.get("player_handle") or "").lower(): sc for sc in scores if sc.get("player_handle")
                    }
                supabase_request("event_state", method="POST", data=[{
                    "id": "tournament_scores",
                    "boss_hp": "0",
                    "broadcast_msg": json.dumps(cloud_scores),
                    "updated_at": datetime.datetime.utcnow().isoformat()
                }], headers={"Prefer": "resolution=merge-duplicates"})
            except Exception:
                pass

        elif "event-state" in path:
            body = self._get_body_json()
            payload = {
                "id": str(body.get("id", "global")),
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

        elif "rounds" in path:
            body = self._get_body_json()
            r_num = body.get("round_number")
            status_val = body.get("status")
            if not r_num or not status_val:
                self._send_json(400, {"error": "round_number and status are required"})
                return

            if status_val == "OPEN":
                supabase_request(f"tournament_rounds?round_number=neq.{r_num}", method="PATCH", data={"status": "NOT_STARTED"})

            status, res = supabase_request(
                f"tournament_rounds?round_number=eq.{r_num}",
                method="PATCH",
                data={"status": status_val}
            )
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

        elif "teams" in path:
            team_id = query.get("id", [None])[0]
            if not team_id:
                try:
                    body = self._get_body_json()
                    team_id = body.get("id")
                except Exception:
                    pass

            if not team_id:
                self._send_json(400, {"error": "id is required"})
                return

            supabase_request(f"tournament_team_members?team_id=eq.{team_id}", method="DELETE")
            status, res = supabase_request(f"tournament_teams?id=eq.{team_id}", method="DELETE")
            self._send_json(200, {"success": True, "deleted_id": team_id})
            return

        self._send_json(404, {"error": "Not Found"})
