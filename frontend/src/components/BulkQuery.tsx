import React, { useState } from 'react';
import { generateBulkCSV } from '../api/ragApi';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Download } from 'lucide-react';

const BulkQuery: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setStatus('idle');
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    try {
      setStatus('processing');
      const blob = await generateBulkCSV(file);
      
      // Create a link and trigger download
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `submission_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      setStatus('success');
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to process bulk queries. Please check if your JSON format is correct.');
      setStatus('error');
    }
  };

  return (
    <div className="main-content">
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-bold mb-2">Bulk Query Processing</h1>
          <p className="text-secondary text-sm">
            Upload your <code>queries.json</code> file to process multiple RAG queries at once and receive a CSV submission file.
          </p>
        </header>

        <div className={`card p-8 border-dashed border-2 flex flex-col items-center justify-center gap-4 transition-all ${status === 'idle' ? 'hover:border-accent cursor-pointer' : ''}`}>
          <input
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            disabled={status === 'processing'}
          />
          
          <div className="w-16 h-16 rounded-full bg-accent-muted flex items-center justify-center">
            {status === 'processing' ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : status === 'success' ? (
              <CheckCircle className="w-8 h-8 text-success" />
            ) : status === 'error' ? (
              <AlertCircle className="w-8 h-8 text-error" />
            ) : (
              <Upload className="w-8 h-8 text-secondary" />
            )}
          </div>

          <div className="text-center">
            {file ? (
              <div className="flex items-center gap-2 font-medium">
                <FileText className="w-4 h-4" />
                {file.name}
              </div>
            ) : (
              <>
                <p className="font-medium">Click to upload or drag and drop</p>
                <p className="text-muted text-xs mt-1">queries.json (max 10MB)</p>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-400/10 border border-red-400/20 rounded-md flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-error mt-0.5" />
            <div className="text-sm text-error">{error}</div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-4">
          <button
            className="btn btn-secondary"
            onClick={() => {
              setFile(null);
              setStatus('idle');
              setError(null);
            }}
            disabled={status === 'processing'}
          >
            Clear
          </button>
          <button
            className="btn btn-primary min-w-[140px]"
            onClick={handleSubmit}
            disabled={!file || status === 'processing'}
          >
            {status === 'processing' ? 'Processing...' : 'Generate CSV'}
          </button>
        </div>

        {status === 'success' && (
          <div className="p-4 bg-green-400/10 border border-green-400/20 rounded-md flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-success mt-0.5" />
            <div>
              <div className="text-sm font-medium text-success">Processing Complete</div>
              <p className="text-xs text-secondary mt-1">Your submission CSV has been generated and downloaded.</p>
            </div>
          </div>
        )}

        <div className="mt-8 border-t border-border pt-6">
          <h3 className="text-sm font-semibold mb-4">Input Format Example</h3>
          <pre className="bg-bg-input p-4 rounded-md text-xs overflow-x-auto text-secondary border border-border">
{`[
  {
    "query_id": "q1",
    "question": "What is the capital of France?"
  },
  {
    "query_id": "q2",
    "question": "How does photosynthesis work?"
  }
]`}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default BulkQuery;
