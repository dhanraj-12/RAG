import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { notebookAPI, resourceAPI, chatAPI, Notebook, Resource, Chat } from '../api/services';
import AppLayout from '../components/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Upload, Trash2, FileText, Image as ImageIcon, MessageSquarePlus, MessageSquare, Calendar, File, X, Plus, ExternalLink, AlertCircle } from 'lucide-react';

export default function NotebookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatTitle, setChatTitle] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const [activeTab, setActiveTab] = useState<'resources' | 'chats'>('resources');

  useEffect(() => { if (id) fetchAll(); }, [id]);

  const fetchAll = async () => {
    try {
      const [nbRes, resRes, chatRes] = await Promise.all([notebookAPI.getAll(), resourceAPI.getAll(id!), chatAPI.getAll(id!)]);
      const nb = (nbRes.data.data || []).find((n) => n._id === id);
      setNotebook(nb || null);
      setResources(resRes.data.data || []);
      setChats(chatRes.data.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await resourceAPI.upload(id!, formData);
      const res = await resourceAPI.getAll(id!);
      setResources(res.data.data || []);
    } catch (err) { console.error(err); } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteResource = async (resId: string) => {
    if (!window.confirm('Delete this resource?')) return;
    try { await resourceAPI.delete(resId); setResources(resources.filter((r) => r._id !== resId)); } catch (err) { console.error(err); }
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this chat and all messages?')) return;
    try { await chatAPI.delete(chatId); setChats(chats.filter((c) => c._id !== chatId)); } catch (err) { console.error(err); }
  };

  const handleCreateChat = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatTitle.trim() || resources.length === 0) return;
    setCreatingChat(true);
    try {
      const res = await chatAPI.create({ notebookId: id!, title: chatTitle });
      setChatTitle(''); setShowChatModal(false);
      navigate(`/chat/${res.data.data._id}`);
    } catch (err) { console.error(err); } finally { setCreatingChat(false); }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (loading) return <AppLayout><div className="center-content"><div className="spinner" /></div></AppLayout>;

  return (
    <AppLayout title={notebook?.title || 'Notebook'}>
      <div style={{ marginBottom: '24px' }}>
        <button onClick={() => navigate('/')} className="btn btn-ghost" style={{ padding: '4px 0', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <ArrowLeft size={14} /> Back
        </button>
        <h1 className="page-title">{notebook?.title}</h1>
        {notebook?.description && <p className="page-subtitle">{notebook.description}</p>}
      </div>

      <div className="tab-bar">
        {(['resources', 'chats'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`tab-btn ${activeTab === tab ? 'active' : ''}`}>
            {tab === 'resources' ? 'Resources' : 'Chats'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'resources' && (
          <motion.div key="resources" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="section-header">
              <h2 className="section-title">Resources ({resources.length})</h2>
              <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                {uploading ? <div className="spinner" style={{ width: '16px', height: '16px' }} /> : <><Upload size={14} /> Upload</>}
                <input type="file" accept=".pdf,image/*" onChange={handleUpload} hidden disabled={uploading} />
              </label>
            </div>
            {resources.length === 0 ? (
              <div className="empty-state">
                <File size={32} />
                <p style={{ fontSize: '0.85rem' }}>No resources uploaded yet</p>
              </div>
            ) : (
              <div className="list-container">
                {resources.map((res, i) => (
                  <motion.div
                    key={res._id}
                    className="list-row"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <div className="list-row-left">
                      <div className="card-icon" style={{ width: '32px', height: '32px', borderRadius: '6px' }}>
                        {res.type === 'pdf' ? <FileText size={14} /> : <ImageIcon size={14} />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p className="text-truncate" style={{ fontSize: '0.85rem', fontWeight: 500 }}>{res.fileName}</p>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                          <span className={`file-badge ${res.type}`}>{res.type}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{formatDate(res.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="list-row-right">
                      <a href={res.s3Url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: '0.8rem' }}>
                        <ExternalLink size={12} /> View
                      </a>
                      <button onClick={() => handleDeleteResource(res._id)} className="btn-danger"><Trash2 size={13} /></button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'chats' && (
          <motion.div key="chats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="section-header">
              <h2 className="section-title">Chats ({chats.length})</h2>
              <button 
                className="btn btn-primary" 
                onClick={() => resources.length > 0 && setShowChatModal(true)}
                disabled={resources.length === 0}
                style={{ 
                    opacity: resources.length === 0 ? 0.5 : 1, 
                    cursor: resources.length === 0 ? 'not-allowed' : 'pointer' 
                }}
              >
                <MessageSquarePlus size={14} /> New Chat
              </button>
            </div>

            {resources.length === 0 && (
              <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <AlertCircle size={14} />
                <span>Unable to chat: add first resources</span>
              </div>
            )}

            {chats.length === 0 ? (
              <div className="empty-state">
                <MessageSquare size={32} />
                <p style={{ fontSize: '0.85rem' }}>No chats yet</p>
                {resources.length > 0 && (
                  <button className="btn btn-primary" onClick={() => setShowChatModal(true)} style={{ marginTop: '10px' }}>
                    <Plus size={14} /> Start Chat
                  </button>
                )}
              </div>
            ) : (
              <div className="list-container">
                {chats.map((chat, i) => (
                  <motion.div
                    key={chat._id}
                    className="list-row"
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/chat/${chat._id}`, { state: { resourceCount: resources.length } })}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    whileHover={{ backgroundColor: 'var(--bg-hover)' }}
                  >
                    <div className="list-row-left">
                      <div className="card-icon" style={{ width: '32px', height: '32px', borderRadius: '6px' }}>
                        <MessageSquare size={14} />
                      </div>
                      <div>
                        <p style={{ fontSize: '0.85rem', fontWeight: 500 }}>{chat.title}</p>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <Calendar size={10} /> {formatDate(chat.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="list-row-right">
                      <button onClick={(e) => handleDeleteChat(e, chat._id)} className="btn-danger"><Trash2 size={13} /></button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {showChatModal && (
        <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowChatModal(false)}>
          <motion.div className="modal-box" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="modal-header"><h2>New Chat</h2><button onClick={() => setShowChatModal(false)} className="btn-icon"><X size={18} /></button></div>
            <form onSubmit={handleCreateChat}>
              <div className="form-group">
                <label className="form-label">Chat Title</label>
                <input className="input" placeholder="e.g. Chapter 1 discussion" value={chatTitle} onChange={(e) => setChatTitle(e.target.value)} required autoFocus />
              </div>
              <motion.button type="submit" className="btn btn-primary" disabled={creatingChat}
                style={{ width: '100%', justifyContent: 'center', padding: '12px' }} whileTap={{ scale: 0.97 }}>
                {creatingChat ? <div className="spinner" /> : <><MessageSquarePlus size={14} /> Start Chat</>}
              </motion.button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AppLayout>
  );
}