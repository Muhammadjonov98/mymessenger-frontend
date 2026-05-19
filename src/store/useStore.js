import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStore = create(
  persist(
    (set) => ({
      // ==========================================
      // AUTH STATE
      // ==========================================
      token: null,
      username: '',
      userId: null,

      login: (token, username, userId) => set({
        token,
        username,
        userId
      }),

      logout: () => set({
        token: null,
        username: '',
        userId: null
      }),

      // ==========================================
      // LANGUAGE STATE - TIL SAQLANADI localStorage'da
      // ==========================================
      til: 'uz', // Default til

      tilniOzgartir: (yeniTil) => {
        console.log(`🌐 Til o'zgartirildi: ${yeniTil}`);
        set({ til: yeniTil });
      },

    }),
    {
      name: 'mymessenger-store', // localStorage key
      partialize: (state) => ({
        token: state.token,
        username: state.username,
        userId: state.userId,
        til: state.til, // ✅ TIL SAQLANADI
      }),
      version: 1,
    }
  )
);

export default useStore;