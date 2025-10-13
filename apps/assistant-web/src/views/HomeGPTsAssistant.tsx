import { Landing } from "../components/Landing";
import { getRandomArr } from "../helpers/getRandomArr";
import { useEffect, useState } from "react";
import { globalConfig } from "../config/global";
import { RouterComponentProps } from "../config/router";
import { setTextAreaHeight } from "../helpers/setTextAreaHeight";
import regulationIcon from "../assets/icons/zhidu_logo.svg";


const Home = (props: RouterComponentProps) => {
    const { site: siteTitle } = globalConfig.title;

    const textAreaRef =
        (props.refs?.textAreaRef.current as HTMLTextAreaElement) ?? null;
    const {gid, title, logo, subTitle, samples = []} = props;
    const [randomSamples, setRandomSamples] = useState<string[]>([]);

    const handleSelectSample = async (message: string) => {
        textAreaRef.focus();
        textAreaRef.value = message;
        setTextAreaHeight(textAreaRef);
    };

    useEffect(() => {
        document.title = siteTitle;
        setRandomSamples(getRandomArr(samples, 6));
    }, [samples, siteTitle, gid]);

    return (
        <Landing
            title={title?title:""}
            logo={logo?logo:regulationIcon}
            subTitle={subTitle?subTitle:""}
            samples={randomSamples}
            onSelectSample={handleSelectSample}
        />
    );
};

export default Home;
