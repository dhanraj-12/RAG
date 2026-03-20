import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { notebookAPI, Notebook } from '../api/services';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Plus, Settings, ChevronRight } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
}

export default function Sidebar({ isOpen, onClose, isMobile }: SidebarProps) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { fetchNotebooks(); }, [location.pathname]);

  const fetchNotebooks = async () => {
    try {
      const res = await notebookAPI.getAll();
      setNotebooks(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleNav = (path: string) => {
    navigate(path);
    if (isMobile) onClose();
  };

  const isActive = (path: string) => location.pathname === path;

  const sidebarContent = (
    <nav className="sidebar" style={isMobile ? { transform: isOpen ? 'translateX(0)' : 'translateX(-100%)' } : undefined}>
      <div className="sidebar-brand">
        <BookOpen size={20} />
        <h1>NoteBookAI</h1>
      </div>

      <div className="sidebar-nav">
        <button onClick={() => handleNav('/')} className={`sidebar-item ${isActive('/') ? 'active' : ''}`}>
          <BookOpen size={16} /> All Notebooks
        </button>
        

        {notebooks.length > 0 && (
          <>
            <div className="sidebar-section-title" style={{ marginTop: '16px' }}>Notebooks</div>
            {notebooks.map((nb) => (
              <button
                key={nb._id}
                onClick={() => handleNav(`/notebook/${nb._id}`)}
                className={`sidebar-item ${location.pathname === `/notebook/${nb._id}` ? 'active' : ''}`}
              >
                <ChevronRight size={14} />
                <span className="text-truncate" style={{ flex: 1 }}>{nb.title}</span>
              </button>
            ))}
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <button onClick={() => handleNav('/settings')} className={`sidebar-item ${isActive('/settings') ? 'active' : ''}`}>
          <Settings size={16} /> Settings
        </button>
      </div>
    </nav>
  );

  if (isMobile) {
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="sidebar-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.div
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{ position: 'fixed', top: 0, left: 0, zIndex: 30 }}
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  return sidebarContent;
}
