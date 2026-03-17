import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { notebookAPI, resourceAPI, chatAPI } from '../api/services';
import Navbar from '../components/Navbar';
import {
  ArrowLeft, Upload, Trash2, FileText, Image, MessageSquarePlus,
  MessageSquare, Calendar, File, X, Plus
} from 'lucide-react';

export default function NotebookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [notebook, setNotebook] = useState(null);
  const [resources, setResources] = useState([]);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatTitle, setChatTitle] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const [activeTab, setActiveTab] = useState('resources');

  useEffect(() => {
    fetchAll();
  }, [id]);

  const fetchAll = async () => {
    try {
      const [notebooksRes, resourcesRes, chatsRes] = await Promise.all([
        notebookAPI.getAll(),
        resourceAPI.getAll(id),
        chatAPI.getAll(id),
      ]);
      const nb = (notebooksRes.data.data || []).find((n) => n._id === id);
      setNotebook(nb || { title: 'Notebook', description: '' });
      setResources(resourcesRes.data.data || []);
      setChats(chatsRes.data.data || []);
    } catch (err) {
      console.error('Failed to fetch notebook data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await resourceAPI.upload(id, formData);
      const res = await resourceAPI.getAll(id);
      setResources(res.data.data || []);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteResource = async (resId) => {
    if (!window.confirm('Delete this resource?')) return;
    try {
      await resourceAPI.delete(resId);
      setResources(resources.filter((r) => r._id !== resId));
    } catch (err) {
      console.error('Delete resource failed:', err);
    }
  };

  const handleCreateChat = async (e) => {
    e.preventDefault();
    if (!chatTitle.trim()) return;
    setCreatingChat(true);
    try {
      const res = await chatAPI.create({ notebookId: id, title: chatTitle });
      setChatTitle('');
      setShowChatModal(false);
      navigate(`/chat/${res.data.data._id}`);
    } catch (err) {
      console.error('Create chat failed:', err);
    } finally {
      setCreatingChat(false);
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const getFileIcon = (type) => type === 'pdf' ? <FileText size={20} color="#ef4444" /> : <Image size={20} color="#3b82f6" />;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main style={{ flex: 1, padding: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div className="animate-fade-in-up" style={{ marginBottom: '28px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center',
              gap: '6px', fontSize: '0.85rem', fontWeight: 500, padding: 0, marginBottom: '16px',
            }}
          >
            <ArrowLeft size={16} /> Back to Notebooks
          </button>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '6px' }}>{notebook?.title}</h1>
          {notebook?.description && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{notebook.description}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="animate-fade-in-up" style={{
          display: 'flex', gap: '4px', padding: '4px',
          background: 'var(--bg-glass)', borderRadius: '14px',
          border: '1px solid var(--border-subtle)', marginBottom: '28px',
          width: 'fit-content',
        }}>
          {['resources', 'chats'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 24px', borderRadius: '10px', border: 'none',
                cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500,
                transition: 'all 0.3s ease',
                background: activeTab === tab ? 'var(--accent-gradient)' : 'transparent',
                color: activeTab === tab ? 'white' : 'var(--text-secondary)',
              }}
            >
              {tab === 'resources' ? '📁 Resources' : '💬 Chats'}
            </button>
          ))}
        </div>

        {/* Resources Tab */}
        {activeTab === 'resources' && (
          <div className="animate-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                Resources ({resources.length})
              </h2>
              <label className="gradient-btn" style={{ cursor: 'pointer' }}>
                {uploading ? (
                  <div className="spinner" style={{ width: '18px', height: '18px' }} />
                ) : (
                  <><Upload size={16} /> Upload File</>
                )}
                <input type="file" accept=".pdf,image/*" onChange={handleUpload} hidden disabled={uploading} />
              </label>
            </div>

            {resources.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <File size={48} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                  No resources uploaded yet
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {resources.map((res, i) => (
                  <div
                    key={res._id}
                    className="glass-card animate-fade-in-up"
                    style={{
                      padding: '16px 20px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      animationDelay: `${i * 0.04}s`,
                      animationFillMode: 'backwards',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '40px', height: '40px', borderRadius: '10px',
                        background: res.type === 'pdf' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {getFileIcon(res.type)}
                      </div>
                      <div>
                        <p style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '2px' }}>{res.fileName}</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {res.type.toUpperCase()} • {formatDate(res.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <a
                        href={res.s3Url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem',
                          background: 'rgba(124,58,237,0.1)', color: 'var(--accent-secondary)',
                          textDecoration: 'none', fontWeight: 500,
                          border: '1px solid rgba(124,58,237,0.2)',
                        }}
                      >
                        View
                      </a>
                      <button
                        onClick={() => handleDeleteResource(res._id)}
                        style={{
                          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                          borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                          color: '#ef4444', display: 'flex', alignItems: 'center',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chats Tab */}
        {activeTab === 'chats' && (
          <div className="animate-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                Chats ({chats.length})
              </h2>
              <button className="gradient-btn" onClick={() => setShowChatModal(true)}>
                <MessageSquarePlus size={16} /> New Chat
              </button>
            </div>

            {chats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <MessageSquare size={48} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '16px' }}>
                  No chats yet. Start a conversation with AI!
                </p>
                <button className="gradient-btn" onClick={() => setShowChatModal(true)}>
                  <Plus size={16} /> Start Chat
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {chats.map((chat, i) => (
                  <div
                    key={chat._id}
                    className="glass-card animate-fade-in-up"
                    style={{
                      padding: '18px 22px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      animationDelay: `${i * 0.04}s`,
                      animationFillMode: 'backwards',
                    }}
                    onClick={() => navigate(`/chat/${chat._id}`)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '40px', height: '40px', borderRadius: '10px',
                        background: 'var(--accent-gradient)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <MessageSquare size={18} color="white" />
                      </div>
                      <div>
                        <p style={{ fontWeight: 500, fontSize: '0.95rem', marginBottom: '2px' }}>{chat.title}</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          <Calendar size={11} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                          {formatDate(chat.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div style={{
                      color: 'var(--accent-secondary)', fontSize: '0.8rem', fontWeight: 500,
                    }}>
                      Open →
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create Chat Modal */}
      {showChatModal && (
        <div className="modal-overlay" onClick={() => setShowChatModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>New Chat</h2>
              <button onClick={() => setShowChatModal(false)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: '4px',
              }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateChat}>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 500 }}>
                  Chat Title
                </label>
                <input
                  className="input-field"
                  placeholder="e.g. Chapter 1 discussion"
                  value={chatTitle}
                  onChange={(e) => setChatTitle(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="gradient-btn" disabled={creatingChat} style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>
                {creatingChat ? <div className="spinner" style={{ width: '20px', height: '20px' }} /> : <><MessageSquarePlus size={18} /> Start Chat</>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
