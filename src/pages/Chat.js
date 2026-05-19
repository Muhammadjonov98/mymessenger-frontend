// ==========================================
// CHAT.JS — TOLIQ TUZATILGAN VERSIYA
// Xabar, fayl, ovoz va qongiroq funksiyalari
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

  // ==========================================
  // REFS
  // ==========================================
  const wsRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const typingTimeoutRef = useRef(null);

  // ==========================================
  // STATES
  // ==========================================
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [connected, setConnected] = useState(false);
  const [faylYuklanmoqda, setFaylYuklanmoqda] = useState(false);
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const [ovozYuzmoqda, setOvozYuzmoqda] = useState(false);
  const [ovozVaqti, setOvozVaqti] = useState(0);
  const [otherUserTyping, setOtherUserTyping] = useState(false);

  // ==========================================
  // TRANSLATIONS
  // ==========================================
  const TILLAR = {
    uz: {
      xabarYoz: 'Xabar yozing...',
      onlayn: 'Onlayn',
      oflayn: 'Oflayn',
      yozayapti: 'yozayapti...',
      boyChat: 'Salom deng! Chat boshlang 👋',
      faylYuklanmoqda: 'Fayl yuklanmoqda...',
      ovozYuborish: 'Ovozli xabar yuzoramiz...',
      sahifani_orqaga: 'Orqaga',
    },
    ru: {
      xabarYoz: 'Написать сообщение...',
      onlayn: 'Онлайн',
      oflayn: 'Офлайн',
      yozayapti: 'печатает...',
      boyChat: 'Скажите привет! Начните чат 👋',
      faylYuklanmoqda: 'Загрузка файла...',
      ovozYuborish: 'Записываем голос...',
      sahifani_orqaga: 'Назад',
    },
    en: {
      xabarYoz: 'Write a message...',
      onlayn: 'Online',
      oflayn: 'Offline',
      yozayapti: 'typing...',
      boyChat: 'Say hello! Start chatting 👋',
      faylYuklanmoqda: 'Uploading file...',
      ovozYuborish: 'Recording voice...',
      sahifani_orqaga: 'Back',
    },
  };

  const t = (key) => TILLAR[til]?.[key] || key;

  // ==========================================
  // OVOZLI XABAR FUNKSIYALARI
  // ==========================================

  // ✅ OVOZLI XABAR - BOSHLASH
  const ovozYozishiBoshla = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // MIME types - brauzer turiga qarab
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      let recordingTime = 0;
      const recordingInterval = setInterval(() => {
        recordingTime++;
        setOvozVaqti(recordingTime);
        if (recordingTime > 600) { // Max 10 daqiqa
          clearInterval(recordingInterval);
          ovozYuborishni();
        }
      }, 1000);

      recorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        clearInterval(recordingInterval);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setOvozYuzmoqda(true);
      setOvozVaqti(0);
      console.log('🎙️ Ovoz yozish boshlandi, MIME:', mimeType);

    } catch (err) {
      console.error('Mikrofon xatosi:', err);
      alert('Mikrofonga ruxsat berishingi shukayt!');
    }
  };

  // ✅ OVOZLI XABAR - TUGATISH VA YUBORISH
  const ovozYuborishni = async () => {
    if (!mediaRecorderRef.current) return;

    mediaRecorderRef.current.stop();
    setOvozYuzmoqda(false);

    setTimeout(async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

      console.log('🎙️ Ovoz blob hajmi:', audioBlob.size, 'bytes');

      if (audioBlob.size < 2048) { // 2 KB minimal
        alert('Ovozli xabar juda qisqa!');
        audioChunksRef.current = [];
        return;
      }

      setFaylYuklanmoqda(true);

      try {
        const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
        console.log('📤 Ovoz yuklash: ', file.name);

        const res = await filesAPI.uploadVoice(file);
        const { url, tur } = res.data;

        console.log('✅ Ovoz yuklandi:', url);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            receiver_id: otherUserId,
            content: '🎙️ Ovozli xabar',
            file_url: url,
            file_type: tur,
          }));
        }
      } catch (err) {
        console.error('Ovoz yuklanmadi:', err);
        alert(`Ovozli xabar yuklashda xato: ${err.response?.data?.detail || err.message}`);
      }

      setFaylYuklanmoqda(false);
      audioChunksRef.current = [];
    }, 100);
  };

  // ==========================================
  // XABAR FUNKSIYALARI
  // ==========================================

  // Tarixni yuklash
  const tarixniYukla = async () => {
    try {
      const res = await messagesAPI.getHistory(userId, myId);
      setMessages(res.data);
      pastgaTush();
    } catch (e) {
      console.error('Tarix yuklanmadi:', e);
    }
  };

  // WebSocket ulanish
  const wsGaUlan = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`wss://mymessenger-backend.onrender.com/ws/${myId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ Chat WebSocket ulandi');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // ✅ KELAYOTGAN QONGIROQ
        if (data.tur === 'kelayotgan_qongiroq' && data.caller_id === otherUserId) {
          navigate('/call', {
            state: {
              otherUser: chatUser,
              qongiroqTuri: data.qongiroq_turi,
              chaqiruvchi: false,
              callerId: data.caller_id,
            }
          });
          return;
        }

        // ✅ READ RECEIPT
        if (data.type === 'oqildi_signal') {
          if (data.message_id) {
            setMessages(prev =>
              prev.map(msg =>
                msg.id === data.message_id ? { ...msg, is_read: true } : msg
              )
            );
          }
          return;
        }

        // ✅ USER TYPING
        if (data.type === 'user_typing') {
          if (data.user_id === otherUserId) {
            setOtherUserTyping(data.status === 'typing');
          }
          return;
        }

        // ✅ ONLINE STATUS
        if (data.type === 'user_online' && data.user_id === otherUserId) {
          setOtherUserOnline(true);
          return;
        }

        if (data.type === 'user_offline' && data.user_id === otherUserId) {
          setOtherUserOnline(false);
          return;
        }

        // ✅ NEW MESSAGE
        if (data.type === 'xabar') {
          const isForThisChat = (data.sender_id === otherUserId && data.receiver_id === myId) ||
                                (data.sender_id === myId && data.receiver_id === otherUserId);

          if (!isForThisChat) return;

          if (data.sender_id === otherUserId) {
            setMessages(prev => [...prev, { ...data, is_read: true }]);
            pastgaTush();

            // Push notification
            if (Notification.permission === 'granted' && document.hidden) {
              let title = chatUser?.full_name || 'Yangi xabar';
              let body = data.file_url ?
                (data.file_type === 'ovoz' ? '🎙️ Ovozli xabar' : '📎 Fayl yuborildi') :
                data.content;

              new Notification(title, {
                body: body,
                icon: '/logo192.png',
                tag: `msg-${data.sender_id}`,
              });
            }

            // Mark as read
            if (data.id && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: 'mark_read',
                message_id: data.id
              }));
            }
          } else if (data.sender_id === myId) {
            setMessages(prev => [...prev, data]);
            pastgaTush();
          }
        }
      } catch (err) {
        console.error('WebSocket xatosi:', err);
      }
    };

    ws.onclose = () => {
      console.log('❌ Chat WebSocket yopildi');
      setConnected(false);
      setTimeout(wsGaUlan, 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket xatosi:', err);
    };
  };

  // Xabar yuborish
  const xabarYuborish = () => {
    const matn = newMessage.trim();
    if (!matn || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      receiver_id: otherUserId,
      content: matn,
    }));
    setNewMessage('');
    setOtherUserTyping(false);
  };

  // Typing signal
  const typingSignalYuborish = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'typing',
      receiver_id: otherUserId,
      status: 'typing'
    }));

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'typing',
          receiver_id: otherUserId,
          status: 'stopped'
        }));
      }
    }, 1000);
  };

  // Fayl tanlash
  const faylTanlash = () => {
    fileInputRef.current?.click();
  };

  // Fayl yuborish
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
      console.error('Fayl yuklanmadi:', err);
      alert(`Fayl yuklashda xato: ${err.response?.data?.detail || err.message}`);
    }
    setFaylYuklanmoqda(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      xabarYuborish();
    }
  };

  const handleMessageChange = (e) => {
    setNewMessage(e.target.value);
    if (e.target.value.trim()) {
      typingSignalYuborish();
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

  // Xabar mazmuni rendering
  const xabarKontent = (xabar, menYubordim) => {
    if (!xabar.file_url) {
      return <div style={styles.xabarMatn}>{xabar.content}</div>;
    }

    const fullUrl = filesAPI.toFullUrl(xabar.file_url);

    if (xabar.file_type === 'rasm') {
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
      return (
        <div>
          <video src={fullUrl} controls style={styles.videoXabar} />
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4, padding: '0 4px' }}>
            {'🎥 ' + xabar.content}
          </div>
        </div>
      );
    }

    // ✅ OVOZLI XABAR
    if (xabar.file_type === 'ovoz') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px' }}>
          <span>🎙️</span>
          <audio
            src={fullUrl}
            controls
            style={{ maxWidth: 200, height: 30 }}
          />
        </div>
      );
    }

    return (
      <a href={fullUrl} target="_blank" rel="noreferrer" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 0',
        textDecoration: 'none',
        fontWeight: '500',
        fontSize: 14,
        color: menYubordim ? 'white' : '#2AABEE',
      }}>
        {'📄 ' + xabar.content}
      </a>
    );
  };

  // ==========================================
  // EFFECTS
  // ==========================================

  useEffect(() => {
    if (!myId) return;
    tarixniYukla();
    wsGaUlan();

    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      clearTimeout(typingTimeoutRef.current);
    };
  }, [myId, userId]);

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <div style={styles.appBar}>
        <button onClick={() => navigate('/home')} style={styles.orqaBtn}>
          ‹
        </button>
        <div style={styles.avatar}>
          {chatUser?.full_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div style={styles.userInfo}>
          <div style={styles.userIsm}>{chatUser?.full_name || 'Foydalanuvchi'}</div>
          <div style={styles.userHolat}>
            {otherUserOnline ? `🟢 ${t('onlayn')}` : `⚫ ${t('oflayn')}`}
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
          >📞</button>
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
          >📹</button>
        </div>
      </div>

      {/* MESSAGES */}
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
                        color: xabar.is_read ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.5)',
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

        {/* Typing indicator */}
        {otherUserTyping && (
          <div style={styles.typingIndicator}>
            <span>🟢 {t('yozayapti')}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <div style={styles.inputQism}>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          accept="image/*,video/*,.pdf,.doc,.docx,.txt"
          onChange={faylYuborish}
        />

        {/* ✅ OVOZLI XABAR TUGMALARI */}
        {ovozYuzmoqda ? (
          <>
            <button
              style={{
                ...styles.ikonBtn,
                background: '#ff3b30',
                borderRadius: '50%',
                color: 'white',
                width: 44,
                height: 44,
              }}
              onClick={ovozYuborishni}
            >✓</button>
            <div style={{
              flex: 1,
              textAlign: 'center',
              color: '#666',
              fontSize: 14,
            }}>
              🎙️ {t('ovozYuborish')} ({ovozVaqti}s)
            </div>
          </>
        ) : (
          <>
            <button
              style={{ ...styles.ikonBtn, opacity: faylYuklanmoqda ? 0.5 : 1 }}
              onClick={faylTanlash}
              disabled={faylYuklanmoqda}
            >{faylYuklanmoqda ? '⏳' : '📎'}</button>

            <button
              style={{ ...styles.ikonBtn }}
              onMouseDown={ovozYozishiBoshla}
              onMouseUp={ovozYuborishni}
              onTouchStart={(e) => {
                e.preventDefault();
                ovozYozishiBoshla();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                ovozYuborishni();
              }}
            >🎙️</button>

            <textarea
              style={styles.input}
              placeholder={faylYuklanmoqda ? t('faylYuklanmoqda') : t('xabarYoz')}
              value={newMessage}
              onChange={handleMessageChange}
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
            >➤</button>
          </>
        )}
      </div>
    </div>
  );
}

// ==========================================
// STYLES
// ==========================================

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
    color: 'white',
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
  typingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    color: '#999',
    fontSize: 13,
    fontStyle: 'italic',
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