import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { notebookAPI, Notebook } from '../api/services';
import AppLayout from '../components/AppLayout';
import { motion } from 'framer-motion';
import { Plus, Trash2, BookOpen, Calendar, X, ArrowRight } from 'lucide-react';

export default function Dashboard() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { fetchNotebooks(); }, []);

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

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await notebookAPI.create({ title, description });
      setTitle(''); setDescription(''); setShowModal(false);
      fetchNotebooks();
    } catch (err) {
      console.error('Failed to create notebook:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this notebook and all its contents?')) return;
    try {
      await notebookAPI.delete(id);
      setNotebooks(notebooks.filter((n) => n._id !== id));
    } catch (err) {
      console.error('Failed to delete notebook:', err);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <AppLayout title="Dashboard">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Notebooks</h1>
          <p className="page-subtitle">{notebooks.length} notebook{notebooks.length !== 1 ? 's' : ''}</p>
        </div>
        <motion.button
          className="btn btn-primary"
          onClick={() => setShowModal(true)}
          whileTap={{ scale: 0.97 }}
        >
          <Plus size={16} /> New
        </motion.button>
      </div>

      {loading ? (
        <div className="center-content"><div className="spinner" /></div>
      ) : notebooks.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={40} />
          <p style={{ fontSize: '0.95rem' }}>No notebooks yet</p>
          <p style={{ fontSize: '0.8rem' }}>Create your first notebook to get started</p>
          <motion.button className="btn btn-primary" onClick={() => setShowModal(true)} whileTap={{ scale: 0.97 }}>
            <Plus size={16} /> Create Notebook
          </motion.button>
        </div>
      ) : (
        <div className="card-grid">
          {notebooks.map((nb, i) => (
            <motion.div
              key={nb._id}
              className="card card-hover group"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/notebook/${nb._id}`)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              whileHover={{ y: -2 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div className="card-icon"><BookOpen size={16} /></div>
                <button onClick={(e) => handleDelete(e, nb._id)} className="btn-danger"><Trash2 size={14} /></button>
              </div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '4px', letterSpacing: '-0.01em' }}>{nb.title}</h3>
              {nb.description && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: '12px' }}>
                  {nb.description.length > 80 ? nb.description.slice(0, 80) + '…' : nb.description}
                </p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  <Calendar size={11} /> {formatDate(nb.createdAt)}
                </span>
                <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {showModal && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setShowModal(false)}
        >
          <motion.div
            className="modal-box"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>New Notebook</h2>
              <button onClick={() => setShowModal(false)} className="btn-icon"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input className="input" placeholder="e.g. Machine Learning Notes" value={title}
                  onChange={(e) => setTitle(e.target.value)} required autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <textarea className="input" placeholder="What is this notebook about?"
                  value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ resize: 'vertical' }} />
              </div>
              <motion.button type="submit" className="btn btn-primary" disabled={creating}
                style={{ width: '100%', justifyContent: 'center', padding: '12px' }} whileTap={{ scale: 0.97 }}>
                {creating ? <div className="spinner" /> : <><Plus size={16} /> Create</>}
              </motion.button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AppLayout>
  );
}
