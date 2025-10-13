import { useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import client from "../api/client";

const DASHBOARD_QUERY_KEY = ["dashboard"];

const DASHBOARD_ENDPOINT =
  import.meta.env.VITE_DASHBOARD_ENDPOINT ?? "/api/dashboard";

function resolveWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  try {
    if (import.meta.env.VITE_API_BASE_URL) {
      const url = new URL(import.meta.env.VITE_API_BASE_URL);
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

    const socket = new WebSocket(wsUrl);

    socket.addEventListener("message", (event) => {
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
    });

    return () => socket.close();
  }, [queryClient]);

  return query;
}
