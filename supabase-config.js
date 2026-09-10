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

  async function fetchLeaderboard() {
    try {
      var apiResp = await fetch('/api/leaderboard');
      if (apiResp.ok) {
        var apiResult = await apiResp.json();
        if (apiResult.success && Array.isArray(apiResult.leaderboard)) {
          return apiResult.leaderboard.map(function (row) {
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
          return rows.map(function (row) {
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
        }
      } catch (e) {}
    }
    return null;
  }

  async function saveLeaderboard(boardData) {
    try {
      var apiResp = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboard: boardData })
      });
      if (apiResp.ok) return true;
    } catch (e) {}

    var config = getSupabaseConfig();
    var cli = client || initSupabaseClient();
    if (cli && Array.isArray(boardData)) {
      try {
        await cli.from('leaderboard').delete().neq('id', 0);
        if (boardData.length > 0) {
          var payload = boardData.map(function (item, idx) {
            return {
              rank: item.rank || (idx + 1),
              handle: item.handle || '',
              name: item.name || '',
              score: parseInt(item.score, 10) || 0,
              boss_dmg: item.bossDmg || item.boss_dmg || '0 DMG',
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

  // ==========================================
  // 4. REAL-TIME SUBSCRIPTIONS
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
          if (typeof onEvent === 'function') onEvent(payload);
        })
        .subscribe();

      return channel;
    } catch (e) {
      return null;
    }
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
    subscribeToRegistrations: subscribeToRegistrations,
    subscribeToLeaderboard: subscribeToLeaderboard,
    subscribeToEventState: subscribeToEventState
  };
})();
