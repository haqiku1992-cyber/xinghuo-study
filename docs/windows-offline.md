# 学习记录 Windows 离线桌面版

适用于 Windows 10/11 x64。安装包已包含 Electron 运行环境和正式题库，无需安装 Node.js、Python、数据库，也无需启动服务器。首次安装与日常刷题均可离线完成。

## 安装与使用

从本 PR 的 **Windows offline desktop → Artifacts → 学习记录-Windows-x64** 下载并解压，双击 `学习记录-Setup.exe`。选择仅当前用户安装及安装目录，完成后从桌面快捷方式或开始菜单打开「学习记录」。此测试版暂未购买代码签名证书，Windows 可能显示未知发布者提示；请核对下载来自本仓库对应工作流。

数据保存在 `%LOCALAPPDATA%\XinghuoStudy`，通过固定来源 `app://study/` 的 localStorage 保存 `xinghuo-study-v1`。安装目录与数据目录分离，重新安装、升级不会覆盖该目录；卸载不会自动删除学习记录。应用退出后结束其进程，不安装服务、计划任务或更新器，也不监听 localhost 端口。

## 从现有网页版迁移

1. 在现有网页版进入「设置」。
2. 点击「导出学习数据」，保存 JSON。
3. 安装 Windows 桌面版。
4. 在桌面版「设置 → 恢复学习数据」选择刚才的 JSON。
5. 确认覆盖提示，核对进度、错题、历史、未完成练习、统计和主题。

浏览器与桌面版存储彼此独立，安装不会自动读取浏览器记录，也不会修改网页版数据。仍可在桌面版设置中手动导出备份，使用系统保存对话框选择位置；恢复时使用系统文件选择器。备份校验失败或取消覆盖时保留原数据，恢复成功后继续执行旧题清理兼容处理。同步密码不在学习数据备份中。

**卸载、重装系统或更换电脑前，请先导出 JSON，并将备份放到独立位置。** 保留数据目录不等于自动备份。不要同时手动修改正在运行的应用存储文件。

桌面版不提供云同步、同步密码或手机 PWA 安装入口，不注册 Service Worker，不调用 `/api/sync` 或远程 API。网页版原功能仍保留。若页面今后提供外部来源链接，只能通过右键菜单「在系统浏览器打开来源链接」由用户主动打开；应用窗口拒绝外部导航和新窗口。

## 构建与验证

开发工具链：Node 24.16.0 / npm 11.13.0。Electron 45.0.0（实施时 npm latest 稳定版本，Node 包要求 >=22.12），electron-builder 26.18.0 精确锁定。Electron 支持政策与协议说明：[支持周期](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)、[安全标准协议](https://www.electronjs.org/docs/latest/api/protocol)。打包后的用户不需要这些开发工具。

```text
npm ci
npm run lint
npm test
npm run desktop:build
npm run desktop:test
npm run desktop:dev
npm run desktop:package
node desktop/test-electron.mjs "release/win-unpacked/学习记录.exe"
```

`desktop:dev` 先构建再运行，不启动 Vite HTTP 服务。安装包输出 `release/学习记录-Setup.exe`，产物与依赖不提交到 Git。构建阶段需要下载依赖和打包工具，安装阶段无需下载运行组件；不创建 GitHub Release。

桌面 renderer 直接复用 `app/page.tsx` 和现有状态算法。主进程仅从打包静态目录提供资源，检查来源、解码路径、目录边界及真实路径（包括链接逃逸），拒绝 API/SW、未知方法与安装目录外文件。渲染器无 Node/IPC 文件能力，启用 sandbox/contextIsolation/webSecurity，CSP 和 session 请求过滤拒绝网络请求；正常导入导出使用浏览器文件控件与受限 JSON 下载。

`desktop:test` 包含备份校验、路径穿越及链接逃逸测试、正式题库一致性检查，以及隐藏 Electron 窗口的真实 UI 刷题/错题复盘、导入取消/失败/成功、导出往返、重启持久化、残留同步密码隔离及 SW/网络请求检查。测试显式使用系统临时目录，绝不读写真实用户记录。打包后的应用运行同样 smoke；Windows CI 还在一次性 runner 上执行 NSIS 安装、重装、已安装应用启动和卸载保留目录测试。隐藏窗口自动测试不能代替你对真实 Windows 10/11 机器的安装与迁移确认，因此 PR 保持 Draft，不自动合并。

已有依赖审计的剩余风险继续见 `security-audit-2026-10.md`；此桌面任务不宣称已修复那份报告中的漏洞。不包含自动更新、遥测、云备份或生产部署。
