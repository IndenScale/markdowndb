# Code Block 处理流程

## 概述

Code Block 处理遵循**提取-占位-独立存储**原则，确保：

1. Markdown 内容的可读性不被大段代码污染
2. 代码块可作为独立字段查询和操作
3. 原始 Markdown 结构可逆

## 处理流程

```
原始 Markdown
    ↓
提取 Code Block → 计算 hash → 生成占位符
    ↓
替换为占位符的 Markdown
    ↓
标准 AST 解析（remark/unified）
    ↓
生成对象结构
```

## 详细步骤

### 步骤 1：提取

扫描 Markdown 文本，定位所有代码块：

````markdown
## 正文

这是正文。

```typescript
const x = 1;
```
````

继续正文。

````

### 步骤 2：计算 Hash

对代码内容计算 SHA-256，取前 6 位：

```typescript
const hash = crypto
  .createHash('sha256')
  .update(code)
  .digest('hex')
  .slice(0, 6);  // "a1b2c3"
````

### 步骤 3：生成占位符

格式：`{{CODE_BLOCK:{language}-{hash}}}`

```typescript
// 示例
"{{CODE_BLOCK:typescript-a1b2c3}}";
```

### 步骤 4：替换与存储

替换后的内容：

```markdown
## 正文

这是正文。

{{CODE_BLOCK:typescript-a1b2c3}}

继续正文。
```

存储的独立字段：

```typescript
{
  "content-## 正文-typescript-a1b2c3": {
    "language": "typescript",
    "code": "const x = 1;"
  }
}
```

### 步骤 5：AST 解析

此时 Markdown 已不含代码块语法，标准 AST 解析器可正确处理。

## 边界情况

### 无语言标识符

```markdown

```

plain text

```

```

处理为 `{{CODE_BLOCK:text-{hash}}}`，语言默认为 `text`。

### 多个代码块

同一 heading 下的多个代码块各自独立提取：

````markdown
## 示例

```shell
npm install
```
````

```typescript
console.log("hello");
```

`````

生成：
- `{{CODE_BLOCK:shell-d4e5f6}}`
- `{{CODE_BLOCK:typescript-a1b2c3}}`

### 嵌套代码块

使用不同数量的反引号避免冲突：

````markdown
## 配置

```markdown
示例代码块：
```typescript
const x = 1;
`````

```

```

外层使用 4 个反引号，内层代码块正常提取。

## 可逆性

从对象结构可完整还原原始 Markdown：

````typescript
function restoreMarkdown(record: Record): string {
  let content = record["content-## 正文"];

  // 替换所有占位符
  content = content.replace(/{{CODE_BLOCK:(\w+)-([a-f0-9]+)}}/g, (match, lang, hash) => {
    const key = `content-## 正文-${lang}-${hash}`;
    const block = record[key];
    return "```" + block.language + "\n" + block.code + "\n```";
  });

  return content;
}
````

## 性能考虑

- Hash 计算是 CPU 密集型操作，但代码块通常较小
- 可缓存已计算的 hash 避免重复计算
- 提取阶段使用正则而非 AST，避免双重解析开销
