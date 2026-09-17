// Client 入口：DSH Web UI 的错题本侧边栏面板。
// 产物格式对齐 dsh-client-modules 的惰性 CJS bundle 契约（参照 dsh-client-ui-message-feedback/lib/client.js）：
// window.__ModuleLoader__.load({ id, factory(require) { ...; return module.exports } })
// react / react/jsx-runtime 由平台冻结模块表提供，必须 external，不能打进来。
window.__ModuleLoader__.load({
  id: 'dsh-mistake-notebook',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    var React = require('react');
    var h = React.createElement;

    var PANEL_ID = 'mistake-notebook';
    var NS = 'mistake-notebook';

    // ---------- 多语言词典（zh / en 必须齐全）----------
    var DICT = {
      zh: {
        title: '错题本',
        search: '搜索错题…',
        refresh: '刷新',
        stats: '共 {total} 条 · 🔴 禁令 {ban} · 🟡 建议 {advice}',
        levelBan: '禁令',
        levelAdvice: '建议',
        recurred: '{count} 次（{dates}）',
        sceneLabel: '场景',
        badLabel: '错误做法',
        goodLabel: '正确做法',
        sourceLabel: '来源',
        loading: '正在读取错题本…',
        noSession1: '还没有打开的会话。',
        noSession2: '错题本按会话所在工作区读取 LESSONS.md。',
        noFile1: '当前工作区没有找到 LESSONS.md。',
        noFile2: '把 mistake-notebook 的模板复制到项目根目录即可开始记账。',
        noEntries1: 'LESSONS.md 里还没有可解析的条目。',
        noEntries2: '条目格式：## [E-001] 标题',
        readError: '读取失败：',
        noMatch: '没有匹配「{query}」的条目。',
        filterAll: '全部',
      },
      en: {
        title: 'Mistake Notebook',
        search: 'Search lessons…',
        refresh: 'Refresh',
        stats: '{total} entries · 🔴 {ban} ban · 🟡 {advice} advice',
        levelBan: 'Ban',
        levelAdvice: 'Advice',
        filterAll: 'All',
        recurred: '{count} times ({dates})',
        sceneLabel: 'Scene',
        badLabel: 'What went wrong',
        goodLabel: 'Do instead',
        sourceLabel: 'Source',
        loading: 'Loading notebook…',
        noSession1: 'No open session.',
        noSession2: 'The notebook is read from the active session workspace.',
        noFile1: 'No LESSONS.md in this workspace.',
        noFile2: 'Copy the mistake-notebook template into the project root to start.',
        noEntries1: 'No parsable entries in LESSONS.md yet.',
        noEntries2: 'Entry format: ## [E-001] Title',
        readError: 'Failed to read:',
        noMatch: 'No entries matching "{query}".',
      },
    };

    // ---------- LESSONS.md 解析 ----------
    // 条目格式（mistake-notebook 项目约定）：
    // ## [E-001] 标题
    // - 触发场景: ...
    // - ❌ 错误做法: ...
    // - ✅ 正确做法: ...
    // - 复发: N 次（MM-DD, ...）
    // - 等级: 🟡 建议 | 🔴 禁令
    // - 来源: ...
    function field(body, label) {
      var re = new RegExp('-\\s*' + label + '\\s*[：:]\\s*(.+)');
      var m = body.match(re);
      return m ? m[1].trim() : null;
    }

    function parseLessons(text) {
      var entries = [];
      var re = /^##\s*\[([E-\d]+)\]\s*(.+)$/gm;
      var marks = [];
      var m;
      while ((m = re.exec(text)) !== null) {
        marks.push({ id: m[1], title: m[2].trim(), start: m.index });
      }
      for (var i = 0; i < marks.length; i++) {
        var end = i + 1 < marks.length ? marks[i + 1].start : text.length;
        var body = text.slice(marks[i].start, end);
        entries.push({
          id: marks[i].id,
          title: marks[i].title,
          scene: field(body, '触发场景'),
          bad: field(body, '❌\\s*错误做法'),
          good: field(body, '✅\\s*正确做法'),
          recur: field(body, '复发'),
          level: field(body, '等级'),
          source: field(body, '来源'),
        });
      }
      return entries;
    }

    function levelOf(entry) {
      if (entry.level && entry.level.indexOf('禁令') >= 0) return 'ban';
      return 'advice';
    }

    function decodeBase64Utf8(b64) {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    }

    // ---------- 工作区名称 ----------
    // 从 sessions.list 快照的当前会话 cwd 取末段作为工作区文件夹名。
    function workspaceName(ctx) {
      try {
        var s = ctx.sessions.list.getSnapshot();
        var item = s.current && s.byId ? s.byId[s.current] : null;
        var cwd = item && item.cwd;
        if (!cwd) return null;
        var parts = String(cwd).split(/[\\/]+/).filter(Boolean);
        return parts.length ? parts[parts.length - 1] : null;
      } catch (e) { return null; }
    }

    // ---------- 样式 ----------
    var S = {
      wrap: { display: 'flex', flexDirection: 'column', height: '100%', padding: '14px', gap: '12px', overflowY: 'auto', boxSizing: 'border-box' },
      header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: '8px' },
      titleRow: { display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: '0' },
      title: { fontSize: '15px', fontWeight: 700, whiteSpace: 'nowrap' },
      sub: { fontSize: '12px', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      refresh: { fontSize: '12px', padding: '3px 10px', borderRadius: '6px', border: '1px solid rgba(127,127,127,0.35)', background: 'transparent', cursor: 'pointer', flexShrink: 0 },
      search: { width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(127,127,127,0.35)', background: 'transparent', color: 'inherit', boxSizing: 'border-box', fontSize: '13px', flexShrink: 0 },
      stats: { fontSize: '12px', opacity: 0.65, flexShrink: 0 },
      list: { display: 'flex', flexDirection: 'column', gap: '12px' },
      card: { border: '1px solid rgba(127,127,127,0.18)', borderRadius: '12px', padding: '12px 14px', background: 'rgba(127,127,127,0.05)', display: 'flex', flexDirection: 'column', gap: '8px' },
      cardBan: { borderColor: 'rgba(229,72,77,0.35)', borderLeft: '3px solid rgba(229,72,77,0.75)' },
      cardAdvice: { borderColor: 'rgba(245,166,35,0.30)', borderLeft: '3px solid rgba(245,166,35,0.65)' },
      cardHead: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '0' },
      cardId: { fontSize: '11px', opacity: 0.5, flexShrink: 0, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' },
      cardTitle: { fontSize: '14px', fontWeight: 600, lineHeight: 1.4, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      headSpacer: { flex: 1 },
      chip: { fontSize: '11px', borderRadius: '999px', padding: '1px 9px', flexShrink: 0 },
      chipBan: { background: 'rgba(229,72,77,0.15)', color: '#ff6369' },
      chipAdvice: { background: 'rgba(245,166,35,0.16)', color: '#e2a336' },
      recur: { fontSize: '11px', opacity: 0.55, flexShrink: 0, whiteSpace: 'nowrap' },
      scene: { fontSize: '12.5px', lineHeight: 1.55, opacity: 0.78, wordBreak: 'break-word' },
      rowLabel: { opacity: 0.5, marginRight: '6px', flexShrink: 0 },
      fixRow: { display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', lineHeight: 1.6, borderRadius: '8px', padding: '7px 10px', wordBreak: 'break-word' },
      fixBad: { background: 'rgba(229,72,77,0.09)' },
      fixGood: { background: 'rgba(70,167,88,0.10)' },
      fixMark: { flexShrink: 0, fontWeight: 700 },
      fixBadMark: { color: '#ff6369' },
      fixGoodMark: { color: '#46a758' },
      source: { fontSize: '11.5px', opacity: 0.5, wordBreak: 'break-word', borderTop: '1px dashed rgba(127,127,127,0.14)', paddingTop: '7px', marginTop: '1px' },
      empty: { textAlign: 'center', marginTop: '48px', fontSize: '13px', opacity: 0.65, lineHeight: 1.8 },
      filterRow: { display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' },
      fchip: { fontSize: '12px', padding: '3px 12px', borderRadius: '999px', border: '1px solid rgba(127,127,127,0.3)', background: 'transparent', color: 'inherit', cursor: 'pointer', opacity: 0.75 },
      fchipOn: { opacity: 1, fontWeight: 600, background: 'rgba(127,127,127,0.15)' },
      fchipBanOn: { background: 'rgba(229,72,77,0.16)', color: '#ff6369', borderColor: 'rgba(229,72,77,0.4)' },
      fchipAdviceOn: { background: 'rgba(245,166,35,0.16)', color: '#e2a336', borderColor: 'rgba(245,166,35,0.4)' },
      glyphBlock: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', width: 'max-content', maxWidth: '150px', overflow: 'hidden' },
      glyphLine1: { fontSize: '14px', fontWeight: 500, lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      glyphLine2: { fontSize: '11px', lineHeight: '14px', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px' },
      icon: function (size, active) {
        return { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.72), opacity: active ? 1 : 0.9 };
      },
    };

    // ---------- 组件 ----------
    // 侧边栏行：宽模式(size 16)下整个两行内容画在图标格里（外壳标题置空），
    // 这样工作区名可以显示在"错题本"下方第二行；收起模式(size 18)只渲染图标。
    function PanelIcon(ctx, t) {
      return function PanelGlyph(props) {
        if (props.size > 16) {
          return h('div', { style: S.icon(props.size, props.active), title: t('title') }, '📓');
        }
        var ws = workspaceName(ctx);
        return h('div', { style: S.glyphBlock, title: ws ? t('title') + '（' + ws + '）' : t('title') },
          h('div', { style: S.glyphLine1 }, '📓 ' + t('title')),
          ws ? h('div', { style: S.glyphLine2 }, '（' + ws + '）') : null);
      };
    }

    function Field(props) {
      if (!props.value) return null;
      return h('div', { style: S.scene },
        h('span', { style: S.rowLabel }, props.label),
        h('span', null, props.value));
    }

    function EntryCard(props) {
      var e = props.entry;
      var t = props.t;
      var lv = levelOf(e);
      var chip = lv === 'ban'
        ? h('span', { style: Object.assign({}, S.chip, S.chipBan) }, '🔴 ' + t('levelBan'))
        : h('span', { style: Object.assign({}, S.chip, S.chipAdvice) }, '🟡 ' + t('levelAdvice'));
      var recurText = e.recur ? e.recur.replace(/^(\d+)\s*次（([^）]*)）$/, function (_, c, d) { return t('recurred', { count: c, dates: d }); }) : null;
      return h('div', { style: Object.assign({}, S.card, S[lv === 'ban' ? 'cardBan' : 'cardAdvice']) },
        h('div', { style: S.cardHead },
          h('span', { style: S.cardId }, e.id),
          h('span', { style: S.cardTitle }, e.title),
          h('span', { style: S.headSpacer }),
          recurText ? h('span', { style: S.recur }, '· ' + recurText) : null,
          chip),
        h(Field, { label: t('sceneLabel'), value: e.scene }),
        e.bad ? h('div', { style: Object.assign({}, S.fixRow, S.fixBad) },
          h('span', { style: Object.assign({}, S.fixMark, S.fixBadMark) }, '✗'),
          h('span', { style: { opacity: 0.5, flexShrink: 0 } }, t('badLabel')),
          h('span', null, e.bad)) : null,
        e.good ? h('div', { style: Object.assign({}, S.fixRow, S.fixGood) },
          h('span', { style: Object.assign({}, S.fixMark, S.fixGoodMark) }, '✓'),
          h('span', { style: { opacity: 0.5, flexShrink: 0 } }, t('goodLabel')),
          h('span', null, e.good)) : null,
        e.source ? h('div', { style: S.source }, t('sourceLabel') + ' · ' + e.source) : null);
    }

    function Panel(ctx, t) {
      return function PanelInner(props) {
        var state = React.useState({ status: 'loading', entries: [], detail: null, sessionId: null });
        var data = state[0], setData = state[1];
        var queryState = React.useState('');
        var query = queryState[0], setQuery = queryState[1];
        var tickState = React.useState(0);
        var tick = tickState[0], setTick = tickState[1];
        var filterState = React.useState('all');
        var filter = filterState[0], setFilter = filterState[1];

        React.useEffect(function () {
          var alive = true;
          function load() {
            var current = null;
            try {
              var list = ctx.sessions && ctx.sessions.list;
              current = list ? list.getSnapshot().current : null;
            } catch (e) { /* sessions 服务尚不可用 */ }
            if (!current) {
              if (alive) setData({ status: 'no-session', entries: [], detail: null, sessionId: null });
              return;
            }
            var wf = ctx.remote && ctx.remote.workspaceFiles;
            if (!wf) {
              if (alive) setData({ status: 'read-error', entries: [], detail: 'remote.workspaceFiles 服务不可用', sessionId: current });
              return;
            }
            wf.readAll(current, 'LESSONS.md').then(function (res) {
              if (!alive) return;
              if (res && res.ok) {
                var text = decodeBase64Utf8(res.value.data);
                var entries = parseLessons(text);
                setData({ status: entries.length ? 'ok' : 'no-entries', entries: entries, detail: null, sessionId: current });
              } else {
                var code = res && res.error ? res.error.code : 'unknown';
                var msg = res && res.error ? res.error.message : '';
                setData({
                  status: code === 'NOT_FOUND' || /not[-\s]?found|ENOENT|no such/i.test(String(msg) + code) ? 'no-file' : 'read-error',
                  entries: [], detail: code + ' ' + msg, sessionId: current,
                });
              }
            }).catch(function (err) {
              if (alive) setData({ status: 'read-error', entries: [], detail: String(err), sessionId: current });
            });
          }
          try { load(); } catch (e) {
            if (alive) setData({ status: 'read-error', entries: [], detail: String(e), sessionId: null });
          }
          var unsubscribe = null;
          try {
            unsubscribe = ctx.sessions.list.subscribe(load);
          } catch (e) { /* 订阅失败则仅手动刷新 */ }
          return function () { alive = false; if (unsubscribe) unsubscribe(); };
        }, [tick]);

        var body;
        if (data.status === 'loading') {
          body = h('div', { style: S.empty }, t('loading'));
        } else if (data.status === 'no-session') {
          body = h('div', { style: S.empty }, t('noSession1'), h('br'), t('noSession2'));
        } else if (data.status === 'no-file') {
          body = h('div', { style: S.empty }, t('noFile1'), h('br'), t('noFile2'));
        } else if (data.status === 'read-error') {
          body = h('div', { style: S.empty }, t('readError'), h('br'), String(data.detail || ''));
        } else if (data.status === 'no-entries') {
          body = h('div', { style: S.empty }, t('noEntries1'), h('br'), t('noEntries2'));
        } else {
          var q = query.trim().toLowerCase();
          var filtered = data.entries.filter(function (e) {
            if (filter !== 'all' && levelOf(e) !== filter) return false;
            if (!q) return true;
            return [e.id, e.title, e.scene, e.bad, e.good, e.source]
              .some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
          });
          var counts = { ban: 0, advice: 0 };
          data.entries.forEach(function (e) { counts[levelOf(e)] += 1; });
          function fchip(key, label, onStyle) {
            var active = filter === key;
            var style = Object.assign({}, S.fchip, active ? Object.assign({ opacity: 1, fontWeight: 600 }, onStyle || S.fchipOn) : {});
            return h('button', { key: key, style: style, onClick: function () { setFilter(key); } }, label);
          }
          var filterRow = h('div', { style: S.filterRow },
            fchip('all', t('filterAll') + ' ' + data.entries.length),
            fchip('ban', '🔴 ' + t('levelBan') + ' ' + counts.ban, S.fchipBanOn),
            fchip('advice', '🟡 ' + t('levelAdvice') + ' ' + counts.advice, S.fchipAdviceOn));
          body = filtered.length
            ? h('div', { style: S.list },
                filtered.map(function (e) { return h(EntryCard, { key: e.id, entry: e, t: t }); }))
            : h('div', { style: S.empty }, t('noMatch', { query: query || t('filterAll') }));
          body = [filterRow, body];
        }

        var ws = workspaceName(ctx);
        return h('div', { style: S.wrap },
          h('div', { style: S.header },
            h('span', { style: S.titleRow },
              h('span', { style: S.title }, '📓 ' + t('title')),
              ws ? h('span', { style: S.sub }, '（' + ws + '）') : null),
            h('button', { style: S.refresh, onClick: function () { setTick(function (x) { return x + 1; }); } }, t('refresh'))),
          h('input', { style: S.search, placeholder: t('search'), value: query, onChange: function (ev) { setQuery(ev.target.value); } }),
          body);
      };
    }

    // ---------- 插件入口 ----------
    exports.inject = ['slots', 'sessions', 'remote', 'remote.workspaceFiles', 'locale'];

    exports.apply = function apply(ctx) {
      // 注册词典并绑定翻译函数（随 DSH 设置里的语言切换自动生效）
      ctx.effect(function () {
        return ctx.locale.register(NS, DICT);
      }, 'mistake-notebook: dictionary');
      var t = ctx.locale.bind(NS);

      // 侧边栏：会话切换时"注销再注入"，触发外壳重算面板清单，
      // 让图标格里的工作区名保持新鲜（语言切换由外壳对 locale 的订阅兜底）。
      var injectDisposer = null;
      function refreshPanelEntry() {
        if (injectDisposer) injectDisposer();
        injectDisposer = ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 60,
            // 外壳标题置空：两行内容由图标格自绘（见 PanelIcon），避免与自绘内容重复
            label: '',
          }, PanelIcon(ctx, t));
        });
      }
      refreshPanelEntry();
      try {
        ctx.sessions.list.subscribe(function () { refreshPanelEntry(); });
      } catch (e) { /* 订阅失败则标签仅在刷新后更新 */ }

      // 全局面板正文（root 作用域 main keyed slot）。
      // 必须经 slots.inject 注册以获得渲染授权：直接 register 的条目不会进入
      // 渲染器的 live 账本，选中面板后只会渲染 data-slot-error 死格。
      ctx.slots.inject('main', function () {
        return ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          inject: function () { return {}; },
        }, Panel(ctx, t));
      });
    };

    return module.exports;
  },
});
