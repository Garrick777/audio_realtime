# Agent协同开发团队系统

## 系统简介
这是一个基于文档驱动的五agent协同开发系统，通过监控文档触发机制实现自动化开发流程。

**⚠️ 重要说明**：由于没有真正的多agent自动协同系统，你需要**手动激活每个agent**来模拟协同工作流程。

## 📖 快速开始

### 激活Agent的两种方式

1. **详细指南**：查看 [`AGENT_ACTIVATION_GUIDE.md`](./AGENT_ACTIVATION_GUIDE.md) - 包含完整说明和使用示例
2. **快速参考**：查看 [`QUICK_REFERENCE.md`](./QUICK_REFERENCE.md) - 快速复制激活提示词

## Agent团队成员

### 1. Claude高级技术指导Agent
- **职责**: 技术架构设计、技术选型、疑难问题解答
- **输入**: `shared/00_REQUIREMENTS.md`
- **输出**: `01_claude_tech_guide/output/TECH_DECISION.md`

### 2. Codex项目启动Agent
- **职责**: 项目初始化、依赖安装、环境配置
- **输入**: `01_claude_tech_guide/output/TECH_DECISION.md`
- **输出**: `02_codex_project_init/output/PROJECT_READY.md`

### 3. Codex代码实现Agent
- **职责**: 业务代码实现、Bug修复
- **输入**:
  - 首次: `02_codex_project_init/output/PROJECT_READY.md`
  - 修复: `04_codex_auto_test/output/TEST_REPORT.md` (FAILED状态)
- **输出**: `03_codex_code_impl/output/CODE_COMPLETE.md`

### 4. Codex自动化测试Agent
- **职责**: 测试用例设计、自动化测试执行、Bug报告
- **输入**: `03_codex_code_impl/output/CODE_COMPLETE.md`
- **输出**: `04_codex_auto_test/output/TEST_REPORT.md`

### 5. Codex代码提交Git Agent
- **职责**: Git版本控制、代码提交、PR创建
- **输入**: `04_codex_auto_test/output/TEST_REPORT.md` (PASSED状态)
- **输出**: `05_codex_git_commit/output/GIT_COMMITTED.md`

## 工作流程

```
人工创建需求
    ↓
shared/00_REQUIREMENTS.md
    ↓ 触发
技术指导Agent → TECH_DECISION.md
    ↓ 触发
项目启动Agent → PROJECT_READY.md
    ↓ 触发
代码实现Agent → CODE_COMPLETE.md
    ↓ 触发
自动化测试Agent → TEST_REPORT.md
    ↓
   判断
    ├─ FAILED → 返回代码实现Agent
    └─ PASSED → 触发
                ↓
        Git提交Agent → GIT_COMMITTED.md
                ↓
            流程完成 🎉
```

## 使用方法

### 启动新需求开发（手动模拟流程）

1. **创建需求文档**
   - 编辑 `shared/00_REQUIREMENTS.md`
   - 填写需求信息

2. **按顺序激活每个Agent**
   - 从 [`QUICK_REFERENCE.md`](./QUICK_REFERENCE.md) 复制对应的激活提示词
   - 粘贴给Claude
   - 等待agent完成任务并生成输出文档
   - 继续激活下一个agent

3. **完整流程**
   ```
   激活Agent1(技术指导) → 激活Agent2(项目启动) → 激活Agent3(代码实现)
   → 激活Agent4(测试) → [如果失败:激活Agent3修复] → 激活Agent5(Git提交)
   ```

### 每个Agent的角色文件
- `ROLE_PROMPT.md`: Agent的角色定义和职责边界
- `INPUT_MONITOR.md`: 监控配置和触发条件（理论上的监控目标）
- `output/`: Agent的输出文件目录

## 目录结构

```
.agents/
├── README.md                           # 本文件（系统概述）
├── AGENT_ACTIVATION_GUIDE.md           # Agent激活详细指南
├── QUICK_REFERENCE.md                  # 快速参考（激活提示词）
├── shared/                             # 共享文档区
│   └── 00_REQUIREMENTS.md              # 需求文档模板
│
├── 01_claude_tech_guide/               # 技术指导Agent
│   ├── ROLE_PROMPT.md
│   ├── INPUT_MONITOR.md
│   └── output/
│       └── TECH_DECISION.md
│
├── 02_codex_project_init/              # 项目启动Agent
│   ├── ROLE_PROMPT.md
│   ├── INPUT_MONITOR.md
│   └── output/
│       └── PROJECT_READY.md
│
├── 03_codex_code_impl/                 # 代码实现Agent
│   ├── ROLE_PROMPT.md
│   ├── INPUT_MONITOR.md
│   └── output/
│       └── CODE_COMPLETE.md
│
├── 04_codex_auto_test/                 # 自动化测试Agent
│   ├── ROLE_PROMPT.md
│   ├── INPUT_MONITOR.md
│   └── output/
│       └── TEST_REPORT.md
│
└── 05_codex_git_commit/                # Git提交Agent
    ├── ROLE_PROMPT.md
    ├── INPUT_MONITOR.md
    └── output/
        └── GIT_COMMITTED.md
```

## 核心原则

### 职责隔离
- 每个Agent严格遵守 `ROLE_PROMPT.md` 定义的职责边界
- 跨职责工作必须通过协作完成
- 不得越权执行其他Agent的任务

### 质量保证
- 测试未通过(FAILED)时，严禁提交代码
- 必须修复所有Bug后才能进入提交流程
- 代码覆盖率要求 >90%

### 文档驱动
- 所有agent通过监控文档触发
- 文档是agent间唯一的沟通方式
- 文档状态决定流程走向

## 注意事项

1. **需要手动激活agent**：使用 `QUICK_REFERENCE.md` 中的激活提示词
2. **必须按顺序激活**：每个agent依赖上游agent的输出文档
3. **不要手动修改output目录**：由对应agent自动生成
4. **需求文档格式要规范**：影响整个流程的执行
5. **测试失败需手动激活修复**：使用"Bug修复模式"激活代码实现agent
6. **Git提交有强制检查**：确保代码质量，测试未通过会拒绝提交

## 示例需求

参考 `shared/00_REQUIREMENTS.md` 查看需求文档模板和填写说明。

---

## 🚀 下一步

### 第一次使用？

1. **阅读激活指南**
   ```bash
   cat .agents/AGENT_ACTIVATION_GUIDE.md
   ```

2. **准备快速参考卡片**
   ```bash
   cat .agents/QUICK_REFERENCE.md
   ```
   保持这个文件打开，方便随时复制激活提示词

3. **创建第一个需求**
   编辑 `shared/00_REQUIREMENTS.md`，填写一个简单的需求（例如：实现一个Hello World API）

4. **开始激活流程**
   从 `QUICK_REFERENCE.md` 复制"Agent 1: 技术指导"的激活提示词，粘贴给Claude

### 需要帮助？

- 完整使用指南：[AGENT_ACTIVATION_GUIDE.md](./AGENT_ACTIVATION_GUIDE.md)
- 快速参考：[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
- 系统概述：本文件

---

创建时间: 2026-03-03
系统版本: v1.0
