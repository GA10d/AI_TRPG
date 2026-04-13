# AI TRPG 3.0 漫画生成工作流技术方案

本目录基于 `comics/make-comics-main` 的开源实现，拆解出一套适合 `version 3.0` 当前架构的漫画生成方案。

目标不是 1:1 复制外部站点的产品壳，而是复用它最有效的部分：

- 固定漫画页布局
- 画风可选
- 角色参考图
- 续页上下文
- 标题与简介补全

## 一、结论

`make-comics` 的核心方法可以迁移到当前项目中。

对 `AI TRPG 3.0` 来说，最适合的落地方式不是新起一套独立服务，而是在现有 `apps/server/src/image_generation/service.ts` 的基础上新增一层“漫画页生成 orchestration”。

当前项目已经具备这些基础能力：

- 统一图片模型路由
- 可配置 prompt 模板
- 角色描述文本注入
- 多 provider 支持

当前项目还缺这几项漫画特化能力：

- 角色参考图的真实图片输入，而不只是文字外观
- 漫画页级别的固定布局 prompt
- 多页连续性的上下文压缩与注入
- 漫画项目级数据结构：故事、页、参考角色、页间关系
- 标题/简介的文本生成辅助

## 二、推荐的接入方式

### 1. 新增一个漫画能力层，而不是直接改现有通用图片接口

建议保留现有 `/api/images/generate` 作为通用插画接口，再新增一条漫画专用链路，例如：

- `POST /api/comics/create`
- `POST /api/comics/:comicId/pages`
- `POST /api/comics/:comicId/pages/:pageId/redraw`
- `GET /api/comics/:comicId`
- `GET /api/comics/:comicId/export`

这样做的好处：

- 不会污染现在的 NPC 立绘和场景图生成逻辑
- 漫画页 prompt 可以独立演进
- 后续支持“单页插图”和“漫画连续页”两种产品形态

### 2. 服务层建议拆成四段

推荐的服务编排如下：

1. `comic_prompt_builder`
   负责把用户剧情、风格、角色图、前文上下文拼成最终图像 prompt。

2. `comic_context_service`
   负责压缩前几页剧情，只保留后续生成最需要的连续性信息。

3. `comic_generation_service`
   调用现有图片 provider，返回整页漫画图。

4. `comic_metadata_service`
   用文本模型补标题、简介、页摘要、角色短标签。

## 三、与当前 3.0 架构的对应关系

### 1. shared-types 需要补的字段

当前 `ImageGenerationRequest` 只有文本 prompt 和角色描述，不够漫画用。

建议新增一个漫画专用请求类型，而不是强行把所有字段都塞进通用图片请求：

```ts
type ComicCharacterReference = {
  id: string;
  name: string;
  appearance?: string;
  referenceImageUrl?: string;
};

type ComicPageInput = {
  comicId?: string;
  pageNumber?: number;
  storyPrompt: string;
  styleId: string;
  characterReferences?: ComicCharacterReference[];
  previousPages?: Array<{
    pageNumber: number;
    prompt: string;
    summary?: string;
    imageUrl?: string;
  }>;
  mode?: "new_story" | "add_page" | "redraw";
};
```

### 2. image_generation service 需要补的能力

当前 `apps/server/src/image_generation/service.ts` 默认只发文本。

要接近 `make-comics`，建议新增以下可选能力：

- `referenceImages?: string[]`
- `layoutHint?: "comic_5_panel"`
- `negativePrompt?: string`
- `temperature?: number`

如果底层 provider 支持图片参考输入，就直接传下去。
如果不支持，也要把参考图信息保留在上层服务，以便以后切到支持 reference image 的模型。

### 3. prompt 模板配置建议新增“漫画模板”

当前 `apps/prompt/image_generation/prompt_templates.json` 偏通用插画。

建议不要直接覆盖现有模板，而是新增漫画专用模板配置，例如：

- `comic_page_5_panel`
- `comic_page_manga`
- `comic_page_noir`
- `comic_page_vintage`

