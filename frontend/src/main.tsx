import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./context";
import { PomodoroProvider } from "./pomodoro-context";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <PomodoroProvider>
          <App />
        </PomodoroProvider>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);
