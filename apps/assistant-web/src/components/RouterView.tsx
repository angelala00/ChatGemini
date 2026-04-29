import { ReactNode, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { RouterComponentProps, RouterConfigRoutes } from "../config/router";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

interface RouterViewProps {
    readonly routes: Record<string, RouterConfigRoutes>;
    readonly routerProps?: RouterComponentProps;
    readonly suspense: ReactNode;
}

export const RouterView = (props: RouterViewProps) => {
    const { routes, suspense, routerProps } = props;

    return (
        <Suspense fallback={suspense}>
            <Routes>
                {Object.values(routes).map(
                    ({ prefix, uri, suffix, element: Element }, index) => (
                        <Route
                            key={index}
                            element={
                                <RouteErrorBoundary>
                                    <Element {...routerProps} />
                                </RouteErrorBoundary>
                            }
                            path={`${prefix}${uri}${suffix}`}
                        />
                    )
                )}
            </Routes>
        </Suspense>
    );
};
