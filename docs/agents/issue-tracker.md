# Issue tracker: GitHub

本仓库的规格、任务和缺陷使用 `qianchencc/calc` 的 GitHub Issues 管理。

## 基本约定

- 发布规格或任务：创建 GitHub Issue。
- 获取任务：读取Issue正文、评论、标签和依赖关系。
- 更新进度：通过Issue评论记录。
- 状态流转：使用仓库规定的分流标签。
- 完成任务：附验证结果后关闭Issue。

在仓库克隆中工作时，优先使用 `gh issue` 命令；通过连接器工作时，使用对应的GitHub Issue读写操作。

## Pull Request请求入口

外部Pull Request不作为 `/triage` 的请求入口。PR仍用于代码审查和合并，但不会自动进入需求分流队列。

## 任务依赖

优先使用GitHub原生Issue依赖关系表示阻塞边；若当前仓库不可用，则在Issue顶部使用：

```text
Blocked by: #<issue>, #<issue>
```

只有全部阻塞Issue关闭后，任务才能进入可实现状态。

## 技能约定

- “发布到问题跟踪器”表示创建GitHub Issue。
- “获取相关任务”表示读取对应GitHub Issue及评论。
- `/to-spec` 发布规格Issue。
- `/to-tickets` 创建实现Issue并声明阻塞关系。
- `/triage` 只处理传入的Issues，不处理外部PR。

## Wayfinder约定

`/wayfinder` 使用一个带 `wayfinder:map` 标签的父Issue维护决策地图，并用子Issue表示研究、原型、访谈或实现任务。优先使用GitHub原生子Issue和依赖关系；不可用时，退回到父Issue任务列表和 `Blocked by` 文本。
