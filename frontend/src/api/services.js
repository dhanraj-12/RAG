import api from './client';

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
};

export const notebookAPI = {
  create: (data) => api.post('/notebooks', data),
  getAll: () => api.get('/notebooks'),
  delete: (id) => api.delete(`/notebooks/${id}`),
};

export const resourceAPI = {
  upload: (notebookId, formData) =>
    api.post(`/resources/${notebookId}/resources`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getAll: (notebookId) => api.get(`/resources/${notebookId}/resources`),
  delete: (id) => api.delete(`/resources/${id}`),
};

export const chatAPI = {
  create: (data) => api.post('/chats', data),
  getAll: (notebookId) => api.get(`/chats/notebooks/${notebookId}`),
  sendMessage: (chatId, text) => api.post(`/chats/${chatId}/message`, { text }),
  getMessages: (chatId) => api.get(`/chats/${chatId}/messages`),
};
