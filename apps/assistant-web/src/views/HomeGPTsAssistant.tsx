import { Landing } from "../components/Landing";
import { getRandomArr } from "../helpers/getRandomArr";
import { useEffect, useState } from "react";
import { globalConfig } from "../config/global";
import { RouterComponentProps } from "../config/router";
import { fillTextAreaValue } from "../helpers/fillTextAreaValue";
import regulationIcon from "../assets/icons/zhidu_logo.svg";
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

    return (
        <Landing
            title={title?title:""}
            logo={logo ? normalizeAssetPath(logo) : regulationIcon}
            subTitle={subTitle?subTitle:""}
            samples={randomSamples}
            isNewSessionPage={true}
            onSelectSample={handleSelectSample}
        />
    );
};

export default Home;
