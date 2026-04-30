import { Landing } from "../components/Landing";
import { useEffect, useState } from "react";
import { globalConfig } from "../config/global";
import { RouterComponentProps } from "../config/router";
import { setTextAreaHeight } from "../helpers/setTextAreaHeight";
import { useTranslation } from "react-i18next";

const Home = (props: RouterComponentProps) => {
    const { t } = useTranslation();
    const { site: siteTitle } = globalConfig.title;
    const { assistantName } = globalConfig;
    const textAreaRef =
        (props.refs?.textAreaRef.current as HTMLTextAreaElement) ?? null;
    const [randomSamples] = useState<string[]>([]);

    const handleSelectSample = async (message: string) => {
        textAreaRef.focus();
        textAreaRef.value = message;
        setTextAreaHeight(textAreaRef);
    };

    useEffect(() => {
        document.title = siteTitle;
    }, [t, siteTitle]);

    return (
        <Landing
            title={`我是 ${assistantName},　很高兴见到你！`}
            logo="/logo_mock.png"
            subTitle="我可以帮你写代码、读文件、写作各种创意内容，请把你的任务交给我吧～"
            samples={randomSamples}
            isNewSessionPage={true}
            useTemplateTitle={true}
            onSelectSample={handleSelectSample}
        />
    );
};

export default Home;
