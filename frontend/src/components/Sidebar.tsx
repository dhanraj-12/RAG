import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { notebookAPI, chatAPI, Notebook, Chat } from '../api/services';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Plus, Settings, ChevronRight, MessageSquare,
  Search, Trash2, User, FolderOpen, Folder, X, FileSpreadsheet
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
  onResizeStart?: (e: React.MouseEvent) => void;
  isResizing?: boolean;
}

interface NotebookWithChats extends Notebook {
  chats: Chat[];
  expanded: boolean;
}

export default function Sidebar({ isOpen, onClose, isMobile, onResizeStart, isResizing }: SidebarProps) {
  const [notebooks, setNotebooks] = useState<NotebookWithChats[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewNotebook, setShowNewNotebook] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState('');
  const [showNewChat, setShowNewChat] = useState<string | null>(null);
  const [newChatTitle, setNewChatTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => { fetchNotebooks(); }, []);

  const fetchNotebooks = async () => {
    try {
      const nbRes = await notebookAPI.getAll();
      const nbs: Notebook[] = nbRes.data.data || [];

      const withChats: NotebookWithChats[] = await Promise.all(
        nbs.map(async (nb) => {
          try {
            const chatRes = await chatAPI.getAll(nb._id);
            return { ...nb, chats: chatRes.data.data || [], expanded: false };
          } catch {
            return { ...nb, chats: [], expanded: false };
          }
        })
      );

      // Auto-expand the notebook that contains the active chat
      const chatId = extractChatId(location.pathname);
      if (chatId) {
        withChats.forEach(nb => {
          if (nb.chats.some(c => c._id === chatId)) {
            nb.expanded = true;
          }
        });
      }

      setNotebooks(withChats);
    } catch (err) {
      console.error('Failed to fetch notebooks:', err);
    }
  };

  const extractChatId = (path: string) => {
    const match = path.match(/\/chat\/(.+)/);
    return match ? match[1] : null;
  };

  const toggleExpand = (nbId: string) => {
    setNotebooks(prev =>
      prev.map(nb =>
        nb._id === nbId ? { ...nb, expanded: !nb.expanded } : nb
      )
    );
  };

  const handleCreateNotebook = async () => {
    if (!newNotebookTitle.trim() || creating) return;
    setCreating(true);
    try {
      await notebookAPI.create({ title: newNotebookTitle });
      setNewNotebookTitle('');
      setShowNewNotebook(false);
      fetchNotebooks();
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteNotebook = async (e: React.MouseEvent, nbId: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this notebook and all its contents?')) return;
    try {
      await notebookAPI.delete(nbId);
      setNotebooks(prev => prev.filter(nb => nb._id !== nbId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateChat = async (notebookId: string) => {
    if (!newChatTitle.trim() || creating) return;
    setCreating(true);
    try {
      const res = await chatAPI.create({ notebookId, title: newChatTitle });
      setNewChatTitle('');
      setShowNewChat(null);
      fetchNotebooks();
      navigate(`/chat/${res.data.data._id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this chat?')) return;
    try {
      await chatAPI.delete(chatId);
      fetchNotebooks();
      if (location.pathname === `/chat/${chatId}`) navigate('/');
    } catch (err) {
      console.error(err);
    }
  };

  const handleNav = (path: string) => {
    navigate(path);
    if (isMobile) onClose();
  };

  const activeChatId = extractChatId(location.pathname);

  const filtered = searchQuery.trim()
    ? notebooks.map(nb => ({
        ...nb,
        expanded: true,
        chats: nb.chats.filter(c =>
          c.title.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter(nb =>
        nb.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        nb.chats.length > 0
      )
    : notebooks;

  const sidebarContent = (
    <nav className={`sidebar ${isMobile && isOpen ? 'open' : ''}`}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <BookOpen size={17} />
          <h1>NoteBookAI</h1>
        </div>
        {isMobile && (
          <button onClick={onClose} className="btn-icon-sm"><X size={14} /></button>
        )}
      </div>

      {/* Search */}
      <div className="sidebar-search-bar">
        <div className="sidebar-search-wrapper">
          <Search size={13} className="search-icon" />
          <input
            className="sidebar-search-input"
            placeholder="Search…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      
      {/* Bulk Query Section */}
      <div className="sidebar-nav" style={{ flex: '0 0 auto', paddingBottom: 0 }}>
        <button
          className={`tree-item ${location.pathname === '/bulk-query' ? 'active' : ''}`}
          onClick={() => handleNav('/bulk-query')}
        >
          <span className="tree-icon">
            <FileSpreadsheet size={14} />
          </span>
          <span className="tree-label">Bulk Query</span>
        </button>
      </div>

      {/* Notebook Tree */}
      <div className="sidebar-nav">
        <div className="sidebar-section-label">
          <span>Notebooks</span>
          <button
            className="btn-icon-sm"
            onClick={() => setShowNewNotebook(true)}
            title="New Notebook"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* New notebook inline input */}
        {showNewNotebook && (
          <div style={{ padding: '4px 10px', marginBottom: '4px' }}>
            <input
              className="sidebar-search-input"
              placeholder="Notebook name…"
              value={newNotebookTitle}
              onChange={e => setNewNotebookTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateNotebook();
                if (e.key === 'Escape') { setShowNewNotebook(false); setNewNotebookTitle(''); }
              }}
              autoFocus
              style={{ fontSize: '0.78rem', padding: '6px 8px' }}
            />
          </div>
        )}

        {/* Tree */}
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px 10px' }}>
            <Folder size={20} />
            <p style={{ fontSize: '0.75rem' }}>No notebooks yet</p>
          </div>
        ) : (
          filtered.map(nb => (
            <div key={nb._id}>
              {/* Notebook item */}
              <button
                className={`tree-item ${nb.expanded ? 'active' : ''}`}
                onClick={() => toggleExpand(nb._id)}
              >
                <span className={`tree-chevron ${nb.expanded ? 'expanded' : ''}`}>
                  <ChevronRight size={12} />
                </span>
                <span className="tree-icon">
                  {nb.expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                </span>
                <span className="tree-label">{nb.title}</span>
                <span className="tree-actions">
                  <button
                    className="btn-icon-sm"
                    onClick={(e) => { e.stopPropagation(); setShowNewChat(nb._id); }}
                    title="New Chat"
                  >
                    <Plus size={11} />
                  </button>
                  <button
                    className="btn-icon-sm"
                    onClick={(e) => handleDeleteNotebook(e, nb._id)}
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              </button>

              {/* Chat children */}
              <AnimatePresence>
                {nb.expanded && (
                  <motion.div
                    className="tree-children"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    style={{ overflow: 'hidden' }}
                  >
                    {/* New chat inline input */}
                    {showNewChat === nb._id && (
                      <div style={{ padding: '3px 10px', marginBottom: '2px' }}>
                        <input
                          className="sidebar-search-input"
                          placeholder="Chat name…"
                          value={newChatTitle}
                          onChange={e => setNewChatTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleCreateChat(nb._id);
                            if (e.key === 'Escape') { setShowNewChat(null); setNewChatTitle(''); }
                          }}
                          autoFocus
                          style={{ fontSize: '0.75rem', padding: '5px 8px' }}
                        />
                      </div>
                    )}

                    {nb.chats.length === 0 && showNewChat !== nb._id ? (
                      <div style={{ padding: '6px 10px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        No chats yet
                      </div>
                    ) : (
                      nb.chats.map(chat => (
                        <button
                          key={chat._id}
                          className={`tree-item ${activeChatId === chat._id ? 'active' : ''}`}
                          onClick={() => handleNav(`/chat/${chat._id}`)}
                        >
                          <span className="tree-icon">
                            <MessageSquare size={12} />
                          </span>
                          <span className="tree-label">{chat.title}</span>
                          <span className="tree-actions">
                            <button
                              className="btn-icon-sm"
                              onClick={(e) => handleDeleteChat(e, chat._id)}
                              title="Delete"
                            >
                              <Trash2 size={10} />
                            </button>
                          </span>
                        </button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-user">
          <div className="sidebar-footer-avatar">
            <User size={13} />
          </div>
          <span className="sidebar-footer-name">{user?.name || 'User'}</span>
        </div>
        <button
          onClick={() => handleNav('/settings')}
          className="btn-icon-sm"
          title="Settings"
        >
          <Settings size={14} />
        </button>
      </div>

      {/* Resize Handle (desktop only) */}
      {!isMobile && (
        <div
          className={`sidebar-resize-handle ${isResizing ? 'active' : ''}`}
          onMouseDown={onResizeStart}
        />
      )}
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
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
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
