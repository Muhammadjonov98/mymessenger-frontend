// ==========================================
// LOGIN SAHIFASI
// ==========================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/api';
import useStore from '../store/useStore';

// Tillar
const TILLAR = {
  uz: {
    xush: "MyMessenger ga xush kelibsiz!",
    kirish: 'Kirish',
    royxat: "Ro'yxatdan o'tish",
    username: 'Foydalanuvchi nomi',
    parol: 'Parol',
    tolaIsm: "To'liq ism",
    kirishBtn: 'Kirish',
    royxatBtn: "Ro'yxatdan o'tish",
  },
  ru: {
    xush: 'Добро пожаловать в MyMessenger!',
    kirish: 'Войти',
    royxat: 'Регистрация',
    username: 'Имя пользователя',
    parol: 'Пароль',
    tolaIsm: 'Полное имя',
    kirishBtn: 'Войти',
    royxatBtn: 'Зарегистрироваться',
  },
  en: {
    xush: 'Welcome to MyMessenger!',
    kirish: 'Login',
    royxat: 'Register',
    username: 'Username',
    parol: 'Password',
    tolaIsm: 'Full Name',
    kirishBtn: 'Login',
    royxatBtn: 'Register',
  },
};

function Login() {
  const navigate = useNavigate();
  const { login, til, tilniOzgartir } = useStore();

  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [xato, setXato] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Tarjima funksiyasi
  const t = (key) => TILLAR[til]?.[key] || key;

  // Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setXato('');

    try {
      const res = await authAPI.login(username, password);
      const token = res.data.access_token;

      // User ID ni olamiz
      const meRes = await authAPI.me(token);
      const userId = meRes.data.id;

      login(token, username, userId);
      navigate('/home');
    } catch (err) {
      setXato(err.response?.data?.detail || 'Xato yuz berdi!');
    }

    setLoading(false);
  };

  // Register
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setXato('');

    try {
      await authAPI.register(username, password, fullName);
      setXato('');
      alert("Muvaffaqiyatli ro'yxatdan o'tdingiz! Endi kiring.");
      setIsLogin(true);
    } catch (err) {
      setXato(err.response?.data?.detail || 'Xato yuz berdi!');
    }

    setLoading(false);
  };

  return (
    <div style={styles.container}>
      {/* Fon */}
      <div style={styles.fon} />

      <div style={styles.karta}>
        {/* Til tanlash */}
        <div style={styles.tillar}>
          {['uz', 'ru', 'en'].map((t) => (
            <button
              key={t}
              onClick={() => tilniOzgartir(t)}
              style={{
                ...styles.tilBtn,
                background: til === t ? 'white' : 'rgba(255,255,255,0.3)',
                color: til === t ? '#2AABEE' : 'white',
              }}
            >
              {t === 'uz' ? '🇺🇿 UZ' : t === 'ru' ? '🇷🇺 RU' : '🇬🇧 EN'}
            </button>
          ))}
        </div>

        {/* Logo */}
        <div style={styles.logo}>
          <span style={{ fontSize: 50 }}>💬</span>
        </div>

        <h2 style={styles.sarlavha}>{t('xush')}</h2>

        {/* Tab tugmalari */}
        <div style={styles.tablar}>
          <button
            onClick={() => setIsLogin(true)}
            style={{
              ...styles.tab,
              background: isLogin ? '#2AABEE' : '#f0f0f0',
              color: isLogin ? 'white' : '#666',
            }}
          >
            {t('kirish')}
          </button>
          <button
            onClick={() => setIsLogin(false)}
            style={{
              ...styles.tab,
              background: !isLogin ? '#2AABEE' : '#f0f0f0',
              color: !isLogin ? 'white' : '#666',
            }}
          >
            {t('royxat')}
          </button>
        </div>

        {/* Forma */}
        <form onSubmit={isLogin ? handleLogin : handleRegister}>
          {!isLogin && (
            <input
              style={styles.input}
              type="text"
              placeholder={t('tolaIsm')}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          )}

          <input
            style={styles.input}
            type="text"
            placeholder={t('username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <div style={{ position: 'relative' }}>
            <input
              style={styles.input}
              type={showPassword ? 'text' : 'password'}
              placeholder={t('parol')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={styles.korishBtn}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          {/* Xato xabari */}
          {xato && <p style={styles.xato}>{xato}</p>}

          {/* Asosiy tugma */}
          <button
            type="submit"
            style={styles.asosiyBtn}
            disabled={loading}
          >
            {loading ? '⏳ Yuklanmoqda...' : (isLogin ? t('kirishBtn') : t('royxatBtn'))}
          </button>
        </form>
      </div>
    </div>
  );
}

// Uslublar
const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #2AABEE, #1A7FBB)',
    padding: 20,
  },
  fon: {
    position: 'fixed',
    inset: 0,
    background: 'linear-gradient(135deg, #2AABEE, #1A7FBB)',
    zIndex: -1,
  },
  karta: {
    background: 'white',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  tillar: {
    display: 'flex',
    gap: 8,
    marginBottom: 24,
    justifyContent: 'center',
  },
  tilBtn: {
    padding: '6px 14px',
    borderRadius: 20,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: 13,
  },
  logo: {
    textAlign: 'center',
    marginBottom: 12,
  },
  sarlavha: {
    textAlign: 'center',
    color: '#333',
    marginBottom: 24,
    fontSize: 20,
  },
  tablar: {
    display: 'flex',
    gap: 8,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: 15,
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 10,
    border: '1px solid #ddd',
    marginBottom: 12,
    fontSize: 15,
    boxSizing: 'border-box',
    outline: 'none',
  },
  korishBtn: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: 'translateY(-60%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 18,
  },
  xato: {
    color: 'red',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  asosiyBtn: {
    width: '100%',
    padding: '14px',
    background: '#2AABEE',
    color: 'white',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: 4,
  },
};

export default Login;