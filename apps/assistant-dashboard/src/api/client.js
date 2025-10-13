import axios from "axios";

function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (import.meta.env.DEV) {
    return "http://localhost:5010";
  }

  try {
    return window.location.origin;
  } catch (error) {
    console.warn("无法解析默认的 API 基地址", error);
    return "";
  }
}

const client = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 10_000
});

export default client;
