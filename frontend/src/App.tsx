import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NotebookDetail from './pages/NotebookDetail';
import ChatView from './pages/ChatView';
import Settings from './pages/Settings';
import { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -8 },
};

function AnimatedPage({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="in"
      exit="out"
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<PublicRoute><AnimatedPage><Login /></AnimatedPage></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><AnimatedPage><Register /></AnimatedPage></PublicRoute>} />
        <Route path="/" element={<ProtectedRoute><AnimatedPage><Dashboard /></AnimatedPage></ProtectedRoute>} />
        <Route path="/notebook/:id" element={<ProtectedRoute><AnimatedPage><NotebookDetail /></AnimatedPage></ProtectedRoute>} />
        <Route path="/chat/:chatId" element={<ProtectedRoute><ChatView /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><AnimatedPage><Settings /></AnimatedPage></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
