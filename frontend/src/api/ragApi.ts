import axios from 'axios';

const RAG_API_URL = 'http://localhost:8001';

export const generateBulkCSV = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axios.post(`${RAG_API_URL}/api/upload_and_generate_csv`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    responseType: 'blob', // Important for file download
  });

  return response.data;
};
