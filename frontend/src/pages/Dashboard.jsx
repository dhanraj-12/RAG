import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { notebookAPI } from '../api/services';
import Navbar from '../components/Navbar';
import { Plus, Trash2, BookOpen, Calendar, X } from 'lucide-react';

export default function Dashboard() {
  const [notebooks, setNotebooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotebooks();
  }, []);

  const fetchNotebooks = async () => {
    try {
      const res = await notebookAPI.getAll();
      setNotebooks(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch notebooks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await notebookAPI.create({ title, description });
      setTitle('');
      setDescription('');
      setShowModal(false);
      fetchNotebooks();
    } catch (err) {
      console.error('Failed to create notebook:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this notebook and all its contents?')) return;
    try {
      await notebookAPI.delete(id);
      setNotebooks(notebooks.filter((n) => n._id !== id));
    } catch (err) {
      console.error('Failed to delete notebook:', err);
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main style={{ flex: 1, padding: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}
             className="animate-fade-in-up">
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '4px' }}>My Notebooks</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {notebooks.length} notebook{notebooks.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button className="gradient-btn" onClick={() => setShowModal(true)}>
            <Plus size={18} /> New Notebook
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div className="spinner" />
          </div>
        ) : notebooks.length === 0 ? (
          <div className="animate-fade-in" style={{ textAlign: 'center', padding: '80px 20px' }}>
            <BookOpen size={56} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
            <h2 style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', fontWeight: 500, marginBottom: '8px' }}>
              No notebooks yet
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
              Create your first notebook to get started
            </p>
            <button className="gradient-btn" onClick={() => setShowModal(true)}>
              <Plus size={18} /> Create Notebook
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px',
          }}>
            {notebooks.map((nb, i) => (
              <div
                key={nb._id}
                className="glass-card animate-fade-in-up"
                style={{
                  padding: '24px',
                  cursor: 'pointer',
                  animationDelay: `${i * 0.05}s`,
                  animationFillMode: 'backwards',
                }}
                onClick={() => navigate(`/notebook/${nb._id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '12px',
                    background: 'var(--accent-gradient)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <BookOpen size={20} color="white" />
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, nb._id)}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      padding: '6px', borderRadius: '8px', color: 'var(--text-muted)',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => { e.target.style.color = '#ef4444'; e.target.style.background = 'rgba(239,68,68,0.1)'; }}
                    onMouseLeave={(e) => { e.target.style.color = 'var(--text-muted)'; e.target.style.background = 'transparent'; }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                  {nb.title}
                </h3>
                {nb.description && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px', lineHeight: 1.5 }}>
                    {nb.description.length > 100 ? nb.description.slice(0, 100) + '...' : nb.description}
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  <Calendar size={13} />
                  {formatDate(nb.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>New Notebook</h2>
              <button onClick={() => setShowModal(false)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: '4px',
              }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 500 }}>
                  Title
                </label>
                <input
                  className="input-field"
                  placeholder="e.g. Machine Learning Notes"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 500 }}>
                  Description (optional)
                </label>
                <textarea
                  className="input-field"
                  placeholder="What is this notebook about?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <button type="submit" className="gradient-btn" disabled={creating} style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>
                {creating ? <div className="spinner" style={{ width: '20px', height: '20px' }} /> : <><Plus size={18} /> Create Notebook</>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
