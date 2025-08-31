import { useEffect, useRef } from "react";

declare global {
    interface Window {
        echarts: any;
    }
}

interface Props {
    option: any;
}

export const ECharts = ({ option }: Props) => {
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let chart: any;
        const initChart = () => {
            if (!chartRef.current) return;
            chart = window.echarts.init(chartRef.current);
            chart.setOption(option);
        };
        if (!window.echarts) {
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js";
            script.onload = initChart;
            document.head.appendChild(script);
        } else {
            initChart();
        }
        const resize = () => chart && chart.resize();
        window.addEventListener("resize", resize);
        return () => {
            window.removeEventListener("resize", resize);
            chart && chart.dispose();
        };
    }, [option]);

    return <div ref={chartRef} style={{ width: "100%", height: 400 }} />;
};

