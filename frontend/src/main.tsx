import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MotionConfig } from "motion/react";
import App from "./App";
import { AppProvider } from "./context";
import { PomodoroProvider } from "./pomodoro-context";
import { initMotionPref, useReducedMotion } from "./motion-pref";
import "./index.css";

initMotionPref();

/* Motion obedece a la misma preferencia que el CSS (motion-pref.ts). "always"
 * deja opacidad y color y retira desplazamientos, giros y escalas. */
function MotionRoot({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion={useReducedMotion() ? "always" : "never"}>{children}</MotionConfig>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MotionRoot>
    <BrowserRouter>
      <AppProvider>
        <PomodoroProvider>
          <App />
        </PomodoroProvider>
      </AppProvider>
    </BrowserRouter>
    </MotionRoot>
  </React.StrictMode>
);
