# MarkdownDB Specification

## 目录结构

MarkdownDB 将文件系统映射为层级数据库结构：

```text
{database_root}/              ← 数据库 (Database)
├── .mddb/                   ← 数据库元数据目录
│   └── config.json         ← 数据库配置（版本、ID 等）
├── schema.json              ← 数据库级 Schema（全局策略）
├── {table_name}/            ← 表 (Table)
│   ├── schema.json         ← 表级 Schema（必需）
│   └── {record_name}.md    ← 记录 (Record)
└── ...
```

### 命名规则

- **Database Root**: 任意目录名，包含 `.mddb/` 子目录标识这是一个 MarkdownDB 实例
- **Table Name**: 目录名，作为表标识符
- **Record Name**: 文件名（不含 `.md` 后缀），作为记录主键

## Schema 层级

### 数据库级 Schema（全局策略）

数据库根目录的 `schema.json` 定义**所有表必须包含的全局字段**。这是一个强制策略而非可继承模板。

```json
{
  "fields": {
    "title": { "type": "string", "required": true },
    "created_at": { "type": "datetime", "required": true },
    "updated_at": { "type": "datetime", "required": true }
  }
}
```

### 表级 Schema（必需）

每个表目录必须包含 `schema.json`，且**必须显式重复声明数据库级 Schema 中的所有字段**。

```json
{
  "name": "blog",
  "fields": {
    "title": { "type": "string", "required": true },
    "created_at": { "type": "datetime", "required": true },
    "updated_at": { "type": "datetime", "required": true },
    "published_at": { "type": "datetime" },
    "author": { "type": "reference", "table": "authors" },
    "content-## 摘要": { "type": "markdown" }
  }
}
```

### 验证规则

启动时，系统执行以下验证：

1. 读取数据库级 `schema.json` 得到「强制字段集合」
2. 检查每个表级 `schema.json` 的 `fields` 对象
3. 确认表级字段包含强制字段集合的**完整超集**（字段名和类型必须一致）
4. 任一表缺失全局字段 → **启动失败**

**错误示例**：

```text
Error: Table 'blog' validation failed
  Missing required global field: 'updated_at'
  Location: my-content/blog/schema.json
```

## Schema 定义

### schema.json 结构

表级 `schema.json` 必须包含 `name` 和 `fields`，其中 `fields` 必须包含数据库级 Schema 定义的所有全局字段。

```json
{
  "name": "blog",
  "fields": {
    "title": { "type": "string", "required": true },
    "created_at": { "type": "datetime", "required": true },
    "updated_at": { "type": "datetime", "required": true },
    "published_at": {
      "type": "datetime"
    },
    "author": {
      "type": "reference",
      "table": "authors"
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    },
    "content-## 摘要": {
      "type": "markdown"
    }
  }
}
```

### 字段类型

| 类型        | 描述              | 示例值                              |
| ----------- | ----------------- | ----------------------------------- |
| `string`    | 字符串            | `"Hello"`                           |
| `number`    | 数字              | `42`                                |
| `boolean`   | 布尔              | `true`                              |
| `datetime`  | ISO 8601 日期时间 | `"2026-03-01T00:00:00Z"`            |
| `array`     | 数组              | `["a", "b"]`                        |
| `object`    | 对象              | `{"key": "value"}`                  |
| `reference` | 外键引用          | `"john-doe"`（指向其他表记录）      |
| `markdown`  | Markdown 内容     | `"**bold** text"`                   |
| `code`      | 代码块            | `{"language": "ts", "code": "..."}` |
| `wiki_link` | Wiki Link 引用    | `"authors/john-doe"`                |

## Markdown → Object 映射规则

### 1. Frontmatter 映射

YAML frontmatter 直接映射为记录字段：

```markdown
---
title: "Hello"
count: 42
nested:
  key: value
---

## 信息

元数据示例。
```

```typescript
{
  "title": "Hello",
  "count": 42,
  "nested": { "key": "value" },
  "content-## 信息": "元数据示例。"
}
```

### 2. Heading 映射

每个 heading 及其后续内容映射为 `content-## {heading}` 字段：

```markdown
## 摘要

摘要内容。

## 正文

正文内容。
```

```typescript
{
  "content-## 摘要": "摘要内容。",
  "content-## 正文": "正文内容。"
}
```

#### 内容范围

- 从当前 heading 开始（不包含 heading 本身）
- 到下一个同级或更高级别 heading 之前结束
- 包含所有嵌套子 heading 及其内容（作为该字段的一部分）

### 3. Code Block 提取

代码块从 heading 内容中提取为独立字段，在原位留下占位符。

#### 占位符格式

```text
{{CODE_BLOCK:{language}-{hash}}}
```

- `language`: 代码块语言标识符
- `hash`: 代码内容的前 6 位 SHA-256 哈希

#### 字段命名

提取的代码块存储为：

```text
content-## {heading}-{language}-{hash}
```

#### 示例

````markdown
## 正文

这是正文。

```typescript
const x = 1;
```

继续正文。

```typescript
{
  "content-## 正文": "这是正文。\n\n{{CODE_BLOCK:typescript-a1b2c3}}\n\n继续正文。",
  "content-## 正文-typescript-a1b2c3": {
    "language": "typescript",
    "code": "const x = 1;"
  }
}
```
````

