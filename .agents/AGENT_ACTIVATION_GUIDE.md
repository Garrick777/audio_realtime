# Agent激活指南

由于没有真正的多agent自动协同系统，你需要**手动启动每个agent**。

在每个阶段，复制对应的**激活提示词**粘贴给Claude，agent会自动读取角色文档并执行任务。

---

## 工作流程概览

```
1. 你创建需求文档
   ↓
2. 你激活：技术指导Agent
   ↓ (输出TECH_DECISION.md)
3. 你激活：项目启动Agent
   ↓ (输出PROJECT_READY.md)
4. 你激活：代码实现Agent
   ↓ (输出CODE_COMPLETE.md)
5. 你激活：自动化测试Agent
   ↓ (输出TEST_REPORT.md)
   ├─ 如果FAILED → 返回步骤4重新激活代码实现Agent
   └─ 如果PASSED → 继续
6. 你激活：Git提交Agent
   ↓ (输出GIT_COMMITTED.md)
完成 🎉
```

---

## Agent 1: 技术指导Agent

### 何时使用
- 创建完需求文档后
- 需要技术咨询时

### 激活提示词（复制下面的内容）

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

## Agent 2: 项目启动Agent

### 何时使用
- 技术指导Agent完成后（TECH_DECISION.md已生成）

### 激活提示词

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

## Agent 3: 代码实现Agent

### 何时使用
- 项目启动Agent完成后（PROJECT_READY.md已生成）
- 测试失败需要修复Bug时（TEST_REPORT.md状态为FAILED）

### 激活提示词（首次开发）

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

### 激活提示词（Bug修复模式）

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

## Agent 4: 自动化测试Agent

### 何时使用
- 代码实现Agent完成后（CODE_COMPLETE.md已生成或更新）

### 激活提示词

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

## Agent 5: Git提交Agent

### 何时使用
- 自动化测试Agent完成且状态为PASSED时（TEST_REPORT.md状态为✅ PASSED）

### 激活提示词

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

## 特殊情况：技术咨询

### 何时使用
- 任何agent遇到技术难题需要咨询时

### 激活提示词

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

## 使用示例

### 完整开发流程示例

**步骤1：创建需求**
```
编辑 .agents/shared/00_REQUIREMENTS.md
填写需求内容
```

**步骤2：启动技术指导Agent**
```
复制 "Agent 1: 技术指导Agent" 的激活提示词
粘贴给Claude
等待TECH_DECISION.md生成
```

**步骤3：启动项目启动Agent**
```
复制 "Agent 2: 项目启动Agent" 的激活提示词
粘贴给Claude
等待PROJECT_READY.md生成
```

**步骤4：启动代码实现Agent**
```
复制 "Agent 3: 代码实现Agent（首次开发）" 的激活提示词
粘贴给Claude
等待CODE_COMPLETE.md生成
```

**步骤5：启动测试Agent**
```
复制 "Agent 4: 自动化测试Agent" 的激活提示词
粘贴给Claude
等待TEST_REPORT.md生成
```

**步骤6：判断测试结果**
- 如果 TEST_REPORT.md 状态为 ❌ FAILED
  → 返回步骤4，使用"Bug修复模式"激活代码实现Agent

- 如果 TEST_REPORT.md 状态为 ✅ PASSED
  → 继续步骤7

**步骤7：启动Git提交Agent**
```
复制 "Agent 5: Git提交Agent" 的激活提示词
粘贴给Claude
等待GIT_COMMITTED.md生成
```

**完成！🎉**

---

## 快捷技巧

### 快速复制激活提示词
所有激活提示词都在本文档中，按需复制即可。

### 查看当前进度
```bash
# 查看已生成的输出文件
ls -la .agents/*/output/

# 查看最新的测试状态
cat .agents/04_codex_auto_test/output/TEST_REPORT.md | grep "状态:"
```

### 清理重新开始
```bash
# 删除所有输出文件（保留角色定义）
rm .agents/*/output/*.md
rm .agents/shared/00_REQUIREMENTS.md
```

---

## 注意事项

1. **必须按顺序激活agent**：每个agent依赖上游agent的输出
2. **测试失败必须修复**：不能跳过测试直接提交
3. **一次只激活一个agent**：等待当前agent完成后再激活下一个
4. **保持角色一致性**：激活后agent会严格遵守ROLE_PROMPT定义的边界

---

创建时间: 2026-03-03
版本: v1.0
