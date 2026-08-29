import axios from 'axios';

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.error ??
      error.response?.data?.details?.[0]?.message ??
      'Something went wrong. Please try again.';

    return Promise.reject({
      status: error.response?.status,
      message,
      details: error.response?.data?.details ?? [],
    });
  }
);