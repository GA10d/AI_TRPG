# make-comics 工作流拆解

## 1. 输入层

- 用户主故事 prompt
- 画风选择
- 0 到 2 张角色参考图
- 续页时的前文页信息

## 2. prompt 组织层

最终图像 prompt 由以下几部分组成：

- 漫画页系统规则
- 固定 5 格布局说明
- 画风描述
- 角色参考规则
- 续页上下文
- 用户当前页故事 prompt

## 3. 模型调用层

`make-comics` 的原始实现会：

- 用文本模型生成标题和简介
- 用图片模型一次生成整页漫画
- 把角色图和上一页图作为 `reference_images`

## 4. 对 AI TRPG 3.0 的推荐替代

文本模型：

- 继续走现有 narrator / text gateway 体系
- 专门加一个 comic metadata 入口

图片模型：

- 先复用现有 `image_generation/service.ts`
- 后续补 reference image adapter

## 5. 当前项目应该先做什么

第一优先级：

- 漫画页 prompt builder
- 画风预设
- 角色参考图字段

第二优先级：

- 漫画页数据结构
- 续页上下文压缩
- 重绘

第三优先级：

- 漫画书架
- PDF 导出
- 从 TRPG 会话自动生成漫画摘要
