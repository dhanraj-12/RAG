import api from './client';
import { AxiosResponse } from 'axios';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data: T;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface Notebook {
  _id: string;
  userId: string;
  title: string;
  description: string;
  createdAt: string;
}

export interface Resource {
  _id: string;
  notebookId: string;
  fileName: string;
  type: 'pdf' | 'image';
  s3Url: string;
  s3Key: string;
  uploadedBy: string;
  createdAt: string;
}

export interface Chat {
  _id: string;
  notebookId: string;
  userId: string;
  title: string;
  createdAt: string;
}

export interface Message {
  _id: string;
  chatId: string;
  role: 'user' | 'assistant';
  contentType: 'text' | 'image' | 'mixed';
  text: string;
  imageUrls: string[];
  createdAt: string;
}

export const authAPI = {
  register: (data: { name: string; email: string; password: string }): Promise<AxiosResponse<ApiResponse<{ user: User; token: string }>>> =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }): Promise<AxiosResponse<ApiResponse<{ user: User; token: string }>>> =>
    api.post('/auth/login', data),
  getProfile: (): Promise<AxiosResponse<ApiResponse<User>>> =>
    api.get('/auth/profile'),
  updateProfile: (data: { name?: string; email?: string }): Promise<AxiosResponse<ApiResponse<User>>> =>
    api.put('/auth/profile', data),
};

export const notebookAPI = {
  create: (data: { title: string; description?: string }): Promise<AxiosResponse<ApiResponse<Notebook>>> =>
    api.post('/notebooks', data),
  getAll: (): Promise<AxiosResponse<ApiResponse<Notebook[]>>> =>
    api.get('/notebooks'),
  delete: (id: string): Promise<AxiosResponse<ApiResponse<null>>> =>
    api.delete(`/notebooks/${id}`),
};

export const resourceAPI = {
  upload: (notebookId: string, formData: FormData): Promise<AxiosResponse<ApiResponse<Resource>>> =>
    api.post(`/resources/${notebookId}/resources`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getAll: (notebookId: string): Promise<AxiosResponse<ApiResponse<Resource[]>>> =>
    api.get(`/resources/${notebookId}/resources`),
  delete: (id: string): Promise<AxiosResponse<ApiResponse<null>>> =>
    api.delete(`/resources/${id}`),
};

export const chatAPI = {
  create: (data: { notebookId: string; title: string }): Promise<AxiosResponse<ApiResponse<Chat>>> =>
    api.post('/chats', data),
  getAll: (notebookId: string): Promise<AxiosResponse<ApiResponse<Chat[]>>> =>
    api.get(`/chats/notebooks/${notebookId}`),
  delete: (chatId: string): Promise<AxiosResponse<ApiResponse<null>>> =>
    api.delete(`/chats/${chatId}`),
  sendMessage: (chatId: string, text: string): Promise<AxiosResponse<ApiResponse<{ userMessage: Message; assistantMessage: Message }>>> =>
    api.post(`/chats/${chatId}/message`, { text }),
  getMessages: (chatId: string): Promise<AxiosResponse<ApiResponse<Message[]>>> =>
    api.get(`/chats/${chatId}/messages`),
};
