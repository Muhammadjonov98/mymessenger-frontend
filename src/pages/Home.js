// ==========================================
// ГЛАВНАЯ СТРАНИЦА — Telegram стиль
// Список чатов, уведомления, входящие звонки
// ==========================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usersAPI, messagesAPI } from '../api/api';
import useStore from '../store/useStore';

const BASE_WS = 'wss://mymessenger-backend.onrender.com';

function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, username, userId: myId, til, tilniOzgartir } = useStore();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qidiruv, setQidiruv] = useState('');
  const [unreadCounts, setUnreadCounts] = useState({});
  const [lastMessages, setLastMessages] = useState({});
  // Kiruvchi qo'ng'iroq uchun state
  const [kelayotganQongiroq, setKelayotganQongiroq] = useState(null);

  const wsRef = useRef(null);
  const callWsRef = useRef(null);
  const callWsReconnectRef = useRef(null);
  const usersRef = useRef([]);

  // users ni ref ga ham saqlaymiz — closure muammosini hal qilish uchun
  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  const TILLAR = {
    uz: {
      chatlar: 'Chatlar', qidirish: 'Qidirish...', onlayn: 'Onlayn',
      oflayn: 'Oflayn', chiqish: 'Chiqish', kimYoq: "Hech kim yo'q!",
      yangilash: 'Yangilash', qabul: 'Qabul', rad: 'Rad etish',
      kelayotgan: 'Qo\'ng\'iroq kelmoqda...', video: 'Video qo\'ng\'iroq',
      ovoz: 'Ovozli qo\'ng\'iroq',
    },
    ru: {
      chatlar: 'Чаты', qidirish: 'Поиск...', onlayn: 'Онлайн',
      oflayn: 'Офлайн', chiqish: 'Выйти', kimYoq: 'Никого нет!',
      yangilash: 'Обновить', qabul: 'Принять', rad: 'Отклонить',
      kelayotgan: 'Входящий звонок...', video: 'Видеозвонок',
      ovoz: 'Голосовой звонок',
    },
    en: {
      chatlar: 'Chats', qidirish: 'Search...', onlayn: 'Online',
      oflayn: 'Offline', chiqish: 'Logout', kimYoq: 'Nobody here!',
      yangilash: 'Refresh', qabul: 'Accept', rad: 'Decline',
      kelayotgan: 'Incoming call...', video: 'Video call',
      ovoz: 'Voice call',
    },
  };

  const t = (key) => TILLAR[til]?.[key] || key;

  // ==========================================
  // CALL WEBSOCKET — avtomatik qayta ulanish
  // ==========================================
  const callWsUlan = useCallback(() => {
    if (!myId) return;
    if (callWsRef.current && callWsRef.current.readyState === WebSocket.OPEN) return;

    // Eski reconnect timeoutni bekor qilish
    if (callWsReconnectRef.current) {
      clearTimeout(callWsReconnectRef.current);
    }

    const ws = new WebSocket(`${BASE_WS}/calls/ws/${myId}`);
    callWsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ Call WebSocket ulandi');
    };

    ws.onmessage = (event) => {
      try {
        const signal = JSON.parse(event.data);
        if (signal.tur === 'kelayotgan_qongiroq') {
          // usersRef dan topamiz — closure muammosi yo'q
          const caller = usersRef.current.find(u => u.id === signal.caller_id) ||
                         { id: signal.caller_id, full_name: `User ${signal.caller_id}` };

          // Brauzer notification
          if (Notification.permission === 'granted') {
            new Notification(caller.full_name, {
              body: signal.qongiroq_turi === 'video' ? '📹 Video qo\'ng\'iroq' : '📞 Ovozli qo\'ng\'iroq',
              icon: '/logo192.png',
            });
          }

          // Kiruvchi qo'ng'iroq UI ni ko'rsatamiz
          setKelayotganQongiroq({
            caller,
            qongiroqTuri: signal.qongiroq_turi,
            callerId: signal.caller_id,
          });
        }
      } catch (e) {
        console.error('Call signal xatosi:', e);
      }
    };

    ws.onclose = () => {
      console.log('⚠️ Call WebSocket uzildi, qayta ulanish...');
      // 3 soniyadan keyin qayta ulanish
      callWsReconnectRef.current = setTimeout(() => callWsUlan(), 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [myId]);

  // ==========================================
  // MESSAGES WEBSOCKET
  // ==========================================
  useEffect(() => {
    if (!myId) return;

    // Notification ruxsatini so'rash
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const ws = new WebSocket(`${BASE_WS}/ws/${myId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.xato) return;

        if (data.type === 'xabar' && data.receiver_id === myId) {
          // Badge oshiramiz
          setUnreadCounts(prev => ({
            ...prev,
            [data.sender_id]: (prev[data.sender_id] || 0) + 1,
          }));
          // Oxirgi xabarni saqlaymiz
          setLastMessages(prev => ({
            ...prev,
            [data.sender_id]: data.content || (data.file_type ? '📎 Fayl' : ''),
          }));

          // Push notification
          const sender = usersRef.current.find(u => u.id === data.sender_id);
          if (Notification.permission === 'granted' && sender) {
            new Notification(sender.full_name, {
              body: data.file_url ? '📎 Fayl yuborildi' : data.content,
              icon: '/logo192.png',
            });
          }
        }
      } catch (e) {
        console.error('WS message xatosi:', e);
      }
    };

    return () => {
      ws.close();
    };
  }, [myId]);

  // Call WebSocket ni alohida effect da boshlaymiz
  useEffect(() => {
    if (!myId) return;
    callWsUlan();
    return () => {
      if (callWsReconnectRef.current) clearTimeout(callWsReconnectRef.current);
      if (callWsRef.current) callWsRef.current.close();
    };
  }, [myId, callWsUlan]);

  // Sahifaga qaytganda foydalanuvchilarni yangilaymiz
  useEffect(() => {
    foydalanuvchilarniOl();
  }, [location]);

  // ==========================================
  // FOYDALANUVCHILARNI YUKLASH
  // ==========================================
  const foydalanuvchilarniOl = async () => {
    setLoading(true);
    try {
      const res = await usersAPI.getAll();
      const boshqalar = res.data.filter(u => u.username !== username);
      setUsers(boshqalar);

      // Oxirgi xabarlar va o'qilmagan sonlarni yuklash
      const counts = {};
      const lasts = {};
      await Promise.all(
        boshqalar.map(async (user) => {
          try {
            const tarix = await messagesAPI.getHistory(user.id, myId);
            const data = tarix.data;
            counts[user.id] = data.filter(x => !x.is_read && x.receiver_id === myId).length;
            if (data.length > 0) {
              const last = data[data.length - 1];
              lasts[user.id] = last.file_url ? '📎 Fayl' : last.content;
            }
          } catch {
            counts[user.id] = 0;
          }
        })
      );
      setUnreadCounts(counts);
      setLastMessages(lasts);
    } catch (e) {
      console.error('Foydalanuvchilar yuklanmadi:', e);
    }
    setLoading(false);
  };

  const handleChiqish = () => {
    logout();
    navigate('/');
  };

  // Qo'ng'iroqni qabul qilish
  const qongiroqniQabul = () => {
    if (!kelayotganQongiroq) return;
    navigate('/call', {
      state: {
        otherUser: kelayotganQongiroq.caller,
        qongiroqTuri: kelayotganQongiroq.qongiroqTuri,
        chaqiruvchi: false,
        callerId: kelayotganQongiroq.callerId,
      }
    });
    setKelayotganQongiroq(null);
  };

  // Qo'ng'iroqni rad etish
  const qongiroqniRad = () => {
    if (callWsRef.current?.readyState === WebSocket.OPEN && kelayotganQongiroq) {
      callWsRef.current.send(JSON.stringify({
        tur: 'rad',
        caller_id: kelayotganQongiroq.callerId,
      }));
    }
    setKelayotganQongiroq(null);
  };

  const filtrlangan = users.filter(u =>
    u.full_name.toLowerCase().includes(qidiruv.toLowerCase()) ||
    u.username.toLowerCase().includes(qidiruv.toLowerCase())
  );

  return (
    <div style={s.container}>

      {/* ===== KIRUVCHI QONG'IROQ MODAL ===== */}
      {kelayotganQongiroq && (
        <div style={s.callModal}>
          <div style={s.callModalInner}>
            <div style={s.callAvatar}>
              {kelayotganQongiroq.caller.full_name?.[0]?.toUpperCase() || '?'}
            </div>
            <div style={s.callName}>{kelayotganQongiroq.caller.full_name}</div>
            <div style={s.callType}>
              {kelayotganQongiroq.qongiroqTuri === 'video' ? t('video') : t('ovoz')}
            </div>
            <div style={s.callDots}>
              <span style={s.dot1}/><span style={s.dot2}/><span style={s.dot3}/>
            </div>
            <div style={s.callBtns}>
              <div style={s.callBtnWrap}>
                <button style={{...s.callBtn, background:'#ff3b30'}} onClick={qongiroqniRad}>📵</button>
                <span style={s.callBtnLabel}>{t('rad')}</span>
              </div>
              <div style={s.callBtnWrap}>
                <button style={{...s.callBtn, background:'#34c759'}} onClick={qongiroqniQabul}>📞</button>
                <span style={s.callBtnLabel}>{t('qabul')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== CHAP PANEL ===== */}
      <div style={s.chapPanel}>

        {/* Header */}
        <div style={s.header}>
          <div style={s.headerTitle}>
            <span style={s.headerIcon}>✈️</span>
            <span style={s.headerText}>UzMessenger</span>
          </div>
          <div style={s.tillar}>
            {['uz','ru','en'].map(tl => (
              <button key={tl} onClick={() => tilniOzgartir(tl)} style={{
                ...s.tilBtn,
                background: til === tl ? 'rgba(255,255,255,0.25)' : 'transparent',
                color: 'white',
                fontWeight: til === tl ? '700' : '400',
              }}>
                {tl.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Profil */}
        <div style={s.profil}>
          <div style={s.avatar}>{username[0]?.toUpperCase() || '?'}</div>
          <div style={{flex:1}}>
            <div style={s.profilIsm}>{username}</div>
            <div style={s.profilHolat}>🟢 {t('onlayn')}</div>
          </div>
          <button onClick={handleChiqish} style={s.chiqishBtn}>🚪</button>
        </div>

        {/* Qidiruv */}
        <div style={s.qidiruvWrap}>
          <span style={s.qidiruvIcon}>🔍</span>
          <input
            style={s.qidiruvInput}
            type="text"
            placeholder={t('qidirish')}
            value={qidiruv}
            onChange={e => setQidiruv(e.target.value)}
          />
        </div>

        {/* Foydalanuvchilar ro'yxati */}
        <div style={s.royxat}>
          {loading ? (
            <div style={s.yuklanmoqda}>
              <div style={s.spinner}/>
            </div>
          ) : filtrlangan.length === 0 ? (
            <div style={s.boyRoyxat}>
              <div style={{fontSize:56}}>👥</div>
              <div style={{color:'#aaa', fontSize:14}}>{t('kimYoq')}</div>
              <button onClick={foydalanuvchilarniOl} style={s.yangilashBtn}>
                🔄 {t('yangilash')}
              </button>
            </div>
          ) : (
            filtrlangan.map((user, i) => (
              <div
                key={user.id}
                style={s.userKarta}
                onClick={() => {
                  setUnreadCounts(prev => ({ ...prev, [user.id]: 0 }));
                  navigate(`/chat/${user.id}`, { state: { user } });
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}
              >
                <div style={{position:'relative', flexShrink:0}}>
                  <div style={{
                    ...s.userAvatar,
                    background: `hsl(${(user.id * 47) % 360}, 60%, 55%)`,
                  }}>
                    {user.full_name[0]?.toUpperCase() || '?'}
                  </div>
                  {user.onlayn && <div style={s.onlaynBelgi}/>}
                  {unreadCounts[user.id] > 0 && (
                    <div style={s.badge}>
                      {unreadCounts[user.id] > 99 ? '99+' : unreadCounts[user.id]}
                    </div>
                  )}
                </div>
                <div style={s.userInfo}>
                  <div style={s.userIsm}>{user.full_name}</div>
                  <div style={s.userHolat}>
                    {lastMessages[user.id]
                      ? lastMessages[user.id].length > 30
                        ? lastMessages[user.id].substring(0, 30) + '...'
                        : lastMessages[user.id]
                      : `@${user.username}`}
                  </div>
                </div>
                {unreadCounts[user.id] > 0 && (
                  <div style={s.unreadBadge}>
                    {unreadCounts[user.id] > 99 ? '99+' : unreadCounts[user.id]}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ===== O'NG PANEL ===== */}
      <div style={s.ongPanel}>
        <div style={s.welcomeWrap}>
          <div style={s.welcomeIcon}>✈️</div>
          <h2 style={s.welcomeTitle}>UzMessenger</h2>
          <p style={s.welcomeText}>
            {til === 'uz' ? 'Chat tanlang yoki yangi suhbat boshlang' :
             til === 'ru' ? 'Выберите чат или начните новый разговор' :
             'Select a chat or start a new conversation'}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.05);opacity:0.8} }
        @keyframes dotBounce {
          0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)}
        }
      `}</style>
    </div>
  );
}

const s = {
  container: { display:'flex', height:'100vh', fontFamily:"'Segoe UI', sans-serif", background:'#f0f2f5', position:'relative' },

  // Call modal
  callModal: { position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(8px)' },
  callModalInner: { background:'linear-gradient(160deg,#1a1a2e,#16213e)', borderRadius:24, padding:'40px 48px', display:'flex', flexDirection:'column', alignItems:'center', gap:12, minWidth:280, boxShadow:'0 20px 60px rgba(0,0,0,0.5)' },
  callAvatar: { width:90, height:90, borderRadius:'50%', background:'linear-gradient(135deg,#2AABEE,#007AFF)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, fontWeight:'bold', color:'white', boxShadow:'0 0 30px rgba(42,171,238,0.5)' },
  callName: { color:'white', fontSize:22, fontWeight:'700', marginTop:4 },
  callType: { color:'rgba(255,255,255,0.7)', fontSize:14 },
  callDots: { display:'flex', gap:6, margin:'8px 0' },
  dot1: { width:8, height:8, borderRadius:'50%', background:'rgba(255,255,255,0.6)', display:'inline-block', animation:'dotBounce 1.2s infinite 0s' },
  dot2: { width:8, height:8, borderRadius:'50%', background:'rgba(255,255,255,0.6)', display:'inline-block', animation:'dotBounce 1.2s infinite 0.2s' },
  dot3: { width:8, height:8, borderRadius:'50%', background:'rgba(255,255,255,0.6)', display:'inline-block', animation:'dotBounce 1.2s infinite 0.4s' },
  callBtns: { display:'flex', gap:48, marginTop:16 },
  callBtnWrap: { display:'flex', flexDirection:'column', alignItems:'center', gap:8 },
  callBtn: { width:60, height:60, borderRadius:'50%', border:'none', fontSize:24, cursor:'pointer', color:'white', transition:'transform 0.1s', display:'flex', alignItems:'center', justifyContent:'center' },
  callBtnLabel: { color:'rgba(255,255,255,0.8)', fontSize:12 },

  // Chap panel
  chapPanel: { width:340, background:'white', display:'flex', flexDirection:'column', boxShadow:'2px 0 15px rgba(0,0,0,0.08)', zIndex:10 },
  header: { background:'linear-gradient(135deg,#2AABEE,#1A7FBB)', padding:'16px 16px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' },
  headerTitle: { display:'flex', alignItems:'center', gap:8 },
  headerIcon: { fontSize:22 },
  headerText: { color:'white', fontWeight:'700', fontSize:18, letterSpacing:'-0.3px' },
  tillar: { display:'flex', gap:2 },
  tilBtn: { padding:'4px 8px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, transition:'background 0.2s' },

  profil: { display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid #f0f0f0' },
  avatar: { width:42, height:42, borderRadius:'50%', background:'linear-gradient(135deg,#2AABEE,#1A7FBB)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold', fontSize:18, flexShrink:0 },
  profilIsm: { fontWeight:'600', fontSize:15, color:'#222' },
  profilHolat: { fontSize:12, color:'#4CAF50' },
  chiqishBtn: { background:'none', border:'none', fontSize:18, cursor:'pointer', padding:'6px', borderRadius:8, marginLeft:'auto' },

  qidiruvWrap: { display:'flex', alignItems:'center', gap:8, margin:'8px 12px', background:'#f5f5f5', borderRadius:20, padding:'8px 14px' },
  qidiruvIcon: { fontSize:14, opacity:0.5 },
  qidiruvInput: { flex:1, border:'none', background:'transparent', outline:'none', fontSize:14, color:'#333' },

  royxat: { flex:1, overflowY:'auto' },
  yuklanmoqda: { display:'flex', alignItems:'center', justifyContent:'center', padding:40 },
  spinner: { width:28, height:28, border:'3px solid #eee', borderTop:'3px solid #2AABEE', borderRadius:'50%', animation:'spin 0.8s linear infinite' },
  boyRoyxat: { textAlign:'center', padding:40, display:'flex', flexDirection:'column', alignItems:'center', gap:12 },
  yangilashBtn: { padding:'8px 20px', background:'#2AABEE', color:'white', border:'none', borderRadius:20, cursor:'pointer', fontSize:13 },

  userKarta: { display:'flex', alignItems:'center', gap:12, padding:'10px 16px', cursor:'pointer', borderBottom:'1px solid #f8f8f8', transition:'background 0.15s', background:'white' },
  userAvatar: { width:50, height:50, borderRadius:'50%', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold', fontSize:20, flexShrink:0 },
  onlaynBelgi: { position:'absolute', bottom:1, right:1, width:12, height:12, borderRadius:'50%', background:'#4CAF50', border:'2px solid white' },
  badge: { display:'none' },
  userInfo: { flex:1, minWidth:0 },
  userIsm: { fontWeight:'600', fontSize:15, color:'#111', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  userHolat: { fontSize:13, color:'#888', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  unreadBadge: { background:'#2AABEE', color:'white', borderRadius:20, minWidth:20, height:20, fontSize:12, fontWeight:'bold', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 6px', flexShrink:0 },

  // O'ng panel
  ongPanel: { flex:1, background:'#eee9e3', display:'flex', alignItems:'center', justifyContent:'center', backgroundImage:"url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8c0b8' fill-opacity='0.3'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" },
  welcomeWrap: { textAlign:'center', padding:32, background:'rgba(255,255,255,0.9)', borderRadius:20, boxShadow:'0 4px 20px rgba(0,0,0,0.08)' },
  welcomeIcon: { fontSize:64, marginBottom:16 },
  welcomeTitle: { color:'#2AABEE', fontSize:24, fontWeight:'700', margin:'0 0 8px' },
  welcomeText: { color:'#888', fontSize:14, margin:0, maxWidth:260 },
};

export default Home;