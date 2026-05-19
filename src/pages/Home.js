// ==========================================
// ГЛАВНАЯ СТРАНИЦА
// SMMS xabarlar — real-time yangilanish
// ==========================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usersAPI, messagesAPI } from '../api/api';
import useStore from '../store/useStore';

function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, username, userId: myId, til, tilniOzgartir } = useStore();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qidiruv, setQidiruv] = useState('');
  const [unreadCounts, setUnreadCounts] = useState({});
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  const wsRef = useRef(null);
  const callWsRef = useRef(null);

  const TILLAR = {
    uz: {
      chatlar: 'Chatlar',
      qidirish: 'Qidirish...',
      onlayn: 'Onlayn',
      oflayn: 'Oflayn',
      chiqish: 'Chiqish',
      kimYoq: "Hech kim yo'q!",
      yangilash: 'Yangilash',
    },
    ru: {
      chatlar: 'Чаты',
      qidirish: 'Поиск...',
      onlayn: 'Онлайн',
      oflayn: 'Офлайн',
      chiqish: 'Выйти',
      kimYoq: 'Никого нет!',
      yangilash: 'Обновить',
    },
    en: {
      chatlar: 'Chats',
      qidirish: 'Search...',
      onlayn: 'Online',
      oflayn: 'Offline',
      chiqish: 'Logout',
      kimYoq: 'Nobody here!',
      yangilash: 'Refresh',
    },
  };

  const t = (key) => TILLAR[til]?.[key] || key;

  useEffect(() => {
    foydalanuvchilarniOl();
  }, [location]);

  // ==========================================
  // WEBSOCKET — Xabarlar va onlayn holat
  // ==========================================
  useEffect(() => {
    if (!myId) return;

    const wsUrl = `wss://mymessenger-backend.onrender.com/ws/${myId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('📡 Xabar WebSocket ulandi');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'xabar') {
          // Yangi xabar kelganda
          if (data.receiver_id === myId && data.sender_id) {
            // O'qilmaganlar sonini oshiramiz
            setUnreadCounts((prev) => ({
              ...prev,
              [data.sender_id]: (prev[data.sender_id] || 0) + 1,
            }));

            // ✅ PUSH NOTIFICATION (brauzer xabarnomasi)
            const sender = users.find(u => u.id === data.sender_id);
            if (sender && Notification.permission === 'granted') {
              new Notification(sender.full_name, {
                body: data.file_url ? '📎 Fayl yuborildi' : data.content,
                icon: '/logo192.png',
                tag: `msg-${data.sender_id}`,
              });
            }

            // Ro'yxatni yangilash (so'nggi xabarni ko'rsatish uchun)
            foydalanuvchilarniOl();
          }
        }

        else if (data.type === 'online_users') {
          // Onlayn foydalanuvchilar ro'yxati
          setOnlineUsers(new Set(data.user_ids || []));
        }

        else if (data.type === 'user_online') {
          setOnlineUsers(prev => new Set([...prev, data.user_id]));
        }

        else if (data.type === 'user_offline') {
          setOnlineUsers(prev => {
            const newSet = new Set(prev);
            newSet.delete(data.user_id);
            return newSet;
          });
        }

        else if (data.type === 'oqildi_signal') {
          // Xabar o'qilganligi haqida signal
          if (data.receiver_id === myId) {
            // O'qilgan xabarlar uchun boshqa hech narsa qilmaymiz
            // Lekin chatda is_read = true bo'ladi
          }
        }
      } catch (err) {
        console.error('WebSocket xatosi:', err);
      }
    };

    ws.onclose = () => {
      console.log('🔌 Xabar WebSocket yopildi');
      // 3 soniyadan keyin qayta ulanamiz
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          const newWs = new WebSocket(wsUrl);
          wsRef.current = newWs;
        }
      }, 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket xatosi:', err);
    };

    // Brauzer xabarnomalari uchun ruxsat so'raymiz
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [myId]);

  // ==========================================
  // WEBSOCKET — Qo'ng'iroqlar (Call)
  // ==========================================
  useEffect(() => {
    if (!myId) return;

    const callWsUlan = () => {
      const callWs = new WebSocket(`wss://mymessenger-backend.onrender.com/calls/ws/${myId}`);
      callWsRef.current = callWs;

      callWs.onopen = () => {
        console.log('📞 Call WebSocket ulandi');
      };

      callWs.onmessage = (event) => {
        try {
          const signal = JSON.parse(event.data);
          if (signal.tur === 'kelayotgan_qongiroq') {
            const caller = users.find(u => u.id === signal.caller_id) ||
                           { id: signal.caller_id, full_name: `User ${signal.caller_id}` };

            // Kelayotgan qo'ng'iroqni ko'rsatish
            navigate('/call', {
              state: {
                otherUser: caller,
                qongiroqTuri: signal.qongiroq_turi,
                chaqiruvchi: false,
                callerId: signal.caller_id,
              }
            });
          }
        } catch (err) {
          console.error('Call WebSocket xatosi:', err);
        }
      };

      callWs.onclose = () => {
        setTimeout(callWsUlan, 3000);
      };

      return callWs;
    };

    const callWs = callWsUlan();

    return () => {
      if (callWsRef.current) {
        callWsRef.current.close();
      }
    };
  }, [myId]);

  // ==========================================
  // FOYDALANUVCHILARNI OLISH
  // ==========================================
  const foydalanuvchilarniOl = async () => {
    setLoading(true);
    try {
      const res = await usersAPI.getAll();
      const boshqalar = res.data.filter((u) => u.username !== username);

      // Har bir foydalanuvchi uchun o'qilmagan xabarlar soni
      const counts = {};
      await Promise.all(
        boshqalar.map(async (user) => {
          try {
            const tarix = await messagesAPI.getHistory(user.id, myId);
            counts[user.id] = tarix.data.filter(
              (x) => !x.is_read && x.receiver_id === myId
            ).length;
          } catch {
            counts[user.id] = 0;
          }
        })
      );

      setUnreadCounts(counts);
      setUsers(boshqalar);
    } catch (e) {
      console.error('Xatolik:', e);
    }
    setLoading(false);
  };

  const handleChiqish = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (callWsRef.current) {
      callWsRef.current.close();
    }
    logout();
    navigate('/');
  };

  const filtrlangan = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(qidiruv.toLowerCase()) ||
      u.username.toLowerCase().includes(qidiruv.toLowerCase())
  );

  return (
    <div style={styles.container}>
      <div style={styles.chapPanel}>
        {/* HEADER */}
        <div style={styles.yuqori}>
          <div style={styles.logoQism}>
            <span style={{ fontSize: 24 }}>💬</span>
            <span style={styles.logoText}>UzMessenger</span>
          </div>
          <div style={styles.tillar}>
            {['uz', 'ru', 'en'].map((tl) => (
              <button
                key={tl}
                onClick={() => tilniOzgartir(tl)}
                style={{
                  ...styles.tilBtn,
                  background: til === tl ? '#2AABEE' : 'transparent',
                  color: til === tl ? 'white' : '#666',
                }}
              >
                {tl === 'uz' ? 'UZ' : tl === 'ru' ? 'RU' : 'EN'}
              </button>
            ))}
          </div>
        </div>

        {/* PROFIL */}
        <div style={styles.profil}>
          <div style={styles.avatar}>
            {username[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <div style={styles.profilIsm}>{username}</div>
            <div style={styles.profilHolat}>🟢 {t('onlayn')}</div>
          </div>
          <button onClick={handleChiqish} style={styles.chiqishBtn}>
            🚪 {t('chiqish')}
          </button>
        </div>

        {/* QIDIRUV */}
        <div style={styles.qidiruvQism}>
          <input
            style={styles.qidiruvInput}
            type="text"
            placeholder={t('qidirish')}
            value={qidiruv}
            onChange={(e) => setQidiruv(e.target.value)}
          />
        </div>

        {/* FOYDALANUVCHILAR RO'YXATI */}
        <div style={styles.royxat}>
          {loading ? (
            <div style={styles.yuklanmoqda}>⏳ Yuklanmoqda...</div>
          ) : filtrlangan.length === 0 ? (
            <div style={styles.boyRoyxat}>
              <div style={{ fontSize: 48 }}>👥</div>
              <div>{t('kimYoq')}</div>
              <button onClick={foydalanuvchilarniOl} style={styles.yangilashBtn}>
                🔄 {t('yangilash')}
              </button>
            </div>
          ) : (
            filtrlangan.map((user) => (
              <div
                key={user.id}
                style={styles.foydalanuvchiKarta}
                onClick={() => {
                  // Chatga kirganda o'qilmaganlarni tozalaymiz
                  setUnreadCounts((prev) => ({ ...prev, [user.id]: 0 }));
                  navigate(`/chat/${user.id}`, { state: { user } });
                }}
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    ...styles.userAvatar,
                    background: onlineUsers.has(user.id) ? '#2AABEE' : '#aaa',
                  }}>
                    {user.full_name[0]?.toUpperCase() || '?'}
                  </div>
                  {unreadCounts[user.id] > 0 && (
                    <div style={styles.badge}>
                      {unreadCounts[user.id] > 99 ? '99+' : unreadCounts[user.id]}
                    </div>
                  )}
                  {/* Onlayn indikator */}
                  {onlineUsers.has(user.id) && (
                    <div style={styles.onlineIndicator} />
                  )}
                </div>
                <div style={styles.userInfo}>
                  <div style={styles.userIsm}>{user.full_name}</div>
                  <div style={styles.userHolat}>
                    {onlineUsers.has(user.id) ? `🟢 ${t('onlayn')}` : `⚫ @${user.username}`}
                  </div>
                </div>
                <div style={styles.oq}>›</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* O'NG PANEL — EMPTY STATE */}
      <div style={styles.ongPanel}>
        <div style={styles.chatTanlang}>
          <span style={{ fontSize: 80 }}>💬</span>
          <h2 style={{ color: '#aaa', marginTop: 16 }}>
            {til === 'uz' ? 'Chat tanlang' : til === 'ru' ? 'Выберите чат' : 'Select a chat'}
          </h2>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', fontFamily: 'Segoe UI, sans-serif' },
  chapPanel: { width: 320, background: '#fff', borderRight: '1px solid #eee', display: 'flex', flexDirection: 'column', boxShadow: '2px 0 10px rgba(0,0,0,0.05)' },
  yuqori: { background: '#2AABEE', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoQism: { display: 'flex', alignItems: 'center', gap: 8 },
  logoText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  tillar: { display: 'flex', gap: 4 },
  tilBtn: { padding: '4px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 16 },
  profil: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #eee' },
  avatar: { width: 40, height: 40, borderRadius: '50%', background: '#2AABEE', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 18, flexShrink: 0 },
  profilIsm: { fontWeight: 'bold', fontSize: 14 },
  profilHolat: { fontSize: 12, color: 'green' },
  chiqishBtn: { marginLeft: 'auto', background: 'none', border: '1px solid #eee', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: '#666' },
  qidiruvQism: { padding: '8px 16px', borderBottom: '1px solid #eee' },
  qidiruvInput: { width: '100%', padding: '8px 12px', borderRadius: 20, border: '1px solid #eee', background: '#f5f5f5', outline: 'none', fontSize: 14, boxSizing: 'border-box' },
  royxat: { flex: 1, overflowY: 'auto' },
  yuklanmoqda: { textAlign: 'center', padding: 40, color: '#aaa' },
  boyRoyxat: { textAlign: 'center', padding: 40, color: '#aaa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  yangilashBtn: { padding: '8px 20px', background: '#2AABEE', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' },
  foydalanuvchiKarta: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', transition: 'background 0.2s', ':hover': { background: '#f9f9f9' } },
  userAvatar: { width: 46, height: 46, borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 20 },
  onlineIndicator: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%', background: '#4cd964', border: '2px solid white' },
  badge: { position: 'absolute', top: -2, right: -2, background: '#ff3b30', color: 'white', borderRadius: '50%', minWidth: 18, height: 18, fontSize: 11, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', boxSizing: 'border-box' },
  userInfo: { flex: 1 },
  userIsm: { fontWeight: '600', fontSize: 15, color: '#222' },
  userHolat: { fontSize: 13, color: '#888', marginTop: 2 },
  oq: { color: '#ccc', fontSize: 24 },
  ongPanel: { flex: 1, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  chatTanlang: { textAlign: 'center' },
};

export default Home;