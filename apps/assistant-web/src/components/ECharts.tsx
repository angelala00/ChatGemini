import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EChartsType } from "echarts";

interface Props {
    option: any;
}

type EChartsModule = typeof import("echarts");

let echartsLoader: Promise<EChartsModule> | null = null;

const loadECharts = () => {
    if (!echartsLoader) {
        echartsLoader = import("echarts");
    }
    return echartsLoader;
};

export const ECharts = ({ option }: Props) => {
    const { t } = useTranslation();
    const chartRef = useRef<HTMLDivElement>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!chartRef.current) return;
        setFailed(false);
        let disposed = false;
        let chart: EChartsType | null = null;
        let resize: (() => void) | null = null;

        loadECharts()
            .then((echarts) => {
                if (disposed || !chartRef.current) {
                    return;
                }
                chart = echarts.init(chartRef.current);
                chart.setOption(option);
                resize = () => chart?.resize();
                window.addEventListener("resize", resize);
            })
            .catch(() => {
                if (!disposed) {
                    setFailed(true);
                }
            });

        return () => {
            disposed = true;
            if (resize) {
                window.removeEventListener("resize", resize);
            }
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
