// ==========================================
// СТРАНИЦА ЗВОНКА
// Полноэкранный интерфейс WebRTC звонка — голосовой и видео
// Исправленная версия с корректным потоком сигнализации
// ==========================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useStore from '../store/useStore';

function Call() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId: myId } = useStore();

  // ==========================================
  // ПАРАМЕТРЫ ЗВОНКА (передаются через navigate state)
  // ==========================================
  const {
    otherUser,        // Объект собеседника {id, full_name}
    qongiroqTuri,     // Тип звонка: "ovoz" — голосовой, "video" — видео
    chaqiruvchi,      // true — мы звоним (инициатор), false — нам звонят (принимающий)
    callerId,         // ID звонящего (нужен, если нам звонят)
  } = location.state || {};

  // ==========================================
  // СОСТОЯНИЯ ЗВОНКА
  // ==========================================

  // Текущее состояние соединения:
  // "kutish"      — ожидание ответа на входящий звонок
  // "ulashmoqda"  — установка соединения (обмен SDP и ICE)
  // "ulandi"      — соединение установлено, идёт разговор
  // "tugadi"      — звонок завершён
  const [holat, setHolat] = useState(chaqiruvchi ? 'ulashmoqda' : 'kutish');

  // Длительность разговора в секундах (отображается как таймер)
  const [davomiylik, setDavomiylik] = useState(0);

  // Состояние микрофона: true — включён, false — выключен (mute)
  const [mikrofon, setMikrofon] = useState(true);

  // Состояние динамика: true — включён, false — выключен
  const [dinamik, setDinamik] = useState(true);

  // Состояние камеры: true — включена, false — выключена
  const [kamera, setKamera] = useState(true);

  // Сообщение об ошибке (если есть)
  const [xato, setXato] = useState(null);

  // ==========================================
  // ССЫЛКИ (refs) — не вызывают перерендер компонента
  // Используются для хранения мутабельных данных
  // ==========================================

  // WebSocket соединение для обмена сигналами (сигнализация)
  const wsRef = useRef(null);

  // RTCPeerConnection — главный объект WebRTC соединения
  const pcRef = useRef(null);

  // Локальный медиапоток (микрофон + камера пользователя)
  const lokalOqim = useRef(null);

  // Идентификатор интервала для таймера длительности
  const taymerRef = useRef(null);

  // Флаг для отслеживания, был ли уже создан offer
  // Предотвращает повторное создание offer при дублирующихся сигналах
  const offerYaratildi = useRef(false);

  // Ссылки на DOM-элементы видео
  const lokalVideoRef = useRef(null);   // Локальное видео (своё, маленькое окно)
  const uzoqVideoRef = useRef(null);    // Удалённое видео (собеседник, полный экран)

  // ==========================================
  // ИНИЦИАЛИЗАЦИЯ ПРИ МОНТИРОВАНИИ КОМПОНЕНТА
  // Запускается один раз при открытии страницы звонка
  // ==========================================
  useEffect(() => {
    // Если нет ID пользователя или данных о собеседнике — возвращаемся назад
    if (!myId || !otherUser) {
      navigate(-1);
      return;
    }

    // Запускаем процесс инициализации звонка
    boshlash();

    // Cleanup функция — вызывается при размонтировании компонента
    // Очищает все ресурсы: медиа, WebSocket, PeerConnection
    return () => {
      tozalash();
    };
  }, []); // Пустой массив зависимостей — эффект срабатывает только при монтировании

  // ==========================================
  // ЗАПУСК ТАЙМЕРА ДЛИТЕЛЬНОСТИ РАЗГОВОРА
  // Вызывается когда соединение установлено (connectionState === 'connected')
  // ==========================================
  const taymerniBoshlash = useCallback(() => {
    // Сбрасываем предыдущий таймер, если он существовал
    if (taymerRef.current) {
      clearInterval(taymerRef.current);
    }

    // Запускаем новый интервал — каждую секунду увеличиваем счётчик на 1
    taymerRef.current = setInterval(() => {
      setDavomiylik((prev) => prev + 1);
    }, 1000);
  }, []);

  // ==========================================
  // ФОРМАТИРОВАНИЕ ВРЕМЕНИ В ФОРМАТ "ММ:СС"
  // Принимает количество секунд, возвращает строку вида "01:23"
  // ==========================================
  const vaqtFormat = (soniya) => {
    const d = Math.floor(soniya / 60).toString().padStart(2, '0'); // Минуты
    const s = (soniya % 60).toString().padStart(2, '0');           // Секунды
    return `${d}:${s}`;
  };

  // ==========================================
  // ОСНОВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ ЗВОНКА
  // 1. Запрашивает доступ к микрофону/камере
  // 2. Отображает локальное видео
  // 3. Подключается к WebSocket сигналинг серверу
  // ==========================================
  const boshlash = async () => {
    try {
      // Настройка ограничений (constraints) для getUserMedia
      const constraints = {
        audio: true,  // Микрофон всегда нужен (и для голосового, и для видео)
        // Камера только если это видеозвонок
        video: qongiroqTuri === 'video'
          ? { width: { ideal: 1280 }, height: { ideal: 720 } } // HD качество
          : false,
      };

      // Запрашиваем доступ к медиаустройствам пользователя
      const oqim = await navigator.mediaDevices.getUserMedia(constraints);
      lokalOqim.current = oqim;

      // Показываем локальное видео в маленьком окне (только для видео звонка)
      if (lokalVideoRef.current && qongiroqTuri === 'video') {
        lokalVideoRef.current.srcObject = oqim;
      }

      // Подключаемся к сигналинг серверу через WebSocket
      wsGaUlan();

    } catch (err) {
      // Обработка ошибок доступа к медиаустройствам
      console.error('Ошибка доступа к медиаустройствам:', err);

      if (err.name === 'NotAllowedError') {
        setXato('Mikrofon yoki kameraga ruxsat berilmadi!');
      } else if (err.name === 'NotFoundError') {
        setXato('Mikrofon yoki kamera topilmadi!');
      } else {
        setXato('Media qurilmalarida xatolik!');
      }

      setHolat('tugadi');
    }
  };

  // ==========================================
  // ПОДКЛЮЧЕНИЕ К WEBSOCKET СИГНАЛИНГ СЕРВЕРУ
  // WebSocket используется для обмена SDP и ICE кандидатами
  // ==========================================
  const wsGaUlan = () => {
    // Создаём WebSocket соединение с сервером
    // URL содержит ID пользователя для идентификации
    const wsUrl = `wss://mymessenger-backend.onrender.com/calls/ws/${myId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // ==========================================
    // WebSocket СОБЫТИЕ: Соединение открыто
    // ==========================================
    ws.onopen = () => {
      console.log('WebSocket сигналинг серверга уланди');

      // Создаём RTCPeerConnection после установки WebSocket
      rtcYarat();

      // Если мы инициатор звонка (chaqiruvchi === true)
      if (chaqiruvchi) {
        // Небольшая задержка (500мс) чтобы принимающая сторона
        // успела подключиться к WebSocket
        setTimeout(() => {
          // Отправляем сигнал "qongiroq" — запрос на звонок
          ws.send(JSON.stringify({
            tur: 'qongiroq',
            receiver_id: otherUser.id,
            qongiroq_turi: qongiroqTuri,
          }));

          // Создаём SDP offer сразу после отправки запроса
          // Это оптимизация — не ждём ответа "qabul_qilindi"
          yaratVaYuborOffer();
        }, 500);
      }
    };

    // ==========================================
    // WebSocket СОБЫТИЕ: Получено сообщение
    // Обрабатываем все сигналы от сервера
    // ==========================================
    ws.onmessage = async (event) => {
      try {
        const signal = JSON.parse(event.data);
        console.log('Signal qabul qilindi:', signal.tur);
        await signalniQayta(signal);
      } catch (err) {
        console.error('Signalni qayta ishlashda xatolik:', err);
      }
    };

    // ==========================================
    // WebSocket СОБЫТИЕ: Соединение закрыто
    // ==========================================
    ws.onclose = (event) => {
      console.log('WebSocket yopildi:', event.code, event.reason);
      // Если звонок ещё не завершён пользователем — завершаем автоматически
      if (holat !== 'tugadi') {
        qongiroqniTugat();
      }
    };

    // ==========================================
    // WebSocket СОБЫТИЕ: Ошибка соединения
    // ==========================================
    ws.onerror = (err) => {
      console.error('WebSocket xatosi:', err);
      setXato('Signalizatsiya serveriga ulanishda xatolik!');
    };
  };

  // ==========================================
  // СОЗДАНИЕ RTCPeerConnection
  // Настраиваем STUN/TURN серверы для обхода NAT
  // Добавляем локальные медиатреки
  // Настраиваем обработчики событий
  // ==========================================
  const rtcYarat = () => {
    // Конфигурация ICE серверов
    // STUN — для определения публичного IP адреса
    // TURN — для ретрансляции медиа если прямое соединение невозможно
    const config = {
      iceServers: [
        // STUN сервер для определения внешнего IP
        {
          urls: "stun:stun.relay.metered.ca:80",
        },
        // TURN серверы для ретрансляции (UDP и TCP)
        {
          urls: "turn:global.relay.metered.ca:80",
          username: "6f90f2d5ec8fafb71a757a0f",
          credential: "b9MWx+jNYUHy0iDe",
        },
        {
          urls: "turn:global.relay.metered.ca:80?transport=tcp",
          username: "6f90f2d5ec8fafb71a757a0f",
          credential: "b9MWx+jNYUHy0iDe",
        },
        {
          urls: "turn:global.relay.metered.ca:443",
          username: "6f90f2d5ec8fafb71a757a0f",
          credential: "b9MWx+jNYUHy0iDe",
        },
        {
          urls: "turns:global.relay.metered.ca:443?transport=tcp",
          username: "6f90f2d5ec8fafb71a757a0f",
          credential: "b9MWx+jNYUHy0iDe",
        },
      ],
      // Политика сбора ICE кандидатов: собираем все доступные кандидаты
      iceCandidatePoolSize: 2,
    };

    // Создаём новый экземпляр RTCPeerConnection
    const pc = new RTCPeerConnection(config);
    pcRef.current = pc;

    // ==========================================
    // ДОБАВЛЯЕМ ЛОКАЛЬНЫЕ МЕДИАТРЕКИ
    // Все аудио и видео дорожки из локального потока
    // ==========================================
    if (lokalOqim.current) {
      lokalOqim.current.getTracks().forEach((track) => {
        pc.addTrack(track, lokalOqim.current);
        console.log('Trek qo\'shildi:', track.kind);
      });
    }

    // ==========================================
    // ОБРАБОТЧИК: Получен удалённый медиатрек
    // Срабатывает когда приходит видео/аудио от собеседника
    // ==========================================
    pc.ontrack = (event) => {
      console.log('Uzoq trek qabul qilindi:', event.track.kind);
      // Показываем поток собеседника в основном видео элементе
      if (uzoqVideoRef.current && event.streams[0]) {
        uzoqVideoRef.current.srcObject = event.streams[0];
      }
    };

    // ==========================================
    // ОБРАБОТЧИК: Новый ICE кандидат
    // Отправляем кандидата собеседнику через сигналинг сервер
    // ==========================================
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('ICE candidate yuborilmoqda:', event.candidate.type);
        wsRef.current.send(JSON.stringify({
          tur: 'ice',
          receiver_id: otherUser.id,
          candidate: event.candidate,
        }));
      }
    };

    // ==========================================
    // ОБРАБОТЧИК: Изменение состояния ICE соединения
    // Полезно для отладки проблем с сетью
    // ==========================================
    pc.oniceconnectionstatechange = () => {
      console.log('ICE holati:', pc.iceConnectionState);
      // Если ICE соединение разорвано — показываем ошибку
      if (pc.iceConnectionState === 'failed') {
        console.error('ICE ulanishi muvaffaqiyatsiz!');
        setXato('Tarmoq ulanishi muvaffaqiyatsiz!');
      }
    };

    // ==========================================
    // ОБРАБОТЧИК: Изменение состояния соединения
    // Основной индикатор успешности подключения
    // ==========================================
    pc.onconnectionstatechange = () => {
      console.log('Ulanish holati:', pc.connectionState);

      switch (pc.connectionState) {
        case 'connected':
          // Соединение успешно установлено
          console.log('✅ WebRTC ulandi!');
          setHolat('ulandi');
          taymerniBoshlash();
          break;

        case 'disconnected':
          // Временный разрыв — возможно восстановление
          console.warn('⚠️ Vaqtinchalik uzilish');
          break;

        case 'failed':
          // Критический сбой соединения
          console.error('❌ Ulanish muvaffaqiyatsiz!');
          setXato('Ulanish uzildi!');
          qongiroqniTugat();
          break;

        case 'closed':
          // Соединение закрыто (нормально или после failed)
          console.log('🔒 Ulanish yopildi');
          if (holat !== 'tugadi') {
            qongiroqniTugat();
          }
          break;

        default:
          break;
      }
    };

    // ==========================================
    // ОБРАБОТЧИК: Событие согласования (negotiationneeded)
    // Не используется в этом приложении, но оставлен для информации
    // ==========================================
    pc.onnegotiationneeded = () => {
      console.log('Negotiation needed — WebRTC qayta muzokara talab qilmoqda');
    };

    return pc;
  };

  // ==========================================
  // СОЗДАНИЕ И ОТПРАВКА SDP OFFER
  // Вызывается инициатором звонка
  // Создаёт описание локальной сессии и отправляет собеседнику
  // ==========================================
  const yaratVaYuborOffer = async () => {
    const pc = pcRef.current;
    if (!pc || offerYaratildi.current) return;

    try {
      offerYaratildi.current = true; // Блокируем повторное создание
      console.log('Offer yaratilmoqda...');

      // Создаём SDP offer — описание наших медиа возможностей
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,  // Принимаем аудио
        offerToReceiveVideo: qongiroqTuri === 'video', // Принимаем видео только для видео звонка
      });

      // Устанавливаем offer как локальное описание сессии
      await pc.setLocalDescription(offer);
      console.log('Local description o\'rnatildi (offer)');

      // Отправляем offer собеседнику через сигналинг сервер
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          tur: 'offer',
          receiver_id: otherUser.id,
          sdp: pc.localDescription, // Отправляем полное SDP описание
        }));
        console.log('Offer yuborildi');
      }
    } catch (err) {
      console.error('Offer yaratishda xatolik:', err);
      setXato('Ulanish o\'rnatishda xatolik!');
      offerYaratildi.current = false; // Сбрасываем флаг при ошибке
    }
  };

  // ==========================================
  // ОБРАБОТКА ВХОДЯЩИХ СИГНАЛОВ ОТ СЕРВЕРА
  // Центральная функция обработки всех типов сигналов
  // ==========================================
  const signalniQayta = async (signal) => {
    const pc = pcRef.current;

    switch (signal.tur) {

      // ==========================================
      // СИГНАЛ: "qabul_qilindi" — собеседник принял звонок
      // Получает ТОЛЬКО инициатор звонка
      // ==========================================
      case 'qabul_qilindi':
        console.log('Qabul qilindi signali qabul qilindi');
        setHolat('ulashmoqda');
        // Если offer ещё не был создан — создаём сейчас
        // Это fallback на случай если offer не отправился при инициализации
        if (!offerYaratildi.current) {
          await yaratVaYuborOffer();
        }
        break;

      // ==========================================
      // СИГНАЛ: "offer" — получен SDP offer от инициатора
      // Получает ТОЛЬКО принимающая сторона
      // ==========================================
      case 'offer':
        console.log('Offer qabul qilindi');
        if (pc && signal.sdp) {
          try {
            setHolat('ulashmoqda');
            // Устанавливаем offer как удалённое описание сессии
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            console.log('Remote description o\'rnatildi (offer)');

            // Создаём SDP answer — наш ответ на offer
            const answer = await pc.createAnswer();
            // Устанавливаем answer как локальное описание
            await pc.setLocalDescription(answer);
            console.log('Local description o\'rnatildi (answer)');

            // Отправляем answer обратно инициатору звонка
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                tur: 'answer',
                caller_id: signal.caller_id || callerId,
                sdp: pc.localDescription,
              }));
              console.log('Answer yuborildi');
            }
          } catch (err) {
            console.error('Offerni qayta ishlashda xatolik:', err);
          }
        }
        break;

      // ==========================================
      // СИГНАЛ: "answer" — получен SDP answer от принимающего
      // Получает ТОЛЬКО инициатор звонка
      // ==========================================
      case 'answer':
        console.log('Answer qabul qilindi');
        if (pc && signal.sdp) {
          try {
            // Устанавливаем answer как удалённое описание сессии
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            console.log('Remote description o\'rnatildi (answer)');
            // После этого начнётся обмен ICE кандидатами
          } catch (err) {
            console.error('Answerni qayta ishlashda xatolik:', err);
          }
        }
        break;

      // ==========================================
      // СИГНАЛ: "ice" — получен ICE кандидат от собеседника
      // Получают ОБЕ стороны
      // ==========================================
      case 'ice':
        if (pc && signal.candidate) {
          try {
            // Добавляем ICE кандидата в PeerConnection
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            console.log('ICE candidate qo\'shildi:', signal.candidate.type);
          } catch (err) {
            console.error('ICE candidate qo\'shishda xatolik:', err);
          }
        }
        break;

      // ==========================================
      // СИГНАЛ: "rad_etildi" — звонок отклонён собеседником
      // ==========================================
      case 'rad_etildi':
        console.log('Qo\'ng\'iroq rad etildi');
        setXato("Qo'ng'iroq rad etildi!");
        setHolat('tugadi');
        // Автоматически возвращаемся назад через 2 секунды
        setTimeout(() => navigate(-1), 2000);
        break;

      // ==========================================
      // СИГНАЛ: "tugatildi" — собеседник завершил звонок
      // ==========================================
      case 'tugatildi':
        console.log('Qo\'ng\'iroq boshqa tomon tomonidan tugatildi');
        qongiroqniTugat();
        break;

      // ==========================================
      // СИГНАЛ: "band" — собеседник занят другим звонком
      // ==========================================
      case 'band':
        console.log('Foydalanuvchi band');
        setXato('Foydalanuvchi hozir band!');
        setHolat('tugadi');
        setTimeout(() => navigate(-1), 2000);
        break;

      // ==========================================
      // СИГНАЛ: "xato" — сервер сообщает об ошибке
      // ==========================================
      case 'xato':
        console.error('Server xatosi:', signal.xabar);
        setXato(signal.xabar || 'Noma\'lum xatolik!');
        setHolat('tugadi');
        setTimeout(() => navigate(-1), 2000);
        break;

      // ==========================================
      // Неизвестный тип сигнала
      // ==========================================
      default:
        console.warn('Noma\'lum signal turi:', signal.tur);
        break;
    }
  };

  // ==========================================
  // ПРИНЯТЬ ВХОДЯЩИЙ ЗВОНОК
  // Вызывается когда пользователь нажимает "Принять"
  // ==========================================
  const qongiroqniQabul = () => {
    console.log('Qo\'ng\'iroq qabul qilinmoqda...');
    setHolat('ulashmoqda');

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Отправляем сигнал "qabul" инициатору звонка
      wsRef.current.send(JSON.stringify({
        tur: 'qabul',
        caller_id: callerId,
      }));
      console.log('Qabul signali yuborildi');
    }
  };

  // ==========================================
  // ОТКЛОНИТЬ ВХОДЯЩИЙ ЗВОНОК
  // Вызывается когда пользователь нажимает "Отклонить"
  // ==========================================
  const qongiroqniRad = () => {
    console.log('Qo\'ng\'iroq rad etilmoqda...');

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Отправляем сигнал "rad" инициатору звонка
      wsRef.current.send(JSON.stringify({
        tur: 'rad',
        caller_id: callerId,
      }));
    }

    // Возвращаемся на предыдущую страницу
    navigate(-1);
  };

  // ==========================================
  // ЗАВЕРШИТЬ ЗВОНОК
  // Вызывается при нажатии кнопки "Завершить" или при обрыве соединения
  // ==========================================
  const qongiroqniTugat = useCallback(() => {
    console.log('Qo\'ng\'iroq tugatilmoqda...');

    // Отправляем сигнал о завершении собеседнику
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        tur: 'tugatish',
        receiver_id: otherUser?.id,
      }));
    }

    // Обновляем состояние
    setHolat('tugadi');

    // Очищаем все ресурсы
    tozalash();

    // Возвращаемся назад через 1 секунду
    setTimeout(() => navigate(-1), 1000);
  }, [otherUser, navigate]);

  // ==========================================
  // ОЧИСТКА ВСЕХ РЕСУРСОВ
  // Останавливаем медиа, закрываем соединения, очищаем таймеры
  // ==========================================
  const tozalash = () => {
    console.log('Resurslar tozalanmoqda...');

    // Останавливаем таймер длительности
    if (taymerRef.current) {
      clearInterval(taymerRef.current);
      taymerRef.current = null;
    }

    // Останавливаем все треки локального медиапотока
    // Это выключает камеру и микрофон
    if (lokalOqim.current) {
      lokalOqim.current.getTracks().forEach((track) => {
        track.stop();
        console.log(`${track.kind} trek to\'xtatildi`);
      });
      lokalOqim.current = null;
    }

    // Закрываем RTCPeerConnection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
      console.log('PeerConnection yopildi');
    }

    // Закрываем WebSocket соединение
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      console.log('WebSocket yopildi');
    }

    // Сбрасываем флаг создания offer
    offerYaratildi.current = false;
  };

  // ==========================================
  // ПЕРЕКЛЮЧЕНИЕ МИКРОФОНА (MUTE/UNMUTE)
  // Отключает/включает все аудиодорожки
  // ==========================================
  const mikrofonToggle = () => {
    if (lokalOqim.current) {
      lokalOqim.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
        console.log(`Mikrofon ${track.enabled ? 'yoqildi' : 'o\'chirildi'}`);
      });
      setMikrofon((prev) => !prev);
    }
  };

  // ==========================================
  // ПЕРЕКЛЮЧЕНИЕ КАМЕРЫ (ON/OFF)
  // Отключает/включает все видеодорожки
  // ==========================================
  const kameraToggle = () => {
    if (lokalOqim.current) {
      lokalOqim.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
        console.log(`Kamera ${track.enabled ? 'yoqildi' : 'o\'chirildi'}`);
      });
      setKamera((prev) => !prev);
    }
  };

  // ==========================================
  // ПЕРЕКЛЮЧЕНИЕ ДИНАМИКА (только для голосового звонка)
  // В веб-версии это визуальный индикатор
  // Реальное управление динамиком ограничено в браузерах
  // ==========================================
  const dinamikToggle = () => {
    setDinamik((prev) => !prev);
    // В будущем можно добавить audio element management
    console.log(`Dinamik ${!dinamik ? 'yoqildi' : 'o\'chirildi'}`);
  };

  // ==========================================
  // РЕНДЕР: ЭКРАН ВХОДЯЩЕГО ЗВОНКА (ожидание ответа)
  // Показывается когда нам звонят и мы ещё не ответили
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

        {/* Центральный блок с информацией о звонящем */}
        <div style={styles.markaziy}>
          {/* Аватар звонящего */}
          <div style={styles.bigAvatar}>
            {otherUser?.full_name?.[0]?.toUpperCase() || '?'}
          </div>

          {/* Имя звонящего */}
          <div style={styles.ismKatta}>{otherUser?.full_name}</div>

          {/* Тип звонка: видео или голосовой */}
          <div style={styles.qongiroqTuriMatn}>
            {qongiroqTuri === 'video'
              ? '📹 Video qo\'ng\'iroq'
              : '📞 Ovozli qo\'ng\'iroq'}
          </div>

          {/* Кнопки действий: Принять / Отклонить */}
          <div style={styles.tugmalarQator}>
            {/* Кнопка "Отклонить" */}
            <div style={styles.tugmaQadoq}>
              <button
                style={{ ...styles.yumaloqBtn, background: '#ff3b30' }}
                onClick={qongiroqniRad}
              >
                📵
              </button>
              <span style={styles.tugmaLabel}>Rad etish</span>
            </div>

            {/* Кнопка "Принять" */}
            <div style={styles.tugmaQadoq}>
              <button
                style={{ ...styles.yumaloqBtn, background: '#34c759' }}
                onClick={qongiroqniQabul}
              >
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
  // РЕНДЕР: ОСНОВНОЙ ЭКРАН ЗВОНКА
  // Показывается во время разговора
  // ==========================================
  return (
    <div style={styles.fullscreen}>
      {/* Фоновый градиент */}
      <div style={styles.gradient} />

      {/* Видео собеседника (полный экран) — только для видео звонка */}
      {qongiroqTuri === 'video' && (
        <video
          ref={uzoqVideoRef}
          autoPlay
          playsInline
          style={styles.uzoqVideo}
        />
      )}

      {/* Аватар собеседника для голосового звонка */}
      {qongiroqTuri === 'ovoz' && (
        <div style={styles.ovozliMarkaziy}>
          {/* Анимированные круги пульсации (только когда соединение установлено) */}
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

        {/* Статус соединения или таймер разговора */}
        <div style={styles.statusMatn}>
          {holat === 'ulashmoqda' && '⟳ Ulanmoqda...'}
          {holat === 'ulandi' && `🟢 ${vaqtFormat(davomiylik)}`}
          {holat === 'tugadi' && (xato || "Qo'ng'iroq tugadi")}
        </div>
      </div>

      {/* Локальное видео (картинка-в-картинке) — только для видео звонка */}
      {qongiroqTuri === 'video' && (
        <video
          ref={lokalVideoRef}
          autoPlay
          playsInline
          muted  // Отключаем звук локального видео для предотвращения эха
          style={styles.lokalVideo}
        />
      )}

      {/* Нижняя панель управления */}
      <div style={styles.pastPanel}>
        {/* Кнопка микрофона (Mute/Unmute) */}
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
          <span style={styles.tugmaLabel}>
            {mikrofon ? 'Mikrofon' : 'Jimlik'}
          </span>
        </div>

        {/* Кнопка завершения звонка (красная, увеличенная) */}
        <div style={styles.tugmaQadoq}>
          <button
            style={{
              ...styles.yumaloqBtn,
              background: '#ff3b30',
              width: 72,
              height: 72,
            }}
            onClick={qongiroqniTugat}
          >
            📵
          </button>
          <span style={styles.tugmaLabel}>Tugatish</span>
        </div>

        {/* Кнопка камеры (для видео) или динамика (для голосового) */}
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
            <span style={styles.tugmaLabel}>
              {kamera ? 'Kamera' : 'O\'chiriq'}
            </span>
          </div>
        ) : (
          <div style={styles.tugmaQadoq}>
            <button
              style={{
                ...styles.yumaloqBtn,
                background: dinamik ? 'rgba(255,255,255,0.2)' : '#ff3b30',
              }}
              onClick={dinamikToggle}
            >
              {dinamik ? '🔊' : '🔈'}
            </button>
            <span style={styles.tugmaLabel}>
              {dinamik ? 'Dinamik' : 'Jimlik'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// СТИЛИ ОФОРМЛЕНИЯ
// ==========================================
const styles = {
  // Полноэкранный контейнер с позиционированием по центру
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
  // Анимированные круги (эффект пульсации для голосового звонка)
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
  // Центральный блок содержимого
  markaziy: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
  },
  // Большой аватар пользователя
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
  // Имя собеседника
  ismKatta: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    textShadow: '0 2px 10px rgba(0,0,0,0.5)',
    position: 'relative',
    zIndex: 10,
  },
  // Тип звонка (видео/голосовой)
  qongiroqTuriMatn: {
    fontSize: 16,
    opacity: 0.8,
    position: 'relative',
    zIndex: 10,
  },
  // Ряд кнопок действий
  tugmalarQator: {
    display: 'flex',
    gap: 60,
    marginTop: 20,
    position: 'relative',
    zIndex: 10,
  },
  // Контейнер кнопки с подписью
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
  // Верхняя панель с информацией
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
  // Статус звонка или таймер
  statusMatn: {
    fontSize: 16,
    opacity: 0.85,
  },
  // Нижняя панель с кнопками управления
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
  // Видео собеседника (полный экран)
  uzoqVideo: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    zIndex: 2,
  },
  // Локальное видео (картинка-в-картинке)
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