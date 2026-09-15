// ========================================================
// TECH BOSS 2026 — BACKEND API & CLOUD DATABASE ADAPTER
// ========================================================

(function () {
  var DEFAULT_SUPABASE_URL = 'https://sgcqsfgjiofoqdylrvoi.supabase.co';
  var DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_OX9axwl6GT-p2twCa7lw3w_cadfJJJj';

  function getSupabaseConfig() {
    var storedUrl = localStorage.getItem('techboss_supabase_url');
    var storedKey = localStorage.getItem('techboss_supabase_anon_key');
    return {
      url: (storedUrl && storedUrl.trim()) || DEFAULT_SUPABASE_URL,
      key: (storedKey && storedKey.trim()) || DEFAULT_SUPABASE_ANON_KEY
    };
  }

  function setSupabaseConfig(url, key) {
    if (url) localStorage.setItem('techboss_supabase_url', url.trim());
    else localStorage.removeItem('techboss_supabase_url');

    if (key) localStorage.setItem('techboss_supabase_anon_key', key.trim());
    else localStorage.removeItem('techboss_supabase_anon_key');

    initSupabaseClient();
  }

  var client = null;

  function initSupabaseClient() {
    var config = getSupabaseConfig();
    if (window.supabase && config.url && config.key && config.url.startsWith('https://')) {
      try {
        client = window.supabase.createClient(config.url, config.key, {
          realtime: {
            params: {
              eventsPerSecond: 10
            }
          }
        });
      } catch (err) {
        client = null;
      }
    } else {
      client = null;
    }
    return client;
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', initSupabaseClient);
    } else {
      initSupabaseClient();
    }
  }

  // ==========================================
  // 1. REGISTRATIONS API
  // ==========================================

  async function addRegistration(regData) {
    var payload = {
      name: regData.name || '',
      reg_no: (regData.regNo || regData.reg_no || '').trim().toUpperCase(),
      branch: regData.branch || '',
      year: regData.year || '',
      phone: regData.phone || '',
      handle: regData.handle || '',
      pass: regData.pass || 'All-Access Solo Pass',
      fee: regData.fee || '60',
      screenshot: regData.screenshot || '',
      status: regData.status || 'PENDING'
    };

    // Step 1: Call Backend Server API endpoint (/api/register)
    try {
      var apiResp = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (apiResp.status === 200 || apiResp.status === 201) {
        var apiResult = await apiResp.json();
        console.log('✅ Backend API: Registration saved in database:', apiResult);
        return { success: true, data: apiResult.participant || payload };
      } else if (apiResp.status === 409 || apiResp.status === 400) {
        var errJson = await apiResp.json();
        return { success: false, error: errJson.error || 'Validation error' };
      }
    } catch (apiErr) {
      console.warn('Backend API endpoint not reachable directly, trying direct database connector:', apiErr);
    }

    // Step 2: Direct Database Fallback (if on static hosting / direct file access)
    var config = getSupabaseConfig();
    if (config.url && config.key) {
      try {
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/registrations';
        var resp = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'apikey': config.key,
            'Authorization': 'Bearer ' + config.key,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(payload)
        });

        if (resp.ok) {
          var data = await resp.json();
          console.log('✅ Direct Database Insert Success:', data);
          return { success: true, data: data[0] || payload };
        } else {
          var errText = await resp.text();
          try {
            var parsed = JSON.parse(errText);
            return { success: false, error: parsed.message || 'Database error' };
          } catch (e) {
            return { success: false, error: errText };
          }
        }
      } catch (fErr) {
        return { success: false, error: fErr.message };
      }
    }

    return { success: false, error: 'Database connection not configured' };
  }

  async function fetchRegistrations() {
    // Step 1: Call Backend API (/api/registrations)
    try {
      var apiResp = await fetch('/api/registrations');
      if (apiResp.ok) {
        var apiResult = await apiResp.json();
        if (apiResult.success && Array.isArray(apiResult.registrations)) {
          return apiResult.registrations.map(function (row) {
            return {
              id: row.id,
              name: row.name,
              regNo: row.reg_no,
              branch: row.branch,
              year: row.year,
              phone: row.phone,
              handle: row.handle,
              pass: row.pass,
              fee: row.fee,
              screenshot: row.screenshot,
              status: row.status,
              date: row.created_at ? new Date(row.created_at).toLocaleString() : ''
            };
          });
        }
      }
    } catch (e) {}

    // Step 2: Direct Database Fetch Fallback
    var config = getSupabaseConfig();
    if (config.url && config.key) {
      try {
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/registrations?select=*&order=created_at.desc';
        var resp = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'apikey': config.key,
            'Authorization': 'Bearer ' + config.key
          }
        });
        if (resp.ok) {
          var rows = await resp.json();
          return rows.map(function (row) {
            return {
              id: row.id,
              name: row.name,
              regNo: row.reg_no,
              branch: row.branch,
              year: row.year,
              phone: row.phone,
              handle: row.handle,
              pass: row.pass,
              fee: row.fee,
              screenshot: row.screenshot,
              status: row.status,
              date: row.created_at ? new Date(row.created_at).toLocaleString() : ''
            };
          });
        }
      } catch (fErr) {
        console.warn('Direct Database fetch error:', fErr);
      }
    }
    return null;
  }

  async function updateRegistrationStatus(id, newStatus) {
    try {
      var apiResp = await fetch('/api/registrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, status: newStatus })
      });
      if (apiResp.ok) return true;
    } catch (e) {}

    var config = getSupabaseConfig();
    if (config.url && config.key && id) {
      try {
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/registrations?id=eq.' + id;
        var resp = await fetch(apiUrl, {
          method: 'PATCH',
          headers: {
            'apikey': config.key,
            'Authorization': 'Bearer ' + config.key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: newStatus })
        });
        if (resp.ok) return true;
      } catch (e) {}
    }
    return false;
  }

  async function deleteRegistration(id) {
    try {
      var apiResp = await fetch('/api/registrations?id=' + encodeURIComponent(id), {
        method: 'DELETE'
      });
      if (apiResp.ok) return true;
    } catch (e) {}

    var config = getSupabaseConfig();
    if (config.url && config.key && id) {
      try {
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/registrations?id=eq.' + id;
        var resp = await fetch(apiUrl, {
          method: 'DELETE',
          headers: {
            'apikey': config.key,
            'Authorization': 'Bearer ' + config.key
          }
        });
        if (resp.ok) return true;
      } catch (e) {}
    }
    return false;
  }

  // ==========================================
  // 2. LEADERBOARD API
  // ==========================================

  function deduplicateBoardItems(list) {
    if (!Array.isArray(list)) return [];
    var map = new Map();
    list.forEach(function (item) {
      if (!item) return;
      var rawH = (item.handle || '').trim();
      var handle = rawH ? (rawH.startsWith('@') ? rawH : ('@' + rawH)) : '';
      var name = (item.name || '').trim();
      var scoreVal = parseInt(item.score || 0, 10);
      if (isNaN(scoreVal)) scoreVal = 0;

      var normH = handle.toLowerCase().replace(/[^a-z0-9_]/g, '');
      var normN = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      var key = normH || normN || ('id_' + (item.id || Math.random()));

      if (map.has(key)) {
        var ex = map.get(key);
        if (scoreVal > ex.score) {
          ex.score = scoreVal;
          ex.bossDmg = scoreVal + ' DMG';
          ex.boss_dmg = scoreVal + ' DMG';
        }
        if (!ex.name && name) ex.name = name;
        if (item.avatar) ex.avatar = item.avatar;
        if (item.badge) ex.badge = item.badge;
      } else {
        map.set(key, {
          id: item.id,
          rank: item.rank,
          handle: handle || (name ? ('@' + name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)) : '@challenger'),
          name: name,
          score: scoreVal,
          bossDmg: item.bossDmg || item.boss_dmg || (scoreVal + ' DMG'),
          boss_dmg: item.boss_dmg || item.bossDmg || (scoreVal + ' DMG'),
          streak: item.streak || '0 WINS',
          avatar: item.avatar || '',
          badge: item.badge || ''
        });
      }
    });

    var result = Array.from(map.values());
    result.sort(function (a, b) { return b.score - a.score; });
    result.forEach(function (item, idx) {
      item.rank = idx + 1;
      if (!item.avatar) item.avatar = '0' + ((idx % 8) + 1);
    });
    return result;
  }

  async function fetchLeaderboard() {
    try {
      var apiResp = await fetch('/api/leaderboard');
      if (apiResp.ok) {
        var apiResult = await apiResp.json();
        if (apiResult.success && Array.isArray(apiResult.leaderboard)) {
          var mapped = apiResult.leaderboard.map(function (row) {
            return {
              id: row.id,
              rank: row.rank,
              handle: row.handle,
              name: row.name,
              score: row.score,
              bossDmg: row.boss_dmg,
              streak: row.streak,
              avatar: row.avatar,
              badge: row.badge
            };
          });
          return deduplicateBoardItems(mapped);
        }
      }
    } catch (e) {}

    var config = getSupabaseConfig();
    if (config.url && config.key) {
      try {
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/leaderboard?select=*&order=rank.asc';
        var resp = await fetch(apiUrl, {
          headers: { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key }
        });
        if (resp.ok) {
          var rows = await resp.json();
          var mapped = rows.map(function (row) {
            return {
              id: row.id,
              rank: row.rank,
              handle: row.handle,
              name: row.name,
              score: row.score,
              bossDmg: row.boss_dmg,
              streak: row.streak,
              avatar: row.avatar,
              badge: row.badge
            };
          });
          return deduplicateBoardItems(mapped);
        }
      } catch (e) {}
    }
    return null;
  }

  async function saveLeaderboard(boardData) {
    var cleanBoard = deduplicateBoardItems(boardData);
    try {
      var apiResp = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboard: cleanBoard })
      });
      if (apiResp.ok) return true;
    } catch (e) {}

    var config = getSupabaseConfig();
    var cli = client || initSupabaseClient();
    if (cli && Array.isArray(cleanBoard)) {
      try {
        await cli.from('leaderboard').delete().neq('id', 0);
        if (cleanBoard.length > 0) {
          var payload = cleanBoard.map(function (item, idx) {
            return {
              rank: item.rank || (idx + 1),
              handle: item.handle || '',
              name: item.name || '',
              score: parseInt(item.score, 10) || 0,
              boss_dmg: item.bossDmg || item.boss_dmg || (item.score + ' DMG'),
              streak: item.streak || '0 WINS',
              avatar: item.avatar || ('0' + ((idx % 8) + 1)),
              badge: item.badge || ''
            };
          });
          await cli.from('leaderboard').insert(payload);
        }
        return true;
      } catch (err) {}
    }
    return false;
  }

  // ==========================================
  // 3. EVENT STATE API
  // ==========================================

  async function fetchEventState() {
    try {
      var apiResp = await fetch('/api/event-state');
      if (apiResp.ok) {
        var apiResult = await apiResp.json();
        if (apiResult.success && apiResult.event_state) {
          return {
            bossHp: apiResult.event_state.boss_hp,
            broadcastMsg: apiResult.event_state.broadcast_msg
          };
        }
      }
    } catch (e) {}

    var config = getSupabaseConfig();
    if (config.url && config.key) {
      try {
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/event_state?id=eq.global';
        var resp = await fetch(apiUrl, {
          headers: { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key }
        });
        if (resp.ok) {
          var rows = await resp.json();
          if (rows.length > 0) {
            return {
              bossHp: rows[0].boss_hp,
              broadcastMsg: rows[0].broadcast_msg
            };
          }
        }
      } catch (e) {}
    }
    return null;
  }

  async function saveEventState(bossHp, broadcastMsg) {
    try {
      var apiResp = await fetch('/api/event-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boss_hp: bossHp, broadcast_msg: broadcastMsg })
      });
      if (apiResp.ok) return true;
    } catch (e) {}

    var config = getSupabaseConfig();
    if (config.url && config.key) {
      try {
        var payload = {
          id: 'global',
          boss_hp: bossHp !== undefined ? String(bossHp) : '78',
          broadcast_msg: broadcastMsg !== undefined ? String(broadcastMsg) : '',
          updated_at: new Date().toISOString()
        };
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/event_state';
        await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'apikey': config.key,
            'Authorization': 'Bearer ' + config.key,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(payload)
        });
        return true;
      } catch (e) {}
    }
    return false;
  }

  async function triggerArenaAudio(trackName) {
    try {
      var payload = JSON.stringify({
        type: 'AUDIO_TRIGGER',
        track: trackName || 'times-9am',
        timestamp: Date.now()
      });
      var hp = localStorage.getItem('techboss_boss_hp') || '78';
      return await saveEventState(hp, payload);
    } catch (e) {
      return false;
    }
  }

  // ==========================================
  // 4. IN-HOUSE CHECK-INS CLOUD API
  // ==========================================

  async function fetchInHouseCheckins() {
    var config = getSupabaseConfig();
    if (config.url && config.key) {
      try {
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/event_state?id=eq.inhouse_checkins';
        var resp = await fetch(apiUrl, {
          headers: { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key }
        });
        if (resp.ok) {
          var rows = await resp.json();
          if (rows.length > 0 && rows[0].broadcast_msg) {
            try {
              var parsed = JSON.parse(rows[0].broadcast_msg);
              return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (e) {
              return {};
            }
          }
          return {};
        }
      } catch (e) {}
    }
    return null;
  }

  async function saveInHouseCheckinsCloud(inHouseMap) {
    var config = getSupabaseConfig();
    if (config.url && config.key) {
      try {
        var payload = {
          id: 'inhouse_checkins',
          boss_hp: '0',
          broadcast_msg: typeof inHouseMap === 'string' ? inHouseMap : JSON.stringify(inHouseMap || {}),
          updated_at: new Date().toISOString()
        };
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/event_state';
        var resp = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'apikey': config.key,
            'Authorization': 'Bearer ' + config.key,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(payload)
        });
        return resp.ok;
      } catch (e) {}
    }
    return false;
  }

  async function checkinContenderCloud(record) {
    if (!record || !record.handle) return false;
    var normHandle = record.handle.toLowerCase().trim();
    if (!normHandle.startsWith('@')) normHandle = '@' + normHandle;

    var currentMap = {};
    try {
      var cloudMap = await fetchInHouseCheckins();
      if (cloudMap && typeof cloudMap === 'object') {
        currentMap = cloudMap;
      } else {
        var localRaw = localStorage.getItem('techboss_inhouse_checkins');
        currentMap = localRaw ? JSON.parse(localRaw) : {};
      }
    } catch (e) {
      try {
        var localRaw2 = localStorage.getItem('techboss_inhouse_checkins');
        currentMap = localRaw2 ? JSON.parse(localRaw2) : {};
      } catch (e2) {}
    }

    currentMap[normHandle] = record;
    try {
      localStorage.setItem('techboss_inhouse_checkins', JSON.stringify(currentMap));
    } catch (e) {}

    return await saveInHouseCheckinsCloud(currentMap);
  }

  // ==========================================
  // 5. REAL-TIME SUBSCRIPTIONS
  // ==========================================

  function subscribeToRegistrations(onEvent) {
    var cli = client || initSupabaseClient();
    if (!cli) return null;

    try {
      var channel = cli
        .channel('public:registrations:' + Date.now())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, function (payload) {
          if (typeof onEvent === 'function') onEvent(payload);
        })
        .subscribe();

      return channel;
    } catch (e) {
      return null;
    }
  }

  function subscribeToLeaderboard(onEvent) {
    var cli = client || initSupabaseClient();
    if (!cli) return null;

    try {
      var channel = cli
        .channel('public:leaderboard:' + Date.now())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leaderboard' }, function (payload) {
          if (typeof onEvent === 'function') onEvent(payload);
        })
        .subscribe();

      return channel;
    } catch (e) {
      return null;
    }
  }

  function subscribeToEventState(onEvent) {
    var cli = client || initSupabaseClient();
    if (!cli) return null;

    try {
      var channel = cli
        .channel('public:event_state:' + Date.now())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_state' }, function (payload) {
          // Strictly ignore inhouse_checkins row so it doesn't trigger broadcast announcements
          if (payload && payload.new && payload.new.id && payload.new.id !== 'global') {
            return;
          }
          if (typeof onEvent === 'function') onEvent(payload);
        })
        .subscribe();

      return channel;
    } catch (e) {
      return null;
    }
  }

  function subscribeToInHouseCheckins(onUpdate) {
    var cli = client || initSupabaseClient();
    if (!cli) return null;

    try {
      var channel = cli
        .channel('public:inhouse_checkins:' + Date.now())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_state' }, function (payload) {
          if (payload && payload.new && payload.new.id === 'inhouse_checkins') {
            try {
              var map = JSON.parse(payload.new.broadcast_msg || '{}');
              if (typeof onUpdate === 'function') onUpdate(map, payload);
            } catch (e) {}
          }
        })
        .subscribe();

      return channel;
    } catch (e) {
      return null;
    }
  }

  // ==========================================
  // 6. 9-ROUND TOURNAMENT SYSTEM API
  // ==========================================

  var DEFAULT_ROUNDS = [
    { round_number: 1, title: 'Round 1: Solo Inception', type: 'INDIVIDUAL', status: 'OPEN', team_scope: null },
    { round_number: 2, title: 'Round 2: Quad Synergy (Auto 4-Player)', type: 'TEAM', status: 'OPEN', team_scope: 'ROUND_2' },
    { round_number: 3, title: 'Round 3: Alliance Forge (Manual Teams)', type: 'TEAM', status: 'OPEN', team_scope: 'ROUND_3_4' },
    { round_number: 4, title: 'Round 4: Alliance Climax (Same as Round 3)', type: 'TEAM', status: 'OPEN', team_scope: 'ROUND_3_4' },
    { round_number: 5, title: 'Round 5: Solo Cyber Duel', type: 'INDIVIDUAL', status: 'OPEN', team_scope: null },
    { round_number: 6, title: 'Round 6: Tactical Strike (Manual Teams)', type: 'TEAM', status: 'OPEN', team_scope: 'ROUND_6' },
    { round_number: 7, title: 'Round 7: Apex Legion (Manual Teams)', type: 'TEAM', status: 'OPEN', team_scope: 'ROUND_7' },
    { round_number: 8, title: 'Round 8: Solo Survival', type: 'INDIVIDUAL', status: 'OPEN', team_scope: null },
    { round_number: 9, title: 'Round 9: Championship Boss Battle', type: 'INDIVIDUAL', status: 'OPEN', team_scope: null }
  ];

  function getLocalTournamentRounds() {
    try {
      var raw = localStorage.getItem('techboss_tournament_rounds');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 9) return parsed;
      }
    } catch (e) {}
    localStorage.setItem('techboss_tournament_rounds', JSON.stringify(DEFAULT_ROUNDS));
    return JSON.parse(JSON.stringify(DEFAULT_ROUNDS));
  }

  function saveLocalTournamentRounds(rounds) {
    try {
      localStorage.setItem('techboss_tournament_rounds', JSON.stringify(rounds));
    } catch (e) {}
  }

  async function fetchTournamentRounds() {
    // 1. Try Backend API
    try {
      var apiResp = await fetch('/api/rounds');
      if (apiResp.ok) {
        var res = await apiResp.json();
        if (res.success && Array.isArray(res.rounds) && res.rounds.length > 0) {
          saveLocalTournamentRounds(res.rounds);
          return res.rounds;
        }
      }
    } catch (e) {}

    // 2. Try Supabase event_state: id=eq.tournament_rounds
    var config = getSupabaseConfig();
    if (config.url && config.key) {
      try {
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/event_state?id=eq.tournament_rounds';
        var resp = await fetch(apiUrl, {
          headers: { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key }
        });
        if (resp.ok) {
          var rows = await resp.json();
          if (rows.length > 0 && rows[0].broadcast_msg) {
            var parsedRounds = JSON.parse(rows[0].broadcast_msg);
            if (Array.isArray(parsedRounds) && parsedRounds.length > 0) {
              saveLocalTournamentRounds(parsedRounds);
              return parsedRounds;
            }
          }
        }
      } catch (e) {}

      // Fallback to tournament_rounds table if exists
      try {
        var apiUrl2 = config.url.replace(/\/$/, '') + '/rest/v1/tournament_rounds?select=*&order=round_number.asc';
        var resp2 = await fetch(apiUrl2, {
          headers: { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key }
        });
        if (resp2.ok) {
          var rows2 = await resp2.json();
          if (Array.isArray(rows2) && rows2.length > 0) {
            saveLocalTournamentRounds(rows2);
            return rows2;
          }
        }
      } catch (e) {}
    }

    return getLocalTournamentRounds();
  }

  async function updateRoundStatus(roundNumber, status) {
    var validStatus = ['NOT_STARTED', 'OPEN', 'LOCKED'].includes(status) ? status : 'OPEN';
    var rounds = getLocalTournamentRounds();
    var target = rounds.find(function(r) { return r.round_number === parseInt(roundNumber, 10); });
    if (target) {
      target.status = validStatus;
      saveLocalTournamentRounds(rounds);
    }

    // Broadcast live round update to scoreboard across browser tabs
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        var ch = new BroadcastChannel('techboss_sync_channel');
        ch.postMessage({ type: 'ROUND_STATUS_CHANGED', round_number: parseInt(roundNumber, 10), status: validStatus, rounds: rounds });
      } catch (e) {}
    }

    try {
      await fetch('/api/rounds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ round_number: roundNumber, status: validStatus })
      });
    } catch (e) {}

    var config = getSupabaseConfig();
    if (config.url && config.key) {
      try {
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/event_state';
        await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'apikey': config.key,
            'Authorization': 'Bearer ' + config.key,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            id: 'tournament_rounds',
            boss_hp: '0',
            broadcast_msg: JSON.stringify(rounds),
            updated_at: new Date().toISOString()
          })
        });
      } catch (e) {}
    }
    return true;
  }

  // --- TEAMS API ---
  function getLocalTournamentTeams(scope) {
    try {
      var raw = localStorage.getItem('techboss_tournament_teams');
      var map = raw ? JSON.parse(raw) : {};
      if (scope) {
        return Array.isArray(map[scope]) ? map[scope] : [];
      }
      return map;
    } catch (e) {
      return scope ? [] : {};
    }
  }

  function saveLocalTournamentTeams(scope, teamList) {
    try {
      var raw = localStorage.getItem('techboss_tournament_teams');
      var map = raw ? JSON.parse(raw) : {};
      map[scope] = teamList || [];
      localStorage.setItem('techboss_tournament_teams', JSON.stringify(map));
    } catch (e) {}
  }

  async function fetchTournamentTeams(scope) {
    if (!scope) return [];

    try {
      var apiResp = await fetch('/api/teams?scope=' + encodeURIComponent(scope));
      if (apiResp.ok) {
        var res = await apiResp.json();
        if (res.success && Array.isArray(res.teams)) {
          saveLocalTournamentTeams(scope, res.teams);
          return res.teams;
        }
      }
    } catch (e) {}

    var config = getSupabaseConfig();
    if (config.url && config.key) {
      try {
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/tournament_teams?round_scope=eq.' + encodeURIComponent(scope) + '&select=*,tournament_team_members(*)';
        var resp = await fetch(apiUrl, {
          headers: { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key }
        });
        if (resp.ok) {
          var rows = await resp.json();
          var formatted = rows.map(function(t) {
            return {
              id: t.id,
              team_name: t.team_name,
              round_scope: t.round_scope,
              members: (t.tournament_team_members || []).map(function(m) {
                return {
                  player_handle: m.player_handle,
                  player_name: m.player_name,
                  reg_no: m.reg_no
                };
              })
            };
          });
          saveLocalTournamentTeams(scope, formatted);
          return formatted;
        }
      } catch (e) {}
    }

    return getLocalTournamentTeams(scope);
  }

  async function saveTournamentTeam(scope, team) {
    if (!scope || !team || !team.team_name) return false;
    var localTeams = getLocalTournamentTeams(scope);
    var teamId = team.id || ('team_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
    var newObj = {
      id: teamId,
      team_name: team.team_name.trim(),
      round_scope: scope,
      members: Array.isArray(team.members) ? team.members : []
    };

    var exIdx = localTeams.findIndex(function(t) { return String(t.id) === String(teamId); });
    if (exIdx >= 0) {
      localTeams[exIdx] = newObj;
    } else {
      localTeams.push(newObj);
    }
    saveLocalTournamentTeams(scope, localTeams);

    // Backend / Supabase persistence
    try {
      await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: scope, team: newObj })
      });
    } catch (e) {}

    var config = getSupabaseConfig();
    if (config.url && config.key) {
      try {
        // Upsert to Supabase
        var teamPayload = { team_name: newObj.team_name, round_scope: scope };
        if (typeof teamId === 'number' || /^\d+$/.test(String(teamId))) {
          teamPayload.id = parseInt(teamId, 10);
        }
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/tournament_teams';
        var tResp = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'apikey': config.key,
            'Authorization': 'Bearer ' + config.key,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(teamPayload)
        });
        if (tResp.ok) {
          var tData = await tResp.json();
          var actualTeamId = (tData && tData[0] && tData[0].id) || teamId;
          newObj.id = actualTeamId;
          // Sync members
          if (newObj.members.length > 0) {
            var memPayload = newObj.members.map(function(m) {
              return {
                team_id: actualTeamId,
                player_handle: m.player_handle,
                player_name: m.player_name || '',
                reg_no: m.reg_no || ''
              };
            });
            await fetch(config.url.replace(/\/$/, '') + '/rest/v1/tournament_team_members?team_id=eq.' + actualTeamId, {
              method: 'DELETE',
              headers: { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key }
            });
            await fetch(config.url.replace(/\/$/, '') + '/rest/v1/tournament_team_members', {
              method: 'POST',
              headers: {
                'apikey': config.key,
                'Authorization': 'Bearer ' + config.key,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(memPayload)
            });
          }
        }
      } catch (e) {}
    }

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        var ch = new BroadcastChannel('techboss_sync_channel');
        ch.postMessage({ type: 'TEAMS_UPDATED', scope: scope, teams: localTeams, timestamp: Date.now() });
      } catch (e) {}
    }

    return newObj;
  }

  async function deleteTournamentTeam(scope, teamId) {
    if (!scope || !teamId) return false;
    var localTeams = getLocalTournamentTeams(scope);
    localTeams = localTeams.filter(function(t) { return String(t.id) !== String(teamId); });
    saveLocalTournamentTeams(scope, localTeams);

    try {
      await fetch('/api/teams?id=' + encodeURIComponent(teamId) + '&scope=' + encodeURIComponent(scope), {
        method: 'DELETE'
      });
    } catch (e) {}

    var config = getSupabaseConfig();
    if (config.url && config.key && (/^\d+$/.test(String(teamId)))) {
      try {
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/tournament_teams?id=eq.' + teamId;
        await fetch(apiUrl, {
          method: 'DELETE',
          headers: { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key }
        });
      } catch (e) {}
    }

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        var ch = new BroadcastChannel('techboss_sync_channel');
        ch.postMessage({ type: 'TEAMS_UPDATED', scope: scope, teams: localTeams, timestamp: Date.now() });
      } catch (e) {}
    }

    return true;
  }

  // Generate Round 2 Teams (Randomized groups of 4 only)
  async function generateRound2Teams(playerPool) {
    if (!Array.isArray(playerPool) || playerPool.length === 0) {
      return { success: false, error: 'No eligible contenders available for team generation.' };
    }

    // Clean and deduplicate candidates by handle
    var uniqueCandidates = [];
    var seenHandles = new Set();
    playerPool.forEach(function(p) {
      if (!p) return;
      var rawH = (p.handle || ('@' + (p.name || 'player').toLowerCase().replace(/[^a-z0-9]/g, ''))).trim();
      if (!rawH.startsWith('@')) rawH = '@' + rawH;
      var norm = rawH.toLowerCase();
      if (!seenHandles.has(norm)) {
        seenHandles.add(norm);
        uniqueCandidates.push({
          player_handle: rawH,
          player_name: p.name || 'Contender',
          reg_no: p.regNo || p.reg_no || ''
        });
      }
    });

    if (uniqueCandidates.length < 2) {
      return {
        success: false,
        error: 'At least 2 contenders are required to generate teams (found ' + uniqueCandidates.length + ').'
      };
    }

    // Fisher-Yates shuffle
    var shuffled = uniqueCandidates.slice();
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    var teamNames = [
      'TITAN SQUAD', 'APEX WARRIORS', 'CYBER REAPERS', 'PHANTOM PROTOCOL',
      'VORTEX ELITE', 'SHADOW MATRIX', 'NEXUS DIVISION', 'NEO VANGUARD',
      'HYPERION FORCE', 'QUANTUM ZERO', 'IRON DRAGONS', 'DELTA STRIKE',
      'OMEGA SENTINELS', 'VALKYRIE SQUAD', 'ECHO PROTOCOL', 'GHOST SQUADRON'
    ];

    var generatedTeams = [];
    var teamIndex = 0;
    // Chunk in groups of 4; any remaining contenders (e.g. 1, 2, or 3) form the extra squad
    for (var i = 0; i < shuffled.length; i += 4) {
      var members = shuffled.slice(i, i + 4);
      var teamName = teamNames[teamIndex] || ('TEAM ' + (teamIndex + 1));
      generatedTeams.push({
        id: 'r2_team_' + (teamIndex + 1) + '_' + Date.now(),
        team_name: teamName,
        round_scope: 'ROUND_2',
        members: members
      });
      teamIndex++;
    }

    saveLocalTournamentTeams('ROUND_2', generatedTeams);
    localStorage.setItem('techboss_round2_teams_generated', 'true');

    // Persist to server / Supabase
    for (var g = 0; g < generatedTeams.length; g++) {
      await saveTournamentTeam('ROUND_2', generatedTeams[g]);
    }

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        var ch = new BroadcastChannel('techboss_sync_channel');
        ch.postMessage({ type: 'TEAMS_UPDATED', scope: 'ROUND_2', teams: generatedTeams, timestamp: Date.now() });
      } catch (e) {}
    }

    return {
      success: true,
      teams: generatedTeams,
      count: generatedTeams.length,
      totalPlayers: shuffled.length
    };
  }

  // --- SCORES API ---
  function getLocalTournamentScores(roundNumber) {
    try {
      var raw = localStorage.getItem('techboss_tournament_scores');
      var map = raw ? JSON.parse(raw) : {};
      if (roundNumber !== undefined && roundNumber !== null) {
        return map[String(roundNumber)] || {};
      }
      return map;
    } catch (e) {
      return roundNumber !== undefined ? {} : {};
    }
  }

  function saveLocalTournamentScores(roundNumber, scoresMap) {
    try {
      var raw = localStorage.getItem('techboss_tournament_scores');
      var map = raw ? JSON.parse(raw) : {};
      map[String(roundNumber)] = scoresMap || {};
      localStorage.setItem('techboss_tournament_scores', JSON.stringify(map));
    } catch (e) {}
  }

  async function fetchTournamentScores(roundNumber) {
    var rKey = String(roundNumber);
    var localScores = getLocalTournamentScores(roundNumber);

    // 1. Try Backend API
    try {
      var apiResp = await fetch('/api/scores?round=' + rKey);
      if (apiResp.ok) {
        var res = await apiResp.json();
        if (res.success && res.scores && typeof res.scores === 'object' && Object.keys(res.scores).length > 0) {
          var merged = Object.assign({}, localScores, res.scores);
          saveLocalTournamentScores(roundNumber, merged);
          return merged;
        }
      }
    } catch (e) {}

    // 2. Try Supabase event_state: id=eq.tournament_scores (permanent cloud store)
    var config = getSupabaseConfig();
    if (config.url && config.key) {
      try {
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/event_state?id=eq.tournament_scores';
        var resp = await fetch(apiUrl, {
          headers: { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key }
        });
        if (resp.ok) {
          var rows = await resp.json();
          if (rows.length > 0 && rows[0].broadcast_msg) {
            var cloudAll = JSON.parse(rows[0].broadcast_msg);
            var cloudRound = cloudAll[rKey] || {};
            if (cloudRound && Object.keys(cloudRound).length > 0) {
              var merged2 = Object.assign({}, localScores, cloudRound);
              saveLocalTournamentScores(roundNumber, merged2);
              return merged2;
            }
          }
        }
      } catch (e) {}
    }

    // Return existing local scores without ever wiping
    return localScores;
  }

  async function saveTournamentScores(roundNumber, scoresMap) {
    var rNum = parseInt(roundNumber, 10);
    var rKey = String(rNum);
    saveLocalTournamentScores(rNum, scoresMap);

    var isTeamRound = [2, 3, 4, 6, 7].includes(rNum);
    var payloadList = [];

    for (var handleKey in scoresMap) {
      var item = scoresMap[handleKey] || {};
      var indScore = parseInt(item.individual_score, 10) || 0;
      var teamScore = isTeamRound ? (parseInt(item.team_score, 10) || 0) : 0;
      var total = item.round_total !== undefined ? parseInt(item.round_total, 10) : (isTeamRound ? (indScore + teamScore) : indScore);

      item.round_total = total;
      item.team_score = teamScore;
      item.individual_score = indScore;

      payloadList.push({
        round_number: rNum,
        player_handle: item.player_handle || handleKey,
        player_name: item.player_name || '',
        individual_score: indScore,
        team_id: item.team_id || null,
        team_score: teamScore,
        round_total: total,
        updated_at: new Date().toISOString()
      });
    }

    saveLocalTournamentScores(rNum, scoresMap);

    // 1. Call Backend API
    try {
      await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ round_number: rNum, scores: payloadList, scoresMap: scoresMap })
      });
    } catch (e) {}

    // 2. Direct Supabase Fallback using event_state (id: tournament_scores)
    var config = getSupabaseConfig();
    if (config.url && config.key) {
      try {
        var allScores = getLocalTournamentScores();
        allScores[rKey] = scoresMap;
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/event_state';
        await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'apikey': config.key,
            'Authorization': 'Bearer ' + config.key,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            id: 'tournament_scores',
            boss_hp: '0',
            broadcast_msg: JSON.stringify(allScores),
            updated_at: new Date().toISOString()
          })
        });
      } catch (e) {}
    }

    // 3. Recalculate Cumulative Leaderboard across all 9 rounds and sync!
    await calculateAndSyncCumulativeLeaderboard();
    return true;
  }

  // --- CUMULATIVE LEADERBOARD CALCULATION (ROUNDS 1 TO 9) ---
  async function calculateAndSyncCumulativeLeaderboard() {
    var allScoresMap = getLocalTournamentScores();
    var playerTotals = new Map();

    // Scan all 9 rounds in localStorage
    // Since scores are maintained till the end across rounds,
    // a player's cumulative score is the highest/maximum score reached across all played rounds.
    for (var r = 1; r <= 9; r++) {
      var roundScores = allScoresMap[String(r)] || {};
      var isTeamRound = [2, 3, 4, 6, 7].includes(r);

      for (var handleKey in roundScores) {
        var rec = roundScores[handleKey];
        if (!rec) continue;
        var rawH = (rec.player_handle || handleKey || '').trim();
        if (!rawH.startsWith('@')) rawH = '@' + rawH;
        var norm = rawH.toLowerCase();

        var indScore = parseInt(rec.individual_score, 10) || 0;
        var teamScore = isTeamRound ? (parseInt(rec.team_score, 10) || 0) : 0;
        var roundTotal = rec.round_total !== undefined ? parseInt(rec.round_total, 10) : (indScore + teamScore);

        if (!playerTotals.has(norm)) {
          playerTotals.set(norm, {
            handle: rawH,
            name: rec.player_name || '',
            cumulative_score: 0,
            rounds: {}
          });
        }

        var p = playerTotals.get(norm);
        if (rec.player_name && !p.name) p.name = rec.player_name;
        p.rounds[r] = roundTotal;
        // Scores maintained till end: cumulative score is highest score reached across rounds
        if (roundTotal > p.cumulative_score) {
          p.cumulative_score = roundTotal;
        }
      }
    }

    // In-house checkin filter: ONLY people who check in to house are tournament PLAYERS!
    // All remaining registrations are organizers and must NOT appear on the scoreboard.
    var inHouseMap = {};
    try {
      var rawInHouse = localStorage.getItem('techboss_inhouse_checkins');
      if (rawInHouse) inHouseMap = JSON.parse(rawInHouse);
    } catch (e) {}

    var activePlayerHandles = new Set();
    for (var k in inHouseMap) {
      var rec = inHouseMap[k];
      var rawH = (rec.handle || k || '').trim();
      if (!rawH.startsWith('@')) rawH = '@' + rawH;
      var norm = rawH.toLowerCase();
      activePlayerHandles.add(norm);

      if (!playerTotals.has(norm)) {
        playerTotals.set(norm, {
          handle: rawH,
          name: rec.name || 'Gladiator',
          cumulative_score: 0,
          rounds: {}
        });
      } else {
        var p = playerTotals.get(norm);
        if (rec.name && !p.name) p.name = rec.name;
      }
    }

    // Keep ONLY players who are in-house checked in
    var boardItems = [];
    playerTotals.forEach(function(pData, normKey) {
      if (activePlayerHandles.has(normKey)) {
        boardItems.push(pData);
      }
    });

    boardItems.sort(function(a, b) {
      if (b.cumulative_score !== a.cumulative_score) {
        return b.cumulative_score - a.cumulative_score;
      }
      return a.handle.localeCompare(b.handle);
    });

    boardItems.forEach(function(item, idx) {
      item.rank = idx + 1;
      item.score = item.cumulative_score;
      item.boss_dmg = item.cumulative_score + ' DMG';
      item.streak = (item.cumulative_score > 500 ? '3 WINS' : (item.cumulative_score > 0 ? '1 WIN' : '0 WINS'));
      item.avatar = '0' + ((idx % 8) + 1);
    });

    // Save locally
    localStorage.setItem('techboss_solo_leaderboard', JSON.stringify(boardItems));
    localStorage.setItem('techboss_board_updated_at', Date.now().toString());

    // Sync to Supabase leaderboard table for 100% backward compatibility
    await saveLeaderboard(boardItems);

    // Broadcast across tabs
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        var ch = new BroadcastChannel('techboss_sync_channel');
        ch.postMessage({ type: 'SCORE_UPDATE', timestamp: Date.now() });
      } catch (e) {}
    }

    return boardItems;
  }

  // Export to window global object
  window.TechBossSupabase = {
    isConfigured: function () {
      var cfg = getSupabaseConfig();
      return !!(cfg.url && cfg.key);
    },
    getConfig: getSupabaseConfig,
    setConfig: setSupabaseConfig,
    getClient: function () { return client || initSupabaseClient(); },
    addRegistration: addRegistration,
    fetchRegistrations: fetchRegistrations,
    updateRegistrationStatus: updateRegistrationStatus,
    deleteRegistration: deleteRegistration,
    fetchLeaderboard: fetchLeaderboard,
    saveLeaderboard: saveLeaderboard,
    fetchEventState: fetchEventState,
    saveEventState: saveEventState,
    triggerArenaAudio: triggerArenaAudio,
    fetchInHouseCheckins: fetchInHouseCheckins,
    saveInHouseCheckinsCloud: saveInHouseCheckinsCloud,
    checkinContenderCloud: checkinContenderCloud,
    subscribeToRegistrations: subscribeToRegistrations,
    subscribeToLeaderboard: subscribeToLeaderboard,
    subscribeToEventState: subscribeToEventState,
    subscribeToInHouseCheckins: subscribeToInHouseCheckins,

    // 9-Round Tournament Exports
    ROUNDS_METADATA: DEFAULT_ROUNDS,
    fetchTournamentRounds: fetchTournamentRounds,
    updateRoundStatus: updateRoundStatus,
    fetchTournamentTeams: fetchTournamentTeams,
    saveTournamentTeam: saveTournamentTeam,
    deleteTournamentTeam: deleteTournamentTeam,
    generateRound2Teams: generateRound2Teams,
    getLocalTournamentScores: getLocalTournamentScores,
    saveLocalTournamentScores: saveLocalTournamentScores,
    fetchTournamentScores: fetchTournamentScores,
    saveTournamentScores: saveTournamentScores,
    calculateAndSyncCumulativeLeaderboard: calculateAndSyncCumulativeLeaderboard
  };
})();

