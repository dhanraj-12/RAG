import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { authAPI } from '../api/services';
import AppLayout from '../components/AppLayout';
import { motion } from 'framer-motion';
import { ArrowLeft, User, Mail, Calendar, Save, Sun, Moon, CheckCircle } from 'lucide-react';

export default function Settings() {
  const { user, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { if (user) { setName(user.name); setEmail(user.email); } }, [user]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setMessage(''); setError('');
    try {
      const res = await authAPI.updateProfile({ name, email });
      updateUser(res.data.data);
      setMessage('Profile updated successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally { setSaving(false); }
  };

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  return (
    <AppLayout title="Settings">
      <div style={{ maxWidth: '560px' }}>
        <div style={{ marginBottom: '24px' }}>
          <button onClick={() => navigate('/')} className="btn btn-ghost" style={{ padding: '4px 0', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <ArrowLeft size={14} /> Back
          </button>
          <h1 className="page-title">Settings</h1>
        </div>

        {/* Profile Section */}
        <motion.div className="card" style={{ marginBottom: '16px' }}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <h2 className="section-title" style={{ marginBottom: '16px' }}>Profile</h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px', padding: '14px', background: 'var(--bg-input)', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div className="card-icon" style={{ width: '44px', height: '44px', borderRadius: '10px' }}>
              <User size={20} />
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{user?.name}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Mail size={12} /> {user?.email}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <Calendar size={12} /> Joined {formatDate(user?.createdAt)}
              </p>
            </div>
          </div>

          <form onSubmit={handleSave}>
            {error && <div className="banner-error">{error}</div>}
            {message && <div className="banner-success"><CheckCircle size={14} /> {message}</div>}

            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <motion.button type="submit" className="btn btn-primary" disabled={saving}
              style={{ width: '100%', justifyContent: 'center', padding: '11px' }} whileTap={{ scale: 0.97 }}>
              {saving ? <div className="spinner" /> : <><Save size={14} /> Save Changes</>}
            </motion.button>
          </form>
        </motion.div>

        {/* Appearance Section */}
        <motion.div className="card"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h2 className="section-title" style={{ marginBottom: '16px' }}>Appearance</h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', background: 'var(--bg-input)', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div>
              <p style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '2px' }}>Theme</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Currently using {theme} mode</p>
            </div>
            <motion.button onClick={toggleTheme} className="btn btn-secondary" whileTap={{ scale: 0.97 }}>
              {theme === 'dark' ? <><Sun size={14} /> Light</> : <><Moon size={14} /> Dark</>}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
