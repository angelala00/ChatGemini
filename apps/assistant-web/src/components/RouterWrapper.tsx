import { BrowserRouter, HashRouter } from "react-router-dom";

export type RouterMode = "hash" | "history";

export interface RouterWrapperProps {
    readonly mode: RouterMode;
    readonly basename: string;
    readonly children: React.ReactNode;
}

export const RouterWrapper = (props: RouterWrapperProps) => {
    const { mode, basename, children } = props;

    return mode === "hash" ? (
        <HashRouter basename={basename}>{children}</HashRouter>
    ) : (
        <BrowserRouter basename={basename}>{children}</BrowserRouter>
    );
};
