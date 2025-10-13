import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import { useTranslation } from "react-i18next";

interface Props {
    option: any;
}

export const ECharts = ({ option }: Props) => {
    const { t } = useTranslation();
    const chartRef = useRef<HTMLDivElement>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!chartRef.current) return;
        let chart: echarts.EChartsType | null = null;
        try {
            chart = echarts.init(chartRef.current);
            chart.setOption(option);
        } catch (e) {
            setFailed(true);
            return;
        }

        const resize = () => chart!.resize();
        window.addEventListener("resize", resize);
        return () => {
            window.removeEventListener("resize", resize);
            chart?.dispose();
        };
    }, [option]);

    if (failed) {
        return (
            <div className="text-red-700">
                {t("components.Markdown.echarts_render_failed")}
            </div>
        );
    }

    return <div ref={chartRef} style={{ width: "100%", height: 400 }} />;
};

