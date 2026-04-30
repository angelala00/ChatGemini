import { Component, ErrorInfo, ReactNode } from "react";

interface RouteErrorBoundaryProps {
    readonly children: ReactNode;
}

interface RouteErrorBoundaryState {
    readonly error: Error | null;
}

export class RouteErrorBoundary extends Component<
    RouteErrorBoundaryProps,
    RouteErrorBoundaryState
> {
    state: RouteErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Route render failed:", error, errorInfo);
    }

    render() {
        const { error } = this.state;
        if (error) {
            return (
                <div className="mx-auto mt-8 max-w-[760px] rounded-[18px] border border-red-200 bg-red-50 px-5 py-4 text-sm leading-6 text-red-900">
                    <div className="font-semibold">页面渲染失败</div>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
                        {error.stack ?? error.message}
                    </pre>
                </div>
            );
        }

        return this.props.children;
    }
}
