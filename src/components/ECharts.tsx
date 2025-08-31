import { useEffect, useRef } from "react";
import * as echarts from "echarts";

interface Props {
    option: any;
}

export const ECharts = ({ option }: Props) => {
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartRef.current) return;
        const chart = echarts.init(chartRef.current);
        chart.setOption(option);

        const resize = () => chart.resize();
        window.addEventListener("resize", resize);
        return () => {
            window.removeEventListener("resize", resize);
            chart.dispose();
        };
    }, [option]);

    return <div ref={chartRef} style={{ width: "100%", height: 400 }} />;
};

