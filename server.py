#!/usr/bin/env python3
"""
Tech Boss 2026 — Local Backend Server & API Gateway
Provides backend API endpoints connected to Supabase PostgreSQL database
and serves frontend static files.
"""

import os
import json
import socket
import time
import datetime
import sys
import threading
import subprocess
import argparse
import signal
import uuid
import urllib.request  # Basic server setup for Tech Boss 2026
import urllib.parse
import urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

PORT = int(os.environ.get("PORT", 3000))
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

TOURNAMENT_CACHE = {
    "teams": {},
    "scores": {},
    "rounds": []
}

class TechBossHandler(SimpleHTTPRequestHandler):
    def guess_type(self, path):
        path_str = str(path)
        if "WhatsApp Image 2026-09-10 at 12.48.46" in path_str:
            return "audio/mpeg"
        if "Times" in path_str or "/Times/" in path_str:
            if path_str.endswith(".mp3") or path_str.endswith(".jpeg") or path_str.endswith(".jpg"):
                return "audio/mpeg"
        if path_str.endswith(".mp3"):
            return "audio/mpeg"
        return super().guess_type(path)

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
            query = urllib.parse.parse_qs(parsed.query)
            state_id = query.get("id", ["global"])[0]
            status, data = supabase_request(f"event_state?id=eq.{state_id}")
            item = data[0] if (isinstance(data, list) and len(data) > 0) else {"id": state_id, "boss_hp": "78", "broadcast_msg": ""}
            self._send_json(200, {"success": True, "event_state": item})
            return

        elif path == "/api/rounds":
            status, data = supabase_request("tournament_rounds?select=*&order=round_number.asc")
            if status < 400 and isinstance(data, list) and len(data) > 0:
                TOURNAMENT_CACHE["rounds"] = data
                self._send_json(200, {"success": True, "rounds": data})
                return

            if not TOURNAMENT_CACHE["rounds"]:
                st, es_data = supabase_request("event_state?id=eq.tournament_rounds&select=*")
                if st < 400 and isinstance(es_data, list) and len(es_data) > 0:
                    msg = es_data[0].get("broadcast_msg")
                    if msg:
                        try:
                            parsed_r = json.loads(msg)
                            if isinstance(parsed_r, list) and len(parsed_r) > 0:
                                TOURNAMENT_CACHE["rounds"] = parsed_r
                        except Exception:
                            pass

            if not TOURNAMENT_CACHE["rounds"]:
                TOURNAMENT_CACHE["rounds"] = [
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
            self._send_json(200, {"success": True, "rounds": TOURNAMENT_CACHE["rounds"]})
            return

        elif path == "/api/teams":
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
            elif scope and scope in TOURNAMENT_CACHE["teams"]:
                teams = TOURNAMENT_CACHE["teams"].get(scope, [])
            elif not scope and any(TOURNAMENT_CACHE["teams"].values()):
                teams = [t for sub in TOURNAMENT_CACHE["teams"].values() for t in sub]
            else:
                st, es_data = supabase_request("event_state?id=eq.tournament_teams&select=*")
                if st < 400 and isinstance(es_data, list) and len(es_data) > 0:
                    msg = es_data[0].get("broadcast_msg")
                    if msg:
                        try:
                            parsed_t = json.loads(msg)
                            if isinstance(parsed_t, dict):
                                TOURNAMENT_CACHE["teams"] = parsed_t
                                if scope:
                                    teams = parsed_t.get(scope, [])
                                else:
                                    teams = [t for sub in parsed_t.values() for t in sub]
                        except Exception:
                            pass
            self._send_json(200, {"success": True, "teams": teams})
            return

        elif path == "/api/scores":
            query = urllib.parse.parse_qs(parsed.query)
            r_num = query.get("round", [None])[0]
            mapped = {}

            # 1. Check in-memory cache
            if r_num and str(r_num) in TOURNAMENT_CACHE["scores"] and len(TOURNAMENT_CACHE["scores"][str(r_num)]) > 0:
                mapped = TOURNAMENT_CACHE["scores"][str(r_num)]
            else:
                # 2. Check event_state?id=eq.tournament_scores in Supabase
                st, es_data = supabase_request("event_state?id=eq.tournament_scores&select=*")
                if st < 400 and isinstance(es_data, list) and len(es_data) > 0:
                    msg = es_data[0].get("broadcast_msg")
                    if msg:
                        try:
                            cloud_scores = json.loads(msg)
                            for k, v in cloud_scores.items():
                                TOURNAMENT_CACHE["scores"][str(k)] = v
                            if r_num:
                                mapped = cloud_scores.get(str(r_num), {})
                            else:
                                mapped = cloud_scores
                        except Exception:
                            pass

                # 3. Fallback to tournament_scores table if available
                if not mapped:
                    url = "tournament_scores?select=*&order=player_handle.asc"
                    if r_num:
                        url += f"&round_number=eq.{urllib.parse.quote(r_num)}"
                    status, data = supabase_request(url)
                    if status < 400 and isinstance(data, list) and len(data) > 0:
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

        elif path == "/api/health":
            self._send_json(200, {"status": "healthy", "database": "connected", "server": "multi-threaded"})
            return

        # Clean URL rewrite support (e.g. /admin -> /admin.html, /gamezone -> /gamezone.html)
        rel_path = path.lstrip("/")
        if rel_path and not os.path.splitext(rel_path)[1]:
            html_candidate = rel_path + ".html"
            if os.path.exists(html_candidate):
                self.path = "/" + html_candidate

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
                "fee": body.get("fee", "60"),
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
                    if score_val > dedup_map[key]["score"]:
                        dedup_map[key]["score"] = score_val
                    if name and not dedup_map[key]["name"]:
                        dedup_map[key]["name"] = name
                else:
                    dedup_map[key] = {
                        "handle": raw_handle or (f"@{name.lower()[:10]}" if name else "@challenger"),
                        "name": name,
                        "score": score_val,
                        "boss_dmg": item.get("bossDmg") or item.get("boss_dmg", f"{score_val} DMG"),
                        "streak": item.get("streak", "0 WINS"),
                        "avatar": item.get("avatar", "01"),
                        "badge": item.get("badge", "")
                    }

            deduped_board = sorted(dedup_map.values(), key=lambda x: x["score"], reverse=True)
            for idx, entry in enumerate(deduped_board):
                entry["rank"] = idx + 1
                if not entry.get("avatar"):
                    entry["avatar"] = f"0{(idx % 8) + 1}"

            supabase_request("leaderboard?id=neq.0", method="DELETE")
            if deduped_board:
                supabase_request("leaderboard", method="POST", data=deduped_board)

            self._send_json(200, {
                "success": True,
                "message": f"Leaderboard updated with {len(deduped_board)} unique contenders",
                "leaderboard": deduped_board
            })
            return

        elif path == "/api/event-state":
            body = self._get_body_json()
            payload = {
                "id": str(body.get("id", "global")),
                "boss_hp": str(body.get("boss_hp", "78")),
                "broadcast_msg": str(body.get("broadcast_msg", ""))
            }
            supabase_request("event_state", method="POST", data=[payload], headers={"Prefer": "resolution=merge-duplicates"})
            self._send_json(200, {"success": True, "event_state": payload})
            return

        elif path == "/api/teams":
            body = self._get_body_json()
            scope = body.get("round_scope") or body.get("scope") or "ROUND_2"

            # Support bulk replace of teams for a scope
            bulk_teams = body.get("teams")
            if isinstance(bulk_teams, list):
                if scope not in TOURNAMENT_CACHE["teams"]:
                    TOURNAMENT_CACHE["teams"][scope] = []
                TOURNAMENT_CACHE["teams"][scope] = bulk_teams
                try:
                    supabase_request("event_state", method="POST", data=[{
                        "id": "tournament_teams",
                        "boss_hp": "0",
                        "broadcast_msg": json.dumps(TOURNAMENT_CACHE["teams"]),
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
            tid = team.get("id") or f"team_{int(time.time()*1000)}"
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
            created_team["id"] = actual_tid
            created_team["round_scope"] = scope
            created_team["team_name"] = team_name
            created_team["members"] = team.get("members", [])

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

            # Keep in-memory cache synchronized
            if scope not in TOURNAMENT_CACHE["teams"]:
                TOURNAMENT_CACHE["teams"][scope] = []
            TOURNAMENT_CACHE["teams"][scope] = [t for t in TOURNAMENT_CACHE["teams"][scope] if str(t.get("id")) != str(actual_tid)]
            TOURNAMENT_CACHE["teams"][scope].append(created_team)

            # Persist teams into Supabase event_state: id=tournament_teams
            try:
                supabase_request("event_state", method="POST", data=[{
                    "id": "tournament_teams",
                    "boss_hp": "0",
                    "broadcast_msg": json.dumps(TOURNAMENT_CACHE["teams"]),
                    "updated_at": datetime.datetime.utcnow().isoformat()
                }], headers={"Prefer": "resolution=merge-duplicates"})
            except Exception:
                pass

            self._send_json(200, {"success": True, "team": created_team})
            return

        elif path == "/api/scores":
            body = self._get_body_json()
            r_num = body.get("round_number")
            scores = body.get("scores", [])
            scores_map = body.get("scoresMap") or {}
            if not r_num:
                self._send_json(400, {"error": "round_number is required"})
                return

            r_key = str(r_num)
            if r_key not in TOURNAMENT_CACHE["scores"]:
                TOURNAMENT_CACHE["scores"][r_key] = {}
            if isinstance(scores_map, dict) and len(scores_map) > 0:
                TOURNAMENT_CACHE["scores"][r_key].update(scores_map)
            for sc in scores:
                raw_h = (sc.get("player_handle") or "").lower()
                if raw_h:
                    TOURNAMENT_CACHE["scores"][r_key][raw_h] = sc

            # 1. Direct table fallback (if exists)
            if scores:
                supabase_request(
                    "tournament_scores",
                    method="POST",
                    data=scores,
                    headers={"Prefer": "resolution=merge-duplicates"}
                )

            # 2. Permanent Supabase cloud storage in event_state (id: tournament_scores)
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
                cloud_scores[r_key] = TOURNAMENT_CACHE["scores"][r_key]
                supabase_request("event_state", method="POST", data=[{
                    "id": "tournament_scores",
                    "boss_hp": "0",
                    "broadcast_msg": json.dumps(cloud_scores),
                    "updated_at": datetime.datetime.utcnow().isoformat()
                }], headers={"Prefer": "resolution=merge-duplicates"})
            except Exception:
                pass

            self._send_json(200, {"success": True, "count": len(TOURNAMENT_CACHE["scores"][r_key])})
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

        elif path == "/api/rounds":
            body = self._get_body_json()
            r_num = body.get("round_number")
            status_val = body.get("status")
            if not r_num or not status_val:
                self._send_json(400, {"error": "round_number and status are required"})
                return

            if status_val == "OPEN":
                # Set all other rounds to NOT_STARTED
                supabase_request(f"tournament_rounds?round_number=neq.{r_num}", method="PATCH", data={"status": "NOT_STARTED"})
                for r in TOURNAMENT_CACHE["rounds"]:
                    if str(r.get("round_number")) != str(r_num):
                        r["status"] = "NOT_STARTED"

            status, res = supabase_request(
                f"tournament_rounds?round_number=eq.{r_num}",
                method="PATCH",
                data={"status": status_val}
            )
            # Update in-memory cache and event_state
            for r in TOURNAMENT_CACHE["rounds"]:
                if str(r.get("round_number")) == str(r_num):
                    r["status"] = status_val
            try:
                now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
                state_data = {
                    "id": "tournament_rounds",
                    "broadcast_msg": json.dumps(TOURNAMENT_CACHE["rounds"]),
                    "boss_hp": "0",
                    "updated_at": now_str
                }
                supabase_request("event_state", method="POST", data=state_data, headers={"Prefer": "resolution=merge-duplicates"})
            except Exception:
                pass
            self._send_json(200, {"success": True, "updated": res, "rounds": TOURNAMENT_CACHE["rounds"]})
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

        elif path == "/api/teams":
            team_id = query.get("id", [None])[0]
            scope = query.get("scope", query.get("round_scope", [None]))[0]
            if not team_id:
                body = self._get_body_json()
                team_id = body.get("id")
                if not scope:
                    scope = body.get("scope") or body.get("round_scope")

            if not team_id and scope:
                if scope in TOURNAMENT_CACHE["teams"]:
                    TOURNAMENT_CACHE["teams"][scope] = []
                try:
                    supabase_request("event_state", method="POST", data=[{
                        "id": "tournament_teams",
                        "boss_hp": "0",
                        "broadcast_msg": json.dumps(TOURNAMENT_CACHE["teams"]),
                        "updated_at": datetime.datetime.utcnow().isoformat()
                    }], headers={"Prefer": "resolution=merge-duplicates"})
                except Exception:
                    pass
                self._send_json(200, {"success": True, "cleared_scope": scope})
                return

            if not team_id:
                self._send_json(400, {"error": "id or scope is required"})
                return

            supabase_request(f"tournament_team_members?team_id=eq.{team_id}", method="DELETE")
            status, res = supabase_request(f"tournament_teams?id=eq.{team_id}", method="DELETE")
            for sc in TOURNAMENT_CACHE["teams"]:
                TOURNAMENT_CACHE["teams"][sc] = [t for t in TOURNAMENT_CACHE["teams"][sc] if str(t.get("id")) != str(team_id)]
            try:
                state_data = {
                    "id": "tournament_teams",
                    "broadcast_msg": json.dumps(TOURNAMENT_CACHE["teams"]),
                    "boss_hp": "0",
                    "updated_at": datetime.datetime.utcnow().isoformat()
                }
                supabase_request("event_state", method="POST", data=[state_data], headers={"Prefer": "resolution=merge-duplicates"})
            except Exception:
                pass
            self._send_json(200, {"success": True, "deleted_id": team_id})
            return

        self._send_json(404, {"error": "Not Found"})

class ThreadedHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server_address = ("0.0.0.0", PORT)
    httpd = ThreadedHTTPServer(server_address, TechBossHandler)
    local_ip = get_local_ip()

    print("=" * 66)
    print("🚀 TECH BOSS 2026 — CROSS-DEVICE LOCAL SERVER")
    print("=" * 66)
    print(f"💻 On this computer:")
    print(f"   👉 http://localhost:{PORT}")
    print(f"   👉 http://127.0.0.1:{PORT}")
    print(f"\n📱 On OTHER DEVICES (Mobile phones, tablets, other laptops on Wi-Fi):")
    print(f"   👉 http://{local_ip}:{PORT}")
    print(f"   👉 http://{local_ip}:{PORT}/admin.html   (Organizer Terminal)")
    print(f"   👉 http://{local_ip}:{PORT}/gamezone.html (Game Zone & Dashboard)")
    print("-" * 66)
    print(f"📡 Supabase PostgreSQL Database: {SUPABASE_URL}")
    print("=" * 66)
    print(f"⚡ Ready and accepting connections from any device on your Wi-Fi...")
    httpd.serve_forever()
