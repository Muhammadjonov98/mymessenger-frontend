// ==========================================
// СТРАНИЦА ЗВОНКА
// Полноэкранный интерфейс WebRTC звонка — голосовой и видео
// ==========================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useStore from '../store/useStore';

function Call() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId: myId } = useStore();

  // Параметры звонка переданные через navigate state
  const {
    otherUser,        // Объект собеседника {id, full_name}
    qongiroqTuri,     // Тип звонка: "ovoz" или "video"
    chaqiruvchi,      // true — мы звоним, false — нам звонят
    callerId,         // ID звонящего (если нам звонят)
  } = location.state || {};

  // ==========================================
  // СОСТОЯНИЯ ЗВОНКА
  // ==========================================

  // Текущее состояние: "kutish" | "ulashmoqda" | "ulandi" | "tugadi"
  const [holat, setHolat] = useState(chaqiruvchi ? 'ulashmoqda' : 'kutish');

  // Длительность звонка в секундах
  const [davomiylik, setDavomiylik] = useState(0);

  // Микрофон выключен
  const [mikrofon, setMikrofon] = useState(true);

  // Динамик выключен
  const [dinamik, setDinamik] = useState(true);

  // Камера выключена (только для видео звонка)
  const [kamera, setKamera] = useState(true);

  // Ошибка подключения
  const [xato, setXato] = useState(null);

  // ==========================================
  // РЕФЫ — НЕ ВЫЗЫВАЮТ ПЕРЕРЕНДЕР
  // ==========================================

  // WebSocket соединение для сигналинга
  const wsRef = useRef(null);

  // RTCPeerConnection — основной объект WebRTC
  const pcRef = useRef(null);

  // Локальный медиапоток (наш микрофон/камера)
  const lokalOqim = useRef(null);

  // Таймер длительности звонка
  const taymerRef = useRef(null);

  // Видео элементы
  const lokalVideoRef = useRef(null);   // Наше видео (маленькое)
  const uzoqVideoRef = useRef(null);    // Видео собеседника (большое)

  // ==========================================
  // ИНИЦИАЛИЗАЦИЯ — подключаемся при монтировании
  // ==========================================
  useEffect(() => {
    if (!myId || !otherUser) {
      // Если нет данных — возвращаемся назад
      navigate(-1);
      return;
    }

    // Запускаем инициализацию звонка
    boshlash();

    // Очистка при размонтировании компонента
    return () => {
      tozalash();
    };
  }, []);

  // ==========================================
  // ТАЙМЕР ДЛИТЕЛЬНОСТИ ЗВОНКА
  // Запускается когда соединение установлено
  // ==========================================
  const taymerniBoshlash = () => {
    // Сбрасываем предыдущий таймер если был
    if (taymerRef.current) clearInterval(taymerRef.current);

    // Запускаем новый таймер — каждую секунду увеличиваем счётчик
    taymerRef.current = setInterval(() => {
      setDavomiylik((prev) => prev + 1);
    }, 1000);
  };

  // ==========================================
  // ФОРМАТИРОВАНИЕ ВРЕМЕНИ — "01:23"
  // ==========================================
  const vaqtFormat = (soniya) => {
    // Вычисляем минуты и секунды из общего количества секунд
    const d = Math.floor(soniya / 60).toString().padStart(2, '0');
    const s = (soniya % 60).toString().padStart(2, '0');
    return `${d}:${s}`;
  };

  // ==========================================
  // ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ ЗВОНКА
  // ==========================================
  const boshlash = async () => {
    try {
      // Запрашиваем доступ к микрофону и камере
      const constraints = {
        audio: true,
        // Камера только для видеозвонка
        video: qongiroqTuri === 'video' ? { width: 1280, height: 720 } : false,
      };

      // Получаем медиапоток от устройств пользователя
      const oqim = await navigator.mediaDevices.getUserMedia(constraints);
      lokalOqim.current = oqim;

      // Показываем наше видео в локальном элементе
      if (lokalVideoRef.current) {
        lokalVideoRef.current.srcObject = oqim;
      }

      // Подключаемся к WebSocket сигналинг серверу
      wsGaUlan();

    } catch (err) {
      // Пользователь отказал в доступе к микрофону/камере
      console.error('Ошибка доступа к медиаустройствам:', err);
      setXato('Mikrofon yoki kameraga ruxsat berilmadi!');
      setHolat('tugadi');
    }
  };

  // ==========================================
  // ПОДКЛЮЧЕНИЕ К WEBSOCKET СИГНАЛИНГ СЕРВЕРУ
  // ==========================================
  const wsGaUlan = () => {
    // Открываем WebSocket соединение с сигналинг сервером
    const ws = new WebSocket(`ws://localhost:8000/calls/ws/${myId}`);
    wsRef.current = ws;

    ws.onopen = () => {
     rtcYarat();

     if (chaqiruvchi) {
       // 500ms kutamiz — ikkinchi tomon calls/ws ga ulangunicha
       setTimeout(() => {
         ws.send(JSON.stringify({
           tur: 'qongiroq',
           receiver_id: otherUser.id,
          qongiroq_turi: qongiroqTuri,
         }));
       }, 500);
     }
   };

    ws.onmessage = async (event) => {
      // Получили сигнал от сервера — обрабатываем
      const signal = JSON.parse(event.data);
      await signalniQayta(signal);
    };

    ws.onclose = () => {
      // WebSocket закрыт — завершаем звонок
      if (holat !== 'tugadi') {
        qongiroqniTugat();
      }
    };

    ws.onerror = (err) => {
      // Ошибка WebSocket соединения
      console.error('WebSocket xatosi:', err);
      setXato('Ulanish xatosi!');
    };
  };

  // ==========================================
  // СОЗДАНИЕ RTCPeerConnection
  // Настраиваем STUN серверы для NAT traversal
  // ==========================================
  const rtcYarat = () => {
    // Конфигурация с публичными STUN серверами Google
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    };

    // Создаём объект peer соединения
    const pc = new RTCPeerConnection(config);
    pcRef.current = pc;

    // Добавляем все треки локального потока в соединение
    if (lokalOqim.current) {
      lokalOqim.current.getTracks().forEach((track) => {
        pc.addTrack(track, lokalOqim.current);
      });
    }

    // Обработчик входящих треков от собеседника
    pc.ontrack = (event) => {
      if (uzoqVideoRef.current) {
        // Показываем поток собеседника в элементе видео
        uzoqVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Обработчик новых ICE кандидатов — отправляем собеседнику
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        // Отправляем ICE кандидат через сигналинг сервер
        wsRef.current.send(JSON.stringify({
          tur: 'ice',
          receiver_id: otherUser.id,
          candidate: event.candidate,
        }));
      }
    };

    // Обработчик изменения состояния соединения
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        // Соединение установлено — запускаем таймер
        setHolat('ulandi');
        taymerniBoshlash();
      } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        // Соединение разорвано — завершаем звонок
        qongiroqniTugat();
      }
    };

    return pc;
  };

  // ==========================================
  // ОБРАБОТКА ВХОДЯЩИХ СИГНАЛОВ
  // ==========================================
  const signalniQayta = async (signal) => {
    const pc = pcRef.current;

    switch (signal.tur) {

      // Собеседник принял звонок — создаём и отправляем offer
      case 'qabul_qilindi':
        setHolat('ulashmoqda');
        if (pc) {
          // Создаём SDP offer — описание нашего медиапотока
          const offer = await pc.createOffer();
          // Устанавливаем как локальное описание
          await pc.setLocalDescription(offer);
          // Отправляем offer собеседнику через сигналинг
          wsRef.current.send(JSON.stringify({
            tur: 'offer',
            receiver_id: otherUser.id,
            sdp: offer,
          }));
        }
        break;

      // Получили offer — создаём и отправляем answer
      case 'offer':
        if (pc) {
          // Устанавливаем описание собеседника как удалённое
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          // Создаём SDP answer — наш ответ
          const answer = await pc.createAnswer();
          // Устанавливаем как локальное описание
          await pc.setLocalDescription(answer);
          // Отправляем answer обратно звонящему
          wsRef.current.send(JSON.stringify({
            tur: 'answer',
            caller_id: signal.caller_id,
            sdp: answer,
          }));
        }
        break;

      // Получили answer от собеседника
      case 'answer':
        if (pc) {
          // Устанавливаем answer как удалённое описание
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        }
        break;

      // Получили ICE кандидат от собеседника
      case 'ice':
        if (pc && signal.candidate) {
          try {
            // Добавляем ICE кандидат в соединение
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.error('ICE candidate xatosi:', e);
          }
        }
        break;

      // Звонок отклонён собеседником
      case 'rad_etildi':
        setXato("Qo'ng'iroq rad etildi!");
        setHolat('tugadi');
        // Автоматически закрываем экран через 2 секунды
        setTimeout(() => navigate(-1), 2000);
        break;

      // Звонок завершён собеседником
      case 'tugatildi':
        qongiroqniTugat();
        break;

      // Собеседник занят другим звонком
      case 'band':
        setXato('Foydalanuvchi hozir band!');
        setHolat('tugadi');
        setTimeout(() => navigate(-1), 2000);
        break;

      // Собеседник офлайн
      case 'xato':
        setXato(signal.xabar);
        setHolat('tugadi');
        setTimeout(() => navigate(-1), 2000);
        break;

      default:
        break;
    }
  };

  // ==========================================
  // ПРИНЯТЬ ВХОДЯЩИЙ ЗВОНОК
  // ==========================================
  const qongiroqniQabul = () => {
    setHolat('ulashmoqda');
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Отправляем сигнал о принятии звонка
      wsRef.current.send(JSON.stringify({
        tur: 'qabul',
        caller_id: callerId,
      }));
    }
  };

  // ==========================================
  // ОТКЛОНИТЬ ВХОДЯЩИЙ ЗВОНОК
  // ==========================================
  const qongiroqniRad = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Отправляем сигнал об отклонении звонка
      wsRef.current.send(JSON.stringify({
        tur: 'rad',
        caller_id: callerId,
      }));
    }
    // Возвращаемся назад
    navigate(-1);
  };

  // ==========================================
  // ЗАВЕРШИТЬ ЗВОНОК
  // ==========================================
  const qongiroqniTugat = useCallback(() => {
    // Отправляем сигнал о завершении звонка собеседнику
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        tur: 'tugatish',
        receiver_id: otherUser?.id,
      }));
    }

    // Устанавливаем статус завершения
    setHolat('tugadi');

    // Очищаем ресурсы
    tozalash();

    // Возвращаемся на предыдущую страницу через 1 секунду
    setTimeout(() => navigate(-1), 1000);
  }, [otherUser, navigate]);

  // ==========================================
  // ОЧИСТКА РЕСУРСОВ
  // Останавливаем все медиатреки и закрываем соединения
  // ==========================================
  const tozalash = () => {
    // Останавливаем таймер длительности
    if (taymerRef.current) clearInterval(taymerRef.current);

    // Останавливаем все треки локального потока
    if (lokalOqim.current) {
      lokalOqim.current.getTracks().forEach((track) => track.stop());
    }

    // Закрываем RTCPeerConnection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Закрываем WebSocket соединение
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  // ==========================================
  // ПЕРЕКЛЮЧЕНИЕ МИКРОФОНА
  // ==========================================
  const mikrofonToggle = () => {
    if (lokalOqim.current) {
      // Переключаем состояние всех аудиотреков
      lokalOqim.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setMikrofon((prev) => !prev);
    }
  };

  // ==========================================
  // ПЕРЕКЛЮЧЕНИЕ КАМЕРЫ
  // ==========================================
  const kameraToggle = () => {
    if (lokalOqim.current) {
      // Переключаем состояние всех видеотреков
      lokalOqim.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setKamera((prev) => !prev);
    }
  };

  // ==========================================
  // РЕНДЕР — ВХОДЯЩИЙ ЗВОНОК (нам звонят)
  // ==========================================
  if (holat === 'kutish') {
    return (
      <div style={styles.fullscreen}>
        {/* Фоновый градиент */}
        <div style={styles.gradient} />

        {/* Анимированные круги вокруг аватара */}
        <div style={styles.animCircle1} />
        <div style={styles.animCircle2} />
        <div style={styles.animCircle3} />

        {/* Содержимое экрана входящего звонка */}
        <div style={styles.markaziy}>
          {/* Аватар звонящего */}
          <div style={styles.bigAvatar}>
            {otherUser?.full_name?.[0]?.toUpperCase() || '?'}
          </div>

          {/* Имя звонящего */}
          <div style={styles.ismKatta}>{otherUser?.full_name}</div>

          {/* Тип звонка */}
          <div style={styles.qongiroqTuriMatn}>
            {qongiroqTuri === 'video' ? '📹 Video qo\'ng\'iroq' : '📞 Ovozli qo\'ng\'iroq'}
          </div>

          {/* Кнопки принять/отклонить */}
          <div style={styles.tugmalarQator}>
            {/* Кнопка отклонить */}
            <div style={styles.tugmaQadoq}>
              <button style={{ ...styles.yumaloqBtn, background: '#ff3b30' }} onClick={qongiroqniRad}>
                📵
              </button>
              <span style={styles.tugmaLabel}>Rad etish</span>
            </div>

            {/* Кнопка принять */}
            <div style={styles.tugmaQadoq}>
              <button style={{ ...styles.yumaloqBtn, background: '#34c759' }} onClick={qongiroqniQabul}>
                📞
              </button>
              <span style={styles.tugmaLabel}>Qabul qilish</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // РЕНДЕР — ОСНОВНОЙ ЭКРАН ЗВОНКА
  // ==========================================
  return (
    <div style={styles.fullscreen}>
      {/* Фоновый градиент */}
      <div style={styles.gradient} />

      {/* Видео собеседника (полный экран, фон) */}
      {qongiroqTuri === 'video' && (
        <video
          ref={uzoqVideoRef}
          autoPlay
          playsInline
          style={styles.uzoqVideo}
        />
      )}

      {/* Аватар собеседника (для голосового звонка) */}
      {qongiroqTuri === 'ovoz' && (
        <div style={styles.ovozliMarkaziy}>
          {/* Анимированные круги */}
          {holat === 'ulandi' && (
            <>
              <div style={styles.animCircle1} />
              <div style={styles.animCircle2} />
              <div style={styles.animCircle3} />
            </>
          )}
          {/* Большой аватар собеседника */}
          <div style={styles.bigAvatar}>
            {otherUser?.full_name?.[0]?.toUpperCase() || '?'}
          </div>
        </div>
      )}

      {/* Верхняя информационная панель */}
      <div style={styles.yuqoriPanel}>
        {/* Имя собеседника */}
        <div style={styles.ismKatta}>{otherUser?.full_name}</div>

        {/* Статус или таймер */}
        <div style={styles.statusMatn}>
          {holat === 'ulashmoqda' && '⟳ Ulanmoqda...'}
          {holat === 'ulandi' && `🟢 ${vaqtFormat(davomiylik)}`}
          {holat === 'tugadi' && (xato || "Qo'ng'iroq tugadi")}
        </div>
      </div>

      {/* Наше маленькое видео (pip — picture in picture) */}
      {qongiroqTuri === 'video' && (
        <video
          ref={lokalVideoRef}
          autoPlay
          playsInline
          muted
          style={styles.lokalVideo}
        />
      )}

      {/* Нижняя панель управления */}
      <div style={styles.pastPanel}>

        {/* Кнопка микрофона */}
        <div style={styles.tugmaQadoq}>
          <button
            style={{
              ...styles.yumaloqBtn,
              background: mikrofon ? 'rgba(255,255,255,0.2)' : '#ff3b30',
            }}
            onClick={mikrofonToggle}
          >
            {mikrofon ? '🎤' : '🔇'}
          </button>
          <span style={styles.tugmaLabel}>{mikrofon ? 'Mikrofon' : 'Jimlik'}</span>
        </div>

        {/* Кнопка завершения звонка */}
        <div style={styles.tugmaQadoq}>
          <button
            style={{ ...styles.yumaloqBtn, background: '#ff3b30', width: 72, height: 72 }}
            onClick={qongiroqniTugat}
          >
            📵
          </button>
          <span style={styles.tugmaLabel}>Tugatish</span>
        </div>

        {/* Кнопка камеры (только для видеозвонка) */}
        {qongiroqTuri === 'video' ? (
          <div style={styles.tugmaQadoq}>
            <button
              style={{
                ...styles.yumaloqBtn,
                background: kamera ? 'rgba(255,255,255,0.2)' : '#ff3b30',
              }}
              onClick={kameraToggle}
            >
              {kamera ? '📹' : '📷'}
            </button>
            <span style={styles.tugmaLabel}>{kamera ? 'Kamera' : 'O\'chiriq'}</span>
          </div>
        ) : (
          // Для голосового — кнопка динамика
          <div style={styles.tugmaQadoq}>
            <button
              style={{
                ...styles.yumaloqBtn,
                background: dinamik ? 'rgba(255,255,255,0.2)' : '#ff3b30',
              }}
              onClick={() => setDinamik((prev) => !prev)}
            >
              {dinamik ? '🔊' : '🔈'}
            </button>
            <span style={styles.tugmaLabel}>{dinamik ? 'Dinamik' : 'Jimlik'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// СТИЛИ
// ==========================================
const styles = {
  // Полноэкранный контейнер
  fullscreen: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    fontFamily: 'Segoe UI, sans-serif',
    color: 'white',
  },
  // Тёмный градиентный фон
  gradient: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    zIndex: 0,
  },
  // Анимированные круги (пульсация)
  animCircle1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.1)',
    animation: 'pulse 2s ease-in-out infinite',
    zIndex: 1,
  },
  animCircle2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.15)',
    animation: 'pulse 2s ease-in-out infinite 0.5s',
    zIndex: 1,
  },
  animCircle3: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.2)',
    animation: 'pulse 2s ease-in-out infinite 1s',
    zIndex: 1,
  },
  // Центральный блок
  markaziy: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
  },
  // Большой аватар
  bigAvatar: {
    width: 120,
    height: 120,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #2AABEE, #007AFF)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
    boxShadow: '0 0 40px rgba(42,171,238,0.5)',
    position: 'relative',
    zIndex: 10,
  },
  // Имя собеседника (большое)
  ismKatta: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    textShadow: '0 2px 10px rgba(0,0,0,0.5)',
    position: 'relative',
    zIndex: 10,
  },
  // Тип звонка
  qongiroqTuriMatn: {
    fontSize: 16,
    opacity: 0.8,
    position: 'relative',
    zIndex: 10,
  },
  // Строка кнопок
  tugmalarQator: {
    display: 'flex',
    gap: 60,
    marginTop: 20,
    position: 'relative',
    zIndex: 10,
  },
  // Обёртка кнопки с подписью
  tugmaQadoq: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  // Круглая кнопка управления
  yumaloqBtn: {
    width: 60,
    height: 60,
    borderRadius: '50%',
    border: 'none',
    fontSize: 24,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    backdropFilter: 'blur(10px)',
    transition: 'transform 0.1s, opacity 0.2s',
  },
  // Подпись под кнопкой
  tugmaLabel: {
    fontSize: 12,
    opacity: 0.8,
    color: 'white',
  },
  // Верхняя информационная панель
  yuqoriPanel: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  // Статус звонка
  statusMatn: {
    fontSize: 16,
    opacity: 0.85,
  },
  // Нижняя панель управления
  pastPanel: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    gap: 40,
    zIndex: 10,
  },
  // Центральный блок для голосового звонка
  ovozliMarkaziy: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  // Видео собеседника (фон, полный экран)
  uzoqVideo: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    zIndex: 2,
  },
  // Наше маленькое видео (pip)
  lokalVideo: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 120,
    height: 160,
    borderRadius: 16,
    objectFit: 'cover',
    zIndex: 15,
    border: '2px solid rgba(255,255,255,0.3)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
  },
};

export default Call;