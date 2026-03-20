import { useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Sidebar from './Sidebar';
import { Menu, Sun, Moon, LogOut, Settings } from 'lucide-react';

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function AppLayout({ children, title }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="app-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isMobile={isMobile} />

      <div className="content-area">
        <header className="topbar">
          <div className="topbar-left">
            {isMobile && (
              <button onClick={() => setSidebarOpen(true)} className="btn-icon">
                <Menu size={18} />
              </button>
            )}
            {title && <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{title}</span>}
          </div>

          <div className="topbar-right">
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginRight: '4px' }}>{user?.name}</span>
            <button onClick={toggleTheme} className="btn-icon" title="Toggle theme">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={() => navigate('/settings')} className="btn-icon" title="Settings">
              <Settings size={16} />
            </button>
            <button onClick={handleLogout} className="btn-icon" title="Logout" style={{ color: 'var(--error)' }}>
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
