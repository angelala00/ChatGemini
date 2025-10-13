interface LandingProps {
    readonly title: string;
    readonly logo: string;
    readonly subTitle: string;
    readonly samples: string[];
    readonly onSelectSample: (prompt: string) => void;
}

export const Landing = (props: LandingProps) => {
    const { title, logo, subTitle, samples, onSelectSample } = props;
    return (
        <div className="py-6 pl-3 mx-auto max-w-[calc(100%)] items-center flex flex-col space-y-8">
            <div className="size-16 animate-ease-in-out animate-wiggle animate-infinite animate-duration-[3000ms]">
                <img src={logo} alt="" className="w-50 h-50 object-contain" />
            </div>

            <h1 className="font-bold text-lg md:text-xl lg:text-2xl text-gray-900">
                {title}
            </h1>
            <div className="sub-title">
                {subTitle}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pr-2 justify-items-center">
                {samples.map((prompt, index) => (
                    <button
                        key={index}
                        className="p-3 rounded-lg hover:bg-gray-100 border text-left w-full max-w-[250px]"
                        onClick={() => onSelectSample(prompt)}
                    >
                        <div className="md:text-md text-sm text-gray-800/80">
                            {prompt}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};
