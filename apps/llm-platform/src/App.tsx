import { useState } from "react";
import { LoginByOAuth } from "./components/LoginByOAuth";
import { globalConfig } from "./config/global";
import Platform from "./views/Platform";
import logo from "./assets/logo.svg";

const App = () => {
    const [hasLogined, setHasLogined] = useState(false);
    const [userName, setUserName] = useState("");
    const { header } = globalConfig.title;

    return (
        <div
            className={
                !hasLogined
                    ? "flex min-h-screen flex-col items-center justify-center bg-slate-100 p-10"
                    : ""
            }
        >
            {hasLogined ? (
                <Platform userName={userName} />
            ) : (
                <LoginByOAuth
                    title={header}
                    logo={logo}
                    isNoAuthorized={false}
                    onLogined={(uname) => {
                        setHasLogined(true);
                        setUserName(uname);
                    }}
                />
            )}
        </div>
    );
};

export default App;