#### 多个代码块

同一 heading 下的多个代码块各自独立提取：

````markdown
## 示例

```shell
npm install
```

```typescript
console.log("hello");
```
````

```typescript
{
  "content-## 示例": "{{CODE_BLOCK:shell-d4e5f6}}\n\n{{CODE_BLOCK:typescript-a1b2c3}}",
  "content-## 示例-shell-d4e5f6": {
    "language": "shell",
    "code": "npm install"
  },
  "content-## 示例-typescript-a1b2c3": {
    "language": "typescript",
    "code": "console.log(\"hello\");"
  }
}
```

### 4. 无语言标识符的代码块

语言标识符缺失时，使用 `text` 作为默认值：

````markdown
## 配置

```
plain text
```
````

```typescript
{
  "content-## 配置": "{{CODE_BLOCK:text-7g8h9i}}",
  "content-## 配置-text-7g8h9i": {
    "language": "text",
    "code": "plain text"
  }
}
```

### 5. Wiki Link 引用

支持 Wiki Link 语法建立记录间引用关系。

#### 语法格式

```markdown
[[id]]                    ← 同表引用
table/id]]               ← 跨表引用
[[table/id|显示文本]]     ← 带显示文本
```

#### 映射规则

Wiki Link 在内容中替换为占位符，同时提取为关系字段：

````markdown
## 正文

请看[[authors/john-doe|作者介绍]]了解更多。
````

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

#### 占位符格式

```text
{{WIKI_LINK:table/id|label}}
```

- `table`: 目标表名（省略时默认为当前表）
- `id`: 目标记录 title（主键）
- `label`: 显示文本（可选，默认为 id）

#### 与 reference 类型的关系

Wiki Link 与 frontmatter 中的 `reference` 类型**语义等价**，都是建立记录间关系：

```markdown
---
title: "hello-world"
author: "john-doe"           ← reference 类型：外键关系
---

## 正文

详情见[[authors/john-doe|作者]]。
```

- `reference` 类型：在 schema 层声明的结构化关系
- Wiki Link：在内容层建立的上下文关系

#### 死链检测

验证时检查所有 Wiki Link 目标是否存在：

```text
Error: Wiki Link validation failed in 'blog/hello-world.md'
  Broken link: [[authors/non-existent]]
  Target table: authors
  Target id: non-existent
```

死链会导致**验证失败**，必须在修复后才能写入或查询。

#### 循环引用

Wiki Link 允许循环引用（A → B → A），查询时由调用方处理循环。

## 约束与限制

### 1. 必须有标题

无 heading 的 Markdown 文件**拒绝映射**。以下文件无效：

```markdown
---
title: "Invalid"
---

没有 heading 的内容。
```

### 2. title 作为主键

`title` 字段是记录的**主键**，具有以下约束：

#### 2.1 文件名与 title 一致

记录的文件名（不含 `.md` 后缀）**必须**与 front matter 中的 `title` 字段完全一致。

**示例**：

- 文件 `hello-world.md` ↔ `title: "hello-world"`
- 文件 `2024年度报告.md` ↔ `title: "2024年度报告"`（允许中文）

**验证失败示例**：

```markdown
---
title: "Hello World"
---

## 内容

...
```

文件名 `hello-world.md` 但 `title: "Hello World"` → **验证失败**

#### 2.2 禁止 id 字段

Schema 中**不允许**定义 `id` 字段，避免与 `title` 主键混淆。

#### 2.3 表内唯一

同一表内所有记录的 `title` 必须**唯一**。重复 title → **写入失败**。

### 3. title 与一级标题互斥

如果 front matter 中包含 `title` 字段，则 Markdown 内容中**不允许出现一级标题**（`#`）。

**原因**：title 是主键（文档标识），一级标题会造成语义重复。

**无效示例**：

```markdown
---
title: "hello-world"
---

# Hello World

## 内容

...
```

**有效示例**：

```markdown
---
title: "hello-world"
---

## 摘要

...

## 正文

...
```

### 9. 重复 Heading

同一文件内重复的 heading 文本，后续字段名添加内容 hash 后缀（前 6 位 SHA-256）：

```markdown
## 示例

第一段。

## 示例

第二段。
```

```typescript
{
  "content-## 示例": "第一段。",
  "content-## 示例-a1b2c3": "第二段。"
}
```

### 7. 特殊字符处理

Heading 文本中的特殊字符保留原样作为字段名的一部分：

```markdown
## API / Auth

内容。
```

```typescript
{
  "content-## API / Auth": "内容。"
}
```

### 8. 嵌套 Heading

嵌套 heading 作为父 heading 内容的一部分，不单独提取：

```markdown
## 正文

正文开头。

### 子章节

子章节内容。
```

```typescript
{
  "content-## 正文": "正文开头。\n\n### 子章节\n\n子章节内容。"
}
```

## AST 处理

MarkdownDB 使用成熟的 Markdown AST 库（如 `remark` / `unified`）处理解析，确保正确处理：

- 嵌套列表
- 表格
- HTML 内嵌
- 转义字符
- 链接引用定义
- 脚注

## 版本

当前规范版本：**0.1.0**
