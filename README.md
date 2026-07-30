# 星火学习

面向手机使用的入党考试刷题 PWA。支持单选、判断、简答和论述四种题型，练习进度、错题和统计记录保存在当前设备的浏览器中。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run start
```

## 数据

- 正式题库源文件：`public/data/questions.json`
- 生产构建会自动把题库同步到浏览器可访问的根路径。
- 学习记录使用 `localStorage`，不会上传到服务器。
- 清理浏览器数据或卸载 PWA 前，请先在设置页导出学习数据。

## 部署

项目已经包含 `zbpack.json`，可直接连接 GitHub 仓库部署到 Zeabur。详细步骤见 `ZEABUR_DEPLOY.md`。

## 内容说明

当前单选题依据 2022 年 10 月 22 日通过的《中国共产党章程》整理；判断、简答和论述题仍包含流程演示内容。正式使用前应继续逐条核对题目、答案和来源。
