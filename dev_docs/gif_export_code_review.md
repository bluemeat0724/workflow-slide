# GIF 导出功能代码审查与优化建议

> 审查范围：`app/server/render/` 全部新增文件 + 关联修改文件（16 个文件，+2082/-1448 行）
> 审查日期：2026-05-04
> Lint 状态：通过（`npm run lint` 无报错）

---

## 一、模块概览

### 1.1 新增文件

| 文件 | 行数 | 职责 |
|---|---|---|
| `app/server/render/presentationProfile.mjs` | 50 | 演示态视觉参数常量（尺寸/动画/线条/节点/字体） |
| `app/server/render/exportTemplate.mjs` | 347 | 服务端演示态 HTML 生成器 |
| `app/server/render/browserFrameCapture.mjs` | 84 | Playwright headless Chromium 逐帧截图 |
| `app/server/render/gifEncoder.mjs` | 73 | GIF 编码（全局调色板 + ordered dithering） |
| `app/server/render/gifExporter.mjs` | 35 | 导出编排入口，兼容新旧两种请求格式 |
| `app/server/render/gifExporterLegacy.mjs` | 441 | 旧版 canvas 手写渲染器（向后兼容保留） |

### 1.2 修改文件

| 文件 | 修改量 | 要点 |
|---|---|---|
| `app/server/index.mjs` | +27 | 新增 `POST /api/gif` 路由 |
| `app/src/App.tsx` | +27 | 新增 `handleExportGif` + 状态管理 |
| `app/src/api/client.ts` | +19 | 新增 `exportGif()` 方法 |
| `app/src/api/contracts.ts` | +10 | 新增 `ExportGifRequest` 类型 |
| `app/src/components/toolbar/Toolbar.tsx` | +11 | 新增 "导出 GIF" 按钮 |
| `app/src/utils/exportHtml.ts` | +286/-100 | CSS 按 profile 分离重构 |
| `app/src/i18n/en-US.ts / zh-CN.ts / index.ts` | +9 | i18n 字符串补充 |
| `app/package.json` | +4 dep | 新增 `@napi-rs/canvas`、`gifenc`、`playwright` |
| `README.md` | +15 | 补充 GIF 导出说明和依赖要求 |
| `dev_docs/dev.log` | +46 | 开发日志 |

---

## 二、发现的问题与优化建议

### 🔴 问题 1：`exportHtml.ts` 中存在死代码（中等）

