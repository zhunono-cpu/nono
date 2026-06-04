import { useEffect, useMemo, useState } from 'react';

type Hole = {
  par: number;
  strokes: number;
  putts: number;
  fairway: boolean;
  gir: boolean;
  ob: boolean;
  penalties: number;
  note: string;
};

type RoundDraft = {
  date: string;
  course: string;
  holes: Hole[];
};

type SavedRound = RoundDraft & {
  id: string;
  savedAt: string;
};

type Metrics = {
  totalStrokes: number;
  totalPar: number;
  totalPutts: number;
  girCount: number;
  fairwayHits: number;
  fairwayTotal: number;
  missedFairways: number;
  obCount: number;
  penalties: number;
  scoreTo80: number;
  overPar: number;
  threePutts: number;
  doublesOrWorse: number;
  scrambleFailures: number;
};

type Stat = {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad';
};

type LossCategory = {
  id: string;
  title: string;
  lostShots: number;
  signal: string;
  advice: string;
};

type TargetOpportunity = {
  id: string;
  title: string;
  current: string;
  target: string;
  saving: number;
  reason: string;
};

type ReviewItem = {
  id: string;
  title: string;
  impact: number;
  evidence: string;
  action: string;
  strategy: string;
};

type RoundReview = {
  metrics: Metrics;
  scoreBand: 'high' | 'near' | 'target';
  biggestLoss: ReviewItem;
  easiestSavings: ReviewItem[];
  nextStrategies: string[];
  allItems: ReviewItem[];
};

const DRAFT_KEY = 'golf-score-analysis-mvp-round';
const HISTORY_KEY = 'golf-score-analysis-mvp-history';

const defaultPars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

const makeInitialRound = (): RoundDraft => ({
  date: new Date().toISOString().slice(0, 10),
  course: '',
  holes: defaultPars.map((par) => ({
    par,
    strokes: par + 1,
    putts: 2,
    fairway: false,
    gir: false,
    ob: false,
    penalties: 0,
    note: '',
  })),
});

const clampNumber = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const percent = (value: number, total: number) =>
  total === 0 ? '0%' : `${Math.round((value / total) * 100)}%`;

const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const formatAverage = (value: number, digits = 1) => (value === 0 ? '-' : value.toFixed(digits));

const scoreTone = (shots: number) => {
  if (shots <= 0) return 'good';
  if (shots <= 2) return 'warn';
  return 'bad';
};

const makeSavedRound = (round: RoundDraft): SavedRound => ({
  ...round,
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  savedAt: new Date().toISOString(),
});

const getMetrics = (round: RoundDraft): Metrics => {
  const totalStrokes = round.holes.reduce((sum, hole) => sum + hole.strokes, 0);
  const totalPar = round.holes.reduce((sum, hole) => sum + hole.par, 0);
  const totalPutts = round.holes.reduce((sum, hole) => sum + hole.putts, 0);
  const girCount = round.holes.filter((hole) => hole.gir).length;
  const fairwayHoles = round.holes.filter((hole) => hole.par > 3);
  const fairwayHits = fairwayHoles.filter((hole) => hole.fairway).length;
  const missedFairways = fairwayHoles.length - fairwayHits;
  const obCount = round.holes.filter((hole) => hole.ob).length;
  const penalties = round.holes.reduce((sum, hole) => sum + hole.penalties, 0);
  const scoreTo80 = totalStrokes - 79;
  const overPar = totalStrokes - totalPar;
  const threePutts = round.holes.filter((hole) => hole.putts >= 3).length;
  const doublesOrWorse = round.holes.filter((hole) => hole.strokes - hole.par >= 2).length;
  const scrambleFailures = round.holes.filter(
    (hole) => !hole.gir && hole.strokes - hole.par >= 1 && hole.putts <= 2 && !hole.ob,
  ).length;

  return {
    totalStrokes,
    totalPar,
    totalPutts,
    girCount,
    fairwayHits,
    fairwayTotal: fairwayHoles.length,
    missedFairways,
    obCount,
    penalties,
    scoreTo80,
    overPar,
    threePutts,
    doublesOrWorse,
    scrambleFailures,
  };
};

const getFairwayRate = (metrics: Metrics) =>
  metrics.fairwayTotal === 0 ? 0 : Math.round((metrics.fairwayHits / metrics.fairwayTotal) * 100);

