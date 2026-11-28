/**
 * dsh-silverwolf-theme — 客户端半（Client half）。
 *
 * 这是一个**手写的 CJS bundle**，按 DSH 客户端的 module-loader 约定包装：
 *   window.__ModuleLoader__.load({ id, factory })
 * factory 里写普通 CommonJS，导出 `apply(ctx)` 与 `inject`（无需 JSX / TS / 构建）。
 * 本包不需要 React 之外任何外部模块；React 只为两个槽位组件服务，
 * 拿不到时主题照常生效（只是没有侧边栏入口）。
 *
 * 客户端半做三件事：
 *  1. 注入一份作用域化样式表（银白赛博渐变 + 毛玻璃 + 完整 --dsw-alias-* token 覆写）。
 *  2. 给 body 打上 data-dsh-silverwolf / data-silverwolf-skin 作用域；卸载时全部还原。
 *  3. 通过宿主半自己的 fenced 路由 /silverwolf/state 读写人格设定，
 *     并把编辑器挂到 sidebar.footer.action 与 settings.section 两个槽位。
 *  4. 两处对话界面微调（不跟主题开关走，见 CSS 末尾一段）：
 *     用 conversation.hero.brand.mark 把新会话欢迎页的鱼换成银狼的形象 + 艺术字欢迎语；
 *     用 CSS 把输入框的默认占位提示换成银狼的招呼语。
 */
