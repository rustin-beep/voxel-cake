# 烛光体素蛋糕 · Voxel Candle Cake

一个只用三支蜡烛照亮的体素生日微缩场景。正交相机、28° 俯角、默认夜烛色调，打开即见全貌，可拖拽旋转，松手两秒回到自转。

> 一款送给朋友的礼物 切勿商用 谢谢

- **技术栈**：Three.js + Vite，纯原生 ES Module，无 React
- **体素预算**：40 × 40 × 32 格；实际占地 39 × 39，最高 22 格
- **Draw call**：**3**（预算 ≤ 10）
- **单文件产物**：`dist-single/voxel-candle-cake.html`，551 KB（gzip 144 KB），零外部请求

---

## 运行方式

```bash
# 安装（pnpm 或 npm 均可）
pnpm install
# 开发
pnpm dev            # http://127.0.0.1:5173
# 常规构建（多文件，用于 GitHub Pages）
pnpm build          # → dist/
# 单 HTML 构建（vite-plugin-singlefile）
pnpm build:single   # → dist-single/voxel-candle-cake.html
# 本地预览产物
pnpm preview
# 无头浏览器验收 + 性能采样（需先 build）
pnpm exec playwright install chromium   # 首次：装无头浏览器
pnpm measure        # → shots/report.json、shots/*.png
```

## 项目结构

```
voxel-cake/
├─ index.html                 # 页面骨架；<!--FALLBACK_SVG--> 由 Vite 插件内联
├─ vite.config.js             # base './'、SVG 内联插件、singlefile 开关
├─ src/
│  ├─ main.js                 # 渲染器、相机、光照、仪式、交互、降级、统计
│  ├─ letters.js              # 开场三封信：状态机、键盘、跳过
│  ├─ music.js                # Web Audio 合成的音乐盒（无音频文件）
│  ├─ world.js                # 体素世界：地台/托盘/三层蛋糕/蜡烛/装饰 + 调色板
│  ├─ mesher.js               # 面剔除 + 顶点色 + 体素 AO，合并成单个 BufferGeometry
│  ├─ fallback-cake.svg       # 降级用静态插画（也是首帧的兜底画面）
│  └─ style.css               # 夜色调、排版、降级卡片
├─ scripts/
│  ├─ postbuild-single.mjs    # 单文件改名 voxel-candle-cake.html
│  ├─ measure.mjs             # Playwright：drawcall/三角形/帧率/截图/降级验证
│  └─ check-single.mjs        # 单独验证单文件产物能启动
├─ tools/
│  └─ build-fallback-svg.py   # 重新生成降级用的静态蛋糕（构建不依赖它）
├─ shots/                     # 验收截图与 report.json
└─ .github/workflows/deploy.yml
```

## 小仪式与音乐

**点烛 → 吹灭 → 复燃**（读完三封信后）：

- 点"吹灭蜡烛"，或者直接**轻点蛋糕**（拖动仍然是旋转，位移 < 12px 才算轻点）
- 火焰消失，PointLight 在约 0.4s 内衰减到 0，页面暖光同步变冷，文案变成"愿望已经出发。"
- 2.8s 后自动复燃；也可以在黑暗里点"重新点亮"提前结束
- 复燃时亮度先冲到 1.6 倍再回落，像真的被重新点着；随后回到自转与原文案
- 全程只是 `lightScale` + 火焰 mesh 的显隐，**没有后处理、没有新增 draw call**，仍是 3 次

**音乐**：

- 不是 mp3，是 **Web Audio 现场合成**的音乐盒：C 大调五声音阶、7 秒循环、正弦 + 三角泛音、带一点房间延时
- 所以**不需要托管任何音频文件**，也没有版权与跨域问题；首次点击（读完信或首次触摸）后开始，符合浏览器自动播放策略
- 右上角按钮静音/恢复；页面隐藏时 `AudioContext.suspend()`，回来再 `resume()`
- 标题已去掉：页面上不再有"烛光体素蛋糕"大字，只保留一个 `sr-only` 的 `<h1>` 给屏幕阅读器，顶部完全留给场景

## 部署（GitHub Pages）

线上：**https://rustin-beep.github.io/voxel-cake/** · 每次 push 到 `main`，`.github/workflows/deploy.yml` 自动构建 `dist/` 并发布。

仓库需要先开启 Pages：**Settings → Pages → Source 选 GitHub Actions**，或者一条命令：

```bash
gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow
```

如果 workflow 在 `actions/configure-pages@v5` 这一步失败、`deploy` 显示 **skipped**（因为它 `needs: build`），
就是 Pages 还没开。开启后 `gh run rerun <run-id>` 重跑即可。