const getRoundReview = (round: RoundDraft): RoundReview => {
  const metrics = getMetrics(round);
  const fairwayRate = getFairwayRate(metrics);
  const scoreBand = metrics.totalStrokes >= 85 ? 'high' : metrics.totalStrokes >= 80 ? 'near' : 'target';
  const bigMistakeBoost = scoreBand === 'high' ? 1.35 : 1;
  const shortGameBoost = scoreBand === 'near' ? 1.3 : 1;

  const items: ReviewItem[] = [
    {
      id: 'ob',
      title: 'OB',
      impact: metrics.obCount * 2 * bigMistakeBoost,
      evidence: `OB ${metrics.obCount} 次，按每次约损失 2 杆估算。`,
      action:
        metrics.obCount > 0
          ? '把 OB 侧设为绝对禁区，高风险洞优先用 3 木、铁木杆或保底开球。'
          : '本轮 OB 控制很好，下轮继续保持保底开球路线。',
      strategy:
        metrics.obCount > 0
          ? '开球前先选“不能去”的一侧，再选能打第二杆的落点。'
          : '保持当前开球选择，不为了多 10-20 码主动增加 OB 风险。',
    },
    {
      id: 'three-putt',
      title: '三推',
      impact: metrics.threePutts * shortGameBoost,
      evidence: `三推 ${metrics.threePutts} 次，按每次约损失 1 杆估算。`,
      action:
        metrics.threePutts > 1
          ? '练 6-10 米第一推距离控制，目标是停进 1 米圈，同时固定 1 米短推流程。'
          : '三推数量可控，下轮继续把长推第一推停近洞。',
      strategy:
        metrics.threePutts > 1
          ? '长推不追进洞，只追停球区；第二推按固定流程完成。'
          : '果岭上优先控速，避免从上坡好推变成下坡保命推。',
    },
    {
      id: 'gir',
      title: '铁杆 / 攻果岭',
      impact: Math.max(0, 6 - metrics.girCount) * 1.4 + Math.max(0, 8 - metrics.girCount) * 0.35,
      evidence:
        metrics.girCount < 6
          ? `GIR 只有 ${metrics.girCount} 个，低于 6 个，攻果岭是主要问题。`
          : `GIR ${metrics.girCount} 个，距离破 80 更稳的 8 个以上仍有空间。`,
      action:
        metrics.girCount < 8
          ? '练 120-170 码落点分布，下场瞄果岭中间或安全半边，不追边旗。'
          : 'GIR 已接近目标，继续巩固中短铁距离控制。',
      strategy:
        metrics.girCount < 6
          ? '攻果岭默认打安全区，宁可留下长推，也不要短边下不来。'
          : '旗杆靠边时按果岭中心打，优先制造两推 par 机会。',
    },
    {
      id: 'putting',
      title: '推杆总数',
      impact: Math.max(0, metrics.totalPutts - 34) * 1.15 * shortGameBoost,
      evidence:
        metrics.totalPutts > 34
          ? `${metrics.totalPutts} 推，超过 34 推，推杆需要重点练。`
          : `${metrics.totalPutts} 推，没有明显超过 34 推警戒线。`,
      action:
        metrics.totalPutts > 34
          ? '把目标设为 32-34 推：1 米短推保进，6-10 米长推练速度。'
          : '推杆不是本轮最大短板，维持短推流程和长推控距。',
      strategy:
        metrics.totalPutts > 34
          ? '上果岭后第一判断坡度和速度，不急着看线路；先消灭三推。'
          : '保持果岭策略简单，第一推控距，第二推执行流程。',
    },
    {
      id: 'penalty',
      title: '罚杆',
      impact: Math.max(0, metrics.penalties - 1) * 1.2 * bigMistakeBoost,
      evidence:
        metrics.penalties > 2
          ? `罚杆 ${metrics.penalties} 杆，超过 2 杆，下一轮要优先保守策略。`
          : `罚杆 ${metrics.penalties} 杆，没有超过 2 杆警戒线。`,
      action:
        metrics.penalties > 2
          ? '少打穿越水障碍、树林和边界的英雄球，优先把球放回可控位置。'
          : '罚杆总体可控，继续把高风险区域提前标出来。',
      strategy:
        metrics.penalties > 2
          ? '任何需要“打完美球”才能成功的选择，直接降级为保守打法。'
          : '遇到风险区时先算最坏结果，能接受再打。',
    },
    {
      id: 'fairway',
      title: '开球稳定性',
      impact: fairwayRate < 45 ? Math.ceil((45 - fairwayRate) / 10) * 0.9 * bigMistakeBoost : 0,
      evidence:
        fairwayRate < 45
          ? `球道命中率 ${fairwayRate}%，低于 45%，开球稳定性不足。`
          : `球道命中率 ${fairwayRate}%，没有低于 45% 警戒线。`,
      action:
        fairwayRate < 45
          ? '练一条稳定开球曲线，下场优先保证第二杆有角度，而不是追最远距离。'
          : '开球稳定性够用，重点转向攻果岭和果岭周围。',
      strategy:
        fairwayRate < 45
          ? '窄洞和逆风洞优先换安全杆，目标是可打第二杆。'
          : '保持当前开球纪律，只在宽洞释放距离。',
    },
    {
      id: 'short-game',
      title: '短杆救球',
      impact: Math.max(0, metrics.scrambleFailures - 4) * 0.9 * shortGameBoost,
      evidence: `未上 GIR 后保不住 par 的洞约 ${metrics.scrambleFailures} 个。`,
      action:
        metrics.scrambleFailures > 4
          ? '练 10、20、30 码三个落点，先把球送到两推无压力的位置。'
          : '短杆救球没有明显爆雷，保持落点和滚动比例训练。',
      strategy:
        metrics.scrambleFailures > 4
          ? '果岭边不要贪一切一推，先选最稳落点，确保下一推可处理。'
          : '短杆继续选高成功率打法，避免高难度 flop 或强行切近。',
    },
    {
      id: 'big-number',
      title: '大数字控制',
      impact: Math.max(0, metrics.doublesOrWorse - 1) * 1.1 * bigMistakeBoost,
      evidence: `双柏忌或更差 ${metrics.doublesOrWorse} 个。`,
      action:
        metrics.doublesOrWorse > 1
          ? '失误后立刻回到可控位置，接受 bogey，不用第二个高风险动作弥补第一个失误。'
          : '大数字控制不错，下轮继续避免连续冒险。',
      strategy:
        metrics.doublesOrWorse > 1
          ? '坏球后第一目标是把双柏忌封顶，不追奇迹 par。'
          : '继续用保守决策保护记分卡。',
    },
  ];

  const sorted = [...items].sort((a, b) => b.impact - a.impact);
  const active = sorted.filter((item) => item.impact > 0);
  const fallback = scoreBand === 'near'
    ? items.filter((item) => ['putting', 'three-putt', 'short-game'].includes(item.id))
    : sorted;
  const easiestSavings = (active.length >= 3 ? active : [...active, ...fallback])
    .filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 3);
  const biggestLoss = sorted[0];
  const nextStrategies = easiestSavings.map((item) => item.strategy).slice(0, 3);

  return {
    metrics,
    scoreBand,
    biggestLoss,
    easiestSavings,
    nextStrategies,
    allItems: sorted,
  };
};

