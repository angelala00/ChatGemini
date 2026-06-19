interface LandingProps {
    readonly title: string;
    readonly logo: string;
    readonly subTitle: string;
    readonly samples: string[];
    readonly isNewSessionPage?: boolean;
    readonly useTemplateTitle?: boolean;
    readonly heroLogo?: boolean;
    readonly onSelectSample: (prompt: string) => void;
}

export const Landing = (props: LandingProps) => {
    const { title, logo, subTitle, samples, isNewSessionPage, useTemplateTitle, heroLogo, onSelectSample } = props;
    const useLargeLogo = useTemplateTitle || heroLogo;
    return (
        <div className={`mx-auto flex w-full max-w-[980px] flex-col items-center justify-center px-5 text-center ${
            isNewSessionPage
                ? useLargeLogo
                    ? "min-h-0 gap-4 py-2 md:gap-5 md:py-3"
                    : "min-h-0 gap-3 py-1 md:gap-4 md:py-2"
                : "min-h-full gap-[18px] py-6 max-[680px]:py-4"
        }`}>
            <div
                className={`flex items-center justify-center gap-3.5 max-[680px]:flex-col max-[680px]:gap-4 ${
                    useTemplateTitle ? "flex-col gap-2" : ""
                }`}
            >
                <div
                    className={`grid shrink-0 place-items-center animate-ease-in-out animate-wiggle animate-infinite animate-duration-[3000ms] ${
                        useLargeLogo ? "size-20 -mb-1 max-[680px]:size-16 max-[680px]:-mb-1" : "size-10"
                    }`}
                >
                    <img
                        src={logo}
                        alt=""
                        className={`object-contain ${
                            useLargeLogo ? "size-20 max-[680px]:size-16" : "size-[34px]"
                        }`}
                    />
                </div>

                <h1 className="text-center text-[28px] font-bold leading-tight tracking-[0] text-[#2f3a46] max-[680px]:text-[24px]">
                    {useTemplateTitle ? "今天想让我帮你处理什么？" : title}
                </h1>
            </div>

            <div className={`text-center text-[14px] leading-[1.7] text-[#66717d] ${
                isNewSessionPage ? "max-w-[680px]" : "max-w-[600px]"
            }`}>
                {subTitle}
            </div>

            {samples.length > 0 && (
                <div className="grid w-full max-w-[760px] grid-cols-2 justify-items-center gap-3 md:grid-cols-3">
                    {samples.map((prompt, index) => (
                        <button
                            key={index}
                            className="min-h-[38px] w-full max-w-[250px] rounded-[14px] border border-[#e8ebef] bg-white/95 px-4 py-2 text-left shadow-[0_4px_10px_rgba(23,28,38,0.03)] transition-colors hover:border-[#d7e8ed] hover:bg-white"
                            onClick={() => onSelectSample(prompt)}
                        >
                            <div className="text-[13px] font-semibold leading-5 text-[#66717d]">
                                {prompt}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
