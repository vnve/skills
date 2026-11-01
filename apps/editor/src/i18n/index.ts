import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "./zh-CN";
void i18next.use(initReactI18next).init({
  lng: "zh-CN",
  resources: { "zh-CN": { translation: zhCN } },
  interpolation: { escapeValue: false },
});
