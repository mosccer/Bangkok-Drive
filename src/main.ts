import "./styles.css";
import { GameApp } from "./render/app/GameApp";
import { LoadingScreen } from "./ui/LoadingScreen";

const host = document.querySelector<HTMLDivElement>("#app");

if (!host) {
  throw new Error("Missing #app host");
}

try {
  const app = new GameApp(host);
  app.start().catch((error: unknown) => {
    console.error(error);
    app.showStartupError("เริ่มเกมไม่สำเร็จ");
  });
} catch (error) {
  console.error(error);
  new LoadingScreen().fail("เปิดกราฟิก 3D ไม่ได้ในเบราว์เซอร์นี้");
}
