# MarkdownDB

将 Markdown 文件系统作为 Schema 驱动的数据库使用。

## 问题

### 现有方案将 Markdown 与前端组件绑定

| 方案 | 绑定对象 | 后果 |
|------|----------|------|
| Next.js / Astro | React / Vue / Svelte 组件 | 构建时编译，运行时无法查询 |
| Notion CMS | 专有 Block 模型 | 平台锁定，导出即丢失结构 |
| Sanity / Strapi | 自定义内容模型 | 内容不在 Git，协作流程失效 |

**共同缺陷**：它们都将 Markdown 视为「渲染的原材料」，而非「可查询的数据记录」。

## 提案

将文件系统重新想象为 **Schema 驱动的数据库**：

```text
my-content/                    ← 数据库 (Database)
├── .mddb/                   ← 数据库元数据目录
│   └── config.json         ← 数据库配置（版本、ID 等）
├── schema.json              ← 数据库级 Schema（全局策略）
├── blog/                     ← 表 (Table: blog)
│   ├── schema.json          ← 表级 Schema（必须包含全局字段）
│   ├── hello-world.md       ← 记录 (Record)
│   └── another-post.md
└── authors/                  ← 表 (Table: authors)
    ├── schema.json
    └── john-doe.md
```

### 核心映射规则

每个 Markdown 文件映射为一条**类型安全的记录**：

```markdown
---
title: "Hello World"
published_at: "2026-03-01"
author: "john-doe"
tags: ["intro", "announcement"]
---

## 摘要

这是文章的摘要内容。

## 正文

主要文章内容在这里。

```typescript
const example = "code block";
```text
```

转换为：

```typescript
{
  // frontmatter → 顶级字段
  "title": "Hello World",
  "published_at": "2026-03-01T00:00:00.000Z",
  "author": "john-doe",
  "tags": ["intro", "announcement"],
  
  // heading → "content-{heading}" 字段
  "content-## 摘要": "这是文章的摘要内容。",
  "content-## 正文": "主要文章内容在这里。\n\n{{CODE_BLOCK:typescript-a1b2c3}}",
  
  // code block 提取为独立字段
  "content-## 正文-typescript-a1b2c3": {
    "language": "typescript",
    "code": "const example = \"code block\";"
  }
}
```

### 关键约束

- **必须有标题**：无 heading 的 Markdown 文件拒绝映射（防止数据丢失）
- **Schema 驱动**：每个表通过 `schema.json` 定义字段类型和验证规则
- **AST 处理**：使用成熟的 Markdown AST 库处理边缘情况

## 安装

```bash
bun install markdowndb
```

## 使用方法

```typescript
import { MarkdownDatabase } from 'markdowndb';

const db = new MarkdownDatabase('./my-content');

// 查询表
const posts = await db.table('blog').findMany({
  where: { published_at: { gte: '2026-01-01' } },
  orderBy: { published_at: 'desc' }
});

// 单条记录
const post = await db.table('blog').findOne('hello-world');
console.log(post['content-## 摘要']);
```

## 规范

详细语法规范请参阅 [SPEC.md](./SPEC.md)。

## 许可证

MIT License - see [LICENSE](LICENSE) for details.
