import type { LoadPyodideFn, PyodideInterface } from "../types/pyodide";

const loaderPromises = new Map<string, Promise<LoadPyodideFn>>();

const ensureBrowserEnvironment = () => {
    if (typeof window === "undefined" || typeof document === "undefined") {
        throw new Error("Pyodide runtime is only available in browsers");
    }
};

const normalizeRepo = (repoURL: string) =>
    repoURL.endsWith("/") ? repoURL.slice(0, -1) : repoURL;

const ensureLoadPyodide = async (repoURL: string) => {
    ensureBrowserEnvironment();
    if (window.loadPyodide) {
        return window.loadPyodide;
    }

    const normalized = normalizeRepo(repoURL);
    const scriptSrc = `${normalized}/pyodide.js`;

    if (!loaderPromises.has(scriptSrc)) {
        loaderPromises.set(
            scriptSrc,
            new Promise<LoadPyodideFn>((resolve, reject) => {
                const script = document.createElement("script");
                script.src = scriptSrc;
                script.async = true;
                script.onload = () => {
                    if (window.loadPyodide) {
                        resolve(window.loadPyodide);
                    } else {
                        reject(
                            new Error(
                                "Pyodide script loaded but loadPyodide was not found"
                            )
                        );
                    }
                };
                script.onerror = () =>
                    reject(
                        new Error(
                            `Failed to load Pyodide script from ${scriptSrc}`
                        )
                    );
                document.head.appendChild(script);
            })
        );
    }

    return loaderPromises.get(scriptSrc)!;
};

export const getPythonRuntime = async (
    repoURL: string
): Promise<PyodideInterface> => {
    const loadPyodide = await ensureLoadPyodide(repoURL);
    const pyodide = await loadPyodide({
        indexURL: repoURL,
        homedir: "/home/user",
    });
    await pyodide.runPythonAsync(`
from js import prompt
def input(p):
    return prompt(p)
__builtins__.input = input
`);
    return pyodide;
};
