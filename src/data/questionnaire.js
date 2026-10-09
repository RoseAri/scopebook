// Client questionnaire definition. Plain language, no internal terms.
// `impact` marks how much a question can move the estimate:
//   high   – changes scope or the size of the estimate
//   medium – changes complexity, risk or schedule
//   low    – useful context only
import { GOALS, IMPROVEMENTS } from './baseline.js';

const L = (zh, en) => ({ zh, en });
const o = (id, zh, en) => ({ id, label: L(zh, en) });

const UNSURE = (id = 'unsure') => o(id, '還不確定', "I'm not sure yet");

export const QUESTIONS = {
  goals: {
    type: 'multi',
    impact: 'high',
    title: L('你希望使用者來到這個網站／系統時，可以完成哪些事情？', 'What would you like users to be able to do when they visit or use this website or system?'),
    hint: L('可以複選。之後還能再調整。', 'Choose as many as apply. You can change this later.'),
    options: [...GOALS.map((g) => ({ id: g.id, label: g.label })), o('other', '其他', 'Other'), o('unsure', '我還不確定', "I'm not sure yet")],
    exclusive: ['unsure'],
  },
  goalsOther: {
    type: 'text',
    impact: 'medium',
    when: (a) => (a.goals || []).includes('other'),
    title: L('還有哪些想讓使用者完成的事？', 'What else should users be able to do?'),
    placeholder: L('例如：比較方案後線上簽約', 'For example: compare plans and sign up online'),
  },
  improve: {
    type: 'multi',
    impact: 'high',
    when: (a) => (a.goals || []).includes('unsure'),
    title: L('沒關係。你現在最希望改善的是什麼？', "That's okay. What would you most like to improve right now?"),
    options: IMPROVEMENTS.map((i) => ({ id: i.id, label: i.label })),
  },
  improveOther: {
    type: 'text',
    impact: 'low',
    when: (a) => (a.improve || []).includes('other'),
    title: L('想改善的是？', 'What would you like to improve?'),
  },
  currentState: {
    type: 'single',
    impact: 'high',
    title: L('目前是否已經有相關的網站、App、系統或工作方式？', 'Do you already have a website, app, system, or existing way of handling this today?'),
    options: [
      o('none', '沒有，從零開始', 'No, starting from scratch'),
      o('website', '現有網站', 'An existing website'),
      o('app', 'App', 'A mobile app'),
      o('webapp', 'Web App／SaaS', 'A web app / SaaS'),
      o('internal', '內部系統', 'An internal system'),
      o('spreadsheet', 'Excel／Google Sheet', 'Excel / Google Sheets'),
      o('manual', '紙本／人工流程', 'Paper or manual process'),
      o('other', '其他', 'Other'),
    ],
  },
  approach: {
    type: 'single',
    impact: 'medium',
    when: (a) => a.currentState && !['none', 'spreadsheet', 'manual'].includes(a.currentState),
    title: L('這次希望怎麼處理？', 'How would you like to approach it this time?'),
    options: [
      o('redesign', '全面重新設計', 'A complete redesign'),
      o('partial', '部分改版', 'Redesign some parts'),
      o('addFeatures', '新增功能', 'Add new features'),
      o('continue', '延續現有設計', 'Keep the current design and extend it'),
      UNSURE(),
    ],
  },
  currentNote: {
    type: 'text',
    impact: 'low',
    when: (a) => a.currentState && a.currentState !== 'none',
    title: L('簡單說明目前怎麼運作（選填）', 'Briefly, how does it work today? (optional)'),
    placeholder: L('例如：目前透過 LINE 接單，再手動整理到 Excel', 'For example: orders come in through LINE and are copied into Excel by hand'),
  },
  currentUrl: {
    type: 'text',
    impact: 'low',
    when: (a) => ['website', 'webapp', 'app', 'other'].includes(a.currentState),
    title: L('網址或連結（選填）', 'Link (optional)'),
    placeholder: L('https://', 'https://'),
  },
  roles: {
    type: 'single',
    impact: 'high',
    title: L('會有幾種不同身分的人使用？', 'How many different kinds of people will use it?'),
    hint: L('例如：一般客戶、會員、店家、內部員工、管理者。', 'For example: visitors, members, partners, staff, administrators.'),
    options: [o('1', '只有一種', 'Just one'), o('2', '兩種', 'Two'), o('3plus', '三種以上', 'Three or more'), UNSURE()],
  },
  roleDiff: {
    type: 'single',
    impact: 'medium',
    when: (a) => ['2', '3plus', 'unsure'].includes(a.roles),
    title: L('不同身分的人，使用起來差別大嗎？', 'How different is the experience for each of them?'),
    options: [
      o('same', '大致一樣', 'Mostly the same'),
      o('content', '看到的內容不同', 'They see different information'),
      o('workflows', '要做的事情和流程都不同', 'They do different tasks with different steps'),
      UNSURE(),
    ],
  },
  statuses: {
    type: 'single',
    impact: 'medium',
    title: L('訂單、申請或預約，會經過好幾個處理狀態嗎？', 'Do orders, applications or bookings go through several stages?'),
    hint: L('例如：待處理 → 已確認 → 已完成。', 'For example: pending → confirmed → completed.'),
    options: [o('no', '不太會', 'Not really'), o('few', '有幾個狀態', 'A few stages'), o('many', '很多狀態或需要審核', 'Many stages or approvals'), UNSURE()],
  },
  dataVolume: {
    type: 'single',
    impact: 'medium',
    title: L('使用者需要輸入或管理的資料多嗎？', 'How much information do people enter or manage?'),
    options: [
      o('light', '不多，幾個欄位', 'Not much — a few fields'),
      o('moderate', '中等，有一些表格或清單', 'Some forms and lists'),
      o('heavy', '很多，需要大量查看、篩選或編輯', 'A lot — viewing, filtering or editing many records'),
      UNSURE(),
    ],
  },
  specialCases: {
    type: 'multi',
    impact: 'medium',
    title: L('有沒有需要特別處理的情況？', 'Are there situations that need special handling?'),
    options: [
      o('cancel', '取消、退款或退換貨', 'Cancellations, refunds or returns'),
      o('paymentFail', '付款失敗後重新付款', 'Retrying after a failed payment'),
      o('approvals', '需要審核、退件或補件', 'Approvals, rejections or requests for more information'),
      o('capacity', '庫存、名額或數量限制', 'Stock, capacity or quantity limits'),
      o('none', '沒有特別的', 'Nothing special'),
      UNSURE(),
    ],
    exclusive: ['none', 'unsure'],
  },
  integrations: {
    type: 'multi',
    impact: 'high',
    title: L('需要和其他服務或系統連接嗎？', 'Does it need to connect to other services or systems?'),
    options: [
      o('payment', '金流（信用卡、LINE Pay 等）', 'Payment providers (cards, LINE Pay, etc.)'),
      o('maps', '地圖或位置', 'Maps or location'),
      o('erp', 'ERP、POS 或內部系統', 'ERP, POS or an internal system'),
      o('crm', 'CRM 或行銷工具', 'CRM or marketing tools'),
      o('messaging', 'LINE、簡訊或 Email 發送', 'LINE, SMS or email sending'),
      o('other', '其他', 'Other'),
      o('none', '不需要', 'None'),
      UNSURE(),
    ],
    exclusive: ['none', 'unsure'],
  },
  integrationsNote: {
    type: 'text',
    impact: 'low',
    when: (a) => (a.integrations || []).some((x) => ['erp', 'other'].includes(x)),
    title: L('可以簡單說明是哪個系統嗎？（選填）', 'Which system is it? (optional)'),
  },
  devices: {
    type: 'single',
    impact: 'medium',
    title: L('使用者主要用什麼裝置？', 'Which devices will people mainly use?'),
    options: [
      o('desktop', '主要是電腦', 'Mostly desktop'),
      o('mobile', '主要是手機', 'Mostly mobile'),
      o('both', '電腦和手機都很重要', 'Desktop and mobile equally'),
      o('multi', '還有平板或特殊裝置', 'Also tablets or special devices'),
      UNSURE(),
    ],
  },
  collabRoles: {
    type: 'multi',
    impact: 'low',
    title: L('除了你之外，還會有哪些人一起參與這個專案？', 'Besides you, who else will be involved in this project?'),
    options: [
      o('pm', 'PM／專案經理', 'Project manager'),
      o('product', '產品負責人', 'Product owner'),
      o('engineer', '工程師', 'Engineers'),
      o('designer', '內部設計師', 'In-house designers'),
      o('marketing', '行銷／內容', 'Marketing / content'),
      o('management', '主管／老闆', 'Management'),
      o('other', '其他', 'Others'),
      o('none', '只有我', 'Just me'),
    ],
    exclusive: ['none'],
  },
  decider: {
    type: 'single',
    impact: 'medium',
    title: L('最後由誰做決定？', 'Who makes the final decisions?'),
    options: [
      o('me', '我自己', 'I do'),
      o('manager', '我的主管', 'My manager'),
      o('management', '老闆或管理層', 'Senior management or the owner'),
      o('committee', '好幾個人一起決定', 'Several people decide together'),
      UNSURE(),
    ],
  },
  approvalLayers: {
    type: 'single',
    impact: 'medium',
    title: L('通常有幾位主要決策者或幾層審核？', 'How many decision-makers or approval steps are there usually?'),
    options: [o('1', '一位／一層', 'One'), o('2', '兩位／兩層', 'Two'), o('3plus', '三位以上', 'Three or more'), UNSURE()],
  },
  contentReadiness: {
    type: 'single',
    impact: 'high',
    title: L('目前專案需要的文字、圖片、產品資料或其他內容，大致準備到哪裡了？', 'How ready are the text, images, product information and other content the project needs?'),
    options: [
      o('ready', '大多已經準備好了', 'Mostly ready'),
      o('partial', '部分準備好了', 'Partly ready'),
      o('notStarted', '還沒開始準備', 'Not started yet'),
      o('designerHelp', '希望設計師協助整理', "I'd like the designer to help organise it"),
      UNSURE(),
    ],
  },
  techConstraints: {
    type: 'multi',
    impact: 'medium',
    title: L('這個專案有沒有一定要配合的技術或系統限制？', 'Are there technical requirements or systems the project must work with?'),
    options: [
      o('cms', '現有的 CMS（如 WordPress、Shopify）', 'An existing CMS (e.g. WordPress, Shopify)'),
      o('designSystem', '現有的設計系統或品牌規範', 'An existing design system or brand guidelines'),
      o('api', '現有的 API 或後端', 'An existing API or backend'),
      o('devices', '特定瀏覽器或裝置限制', 'Specific browser or device requirements'),
      o('architecture', '現有系統架構', 'An existing system architecture'),
      o('other', '其他', 'Other'),
      o('none', '沒有限制', 'No requirements'),
      UNSURE(),
    ],
    exclusive: ['none', 'unsure'],
  },
  techNote: {
    type: 'text',
    impact: 'low',
    when: (a) => (a.techConstraints || []).some((x) => !['none', 'unsure'].includes(x)),
    title: L('補充說明（選填）', 'Anything to add? (optional)'),
  },
  deadline: {
    type: 'single',
    impact: 'high',
    title: L('希望大約什麼時候完成？', 'When would you like the design to be finished?'),
    options: [
      o('1m', '一個月內', 'Within a month'),
      o('1-2m', '一到兩個月', 'In 1–2 months'),
      o('2-3m', '兩到三個月', 'In 2–3 months'),
      o('3m+', '三個月以上', 'In more than 3 months'),
      o('date', '有明確日期', 'By a specific date'),
      o('flexible', '時間彈性', 'Flexible'),
      UNSURE(),
    ],
  },
  deadlineDate: {
    type: 'date',
    impact: 'high',
    when: (a) => a.deadline === 'date',
    title: L('日期', 'Date'),
  },
  deadlineNote: {
    type: 'text',
    impact: 'low',
    when: (a) => a.deadline && !['flexible', 'unsure'].includes(a.deadline),
    title: L('這個時間點有特別原因嗎？（選填）', 'Is there a reason for this timing? (optional)'),
    placeholder: L('例如：配合新品上市或展覽', 'For example: a product launch or trade show'),
  },
  engineering: {
    type: 'single',
    impact: 'medium',
    title: L('除了設計之外，你是否需要我協助處理工程開發？', 'Besides design, would you like help with development?'),
    options: [
      o('designOnly', '不需要，我們已有開發團隊，只需要設計', 'No — we have a development team and only need design'),
      o('needDev', '需要，希望你協助尋找工程師並整合開發', 'Yes — please help find developers and coordinate development'),
      UNSURE(),
    ],
  },
  contactNote: { type: 'textarea', impact: 'low', title: L('還有什麼想讓我知道的嗎？（選填）', 'Anything else you would like me to know? (optional)') },
};

