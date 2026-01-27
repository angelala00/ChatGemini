import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { getBasePath } from "./helpers/getBasePath";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <BrowserRouter basename={getBasePath() || "/"}>
        <App />
    </BrowserRouter>
);