**位置：** [exportHtml.ts#L25-L201](file:///Users/g-air/projects/workflow-slide/app/src/utils/exportHtml.ts#L25-L201) [exportHtml.ts#L445-L446](file:///Users/g-air/projects/workflow-slide/app/src/utils/exportHtml.ts#L445-L446)

**描述：** 前端 `exportHtml.ts` 在重构时新增了 `buildPresentationCss()`、`ExportProfile` 类型和 `generatePresentationHtml()` 导出。但经全局搜索确认：

- `generatePresentationHtml` **仅在 `exportHtml.ts` 内部定义，从未被任何模块 import**
- 服务端渲染链路使用的是 `app/server/render/exportTemplate.mjs` 中的独立实现
- `buildPresentationCss` 仅在内部的 `generateHtml()` 中通过 presentation-gif 分支调用

这些代码（约 180 行 CSS + 逻辑）不会被打包进入任何运行路径，构成死代码。

**建议：**
- 方案 A（推荐）：删除 `buildPresentationCss()`、`ExportProfile` 类型和 `generatePresentationHtml()`，将 `generateHtml()` 简化为仅支持 `standalone-html` 单一 profile
- 方案 B：如果未来计划前端也需要生成 presentation HTML，保留但加上 `// @unused - reserved for future client-side GIF preview` 注释

---

### 🔴 问题 2：`exportTemplate.mjs` 跨模块依赖前端 TypeScript 源码（中等）

**位置：** [exportTemplate.mjs#L1](file:///Users/g-air/projects/workflow-slide/app/server/render/exportTemplate.mjs#L1)

```js
import { BOARD_WIDTH, BOARD_HEIGHT } from '../../src/model/diagram.ts'
```

**描述：** 后端 `.mjs` 文件直接 import 前端 TypeScript 源文件（`.ts` 扩展名）。这在当前 Node.js + Vite 开发环境下恰好可用（Vite 会 on-the-fly 转译），但存在以下风险：

- **生产部署脆弱**：`npm run build` 后 `.ts` 源文件不在 `dist/` 中，服务端直接引用将失败
- **不符合分层原则**：渲染模块属于基础设施层，不应依赖业务领域模型文件
- **如果 `diagram.ts` 移除了这些常量，服务端渲染也会崩溃**，且不易被前端构建过程发现

**建议：**
- 将 `BOARD_WIDTH`、`BOARD_HEIGHT` 提取到 `app/server/render/presentationProfile.mjs` 的 `SIZE_PRESETS` 中（该文件已有 `standard: { width: 1600, height: 900 }`）
- 让 `exportTemplate.mjs` 改为从 `./presentationProfile.mjs` 导入

---

### 🔴 问题 3：`gifExporterLegacy.mjs` 与 `exportTemplate.mjs` 存在大量重复代码（中等）

**描述：** 两个文件各自实现了以下功能完全相同的函数：

| 函数 | 在 `exportTemplate.mjs` | 在 `gifExporterLegacy.mjs` |
|---|---|---|
| `hexToRgb()` | ✅ | ✅ |
| `withAlpha()` | ✅ | ✅ |
| `percentXToCanvas()` | ✅ | ✅ |
| `percentYToCanvas()` | ✅ | ✅ |
| `getLaneBounds()` | ✅ | ✅ |
| `getNodeSidePoint()` | ✅ | ✅ |
| `buildEdgePath()` | ✅（返回 SVG path 字符串） | ✅（返回坐标对象，不同签名） |
| `roundRect()` | ❌ | ✅ |
| `drawArrowHead()` | ❌ | ✅ |

此外，`getLaneBounds()` 在前端 `app/src/utils/geometry.ts` 中还有第三份实现。

**建议：**
- 提取公共工具函数到 `app/server/render/utils.mjs`
- `buildEdgePath` 可以用单一实现返回坐标对象，HTML 模板侧再拼成 SVG `d` 字符串
- 评估是否可以逐步废弃 `gifExporterLegacy.mjs`（服务端已有 Playwright 方案，旧 Canvas 方案是否仍有保留必要？）

---

### 🟡 问题 4：`exportTemplate.mjs` 中 CSS 常量硬编码（低）

**位置：** [exportTemplate.mjs#L142-L220](file:///Users/g-air/projects/workflow-slide/app/server/render/exportTemplate.mjs#L142-L220)

**描述：** `exportTemplate.mjs` 生成的 CSS 中大量数值硬编码为字符串字面量，未引用 `presentationProfile.mjs` 中的同名常量：

```js
// exportTemplate.mjs 硬编码
`inset: 20px;
border-radius: 28px;
box-shadow: 0 24px 48px rgba(11,11,15,.08);`

// presentationProfile.mjs 已有对应常量
export const BOARD = { inset: 20, borderRadius: 28 }
```

类似的还有 `LANE.insetLeft`、`LANE.insetRight`、`LANE.borderRadius`、`NODE.*`、`ANIMATION.*` 等都已有常量定义但未被引用。

**建议：** 在 CSS 模板字符串中统一使用 `${BOARD.inset}`、`${BOARD.borderRadius}` 等常量引用，避免 CSS 视觉参数与 profile 配置偏离。

---

### 🟡 问题 5：`gifExporter.mjs` 返回类型不一致（低）

**位置：** [gifExporter.mjs#L17-L27](file:///Users/g-air/projects/workflow-slide/app/server/render/gifExporter.mjs#L17-L27) 和 [index.mjs#L390](file:///Users/g-air/projects/workflow-slide/app/server/index.mjs#L390)

**描述：**
- 新版 `generateDiagramGif()` 返回 `{ buffer, width, height, frameCount }`
- 旧版 `generateDiagramGifLegacy()` 返回 `Buffer` 直接
- `server/index.mjs` 用 `Buffer.isBuffer(result) ? result : result.buffer` 兼容

这种双重返回类型增加了理解成本，且容易在后续修改中引入 bug。

**建议：** 将 legacy 函数的返回值也统一包装为 `{ buffer, width, height, frameCount }` 格式，消除调用方的 `Buffer.isBuffer` 判断。

---

### 🟡 问题 6：`/api/gif` 端点缺少入参校验（低）

**位置：** [index.mjs#L375-L403](file:///Users/g-air/projects/workflow-slide/app/server/index.mjs#L375-L403)

**描述：** 新版请求要求 `body.diagram` 不为空，但 `gifExporter.mjs` 中的校验仅判断 `!diagram` 后抛出 `'Missing required field: diagram'`。对 `diagram` 内部结构（如 `nodes`、`lanes`、`theme` 等）不做校验，格式错误的结果会在渲染链路深层（如 `captureFrames` → `generatePresentationHtml` → `diagram.nodes.map()`）才炸开。

**建议：** 在 `gifExporter.mjs` 入口增加基本 schema 校验（至少确认 `diagram.nodes`、`diagram.lanes`、`diagram.theme` 存在），提前返回清晰的 400 错误。

---

### 🟢 问题 7：`browserFrameCapture.mjs` 清理代码吞错误（提示）

**位置：** [browserFrameCapture.mjs#L68-L76](file:///Users/g-air/projects/workflow-slide/app/server/render/browserFrameCapture.mjs#L68-L76)

```js
} finally {
  if (page) {
    await page.close().catch(() => {})
  }
  if (context) {
    await context.close().catch(() => {})
  }
  await releaseBrowser().catch(() => {})
}
```

**描述：** 三个 `.catch(() => {})` 静默丢弃了清理阶段的异常。虽然这是常见的防御性写法（避免清理失败遮蔽业务错误），但建议在开发阶段至少 `console.warn` 这些异常，方便排查资源泄漏问题。

---

### 🟢 问题 8：`exportHtml.ts` CSS 与 `presentationProfile.mjs` 不同步（提示）

**位置：** [exportHtml.ts#L25-L201](file:///Users/g-air/projects/workflow-slide/app/src/utils/exportHtml.ts#L25-L201)

**描述：** `exportHtml.ts` 的 `buildPresentationCss()` 中硬编码了字体族字符串（如 `"Iowan Old Style", "Baskerville", "Songti SC", Georgia, serif`），而 `presentationProfile.mjs` 的 `FONT_FAMILY` 对象已统一定义了所有字体族。如果将来调整字体配置，两处需要同时修改。

> 注意：此问题目前不影响运行，因为 `exportHtml.ts` 中的 presentation CSS 是死代码（见问题 1）。如果按问题 1 方案 A 删除，则此问题自然消失。

---

## 三、架构观察

### 3.1 新版 GIF 渲染链路（`gifExporter.mjs` → `browserFrameCapture.mjs` → `exportTemplate.mjs`）

```
请求 Diagram JSON
  → generateDiagramGif()
    → captureFrames(diagram, { size })
      → generatePresentationHtml(diagram)     // exportTemplate.mjs
      → page.setContent(html)
      → for i=0..totalFrames:
          page.evaluate(set --dash-offset)
          page.screenshot(png)
      → return { frames[], ... }
    → encodeGif(frames)
      → decodePngToRgba (每帧)
      → buildGlobalPalette (跨帧采样)
      → GIFEncoder + applyPalette (ordered dithering)
      → return Buffer
  → 返回 image/gif
```

链路设计清晰，职责分离合理。Playwright 截图方案比旧 Canvas 方案显著提升了视觉质量（真实字体渲染、CSS 渐变、阴影）。

### 3.2 旧版兼容链路

```
isLegacyRequest(body) 为 true 时：
  → dynamic import('./gifExporterLegacy.mjs')
    → renderFrame × TOTAL_FRAMES (Canvas 2D 手绘)
    → quantize + GIFEncoder (Floyd-Steinberg dithering)
    → return Buffer
```

旧版保留向后兼容，通过 `isLegacyRequest` 检测请求格式切换路径。旧版使用 Floyd-Steinberg 抖动（逐帧独立量化），新版使用 ordered dithering（全局调色板），后者在帧间颜色一致性上更优。

---

## 四、优化优先级建议

| 优先级 | 问题 | 预估工时 | 操作 |
|---|---|---|---|
| P0 高 | 问题 2：跨模块依赖前端 TS 源码 | 0.5h | 将常数移至 presentationProfile.mjs |
| P1 中 | 问题 1：前端 presentation 死代码 | 0.5h | 删除或加注释保留 |
| P1 中 | 问题 3：工具函数三处重复 | 1h | 提取共享 utils.mjs |
| P2 低 | 问题 4：CSS 常量统一 | 0.5h | 引用 presentationProfile 常量 |
| P2 低 | 问题 5：返回值统一 | 0.5h | 统一返回 `{ buffer, width, height, frameCount }` |
| P3 提示 | 问题 6/7/8 | — | 可在后续迭代中逐步改进 |

---

## 五、正面评价

1. **渲染质量提升显著**：从 Canvas 手绘迁移到 Playwright + HTML/CSS 渲染，视觉效果（字体渲染、渐变、阴影）有质的飞跃
2. **全局调色板方案优秀**：`buildGlobalPalette` 跨所有帧采样 50000 像素构建统一 256 色调色板，配合 ordered dithering 消除了旧版 Floyd-Steinberg 逐帧独立量化导致的帧间颜色漂移
3. **向后兼容设计到位**：`isLegacyRequest()` 检测和 dynamic import 避免了旧客户端调用失败
4. **资源管理规范**：`browserFrameCapture.mjs` 的引用计数式浏览器实例管理避免了频繁启动 Chromium 的性能开销
5. **i18n 覆盖完整**：中英文状态提示和按钮文案均已补充
6. **Lint 全部通过**：`npm run lint` 无报错
7. **错误信息友好**：Chromium 启动失败时包装为明确错误返回给前端，而非只表现为长时间等待
