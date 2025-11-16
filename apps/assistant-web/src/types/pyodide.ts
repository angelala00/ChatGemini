export interface PyProxy {
    destroy: () => void;
}

export interface PyCallableProxy extends PyProxy {
    (...args: unknown[]): PyProxy;
}

export interface PyodideStdIOHandler {
    batched: (msg: string) => void;
}

export interface PyodideLoadOptions {
    errorCallback?: (message: string) => void;
    messageCallback?: (message: string) => void;
}

export interface PyodideInterface {
    runPython: (code: string) => unknown;
    runPythonAsync: (
        code: string,
        options?: { globals?: PyProxy; locals?: PyProxy }
    ) => Promise<unknown>;
    setStdout: (handler: PyodideStdIOHandler) => void;
    setStderr: (handler: PyodideStdIOHandler) => void;
    loadPackage: (
        packages: string | string[],
        options?: PyodideLoadOptions
    ) => Promise<void>;
    globals: {
        get: (name: string) => PyCallableProxy;
    };
}

export interface LoadPyodideConfig {
    indexURL: string;
    homedir?: string;
}

export type LoadPyodideFn = (
    config: LoadPyodideConfig
) => Promise<PyodideInterface>;

declare global {
    interface Window {
        loadPyodide?: LoadPyodideFn;
    }
}

export {};