window.__ModuleLoader__.load({
  id: "dsh-silverwolf-theme",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    /** 与 package.json 的 name 一致（module id 与归属标记）。 */
    const PACKAGE_ID = "dsh-silverwolf-theme";
    /** 插件作用域属性：只要插件在，body 上就有它。 */
    const BODY_ATTR = "data-dsh-silverwolf";
    /** 主题开关属性：on / off。 */
    const SKIN_ATTR = "data-silverwolf-skin";
    /** 宿主半路由：<base>/silverwolf/state。 */
    const API_PATH = "silverwolf/state";
    /** 活页面取证路由：<base>/silverwolf/report（诊断用，只存宿主内存）。 */
    const REPORT_PATH = "silverwolf/report";
    /** 表情包清单：<base>/silverwolf/stickers。 */
    const STICKERS_PATH = "silverwolf/stickers";
    /** 单张表情包字节：<base>/silverwolf/sticker/<id>（宿主半只服务包内文件）。 */
    const STICKER_PATH = "silverwolf/sticker";
    /** 新会话欢迎页的形象字节：<base>/silverwolf/hero（同样是包内文件）。 */
    const HERO_PATH = "silverwolf/hero";
    /** 背景图清单：<base>/silverwolf/backgrounds（Background/ 目录的实时扫描结果）。 */
    const BACKGROUNDS_PATH = "silverwolf/backgrounds";
    /** 单张背景字节：<base>/silverwolf/background/<文件名>（只能取到清单里的那张）。 */
    const BACKGROUND_PATH = "silverwolf/background";
    /** 长期记忆：<base>/silverwolf/memory（读 / 增 / 删 / 清空 / 开关都走这一条）。 */
    const MEMORY_PATH = "silverwolf/memory";
    /** 只读的原文视图：在浏览器里直接看 silverwolf-memory.json（text/plain，不缓存）。 */
    const MEMORY_RAW_PATH = "silverwolf/memory/raw";
    /** 世界书：<base>/silverwolf/worldbook（读索引 / 抓取 / 重载 / 清空 / 打开文件位置）。 */
    const WORLDBOOK_PATH = "silverwolf/worldbook";
    /**
     * 一张背景图的可加载地址。宿主半在清单里已经给了 url（它自己拼的、带编码），
     * 优先用那个——不同外壳（桌面 / 手机 APK / 浏览器）的 baseURI 不一样，
     * 少拼一次路径就少一处对不上的机会；老宿主没有 url 时按老规矩拼。
     */
    function backgroundSrc(item) {
      const id = item && typeof item.id === "string" ? item.id : "";
      const raw = item && typeof item.url === "string" && item.url !== ""
        ? item.url
        : BACKGROUND_PATH + "/" + encodeURIComponent(id);
      try {
        return new URL(raw, document.baseURI).href;
      } catch {
        return raw;
      }
    }
    /** 色纱浓度兜底值 / 轮换间隔兜底值与下限（与宿主半的 0.2–0.85、15–3600 对齐）。 */
    const BG_DIM_FALLBACK = 0.6;
    const BG_INTERVAL_FALLBACK = 90;
    const BG_INTERVAL_MIN = 15;
    /** 欢迎语：宿主半没给出 title 时用这句。 */
    const HERO_TITLE_FALLBACK = "让银狼来帮帮你吧";
    /** 输入框占位提示的替换文案（由 CSS 的 ::after 写出去，改这里就够）。 */
    const PLACEHOLDER_TEXT = "有问题？有任务？来找银狼";
    /**
     * 取证扫描节奏：5 秒一次，报告内容没变就不重复上报。
     * 这是诊断旁路（桌面外壳的页面没法从沙箱里截图/读 DOM），
     * 把全页 DOM 扫一遍有成本，所以节奏放慢、内容不变不上报。
     */
    const REPORT_INTERVAL_MS = 5000;

    // ---------------------------------------------------------------------
    // 样式表
    // ---------------------------------------------------------------------
    const CSS = `
/* =====================================================================
   银狼 · 银白赛博渐变主题
   作用域：body[data-dsh-silverwolf][data-silverwolf-skin="on"]
   全部规则随样式表移除而消失，不改动任何宿主文件。
   ===================================================================== */

/* ---- 浅色：表面 token ---- */
body[data-dsh-silverwolf][data-silverwolf-skin="on"]{
  --sw-ink:#1c2733;
  --sw-ink-soft:#5a6b7c;
  --dsw-alias-bg-base:transparent;
  --dsw-alias-bg-layer-1:rgba(244,248,252,.72);
  --dsw-alias-bg-layer-2:rgba(236,243,250,.58);
  --dsw-alias-bg-layer-3:rgba(228,238,248,.45);
  --dsw-alias-bg-module-platform:rgba(240,246,252,.6);
  --dsw-alias-bg-overlay:rgba(240,247,255,.9);
  --dsw-alias-border-l1:rgba(110,158,214,.28);
  --dsw-alias-border-l2:rgba(90,140,200,.4);
  --dsw-alias-border-l2-darkmode-thin:rgba(90,140,200,.2);
  --dsw-alias-border-l3:rgba(74,124,188,.55);
  --dsw-alias-border-l4:rgba(58,104,168,.7);
  --dsw-alias-brand-primary:#3f7fd9;
  --dsw-alias-brand-text:#ffffff;
  --dsw-alias-button-elevated-fill:rgba(255,255,255,.88);
  --dsw-alias-button-floating-fill:rgba(244,249,255,.95);
  --dsw-alias-button-floating-hover:#dbe9fb;
  --dsw-alias-button-info-fill:#3f7fd9;
  --dsw-alias-button-info-hover:#3268b6;
  --dsw-alias-interactive-bg-active:rgba(63,127,217,.2);
  --dsw-alias-interactive-bg-hover:rgba(63,127,217,.1);
  --dsw-alias-interactive-bg-hover-solid:#dbe9fb;
  --dsw-alias-label-caption:#64788c;
  --dsw-alias-label-deep-diving:#2e6ac0;
  --dsw-alias-label-dimmed:#a3b4c6;
  --dsw-alias-label-primary:#1c2733;
  --dsw-alias-label-primary-bluish:#24384a;
  --dsw-alias-label-primary-dimmed:#667f95;
  --dsw-alias-label-primary-foreground:#ffffff;
  --dsw-alias-label-primary-inverted:#f5f9ff;
  --dsw-alias-label-secondary:#5a6b7c;
  --dsw-alias-label-tertiary:#5f7284;
  --dsw-alias-markdown-code-block:rgba(244,248,252,.78);
  --dsw-alias-menu-group-header-fill:rgba(226,238,250,.9);
  --dsw-alias-scrollbar-bg-l2:rgba(63,127,217,.18);
  --dsw-alias-scrollbar-hover-l2:rgba(63,127,217,.38);
  --dsw-alias-state-business-primary:#7a6fd0;
  --dsw-alias-state-business-tertiary:#e8e4fb;
  --dsw-alias-state-error-primary:#c4424f;
  --dsw-alias-state-idle-primary:#a9b6c4;
  --dsw-alias-state-success-primary:#2f8f6b;
  --dsw-alias-state-warn-primary:#b57a45;
  --dsw-alias-state-warn-label:#9a6229;
  --dsw-alias-state-warn-tertiary:#fdeede;
  --dsw-alias-tooltip-bg:rgba(24,36,48,.95);
  --dsw-specific-bubble:rgba(126,168,230,.3);
  --dsw-specific-input-major:rgba(255,255,255,.78);
  --dsw-specific-menu:rgba(244,249,255,.96);
  --dsw-specific-selector:rgba(255,255,255,.85);
  --dsw-specific-sidebar-fill:rgba(238,245,253,.58);
  --dsw-specific-sidebar-nav-item-active-accent:rgba(63,127,217,.16);
  --dsw-static-neutral-bluish-00:#f5f8fc;
  --dsw-shadow-lv2:0 18px 48px rgba(58,104,168,.16), 0 2px 8px rgba(58,104,168,.1);
  background-color:transparent;
  color:var(--sw-ink);
}

/* ---- 深色：表面 token ---- */
body[data-dsh-silverwolf][data-silverwolf-skin="on"][data-ds-dark-theme]{
  --sw-ink:#e8f0fa;
  --sw-ink-soft:#9fb4ca;
  --dsw-alias-bg-base:transparent;
  --dsw-alias-bg-layer-1:rgba(20,28,38,.7);
  --dsw-alias-bg-layer-2:rgba(26,36,48,.58);
  --dsw-alias-bg-layer-3:rgba(32,44,58,.46);
  --dsw-alias-bg-module-platform:rgba(20,28,38,.62);
  --dsw-alias-bg-overlay:rgba(13,18,26,.92);
  --dsw-alias-border-l1:rgba(120,170,230,.24);
  --dsw-alias-border-l2:rgba(120,170,230,.34);
  --dsw-alias-border-l2-darkmode-thin:rgba(120,170,230,.18);
  --dsw-alias-border-l3:rgba(120,170,230,.48);
  --dsw-alias-border-l4:rgba(130,180,240,.62);
  --dsw-alias-brand-primary:#6ea8ff;
  --dsw-alias-brand-text:#0e1722;
  --dsw-alias-button-elevated-fill:rgba(30,40,54,.84);
  --dsw-alias-button-floating-fill:rgba(22,30,42,.94);
  --dsw-alias-button-floating-hover:rgba(36,48,64,.96);
  --dsw-alias-button-info-fill:#4f8fe8;
  --dsw-alias-button-info-hover:#6ea8ff;
  --dsw-alias-interactive-bg-active:rgba(110,168,255,.26);
  --dsw-alias-interactive-bg-hover:rgba(110,168,255,.15);
  --dsw-alias-interactive-bg-hover-solid:#1e2c40;
  --dsw-alias-label-caption:#8498ad;
  --dsw-alias-label-deep-diving:#6ea8ff;
  --dsw-alias-label-dimmed:#6d8095;
  --dsw-alias-label-primary:#e8f0fa;
  --dsw-alias-label-primary-bluish:#c9d9ec;
  --dsw-alias-label-primary-dimmed:#a4b8cd;
  --dsw-alias-label-primary-foreground:#0e1722;
  --dsw-alias-label-primary-inverted:#0e1722;
  --dsw-alias-label-secondary:#9fb4ca;
  --dsw-alias-label-tertiary:#8aa0b6;
  --dsw-alias-markdown-code-block:rgba(12,17,24,.66);
  --dsw-alias-menu-group-header-fill:rgba(24,34,46,.92);
  --dsw-alias-scrollbar-bg-l2:rgba(110,168,255,.18);
  --dsw-alias-scrollbar-hover-l2:rgba(110,168,255,.4);
  --dsw-alias-state-business-primary:#9b8ae8;
  --dsw-alias-state-business-tertiary:#262441;
  --dsw-alias-state-error-primary:#f27a86;
  --dsw-alias-state-idle-primary:#64788c;
  --dsw-alias-state-success-primary:#5fd1a3;
  --dsw-alias-state-warn-primary:#e8a86e;
  --dsw-alias-state-warn-label:#f0b982;
  --dsw-alias-state-warn-tertiary:#3b2e20;
  /* 深色模式下 tooltip / toast 的字色由宿主硬绑到 --dsw-static-neutral-bluish-00，
     而这一档在本主题的深色块里是深色——深底 + 深字会看不清。
     所以这两种"小浮层"在深色下改成浅底：字仍然是那个深色，对比度足够。 */
  --dsw-alias-tooltip-bg:rgba(240,247,255,.97);
  --dsw-alias-toast-bg:rgba(240,247,255,.97);
  --dsw-specific-bubble:rgba(40,72,112,.55);
  --dsw-specific-input-major:rgba(22,30,42,.8);
  --dsw-specific-menu:rgba(14,20,28,.97);
  --dsw-specific-selector:rgba(24,34,46,.88);
  --dsw-specific-sidebar-fill:rgba(18,26,36,.62);
  --dsw-specific-sidebar-nav-item-active-accent:rgba(110,168,255,.2);
  --dsw-static-neutral-bluish-00:#101a26;
  --dsw-shadow-lv2:0 20px 52px rgba(0,0,0,.5), 0 2px 10px rgba(0,0,0,.38);
  color:var(--sw-ink);
}

/* ---- 整页渐变底：固定在最底层的伪元素，不参与布局 ---- */
body[data-dsh-silverwolf][data-silverwolf-skin="on"]::before{
  content:"";
  position:fixed;
  inset:0;
  z-index:-1;
  pointer-events:none;
  background:
    radial-gradient(1100px 760px at 12% -6%, rgba(150,190,240,.85), rgba(150,190,240,0) 62%),
    radial-gradient(900px 700px at 88% 4%, rgba(170,150,255,.6), rgba(170,150,255,0) 60%),
    radial-gradient(760px 620px at 76% 96%, rgba(120,210,230,.55), rgba(120,210,230,0) 62%),
    radial-gradient(900px 800px at 8% 92%, rgba(190,205,235,.75), rgba(190,205,235,0) 65%),
    linear-gradient(158deg, #f2f6fb 0%, #eaf1fa 34%, #e9ecf8 68%, #e6f2f7 100%);
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"][data-ds-dark-theme]::before{
  background:
    radial-gradient(1000px 720px at 14% -8%, rgba(40,90,150,.7), rgba(40,90,150,0) 62%),
    radial-gradient(880px 680px at 86% 2%, rgba(80,70,150,.65), rgba(80,70,150,0) 60%),
    radial-gradient(760px 620px at 70% 98%, rgba(30,110,130,.5), rgba(30,110,130,0) 62%),
    linear-gradient(158deg, #0d1420 0%, #101a2a 36%, #131a30 70%, #0e1c24 100%);
}
/* 顶部一层极淡的珠光，让毛玻璃有可折射的内容 */
body[data-dsh-silverwolf][data-silverwolf-skin="on"]::after{
  content:"";
  position:fixed;
  inset:0;
  z-index:-1;
  pointer-events:none;
  background:linear-gradient(180deg, rgba(255,255,255,.3), rgba(255,255,255,0) 42%);
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"][data-ds-dark-theme]::after{
  background:linear-gradient(180deg, rgba(150,190,255,.1), rgba(255,255,255,0) 46%);
}

/* ---- 整页背景图：两层交叉淡入 + 一层色纱 ----
   这一层是 body 的真实子元素、z-index:-1，树序排在 body::before（银白赛博渐变）之后，
   所以有图时它盖住渐变；没有图时整层 display:none，渐变照旧。
   它 position:fixed 且 pointer-events:none：不参与布局、不接指针，不影响任何交互。
   图片走宿主半的 /silverwolf/background/<文件名>（页面是 http 来源，file:// 加载不出来）。 */
body[data-dsh-silverwolf][data-silverwolf-skin="on"] .swf-bg{
  position:fixed;
  inset:0;
  z-index:-1;
  pointer-events:none;
  overflow:hidden;
  background:#f2f6fb;
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"][data-ds-dark-theme] .swf-bg{
  background:#0d1420;
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"][data-swf-bg="off"] .swf-bg{
  display:none;
}
/* ---- 窗口拖拽区：这一层必须退出宿主的 no-drag 减法 ----
   macOS 桌面（hiddenInset，没有原生标题栏）把 body 的每个直接子元素都标成 no-drag：
     html[data-platform=darwin] body > :not(#root){-webkit-app-region:no-drag}
   而 app-region 的合成分法是「文档顺序里最后一个包含该点的盒子说了算」
   （宿主 ui-web 的 window-drag/regions.ts）。
   背景层是插件 append 到 body 末尾的、position:fixed;inset:0 铺满视口 —— 它正好是
   最后那个盒子，于是把 [data-window-drag] 的整片拖拽区减掉：整扇窗拖不动，
   双击标题栏也不会缩放了。pointer-events:none 和 z-index:-1 都救不了它，
   因为合成只看 app-region 盒子的文档顺序，不看绘制顺序。
   用 initial 让它退出 drag / no-drag 合成（computed 值回到 none）。
   宿主那条选择器带 #root 的 id，普通声明压不住，所以必须 !important。 */
body[data-dsh-silverwolf] > .swf-bg{
  -webkit-app-region:initial !important;
  app-region:initial !important;
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"] .swf-bg-img{
  position:absolute;
  inset:0;
  background-position:center center;
  background-size:cover;
  background-repeat:no-repeat;
  opacity:0;
  transition:opacity 900ms ease;
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"] .swf-bg-img[data-active="1"]{
  opacity:1;
}
/* 色纱：把照片压到"能读字"的程度，配色也拉回主题那一套。
   浓度 --swf-bg-dim（0.2–0.85）由控制板的滑杆写，越大越淡。 */
body[data-dsh-silverwolf][data-silverwolf-skin="on"] .swf-bg-veil{
  position:absolute;
  inset:0;
  background:
    radial-gradient(1200px 800px at 12% -6%, rgba(150,190,240,calc(var(--swf-bg-dim) * .55)), rgba(150,190,240,0) 62%),
    radial-gradient(900px 700px at 88% 4%, rgba(170,150,255,calc(var(--swf-bg-dim) * .45)), rgba(170,150,255,0) 60%),
    rgba(242,246,251,var(--swf-bg-dim));
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"][data-ds-dark-theme] .swf-bg-veil{
  background:
    radial-gradient(1000px 720px at 14% -8%, rgba(40,90,150,calc(var(--swf-bg-dim) * .5)), rgba(40,90,150,0) 62%),
    radial-gradient(880px 680px at 86% 2%, rgba(80,70,150,calc(var(--swf-bg-dim) * .45)), rgba(80,70,150,0) 60%),
    rgba(12,18,28,var(--swf-bg-dim));
}

/* ---- 对话列：照片直接透上来，整列**不**刷白 ----
   之前给 [data-conversation-scroll] 铺了一层 90% 的白纸，结果背景图基本看不见。
   现在只对"对话本身"做处理，整列保持透明：
     · 对话气泡本来就用 --dsw-specific-bubble 上色，有图时把它调厚一点；
     · 正文（段落 / 列表 / 表格）加一圈很淡的光晕，压在照片最花的地方也读得动。
   光晕只落在真正的文字块上，所以预格式化的代码块（自带深色底）不受影响。
   这里同样**不能**用 backdrop-filter：输入框卡片（以及发送键那个没开 portal、
   气泡 position:fixed 的 Tooltip）是这一层的后代，一旦它成为 fixed 后代的
   包含块，鼠标停在发送键上时界面就会闪。 */
body[data-dsh-silverwolf][data-silverwolf-skin="on"][data-swf-bg="on"]{
  --dsw-specific-bubble:rgba(126,168,230,.5);
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"][data-swf-bg="on"][data-ds-dark-theme]{
  --dsw-specific-bubble:rgba(40,72,112,.72);
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"][data-swf-bg="on"] [data-conversation-scroll] :is(p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th){
  text-shadow:0 1px 2px rgba(255,255,255,.9), 0 0 10px rgba(240,247,255,.72);
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"][data-swf-bg="on"][data-ds-dark-theme] [data-conversation-scroll] :is(p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th){
  text-shadow:0 1px 2px rgba(10,16,24,.85), 0 0 10px rgba(12,20,30,.66);
}

/* ---- 窗口画布兜底 ----
   桌面版窗口带原生材质（lib/main.js 里 backgroundMaterial: "acrylic"，
   renderer/assets/window-material.css 的注释也写着 "native material owns the blur"），
   而本主题把 --dsw-alias-bg-base 设成 transparent、body 也透明。
   如果连 html 画布都没有不透明底色，整扇窗就会透出系统模糊、看起来整屏发糊。
   这里给画布一个不透明底；可见的银白赛博渐变仍由上面的 ::before 提供。 */
html:has(body[data-dsh-silverwolf][data-silverwolf-skin="on"]){
  background-color:#f2f6fb;
}
html:has(body[data-dsh-silverwolf][data-silverwolf-skin="on"][data-ds-dark-theme]){
  background-color:#0d1420;
}

/* ---- 毛玻璃：只加在列级面板 / 真正浮起的表面 ----
   注意：不要给 [data-shell-overlay]（AppFrame 的 overlayLayer，永远存在且铺满整帧）
   或 [data-slot="shell.overlay"]（它的槽位宿主）加 backdrop-filter ——
   那会让整个窗口一起发糊。浮层本身用下面第二条规则里的直接子元素来打。
   同理，也不要给 [data-sidebar-right-panel]（右侧栏容器 .OUqwTW_panel）加：
   它 position:absolute;top:0;bottom:0;right:0 且自身没有背景，收起时只是把窗格
   设成 visibility:hidden（布局宽度仍在），于是那块区域会一直保持模糊 ——
   表现就是"打开设置页后右半边发雾、关掉也不散"。毛玻璃要打在真正的窗格
   [data-dockkit-pane] / [data-dockkit-float] 上，它们在收起时不被绘制。 */
body[data-dsh-silverwolf][data-silverwolf-skin="on"] [data-slot="sidebar"],
body[data-dsh-silverwolf][data-silverwolf-skin="on"] [data-slot="sidebar.settings"],
body[data-dsh-silverwolf][data-silverwolf-skin="on"] [data-dockkit-pane],
body[data-dsh-silverwolf][data-silverwolf-skin="on"] [data-dockkit-float],
body[data-dsh-silverwolf][data-silverwolf-skin="on"] [role="dialog"],
body[data-dsh-silverwolf][data-silverwolf-skin="on"] [data-radix-popper-content-wrapper],
body[data-dsh-silverwolf][data-silverwolf-skin="on"] [data-shell-overlay] > *{
  -webkit-backdrop-filter:blur(16px) saturate(160%);
  backdrop-filter:blur(16px) saturate(160%);
}

/* ---- 输入框卡片的毛玻璃：画在静态伪元素上，不画在卡片自己身上 ----
   发送键外面套着一个 Tooltip（primitives 的），它没开 portal，气泡是
   position:fixed 且靠在 ResizeObserver 里反复"适应"视口换边。给卡片本身加
   backdrop-filter 会让卡片成为 fixed 后代的包含块、并立起层叠上下文，气泡的
   视口定位就被破坏 → 鼠标停在发送键上时界面抖/闪（delayMs 500ms 触发）。
   挪到 ::before 上：观感不变，定位不再被劫持。isolation:isolate 让 z-index:-1
   的伪元素只压在这张卡片自己下面，不会钻到别的内容后面去。 */
body[data-dsh-silverwolf][data-silverwolf-skin="on"] [data-composer-card]{
  isolation:isolate;
  border-radius:20px;
  box-shadow:0 12px 34px rgba(63,127,217,.18);
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"] [data-composer-card]::before{
  content:"";
  position:absolute;
  inset:0;
  z-index:-1;
  border-radius:inherit;
  pointer-events:none;
  -webkit-backdrop-filter:blur(16px) saturate(160%);
  backdrop-filter:blur(16px) saturate(160%);
}

/* ---- 背景色纱浓度 / 贴图大小变量 ---- */
body[data-dsh-silverwolf]{
  --swf-bg-dim:.6;
  --swf-sticker-size:96px;
}
/* 聊天里的贴图是 Markdown 图片（alt 是「银狼·…」、地址是绝对路径）；
   认 alt 比认 src 稳（src 会被宿主按工作区重写）。
   故意不带 data-silverwolf-skin：贴图大小是插件自己的设定，关了主题也该照样起作用。 */
body[data-dsh-silverwolf] img[alt^="银狼·"]{
  max-width:var(--swf-sticker-size);
  max-height:var(--swf-sticker-size);
  width:auto;
  height:auto;
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"] ::selection{
  background:rgba(110,168,255,.4);
  color:var(--sw-ink);
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"] ::-webkit-scrollbar{width:10px;height:10px}
body[data-dsh-silverwolf][data-silverwolf-skin="on"] ::-webkit-scrollbar-track{background:transparent}
body[data-dsh-silverwolf][data-silverwolf-skin="on"] ::-webkit-scrollbar-thumb{
  background:linear-gradient(180deg, rgba(110,168,255,.75), rgba(150,120,240,.65));
  border-radius:999px;
  border:2px solid transparent;
  background-clip:padding-box;
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"] ::-webkit-scrollbar-thumb:hover{
  background:linear-gradient(180deg, #4f8fe8, #9678f0);
  background-clip:padding-box;
}
body[data-dsh-silverwolf][data-silverwolf-skin="on"] *:focus-visible{
  outline:2px solid rgba(79,143,232,.55);
  outline-offset:2px;
}

/* =====================================================================
   插件自带 UI（侧边栏入口 / 浮动面板 / 设置页）：不依赖主题开关
   ===================================================================== */
body[data-dsh-silverwolf]{
  --sw-ui-face:rgba(244,249,255,.92);
  --sw-ui-face2:rgba(233,241,251,.97);
  --sw-ui-line:rgba(90,140,200,.42);
  --sw-ui-text:#1c2733;
  --sw-ui-soft:#5a6b7c;
  --sw-ui-accent:#3f7fd9;
}
body[data-dsh-silverwolf][data-ds-dark-theme]{
  --sw-ui-face:rgba(20,28,38,.94);
  --sw-ui-face2:rgba(26,36,48,.97);
  --sw-ui-line:rgba(120,170,230,.3);
  --sw-ui-text:#e8f0fa;
  --sw-ui-soft:#9fb4ca;
  --sw-ui-accent:#6ea8ff;
}

.swf-mark{color:var(--sw-ui-accent)}

.swf-navbtn{
  display:inline-flex;
  align-items:center;
  gap:6px;
  width:100%;
  padding:6px 10px;
  border:1px solid var(--sw-ui-line);
  border-radius:12px;
  background:linear-gradient(135deg, rgba(190,215,245,.5), rgba(190,180,245,.4));
  color:var(--sw-ui-text);
  font:inherit;
  font-size:13px;
  cursor:pointer;
}
.swf-navbtn:hover{background:linear-gradient(135deg, rgba(150,195,245,.75), rgba(170,155,240,.6))}

.swf-overlay{
  position:fixed;
  right:24px;
  bottom:24px;
  z-index:2147483000;
  width:min(460px, calc(100vw - 48px));
  max-height:min(74vh, 760px);
  display:flex;
  flex-direction:column;
  overflow:hidden;
  padding:14px;
  border:1px solid var(--sw-ui-line);
  border-radius:20px;
  background:var(--sw-ui-face);
  -webkit-backdrop-filter:blur(22px) saturate(170%);
  backdrop-filter:blur(22px) saturate(170%);
  box-shadow:0 24px 64px rgba(180,80,140,.28);
  color:var(--sw-ui-text);
  font-family:inherit;
}
.swf-overlay-head{display:flex;align-items:center;gap:8px;padding:0 2px 10px}
.swf-overlay-title{font-size:14px;font-weight:600}
.swf-close{
  margin-left:auto;
  width:26px;
  height:26px;
  border-radius:50%;
  border:1px solid var(--sw-ui-line);
  background:transparent;
  color:var(--sw-ui-soft);
  cursor:pointer;
  line-height:1;
}
.swf-close:hover{background:rgba(79,143,232,.16)}

.swf-editor{
  display:flex;
  flex-direction:column;
  gap:10px;
  min-height:0;
  /* 覆盖层是 max-height + overflow:hidden 的固定高度；编辑器必须自己滚，
     否则内容一多，最后几行（世界书入口）会被直接裁掉——看起来就像没做这个功能。 */
  flex:1 1 auto;
  overflow-y:auto;
  overflow-x:hidden;
  scrollbar-gutter:stable;
}
.swf-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.swf-switch{
  display:inline-flex;
  align-items:center;
  gap:6px;
  font-size:12.5px;
  color:var(--sw-ui-soft);
  cursor:pointer;
  user-select:none;
}
.swf-switch input{accent-color:var(--sw-ui-accent)}
.swf-status{margin-left:auto;font-size:12px;color:var(--sw-ui-soft)}
.swf-status[data-tone="ok"]{color:#3f9d76}
.swf-status[data-tone="error"]{color:#d4455c}
.swf-text{
  min-height:220px;
  max-height:46vh;
  resize:vertical;
  padding:12px 14px;
  border:1px solid var(--sw-ui-line);
  border-radius:14px;
  background:var(--sw-ui-face2);
  color:var(--sw-ui-text);
  font-family:ui-monospace, "Cascadia Code", Consolas, "Microsoft YaHei", monospace;
  font-size:12.5px;
  line-height:1.75;
  outline:none;
}
.swf-text:focus{border-color:var(--sw-ui-accent);box-shadow:0 0 0 3px rgba(79,143,232,.16)}
.swf-btn{
  padding:6px 14px;
  border-radius:999px;
  border:1px solid var(--sw-ui-line);
  background:transparent;
  color:var(--sw-ui-text);
  font:inherit;
  font-size:12.5px;
  cursor:pointer;
}
.swf-btn:hover{background:rgba(79,143,232,.12)}
.swf-primary{
  border-color:transparent;
  background:linear-gradient(135deg, #5b9bff, #7a6fd0);
  color:#ffffff;
  font-weight:600;
}
.swf-primary:hover{filter:brightness(1.06)}
.swf-hint{margin:0;font-size:11.5px;line-height:1.7;color:var(--sw-ui-soft)}

.swf-page{display:flex;flex-direction:column;gap:12px;max-width:820px;padding:4px 2px 16px}
.swf-page-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap}
.swf-page-title{margin:0;font-size:16px}
/* 版本号只是"装的是哪一份"的标记，安静一点，别抢标题。 */
.swf-ver{
  font-size:11px;line-height:1;letter-spacing:.02em;padding:4px 9px;border-radius:999px;
  color:var(--sw-ui-soft);border:1px solid var(--sw-ui-line);background:rgba(255,255,255,.45);
  white-space:nowrap;font-variant-numeric:tabular-nums;
}
[data-ds-dark-theme] .swf-ver{background:rgba(255,255,255,.06)}
.swf-page-lead{margin:0;font-size:12.5px;line-height:1.75;color:var(--sw-ui-soft)}
.swf-page .swf-text{min-height:42vh}

/* ---- 背景：设置页一行入口 + 管理器里的缩略图卡片 ---- */
.swf-bg-strip{
  display:grid;
  grid-template-columns:repeat(auto-fill, minmax(112px, 1fr));
  gap:8px;
  min-width:0;
  max-width:100%;
}
.swf-bg-card{display:flex;flex-direction:column;gap:4px;min-width:0;max-width:100%}
.swf-bg-actions{display:flex;gap:4px;justify-content:center;flex-wrap:wrap}
.swf-bg-actions button{
  flex:0 0 auto;
  padding:3px 8px;
  border:1px solid var(--sw-ui-line);
  border-radius:999px;
  background:transparent;
  color:var(--sw-ui-soft);
  font:inherit;
  font-size:10.5px;
  line-height:1.2;
  cursor:pointer;
}
.swf-bg-actions button:hover{background:rgba(79,143,232,.12);color:var(--sw-ui-text)}
.swf-bg-actions button[data-on="1"]{
  border-color:var(--sw-ui-accent);
  background:rgba(79,143,232,.16);
  color:var(--sw-ui-text);
}
.swf-bg-thumb{
  flex:0 0 auto;
  width:100%;
  max-width:100%;
  padding:4px;
  overflow:hidden;
  border:1px solid var(--sw-ui-line);
  border-radius:10px;
  background:var(--sw-ui-face2);
  color:var(--sw-ui-soft);
  font:inherit;
  font-size:10.5px;
  line-height:1.5;
  cursor:pointer;
  text-align:center;
}
.swf-bg-thumb img{
  display:block;
  width:100%;
  height:58px;
  object-fit:cover;
  border-radius:6px;
  background:rgba(255,255,255,.5);
}
.swf-bg-thumb span{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.swf-bg-thumb[data-on="1"]{
  border-color:var(--sw-ui-accent);
  box-shadow:0 0 0 2px rgba(79,143,232,.22);
  color:var(--sw-ui-text);
}
/* 风格二选一：背景图 / 简约（无图）。简约那档就是"没加背景之前"的样子。 */
.swf-mode{
  display:inline-flex;
  flex:none;
  padding:2px;
  border:1px solid var(--sw-ui-line);
  border-radius:999px;
  background:var(--sw-ui-face2);
}
.swf-mode-btn{
  padding:4px 12px;
  border:none;
  border-radius:999px;
  background:transparent;
  color:var(--sw-ui-soft);
  font:inherit;
  font-size:12px;
  line-height:1.5;
  cursor:pointer;
}
.swf-mode-btn[data-on="1"]{
  background:var(--sw-ui-face);
  box-shadow:0 2px 8px rgba(63,127,217,.2);
  color:var(--sw-ui-text);
  font-weight:600;
}
/* 简约档下，跟图片有关的那些控件（轮换 / 间隔 / 淡化 / 下一张 / 缩略图）淡下去。 */
[data-bg-mode="plain"] .swf-bg-only{opacity:.4}
.swf-mode-note{font-size:11.5px;line-height:1.5;color:var(--sw-ui-soft)}

/* ---- 大小滑杆 / 上传（背景图与记忆管理器共用） ---- */
.swf-stickers-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-bottom:10px}
.swf-size{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--sw-ui-text)}
.swf-size input[type="range"]{width:150px;accent-color:var(--sw-ui-accent)}
.swf-size b{min-width:46px;font-weight:600;color:var(--sw-ui-accent)}
.swf-add{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:10px}
.swf-add input[type="text"]{
  min-width:0;
  flex:1 1 118px;
  max-width:100%;
  width:118px;
  padding:5px 8px;
  font:inherit;
  font-size:11.5px;
  color:var(--sw-ui-text);
  border:1px solid var(--sw-ui-line);
  border-radius:9px;
  background:var(--sw-ui-face);
}
.swf-add input[type="file"]{
  min-width:0;
  max-width:100%;
  font-size:11px;
  color:var(--sw-ui-soft);
}
/* 表情包网格与卡片 */
.swf-sticker-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill, minmax(80px, 1fr));
  gap:8px;
  padding-right:2px;
}
.swf-sticker{
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:4px;
  min-width:0;
  max-width:100%;
  overflow:hidden;
  padding:6px;
  border:1px solid var(--sw-ui-line);
  border-radius:12px;
  background:var(--sw-ui-face2);
}
.swf-sticker img{max-width:100%;width:min(72px, var(--swf-sticker-size, 96px));height:min(72px, var(--swf-sticker-size, 96px));object-fit:contain;border-radius:8px;background:rgba(255,255,255,.62)}
.swf-sticker b{max-width:100%;font-size:11.5px;font-weight:600;color:var(--sw-ui-text);word-break:break-word;text-align:center}
.swf-sticker em{max-width:100%;font-size:10.5px;font-style:normal;line-height:1.45;text-align:center;color:var(--sw-ui-soft);word-break:break-word}
.swf-del{
  align-self:flex-end;
  margin-top:2px;
  padding:1px 7px;
  font:inherit;
  font-size:10.5px;
  line-height:1.6;
  color:var(--sw-ui-soft);
  cursor:pointer;
  border:1px solid var(--sw-ui-line);
  border-radius:999px;
  background:transparent;
}
.swf-del:hover{color:#fff;border-color:transparent;background:var(--sw-ui-accent)}
.swf-empty{margin:0;font-size:11.5px;line-height:1.7;color:var(--sw-ui-soft)}

/* ---- 管理器：单独一页，入口只有一行 ----
   管理器是一个覆盖层（.swf-overlay--wide），高度由覆盖层自己封顶，里面的
   .swf-manager-scroll 才负责滚动 —— 网格再长也只会在这块区域里滚，
   不会把卡片顶出面板外。卡片和文字都锁了 max-width/min-width:0 + 断词，
   窄面板下长名字也不会把格子撑破。 */
.swf-overlay--wide{width:min(560px, calc(100vw - 48px))}
.swf-manager{display:flex;flex-direction:column;gap:10px;min-height:0;flex:1 1 auto}
.swf-manager-scroll{
  flex:1 1 auto;
  min-height:0;
  overflow-y:auto;
  overflow-x:hidden;
  padding-right:2px;
  display:flex;
  flex-direction:column;
  gap:10px;
}
/* 滚动容器是 flex 列，子项默认会「缩」而不是「滚」：条目一多，列表先被压扁，
   卡片就画到下面的说明文字上（世界书 279 条时一眼就看见文字叠在一起）。
   把直接子项钉成不缩放，让内容真的把容器撑高、由 overflow-y 接管。 */
.swf-manager-scroll > *{flex:0 0 auto}
.swf-manager-status{margin-left:auto;font-size:12px;color:var(--sw-ui-soft)}
.swf-manager-status[data-tone="ok"]{color:#3f9d76}
.swf-manager-status[data-tone="error"]{color:#d4455c}
/* 「看原文」的内联预览：桌面壳会把 target=_blank 的新窗口拦下来（点了像没反应），
   所以默认在这里就地展开；长文本自己滚，不把管理器撑爆。 */
.swf-raw{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:12px;border:1px solid var(--sw-ui-line);background:var(--sw-ui-face2)}
.swf-raw[hidden]{display:none}
.swf-raw-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.swf-raw-title{font-size:11.5px;color:var(--sw-ui-soft)}
.swf-raw-actions{display:flex;gap:6px;flex-wrap:wrap}
.swf-raw-actions .swf-btn{font-size:11.5px;padding:3px 9px;margin:0}
.swf-raw-body{
  margin:0;max-height:260px;overflow:auto;
  white-space:pre-wrap;word-break:break-word;
  font-size:11.5px;line-height:1.6;color:var(--sw-ui-text);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
}
/* 「在浏览器打开」被壳拦下时，地址直接摆在点击的地方（可选中、可复制）。 */
.swf-raw-url{
  display:block;padding:6px 8px;border-radius:8px;
  border:1px dashed var(--sw-ui-line);background:rgba(255,255,255,.5);
  font-size:11.5px;line-height:1.5;color:var(--sw-ui-text);word-break:break-all;
  user-select:text;-webkit-user-select:text;cursor:text;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
}
.swf-raw-url[hidden]{display:none}
.swf-entry{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:8px;
  margin-top:6px;
  padding-top:12px;
  border-top:1px dashed var(--sw-ui-line);
}
.swf-entry-info{display:flex;align-items:baseline;gap:8px;font-size:12.5px;color:var(--sw-ui-text)}
.swf-entry-info span{font-size:11.5px;color:var(--sw-ui-soft)}
.swf-entry .swf-btn{margin-left:auto}
.swf-mem-list{display:flex;flex-direction:column;gap:8px;min-height:0}
.swf-mem-item{
  display:flex;flex-direction:column;gap:4px;
  padding:9px 11px;border-radius:12px;
  border:1px solid var(--sw-ui-line);
  background:var(--sw-ui-face2);
}
.swf-mem-text{margin:0;font-size:12.5px;line-height:1.6;color:var(--sw-ui-text);word-break:break-word}
.swf-mem-meta{font-size:11px;line-height:1.4;color:var(--sw-ui-soft);font-variant-numeric:tabular-nums}
.swf-mem-item > .swf-btn{align-self:flex-end;margin-top:2px;font-size:11.5px;padding:3px 9px}
.swf-mem-file{flex-wrap:wrap;align-items:center;gap:6px 8px;padding-top:2px}
.swf-mem-path{
  flex:1 1 100%;min-width:0;font-size:11px;line-height:1.5;
  color:var(--sw-ui-soft);word-break:break-all;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}

/* =====================================================================
   对话界面微调（不跟主题开关走：换掉新会话欢迎页的内置鱼 + 自带艺术字欢迎语，
   并把输入框的默认占位提示换成银狼的招呼语）
   ===================================================================== */

/* ---- 新会话欢迎页：形象 + 艺术字欢迎语 ---- */
/* 内置文案（「探索未至之境」）和我们的形象同在一行 [class*="_headline"] 里，
   有我们的形象时把它藏掉。藏哪个 span 要按运行版来：运行版把它放在 [class*="_titleGroup"]
   里、是个没有 class 的 span（带 class 的同级是「预览版」badge）；早一些的构建则给它
   _headlineText。两种都写上；顺带把 grid 那版的首列从 34px 放开，72px 的头像才不被压扁。 */
[class*="_headline"]:has(.swf-hero){grid-template-columns:auto}
[class*="_headline"]:has(.swf-hero) [class*="_headlineText"],
[class*="_headline"]:has(.swf-hero) [class*="_titleGroup"] > span:not([class]){display:none}
/* 官方那枚「预览版」徽标也一起收掉：有银狼的形象和欢迎语时，这一行只留它们俩。 */
[class*="_headline"]:has(.swf-hero) [class*="_previewBadge"]{display:none}
/* 整行都不接指针：这一行只剩银狼的形象和欢迎语，点哪都不该有反应。
   写在行上（而不是只写在自己的容器上），免得宿主那层槽位外壳把点击接走。 */
[class*="_headline"]:has(.swf-hero){pointer-events:none;user-select:none;-webkit-user-select:none}
.swf-hero{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:12px;
  /* 这一行是纯装饰：形象点不响、文字选不中、图也拖不动。
     pointer-events / user-select 都会被继承，所以写在容器上就够；
     cursor:default 是给"手型光标"兜底（万一哪层宿主元素带了 cursor:pointer）。 */
  pointer-events:none;
  user-select:none;
  -webkit-user-select:none;
  cursor:default;
}
.swf-hero-mark{
  display:block;
  height:72px;
  width:auto;
  max-width:96px;
  object-fit:contain;
  /* 素材本身就是带透明通道的贴纸（meme 里的 Q 版立绘），是"把图单独扣出来贴上去"的那种：
     所以这里**什么都不再画**——没有 border、没有底盘、没有 border-radius、没有遮罩，
     抠出来的轮廓自己就是边界，和背景之间没有任何过渡痕迹。
     这层投影是 drop-shadow，跟着 alpha 轮廓走（不是 box-shadow 那种方框影），
     只是让她像贴纸一样落在页面上；不想要的话删掉这一行即可。 */
  filter:drop-shadow(0 5px 12px rgba(79,143,232,.3));
  /* 不许拖拽：Chromium 里图片默认可以被拖出一个影子，这里关掉。 */
  -webkit-user-drag:none;
}
.swf-hero-mark[data-swf-missing="1"]{display:none}
.swf-hero-title{
  display:inline-flex;
  align-items:baseline;
  gap:2px;
  /* 方正舒体打头（笔画细、有手写味），其次幼圆、华文琥珀；最后一定收在无衬线，
     免得哪个字重的字体没命中时掉回宋体那一类衬线字（「不要再像宋体」）。 */
  font-family:"FZShuTi","方正舒体","YouYuan","幼圆","STHupo","华文琥珀","Microsoft YaHei UI","微软雅黑",system-ui,sans-serif;
  font-size:32px;
  line-height:40px;
  font-weight:600;
  letter-spacing:1px;
}
.swf-hero-title-text{
  /* 银蓝 → 冷白：上端是饱和的蓝，越往下越浅，最后落到近白 */
  background:linear-gradient(168deg,#5b9bff 0%,#8fbaff 34%,#cfe0ff 68%,#f2f7ff 100%);
  -webkit-background-clip:text;
  background-clip:text;
  -webkit-text-fill-color:transparent;
  color:transparent;
  /* 白尾部分在白底上会飘，所以描一圈蓝边 + 一层很浅的蓝影把它托住 */
  -webkit-text-stroke:1.1px #3f7fd9;
  filter:drop-shadow(0 1px 0 rgba(255,255,255,.85)) drop-shadow(0 3px 8px rgba(63,127,217,.34));
}
@supports not (background-clip:text){
  .swf-hero-title-text{background:none;color:#3f7fd9;-webkit-text-fill-color:currentColor;text-shadow:0 1px 0 rgba(255,255,255,.8)}
}
/* ---- 窄屏（手机 / 分屏 / 桌面小窗）----
   欢迎页那一行是「头像 + 32px 艺术字」，在 360px 宽的屏上会整行顶出去。
   窄屏时缩字号、允许换行、把形象收小；覆盖层也用满可用宽度。 */
@media (max-width: 620px){
  body[data-dsh-silverwolf][data-silverwolf-skin="on"] .swf-hero{
    flex-wrap:wrap;
    gap:6px 8px;
    max-width:calc(100vw - 28px);
    padding:0 4px;
  }
  body[data-dsh-silverwolf][data-silverwolf-skin="on"] .swf-hero-mark{height:52px;max-width:64px}
  body[data-dsh-silverwolf][data-silverwolf-skin="on"] .swf-hero-title{
    flex-wrap:wrap;
    justify-content:center;
    max-width:100%;
    font-size:clamp(19px, 6.2vw, 26px);
    line-height:1.32;
    letter-spacing:.5px;
  }
  body[data-dsh-silverwolf][data-silverwolf-skin="on"] .swf-hero-title-text{
    -webkit-text-stroke:.8px #3f7fd9;
    overflow-wrap:anywhere;
  }
  .swf-overlay{
    width:calc(100vw - 20px);
    max-width:calc(100vw - 20px);
    max-height:calc(100vh - 28px);
    padding:14px 12px;
  }
  .swf-overlay--wide{width:calc(100vw - 20px)}
}
/* 横屏手机 / 很矮的窗口：欢迎页只留一句能看的话，不再和输入框抢高度。 */
@media (max-height: 480px){
  body[data-dsh-silverwolf][data-silverwolf-skin="on"] .swf-hero-mark{height:44px;max-width:56px}
  body[data-dsh-silverwolf][data-silverwolf-skin="on"] .swf-hero-title{font-size:clamp(17px, 4.6vw, 22px);line-height:1.2}
}

/* ---- 输入框占位提示 ---- */
/* 可见的那句占位提示是 [data-composer-input] 的紧邻兄弟 [data-composer-placeholder]
   （宿主把同一段文案既写到 contenteditable 的 data-placeholder 上，也写进它自己的
   文本节点），没有 i18n 覆盖的口子；把原字染成透明，再用自己的 ::after 写一句。
   闸门开在兄弟节点的 data-placeholder 前缀上：只有「默认」与「欢迎页默认」这两种
   文案会被换掉，「会话不可用 / 父会话已离线 / 排队插话 / 计划模式 / 选择工作区」
   这些状态提示原样保留。纯 CSS：不动 DOM、不碰宿主词典。 */
body[data-dsh-silverwolf] [data-composer-input][data-placeholder^="发消息或创建任务"] + [data-composer-placeholder],
body[data-dsh-silverwolf] [data-composer-input][data-placeholder^="描述你想要构建的内容"] + [data-composer-placeholder],
body[data-dsh-silverwolf] [data-composer-input][data-placeholder^="Message or run a task"] + [data-composer-placeholder],
body[data-dsh-silverwolf] [data-composer-input][data-placeholder^="Describe what you want to build"] + [data-composer-placeholder]{color:transparent}
/* 透明的那串原字仍然占着宽度：直接往后接一句会被它顶到右边去（欢迎页那版容器是
   -webkit-box + 两行 clamp，还会把新文案挤到第二行）。所以把新文案绝对定位钉回
   容器左上角——那正是原字的起点，也就和输入的文字同一个左边距。 */
body[data-dsh-silverwolf] [data-composer-input][data-placeholder^="发消息或创建任务"] + [data-composer-placeholder]::after,
body[data-dsh-silverwolf] [data-composer-input][data-placeholder^="描述你想要构建的内容"] + [data-composer-placeholder]::after,
body[data-dsh-silverwolf] [data-composer-input][data-placeholder^="Message or run a task"] + [data-composer-placeholder]::after,
body[data-dsh-silverwolf] [data-composer-input][data-placeholder^="Describe what you want to build"] + [data-composer-placeholder]::after{
  content:"${PLACEHOLDER_TEXT}";
  position:absolute;
  left:0;
  top:0;
  text-align:left;
  white-space:nowrap;
  /* 明写一套无衬线：这句是中文，掉进衬线字库里就会像宋体 */
  font-family:"Microsoft YaHei UI","微软雅黑","PingFang SC","Hiragino Sans GB","Noto Sans SC",system-ui,sans-serif;
  font-size:inherit;
  line-height:inherit;
  color:var(--dsw-alias-label-caption, rgba(120,90,110,.78));
}
`;

    // ---------------------------------------------------------------------
    // 状态：客户端只缓存一份，真正的真相在宿主半
    // ---------------------------------------------------------------------
    const state = {
      persona: "", enabled: true, theme: true, stickers: true, rev: 0,
      /** 聊天里贴图的最大边长（px）：落到 body 上的 --swf-sticker-size。 */
      stickerSize: 96,
      defaultPersona: "", statePath: "",
      /** 插件自己的版本号（宿主半从 package.json 读出来带过来的，只用于显示）。 */
      pluginVersion: "",
      /** 新会话欢迎语（空串表示用 HERO_TITLE_FALLBACK）；形象字节由宿主半发。 */
      heroTitle: "", heroReady: true,
      /**
       * 整页背景图。current 是"锚点图"的文件名（空串＝按目录顺序第一张），
       * dim 是色纱浓度（越大越淡），rotate/interval 决定要不要自己换下一张。
       * 深浅色与背景图不绑定：外观走宿主主题服务，背景只看 current。
       * 轮换只发生在页面里，不会每次换图都回写宿主（省得写盘写不停）。
       */
      background: { enabled: true, current: "", rotate: false, interval: 90, dim: 0.6 },
    };
    /** 背景图清单（宿主半扫 Background/ 得来的快照）。 */
    let backgroundItems = [];
    let backgroundNote = "";
    /** 当前铺在页面上的那张在清单里的下标（轮换会推着它走）。 */
    let backgroundIndex = 0;
    /** 背景层与轮换定时器（都是模块级：刷新与轮换只动这一份）。 */
    let backgroundLayer = null;
    let rotationTimer = null;
    /** 上一次"按锚点铺图"的凭据：锚点或清单变了才重铺，免得把轮换进度拽回去。 */
    let backgroundAnchor = null;
    /** 表情包清单（宿主半读包内 stickers.json 得来的快照）。 */
    let stickerItems = [];
    let stickerNote = "";
    let ready = false;
    let failure = null;
    const watchers = new Set();
    /** 有未保存编辑的编辑器：外部同步要避开它们，免得盖掉正在写的东西。 */
    const pendingEdits = new Set();

    function log(level, message, error) {
      const emit = console[level] || console.log;
      if (error === undefined) emit("[" + PACKAGE_ID + "] " + message);
      else emit("[" + PACKAGE_ID + "] " + message, error);
    }

    function notify() {
      watchers.forEach((fn) => {
        try {
          fn();
        } catch (error) {
          log("error", "界面刷新失败", error);
        }
      });
    }

    function endpoint() {
      return new URL(API_PATH, document.baseURI).href;
    }

    /**
     * 读写宿主半的 fenced 路由；非 {ok:true,value} 的信封一律当失败。
     * POST 一律带上"我读到的是哪一版"（rev），宿主据此拒绝过期写入；
     * 失败时把宿主的错误码挂在 error.code 上，交给调用方决定要不要重新载入。
     */
    async function request(method, patch) {
      const response = await fetch(endpoint(), method === "POST"
        ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.assign({ rev: state.rev }, patch || {})),
        }
        : { method: "GET" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload === null || payload.ok !== true || !payload.value) {
        const message = payload && payload.error && payload.error.message
          ? payload.error.message
          : "HTTP " + response.status;
        const error = new Error(message);
        if (payload && payload.error && payload.error.code) error.code = payload.error.code;
        throw error;
      }
      return payload.value;
    }

    function absorb(value) {
      if (typeof value.persona === "string") state.persona = value.persona;
      if (typeof value.enabled === "boolean") state.enabled = value.enabled;
      if (typeof value.theme === "boolean") state.theme = value.theme;
      if (typeof value.stickers === "boolean") state.stickers = value.stickers;
      if (Number.isFinite(value.stickerSize)) state.stickerSize = value.stickerSize;
      if (value.hero !== null && typeof value.hero === "object") {
        if (typeof value.hero.title === "string") state.heroTitle = value.hero.title;
        if (typeof value.hero.ready === "boolean") state.heroReady = value.hero.ready;
      }
      if (value.background !== null && typeof value.background === "object") {
        const bg = value.background;
        if (typeof bg.enabled === "boolean") state.background.enabled = bg.enabled;
        if (typeof bg.current === "string") state.background.current = bg.current;
        if (typeof bg.rotate === "boolean") state.background.rotate = bg.rotate;
        if (Number.isFinite(bg.interval)) state.background.interval = bg.interval;
        if (Number.isFinite(bg.dim)) state.background.dim = bg.dim;
      }
      if (Number.isInteger(value.rev) && value.rev >= 0) state.rev = value.rev;
      if (typeof value.defaultPersona === "string") state.defaultPersona = value.defaultPersona;
      if (typeof value.statePath === "string") state.statePath = value.statePath;
      if (typeof value.version === "string") state.pluginVersion = value.version;
      ready = true;
      failure = null;
    }

    /** 主题开关落到 body 属性上；样式表只认 on。色纱浓度与贴图大小落到 CSS 变量上。 */
    function applySkin() {
      if (!document.body) return;
      document.body.setAttribute(SKIN_ATTR, state.theme ? "on" : "off");
      const size = Number.isFinite(state.stickerSize) ? Math.round(state.stickerSize) : 96;
      document.body.style.setProperty("--swf-sticker-size", size + "px");
      applyBackground();
    }

    /** 把设置页里点选的文件读成 data URL（FileReader 在渲染进程里是同步可用的）。 */
    function readAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
        reader.readAsDataURL(file);
      });
    }

    /**
     * 上传 / 删除自定义表情包：都走宿主半的 fenced 路由，成功回一份新快照。
     * 返回前顺手把新状态吸进 state（rev 也跟着 +1），调用方直接重画即可。
     */
    async function postStickers(action, payload) {
      const url = new URL(STICKERS_PATH + action, document.baseURI).href;
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.assign({ rev: state.rev }, payload || {})),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body === null || body.ok !== true || !body.value) {
        const message = body && body.error && body.error.message
          ? body.error.message
          : "HTTP " + response.status;
        const error = new Error(message);
        if (body && body.error && body.error.code) error.code = body.error.code;
        throw error;
      }
      if (body.value.state) absorb(body.value.state);
      if (body.value.stickers) applyStickers(body.value.stickers);
      notify();
      return body.value;
    }

    /**
     * 背景图的上传 / 删除：写操作必须带 rev；
     * 宿主回一份新状态 + 新清单，客户端整体吸收后重铺。
     */
    async function postBackgrounds(action, payload) {
      const url = new URL(BACKGROUNDS_PATH + action, document.baseURI).href;
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.assign({ rev: state.rev }, payload || {})),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body === null || body.ok !== true || !body.value) {
        const message = body && body.error && body.error.message
          ? body.error.message
          : "HTTP " + response.status;
        const error = new Error(message);
        if (body && body.error && body.error.code) error.code = body.error.code;
        throw error;
      }
      if (body.value.state) absorb(body.value.state);
      if (body.value.backgrounds) applyBackgrounds(body.value.backgrounds);
      applySkin();
      notify();
      return body.value;
    }

    // ---------------------------------------------------------------------
    // 活页面取证（诊断旁路）
    // 桌面外壳的活页面在受限沙箱里既截不了图、也没有 DOM 读取通道，皮肤出现
    // 视觉问题时只能让页面自己把「谁带了 backdrop-filter、谁是大面积半透明」
    // 报给宿主（POST /silverwolf/report，只存宿主内存）。任何一步失败都只是少一份
    // 诊断，绝不打扰主题与人格。
    // ---------------------------------------------------------------------
    const REPORT_ATTRS = [
      "data-slot", "data-dockkit-pane", "data-dockkit-float", "data-dockkit-host",
      "data-sidebar-right-panel", "data-sidebar-right-open", "data-shell-overlay", "role",
    ];

    /** 把元素描述成一行可读的标签（tag + 关键属性 + class/id）。 */
    function describeElement(el) {
      const parts = [];
      for (const name of REPORT_ATTRS) {
        const value = el.getAttribute ? el.getAttribute(name) : null;
        // 空字符串是布尔属性的常态（data-shell-overlay=""），照样要报出来。
        if (value === null || value === undefined) continue;
        parts.push(value === "" ? name : name + "=" + String(value).slice(0, 60));
      }
      const cls = el.getAttribute ? el.getAttribute("class") : null;
      if (cls) parts.push("class=" + String(cls).slice(0, 90));
      const id = el.getAttribute ? el.getAttribute("id") : null;
      if (id) parts.push("id=" + String(id).slice(0, 40));
      return el.tagName.toLowerCase() + (parts.length ? "[" + parts.join(" ") + "]" : "");
    }

    /** 从 CSS 颜色里抠出 alpha（不认识就当 1：宁可漏报，也不误报）。 */
    function alphaOf(color) {
      if (typeof color !== "string") return 1;
      const trimmed = color.trim();
      if (/^transparent$/i.test(trimmed)) return 0;
      const match = trimmed.match(/rgba?\(([^)]+)\)/);
      if (match === null) return 1;
      const parts = match[1].split(",").map((piece) => piece.trim());
      if (parts.length < 4) return 1;
      const alpha = Number(parts[3]);
      return Number.isFinite(alpha) ? alpha : 1;
    }

    /**
     * 扫一遍 body 下的元素，挑出「可能造成发糊」的：
     * 带 backdrop-filter 的，以及面积占视口 ≥15% 且背景半透明的。
     */
    function collectReport() {
      const body = document.body;
      if (!body) return null;
      const view = typeof window !== "undefined" ? window : null;
      const width = view && Number.isFinite(view.innerWidth) ? view.innerWidth : 0;
      const height = view && Number.isFinite(view.innerHeight) ? view.innerHeight : 0;
      const viewport = Math.max(1, width * height);
      const read = view && typeof view.getComputedStyle === "function" ? view.getComputedStyle.bind(view) : null;
      const entries = [];
      const queue = [body];
      while (queue.length > 0 && queue.length < 4000) {
        const el = queue.shift();
        if (el.children) for (const child of Array.from(el.children)) queue.push(child);
        if (read === null || typeof el.getBoundingClientRect !== "function") continue;
        const style = read(el);
        if (!style) continue;
        const blur = String(style.backdropFilter || style.webkitBackdropFilter || "none");
        const background = String(style.backgroundColor || "");
        const rect = el.getBoundingClientRect();
        const area = Math.max(0, Math.round(rect.width * rect.height));
        const share = Math.round((area / viewport) * 100);
        const alpha = alphaOf(background);
        const blurred = blur !== "" && blur !== "none";
        if (!blurred && !(alpha < 1 && share >= 15)) continue;
        entries.push({
          el: describeElement(el),
          blur: blurred ? blur : null,
          bg: background,
          alpha: Math.round(alpha * 100) / 100,
          share,
          rect: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
          position: style.position,
          visibility: style.visibility,
          zIndex: style.zIndex,
          opacity: style.opacity,
        });
      }
      entries.sort((a, b) => b.share - a.share);
      // 注意：这里刻意不带时间戳 —— 时间戳由 pushReport 在真正上报时加上，
      // 好让「内容没变就不重复上报」的去重真的成立。
      return {
        kind: "silverwolf-dom-report",
        theme: state.theme === true,
        viewport: [width, height],
        blurCount: entries.filter((entry) => entry.blur !== null).length,
        entries: entries.slice(0, 60),
      };
    }

    let lastReportJson = "";
    let reportTimer = null;

    /** 上报一份取证；内容与上次相同就不重复发（force 用来抓开机快照）。 */
    async function pushReport(force) {
      const report = collectReport();
      if (report === null) return;
      const text = JSON.stringify(report);
      if (force !== true && text === lastReportJson) return;
      lastReportJson = text;
      const body = JSON.stringify({ ...report, at: new Date().toISOString() });
      try {
        const response = await fetch(new URL(REPORT_PATH, document.baseURI).href, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        // 宿主半还是旧构建时这条路由不存在（404）：清掉去重标记，
        // 这样插件行重载之后无需再刷新页面也能把报告补上。
        if (response !== undefined && response !== null && response.ok === false) lastReportJson = "";
      } catch (error) {
        lastReportJson = "";
        log("warn", "取证上报失败（不影响主题）", error);
      }
    }

    async function load(force) {
      if (ready && force !== true) return;
      try {
        absorb(await request("GET"));
      } catch (error) {
        failure = error;
        log("warn", "读不到宿主设置（" + endpoint() + "），先用本地默认值", error);
      }
      applySkin();
      notify();
    }

    /**
     * 背景层：整页固定在最底层的一层，里面两张 .swf-bg-img 轮流当"当前图"
     * （换图时新的淡入、旧的淡出，所以不用重建 DOM）+ 一层色纱。
     * 只在 body 上挂一个元素（z-index:-1、pointer-events:none），卸载时整块摘掉。
     */
    function ensureBackgroundLayer() {
      if (backgroundLayer !== null) return backgroundLayer;
      const el = document.createElement("div");
      el.className = "swf-bg";
      el.setAttribute("aria-hidden", "true");
      const first = document.createElement("div");
      first.className = "swf-bg-img";
      const second = document.createElement("div");
      second.className = "swf-bg-img";
      const veil = document.createElement("div");
      veil.className = "swf-bg-veil";
      el.append(first, second, veil);
      document.body.appendChild(el);
      backgroundLayer = { el, imgs: [first, second], active: 0 };
      return backgroundLayer;
    }

    /**
     * 现在该铺哪一张：只看 `state.background.current`（用户点的那张起点）。
     * 深浅色与背景图**不绑定**——外观归外观、背景归背景，各按各的喜好选。
     */
    function effectiveAnchor() {
      return typeof state.background.current === "string" ? state.background.current : "";
    }

    /** 锚点图在清单里的下标：找不到（被删了 / 还没读过清单）就用第一张。 */
    function anchoredIndex() {
      if (backgroundItems.length === 0) return -1;
      const anchor = effectiveAnchor();
      if (anchor !== "") {
        const found = backgroundItems.findIndex((item) => item.id === anchor);
        if (found >= 0) return found;
      }
      return 0;
    }

    /**
     * 把第 index 张铺上去（下标越界就绕回来）。fade 为 false 时不叠旧图，
     * 首屏直接亮起、不闪一下渐变。
     */
    function showBackground(index, fade) {
      if (backgroundItems.length === 0) return;
      const count = backgroundItems.length;
      const item = backgroundItems[((index % count) + count) % count];
      const layer = ensureBackgroundLayer();
      backgroundIndex = backgroundItems.indexOf(item);
      const next = 1 - layer.active;
      const img = layer.imgs[next];
      const src = backgroundSrc(item);
      img.style.backgroundImage = 'url("' + src + '")';
      // 手机外壳（dsh-mobile-apk）上出现过"图不出"的报告：这里探一次字节能不能取到。
      // CSS 背景的加载失败不会冒到 JS，只能靠这个 <img> 探针把失败记进日志。
      if (typeof Image === "function") {
        const probe = new Image();
        probe.onerror = () => log("warn", "背景图取不到：" + src);
        probe.src = src;
      }
      if (fade === true) layer.imgs[layer.active].removeAttribute("data-active");
      else for (const one of layer.imgs) one.removeAttribute("data-active");
      img.setAttribute("data-active", "1");
      layer.active = next;
    }

    function stopRotation() {
      if (rotationTimer !== null) clearInterval(rotationTimer);
      rotationTimer = null;
    }

    /** 轮换：只换页面上的图，不回写宿主（current 是用户手选的锚点，别被轮换推着走）。 */
    function startRotation() {
      stopRotation();
      if (backgroundItems.length < 2 || typeof setInterval !== "function") return;
      const seconds = Number.isFinite(state.background.interval) ? state.background.interval : BG_INTERVAL_FALLBACK;
      rotationTimer = setInterval(() => {
        showBackground(backgroundIndex + 1, true);
        notify();
      }, Math.max(BG_INTERVAL_MIN, seconds) * 1000);
      if (rotationTimer && typeof rotationTimer.unref === "function") rotationTimer.unref();
    }

    /**
     * 背景的总开关：跟着主题开关走（关掉主题就回到原生外观，图片也没地方透出来）。
     * 图还没读回来（清单为空）时整层不显示，页面上就是原来的银白赛博渐变。
     * 只有"锚点变了 / 清单变了"才重铺——否则会把轮换走的进度拽回去。
     */
    function applyBackground() {
      if (!document.body) return;
      const bg = state.background;
      const dim = Number.isFinite(bg.dim) ? bg.dim : BG_DIM_FALLBACK;
      document.body.style.setProperty("--swf-bg-dim", String(dim));
      const on = state.theme === true && bg.enabled === true && backgroundItems.length > 0;
      document.body.setAttribute("data-swf-bg", on ? "on" : "off");
      if (!on) {
        stopRotation();
        return;
      }
      const anchor = effectiveAnchor();
      const listKey = backgroundItems.map((item) => item.id).join("|") + "#" + anchor;
      if (backgroundAnchor === null
        || backgroundAnchor.listKey !== listKey
        || backgroundAnchor.anchorId !== anchor) {
        showBackground(anchoredIndex(), false);
        backgroundAnchor = { listKey, anchorId: anchor };
      }
      if (bg.rotate === true) startRotation();
      else stopRotation();
    }

    /** 把宿主半给的表情包清单吸进本地缓存（含缺失 / 解析失败的提示）。 */
    function applyStickers(value) {
      stickerItems = Array.isArray(value.items) ? value.items : [];
      const missing = Array.isArray(value.missing) ? value.missing.length : 0;
      if (missing > 0) stickerNote = "，另有 " + missing + " 个文件没找到";
      else if (value.error) stickerNote = "（清单解析失败）";
      else stickerNote = "";
    }

    /**
     * 读表情包清单（包内 stickers.json + 用户自添加的那些）。
     * 失败只影响这块管理页，不影响人格与主题。
     */
    async function loadStickers() {
      try {
        const response = await fetch(new URL(STICKERS_PATH, document.baseURI).href, { method: "GET" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload === null || payload.ok !== true || !payload.value) {
          throw new Error("HTTP " + response.status);
        }
        applyStickers(payload.value);
      } catch (error) {
        stickerItems = [];
        stickerNote = "（宿主未响应）";
        log("warn", "读不到表情包清单（不影响主题与人格）", error);
      }
      notify();
    }

    /** 把宿主半给的背景清单吸进本地缓存（含目录读不到 / 空的提示）。 */
    function applyBackgrounds(value) {
      backgroundItems = Array.isArray(value.items) ? value.items : [];
      if (value.error) backgroundNote = "（Background/ 读不出来）";
      else if (backgroundItems.length === 0) backgroundNote = "（Background/ 里还没有图）";
      else backgroundNote = "";
    }

    /**
     * 读背景清单（Background/ 的扫描结果）。每次都带 reload=1：
     * 这一份真相在磁盘上（用户随时往文件夹里丢图），宿主进程活得比页面久，
     * 不强制重扫的话刷新页面也看不到新图。
     * 失败或为空只影响这块：页面照旧是渐变底，主题与人格不受影响。
     */
    async function loadBackgrounds() {
      try {
        const url = new URL(BACKGROUNDS_PATH, document.baseURI);
        url.searchParams.set("reload", "1");
        const response = await fetch(url.href, { method: "GET" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload === null || payload.ok !== true || !payload.value) {
          throw new Error("HTTP " + response.status);
        }
        applyBackgrounds(payload.value);
      } catch (error) {
        backgroundItems = [];
        backgroundNote = "（宿主未响应）";
        log("warn", "读不到背景清单（不影响主题与人格）", error);
      }
      applyBackground();
      notify();
    }

    // ---------------------------------------------------------------------
    // 长期记忆：真相在宿主半的 silverwolf-memory.json，这里只负责读写与展示。
    // 记忆不进 state（它有自己的 rev），所以单独一份缓存、单独一条 POST。
    // ---------------------------------------------------------------------
    let memoryBook = { error: null, enabled: true, rev: 0, count: 0, limit: 300, items: [] };

    /** 把宿主给的快照吸进本地缓存（字段一律兜底，老宿主少给字段也不崩）。 */
    function applyMemories(value) {
      memoryBook = {
        error: typeof value.error === "string" ? value.error : null,
        enabled: value.enabled !== false,
        rev: Number.isInteger(value.rev) ? value.rev : 0,
        count: Number.isInteger(value.count) ? value.count : (Array.isArray(value.items) ? value.items.length : 0),
        limit: Number.isInteger(value.limit) ? value.limit : 300,
        path: typeof value.path === "string" ? value.path : "",
        items: Array.isArray(value.items) ? value.items : [],
      };
    }

    async function loadMemories() {
      try {
        const url = new URL(MEMORY_PATH, document.baseURI);
        const response = await fetch(url.href, { method: "GET" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload === null || payload.ok !== true || !payload.value) {
          throw new Error("HTTP " + response.status);
        }
        applyMemories(payload.value);
      } catch (error) {
        memoryBook = { ...memoryBook, error: "（宿主未响应）", items: [], count: 0 };
        log("warn", "读不到长期记忆（不影响主题与人格）", error);
      }
      notify();
    }

    /** 让宿主在文件管理器里定位记忆文件（不回快照，所以单独走一条）。 */
    async function revealMemoryFile() {
      const url = new URL(MEMORY_PATH + "/reveal", document.baseURI);
      const response = await fetch(url.href, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = await response.json().catch(() => null);
      if (body === null || body.ok !== true) {
        const code = body && body.error && body.error.code ? body.error.code : "HTTP " + response.status;
        const error = new Error(code);
        error.code = code;
        throw error;
      }
      return body.value ?? null;
    }

    /** 一个动作一条 POST；宿主回整份快照，直接顶掉本地缓存。 */
    async function postMemory(action, payload) {
      const url = new URL(MEMORY_PATH, document.baseURI);
      const response = await fetch(url.href, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.assign({ rev: memoryBook.rev, action }, payload || {})),
      });
      const body = await response.json().catch(() => null);
      if (body !== null && body.ok === true && body.value) {
        applyMemories(body.value);
        notify();
        return body.value;
      }
      const code = body && body.error && body.error.code ? body.error.code : "HTTP " + response.status;
      const error = new Error(body && body.error && body.error.message ? body.error.message : code);
      error.code = code;
      throw error;
    }

    // ---------------------------------------------------------------------
    // 世界书：真相在宿主半的 silverwolf-worldbook.json（几十万字，只在需要时取）。
    // 这一侧只拿「条目索引」，正文从不进浏览器内存——省内存也免得列表卡顿。
    // ---------------------------------------------------------------------
    let worldbookBook = {
      error: null,
      count: 0,
      version: "",
      fetchedAt: "",
      path: "",
      source: "",
      characters: [],
      categories: [],
      entries: [],
    };

    /** 吸一份宿主快照，字段一律兜底。 */
    function applyWorldbook(value) {
      worldbookBook = {
        error: typeof value.error === "string" ? value.error : null,
        count: Number.isInteger(value.count) ? value.count : (Array.isArray(value.entries) ? value.entries.length : 0),
        version: typeof value.version === "string" ? value.version : "",
        fetchedAt: typeof value.fetchedAt === "string" ? value.fetchedAt : "",
        path: typeof value.path === "string" ? value.path : "",
        source: typeof value.source === "string" ? value.source : "",
        characters: Array.isArray(value.characters) ? value.characters : [],
        categories: Array.isArray(value.categories) ? value.categories : [],
        entries: Array.isArray(value.entries) ? value.entries : [],
      };
    }

    async function loadWorldbook(reload) {
      try {
        const url = new URL(WORLDBOOK_PATH, document.baseURI);
        if (reload === true) url.searchParams.set("reload", "1");
        const response = await fetch(url.href, { method: "GET" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload === null || payload.ok !== true || !payload.value) {
          throw new Error("HTTP " + response.status);
        }
        applyWorldbook(payload.value);
      } catch (error) {
        worldbookBook = { ...worldbookBook, error: "（宿主未响应）", count: 0, entries: [], characters: [] };
        log("warn", "读不到世界书（不影响主题与人格）", error);
      }
      notify();
    }

    /** 一个动作一条 POST：reload / clear / fetch。宿主回整份索引。 */
    async function postWorldbook(action) {
      const url = new URL(WORLDBOOK_PATH, document.baseURI);
      const response = await fetch(url.href, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => null);
      if (body !== null && body.ok === true && body.value) {
        applyWorldbook(body.value);
        notify();
        return body.value;
      }
      const code = body && body.error && body.error.code ? body.error.code : "HTTP " + response.status;
      const error = new Error(body && body.error && body.error.message ? body.error.message : code);
      error.code = code;
      throw error;
    }

    /**
     * 打开世界书文件所在位置（交给系统文件管理器）。
     * 这条回的是 `{ opened, path }` 而不是整份索引，所以不能走 postWorldbook
     * ——否则会把快照当成索引冲掉。
     */
    async function revealWorldbookFile() {
      const url = new URL(WORLDBOOK_PATH + "/reveal", document.baseURI);
      const response = await fetch(url.href, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = await response.json().catch(() => null);
      if (body !== null && body.ok === true && body.value) return body.value;
      const code = body && body.error && body.error.code ? body.error.code : "HTTP " + response.status;
      const message = body && body.error && body.error.message ? body.error.message : "";
      const error = new Error(message || code);
      error.code = code;
      // 宿主的兜底 404 也是 `not-found`（「没有这个路由」），要和「文件还没抓」分清楚。
      if (code === "not-found" && message.includes("没有这个路由")) error.code = "no-route";
      throw error;
    }

    async function save(patch) {
      try {
        absorb(await request("POST", patch));
      } catch (error) {
        failure = error;
        log("error", "保存设定失败", error);
        // 版本对不上：宿主那份更新，拉回来让界面跟上（提示先显示，随后的同步会清掉它）。
        if (error.code === "stale" || error.code === "client-outdated") {
          void load(true).then(notify);
        }
      }
      applySkin();
      notify();
      return failure === null;
    }

    // ---------------------------------------------------------------------
    // 编辑器（纯 DOM，浮动面板与设置页共用同一个）
    // ---------------------------------------------------------------------
    function createEditor() {
      const root = document.createElement("div");
      root.className = "swf-editor";
      root.innerHTML = [
        '<div class="swf-row">',
        '<label class="swf-switch"><input type="checkbox" data-role="enabled"><span>启用银狼人格</span></label>',
        '<label class="swf-switch"><input type="checkbox" data-role="theme"><span>银白赛博主题</span></label>',
        '<label class="swf-switch"><input type="checkbox" data-role="stickers"><span>允许发表情包</span></label>',
        '<span class="swf-status" data-role="status"></span>',
        "</div>",
        '<textarea class="swf-text" data-role="persona" spellcheck="false" placeholder="在这里写下你希望银狼遵循的人格设定……"></textarea>',
        '<div class="swf-row">',
        '<button type="button" class="swf-btn swf-primary" data-role="save">保存设定</button>',
        '<button type="button" class="swf-btn" data-role="reload">重新载入</button>',
        '<button type="button" class="swf-btn" data-role="reset">恢复默认</button>',
        "</div>",
        '<p class="swf-hint">保存后，之后每一次新对话都会以这段设定作为银狼的人格。</p>',
        '<div class="swf-entry">',
        '<span class="swf-entry-info">✦ 表情包管理<span data-role="sticker-summary"></span></span>',
        '<button type="button" class="swf-btn" data-role="open-stickers">打开管理器</button>',
        "</div>",
        '<p class="swf-hint">把你自己的表情图丢进插件的 meme/ 文件夹就行——文件名就是它的名字，刷新页面自动出现在这里。也可以在上面直接选图添加。</p>',
        '<div class="swf-entry">',
        '<span class="swf-entry-info">✦ 背景图管理<span data-role="bg-note"></span></span>',
        '<button type="button" class="swf-btn" data-role="open-backgrounds">打开管理器</button>',
        "</div>",
        '<p class="swf-hint">背景图在管理器里上传、切换「背景图 / 简约（无图）」（也可以直接丢进插件的 Background/ 文件夹）。</p>',
        '<div class="swf-entry">',
        '<span class="swf-entry-info">✦ 长期记忆<span data-role="memory-note"></span></span>',
        '<button type="button" class="swf-btn" data-role="open-memory">打开管理器</button>',
        "</div>",
        '<p class="swf-hint">记忆是银狼自己攒下来的事实与约定：模型会用 silverwolf_memory_add / search 读写，你也可以在这里手动加、删、清空。</p>',
        '<div class="swf-entry">',
        '<span class="swf-entry-info">✦ 世界书<span data-role="worldbook-note"></span></span>',
        '<button type="button" class="swf-btn" data-role="open-worldbook">打开管理器</button>',
        "</div>",
        '<p class="swf-hint">世界书是星穹铁道的设定库（从官方 wiki 整理）：常驻只占一行索引，模型要用 silverwolf_worldbook_search 才会取正文。</p>',
      ].join("");

      const pick = (role) => root.querySelector('[data-role="' + role + '"]');
      const textarea = pick("persona");
      const enabledBox = pick("enabled");
      const themeBox = pick("theme");
      const stickersBox = pick("stickers");
      const stickerSummary = pick("sticker-summary");
      const status = pick("status");
      const bgNote = pick("bg-note");
      const memoryNote = pick("memory-note");
      const worldbookNote = pick("worldbook-note");

      let dirty = false;
      /** 未保存标记同时登记到模块级，供"重新可见时同步"判断要不要让路。 */
      function markDirty(value) {
        dirty = value;
        if (value) pendingEdits.add(root);
        else pendingEdits.delete(root);
      }

      function setStatus(text, tone) {
        status.textContent = text || "";
        if (tone) status.setAttribute("data-tone", tone);
        else status.removeAttribute("data-tone");
      }

      function paint() {
        if (!dirty) textarea.value = state.persona;
        enabledBox.checked = state.enabled;
        themeBox.checked = state.theme;
        const bg = state.background;
        const bgOn = bg.enabled === true;
        // 入口行只报现状：外观二选一、开关与「背景图 / 简约（无图）」都搬进了管理器。
        stickerSummary.textContent = stickerItems.length > 0
          ? "　" + stickerItems.length + " 张" + stickerNote
          : "　" + (stickerNote || "还没有素材，丢图进 meme/ 即可");
        bgNote.textContent = bgOn
          ? "　" + (backgroundItems.length > 0
            ? backgroundItems.length + " 张" + backgroundNote
            : (backgroundNote || "还没有图"))
          : "　简约（无图）";
        memoryNote.textContent = memoryBook.enabled !== true
          ? "　已关闭"
          : "　" + (memoryBook.count > 0 ? memoryBook.count + " 条" + (memoryBook.error ? "（读取有问题）" : "") : "还没记过");
        worldbookNote.textContent = worldbookBook.count > 0
          ? "　" + worldbookBook.count + " 条" + (worldbookBook.version ? "（v" + worldbookBook.version + "）" : "")
          : (worldbookBook.error ? "　读取有问题" : "　还没建库");
        if (failure !== null) setStatus(failure.code ? failure.message : "宿主未响应：" + failure.message, "error");
        else if (ready) setStatus("", "");
      }

      textarea.addEventListener("input", () => {
        markDirty(true);
        setStatus("未保存", "");
      });

      enabledBox.addEventListener("change", () => {
        void save({ enabled: enabledBox.checked }).then(paint);
      });
      themeBox.addEventListener("change", () => {
        void save({ theme: themeBox.checked }).then(paint);
      });
      stickersBox.addEventListener("change", () => {
        void save({ stickers: stickersBox.checked }).then(paint);
      });

      root.addEventListener("click", (event) => {
        const button = event.target && event.target.closest ? event.target.closest("button[data-role]") : null;
        if (button === null) return;
        const role = button.getAttribute("data-role");
        if (role === "save") {
          // 只提交真正改过的字段：开关本身是即时保存的，把它们的缓存值一起
          // 回传会让"页面加载得比宿主改动更早"的旧快照把新值盖回去。
          const patch = {};
          if (dirty) patch.persona = textarea.value;
          if (Object.keys(patch).length === 0) {
            setStatus("没有需要保存的改动", "");
            return;
          }
          setStatus("保存中…", "");
          void save(patch).then((ok) => {
            if (ok) {
              markDirty(false);
              paint();
              setStatus("已保存 ✓", "ok");
            }
          });
          return;
        }
        if (role === "open-stickers") {
          openStickerManager();
          return;
        }
        if (role === "open-backgrounds") {
          openBackgroundManager();
          return;
        }
        if (role === "open-memory") {
          openMemoryManager();
          return;
        }
        if (role === "open-worldbook") {
          openWorldbookManager();
          return;
        }
        if (role === "reload") {
          markDirty(false);
          setStatus("载入中…", "");
          void Promise.all([load(true), loadStickers(), loadBackgrounds(), loadMemories(), loadWorldbook()]).then(() => {
            paint();
            setStatus("已重新载入", "ok");
          });
          return;
        }
        if (role === "reset") {
          if (!window.confirm("用默认的银狼设定覆盖当前编辑框内容？")) return;
          textarea.value = state.defaultPersona;
          markDirty(true);
          setStatus("已填回默认设定，记得点保存", "");
        }
      });

      watchers.add(paint);
      paint();
      void load().then(paint);
      void loadStickers();
      void loadBackgrounds();
      void loadMemories();
      void loadWorldbook();

      return {
        el: root,
        paint,
        destroy() {
          watchers.delete(paint);
          pendingEdits.delete(root);
          root.remove();
        },
      };
    }

    // ---------------------------------------------------------------------
    // 表情包管理器（单独一页；编辑器里只有一行入口）
    // ---------------------------------------------------------------------
    /**
     * 管理器本体：大小滑杆 + 添加行 + 网格，全部塞在一个 .swf-manager-scroll 里。
     * 图片走宿主半 /silverwolf/sticker/<id>：页面是 http 来源，本地 file:// 路径浏览器不给加载。
     */
    function createStickerManager() {
      const root = document.createElement("div");
      root.className = "swf-manager";
      root.innerHTML = [
        '<div class="swf-manager-scroll">',
        '<div class="swf-stickers-tools">',
        '<label class="swf-size">聊天里的贴图大小',
        '<input type="range" min="48" max="240" step="8" data-role="sticker-size">',
        '<b data-role="sticker-size-label"></b></label>',
        '<span class="swf-manager-status" data-role="mstatus"></span>',
        "</div>",
        '<div class="swf-add">',
        '<input type="text" data-role="new-label" maxlength="40" placeholder="名字（如：开挂）">',
        '<input type="text" data-role="new-when" maxlength="200" placeholder="什么时候贴（如：特别开心的时候）">',
        '<input type="file" data-role="new-file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif">',
        '<button type="button" class="swf-btn" data-role="add" disabled>添加</button>',
        "</div>",
        '<div class="swf-sticker-grid" data-role="sticker-grid"></div>',
        '<p class="swf-empty" data-role="manager-note"></p>',
        "</div>",
      ].join("");

      const pick = (role) => root.querySelector('[data-role="' + role + '"]');
      const stickerGrid = pick("sticker-grid");
      const noteEl = pick("manager-note");
      const sizeRange = pick("sticker-size");
      const sizeLabel = pick("sticker-size-label");
      const newLabel = pick("new-label");
      const newWhen = pick("new-when");
      const newFile = pick("new-file");
      const addButton = pick("add");
      const status = pick("mstatus");

      addButton.disabled = true;

      function setStatus(text, tone) {
        status.textContent = text || "";
        if (tone) status.setAttribute("data-tone", tone);
        else status.removeAttribute("data-tone");
      }

      function renderStickers() {
        stickerGrid.textContent = "";
        noteEl.textContent = stickerItems.length > 0
          ? "共 " + stickerItems.length + " 张" + stickerNote + "。自己加的可以在这里删；直接丢进 meme/ 的图跟着文件夹走。"
          : (stickerNote || "还没有素材。把表情图丢进插件的 meme/ 文件夹，刷新页面就会出现。");
        for (const item of stickerItems) {
          const card = document.createElement("div");
          card.className = "swf-sticker";
          const img = document.createElement("img");
          img.src = new URL(STICKER_PATH + "/" + encodeURIComponent(item.id), document.baseURI).href;
          img.alt = item.label || item.id;
          img.loading = "lazy";
          const name = document.createElement("b");
          name.textContent = item.label || item.id;
          const when = document.createElement("em");
          when.textContent = item.when || "";
          card.append(img, name, when);
          if (item.custom === true) {
            const del = document.createElement("button");
            del.type = "button";
            del.className = "swf-del";
            del.setAttribute("data-role", "del-sticker");
            del.setAttribute("data-id", item.id);
            del.textContent = "删除";
            card.appendChild(del);
          }
          stickerGrid.appendChild(card);
        }
      }

      function paint() {
        const size = Number.isFinite(state.stickerSize) ? Math.round(state.stickerSize) : 96;
        sizeRange.value = String(size);
        sizeLabel.textContent = size + "px";
        renderStickers();
        if (failure !== null) setStatus(failure.code ? failure.message : "宿主未响应：" + failure.message, "error");
        else if (ready) setStatus("", "");
      }

      // 拖动时先就地预览（直接改 CSS 变量），松手才落盘。
      sizeRange.addEventListener("input", () => {
        sizeLabel.textContent = sizeRange.value + "px";
        document.body.style.setProperty("--swf-sticker-size", sizeRange.value + "px");
      });
      sizeRange.addEventListener("change", () => {
        void save({ stickerSize: Number(sizeRange.value) }).then(paint);
      });

      newFile.addEventListener("change", () => {
        addButton.disabled = !(newFile.files && newFile.files.length > 0);
      });
      addButton.addEventListener("click", () => {
        const file = newFile.files && newFile.files[0];
        if (!file) return;
        addButton.disabled = true;
        setStatus("上传中…", "");
        void readAsDataUrl(file)
          .then((data) => postStickers("", {
            name: file.name,
            label: newLabel.value.trim(),
            when: newWhen.value.trim(),
            data,
          }))
          .then(() => {
            newLabel.value = "";
            newWhen.value = "";
            newFile.value = "";
            paint();
            setStatus("已添加 ✓", "ok");
          })
          .catch((error) => {
            log("error", "添加表情包失败", error);
            setStatus(error.message || "添加失败", "error");
            addButton.disabled = false;
          });
      });

      root.addEventListener("click", (event) => {
        const button = event.target && event.target.closest ? event.target.closest("button[data-role]") : null;
        if (button === null || button.getAttribute("data-role") !== "del-sticker") return;
        const id = button.getAttribute("data-id") || "";
        if (!window.confirm("删除这张自定义表情包？")) return;
        setStatus("删除中…", "");
        void postStickers("/remove", { id })
          .then(() => {
            paint();
            setStatus("已删除 ✓", "ok");
          })
          .catch((error) => {
            log("error", "删除表情包失败", error);
            setStatus(error.message || "删除失败", "error");
          });
      });

      watchers.add(paint);
      paint();
      void loadStickers().then(paint);

      return {
        el: root,
        paint,
        destroy() {
          watchers.delete(paint);
          root.remove();
        },
      };
    }

    let stickerPage = null;
    let stickerKeyHandler = null;

    function closeStickerManager() {
      if (stickerPage === null) return;
      if (stickerKeyHandler !== null) document.removeEventListener("keydown", stickerKeyHandler);
      stickerPage.manager.destroy();
      stickerPage.el.remove();
      stickerPage = null;
      stickerKeyHandler = null;
    }

    /** 打开管理器：入口按钮点一下就到这里，和自己那份编辑器互不干扰。 */
    function openStickerManager() {
      if (stickerPage !== null) return;
      const el = document.createElement("div");
      el.className = "swf-overlay swf-overlay--wide";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", "银狼 · 表情包管理");

      const head = document.createElement("div");
      head.className = "swf-overlay-head";
      const mark = document.createElement("span");
      mark.className = "swf-mark";
      mark.textContent = "✦";
      const title = document.createElement("span");
      title.className = "swf-overlay-title";
      title.textContent = "表情包管理";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "swf-close";
      close.setAttribute("aria-label", "关闭");
      close.textContent = "✕";
      close.addEventListener("click", () => closeStickerManager());
      head.append(mark, title, close);

      const manager = createStickerManager();
      el.append(head, manager.el);
      document.body.appendChild(el);
      stickerPage = { el, manager };

      stickerKeyHandler = (event) => {
        if (event.key === "Escape") closeStickerManager();
      };
      document.addEventListener("keydown", stickerKeyHandler);
    }

    // ---------------------------------------------------------------------
    // 背景图管理器（单独一页；编辑器里只有一行入口 + 风格二选一）
    // ---------------------------------------------------------------------
    /**
     * 外观（浅色 / 深色）、上传 / 选起点 / 删除 / 轮换与淡化都在这一页。
     * 和记忆管理器同一套骨架：外层 .swf-overlay 封高，内层 .swf-manager-scroll 滚，
     * 所以图再多也不会把页面撑出去。
     */
    /** 宿主上下文：只有 apply 里拿得到，背景管理器要靠它去取主题服务。 */
    let hostCtx = null;

    /**
     * 取宿主的主题服务（`ctx.theme`，由 `dsh-client-ui-theme` 提供）。
     * 用反射层的 `ctx.get` 而不是声明注入：这个服务只有带界面的外壳才有，
     * 声明成必需会让插件在没有界面的宿主里直接起不来。
     */
    function themeService() {
      try {
        const ctx = hostCtx;
        if (ctx === null || typeof ctx.get !== "function") return null;
        const service = ctx.get("theme");
        return service !== null && typeof service === "object" && typeof service.setTheme === "function"
          ? service
          : null;
      } catch (error) {
        log("warn", "拿不到宿主的主题服务", error);
        return null;
      }
    }

    /**
     * 把应用切到指定的外观（"light" / "dark"）；返回 false 表示这台外壳既没有
     * 主题服务、也没有可以改的文档对象。偏好由宿主的 theme 服务自己写进设置，
     * 所以下次打开还是这个外观——和用户手动在「外观」里点一下是一回事；
     * 没有主题服务时退到直接改 body 上的标记（宿主用同一个标记表达深色）。
     */
    function applyAppearance(mode) {
      const service = themeService();
      if (service !== null) {
        if (service.preference === mode) return true;
        try {
          service.setTheme(mode);
          return true;
        } catch (error) {
          log("warn", "切外观失败：" + mode, error);
        }
      }
      if (!document.body) return false;
      if (mode === "dark") document.body.setAttribute("data-ds-dark-theme", "");
      else document.body.removeAttribute("data-ds-dark-theme");
      return true;
    }

    /** 当前外观：宿主用 body 上的 `data-ds-dark-theme` 表达深色。 */
    function currentAppearance() {
      if (!document.body) return "light";
      return document.body.hasAttribute("data-ds-dark-theme") ? "dark" : "light";
    }

    function createBackgroundManager() {
      const root = document.createElement("div");
      root.className = "swf-manager";
      root.innerHTML = [
        '<div class="swf-manager-scroll">',
        '<div class="swf-row">',
        '<span class="swf-mode-note">外观</span>',
        '<span class="swf-mode" data-role="bg-appearance">',
        '<button type="button" class="swf-mode-btn" data-role="bg-appearance-light" data-mode="light">浅色</button>',
        '<button type="button" class="swf-mode-btn" data-role="bg-appearance-dark" data-mode="dark">深色</button>',
        "</span>",
        '<span class="swf-mode-note" data-role="appearance-note"></span>',
        "</div>",
        '<div class="swf-row">',
        '<span class="swf-mode" data-role="bg-mode">',
        '<button type="button" class="swf-mode-btn" data-role="bg-mode-image" data-mode="image">背景图</button>',
        '<button type="button" class="swf-mode-btn" data-role="bg-mode-plain" data-mode="plain">简约（无图）</button>',
        "</span>",
        '<span class="swf-mode-note" data-role="bg-mode-note"></span>',
        "</div>",
        '<div class="swf-row">',
        '<label class="swf-switch"><input type="checkbox" data-role="bg-rotate"><span>自动轮换</span></label>',
        '<label class="swf-size">间隔 <input type="range" min="15" max="600" step="15" data-role="bg-interval"><b data-role="bg-interval-label"></b></label>',
        '<label class="swf-size">淡化 <input type="range" min="0.2" max="0.85" step="0.05" data-role="bg-dim"><b data-role="bg-dim-label"></b></label>',
        '<button type="button" class="swf-btn" data-role="bg-next">下一张</button>',
        '<span class="swf-manager-status" data-role="mstatus"></span>',
        "</div>",
        '<p class="swf-hint" data-role="dark-note"></p>',
        '<div class="swf-add">',
        '<input type="file" accept="image/*" data-role="bg-file">',
        '<input type="text" maxlength="60" data-role="bg-label" placeholder="给这张起个名（可留空）">',
        '<button type="button" class="swf-btn swf-primary" data-role="bg-upload">上传</button>',
        "</div>",
        '<p class="swf-hint">点缩略图设为起点；自己传的那几张角上有「删除」。单张上限 24MB。</p>',
        '<div class="swf-bg-strip" data-role="bg-strip"></div>',
        "</div>",
      ].join("");

      const pick = (role) => root.querySelector('[data-role="' + role + '"]');
      const appearanceLight = pick("bg-appearance-light");
      const appearanceDark = pick("bg-appearance-dark");
      const appearanceNote = pick("appearance-note");
      const modeImage = pick("bg-mode-image");
      const modePlain = pick("bg-mode-plain");
      const modeNote = pick("bg-mode-note");
      const rotateBox = pick("bg-rotate");
      const intervalRange = pick("bg-interval");
      const intervalLabel = pick("bg-interval-label");
      const dimRange = pick("bg-dim");
      const dimLabel = pick("bg-dim-label");
      const status = pick("mstatus");
      const strip = pick("bg-strip");
      const darkNote = pick("dark-note");
      const fileInput = pick("bg-file");
      const labelInput = pick("bg-label");
      const uploadButton = pick("bg-upload");

      function setStatus(text, tone) {
        status.textContent = text || "";
        if (tone) status.setAttribute("data-tone", tone);
        else status.removeAttribute("data-tone");
      }

      /** 缩略图卡片：清单没变就不重建（重建会让图片重新加载、闪一下）。 */
      let stripKey = "";
      let cards = [];
      function renderStrip() {
        const key = backgroundItems.map((item) => item.id).join("|");
        if (key !== stripKey) {
          stripKey = key;
          cards = [];
          strip.textContent = "";
          for (const item of backgroundItems) {
            const card = document.createElement("div");
            card.className = "swf-bg-card";
            card.setAttribute("data-id", item.id);
            const thumb = document.createElement("button");
            thumb.type = "button";
            thumb.className = "swf-bg-thumb";
            thumb.setAttribute("data-role", "bg-pick");
            thumb.setAttribute("data-id", item.id);
            thumb.title = item.name;
            const img = document.createElement("img");
            // 地址统一走 backgroundSrc：宿主给了 url 就用宿主的（手机外壳上也一样）。
            img.src = backgroundSrc(item);
            img.alt = "";
            img.loading = "lazy";
            const name = document.createElement("span");
            name.textContent = item.name;
            thumb.append(img, name);

            const actions = document.createElement("div");
            actions.className = "swf-bg-actions";
            // 随包发的那几张不给删：删了下次装回来又有了，也没法真的改动安装目录。
            if (item.custom === true) {
              const del = document.createElement("button");
              del.type = "button";
              del.setAttribute("data-role", "bg-del");
              del.setAttribute("data-id", item.id);
              del.textContent = "删除";
              actions.appendChild(del);
            }

            card.append(thumb, actions);
            strip.appendChild(card);
            cards.push({ id: item.id, el: thumb });
          }
        }
        const live = backgroundItems[backgroundIndex];
        const liveId = live === undefined ? "" : live.id;
        for (const card of cards) {
          if (card.id === liveId) card.el.setAttribute("data-on", "1");
          else card.el.removeAttribute("data-on");
        }
      }

      function paint() {
        const bg = state.background;
        // 外观两档：读 body 上的标记（宿主切深浅色也走同一个标记）。
        const appearance = currentAppearance();
        if (appearance === "dark") {
          appearanceDark.setAttribute("data-on", "1");
          appearanceLight.removeAttribute("data-on");
        } else {
          appearanceLight.setAttribute("data-on", "1");
          appearanceDark.removeAttribute("data-on");
        }
        if (appearanceNote) {
          appearanceNote.textContent = appearance === "dark" ? "现在是深色模式" : "现在是浅色模式";
        }
        const bgOn = bg.enabled === true;
        if (bgOn) modeImage.setAttribute("data-on", "1");
        else modeImage.removeAttribute("data-on");
        if (bgOn) modePlain.removeAttribute("data-on");
        else modePlain.setAttribute("data-on", "1");
        root.setAttribute("data-bg-mode", bgOn ? "image" : "plain");
        modeNote.textContent = bgOn
          ? "照片铺在最底层，对话内容浮在上面"
          : "回到没加背景图之前的样子：只有银白赛博渐变";
        rotateBox.checked = bg.rotate === true;
        const interval = Number.isFinite(bg.interval) ? Math.round(bg.interval) : BG_INTERVAL_FALLBACK;
        intervalRange.value = String(interval);
        intervalLabel.textContent = interval + "s";
        const dim = Number.isFinite(bg.dim) ? bg.dim : BG_DIM_FALLBACK;
        dimRange.value = String(dim);
        dimLabel.textContent = Math.round(dim * 100) + "%";
        if (darkNote) {
          darkNote.textContent =
            "「浅色 / 深色」切的是整个应用的外观（宿主会记住），和背景图选哪张互不影响——哪个好看就用哪个。";
        }
        renderStrip();
      }

      rotateBox.addEventListener("change", () => {
        void save({ background: { rotate: rotateBox.checked } }).then(paint);
      });
      // 拖动时就地预览（只改 CSS 变量），松手才落盘。
      intervalRange.addEventListener("input", () => {
        intervalLabel.textContent = intervalRange.value + "s";
      });
      intervalRange.addEventListener("change", () => {
        void save({ background: { interval: Number(intervalRange.value) } }).then(paint);
      });
      dimRange.addEventListener("input", () => {
        dimLabel.textContent = Math.round(Number(dimRange.value) * 100) + "%";
        if (document.body) document.body.style.setProperty("--swf-bg-dim", dimRange.value);
      });
      dimRange.addEventListener("change", () => {
        void save({ background: { dim: Number(dimRange.value) } }).then(paint);
      });

      uploadButton.addEventListener("click", () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) {
          setStatus("先选一张图片", "error");
          return;
        }
        setStatus("上传中…", "");
        uploadButton.disabled = true;
        readAsDataUrl(file)
          .then((data) => postBackgrounds("", { data, name: file.name, label: labelInput.value }))
          .then(() => {
            fileInput.value = "";
            labelInput.value = "";
            setStatus("已加入 ✓", "ok");
            paint();
          })
          .catch((error) => {
            setStatus(error && error.code ? error.message : "上传失败：" + (error && error.message), "error");
          })
          .then(() => {
            uploadButton.disabled = false;
          });
      });

      root.addEventListener("click", (event) => {
        const button = event.target && event.target.closest ? event.target.closest("button[data-role]") : null;
        if (button === null) return;
        const role = button.getAttribute("data-role");
        const id = button.getAttribute("data-id") || "";
        if (role === "bg-appearance-light" || role === "bg-appearance-dark") {
          const next = role === "bg-appearance-dark" ? "dark" : "light";
          if (currentAppearance() === next) {
            paint();
            return;
          }
          if (applyAppearance(next)) {
            setStatus(next === "dark" ? "已切到深色" : "已切到浅色", "ok");
          } else {
            setStatus("这台外壳没有主题接口，切不动", "error");
          }
          paint();
          return;
        }
        if (role === "bg-mode-image" || role === "bg-mode-plain") {
          // 「简约（无图）」= enabled:false，也就是没加背景图之前那种样子：
          // 整层收掉、对话列素着，其余设定（起点 / 间隔 / 浓度）留着不动。
          const next = role === "bg-mode-image";
          if ((state.background.enabled === true) === next) {
            paint();
            return;
          }
          void save({ background: { enabled: next } }).then(paint);
          return;
        }
        if (role === "bg-pick") {
          void save({ background: { current: id } }).then(paint);
          return;
        }
        if (role === "bg-del") {
          setStatus("删除中…", "");
          postBackgrounds("/remove", { id })
            .then(() => {
              setStatus("已删除", "ok");
              paint();
            })
            .catch((error) => {
              setStatus(error && error.code ? error.message : "删除失败", "error");
            });
          return;
        }
        if (role === "bg-next") {
          if (backgroundItems.length > 0) {
            showBackground(backgroundIndex + 1, true);
            notify();
            paint();
          }
          return;
        }
      });

      watchers.add(paint);
      paint();

      return {
        el: root,
        paint,
        destroy() {
          watchers.delete(paint);
          root.remove();
        },
      };
    }

    let backgroundPage = null;
    let backgroundKeyHandler = null;
    let appearanceObserver = null;

    function closeBackgroundManager() {
      if (backgroundPage === null) return;
      if (backgroundKeyHandler !== null) document.removeEventListener("keydown", backgroundKeyHandler);
      if (appearanceObserver !== null) {
        appearanceObserver.disconnect();
        appearanceObserver = null;
      }
      backgroundPage.manager.destroy();
      backgroundPage.el.remove();
      backgroundPage = null;
      backgroundKeyHandler = null;
    }

    function openBackgroundManager() {
      if (backgroundPage !== null) return;
      const el = document.createElement("div");
      el.className = "swf-overlay swf-overlay--wide";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", "银狼 · 背景图");

      const head = document.createElement("div");
      head.className = "swf-overlay-head";
      const mark = document.createElement("span");
      mark.className = "swf-mark";
      mark.textContent = "✦";
      const title = document.createElement("span");
      title.className = "swf-overlay-title";
      title.textContent = "背景图";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "swf-close";
      close.setAttribute("aria-label", "关闭");
      close.textContent = "✕";
      close.addEventListener("click", () => closeBackgroundManager());
      head.append(mark, title, close);

      const manager = createBackgroundManager();
      el.append(head, manager.el);
      document.body.appendChild(el);
      backgroundPage = { el, manager };

      // 外观也可能在别处被切（宿主自己的主题开关 / 系统深色）：盯着同一个 body 标记，
      // 管理器开着的时候把高亮和那行字跟着刷新，别让它显示一个过期状态。
      if (typeof MutationObserver === "function") {
        appearanceObserver = new MutationObserver(() => manager.paint());
        appearanceObserver.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
      }

      backgroundKeyHandler = (event) => {
        if (event.key === "Escape") closeBackgroundManager();
      };
      document.addEventListener("keydown", backgroundKeyHandler);
    }

    // ---------------------------------------------------------------------
    // 长期记忆管理器（挂 body 的覆盖层，和背景图同一套壳）
    // ---------------------------------------------------------------------
    function createMemoryManager() {
      const root = document.createElement("div");
      root.className = "swf-manager";
      root.innerHTML = [
        '<div class="swf-manager-scroll">',
        '<div class="swf-row">',
        '<label class="swf-switch"><input type="checkbox" data-role="mem-enabled"><span>启用长期记忆</span></label>',
        '<span class="swf-manager-status" data-role="mstatus"></span>',
        "</div>",
        '<p class="swf-hint">关掉之后既不注入、也不允许模型再写；文件本身不会丢，重新打开就还在。</p>',
        '<div class="swf-row swf-mem-file">',
        '<span class="swf-mem-path" data-role="mem-path"></span>',
        '<button type="button" class="swf-btn" data-role="mem-reveal" title="在系统文件管理器里定位这份 JSON；桌面壳拉不起来时退回浏览器原文视图">打开文件位置</button>',
        "</div>",
        '<div class="swf-add">',
        '<input type="text" data-role="mem-text" maxlength="600" placeholder="要记住的一件事（短、具体、能独立读懂）">',
        '<input type="text" data-role="mem-tags" maxlength="80" placeholder="标签（可留空，逗号分隔）">',
        '<button type="button" class="swf-btn swf-primary" data-role="mem-add">记住</button>',
        "</div>",
        '<div class="swf-row">',
        '<input type="search" data-role="mem-search" placeholder="在记忆里搜…">',
        '<button type="button" class="swf-btn" data-role="mem-clear">清空全部</button>',
        "</div>",
        '<div class="swf-mem-list" data-role="mem-list"></div>',
        '<p class="swf-hint" data-role="mem-hint"></p>',
        "</div>",
      ].join("");

      const pick = (role) => root.querySelector('[data-role="' + role + '"]');
      const enabledBox = pick("mem-enabled");
      const textInput = pick("mem-text");
      const tagsInput = pick("mem-tags");
      const addButton = pick("mem-add");
      const searchInput = pick("mem-search");
      const clearButton = pick("mem-clear");
      const list = pick("mem-list");
      const hint = pick("mem-hint");
      const status = pick("mstatus");
      const pathText = pick("mem-path");
      const revealButton = pick("mem-reveal");

      let keyword = "";
      let listKey = "";
      const buttons = [];
      function setStatus(text, tone) {
        status.textContent = text;
        if (tone) status.setAttribute("data-tone", tone);
        else status.removeAttribute("data-tone");
      }

      function failMessage(error) {
        if (error && error.code === "stale") return "记忆在别处改过，已刷新，再点一次";
        if (error && error.code === "empty-text") return "先写点要记的东西";
        return (error && error.message) ? error.message : "操作失败";
      }

      /** 只重建有变化的列表：搜索框每敲一个字都重建的话，输入焦点会跳。 */
      function render() {
        const items = memoryBook.items;
        const needle = keyword.trim().toLowerCase();
        const shown = needle === ""
          ? items
          : items.filter((item) => String(item.text || "").toLowerCase().includes(needle)
            || (Array.isArray(item.tags) && item.tags.some((tag) => String(tag).toLowerCase().includes(needle))));
        const nextKey = memoryBook.rev + "|" + needle + "|" + shown.map((item) => item.id).join(",");
        if (nextKey === listKey) return;
        listKey = nextKey;
        for (const button of buttons) button.disabled = true;
        buttons.length = 0;
        list.textContent = "";
        if (shown.length === 0) {
          const empty = document.createElement("p");
          empty.className = "swf-hint";
          empty.textContent = needle === ""
            ? "还没有记忆。模型觉得该记的会自己写进来，你也可以在上面手动加一条。"
            : "没有匹配的记忆。";
          list.appendChild(empty);
          return;
        }
        for (const item of shown) {
          const card = document.createElement("div");
          card.className = "swf-mem-item";
          const text = document.createElement("p");
          text.className = "swf-mem-text";
          text.textContent = String(item.text || "");
          const meta = document.createElement("div");
          meta.className = "swf-mem-meta";
          const day = typeof item.created === "string" ? item.created.slice(0, 10) : "";
          const tags = Array.isArray(item.tags) && item.tags.length > 0 ? "　#" + item.tags.join(" #") : "";
          meta.textContent = day + tags;
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "swf-btn";
          remove.setAttribute("data-role", "mem-del");
          remove.setAttribute("data-id", String(item.id || ""));
          remove.textContent = "删除";
          remove.addEventListener("click", () => {
            remove.disabled = true;
            setStatus("删除中…", "");
            void postMemory("remove", { id: String(item.id || "") })
              .then(() => {
                setStatus("已删除", "ok");
                paint();
              })
              .catch((error) => {
                remove.disabled = false;
                setStatus(failMessage(error), "error");
              });
          });
          buttons.push(remove);
          card.append(text, meta, remove);
          list.appendChild(card);
        }
      }

      function paint() {
        enabledBox.checked = memoryBook.enabled === true;
        if (memoryBook.error && memoryBook.error !== "") setStatus(String(memoryBook.error), "error");
        const filePath = typeof memoryBook.path === "string" ? memoryBook.path : "";
        pathText.textContent = filePath !== "" ? filePath : "（宿主还没给出路径）";
        pathText.title = filePath;
        revealButton.disabled = filePath === "";
        hint.textContent = memoryBook.count === 0
          ? "记忆存在宿主那边的 silverwolf-memory.json 里（插件目录之外），换皮肤、重置主题都不会丢。"
          : "共 " + memoryBook.count + " 条（上限 " + memoryBook.limit + "）；注入时按时间倒序、有预算上限，不会把上下文吃光。";
        render();
      }

      enabledBox.addEventListener("change", () => {
        void postMemory("toggle", { enabled: enabledBox.checked })
          .then(() => setStatus(enabledBox.checked ? "已打开" : "已关闭", "ok"))
          .catch((error) => setStatus(failMessage(error), "error"));
      });

      addButton.addEventListener("click", () => {
        const text = textInput.value.trim();
        if (text === "") {
          setStatus("先写点要记的东西", "error");
          return;
        }
        addButton.disabled = true;
        setStatus("保存中…", "");
        void postMemory("add", { text, tags: tagsInput.value })
          .then(() => {
            addButton.disabled = false;
            textInput.value = "";
            tagsInput.value = "";
            setStatus("已记住", "ok");
            paint();
          })
          .catch((error) => {
            addButton.disabled = false;
            setStatus(failMessage(error), "error");
          });
      });

      searchInput.addEventListener("input", () => {
        keyword = searchInput.value;
        render();
      });

      clearButton.addEventListener("click", () => {
        if (memoryBook.count === 0) {
          setStatus("本来就是空的", "");
          return;
        }
        if (!window.confirm("清空全部 " + memoryBook.count + " 条记忆？这一步不会进撤销队列。")) return;
        void postMemory("clear")
          .then(() => {
            setStatus("已清空", "ok");
            paint();
          })
          .catch((error) => setStatus(failMessage(error), "error"));
      });

      // 「打开文件位置」：浏览器自己开不了资源管理器，交给宿主进程 spawn。
      // 桌面壳没这一手（远程页面 / 手机端）时，退回浏览器里看原文。
      revealButton.addEventListener("click", () => {
        const filePath = typeof memoryBook.path === "string" ? memoryBook.path : "";
        if (filePath === "") {
          setStatus("宿主还没给出路径", "error");
          return;
        }
        revealButton.disabled = true;
        setStatus("正在打开…", "");
        const done = (value) => {
          revealButton.disabled = false;
          if (value !== null && value !== undefined && value.opened === false) {
            try {
              window.open(new URL(MEMORY_RAW_PATH, document.baseURI).href, "_blank", "noopener");
            } catch (error) {
              setStatus("打不开，路径在上面这行", "error");
              return;
            }
            setStatus("已在浏览器里打开原文", "ok");
            return;
          }
          setStatus("已在文件管理器里定位到它", "ok");
        };
        const fail = (error) => {
          revealButton.disabled = false;
          setStatus(failMessage(error), "error");
        };
        revealMemoryFile().then(done, fail);
      });

      watchers.add(paint);
      paint();

      return {
        el: root,
        paint,
        destroy() {
          watchers.delete(paint);
          root.remove();
        },
      };
    }

    let memoryPage = null;
    let memoryKeyHandler = null;

    function closeMemoryManager() {
      if (memoryPage === null) return;
      if (memoryKeyHandler !== null) document.removeEventListener("keydown", memoryKeyHandler);
      memoryPage.manager.destroy();
      memoryPage.el.remove();
      memoryPage = null;
      memoryKeyHandler = null;
    }

    function openMemoryManager() {
      if (memoryPage !== null) return;
      const el = document.createElement("div");
      el.className = "swf-overlay swf-overlay--wide";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", "银狼 · 长期记忆");

      const head = document.createElement("div");
      head.className = "swf-overlay-head";
      const mark = document.createElement("span");
      mark.className = "swf-mark";
      mark.textContent = "✦";
      const title = document.createElement("span");
      title.className = "swf-overlay-title";
      title.textContent = "长期记忆";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "swf-close";
      close.setAttribute("aria-label", "关闭");
      close.textContent = "✕";
      close.addEventListener("click", () => closeMemoryManager());
      head.append(mark, title, close);

      const manager = createMemoryManager();
      el.append(head, manager.el);
      document.body.appendChild(el);
      memoryPage = { el, manager };
      // 打开时重读一次：可能刚在别的窗口里被模型写过。
      void loadMemories().then(() => manager.paint());

      memoryKeyHandler = (event) => {
        if (event.key === "Escape") closeMemoryManager();
      };
      document.addEventListener("keydown", memoryKeyHandler);
    }

    // ---------------------------------------------------------------------
    // 世界书管理器：只有索引（条目名 + 分类 + 字数），正文留在宿主那边。
    // 抓取 / 重载 / 清空三个动作都走 POST，宿主做完回一份新索引。
    // ---------------------------------------------------------------------
    function createWorldbookManager() {
      const root = document.createElement("div");
      root.className = "swf-manager";
      // 这一页只放「干什么」：库有多大、什么时候抓的、三个动作。
      // 抓到的条目与原文都留在磁盘上，不往面板里铺——想看就点「打开文件位置」。
      root.innerHTML = [
        '<div class="swf-manager-scroll">',
        '<div class="swf-row">',
        '<span class="swf-manager-status" data-role="wstatus"></span>',
        "</div>",
        '<p class="swf-hint" data-role="wmeta"></p>',
        '<div class="swf-row">',
        '<button type="button" class="swf-btn swf-primary" data-role="wb-fetch">从官方 wiki 抓取 / 更新</button>',
        '<button type="button" class="swf-btn" data-role="wb-reveal">打开文件位置</button>',
        '<button type="button" class="swf-btn" data-role="wb-clear">清空</button>',
        "</div>",
        '<p class="swf-hint">库本身不进提示词，只挂一行索引；正文要等模型调用 silverwolf_worldbook_search 时才会取几条回来。想翻原文就点「打开文件位置」——那是磁盘上的一份 json，交给你自己的编辑器看。</p>',
        "</div>",
      ].join("");

      const pick = (role) => root.querySelector('[data-role="' + role + '"]');
      const status = pick("wstatus");
      const meta = pick("wmeta");
      const fetchButton = pick("wb-fetch");
      const revealButton = pick("wb-reveal");
      const clearButton = pick("wb-clear");

      function setStatus(text, tone) {
        status.textContent = text;
        if (tone) status.setAttribute("data-tone", tone);
        else status.removeAttribute("data-tone");
      }

      function errorText(error) {
        if (error && error.code === "fetch-failed") return "抓取失败：" + (error.message || "接口没回数据");
        if (error && error.code === "no-worldbook") return "还没有世界书文件，先抓取一次";
        if (error && error.code === "no-route") return "宿主半还是旧版（缺这条路由）：先重载插件行（或重启 DSH），再试一次";
        if (error && error.code === "not-found") return "这条路由没找到：宿主半可能还是旧版，重载插件行后再试";
        return (error && error.message) ? error.message : "操作失败";
      }

      function paint() {
        const version = worldbookBook.version === "" ? "（版本未知）" : "v" + worldbookBook.version;
        const fetched = worldbookBook.fetchedAt === "" ? "" : "　抓取于 " + worldbookBook.fetchedAt.slice(0, 10);
        meta.textContent = worldbookBook.count === 0
          ? "还没有资料库（抓一次约 3 MB，几秒钟）" + (worldbookBook.path === "" ? "" : "　" + worldbookBook.path)
          : version + "　" + worldbookBook.count + " 条　" + worldbookBook.characters.length + " 位角色" + fetched
            + (worldbookBook.path === "" ? "" : "　" + worldbookBook.path);
        if (worldbookBook.error && worldbookBook.error !== "") setStatus(String(worldbookBook.error), "error");
      }

      fetchButton.addEventListener("click", () => {
        fetchButton.disabled = true;
        setStatus("抓取中…（官方接口约 3 MB，几秒钟）", "");
        void postWorldbook("fetch")
          .then(() => {
            setStatus("抓好了：" + worldbookBook.count + " 条", "ok");
            paint();
          })
          .catch((error) => setStatus(errorText(error), "error"))
          .finally(() => {
            fetchButton.disabled = false;
          });
      });

      revealButton.addEventListener("click", () => {
        revealButton.disabled = true;
        setStatus("叫文件管理器…", "");
        void revealWorldbookFile()
          .then((value) => {
            if (value && value.opened === true) {
              setStatus("已在文件管理器里打开", "ok");
              return;
            }
            setStatus("没打开文件管理器，文件在这儿：" + (value && value.path ? value.path : worldbookBook.path), "");
          })
          .catch((error) => setStatus(errorText(error), "error"))
          .finally(() => {
            revealButton.disabled = false;
          });
      });

      clearButton.addEventListener("click", () => {
        const ok = typeof window.confirm === "function"
          ? window.confirm("清空世界书？删的是那份 json，人格、记忆、主题设定都不动。")
          : true;
        if (!ok) return;
        clearButton.disabled = true;
        void postWorldbook("clear")
          .then(() => {
            setStatus("已清空", "ok");
            paint();
          })
          .catch((error) => setStatus(errorText(error), "error"))
          .finally(() => {
            clearButton.disabled = false;
          });
      });

      const paintWatcher = () => paint();
      watchers.add(paintWatcher);
      queueMicrotask(paint);

      return {
        el: root,
        paint,
        destroy: () => {
          watchers.delete(paintWatcher);
          root.remove();
        },
      };
    }

    let worldbookPage = null;
    let worldbookKeyHandler = null;

    function closeWorldbookManager() {
      if (worldbookPage === null) return;
      if (worldbookKeyHandler !== null) document.removeEventListener("keydown", worldbookKeyHandler);
      worldbookPage.manager.destroy();
      worldbookPage.el.remove();
      worldbookPage = null;
      worldbookKeyHandler = null;
    }

    function openWorldbookManager() {
      if (worldbookPage !== null) return;
      const el = document.createElement("div");
      el.className = "swf-overlay swf-overlay--wide";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", "银狼 · 世界书");

      const head = document.createElement("div");
      head.className = "swf-overlay-head";
      const mark = document.createElement("span");
      mark.className = "swf-mark";
      mark.textContent = "✦";
      const title = document.createElement("span");
      title.className = "swf-overlay-title";
      title.textContent = "世界书";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "swf-close";
      close.setAttribute("aria-label", "关闭");
      close.textContent = "✕";
      close.addEventListener("click", () => closeWorldbookManager());
      head.append(mark, title, close);

      const manager = createWorldbookManager();
      el.append(head, manager.el);
      document.body.appendChild(el);
      worldbookPage = { el, manager };
      void loadWorldbook().then(() => manager.paint());

      worldbookKeyHandler = (event) => {
        if (event.key === "Escape") closeWorldbookManager();
      };
      document.addEventListener("keydown", worldbookKeyHandler);
    }

    // ---------------------------------------------------------------------
    // 浮动面板
    // ---------------------------------------------------------------------
    let panel = null;
    let panelKeyHandler = null;

    function closePanel() {
      if (panel === null) return;
      if (panelKeyHandler !== null) document.removeEventListener("keydown", panelKeyHandler);
      panel.editor.destroy();
      panel.el.remove();
      panel = null;
      panelKeyHandler = null;
    }

    function openPanel() {
      if (panel !== null) {
        const area = panel.el.querySelector("textarea");
        if (area !== null) area.focus();
        return;
      }
      const el = document.createElement("div");
      el.className = "swf-overlay";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", "银狼 · 人格设定");

      const head = document.createElement("div");
      head.className = "swf-overlay-head";
      const mark = document.createElement("span");
      mark.className = "swf-mark";
      mark.textContent = "✦";
      const title = document.createElement("span");
      title.className = "swf-overlay-title";
      title.textContent = "银狼 · 人格设定";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "swf-close";
      close.setAttribute("aria-label", "关闭");
      close.textContent = "✕";
      close.addEventListener("click", () => closePanel());
      head.append(mark, title, close);

      const editor = createEditor();
      el.append(head, editor.el);
      document.body.appendChild(el);
      panel = { el, editor };

      panelKeyHandler = (event) => {
        if (event.key === "Escape") closePanel();
      };
      document.addEventListener("keydown", panelKeyHandler);
    }

    // ---------------------------------------------------------------------
    // 槽位组件
    // ---------------------------------------------------------------------
    function createComponents() {
      let react = null;
      try {
        react = require("react");
      } catch (error) {
        log("warn", "React 不可用，侧边栏入口已跳过（主题与设置页之外的能力不受影响）", error);
        return null;
      }
      const h = react.createElement;

      /** 侧边栏底部、设置按钮旁边的入口；ownerProps 只有 { wide }。 */
      function SilverWolfAction(props) {
        const wide = !props || props.wide !== false;
        return h("button", {
          type: "button",
          className: "swf-navbtn",
          title: "银狼 · 人格设定",
          "aria-label": "银狼 · 人格设定",
          onClick: () => openPanel(),
        }, h("span", { className: "swf-mark" }, "✦"), wide ? h("span", null, "银狼") : null);
      }

      /** 设置页里的同一份编辑器。 */
      function SilverWolfSettings() {
        const host = react.useRef(null);
        const [, bump] = react.useState(0);
        // 版本号要等第一份状态回来才有，所以跟别的块一样订阅一次刷新。
        react.useEffect(() => {
          const refresh = () => bump((n) => n + 1);
          watchers.add(refresh);
          return () => watchers.delete(refresh);
        }, []);
        react.useEffect(() => {
          const editor = createEditor();
          host.current.appendChild(editor.el);
          return () => editor.destroy();
        }, []);
        const version = state.pluginVersion;
        return h("div", { className: "swf-page" },
          h("div", { className: "swf-page-head" },
            h("h2", { className: "swf-page-title" }, "✦ 银狼 · 人格与主题"),
            version === ""
              ? null
              : h("span", {
                className: "swf-ver",
                "data-role": "version",
                title: "插件版本：package.json 里的 version（重装才会换）",
              }, "v" + version)),
          h("p", { className: "swf-page-lead" }, "这里写下的设定就是银狼的人格底稿：每一次新对话都会以这段口吻回答。改完点保存即可，不必重载插件。"),
          h("div", { ref: host }));
      }

      /**
       * 新会话欢迎页：把内置那条动态鱼换成银狼的形象，并自带一句艺术字欢迎语。
       * 槽位 conversation.hero.brand.mark 是单占位、官方包不占，兜底才是鱼；
       * 我们占位后就由这里渲染（形象字节走宿主半的 /silverwolf/hero）。
       */
      function SilverWolfHero() {
        const [, bump] = react.useState(0);
        const [broken, setBroken] = react.useState(false);
        react.useEffect(() => {
          const refresh = () => bump((n) => n + 1);
          watchers.add(refresh);
          return () => watchers.delete(refresh);
        }, []);
        const title = state.heroTitle === "" ? HERO_TITLE_FALLBACK : state.heroTitle;
        return h("span", { className: "swf-hero" },
          broken || state.heroReady === false ? null : h("img", {
            className: "swf-hero-mark",
            src: new URL(HERO_PATH, document.baseURI).href,
            alt: "",
            draggable: false,
            onError: () => setBroken(true),
          }),
          h("span", { className: "swf-hero-title" },
            h("span", { className: "swf-hero-title-text" }, title)));
      }

      return { SilverWolfAction, SilverWolfSettings, SilverWolfHero };
    }

    // ---------------------------------------------------------------------
    // 入口
    // ---------------------------------------------------------------------
    function apply(ctx) {
      hostCtx = ctx;

      // 样式表：随插件卸载自动移除。
      ctx.effect(() => {
        const tag = document.createElement("style");
        tag.setAttribute("data-plugin-css", PACKAGE_ID);
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => tag.remove();
      }, PACKAGE_ID + ": stylesheet");

      // body 作用域：卸载时还原（含主题开关属性）。
      ctx.effect(() => {
        document.body.setAttribute(BODY_ATTR, "");
        return () => {
          document.body.removeAttribute(BODY_ATTR);
          document.body.removeAttribute(SKIN_ATTR);
        };
      }, PACKAGE_ID + ": body scope");

      // 客户端 loader 会把没有 data-plugin 的 <style> 盖上本插件 id，
      // 卸载时会连带删掉别的插件的运行时样式；把不属于本包的标记摘掉。
      ctx.effect(() => () => {
        const claimed = document.querySelectorAll('style[data-plugin="' + PACKAGE_ID + '"]:not([data-plugin-css])');
        for (const tag of claimed) tag.removeAttribute("data-plugin");
      }, PACKAGE_ID + ": release styles claimed by the loader");

      // 页面重新可见 / 重新获得焦点时，从宿主同步一次：外部或其他窗口改过的
      // 设定不必刷新页面就能对上；有未保存的编辑时跳过，免得盖掉正在写的内容。
      // 背景清单也一起重扫：往 Background/ 里新丢一张图，切回来就看得见。
      ctx.effect(() => {
        const resync = () => {
          if (document.visibilityState === "hidden") return;
          if (pendingEdits.size > 0) return;
          void load(true);
          void loadBackgrounds();
        };
        document.addEventListener("visibilitychange", resync);
        window.addEventListener("focus", resync);
        return () => {
          document.removeEventListener("visibilitychange", resync);
          window.removeEventListener("focus", resync);
        };
      }, PACKAGE_ID + ": resync on focus");

      // 背景层：body 上挂一层（z-index:-1、pointer-events:none，不参与布局也不接指针），
      // 开机就把清单读回来；卸载时把层和轮换定时器一起收走。
      // 深浅色和背景图**不绑定**：切外观不重铺背景，换背景也不动外观。
      ctx.effect(() => {
        ensureBackgroundLayer();
        void loadBackgrounds();
        return () => {
          stopRotation();
          if (backgroundLayer !== null) backgroundLayer.el.remove();
          backgroundLayer = null;
          backgroundAnchor = null;
          backgroundItems = [];
        };
      }, PACKAGE_ID + ": background layer");

      // 活页面取证：开机抓一份，之后每 5 秒在内容变化时抓一份。
      // 只在主题开着的时候跑；setInterval 在 node 里 unref，免得拖住测试进程。
      ctx.effect(() => {
        const tick = () => {
          if (state.theme !== true) return;
          void pushReport(false);
        };
        void pushReport(true);
        if (typeof setInterval !== "function") return () => {};
        reportTimer = setInterval(tick, REPORT_INTERVAL_MS);
        if (reportTimer && typeof reportTimer.unref === "function") reportTimer.unref();
        return () => {
          if (reportTimer !== null) clearInterval(reportTimer);
          reportTimer = null;
        };
      }, PACKAGE_ID + ": dom report");

      const components = createComponents();
      if (components !== null) {
        // 槽位注册的失败必须留在自己这一层。single 槽不允许同优先级重复注册，抛出去会被
        // 算到「声明这个槽位的宿主入口」头上——在 DSH Desktop 上就是整个客户端入口激活失败、
        // GUI 起不来（issue #1）。所以每处 inject 的回调内部单独兜住，只记一条 warn。
        const safeInject = (name, register) => {
          try {
            ctx.slots.inject(name, () => {
              try {
                return register();
              } catch (error) {
                log("warn", `槽位 ${name} 注册失败，跳过（主题其余部分照常）`, error);
                return () => {};
              }
            });
          } catch (error) {
            log("warn", `槽位 ${name} 注入失败，跳过（主题其余部分照常）`, error);
          }
        };

        safeInject("sidebar.footer.action", () => ctx.slots.register({
          name: "sidebar.footer.action",
          id: "silverwolf-persona",
          order: 20,
          label: () => "银狼",
        }, components.SilverWolfAction));

        safeInject("settings.section", () => ctx.slots.register({
          name: "settings.section",
          id: "silverwolf-theme",
          order: 30,
          label: () => "银狼 · 主题",
        }, components.SilverWolfSettings));

        // 单占位槽位。契约里官方示例只传 { name }，可宿主不一定让这个槽空着：DSH Desktop
        // 的 dsh-desktop-client-ui 就在 priority 0 占了它（内容就是那条鱼）。契约原文是
        // "register at a different priority to shadow it (lowest renders)"，所以用 -1 去盖住
        // p0；槽位真空着时 -1 也是唯一的一个，照常渲染。
        safeInject("conversation.hero.brand.mark", () => ctx.slots.register({
          name: "conversation.hero.brand.mark",
          priority: -1,
        }, components.SilverWolfHero));
      }

      void load().then(() => {
        applySkin();
        log("info", state.theme ? "银狼主题已启用" : "银狼主题已关闭（设置里可重新打开）");
      });
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  },
});
