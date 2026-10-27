import React from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";

class AppBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main><h1>页面暂时无法显示</h1><p>请重启应用。学习记录仍保存在这台电脑，不会因本次页面错误清空。</p></main> : this.props.children;
  }
}
window.addEventListener("error", () => {
  if (!document.querySelector("main")) document.getElementById("root")!.textContent = "资源载入失败，请重新安装应用；请先备份学习数据。";
});
createRoot(document.getElementById("root")!).render(<AppBoundary><Home /></AppBoundary>);
