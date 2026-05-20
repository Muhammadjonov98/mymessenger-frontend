// ==========================================
// ZUSTAND STORE — Global holat boshqaruvi
// Barcha sahifalarda ishlatiladigan ma'lumotlar
// ==========================================

import { create } from 'zustand';

const useStore = create((set) => ({
  // Foydalanuvchi ma'lumotlari
  token: localStorage.getItem('token') || null,
  username: localStorage.getItem('username') || '',
  userId: parseInt(localStorage.getItem('userId')) || null,

  // Til sozlamasi
  til: localStorage.getItem('til') || 'uz',

  // Foydalanuvchilar ro'yxati
  users: [],

  // Aktiv chat
  activeChatUser: null,

  // ==========================================
  // AMALLAR (Actions)
  // ==========================================

  // Tizimga kirish
  login: (token, username, userId) => {
    // localStorage ga saqlaymiz
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    localStorage.setItem('userId', userId);

    set({ token, username, userId });
  },

  // Tizimdan chiqish
  logout: () => {
    localStorage.clear();
    set({ token: null, username: '', userId: null });
  },

  // Tilni ozgartirish
  tilniOzgartir: (yangiTil) => {
    localStorage.setItem('til', yangiTil);
    set({ til: yangiTil });
  },

  // Foydalanuvchilarni saqlash
  setUsers: (users) => set({ users }),

  // Aktiv chatni ozgartirish
  setActiveChatUser: (user) => set({ activeChatUser: user }),
}));

export default useStore;