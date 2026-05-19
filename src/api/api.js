// ==========================================
// API — Сервер bilan ishlash
// ==========================================

import axios from 'axios';

const BASE_URL = 'https://mymessenger-backend.onrender.com';
const WS_BASE = 'wss://mymessenger-backend.onrender.com';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ==========================================
// AUTH API
// ==========================================
export const authAPI = {
  login: (username, password) =>
    api.post('/auth/login', { username, password }),

  register: (username, password, full_name) =>
    api.post('/auth/register', { username, password, full_name }),

  me: (token) =>
    api.get(`/auth/me?token=${token}`),
};

// ==========================================
// USERS API
// ==========================================
export const usersAPI = {
  getAll: () =>
    api.get('/users'),
};

// ==========================================
// MESSAGES API
// ==========================================
export const messagesAPI = {
  getHistory: (userId, myId) =>
    api.get(`/messages/${userId}?current_user_id=${myId}`),

  markRead: (messageId) =>
    api.post(`/messages/${messageId}/read`),
};

// ==========================================
// FILES API - TOLIQ TUZATILGAN
// ==========================================
export const filesAPI = {
  // Oddiy fayl yuklash (rasm, video, hujjat)
  upload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // ✅ OVOZLI XABAR YUKLASH
  uploadVoice: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/files/voice', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // To'liq URL yaratish
  toFullUrl: (url) => `${BASE_URL}${url}`,

  // Fayllar ro'yxatini olish
  getList: (tur) =>
    api.get(`/files/list/${tur}`),
};

// ==========================================
// WEBSOCKET URL LAR
// ==========================================
export const getWsUrl = (userId) =>
  `${WS_BASE}/ws/${userId}`;

export const getCallWsUrl = (userId) =>
  `${WS_BASE}/calls/ws/${userId}`;

// ==========================================
// KEEP ALIVE - Server vaqt o'tganda qo'ymaydi
// ==========================================
setInterval(() => {
  fetch(`${BASE_URL}/`).catch(() => {
    console.log('Keep-alive ping');
  });
}, 4 * 60 * 1000); // 4 daqiqa

export default api;