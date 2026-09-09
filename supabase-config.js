// ========================================================
// TECH BOSS 2026 — SUPABASE CLOUD SYNC CONFIGURATION
// ========================================================

(function () {
  // Default Project Credentials (can also be saved via Admin UI in localStorage)
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
    window.addEventListener('DOMContentLoaded', function () {
      initSupabaseClient();
    });
  }

  // ==========================================
  // REGISTRATIONS API
  // ==========================================

  async function addRegistration(regData) {
    var cli = client || initSupabaseClient();
    if (cli) {
      try {
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

        var res = await cli.from('registrations').insert([payload]).select();
        if (res.error) throw res.error;
        return { success: true, data: res.data ? res.data[0] : payload };
      } catch (err) {
        console.warn('Supabase insert registration failed, falling back to local storage:', err);
        return { success: false, error: err };
      }
    }
    return { success: false, reason: 'Supabase not configured' };
  }

  async function fetchRegistrations() {
    var cli = client || initSupabaseClient();
    if (cli) {
      try {
        var res = await cli.from('registrations').select('*').order('created_at', { ascending: false });
        if (res.error) throw res.error;
        if (res.data) {
          // Normalize column names to match frontend expectations
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
        console.warn('Supabase fetch registrations failed:', err);
      }
    }
    return null;
  }

  async function updateRegistrationStatus(id, newStatus) {
    var cli = client || initSupabaseClient();
    if (cli && id) {
      try {
        var res = await cli.from('registrations').update({ status: newStatus }).eq('id', id);
        if (res.error) throw res.error;
        return true;
      } catch (err) {
        console.warn('Supabase update status failed:', err);
      }
    }
    return false;
  }

  async function deleteRegistration(id) {
    var cli = client || initSupabaseClient();
    if (cli && id) {
      try {
        var res = await cli.from('registrations').delete().eq('id', id);
        if (res.error) throw res.error;
        return true;
      } catch (err) {
        console.warn('Supabase delete registration failed:', err);
      }
    }
    return false;
  }

  // ==========================================
  // LEADERBOARD API
  // ==========================================

  async function fetchLeaderboard() {
    var cli = client || initSupabaseClient();
    if (cli) {
      try {
        var res = await cli.from('leaderboard').select('*').order('rank', { ascending: true });
        if (res.error) throw res.error;
        if (res.data && res.data.length > 0) {
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
    return null;
  }

  async function saveLeaderboard(boardData) {
    var cli = client || initSupabaseClient();
    if (cli && Array.isArray(boardData)) {
      try {
        // Clear old leaderboard and insert fresh sorted list
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
          if (res.error) throw res.error;
        }
        return true;
      } catch (err) {
        console.warn('Supabase save leaderboard failed:', err);
      }
    }
    return false;
  }

  // ==========================================
  // EVENT STATE API (Boss HP, Custom Broadcast)
  // ==========================================

  async function fetchEventState() {
    var cli = client || initSupabaseClient();
    if (cli) {
      try {
        var res = await cli.from('event_state').select('*').eq('id', 'global').maybeSingle();
        if (res.error) throw res.error;
        if (res.data) {
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
        if (res.error) throw res.error;
        return true;
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

    var channel = cli
      .channel('public:registrations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, function (payload) {
        console.log('⚡ Realtime Registration Event:', payload);
        if (typeof onEvent === 'function') onEvent(payload);
      })
      .subscribe();

    return channel;
  }

  function subscribeToLeaderboard(onEvent) {
    var cli = client || initSupabaseClient();
    if (!cli) return null;

    var channel = cli
      .channel('public:leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaderboard' }, function (payload) {
        console.log('⚡ Realtime Leaderboard Event:', payload);
        if (typeof onEvent === 'function') onEvent(payload);
      })
      .subscribe();

    return channel;
  }

  function subscribeToEventState(onEvent) {
    var cli = client || initSupabaseClient();
    if (!cli) return null;

    var channel = cli
      .channel('public:event_state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_state' }, function (payload) {
        console.log('⚡ Realtime Event State:', payload);
        if (typeof onEvent === 'function') onEvent(payload);
      })
      .subscribe();

    return channel;
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