// Screens: one primary question at a time, with follow-ups revealed beneath it.
export const SECTIONS = [
  { id: 'goals', label: L('目標', 'Goals') },
  { id: 'current', label: L('現況', 'Today') },
  { id: 'scope', label: L('範圍', 'Scope') },
  { id: 'details', label: L('細節', 'Details') },
  { id: 'working', label: L('合作方式', 'Working together') },
  { id: 'timing', label: L('時程', 'Timing') },
  { id: 'wrap', label: L('收尾', 'Wrap-up') },
];

export const SCREENS = [
  { id: 'goals', section: 'goals', questions: ['goals', 'goalsOther', 'improve', 'improveOther'] },
  { id: 'current', section: 'current', questions: ['currentState', 'approach', 'currentNote', 'currentUrl'] },
  { id: 'scope', section: 'scope', custom: 'scope', impact: 'high' },
  { id: 'levels', section: 'scope', custom: 'levels', impact: 'high' },
  { id: 'flows', section: 'scope', custom: 'flows', impact: 'medium' },
  { id: 'roles', section: 'details', questions: ['roles', 'roleDiff'] },
  { id: 'statuses', section: 'details', questions: ['statuses'] },
  { id: 'dataVolume', section: 'details', questions: ['dataVolume'] },
  { id: 'specialCases', section: 'details', questions: ['specialCases'] },
  { id: 'integrations', section: 'details', questions: ['integrations', 'integrationsNote'] },
  { id: 'devices', section: 'details', questions: ['devices'] },
  { id: 'team', section: 'working', questions: ['collabRoles', 'decider', 'approvalLayers'] },
  { id: 'content', section: 'working', questions: ['contentReadiness'] },
  { id: 'tech', section: 'working', questions: ['techConstraints', 'techNote'] },
  { id: 'timeline', section: 'timing', questions: ['deadline', 'deadlineDate', 'deadlineNote'] },
  { id: 'references', section: 'timing', custom: 'references', impact: 'low' },
  { id: 'engineering', section: 'wrap', questions: ['engineering'] },
  { id: 'note', section: 'wrap', questions: ['contactNote'] },
];

