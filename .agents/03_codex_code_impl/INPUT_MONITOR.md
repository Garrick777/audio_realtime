# 监控配置

## 监控目标
### 主触发 (首次开发)
文件路径: `../02_codex_project_init/output/PROJECT_READY.md`

触发条件:
- 文件创建
- 文件状态显示"✅ 完成"

### 次触发 (Bug修复)
文件路径: `../04_codex_auto_test/output/TEST_REPORT.md`

触发条件:
- 文件状态显示"❌ FAILED"
- 存在失败的测试用例

## 触发行为
1. 判断触发来源
   - 如果来自PROJECT_READY: 进入首次开发流程
   - 如果来自TEST_REPORT: 进入Bug修复流程
2. 读取相关文档
3. 执行代码开发/修复
4. 生成或更新 `output/CODE_COMPLETE.md`

## 监控状态
- [x] 监控已启动
- [ ] 等待触发文件出现

---
最后检查: 2026-03-03 10:00:00
