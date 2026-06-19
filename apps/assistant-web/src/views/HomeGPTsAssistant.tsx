import { Landing } from "../components/Landing";
import { getRandomArr } from "../helpers/getRandomArr";
import { useEffect, useState } from "react";
import { globalConfig } from "../config/global";
import { RouterComponentProps } from "../config/router";
import { fillTextAreaValue } from "../helpers/fillTextAreaValue";
const regulationIcon = "/gpts/policy.svg";
import { normalizeAssetPath } from "../helpers/normalizeAssetPath";


const Home = (props: RouterComponentProps) => {
    const { site: siteTitle } = globalConfig.title;

    const textAreaRef =
        (props.refs?.textAreaRef.current as HTMLTextAreaElement) ?? null;
    const {gid, title, logo, subTitle, samples = []} = props;
    const [randomSamples, setRandomSamples] = useState<string[]>([]);

    const handleSelectSample = async (message: string) => {
        fillTextAreaValue(textAreaRef, message);
    };

    useEffect(() => {
        document.title = siteTitle;
        setRandomSamples(getRandomArr(samples, 6));
    }, [samples, siteTitle, gid]);

    let welcomeTitle = title;
    if (gid === "regulationassistant") {
        welcomeTitle = "我是制度问答助手，很高兴见到你！";
    } else if (!welcomeTitle) {
        welcomeTitle = "";
    } else if (!welcomeTitle.includes("高兴见到你")) {
        welcomeTitle = `我是 ${welcomeTitle}，很高兴见到你！`;
    }

    return (
        <Landing
            title={welcomeTitle}
            logo={logo ? normalizeAssetPath(logo) : regulationIcon}
            subTitle={subTitle?subTitle:""}
            samples={randomSamples}
            isNewSessionPage={true}
            onSelectSample={handleSelectSample}
        />
    );
};

export default Home;
