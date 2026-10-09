// Starter pricing rules. Nothing here claims to be a market rate:
// the designer sets the rate, minimum fee and every adjustment.
const L = (zh, en) => ({ zh, en });

export function starterPricing() {
  return {
    currency: 'TWD',
    currencySymbol: 'NT$',
    hourlyRate: 2000,
    minimumFee: 30000,
    rounding: 1000,
    weeklyCapacity: 25, // design hours per week available for one project
    // Estimate range width by confidence: [below, above] the point estimate.
    spreads: { high: [5, 8], medium: [8, 15], low: [12, 25] },
    // Adjustments are off until the designer turns them on.
    adjustments: [
      { id: 'rush-high', name: L('時程緊湊', 'Tight schedule'), kind: 'percent', value: 10, trigger: 'schedule:high', enabled: false },
      { id: 'rush-very', name: L('時程非常緊湊', 'Very tight schedule'), kind: 'percent', value: 20, trigger: 'schedule:veryHigh', enabled: false },
      { id: 'risk-high', name: L('高不確定性', 'High uncertainty'), kind: 'percent', value: 8, trigger: 'risk:high', enabled: false },
      { id: 'coord-heavy', name: L('多方協調', 'Extensive coordination'), kind: 'percent', value: 5, trigger: 'coordination:heavy', enabled: false },
    ],
    quoteValidityDays: 30,
    revisionRounds: 2,
    paymentSchedule: [
      { id: 'p1', label: L('簽約後支付訂金', 'Deposit on signing'), percent: 50 },
      { id: 'p2', label: L('最終交付後支付尾款', 'Balance on final delivery'), percent: 50 },
    ],
    paymentDueDays: 7,
    defaultExclusions: [
      L('文案撰寫與內容翻譯', 'Copywriting and translation'),
      L('攝影、插畫與圖庫授權費用', 'Photography, illustration and stock licensing fees'),
      L('前後端開發與上線部署（另有約定除外）', 'Front-end and back-end development and deployment (unless agreed separately)'),
      L('超過約定次數的修改', 'Revisions beyond the agreed number of rounds'),
    ],
  };
}

export const ADJUSTMENT_TRIGGERS = [
  { id: 'manual', label: L('手動加入', 'Added manually') },
  { id: 'always', label: L('每個專案', 'Every project') },
  { id: 'schedule:high', label: L('時程壓力：高', 'Schedule pressure: high') },
  { id: 'schedule:veryHigh', label: L('時程壓力：非常高', 'Schedule pressure: very high') },
  { id: 'risk:medium', label: L('風險：中以上', 'Risk: medium or higher') },
  { id: 'risk:high', label: L('風險：高', 'Risk: high') },
  { id: 'coordination:moderate', label: L('協調：中以上', 'Coordination: moderate or higher') },
  { id: 'coordination:heavy', label: L('協調：高', 'Coordination: heavy') },
  { id: 'content:designerHelp', label: L('需協助整理內容', 'Content organisation requested') },
];
