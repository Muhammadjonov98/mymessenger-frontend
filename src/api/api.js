// ==========================================
// API — Сервер bilan ishlash
// Barcha server so'rovlari shu yerda
// ==========================================

import axios from 'axios';

// Сервер manzili
const BASE_URL = 'https://web-production-c6791.up.railway.app';

// Axios instance — barcha so'rovlar uchun
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Har bir so'rovda tokenni avtomatik qo'shamiz
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ==========================================
// AUTH API — Аутентификация
// ==========================================
export const authAPI = {
  // Tizimga kirish
  login: (username, password) =>
    api.post('/auth/login', { username, password }),

  // Ro'yxatdan o'tish
  register: (username, password, full_name) =>
    api.post('/auth/register', { username, password, full_name }),

  // Profil ma'lumotlari
  me: (token) => api.get(`/auth/me?token=${token}`),
};

// ==========================================
// USERS API — Foydalanuvchilar
// ==========================================
export const usersAPI = {
  // Barcha foydalanuvchilar ro'yxati
  getAll: () => api.get('/users'),
};

// ==========================================
// MESSAGES API — Xabarlar
// ==========================================
export const messagesAPI = {
  // Xabarlar tarixi
  getHistory: (userId, myId) =>
    api.get(`/messages/${userId}?current_user_id=${myId}`),

  // O'qildi deb belgilash
  markRead: (messageId) =>
    api.post(`/messages/${messageId}/read`),
};

// ==========================================
// FILES API — Fayllar
// ==========================================
export const filesAPI = {
  // Rasm, video yoki hujjat yuklash
  upload: (file) => {
    // Fayl yuklash uchun FormData ishlatamiz
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Fayl URL sini to'liq manzilga aylantirish
  // Masalan: "/files/download/rasm/abc.jpg" -> "http://localhost:8000/files/download/rasm/abc.jpg"
  toFullUrl: (url) => `${BASE_URL}${url}`,
};

export default api;