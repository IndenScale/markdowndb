# Wiki Link 处理流程

## 概述

Wiki Link 采用**预处理-占位-结构化存储**策略，避免定制 AST 解析器，同时保持与标准 Markdown 的兼容性。

## 设计决策

### 为什么不直接扩展 AST？

| 方案                     | 优点                 | 缺点                             |
| ------------------------ | -------------------- | -------------------------------- |
| **定制 AST 节点**        | 语义清晰             | 需自定义 remark 插件，增加复杂度 |
| **Preprocessor（采用）** | 兼容标准 AST，零依赖 | 占位符需二次处理                 |

我们选择 Preprocessor 方案，因为它：

1. 不依赖特定 AST 库版本
2. 可与其他 Markdown 工具链共存
3. 实现简单，易于测试

## 处理流程

```text
原始 Markdown
    ↓
提取 Wiki Link → 解析目标 → 生成占位符
    ↓
替换为占位符的 Markdown
    ↓
标准 AST 解析（remark/unified）
    ↓
生成对象结构（含 wiki_links 数组）
```

## 详细步骤

### 步骤 1：提取与解析

使用正则匹配 Wiki Link：

```typescript
const WIKI_LINK_REGEX = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;

// 匹配示例
// [[john-doe]]        → target: "john-doe", label: undefined
// [[authors/john-doe]] → target: "authors/john-doe", label: undefined
// [[authors/john-doe|作者]] → target: "authors/john-doe", label: "作者"
```

### 步骤 2：解析目标

```typescript
function parseTarget(
  target: string,
  currentTable: string
): {
  table: string;
  id: string;
} {
  if (target.includes("/")) {
    const [table, id] = target.split("/");
    return { table, id };
  }
  return { table: currentTable, id: target };
}
```

### 步骤 3：生成占位符

格式：`{{WIKI_LINK:{table}/{id}|{label}}}`

```typescript
// 示例
// [[authors/john-doe|作者介绍]]
// → {{WIKI_LINK:authors/john-doe|作者介绍}}
```

### 步骤 4：替换与存储

原始 Markdown：

```markdown
## 正文

请看[[authors/john-doe|作者介绍]]了解更多。
```

替换后：

```markdown
## 正文

请看{{WIKI_LINK:authors/john-doe|作者介绍}}了解更多。
```

生成的对象结构：

```typescript
{
  "content-## 正文": "请看{{WIKI_LINK:authors/john-doe|作者介绍}}了解更多。",
  "wiki_links": [
    {
      "target": "authors/john-doe",
      "table": "authors",
      "id": "john-doe",
      "label": "作者介绍"
    }
  ]
}
```

## 与 Reference 类型的关系

Wiki Link 和 frontmatter 中的 `reference` 类型语义等价：

```markdown
---
title: "hello-world"
author: "john-doe"           ← reference 类型
---

## 正文

详情见[[authors/john-doe|作者]]。 ← Wiki Link
```

| 维度 | Reference   | Wiki Link  |
| ---- | ----------- | ---------- |
| 位置 | frontmatter | content    |
| 用途 | 结构化关系  | 上下文引用 |
| 验证 | Schema 验证 | 死链检测   |

## 死链检测

验证时检查所有 Wiki Link 目标是否存在：

```typescript
async function validateWikiLinks(record: Record, db: MarkdownDatabase): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  for (const link of record.wiki_links) {
    const exists = await db.table(link.table).exists(link.id);
    if (!exists) {
      errors.push({
        type: "BROKEN_WIKI_LINK",
        message: `Target not found: ${link.target}`,
        location: `content-${heading}`,
      });
    }
  }

  return errors;
}
```

死链导致验证失败，必须在修复后才能写入。

## 循环引用

Wiki Link 允许循环引用（A → B → A）：

```markdown
<!-- A.md -->

## 参见

[[B]]

<!-- B.md -->

## 参见

[[A]]
```

循环引用在查询时由调用方处理，系统不做限制。

## 渲染

API 返回时，占位符替换为实际链接：

```typescript
function renderWikiLinks(content: string, linkResolver: (link: WikiLink) => string): string {
  return content.replace(/{{WIKI_LINK:([^|}]+)(?:\|([^}]+))?}}/g, (match, target, label) => {
    return linkResolver({ target, label });
  });
}

// 使用示例
renderWikiLinks(content, (link) => {
  return `<a href="/api/${link.target}">${link.label || link.target}</a>`;
});
```

## 与 Code Block 的协调

当 Wiki Link 出现在代码块内时，不应被处理：

````markdown
## 示例

```markdown
这是Wiki Link语法：[[id]]
```
````

**处理顺序至关重要**：

1. 先提取 Code Block（保留原始内容，包括 `[[...]]`）
2. 再提取 Wiki Link（此时代码块已变为占位符，不受影响）
3. 最后 AST 解析

## 性能考虑

- Wiki Link 提取使用单个正则扫描，O(n) 复杂度
- 死链检测需要数据库查询，可批量优化
- 占位符格式固定，渲染时快速替换