也可以先不改原文件，而是在漫画服务中读取本目录的漫画 prompt 资源再拼接。

## 四、推荐的数据流

### A. 新建漫画

1. 用户输入故事描述
2. 用户选择画风
3. 用户上传 0-2 张角色参考图
4. 服务上传参考图并保存角色引用
5. 文本模型生成标题与简介
6. prompt builder 生成第一页 prompt
7. 图片模型生成整页 5 格漫画
8. 保存 comic、page、character_reference、page_asset

### B. 续一页

1. 读取已有漫画页列表
2. 选取最近若干页的 prompt 或 summary
3. 取上一页成图作为视觉连续性参考
4. 用户选择继续沿用哪些角色图
5. prompt builder 拼接 continuity prompt
6. 图片模型生成下一页
7. 保存新页并更新索引

### C. 重绘当前页

1. 保留页号与故事关系
2. 使用同一页 prompt
3. 使用上一页成图和当前角色参考图
4. 重新生成并替换该页 image asset

## 五、推荐的最小 MVP

第一阶段不必一次做全，建议按下面顺序推进：

### MVP-1：单页整页漫画生成

- 输入故事 prompt
- 选择画风
- 上传最多 2 张角色参考图
- 生成 5 格整页漫画

### MVP-2：续页

- 保存每页原始 prompt
- 读取前几页 prompt 形成 continuation context
- 使用上一页成图作为视觉参考

### MVP-3：漫画书架与导出

- 漫画列表
- 页预览
- PDF 导出

## 六、对现有项目最重要的实现建议

### 1. 先把“参考图能力”做成抽象接口

这是最关键的差异点。

因为你们当前图片服务主要是文本驱动，而 `make-comics` 质量较高的重要原因之一，是它同时使用了：

- 文本 prompt
- 上一页图片
- 角色参考图

建议在 provider adapter 里预留：

```ts
type ImageReferenceInput = {
  url: string;
  kind: "character" | "previous_page";
};
```

### 2. continuity 不要直接塞全部历史

`make-comics` 的做法是把前几页 prompt 倒序塞入，并受长度上限约束。

在你们项目里，建议更进一步：

- 最近 2-4 页保留原始 prompt
- 更早的历史先用文本模型压缩成 story summary
- 最终只把“最近页 + 总体摘要”送进图片 prompt

这样更稳，也更省 token。

### 3. 标题与简介单独走文本模型

不要让图片模型顺带负责元数据。

建议继续沿用你们现在的文本模型网关来做：

- 漫画标题
- 漫画简介
- 每页一句话摘要
- 角色标签补全

## 七、为什么这套方案适合 AI TRPG 3.0

因为你们本质上已经有“叙事状态”和“图像生成底座”。

最顺的产品路径不是做一个完全独立的漫画网站，而是把漫画生成视为 TRPG 会话内容的一个衍生输出层：

- 开场生成角色漫画立绘
- 关键剧情节点生成整页漫画
- 结局后导出“本次跑团漫画摘要”

这样能直接复用你们已有的：

- 角色概念生成
- 会话上下文
- 规则包/剧本包
- 图片模型配置体系

## 八、建议的文件落点

如果后续真要实现，推荐新增这些模块：

- `apps/server/src/comic_generation/service.ts`
- `apps/server/src/comic_generation/prompt_builder.ts`
- `apps/server/src/comic_generation/context.ts`
- `apps/server/src/comic_generation/storage.ts`
- `apps/prompt/comic_generation_workflow/`

## 九、这里已经摘出的 prompt 资源

本目录包含以下可直接参考或改写的资源：

- `page_generation_system_prompt.txt`
- `continuation_context_template.txt`
- `character_reference_rules.txt`
- `title_description_prompt.txt`
- `style_presets.json`
- `workflow_summary.md`

这些内容都来自 `make-comics` 的公开实现，但已经重新整理成适合当前项目接入的结构。
