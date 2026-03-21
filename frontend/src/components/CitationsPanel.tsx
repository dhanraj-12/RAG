import { Citation } from '../api/services';
import { motion } from 'framer-motion';
import { X, BookOpen, FileText } from 'lucide-react';

interface CitationsPanelProps {
  citations: Citation[];
  onClose: () => void;
  activeCitationIndex?: number | null;
}

export default function CitationsPanel({ citations, onClose, activeCitationIndex }: CitationsPanelProps) {
  if (!citations || citations.length === 0) {
    return (
      <div className="citations-panel">
        <div className="citations-header">
          <h3>Citations</h3>
          <button onClick={onClose} className="btn-icon-sm"><X size={14} /></button>
        </div>
        <div className="empty-state" style={{ padding: '32px 16px' }}>
          <FileText size={28} />
          <p style={{ fontSize: '0.8rem' }}>No sources available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="citations-panel">
      <div className="citations-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <BookOpen size={14} style={{ color: 'var(--text-muted)' }} />
          <h3>Citations</h3>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--accent-muted)', padding: '1px 6px', borderRadius: '4px' }}>
            {citations.length}
          </span>
        </div>
        <button onClick={onClose} className="btn-icon-sm"><X size={14} /></button>
      </div>

      <div className="citations-list">
        {citations.map((cite, idx) => (
          <motion.div
            key={idx}
            className="citation-card"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, duration: 0.2 }}
            style={activeCitationIndex === idx ? { borderColor: 'var(--border-hover)' } : undefined}
          >
            <div className="citation-card-tag">{cite.source_tag}</div>

            {cite.chapter && (
              <div className="citation-card-title">{cite.chapter}</div>
            )}

            <div className="citation-card-meta">
              {cite.section_name && (
                <span>§ {cite.section_name}</span>
              )}
              {cite.section && (
                <span>Section {cite.section}</span>
              )}
              {cite.page_start > 0 && (
                <span>
                  {cite.page_end > 0 && cite.page_end !== cite.page_start
                    ? `Pages ${cite.page_start}–${cite.page_end}`
                    : `Page ${cite.page_start}`}
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
