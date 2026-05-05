// ==========================================
// APP.JS — Asosiy router
// Barcha sahifalar va ularning yo'llari
// ==========================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Call from './pages/Call';
import useStore from './store/useStore';

function App() {
  const { token } = useStore();

  return (
    <BrowserRouter>
      <Routes>
        {/* Страница входа — перенаправляем если уже авторизован */}
        <Route
          path="/"
          element={token ? <Navigate to="/home" /> : <Login />}
        />

        {/* Главная страница — только для авторизованных */}
        <Route
          path="/home"
          element={token ? <Home /> : <Navigate to="/" />}
        />

        {/* Страница чата */}
        <Route
          path="/chat/:userId"
          element={token ? <Chat /> : <Navigate to="/" />}
        />

        {/* Страница звонка */}
        <Route
          path="/call"
          element={token ? <Call /> : <Navigate to="/" />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;