// Questions that count toward completion and confidence (contact details excluded).
export const SCORED_QUESTIONS = Object.keys(QUESTIONS).filter(
  (id) => !id.startsWith('contact') && QUESTIONS[id].type !== 'text' && QUESTIONS[id].type !== 'textarea',
);

export const REFERENCE_TYPES = [
  o('existing', '現有參考（目前的網站、系統、截圖、文件）', 'Existing (current site, system, screenshots, documents)'),
  o('market', '市場參考（競品、類似服務）', 'Market (competitors, similar services)'),
  o('visual', '視覺參考（網站、截圖、情緒板）', 'Visual (sites, screenshots, moodboards)'),
];

export const REFERENCE_LIKES = [
  o('visual', '視覺風格', 'Visual style'),
  o('features', '功能', 'Features'),
  o('ia', '資訊架構', 'How information is organised'),
  o('interaction', '操作方式', 'How it works'),
  o('motion', '動畫／互動', 'Motion and interaction'),
  o('feel', '整體感覺', 'Overall feel'),
  UNSURE(),
];

export const FLOW_STEP_TYPES = [
  o('browse', '瀏覽／選擇', 'Browse / select'),
  o('form', '填寫資料', 'Fill in information'),
  o('manage', '編輯／管理資料', 'Edit / manage information'),
  o('payment', '交易／付款', 'Transaction / payment'),
  o('external', '外部服務／系統串接', 'External service / integration'),
  o('confirm', '確認', 'Confirmation'),
  o('other', '其他', 'Other'),
];

export function isVisible(qid, answers) {
  const q = QUESTIONS[qid];
  return !q.when || q.when(answers || {});
}

export function optionLabel(qid, optionId) {
  const q = QUESTIONS[qid];
  return q?.options?.find((x) => x.id === optionId)?.label || null;
}
