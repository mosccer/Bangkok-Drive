import "./styles.css";
import { GameApp } from "./render/app/GameApp";

const host = document.querySelector<HTMLDivElement>("#app");

if (!host) {
  throw new Error("Missing #app host");
}

const app = new GameApp(host);
void app.start();
