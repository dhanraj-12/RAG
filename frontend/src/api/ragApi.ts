import api from './client';

export const generateBulkCSV = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/rag/generate-csv', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    responseType: 'blob', // Important for file download
  });

  return response.data;
};
