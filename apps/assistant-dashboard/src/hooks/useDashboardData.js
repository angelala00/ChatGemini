import { useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import client from "../api/client";

const DASHBOARD_QUERY_KEY = ["dashboard"];

const DASHBOARD_ENDPOINT =
  import.meta.env.VITE_DASHBOARD_ENDPOINT ?? "/api/dashboard";

function resolveApiBaseUrlForWebSocket() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (client.defaults.baseURL) {
    return client.defaults.baseURL;
  }

  if (import.meta.env.DEV) {
    return "http://localhost:5010";
  }

  try {
    return window.location.origin;
  } catch (error) {
    console.warn("无法推导 API 基地址", error);
    return undefined;
  }
}

function resolveWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  try {
    const baseUrl = resolveApiBaseUrlForWebSocket();
    if (baseUrl) {
      const url = new URL(baseUrl);
      url.pathname = `${url.pathname.replace(/\/$/, "")}/ws/dashboard`;
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return url.toString();
    }
  } catch (error) {
    console.warn("无法解析 API 基地址", error);
  }

  try {
    const url = new URL(window.location.origin);
    url.pathname = "/ws/dashboard";
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  } catch (error) {
    console.warn("无法推导 WebSocket 地址", error);
    return undefined;
  }
}

async function fetchDashboard() {
  const { data } = await client.get(DASHBOARD_ENDPOINT);
  return data;
}

export function useDashboardData() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: fetchDashboard,
    refetchInterval: Number(import.meta.env.VITE_REFRESH_INTERVAL ?? 30_000)
  });

  useEffect(() => {
    const wsUrl = resolveWebSocketUrl();
    if (!wsUrl) {
      return undefined;
    }

    let socket;
    let reconnectTimer;
    let shouldReconnect = true;

    function handleMessage(event) {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "dashboard:update") {
          queryClient.setQueryData(DASHBOARD_QUERY_KEY, (prev) => ({
            ...prev,
            ...payload.data
          }));
        }
      } catch (error) {
        console.warn("无法解析 WebSocket 消息", error);
      }
    }

    function handleError(event) {
      console.warn("WebSocket 发生错误，稍后将重试连接。", event);
    }

    function handleClose(event) {
      const currentSocket = event.target;
      currentSocket.removeEventListener("message", handleMessage);
      currentSocket.removeEventListener("error", handleError);
      currentSocket.removeEventListener("close", handleClose);

      if (!event.wasClean) {
        console.warn("WebSocket 连接异常关闭，5 秒后将自动重试。", event);
      }

      if (socket === currentSocket) {
        socket = undefined;
      }

      scheduleReconnect();
    }

    function cleanupCurrentSocket() {
      if (!socket) {
        return;
      }

      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleClose);

      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close();
      }

      socket = undefined;
    }

    function scheduleReconnect() {
      if (!shouldReconnect) {
        return;
      }

      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }

      reconnectTimer = window.setTimeout(() => {
        connect();
      }, 5000);
    }

    function connect() {
      try {
        const nextSocket = new WebSocket(wsUrl);
        socket = nextSocket;

        nextSocket.addEventListener("message", handleMessage);
        nextSocket.addEventListener("error", handleError);
        nextSocket.addEventListener("close", handleClose);
      } catch (error) {
        console.warn("无法建立 WebSocket 连接，将在 5 秒后重试。", error);
        scheduleReconnect();
      }
    }

    connect();

    return () => {
      shouldReconnect = false;

      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }

      cleanupCurrentSocket();
    };
  }, [queryClient]);

  return query;
}