function App() {
  const [round, setRound] = useState<RoundDraft>(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (!saved) return makeInitialRound();

    try {
      const parsed = JSON.parse(saved) as RoundDraft;
      if (parsed.holes?.length === 18) return parsed;
    } catch {
      return makeInitialRound();
    }

    return makeInitialRound();
  });

  const [history, setHistory] = useState<SavedRound[]>(() => {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (!saved) return [];

    try {
      const parsed = JSON.parse(saved) as SavedRound[];
      if (Array.isArray(parsed)) return parsed.filter((item) => item.holes?.length === 18);
    } catch {
      return [];
    }

    return [];
  });

  const [selectedRoundId, setSelectedRoundId] = useState<string>('');
  const [selectedReportRoundId, setSelectedReportRoundId] = useState<string>('');
  const [view, setView] = useState<'dashboard' | 'report'>('dashboard');

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(round));
  }, [round]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const metrics = useMemo(() => getMetrics(round), [round]);
  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => b.date.localeCompare(a.date) || b.savedAt.localeCompare(a.savedAt)),
    [history],
  );
  const recentFive = useMemo(() => [...sortedHistory].slice(0, 5).reverse(), [sortedHistory]);
  const selectedRound = useMemo(
    () => history.find((item) => item.id === selectedRoundId) ?? sortedHistory[0],
    [history, selectedRoundId, sortedHistory],
  );
  const selectedMetrics = selectedRound ? getMetrics(selectedRound) : undefined;
  const reportRound = useMemo(
    () => history.find((item) => item.id === selectedReportRoundId) ?? selectedRound,
    [history, selectedReportRoundId, selectedRound],
  );
  const report = useMemo(() => (reportRound ? getRoundReview(reportRound) : undefined), [reportRound]);

  const historyMetrics = useMemo(() => history.map(getMetrics), [history]);
  const averageStats: Stat[] = [
    { label: '平均杆数', value: formatAverage(average(historyMetrics.map((item) => item.totalStrokes))) },
    { label: '平均推杆', value: formatAverage(average(historyMetrics.map((item) => item.totalPutts))) },
    {
      label: '平均 GIR',
      value:
        historyMetrics.length === 0
          ? '-'
          : percent(
              historyMetrics.reduce((sum, item) => sum + item.girCount, 0),
              historyMetrics.length * 18,
            ),
    },
    {
      label: '平均球道',
      value:
        historyMetrics.length === 0
          ? '-'
          : percent(
              historyMetrics.reduce((sum, item) => sum + item.fairwayHits, 0),
              historyMetrics.reduce((sum, item) => sum + item.fairwayTotal, 0),
            ),
    },
  ];

  const lossCategories = useMemo<LossCategory[]>(() => {
    const teeLost = Math.ceil(Math.max(0, metrics.missedFairways - 5) * 0.35);
    const girLost = Math.ceil(Math.max(0, 9 - metrics.girCount) * 0.7);
    const puttingLost = Math.max(0, metrics.totalPutts - 33) + metrics.threePutts;
    const shortGameLost = Math.ceil(Math.max(0, metrics.scrambleFailures - 4) * 0.65);
    const penaltyLost = metrics.penalties + metrics.obCount;
    const strategyLost = Math.max(0, metrics.doublesOrWorse - 2);

    return [
      {
        id: 'tee',
        title: '开球失误',
        lostShots: teeLost,
        signal: `球道 ${metrics.fairwayHits}/${metrics.fairwayTotal}，错过 ${metrics.missedFairways} 个可统计球道`,
        advice: '先建立一支保底开球杆，目标是把球留在能打第二杆的位置。',
      },
      {
        id: 'gir',
        title: 'GIR 不足',
        lostShots: girLost,
        signal: `GIR ${metrics.girCount}/18，距离破 80 稳定线约差 ${Math.max(0, 9 - metrics.girCount)} 个`,
        advice: '练 120-170 码距离控制，下场优先瞄果岭安全区。',
      },
      {
        id: 'putting',
        title: '推杆过多',
        lostShots: puttingLost,
        signal: `${metrics.totalPutts} 推，三推 ${metrics.threePutts} 个`,
        advice: '把目标放在 33 推以内，短推保进，长推第一推停在安全圈。',
      },
      {
        id: 'short-game',
        title: '短杆救球失败',
        lostShots: shortGameLost,
        signal: `未上 GIR 后保不住 par 的洞约 ${metrics.scrambleFailures} 个`,
        advice: '固定 10、20、30 码落点练习，先追求两推无压力。',
      },
      {
        id: 'penalty',
        title: 'OB 和罚杆',
        lostShots: penaltyLost,
        signal: `OB ${metrics.obCount} 次，罚杆 ${metrics.penalties} 杆`,
        advice: '高风险洞提前换安全杆，宁可长一点进攻，也不要从 OB 后重开。',
      },
      {
        id: 'strategy',
        title: '球场策略错误',
        lostShots: strategyLost,
        signal: `双柏忌或更差 ${metrics.doublesOrWorse} 个`,
        advice: '失误后优先回到可控位置，接受 bogey，避免把一杆失误扩大。',
      },
    ];
  }, [metrics]);

  const targetAnalysis = useMemo(() => {
    const targetSaving = 7;
    const opportunities: TargetOpportunity[] = [
      {
        id: 'putting-target',
        title: '推杆',
        current: `${metrics.totalPutts} 推`,
        target: '32 推以内',
        saving: Math.max(0, metrics.totalPutts - 32),
        reason: '推杆最容易用稳定练习直接兑现，短推和长推距离控制都能快速省杆。',
      },
      {
        id: 'penalty-target',
        title: 'OB 和罚杆',
        current: `OB ${metrics.obCount} 次 / 罚杆 ${metrics.penalties}`,
        target: 'OB 0-1 次，罚杆不超过 1',
        saving: Math.max(0, metrics.obCount - 1) + Math.max(0, metrics.penalties - 1),
        reason: '这是最不需要技术爆发的省杆：高风险洞换安全杆，就能少送分。',
      },
      {
        id: 'gir-target',
        title: 'GIR',
        current: `${metrics.girCount} 个`,
        target: '8 个以上',
        saving: Math.ceil(Math.max(0, 8 - metrics.girCount) * 0.75),
        reason: 'GIR 到 8 个以上后，破 80 会更依赖正常两推，而不是靠救球硬撑。',
      },
      {
        id: 'three-putt-target',
        title: '三推',
        current: `${metrics.threePutts} 个`,
        target: '0-1 个',
        saving: Math.max(0, metrics.threePutts - 1),
        reason: '三推基本是纯损失，优先练 6-10 米第一推停球和 1 米短推进洞。',
      },
      {
        id: 'strategy-target',
        title: '大数字控制',
        current: `双柏忌或更差 ${metrics.doublesOrWorse} 个`,
        target: '最多 1 个',
        saving: Math.max(0, metrics.doublesOrWorse - 1),
        reason: '从 86 到 79 不需要每洞进攻，关键是把一次坏球控制成 bogey。',
      },
    ];

    const ranked = opportunities
      .filter((item) => item.saving > 0)
      .sort((a, b) => b.saving - a.saving)
      .slice(0, 3);

    const nextRoundStrategy = [
      metrics.obCount > 1 || metrics.penalties > 1
        ? '有 OB 风险的一侧直接设为禁区，开球宁可短 20 码也要留在可打第二杆的位置。'
        : '保持当前开球风险控制，高风险洞继续用保底路线，不为距离多冒险。',
      metrics.girCount < 8
        ? '攻果岭默认瞄中间或安全半边，旗杆靠边时不硬攻，目标先拿到 8 个 GIR。'
        : 'GIR 已接近目标，下轮重点是保住两推节奏，别因为追旗制造大数字。',
      metrics.totalPutts > 32 || metrics.threePutts > 1
        ? '每个长推只设一个目标：第一推停进 1 米圈；短推按固定流程，不急着看洞。'
        : '推杆策略保持简洁：长推控距，短推执行流程，把 32 推以内当底线。',
      metrics.doublesOrWorse > 1
        ? '失误后第一选择是回球道或上果岭安全区，接受 bogey，拒绝英雄球。'
        : '继续控制大数字，下轮只要少送罚杆和三推，就有机会把分数压进 80。'
    ];

    return { targetSaving, opportunities, ranked, nextRoundStrategy };
  }, [metrics]);

  const topThree = useMemo(
    () =>
      [...lossCategories]
        .sort((a, b) => b.lostShots - a.lostShots)
        .slice(0, 3)
        .map((category) => ({
          title: category.title,
          body:
            category.lostShots > 0
              ? category.advice
              : `${category.title} 目前不是主要短板，保持节奏即可。`,
        })),
    [lossCategories],
  );

  const stats: Stat[] = [
    {
      label: '总杆',
      value: `${metrics.totalStrokes}`,
      tone: metrics.totalStrokes < 80 ? 'good' : metrics.totalStrokes <= 86 ? 'warn' : 'bad',
    },
    { label: '距 79 杆', value: metrics.scoreTo80 <= 0 ? '已达成' : `+${metrics.scoreTo80}` },
    {
      label: '推杆',
      value: `${metrics.totalPutts}`,
      tone: metrics.totalPutts <= 32 ? 'good' : metrics.totalPutts <= 35 ? 'warn' : 'bad',
    },
    {
      label: 'GIR',
      value: percent(metrics.girCount, 18),
      tone: metrics.girCount >= 9 ? 'good' : metrics.girCount >= 6 ? 'warn' : 'bad',
    },
    {
      label: '球道',
      value: percent(metrics.fairwayHits, metrics.fairwayTotal),
      tone: metrics.fairwayHits >= 8 ? 'good' : metrics.fairwayHits >= 6 ? 'warn' : 'bad',
    },
    { label: 'OB', value: `${metrics.obCount}`, tone: metrics.obCount === 0 ? 'good' : 'bad' },
    {
      label: '罚杆',
      value: `${metrics.penalties}`,
      tone: metrics.penalties === 0 ? 'good' : metrics.penalties <= 2 ? 'warn' : 'bad',
    },
  ];

  const updateHole = <Key extends keyof Hole>(index: number, key: Key, value: Hole[Key]) => {
    setRound((current) => ({
      ...current,
      holes: current.holes.map((hole, holeIndex) =>
        holeIndex === index ? { ...hole, [key]: value } : hole,
      ),
    }));
  };

  const saveRound = () => {
    const savedRound = makeSavedRound(round);
    setHistory((current) => [savedRound, ...current]);
    setSelectedRoundId(savedRound.id);
    setSelectedReportRoundId(savedRound.id);
    setView('report');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadHistoryRound = (savedRound: SavedRound) => {
    setRound({
      date: savedRound.date,
      course: savedRound.course,
      holes: savedRound.holes,
    });
    setSelectedRoundId(savedRound.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetRound = () => {
    const confirmed = window.confirm('确定清空当前这一轮吗？');
    if (confirmed) setRound(makeInitialRound());
  };

  if (view === 'report') {
    return (
      <main className="app-shell">
        <section className="topbar">
          <div>
            <p className="eyebrow">Round Review</p>
            <h1>单轮复盘报告</h1>
          </div>
          <button className="ghost-button" type="button" onClick={() => setView('dashboard')}>
            返回首页
          </button>
        </section>

        {reportRound && report ? (
          <RoundReviewReport
            round={reportRound}
            report={report}
            onEdit={() => {
              loadHistoryRound(reportRound);
              setView('dashboard');
            }}
          />
        ) : (
          <section className="panel">
            <p className="empty-state">还没有可复盘的历史轮次。先保存一轮成绩，系统会自动生成报告。</p>
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Golf Score Lab</p>
          <h1>破 80 成绩分析</h1>
        </div>
        <div className="topbar-actions">
          <button className="primary-button" type="button" onClick={saveRound}>
            保存本轮
          </button>
          <button className="ghost-button" type="button" onClick={resetRound}>
            新一轮
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>最近 5 轮趋势</h2>
          <span>{history.length > 0 ? `共 ${history.length} 轮` : '还没有历史'}</span>
        </div>
        <div className="average-grid">
          {averageStats.map((stat) => (
            <article className="average-card" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </article>
          ))}
        </div>
        <ScoreTrendChart rounds={recentFive} />
      </section>

      <section className="round-meta" aria-label="本轮信息">
        <label>
          日期
          <input
            type="date"
            value={round.date}
            onChange={(event) => setRound({ ...round, date: event.target.value })}
          />
        </label>
        <label>
          球场
          <input
            type="text"
            value={round.course}
            placeholder="例如：练习场 / XX 球会"
            onChange={(event) => setRound({ ...round, course: event.target.value })}
          />
        </label>
      </section>

      <section className="stats-grid" aria-label="自动统计">
        {stats.map((stat) => (
          <article className={`stat-card ${stat.tone ?? ''}`} key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>80 杆以内目标分析</h2>
          <span>86 → 79：少 {targetAnalysis.targetSaving} 杆</span>
        </div>
        <div className="break80-summary">
          <strong>
            本轮 {metrics.totalStrokes} 杆，距离 79 杆还差 {Math.max(0, metrics.scoreTo80)} 杆。
          </strong>
          <p>系统优先寻找“不靠爆发也能省”的杆数：少罚杆、少三推、推杆压到 32、GIR 提到 8 个以上。</p>
        </div>
        <div className="target-grid">
          {targetAnalysis.opportunities.map((item) => (
            <article className={`target-card ${item.saving > 0 ? 'needs-work' : 'on-track'}`} key={item.id}>
              <div className="target-card-head">
                <h3>{item.title}</h3>
                <strong>{item.saving > 0 ? `可省 ${item.saving}` : '达标'}</strong>
              </div>
              <div className="target-row">
                <span>现在</span>
                <b>{item.current}</b>
              </div>
              <div className="target-row">
                <span>目标</span>
                <b>{item.target}</b>
              </div>
              <p>{item.reason}</p>
            </article>
          ))}
        </div>
        <div className="priority-box">
          <h3>最容易先省杆的地方</h3>
          {targetAnalysis.ranked.length === 0 ? (
            <p>关键指标已经接近破 80 目标，下轮重点是稳住节奏和避免大数字。</p>
          ) : (
            <ol>
              {targetAnalysis.ranked.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{item.reason}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="strategy-box">
          <h3>下一轮比赛策略</h3>
          <ul>
            {targetAnalysis.nextRoundStrategy.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>失分拆解</h2>
          <span>{metrics.scoreTo80 > 0 ? `距 79 还差 ${metrics.scoreTo80} 杆` : '已破 80'}</span>
        </div>
        <div className="loss-grid">
          {lossCategories.map((category) => (
            <article className={`loss-card ${scoreTone(category.lostShots)}`} key={category.id}>
              <div className="loss-card-head">
                <h3>{category.title}</h3>
                <strong>{category.lostShots > 0 ? `+${category.lostShots}` : 'OK'}</strong>
              </div>
              <p className="loss-signal">{category.signal}</p>
              <p>{category.advice}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>本轮最该练的 3 件事</h2>
          <span>按失分排序</span>
        </div>
        <div className="top-three-list">
          {topThree.map((item, index) => (
            <article key={item.title}>
              <span>{index + 1}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>历史记录</h2>
          <span>可查看详情</span>
        </div>
        {history.length === 0 ? (
          <p className="empty-state">保存一轮成绩后，这里会出现历史记录和每轮详情。</p>
        ) : (
          <div className="history-layout">
            <div className="history-list">
              {sortedHistory.map((item) => {
                const itemMetrics = getMetrics(item);
                const active = item.id === selectedRound?.id;

                return (
                  <button
                    className={`history-item ${active ? 'active' : ''}`}
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedRoundId(item.id)}
                  >
                    <span>
                      {item.date}
                      {item.course ? ` · ${item.course}` : ''}
                    </span>
                    <strong>{itemMetrics.totalStrokes} 杆</strong>
                  </button>
                );
              })}
            </div>

            {selectedRound && selectedMetrics && (
              <article className="history-detail">
                <div className="history-detail-head">
                  <div>
                    <h3>{selectedRound.course || '未命名球场'}</h3>
                    <p>{selectedRound.date}</p>
                  </div>
                  <div className="history-actions">
                    <button
                      type="button"
                      className="primary-button compact"
                      onClick={() => {
                        setSelectedReportRoundId(selectedRound.id);
                        setView('report');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      查看复盘
                    </button>
                    <button type="button" className="ghost-button compact" onClick={() => loadHistoryRound(selectedRound)}>
                      载入编辑
                    </button>
                  </div>
                </div>
                <div className="detail-stats">
                  <span>总杆 {selectedMetrics.totalStrokes}</span>
                  <span>推杆 {selectedMetrics.totalPutts}</span>
                  <span>GIR {percent(selectedMetrics.girCount, 18)}</span>
                  <span>球道 {percent(selectedMetrics.fairwayHits, selectedMetrics.fairwayTotal)}</span>
                </div>
                <div className="hole-detail-grid">
                  {selectedRound.holes.map((hole, index) => (
                    <div className="hole-detail" key={`${selectedRound.id}-${index}`}>
                      <strong>{index + 1}</strong>
                      <span>
                        Par {hole.par} / {hole.strokes} 杆 / {hole.putts} 推
                      </span>
                      <small>
                        {hole.gir ? 'GIR' : '未 GIR'}
                        {hole.par > 3 ? ` · ${hole.fairway ? '上球道' : '未上球道'}` : ''}
                        {hole.ob ? ' · OB' : ''}
                        {hole.penalties > 0 ? ` · 罚 ${hole.penalties}` : ''}
                      </small>
                    </div>
                  ))}
                </div>
              </article>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>18 洞录入</h2>
          <span>自动保存草稿</span>
        </div>
        <div className="holes-list">
          {round.holes.map((hole, index) => (
            <article className="hole-card" key={index}>
              <div className="hole-head">
                <strong>{index + 1} 洞</strong>
                <span>
                  Par {hole.par} · {hole.strokes - hole.par >= 0 ? '+' : ''}
                  {hole.strokes - hole.par}
                </span>
              </div>

              <div className="field-grid">
                <NumberField label="标准杆" value={hole.par} min={3} max={5} onChange={(value) => updateHole(index, 'par', value)} />
                <NumberField label="实际杆" value={hole.strokes} min={1} max={12} onChange={(value) => updateHole(index, 'strokes', value)} />
                <NumberField label="推杆" value={hole.putts} min={0} max={6} onChange={(value) => updateHole(index, 'putts', value)} />
                <NumberField label="罚杆" value={hole.penalties} min={0} max={6} onChange={(value) => updateHole(index, 'penalties', value)} />
              </div>

              <div className="toggle-row">
                {hole.par > 3 && (
                  <Toggle label="球道" checked={hole.fairway} onChange={(value) => updateHole(index, 'fairway', value)} />
                )}
                <Toggle label="GIR" checked={hole.gir} onChange={(value) => updateHole(index, 'gir', value)} />
                <Toggle label="OB" checked={hole.ob} onChange={(value) => updateHole(index, 'ob', value)} />
              </div>

              <label className="note-field">
                备注
                <textarea
                  value={hole.note}
                  placeholder="例如：开球右曲、三推、切杆短了"
                  rows={2}
                  onChange={(event) => updateHole(index, 'note', event.target.value)}
                />
              </label>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function RoundReviewReport({
  round,
  report,
  onEdit,
}: {
  round: SavedRound;
  report: RoundReview;
  onEdit: () => void;
}) {
  const { metrics, biggestLoss, easiestSavings, nextStrategies } = report;
  const gap = Math.max(0, metrics.scoreTo80);
  const fairwayRate = getFairwayRate(metrics);
  const bandText =
    report.scoreBand === 'high'
      ? '本轮 85+，优先处理 OB、罚杆和双柏忌这类大失误。'
      : report.scoreBand === 'near'
        ? '本轮 80-84，已经接近破 80，优先从短杆和推杆里抠杆。'
        : '本轮已经进入 80 杆以内，重点是把成功模式稳定复制。';

  return (
    <>
      <section className="report-hero">
        <div>
          <p>{round.date}{round.course ? ` · ${round.course}` : ''}</p>
          <h2>{metrics.totalStrokes} 杆</h2>
          <span>{gap === 0 ? '已达到 79 杆目标' : `与目标 79 杆差 ${gap} 杆`}</span>
        </div>
        <button className="ghost-button" type="button" onClick={onEdit}>
          载入编辑
        </button>
      </section>

      <section className="report-grid">
        <article className="report-stat">
          <span>推杆</span>
          <strong>{metrics.totalPutts}</strong>
        </article>
        <article className="report-stat">
          <span>GIR</span>
          <strong>{metrics.girCount}/18</strong>
        </article>
        <article className="report-stat">
          <span>球道</span>
          <strong>{fairwayRate}%</strong>
        </article>
        <article className="report-stat">
          <span>OB / 罚杆</span>
          <strong>{metrics.obCount} / {metrics.penalties}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>报告判断</h2>
          <span>数据校准</span>
        </div>
        <div className="report-summary">
          <p>{bandText}</p>
          <p>
            最大失分来源是 <strong>{biggestLoss.title}</strong>：{biggestLoss.evidence}
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>最容易省杆的 3 个环节</h2>
          <span>按本轮数据排序</span>
        </div>
        <div className="review-list">
          {easiestSavings.map((item, index) => (
            <article key={item.id}>
              <span>{index + 1}</span>
              <div>
                <h3>{item.title}</h3>
                <p className="review-evidence">{item.evidence}</p>
                <p>{item.action}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>下一轮最重要的 3 条策略</h2>
          <span>实战执行</span>
        </div>
        <div className="strategy-cards">
          {nextStrategies.map((strategy, index) => (
            <article key={strategy}>
              <strong>{index + 1}</strong>
              <p>{strategy}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function ScoreTrendChart({ rounds }: { rounds: SavedRound[] }) {
  if (rounds.length === 0) {
    return <div className="chart-empty">保存成绩后会显示最近 5 轮总杆趋势。</div>;
  }

  const scores = rounds.map((round) => getMetrics(round).totalStrokes);
  const minScore = Math.min(...scores, 79) - 2;
  const maxScore = Math.max(...scores, 90) + 2;
  const width = 360;
  const height = 160;
  const paddingX = 28;
  const paddingY = 24;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const xStep = rounds.length === 1 ? 0 : chartWidth / (rounds.length - 1);
  const points = scores.map((score, index) => {
    const x = paddingX + index * xStep;
    const y = paddingY + ((maxScore - score) / (maxScore - minScore)) * chartHeight;
    return { x, y, score };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const targetY = paddingY + ((maxScore - 79) / (maxScore - minScore)) * chartHeight;

  return (
    <div className="trend-chart" aria-label="最近 5 轮总杆趋势折线图">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <line className="target-line" x1={paddingX} x2={width - paddingX} y1={targetY} y2={targetY} />
        <text className="target-label" x={width - paddingX} y={targetY - 6} textAnchor="end">
          79
        </text>
        <polyline points={line} fill="none" />
        {points.map((point, index) => (
          <g key={`${rounds[index].id}-point`}>
            <circle cx={point.x} cy={point.y} r="4.5" />
            <text x={point.x} y={point.y - 10} textAnchor="middle">
              {point.score}
            </text>
          </g>
        ))}
      </svg>
      <div className="chart-labels">
        {rounds.map((round) => (
          <span key={round.id}>{round.date.slice(5)}</span>
        ))}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-field">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(clampNumber(Number(event.target.value), min, max))}
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`toggle ${checked ? 'checked' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export default App;
