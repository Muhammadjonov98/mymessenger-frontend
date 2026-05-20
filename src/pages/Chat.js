// ==========================================
// CHAT SAHIFASI — Telegram uslubida
// Real-time xabarlar, fayllar, qo'ng'iroq
// ==========================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { messagesAPI, filesAPI } from '../api/api';
import useStore from '../store/useStore';

const BASE_WS = 'wss://mymessenger-backend.onrender.com';

function Chat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useParams();
  const { userId: myId, til } = useStore();

  const chatUser = location.state?.user;
  const otherUserId = parseInt(userId);

  const wsRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [connected, setConnected] = useState(false);
  const [faylYuklanmoqda, setFaylYuklanmoqda] = useState(false);
  const [rasmModal, setRasmModal] = useState(null);

  const TILLAR = {
    uz: { xabarYoz:'Xabar yozing...', onlayn:'Onlayn', oflayn:'Oflayn', faylYuklanmoqda:'Fayl yuklanmoqda...', boyChat:'Salom deng! Chat boshlang 👋' },
    ru: { xabarYoz:'Написать сообщение...', onlayn:'Онлайн', oflayn:'Офлайн', faylYuklanmoqda:'Загрузка...', boyChat:'Скажите привет! Начните чат 👋' },
    en: { xabarYoz:'Write a message...', onlayn:'Online', oflayn:'Offline', faylYuklanmoqda:'Uploading...', boyChat:'Say hello! Start chatting 👋' },
  };
  const t = key => TILLAR[til]?.[key] || key;

  useEffect(() => {
    if (!myId) return;
    if (Notification.permission === 'default') Notification.requestPermission();
    wsGaUlan();
    tarixniYukla();
    return () => { wsRef.current?.close(); };
  }, [myId, userId]);

  const tarixniYukla = async () => {
    try {
      const res = await messagesAPI.getHistory(userId, myId);
      setMessages(res.data);
      setTimeout(pastgaTush, 100);
    } catch (e) {
      console.error('Tarix yuklanmadi:', e);
    }
  };

  const wsGaUlan = () => {
    wsRef.current?.close();
    const ws = new WebSocket(`${BASE_WS}/ws/${myId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.xato) return;

        if (data.type === 'oqildi_signal') {
          if (data.receiver_id === otherUserId) {
            setMessages(prev => prev.map(x =>
              x.sender_id === myId ? { ...x, is_read: true } : x
            ));
          }
          return;
        }

        if (data.type === 'xabar') {
          const buChatmi = data.sender_id === otherUserId || data.receiver_id === otherUserId;
          if (!buChatmi) return;

          if (data.sender_id === otherUserId) {
            setMessages(prev => [...prev, { ...data, is_read: true }]);
            pastgaTush();
            if (Notification.permission === 'granted') {
              new Notification(chatUser?.full_name || 'Yangi xabar', {
                body: data.file_url ? '📎 Fayl yuborildi' : data.content,
                icon: '/logo192.png',
              });
            }
            if (data.id) messagesAPI.markRead(data.id);
          } else if (data.sender_id === myId) {
            setMessages(prev => [...prev, { ...data, is_read: false }]);
            pastgaTush();
          }
        }
      } catch (e) {
        console.error('WS xabari xato:', e);
      }
    };
  };

  const xabarYuborish = () => {
    const matn = newMessage.trim();
    if (!matn || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ receiver_id: otherUserId, content: matn }));
    setNewMessage('');
    inputRef.current?.focus();
  };

  const faylYuborish = async (e) => {
    const fayl = e.target.files[0];
    if (!fayl) return;
    e.target.value = '';
    setFaylYuklanmoqda(true);
    try {
      const res = await filesAPI.upload(fayl);
      const { url, tur, asl_nom } = res.data;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          receiver_id: otherUserId,
          content: asl_nom,
          file_url: url,
          file_type: tur,
        }));
      }
    } catch {
      alert('Fayl yuklashda xato!');
    }
    setFaylYuklanmoqda(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      xabarYuborish();
    }
  };

  const pastgaTush = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const vaqtFormat = (vaqt) => {
    if (!vaqt) return '';
    const d = new Date(vaqt);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  };

  const avatarColor = (id) => `hsl(${(id * 47) % 360}, 60%, 55%)`;

  const xabarKontent = (xabar, menYubordim) => {
    if (!xabar.file_url) {
      return <div style={s.xabarMatn}>{xabar.content}</div>;
    }
    const fullUrl = filesAPI.toFullUrl(xabar.file_url);

    if (xabar.file_type === 'rasm') {
      return (
        <div>
          <img
            src={fullUrl}
            alt={xabar.content}
            style={s.rasmXabar}
            onClick={() => setRasmModal(fullUrl)}
          />
          <div style={{...s.faylNom, color: menYubordim ? 'rgba(255,255,255,0.8)' : '#888'}}>
            📷 {xabar.content}
          </div>
        </div>
      );
    }
    if (xabar.file_type === 'video') {
      return (
        <div>
          <video src={fullUrl} controls style={s.videoXabar} />
          <div style={{...s.faylNom, color: menYubordim ? 'rgba(255,255,255,0.8)' : '#888'}}>
            🎥 {xabar.content}
          </div>
        </div>
      );
    }
    return (
      <a href={fullUrl} target="_blank" rel="noreferrer" style={{
        ...s.hujjatLink,
        color: menYubordim ? 'white' : '#2AABEE',
        borderColor: menYubordim ? 'rgba(255,255,255,0.3)' : '#e0f0fa',
        background: menYubordim ? 'rgba(255,255,255,0.1)' : '#f0f8ff',
      }}>
        <span style={s.hujjatIcon}>📄</span>
        <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
          {xabar.content}
        </span>
        <span style={{fontSize:12, opacity:0.7}}>↓</span>
      </a>
    );
  };

  // Xabarlarni sanaga guruhlash
  const xabarlarGuruhlangan = () => {
    const groups = [];
    let currentDate = null;
    messages.forEach(x => {
      const d = new Date(x.created_at);
      const dateStr = d.toLocaleDateString('uz-UZ', { day:'numeric', month:'long' });
      if (dateStr !== currentDate) {
        groups.push({ type:'date', label: dateStr });
        currentDate = dateStr;
      }
      groups.push({ type:'message', data: x });
    });
    return groups;
  };

  return (
    <div style={s.container}>

      {/* Rasm modal */}
      {rasmModal && (
        <div style={s.rasmModalBg} onClick={() => setRasmModal(null)}>
          <img src={rasmModal} alt="preview" style={s.rasmModalImg} onClick={e => e.stopPropagation()} />
          <button style={s.rasmModalClose} onClick={() => setRasmModal(null)}>✕</button>
        </div>
      )}

      {/* HEADER */}
      <div style={s.appBar}>
        <button onClick={() => navigate('/home')} style={s.orqaBtn}>‹</button>
        <div style={{...s.headerAvatar, background: avatarColor(otherUserId)}}>
          {chatUser?.full_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div style={s.headerInfo}>
          <div style={s.headerIsm}>{chatUser?.full_name || 'Foydalanuvchi'}</div>
          <div style={s.headerHolat}>
            {connected
              ? <><span style={s.onlaynDot}/>  {t('onlayn')}</>
              : <><span style={s.oflaynDot}/>  {t('oflayn')}</>}
          </div>
        </div>
        <div style={s.headerBtns}>
          <button style={s.headerBtn} title="Ovozli qo'ng'iroq" onClick={() => navigate('/call', {state:{otherUser:chatUser,qongiroqTuri:'ovoz',chaqiruvchi:true,callerId:null}})}>
            📞
          </button>
          <button style={s.headerBtn} title="Video qo'ng'iroq" onClick={() => navigate('/call', {state:{otherUser:chatUser,qongiroqTuri:'video',chaqiruvchi:true,callerId:null}})}>
            📹
          </button>
        </div>
      </div>

      {/* XABARLAR */}
      <div style={s.xabarlarQism}>
        {messages.length === 0 ? (
          <div style={s.boyChat}>
            <span style={{fontSize:56}}>👋</span>
            <p style={{color:'#888', fontSize:15, margin:0}}>{t('boyChat')}</p>
          </div>
        ) : (
          xabarlarGuruhlangan().map((item, i) => {
            if (item.type === 'date') {
              return (
                <div key={`date-${i}`} style={s.dateDivider}>
                  <span style={s.dateLabel}>{item.label}</span>
                </div>
              );
            }
            const xabar = item.data;
            const menYubordim = xabar.sender_id === myId;
            const fayllimi = xabar.file_type === 'rasm' || xabar.file_type === 'video';
            return (
              <div key={xabar.id || i} style={{...s.xabarQator, justifyContent: menYubordim ? 'flex-end' : 'flex-start'}}>
                {!menYubordim && (
                  <div style={{...s.miniAvatar, background: avatarColor(xabar.sender_id)}}>
                    {chatUser?.full_name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div style={{
                  ...s.bubble,
                  background: menYubordim ? '#2AABEE' : 'white',
                  color: menYubordim ? 'white' : '#111',
                  borderBottomRightRadius: menYubordim ? 4 : 18,
                  borderBottomLeftRadius: menYubordim ? 18 : 4,
                  padding: fayllimi ? 4 : '8px 12px',
                }}>
                  {xabarKontent(xabar, menYubordim)}
                  <div style={{...s.xabarPastki, padding: fayllimi ? '0 8px 4px' : '2px 0 0'}}>
                    <span style={{color: menYubordim ? 'rgba(255,255,255,0.7)' : '#aaa', fontSize:11}}>
                      {vaqtFormat(xabar.created_at)}
                    </span>
                    {menYubordim && (
                      <span style={{fontSize:12, marginLeft:3, color: xabar.is_read ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.5)'}}>
                        {xabar.is_read ? '✓✓' : '✓'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <div style={s.inputQism}>
        <input ref={fileInputRef} type="file" style={{display:'none'}}
          accept="image/*,video/*,.pdf,.doc,.docx,.txt" onChange={faylYuborish} />
        <button style={{...s.ikonBtn, opacity: faylYuklanmoqda ? 0.5 : 1}}
          onClick={() => fileInputRef.current?.click()} disabled={faylYuklanmoqda}>
          {faylYuklanmoqda ? '⏳' : '📎'}
        </button>
        <textarea
          ref={inputRef}
          style={s.input}
          placeholder={faylYuklanmoqda ? t('faylYuklanmoqda') : t('xabarYoz')}
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          rows={1}
          disabled={faylYuklanmoqda}
        />
        <button
          style={{...s.yuborishBtn, background: newMessage.trim() && !faylYuklanmoqda ? '#2AABEE' : '#ccc'}}
          onClick={xabarYuborish}
          disabled={!newMessage.trim() || faylYuklanmoqda}
        >
          <span style={{fontSize:18}}>➤</span>
        </button>
      </div>
    </div>
  );
}

const s = {
  container: { display:'flex', flexDirection:'column', height:'100vh', fontFamily:"'Segoe UI', sans-serif", background:'#eee9e3', backgroundImage:"url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23c8c0b8' fill-opacity='0.3'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" },

  // Rasm modal
  rasmModalBg: { position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  rasmModalImg: { maxWidth:'90vw', maxHeight:'90vh', borderRadius:8, objectFit:'contain' },
  rasmModalClose: { position:'absolute', top:20, right:20, background:'rgba(255,255,255,0.2)', border:'none', color:'white', fontSize:20, width:40, height:40, borderRadius:'50%', cursor:'pointer' },

  appBar: { display:'flex', alignItems:'center', gap:10, padding:'10px 16px', background:'#2AABEE', color:'white', boxShadow:'0 2px 8px rgba(0,0,0,0.15)', flexShrink:0 },
  orqaBtn: { background:'none', border:'none', color:'white', fontSize:30, cursor:'pointer', lineHeight:1, padding:0, marginRight:4 },
  headerAvatar: { width:42, height:42, borderRadius:'50%', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold', fontSize:18, flexShrink:0 },
  headerInfo: { flex:1 },
  headerIsm: { fontWeight:'700', fontSize:16 },
  headerHolat: { fontSize:12, opacity:0.9, display:'flex', alignItems:'center', gap:4 },
  onlaynDot: { width:8, height:8, borderRadius:'50%', background:'#90EE90', display:'inline-block' },
  oflaynDot: { width:8, height:8, borderRadius:'50%', background:'rgba(255,255,255,0.5)', display:'inline-block' },
  headerBtns: { display:'flex', gap:4 },
  headerBtn: { background:'rgba(255,255,255,0.15)', border:'none', borderRadius:10, padding:'6px 10px', fontSize:18, cursor:'pointer', color:'white', transition:'background 0.2s' },

  xabarlarQism: { flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:2 },
  boyChat: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, marginTop:'30%' },

  dateDivider: { display:'flex', justifyContent:'center', margin:'8px 0' },
  dateLabel: { background:'rgba(0,0,0,0.35)', color:'white', fontSize:12, padding:'3px 12px', borderRadius:12, backdropFilter:'blur(4px)' },

  xabarQator: { display:'flex', alignItems:'flex-end', gap:6, marginBottom:2 },
  miniAvatar: { width:28, height:28, borderRadius:'50%', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:'bold', flexShrink:0 },
  bubble: { maxWidth:'68%', borderRadius:18, boxShadow:'0 1px 2px rgba(0,0,0,0.1)', overflow:'hidden' },
  xabarMatn: { fontSize:15, lineHeight:1.45, wordBreak:'break-word', padding:'0 2px' },
  xabarPastki: { display:'flex', justifyContent:'flex-end', alignItems:'center', gap:2 },
  faylNom: { fontSize:11, padding:'2px 6px 4px', opacity:0.8 },
  rasmXabar: { maxWidth:'100%', maxHeight:280, display:'block', cursor:'pointer', objectFit:'cover' },
  videoXabar: { maxWidth:'100%', maxHeight:280, display:'block' },
  hujjatLink: { display:'flex', alignItems:'center', gap:8, padding:'10px 12px', textDecoration:'none', borderRadius:12, border:'1px solid', fontSize:14, fontWeight:'500' },
  hujjatIcon: { fontSize:24, flexShrink:0 },

  inputQism: { display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'white', boxShadow:'0 -1px 8px rgba(0,0,0,0.06)', flexShrink:0 },
  ikonBtn: { background:'none', border:'none', fontSize:22, cursor:'pointer', padding:'6px', borderRadius:10, color:'#666', flexShrink:0 },
  input: { flex:1, padding:'10px 14px', borderRadius:22, border:'1px solid #e8e8e8', background:'#f8f8f8', outline:'none', fontSize:15, resize:'none', fontFamily:'inherit', maxHeight:120, lineHeight:1.4 },
  yuborishBtn: { width:42, height:42, borderRadius:'50%', border:'none', color:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background 0.2s' },
};

export default Chat;