import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import CitationsPanel from './CitationsPanel';
import { Menu, Settings, LogOut } from 'lucide-react';
import { Citation } from '../api/services';

interface AppLayoutProps {
  children: ReactNode;
  notebookTitle?: string;
  chatTitle?: string;
  citations?: Citation[];
  showCitations?: boolean;
  onToggleCitations?: () => void;
  activeCitationIndex?: number | null;
}

export default function AppLayout({
  children,
  notebookTitle,
  chatTitle,
  citations = [],
  showCitations = false,
  onToggleCitations,
  activeCitationIndex,
}: AppLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const resizeRef = useRef<number | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      resizeRef.current = requestAnimationFrame(() => {
        const newWidth = Math.min(420, Math.max(220, e.clientX));
        setSidebarWidth(newWidth);
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      if (resizeRef.current) cancelAnimationFrame(resizeRef.current);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div
      className={`app-shell ${showCitations ? 'citations-open' : ''}`}
      style={!isMobile ? { '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties : undefined}
    >
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMobile={isMobile}
        onResizeStart={handleMouseDown}
        isResizing={isResizing}
      />

      {/* Top Bar */}
      <header className="topbar">
        <div className="topbar-left">
          {isMobile && (
            <button onClick={() => setSidebarOpen(true)} className="btn-icon">
              <Menu size={16} />
            </button>
          )}
          <div className="topbar-breadcrumb">
            {notebookTitle && (
              <>
                <span>{notebookTitle}</span>
                {chatTitle && <span className="separator">/</span>}
              </>
            )}
            {chatTitle && <span className="current">{chatTitle}</span>}
            {!notebookTitle && !chatTitle && (
              <span className="current">Dashboard</span>
            )}
          </div>
        </div>

        <div className="topbar-right">
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginRight: '2px' }}>
            {user?.name}
          </span>
          <button onClick={() => navigate('/settings')} className="btn-icon" title="Settings">
            <Settings size={14} />
          </button>
          <button onClick={handleLogout} className="btn-icon" title="Logout">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="main-area">
        {children}
      </div>

      {/* Citations Panel */}
      {showCitations && (
        <CitationsPanel
          citations={citations}
          onClose={onToggleCitations || (() => {})}
          activeCitationIndex={activeCitationIndex}
        />
      )}
    </div>
  );
}
