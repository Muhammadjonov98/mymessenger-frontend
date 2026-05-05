// ==========================================
// СТРАНИЦА ЧАТА
// Сообщения в реальном времени через WebSocket + файлы
// ==========================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { messagesAPI, filesAPI } from '../api/api';
import useStore from '../store/useStore';

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

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [connected, setConnected] = useState(false);
  const [yozayapti] = useState(false);
  const [faylYuklanmoqda, setFaylYuklanmoqda] = useState(false);

  const TILLAR = {
    uz: {
      xabarYoz: 'Xabar yozing...',
      onlayn: 'Onlayn',
      oflayn: 'Oflayn',
      yozayapti: 'yozayapti...',
      boyChat: 'Salom deng! Chat boshlang 👋',
      faylYuklanmoqda: 'Fayl yuklanmoqda...',
    },
    ru: {
      xabarYoz: 'Написать сообщение...',
      onlayn: 'Онлайн',
      oflayn: 'Офлайн',
      yozayapti: 'печатает...',
      boyChat: 'Скажите привет! Начните чат 👋',
      faylYuklanmoqda: 'Загрузка файла...',
    },
    en: {
      xabarYoz: 'Write a message...',
      onlayn: 'Online',
      oflayn: 'Offline',
      yozayapti: 'typing...',
      boyChat: 'Say hello! Start chatting 👋',
      faylYuklanmoqda: 'Uploading file...',
    },
  };

  const t = (key) => TILLAR[til]?.[key] || key;

  useEffect(() => {
    if (!myId) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
    wsGaUlan();
    tarixniYukla();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [myId, userId]);

  const tarixniYukla = async () => {
    try {
      const res = await messagesAPI.getHistory(userId, myId);
      setMessages(res.data);
      pastgaTush();
    } catch (e) {
      console.error('Ошибка загрузки истории:', e);
    }
  };

  const wsGaUlan = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    const ws = new WebSocket(`ws://localhost:8000/ws/${myId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.xato) return;

      if (data.type === 'oqildi_signal') {
        if (data.receiver_id === otherUserId) {
          setMessages((prev) =>
            prev.map((x) =>
              x.sender_id === myId ? { ...x, is_read: true } : x
            )
          );
        }
        return;
      }

      if (data.type === 'xabar') {
        const ushbuChatMi =
          data.sender_id === otherUserId ||
          data.receiver_id === otherUserId;
        if (!ushbuChatMi) return;

        if (data.sender_id === otherUserId) {
          setMessages((prev) => [...prev, { ...data, is_read: true }]);
          pastgaTush();
          if (Notification.permission === 'granted') {
            new Notification(chatUser?.full_name || 'Yangi xabar', {
              body: data.file_url ? '📎 Fayl yuborildi' : data.content,
              icon: '/logo192.png',
            });
          }
          if (data.id) messagesAPI.markRead(data.id);
        }

        if (data.sender_id === myId) {
          setMessages((prev) => [...prev, { ...data, is_read: false }]);
          pastgaTush();
        }
      }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
  };

  const xabarYuborish = () => {
    const matn = newMessage.trim();
    if (!matn || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      receiver_id: otherUserId,
      content: matn,
    }));
    setNewMessage('');
  };

  const faylTanlash = () => {
    fileInputRef.current?.click();
  };

  const faylYuborish = async (e) => {
    const fayl = e.target.files[0];
    if (!fayl) return;
    e.target.value = '';
    setFaylYuklanmoqda(true);
    try {
      const res = await filesAPI.upload(fayl);
      const { url, tur, asl_nom } = res.data;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          receiver_id: otherUserId,
          content: asl_nom,
          file_url: url,
          file_type: tur,
        }));
      }
    } catch (err) {
      console.error('Ошибка загрузки файла:', err);
      alert('Fayl yuklashda xato yuz berdi!');
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
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const vaqtFormat = (vaqt) => {
    if (!vaqt) return '';
    const d = new Date(vaqt);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  // Xabar tarkibini ko'rsatish — matn, rasm, video yoki hujjat
  const xabarKontent = (xabar, menYubordim) => {
    if (!xabar.file_url) {
      // Oddiy matn xabari
      return (
        <div style={styles.xabarMatn}>
          {xabar.content}
        </div>
      );
    }

    const fullUrl = filesAPI.toFullUrl(xabar.file_url);

    if (xabar.file_type === 'rasm') {
      // Rasm xabari
      return (
        <div>
          <img
            src={fullUrl}
            alt={xabar.content}
            style={styles.rasmXabar}
            onClick={() => window.open(fullUrl, '_blank')}
          />
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4, padding: '0 4px' }}>
            {'📷 ' + xabar.content}
          </div>
        </div>
      );
    }

    if (xabar.file_type === 'video') {
      // Video xabari
      return (
        <div>
          <video src={fullUrl} controls style={styles.videoXabar} />
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4, padding: '0 4px' }}>
            {'🎥 ' + xabar.content}
          </div>
        </div>
      );
    }

    // Hujjat yoki boshqa fayl
    return (
      <a
        href={fullUrl}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 0',
          textDecoration: 'none',
          fontWeight: '500',
          fontSize: 14,
          color: menYubordim ? 'white' : '#2AABEE',
        }}
      >
        {'📄 ' + xabar.content}
      </a>
    );
  };

  return (
    <div style={styles.container}>

      {/* ВЕРХНЯЯ ПАНЕЛЬ */}
      <div style={styles.appBar}>
        <button onClick={() => navigate('/home')} style={styles.orqaBtn}>
          ‹
        </button>
        <div style={styles.avatar}>
          {chatUser?.full_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div style={styles.userInfo}>
          <div style={styles.userIsm}>
            {chatUser?.full_name || 'Foydalanuvchi'}
          </div>
          <div style={styles.userHolat}>
            {yozayapti
              ? ('✍️ ' + t('yozayapti'))
              : connected
              ? ('🟢 ' + t('onlayn'))
              : ('⚫ ' + t('oflayn'))}
          </div>
        </div>
        <div style={styles.tugmalar}>
           <button
             style={styles.ikonBtn}
             onClick={() => navigate('/call', {
               state: {
                 otherUser: chatUser,
                  qongiroqTuri: 'ovoz',
                  chaqiruvchi: true,
                  callerId: null,
               }
             })}
           >
             📞
           </button>
           <button
             style={styles.ikonBtn}
             onClick={() => navigate('/call', {
               state: {
                 otherUser: chatUser,
                  qongiroqTuri: 'video',
                  chaqiruvchi: true,
                  callerId: null,
               }
             })}
            >
             📹
           </button>
        </div>
      </div>
      {/* ОБЛАСТЬ СООБЩЕНИЙ */}
      <div style={styles.xabarlarQism}>
        {messages.length === 0 ? (
          <div style={styles.boyChat}>
            <span style={{ fontSize: 60 }}>👋</span>
            <p>{t('boyChat')}</p>
          </div>
        ) : (
          messages.map((xabar, index) => {
            const menYubordim = xabar.sender_id === myId;
            const fayllimi = xabar.file_type === 'rasm' || xabar.file_type === 'video';
            return (
              <div
                key={xabar.id || index}
                style={{
                  ...styles.xabarQator,
                  justifyContent: menYubordim ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    ...styles.bubble,
                    background: menYubordim ? '#2AABEE' : 'white',
                    color: menYubordim ? 'white' : '#222',
                    borderBottomRightRadius: menYubordim ? 4 : 16,
                    borderBottomLeftRadius: menYubordim ? 16 : 4,
                    padding: fayllimi ? '4px' : '10px 14px',
                  }}
                >
                  {xabarKontent(xabar, menYubordim)}

                  <div style={{
                    ...styles.xabarPastki,
                    padding: fayllimi ? '0 8px 4px' : 0,
                  }}>
                    <span style={{
                      color: menYubordim ? 'rgba(255,255,255,0.7)' : '#aaa',
                      fontSize: 11,
                    }}>
                      {vaqtFormat(xabar.created_at)}
                    </span>
                    {menYubordim && (
                      <span style={{
                        fontSize: 11,
                        marginLeft: 4,
                        color: xabar.is_read
                          ? 'rgba(255,255,255,1)'
                          : 'rgba(255,255,255,0.5)',
                      }}>
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

      {/* ПОЛЕ ВВОДА */}
      <div style={styles.inputQism}>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          accept="image/*,video/*,.pdf,.doc,.docx,.txt"
          onChange={faylYuborish}
        />
        <button
          style={{ ...styles.ikonBtn, opacity: faylYuklanmoqda ? 0.5 : 1 }}
          onClick={faylTanlash}
          disabled={faylYuklanmoqda}
        >
          {faylYuklanmoqda ? '⏳' : '📎'}
        </button>
        <textarea
          style={styles.input}
          placeholder={faylYuklanmoqda ? t('faylYuklanmoqda') : t('xabarYoz')}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          rows={1}
          disabled={faylYuklanmoqda}
        />
        <button
          style={{
            ...styles.yuborishBtn,
            background: newMessage.trim() && !faylYuklanmoqda ? '#2AABEE' : '#ccc',
          }}
          onClick={xabarYuborish}
          disabled={!newMessage.trim() || faylYuklanmoqda}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    fontFamily: 'Segoe UI, sans-serif',
    background: '#f0f2f5',
  },
  appBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    background: '#2AABEE',
    color: 'white',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  orqaBtn: {
    background: 'none',
    border: 'none',
    color: 'white',
    fontSize: 32,
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: 18,
    flexShrink: 0,
  },
  userInfo: { flex: 1 },
  userIsm: { fontWeight: 'bold', fontSize: 16 },
  userHolat: { fontSize: 12, opacity: 0.9 },
  tugmalar: { display: 'flex', gap: 4 },
  ikonBtn: {
    background: 'none',
    border: 'none',
    fontSize: 22,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 8,
  },
  xabarlarQism: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  boyChat: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#aaa',
    fontSize: 16,
    gap: 8,
  },
  xabarQator: { display: 'flex', marginBottom: 4 },
  bubble: {
    maxWidth: '70%',
    borderRadius: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  xabarMatn: { fontSize: 15, lineHeight: 1.4, wordBreak: 'break-word' },
  xabarPastki: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
    gap: 2,
  },
  rasmXabar: {
    maxWidth: '100%',
    maxHeight: 300,
    borderRadius: 12,
    display: 'block',
    cursor: 'pointer',
    objectFit: 'cover',
  },
  videoXabar: {
    maxWidth: '100%',
    maxHeight: 300,
    borderRadius: 12,
    display: 'block',
  },
  inputQism: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    background: 'white',
    boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
  },
  input: {
    flex: 1,
    padding: '10px 16px',
    borderRadius: 24,
    border: '1px solid #eee',
    background: '#f5f5f5',
    outline: 'none',
    fontSize: 15,
    resize: 'none',
    fontFamily: 'inherit',
    maxHeight: 120,
  },
  yuborishBtn: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: 'none',
    color: 'white',
    fontSize: 18,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
};

export default Chat;