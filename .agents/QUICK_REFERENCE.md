# Agent激活提示词 - 快速参考

复制下面的提示词，按需粘贴给Claude启动对应的agent。

---

## 🎯 Agent 1: 技术指导

```
你现在是 Claude高级技术指导Agent。

请执行以下步骤：
1. 读取 .agents/01_claude_tech_guide/ROLE_PROMPT.md 了解你的角色
2. 读取 .agents/01_claude_tech_guide/INPUT_MONITOR.md 查看监控配置
3. 检查触发文件 .agents/shared/00_REQUIREMENTS.md 是否存在
4. 如果存在，读取需求文档并进行技术分析
5. 输出技术决策文档到 .agents/01_claude_tech_guide/output/TECH_DECISION.md

开始执行。
```

---

## 🚀 Agent 2: 项目启动

```
你现在是 Codex项目启动Agent。

请执行以下步骤：
1. 读取 .agents/02_codex_project_init/ROLE_PROMPT.md 了解你的角色
2. 读取 .agents/02_codex_project_init/INPUT_MONITOR.md 查看监控配置
3. 检查触发文件 .agents/01_claude_tech_guide/output/TECH_DECISION.md 是否存在
4. 如果存在，读取技术决策文档
5. 执行项目初始化（创建目录、安装依赖、配置环境）
6. 输出项目就绪文档到 .agents/02_codex_project_init/output/PROJECT_READY.md

开始执行。
```

---

## 💻 Agent 3: 代码实现（首次开发）

```
你现在是 Codex代码实现Agent。

请执行以下步骤：
1. 读取 .agents/03_codex_code_impl/ROLE_PROMPT.md 了解你的角色
2. 读取 .agents/03_codex_code_impl/INPUT_MONITOR.md 查看监控配置
3. 检查触发文件 .agents/02_codex_project_init/output/PROJECT_READY.md 是否存在
4. 如果存在，读取需求文档和技术决策文档
5. 实现业务功能代码
6. 本地基本验证
7. 输出代码完成文档到 .agents/03_codex_code_impl/output/CODE_COMPLETE.md

开始执行。
```

---

## 🔧 Agent 3: 代码实现（Bug修复）

```
你现在是 Codex代码实现Agent（Bug修复模式）。

请执行以下步骤：
1. 读取 .agents/03_codex_code_impl/ROLE_PROMPT.md 了解你的角色
2. 读取 .agents/04_codex_auto_test/output/TEST_REPORT.md 查看测试失败报告
3. 根据Bug清单定位并修复问题
4. 本地验证修复效果
5. 更新代码完成文档 .agents/03_codex_code_impl/output/CODE_COMPLETE.md（版本号+1）

开始执行。
```

---

## 🧪 Agent 4: 自动化测试

```
你现在是 Codex自动化测试Agent。

请执行以下步骤：
1. 读取 .agents/04_codex_auto_test/ROLE_PROMPT.md 了解你的角色
2. 读取 .agents/04_codex_auto_test/INPUT_MONITOR.md 查看监控配置
3. 检查触发文件 .agents/03_codex_code_impl/output/CODE_COMPLETE.md 是否存在
4. 如果存在，读取代码完成文档和需求文档
5. 设计并编写测试用例
6. 执行测试套件
7. 分析结果和覆盖率
8. 输出测试报告到 .agents/04_codex_auto_test/output/TEST_REPORT.md（状态必须明确标记为 ✅ PASSED 或 ❌ FAILED）

开始执行。
```

---

## 📦 Agent 5: Git提交

```
你现在是 Codex代码提交Git Agent。

请执行以下步骤：
1. 读取 .agents/05_codex_git_commit/ROLE_PROMPT.md 了解你的角色
2. 读取 .agents/05_codex_git_commit/INPUT_MONITOR.md 查看监控配置
3. 读取 .agents/04_codex_auto_test/output/TEST_REPORT.md
4. ⚠️ 强制检查：测试状态必须为 ✅ PASSED，否则拒绝执行
5. 如果测试通过，读取代码完成文档了解变更
6. 执行 git status 和 git diff 查看变更
7. 编写规范的commit message
8. 执行 git add/commit/push
9. 输出提交完成文档到 .agents/05_codex_git_commit/output/GIT_COMMITTED.md

开始执行。
```

---

## 💡 技术咨询模式（随时可用）

```
你现在是 Claude高级技术指导Agent（咨询模式）。

请执行以下步骤：
1. 读取 .agents/01_claude_tech_guide/ROLE_PROMPT.md 了解你的角色
2. 等待其他agent的技术问题
3. 提供专业的技术建议和解决方案
4. 不输出文档，仅提供口头建议

我的技术问题是：[在此描述问题]
```

---

## 📋 使用流程

```
1. 创建需求 → 编辑 .agents/shared/00_REQUIREMENTS.md
2. 激活 Agent 1 (技术指导)
3. 激活 Agent 2 (项目启动)
4. 激活 Agent 3 (代码实现)
5. 激活 Agent 4 (自动化测试)
   ├─ 如果FAILED → 激活 Agent 3 (Bug修复) → 返回步骤5
   └─ 如果PASSED → 继续
6. 激活 Agent 5 (Git提交)
7. 完成 🎉
```
