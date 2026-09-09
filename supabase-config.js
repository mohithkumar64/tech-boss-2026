// ========================================================
// TECH BOSS 2026 — SUPABASE CLOUD SYNC CONFIGURATION
// ========================================================

(function () {
  // Default Project Credentials (Hardcoded & configured for immediate cross-device sync)
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
        console.log('⚡ Tech Boss Supabase Client initialized successfully.');
      } catch (err) {
        console.error('Failed to initialize Supabase client:', err);
        client = null;
      }
    } else {
      client = null;
    }
    return client;
  }

  // Attempt initial client initialization
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', initSupabaseClient);
    } else {
      initSupabaseClient();
    }
  }

  // ==========================================
  // REGISTRATIONS API (Dual SDK + Direct REST Fallback)
  // ==========================================

  async function addRegistration(regData) {
    var config = getSupabaseConfig();
    var payload = {
      name: regData.name || '',
      reg_no: regData.regNo || '',
      branch: regData.branch || '',
      year: regData.year || '',
      phone: regData.phone || '',
      handle: regData.handle || '',
      pass: regData.pass || 'All-Access Solo Pass',
      fee: regData.fee || '100',
      screenshot: regData.screenshot || '',
      status: regData.status || 'PENDING'
    };

    // 1. Try Supabase SDK client if available
    var cli = client || initSupabaseClient();
    if (cli) {
      try {
        var res = await cli.from('registrations').insert([payload]).select();
        if (!res.error && res.data && res.data.length > 0) {
          console.log('✅ Supabase SDK: registration inserted', res.data[0]);
          return { success: true, data: res.data[0] };
        }
      } catch (err) {
        console.warn('Supabase SDK insert failed, falling back to direct REST API:', err);
      }
    }

    // 2. Direct REST API Fallback (Guaranteed 100% mobile compatibility)
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
          console.log('✅ Supabase REST API: registration inserted', data);
          return { success: true, data: data[0] || payload };
        } else {
          var errText = await resp.text();
          console.error('Supabase REST error response:', errText);
        }
      } catch (fErr) {
        console.error('Supabase Direct REST fetch error:', fErr);
      }
    }

    return { success: false, reason: 'Failed to insert to Supabase' };
  }

  async function fetchRegistrations() {
    var config = getSupabaseConfig();

    // 1. Try Supabase SDK client
    var cli = client || initSupabaseClient();
    if (cli) {
      try {
        var res = await cli.from('registrations').select('*').order('created_at', { ascending: false });
        if (!res.error && res.data) {
          return res.data.map(function (row) {
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
      } catch (err) {
        console.warn('Supabase SDK fetch registrations failed, trying REST:', err);
      }
    }

    // 2. Direct REST Fallback
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
        console.warn('Direct REST fetch registrations error:', fErr);
      }
    }
    return null;
  }

  async function updateRegistrationStatus(id, newStatus) {
    var config = getSupabaseConfig();
    var cli = client || initSupabaseClient();
    if (cli && id) {
      try {
        var res = await cli.from('registrations').update({ status: newStatus }).eq('id', id);
        if (!res.error) return true;
      } catch (err) {
        console.warn('Supabase SDK update failed, trying REST:', err);
      }
    }

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
    var config = getSupabaseConfig();
    var cli = client || initSupabaseClient();
    if (cli && id) {
      try {
        var res = await cli.from('registrations').delete().eq('id', id);
        if (!res.error) return true;
      } catch (err) {
        console.warn('Supabase SDK delete failed, trying REST:', err);
      }
    }

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
  // LEADERBOARD API
  // ==========================================

  async function fetchLeaderboard() {
    var config = getSupabaseConfig();
    var cli = client || initSupabaseClient();
    if (cli) {
      try {
        var res = await cli.from('leaderboard').select('*').order('rank', { ascending: true });
        if (!res.error && res.data && res.data.length > 0) {
          return res.data.map(function (row) {
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
      } catch (err) {
        console.warn('Supabase fetch leaderboard failed:', err);
      }
    }

    if (config.url && config.key) {
      try {
        var apiUrl = config.url.replace(/\/$/, '') + '/rest/v1/leaderboard?select=*&order=rank.asc';
        var resp = await fetch(apiUrl, {
          headers: { 'apikey': config.key, 'Authorization': 'Bearer ' + config.key }
        });
        if (resp.ok) {
          var rows = await resp.json();
          if (rows.length > 0) {
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
        }
      } catch (e) {}
    }
    return null;
  }

  async function saveLeaderboard(boardData) {
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
          var res = await cli.from('leaderboard').insert(payload);
          if (!res.error) return true;
        }
      } catch (err) {
        console.warn('Supabase save leaderboard failed:', err);
      }
    }
    return false;
  }

  // ==========================================
  // EVENT STATE API
  // ==========================================

  async function fetchEventState() {
    var config = getSupabaseConfig();
    var cli = client || initSupabaseClient();
    if (cli) {
      try {
        var res = await cli.from('event_state').select('*').eq('id', 'global').maybeSingle();
        if (!res.error && res.data) {
          return {
            bossHp: res.data.boss_hp,
            broadcastMsg: res.data.broadcast_msg
          };
        }
      } catch (err) {
        console.warn('Supabase fetch event state failed:', err);
      }
    }
    return null;
  }

  async function saveEventState(bossHp, broadcastMsg) {
    var config = getSupabaseConfig();
    var cli = client || initSupabaseClient();
    if (cli) {
      try {
        var payload = {
          id: 'global',
          boss_hp: bossHp !== undefined ? String(bossHp) : '78',
          broadcast_msg: broadcastMsg !== undefined ? String(broadcastMsg) : '',
          updated_at: new Date().toISOString()
        };
        var res = await cli.from('event_state').upsert(payload);
        if (!res.error) return true;
      } catch (err) {
        console.warn('Supabase save event state failed:', err);
      }
    }
    return false;
  }

  // ==========================================
  // REAL-TIME SUBSCRIPTIONS
  // ==========================================

  function subscribeToRegistrations(onEvent) {
    var cli = client || initSupabaseClient();
    if (!cli) return null;

    try {
      var channel = cli
        .channel('public:registrations:' + Date.now())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, function (payload) {
          console.log('⚡ Realtime Registration Event:', payload);
          if (typeof onEvent === 'function') onEvent(payload);
        })
        .subscribe();

      return channel;
    } catch (e) {
      console.warn('Supabase realtime subscribe error:', e);
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
          console.log('⚡ Realtime Leaderboard Event:', payload);
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
          console.log('⚡ Realtime Event State:', payload);
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
