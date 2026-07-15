import { useModel, history } from '@umijs/max';
import { useEffect, useState } from 'react';
import { TeamOutlined, SafetyCertificateOutlined, AppstoreOutlined, FileTextOutlined, ApartmentOutlined, LayoutOutlined } from '@ant-design/icons';
import { getDashboardStats, getRecentLogs } from '@/services/ant-design-pro/api';
import { useRealtime } from '@/components/GlobalRealtimeProvider';
import './index.less';

const Svg16 = ({ d1, d2 }: { d1: string; d2?: string }) => (
  <svg style={{ width: 16, height: 16, fill: 'none', stroke: 'currentcolor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }} viewBox="0 0 24 24">
    <path d={d1} />{d2 && <path d={d2} />}
  </svg>
);

const toneMap: Record<string, string> = {
  toneBlue: 'kox-tone-blue', toneGreen: 'kox-tone-green', toneViolet: 'kox-tone-violet',
  toneOrange: 'kox-tone-orange', toneCyan: 'kox-tone-cyan',
};
const toneBgMap: Record<string, string> = {
  toneBlue: 'color-mix(in srgb, rgb(76, 127, 241) 11%, white)',
  toneGreen: 'color-mix(in srgb, rgb(103, 185, 70) 11%, white)',
  toneViolet: 'color-mix(in srgb, rgb(125, 91, 228) 11%, white)',
  toneOrange: 'color-mix(in srgb, rgb(242, 160, 68) 11%, white)',
  toneCyan: 'color-mix(in srgb, rgb(45, 191, 193) 11%, white)',
};
const actToneBg: Record<string, string> = {
  toneBlue: 'linear-gradient(145deg, rgb(121,183,255), rgb(76,127,241))',
  toneGreen: 'linear-gradient(145deg, rgb(155,217,109), rgb(103,185,70))',
  toneViolet: 'linear-gradient(145deg, rgb(170,140,255), rgb(125,91,228))',
  toneOrange: 'linear-gradient(145deg, rgb(255,195,114), rgb(242,160,68))',
  toneCyan: 'linear-gradient(145deg, rgb(114,224,220), rgb(45,191,193))',
};

const quickActions = [
  { label: '用户管理', desc: '管理系统用户', icon: <TeamOutlined />, tone: 'toneBlue', path: '/system/user' },
  { label: '部门管理', desc: '管理组织结构', icon: <ApartmentOutlined />, tone: 'toneOrange', path: '/system/dept' },
  { label: '角色管理', desc: '管理系统角色', icon: <SafetyCertificateOutlined />, tone: 'toneGreen', path: '/system/role' },
  { label: '菜单管理', desc: '配置系统菜单', icon: <AppstoreOutlined />, tone: 'toneViolet', path: '/system/menu' },
  { label: '页面配置', desc: '自定义页面布局', icon: <LayoutOutlined />, tone: 'toneBlue', path: '/system/page-config' },
  { label: '系统日志', desc: '查看系统日志', icon: <FileTextOutlined />, tone: 'toneCyan', path: '/system/log' },
];

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}天 ${h}小时 ${m}分`;
  return `${h}小时 ${m}分`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  return `${Math.floor(hrs / 24)}天前`;
}

function fmtNum(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString('zh-CN');
}

export default function DashboardPage() {
  const { initialState } = useModel('@@initialState');
  const currentUser = initialState?.currentUser as any;
  const nickname = currentUser?.nickname || currentUser?.username || '管理员';

  const [stats, setStats] = useState({ userCount: 0, roleCount: 0, menuCount: 0, logCount: 0 });
  const [recentLogs, setRecentLogs] = useState<Array<{ title: string; username: string; businessType: string; createTime: string }>>([]);
  const { info: rtInfo } = useRealtime();

  useEffect(() => {
    getDashboardStats().then((res: any) => { if (res?.data) setStats(res.data); }).catch(() => {});
    getRecentLogs().then((res: any) => { if (res?.data) setRecentLogs(res.data); }).catch(() => {});
  }, []);

  // WebSocket 实时系统数据
  const wsData = rtInfo as any;
  const cpuLoad = wsData?.cpu ?? 0;
  const memPercent = wsData?.mem ? Math.round((wsData.mem.heapUsed / wsData.mem.heapTotal) * 100) : 0;
  const wsUptime = wsData?.uptime ?? 0;

  const statusItems: Array<{ label: string; val: string; ok: boolean; icon: string; bar: boolean | number; tone: string; barColor?: string }> = [
    { label: 'CPU 负载', val: `${cpuLoad}%`, ok: false, icon: 'M3 4h18v6H3zM3 14h18v6H3zM7 7h.01M7 17h.01M11 7h7M11 17h7', bar: cpuLoad, barColor: 'linear-gradient(90deg, rgb(79,140,255), rgb(126,185,255))', tone: 'toneBlue' },
    { label: '堆内存使用', val: `${memPercent}%`, ok: false, icon: 'M5 5h14v14H5zM9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3', bar: memPercent, barColor: 'linear-gradient(90deg, rgb(79,140,255), rgb(126,185,255))', tone: 'toneBlue' },
    { label: '系统运行时长', val: fmtUptime(wsUptime), ok: false, icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 7v5l3 2', bar: false, tone: 'toneViolet' },
    { label: 'Node 进程时长', val: fmtUptime(wsUptime), ok: false, icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 7v5l3 2', bar: false, tone: 'toneOrange' },
  ];

  const activityTones = ['toneBlue', 'toneGreen', 'toneViolet', 'toneOrange', 'toneCyan'];
  const activityIcons: Array<React.ReactNode> = [
    <TeamOutlined />,
    <SafetyCertificateOutlined />,
    <AppstoreOutlined />,
    <FileTextOutlined />,
    <span />,
  ];

  const today = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());

  // 动态统计卡片
  const metricCards = [
    { label: '用户总数', value: fmtNum(stats.userCount), up: '', icon: <TeamOutlined />, tone: 'toneBlue' },
    { label: '角色总数', value: fmtNum(stats.roleCount), up: '', icon: <SafetyCertificateOutlined />, tone: 'toneGreen' },
    { label: '菜单总数', value: fmtNum(stats.menuCount), up: '', icon: <AppstoreOutlined />, tone: 'toneViolet' },
    { label: '操作日志', value: fmtNum(stats.logCount), up: '', icon: <FileTextOutlined />, tone: 'toneOrange' },
  ];

  return (
    <div className="kox-dashboard">
      {/* Welcome */}
      <section className="kox-welcome kox-glass">
        <div className="kox-welcome-copy">
          <span className="kox-eyebrow"><span className="kox-eyebrow-line" /> Management Overview</span>
          <h1 className="kox-welcome-h1">欢迎回来，{nickname} <span className="kox-wave">👋</span></h1>
          <p className="kox-welcome-p">今天是 {today}</p>
          <p className="kox-welcome-p">系统运行一切正常，继续保持高效工作吧！</p>
        </div>
        <div className="kox-hero">
          <div className="kox-orb kox-orb-1" />
          <div className="kox-orb kox-orb-2" />
          <div className="kox-vcard kox-bars">
            <span className="kox-bar-dot" /><span className="kox-bar-dot" /><span className="kox-bar-dot" />
            <div className="kox-bar-chart">
              <span className="kox-bar" style={{ height: '35%' }} /><span className="kox-bar" style={{ height: '58%' }} /><span className="kox-bar" style={{ height: '78%' }} />
            </div>
          </div>
          <div className="kox-vcard kox-pie-card">
            <div className="kox-pie" />
            <span className="kox-pie-line" style={{ width: 64 }} /><span className="kox-pie-line" style={{ width: 43, marginLeft: 13 }} />
          </div>
          <div className="kox-vcard kox-list-card">
            <span className="kox-list-line" style={{ width: '100%' }} /><span className="kox-list-line" style={{ width: '80%' }} />
            <span className="kox-list-line" style={{ width: '63%' }} /><span className="kox-list-line" style={{ width: '45%' }} />
          </div>
        </div>
      </section>

      {/* Metrics  */}
      <section className="kox-metrics">
        {metricCards.map((m, i) => (
          <article key={i} className="kox-mcard kox-glass">
            <span className={`kox-micon ${toneMap[m.tone]}`} style={{ fontSize: 26 }}>{m.icon}</span>
            <div className="kox-mcopy">
              <span className="kox-mlabel">{m.label}</span>
              <strong className="kox-mval">{m.value}</strong>
              {m.up && <small className="kox-msub">较昨日<b className="kox-mup"><svg style={{ width: 12, height: 12, marginRight: 1, fill: 'none', stroke: 'currentcolor', strokeWidth: 2.2 }} viewBox="0 0 24 24"><path d="m7 14 5-5 5 5" /></svg>{m.up}</b></small>}
            </div>
            <span className="kox-msheen" />
          </article>
        ))}
      </section>

      {/* Middle */}
      <section className="kox-middle">
        <article className="kox-panel kox-glass">
          <div className="kox-phead">
            <div><span className="kox-kicker">常用入口</span><h2 className="kox-ptitle">快捷操作</h2></div>
          </div>
          <div className="kox-quick-grid">
            {quickActions.map((a, i) => (
              <button key={i} className="kox-qitem" type="button" onClick={() => history.push(a.path)}>
                <span className={`kox-qicon ${toneMap[a.tone]}`} style={{ fontSize: 20 }}>{a.icon}</span>
                <span className="kox-qcopy"><strong className="kox-qtitle">{a.label}</strong><small className="kox-qdesc">{a.desc}</small></span>
                <svg style={{ width: 14, height: 14, flex: '0 0 auto', fill: 'none', stroke: 'rgb(162,173,188)', strokeWidth: 1.7 }} viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
              </button>
            ))}
          </div>
        </article>

        <article className="kox-panel kox-glass">
          <div className="kox-phead">
            <div><span className="kox-kicker">实时监测</span><h2 className="kox-ptitle">系统状态</h2></div>
          </div>
          <div className="kox-status-list">
            {statusItems.map((s, i) => (
              <div key={i} className="kox-sitem">
                <span className="kox-sicon" style={{ background: toneBgMap[s.tone] }}><Svg16 d1={s.icon} /></span>
                <span className="kox-scopy">
                  <strong className="kox-slabel">{s.label}</strong>
                  {s.bar && <i className="kox-sbar"><span className="kox-sbar-fill" style={{ width: `${s.bar}%`, background: s.barColor }} /></i>}
                </span>
                <b className={s.ok ? 'kox-sval-ok' : 'kox-sval'} style={s.ok ? undefined : { fontSize: 10, fontWeight: 650, whiteSpace: 'nowrap' as const, color: 'rgb(89,100,119)' }}>{s.val}</b>
              </div>
            ))}
          </div>
        </article>

        <article className="kox-panel kox-glass">
          <div className="kox-phead">
            <div><span className="kox-kicker">操作审计</span><h2 className="kox-ptitle">最近操作</h2></div>
          </div>
          <div className="kox-alist">
            {recentLogs.length === 0 && <span className="kox-atext" style={{ padding: '8px 0' }}>暂无操作记录</span>}
            {recentLogs.map((a, i) => (
              <div key={i} className="kox-aitem">
                <span className="kox-aicon" style={{ background: actToneBg[activityTones[i % 5]] }}>{activityIcons[i % 5]}</span>
                <span className="kox-atext">{a.username ? `${a.username} ${a.title}` : a.title}</span>
                <time className="kox-atime">{timeAgo(a.createTime)}</time>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
