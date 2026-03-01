# MarkdownDB 设计文档

本目录包含 MarkdownDB 的详细设计文档，说明核心概念、处理流程和实现细节。

## 文档列表

| 文档 | 内容 |
|------|------|
| [code-block-processing.md](./code-block-processing.md) | Code Block 的提取、hash 计算、占位符替换流程 |
| [wiki-link-processing.md](./wiki-link-processing.md) | Wiki Link 的预处理、死链检测、与 Reference 类型的关系 |

## 设计原则

### 1. 预处理优先于 AST 定制

所有非标准 Markdown 语法（如 Wiki Link）都通过 Preprocessor 处理，而非定制 AST 解析器。这确保：
- 与标准 remark/unified 生态兼容
- 不依赖特定 AST 库版本
- 实现简单，易于测试

### 2. 占位符模式

Code Block 和 Wiki Link 都使用占位符模式：

```
{{CODE_BLOCK:{language}-{hash}}}
{{WIKI_LINK:{table}/{id}|{label}}}
```

占位符在内容中保留位置信息，实际数据存储为独立字段。

### 3. 可逆性

所有转换都是可逆的。从对象结构可以完整还原原始 Markdown。

### 4. 严格验证

- 死链检测：Wiki Link 目标必须存在
- Schema 验证：字段类型、必填项、全局策略
- 文件名一致性：文件名必须与 title 匹配

## 处理流程总览

```
原始 Markdown 文件
    ↓
Preprocessor 阶段
├── 提取 Code Block → 占位符
└── 提取 Wiki Link → 占位符
    ↓
替换后的 Markdown
    ↓
标准 AST 解析（remark/unified）
    ↓
生成对象结构
├── frontmatter 字段
├── content-## {heading} 字段
├── content-## {heading}-{language}-{hash} 字段（Code Block）
└── wiki_links 数组（Wiki Link）
    ↓
验证阶段
├── Schema 验证
├── 全局策略验证
└── 死链检测
    ↓
存储 / 查询
```

## 相关文档

- [SPEC.md](../SPEC.md) - 完整语法规范
- [README.md](../README.md) - 项目概述
