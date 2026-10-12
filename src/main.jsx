import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { applyTheme, initialTheme } from "./features/theme/theme.js";
import "leaflet/dist/leaflet.css";
import "./index.css";
import "./styles/theme.css";
import "./styles/shell.css";

applyTheme(initialTheme());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
      <App />
  </React.StrictMode>
);
