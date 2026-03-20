import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LogOut, BookOpen, Settings, Sun, Moon } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <nav className="glass" style={{
      position: 'sticky', top: 0, zIndex: 40, padding: '12px 28px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <BookOpen size={24} color="var(--accent-primary)" />
        <span className="gradient-text" style={{ fontSize: '1.2rem', fontWeight: 700 }}>NoteBookAI</span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginRight: '4px' }}>{user?.name}</span>

        <button onClick={toggleTheme} className="icon-btn" title="Toggle theme">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button onClick={() => navigate('/settings')} className="icon-btn" title="Settings">
          <Settings size={18} />
        </button>

        <button onClick={handleLogout} className="icon-btn" title="Logout"
          style={{ color: 'var(--error)' }}>
          <LogOut size={18} />
        </button>
      </div>
    </nav>
  );
}
