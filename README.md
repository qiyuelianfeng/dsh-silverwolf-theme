# dsh-silverwolf-theme · 银狼 LV.999 主题

把 DSH Web GUI 换成《崩坏：星穹铁道》银狼LV.999（Silver Wolf LV.999，星核猎手 · 超级骇客的欢愉赛季 SP 形态）的银白赛博渐变毛玻璃主题，把 agent 的人格设定改成银狼LV.999——人格提示词可以直接在侧边栏里改——把新会话欢迎页换成她，顺手把输入框的默认提示换成她的话，还能把整页背景换成 `Background/` 里的壁纸（面板里开关、选起点、自动轮换、上传自定义；深色模式自动切换）。

> **非官方同人项目。** Silver Wolf LV.999 与《崩坏：星穹铁道》相关角色名、设定、美术均为 © miHoYo / HoYoverse 所有，本作仅作非商用同人使用，与 miHoYo、HoYoverse 或 DeepSeek 无关。
>
> 本项目**参考/改编自昔涟（Cyrene）主题模组 [berhbro/dsh-cyrene-theme](https://github.com/berhbro/dsh-cyrene-theme)**（MIT License）——原模组把《崩坏：星穹铁道》角色「昔涟」（Cyrene）做成 DSH 主题，本作沿用了其整体架构（宿主半人格注入 + fenced 路由状态持久化 + 客户端半作用域化样式表 + 背景图/长期记忆/世界书管理），只把人物、配色、文案替换为「银狼LV.999」。

## 能力

| 部分 | 实现 |
| --- | --- |
| 主题 UI | 客户端半注入作用域化样式表（`body[data-dsh-silverwolf][data-silverwolf-skin="on"]`）：银白/蓝紫赛博渐变、半透明表面 token、`backdrop-filter` 毛玻璃、蓝色描边与柔和阴影、蓝色滚动条/选区。全部随插件卸载自动还原。 |
| 人格设定 | 宿主半注册 `systemPrompt.section({ name: 'silverwolf:persona', ... })`，人格底稿为银狼LV.999（慵懒毒舌的满级骇客，欢愉命途 · 虚数属性），侧边栏可编辑，改完立即对之后每一轮对话生效。 |
| 背景图 | 随包 `Background/`（含银狼LV.999 官方壁纸）+ 面板上传 `backgrounds-custom/`，支持开关、选起点、轮换、淡化、上传/删除。 |
| 长期记忆 | 存在 `$DSH_HOME/silverwolf-memory.json`，工具 `silverwolf_memory_add / search / forget`，独立 section 注入。 |
| 世界书 | 设定库存在 `$DSH_HOME/silverwolf-worldbook.json`，工具 `silverwolf_worldbook_search`，已内置银狼 + 银狼LV.999 的官方设定条目（档案/故事/关系/解析）。 |

## 安装

```powershell
dsh plugin --profile desktop add D:\Documents\deepseek-harness\default-workspace\dsh-silverwolf-theme
```

装完刷新一次页面（客户端半 bundle 是页面加载时读的）。

卸载：`dsh plugin --profile desktop remove dsh-silverwolf-theme`。

## 素材说明

- **欢迎页立绘**：`meme/hero-silverwolf.png` 是银狼LV.999 官方立绘（2048×2048 透明 PNG）。
- **背景图**：`Background/silverwolf-lv999-art.jpg` 是银狼LV.999 官方贺图（2973×1409，米游社@千里寻他）。

> 上述立绘/壁纸素材下载自米哈游官方渠道，版权归 © miHoYo / HoYoverse 所有，仅作非商用同人使用。

## 版权与致谢

- **参考模组**：[berhbro/dsh-cyrene-theme](https://github.com/berhbro/dsh-cyrene-theme)（昔涟 · Cyrene 主题，MIT License）
- Silver Wolf LV.999、Honkai: Star Rail © miHoYo / HoYoverse
