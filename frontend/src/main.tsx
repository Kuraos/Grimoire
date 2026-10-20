import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MotionConfig } from "motion/react";
import App from "./App";
import { AppProvider } from "./context";
import { PomodoroProvider } from "./pomodoro-context";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* `reducedMotion="user"`: con movimiento reducido pedido en el sistema,
        Motion apaga desplazamientos y escalas y deja sólo opacidad y color —la
        misma línea que trazan theme.css e index.css con sus propias clases. */}
    <MotionConfig reducedMotion="user">
    <BrowserRouter>
      <AppProvider>
        <PomodoroProvider>
          <App />
        </PomodoroProvider>
      </AppProvider>
    </BrowserRouter>
    </MotionConfig>
  </React.StrictMode>
);
