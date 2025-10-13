import { useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import client from "../api/client";

const DASHBOARD_QUERY_KEY = ["dashboard"];

async function fetchDashboard() {
  const { data } = await client.get(
    import.meta.env.VITE_DASHBOARD_ENDPOINT ?? "/data/dashboard.json"
  );
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
    const wsUrl = import.meta.env.VITE_WS_URL;
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
