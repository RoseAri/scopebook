// Starter contract templates. These are editable reference drafts, not legal advice.
// The designer's own templates take priority; generated contracts never change a template.
//
// Variables in {{double braces}} are filled from the Final Quote, the project and
// the designer's settings when a contract draft is generated.
const L = (zh, en) => ({ zh, en });

export const CONTRACT_VARIABLES = [
  'client.name', 'client.company', 'client.email',
  'designer.name', 'designer.studio', 'designer.email', 'designer.address', 'designer.taxId',
  'project.name', 'quote.version', 'quote.date', 'quote.validUntil',
  'scope.list', 'deliverables.list', 'timeline', 'revisionRounds',
  'price', 'price.words', 'development.fee', 'payment.schedule', 'payment.dueDays',
  'exclusions.list', 'assumptions.list',
  'ip.clause', 'portfolio.clause', 'jurisdiction', 'date',
];

export const IP_OPTIONS = {
  assignment: {
    label: L('著作財產權移轉', 'Copyright assignment'),
    text: L(
      '委託方付清全部款項後，經驗收之最終交付成果之著作財產權移轉予委託方。設計方保留其既有素材、工具、方法及未採用提案之權利，並保有姓名表示權。',
      'Upon full payment, the copyright in the final deliverables accepted by the Client is assigned to the Client. The Designer retains all rights in pre-existing materials, tools, methods and unused concepts, and retains the right to be credited as author.',
    ),
  },
  license: {
    label: L('授權使用', 'Licence'),
    text: L(
      '交付成果之著作權歸設計方所有。委託方付清全部款項後，設計方授權委託方於「{{project.name}}」範圍內，非專屬、永久地使用最終交付成果。超出此範圍之使用，雙方另行協議。',
      'The Designer retains copyright in the deliverables. Upon full payment, the Designer grants the Client a non-exclusive, perpetual licence to use the final deliverables for "{{project.name}}". Any use beyond this requires a separate agreement.',
    ),
  },
  exclusive: {
    label: L('專屬授權', 'Exclusive licence'),
    text: L(
      '交付成果之著作權歸設計方所有。委託方付清全部款項後，設計方授權委託方專屬、永久地使用最終交付成果，設計方不得再授權第三人使用相同成果。',
      'The Designer retains copyright in the deliverables. Upon full payment, the Designer grants the Client an exclusive, perpetual licence to use the final deliverables, and will not license the same deliverables to any third party.',
    ),
  },
  custom: {
    label: L('自訂條款', 'Custom clause'),
    text: L('（請填寫雙方約定之智慧財產權安排。）', '(Describe the intellectual property arrangement agreed by both parties.)'),
  },
};

export const PORTFOLIO_OPTIONS = {
  allowed: {
    label: L('可以使用', 'Allowed'),
    text: L(
      '設計方得於專案公開後，將本專案之設計成果用於作品集、個人網站及專業交流，但不得揭露委託方之機密資訊。',
      'Once the project is public, the Designer may show the work in their portfolio, website and professional presentations, without disclosing the Client\'s confidential information.',
    ),
  },
  notAllowed: {
    label: L('不得使用', 'Not allowed'),
    text: L('設計方不得將本專案之設計成果公開於作品集或任何公開管道。', 'The Designer will not publish the work from this project in a portfolio or any public channel.'),
  },
  approval: {
    label: L('需事先同意', 'Requires approval'),
    text: L(
      '設計方將本專案之設計成果用於作品集或公開分享前，應先取得委託方書面同意。',
      'The Designer will obtain the Client\'s written approval before showing work from this project in a portfolio or in public.',
    ),
  },
  custom: {
    label: L('自訂條款', 'Custom clause'),
    text: L('（請填寫雙方約定之作品集使用方式。）', '(Describe how the work may be shown in a portfolio.)'),
  },
};

const sec = (key, title, body, extra = {}) => ({ key, title, body, optional: false, enabled: true, ...extra });

const BASE_SECTIONS = [
  sec('parties', L('立約人', 'Parties'), L(
    '委託方：{{client.company}} {{client.name}}（以下稱「委託方」）\n設計方：{{designer.studio}} {{designer.name}}（以下稱「設計方」）\n\n雙方就「{{project.name}}」設計委託事宜，依據報價單 第 {{quote.version}} 版（{{quote.date}}）訂立本合約，條款如下。',
    'Client: {{client.company}} {{client.name}} ("the Client")\nDesigner: {{designer.studio}} {{designer.name}} ("the Designer")\n\nThe parties agree to the following terms for the design of "{{project.name}}", based on Quote version {{quote.version}} dated {{quote.date}}.',
  ), { auto: true }),
  sec('scope', L('專案範圍', 'Project scope'), L(
    '設計方依下列範圍提供設計服務：\n{{scope.list}}',
    'The Designer will provide design services covering:\n{{scope.list}}',
  ), { auto: true }),
  sec('deliverables', L('交付成果', 'Deliverables'), L(
    '設計方將交付下列成果：\n{{deliverables.list}}',
    'The Designer will deliver:\n{{deliverables.list}}',
  ), { auto: true }),
  sec('timeline', L('時程', 'Timeline'), L(
    '預計時程：{{timeline}}。\n時程以委託方及時提供內容、回饋與確認為前提；如因委託方延遲提供，時程得相應順延。',
    'Planned timeline: {{timeline}}.\nThe timeline assumes the Client provides content, feedback and approvals on time. Delays on the Client\'s side extend the timeline accordingly.',
  ), { auto: true }),
  sec('fees', L('費用', 'Fees'), L(
    '本專案設計費用為 {{price}}（{{price.words}}）。\n{{development.fee}}',
    'The design fee for this project is {{price}}.\n{{development.fee}}',
  ), { auto: true }),
  sec('payment', L('付款方式', 'Payment schedule'), L(
    '費用依下列方式分期支付：\n{{payment.schedule}}\n委託方應於收到請款通知後 {{payment.dueDays}} 日內付款。',
    'Fees are payable as follows:\n{{payment.schedule}}\nEach payment is due within {{payment.dueDays}} days of invoice.',
  )),
  sec('revisions', L('修改次數', 'Revisions'), L(
    '每個設計階段包含 {{revisionRounds}} 次修改。一次修改指委託方一次彙整之回饋意見。超出約定次數或已確認內容之變更，依第「範圍變更」條處理。',
    'Each design phase includes {{revisionRounds}} rounds of revisions. One round means one consolidated set of feedback from the Client. Additional rounds, or changes to approved work, are handled under "Scope changes".',
  )),
  sec('outOfScope', L('不包含項目', 'Out of scope'), L(
    '下列項目不包含於本合約範圍：\n{{exclusions.list}}',
    'The following are not included in this agreement:\n{{exclusions.list}}',
  ), { auto: true }),
  sec('assumptions', L('前提假設', 'Assumptions'), L(
    '本合約之範圍與費用基於下列前提：\n{{assumptions.list}}',
    'The scope and fees are based on the following assumptions:\n{{assumptions.list}}',
  ), { auto: true }),
  sec('clientResponsibilities', L('委託方配合事項', 'Client responsibilities'), L(
    '委託方應：\n• 提供專案所需之文字、圖片、品牌素材及產品資料\n• 於約定時間內提供彙整後之回饋與確認\n• 指定單一窗口統整內部意見\n• 提供現有系統、帳號或文件之存取（如需要）',
    'The Client will:\n• Provide the text, images, brand assets and product information the project needs\n• Give consolidated feedback and approvals within the agreed time\n• Name one contact person to consolidate internal feedback\n• Provide access to existing systems, accounts or documents where needed',
  )),
  sec('scopeChanges', L('範圍變更', 'Scope changes'), L(
    '如委託方要求新增或變更本合約範圍以外之需求，設計方將先提出影響時程與費用之評估，經雙方書面確認後始進行。',
    'If the Client requests work beyond the agreed scope, the Designer will first provide an estimate of the effect on timeline and fees. Work proceeds only after both parties confirm in writing.',
  )),
  sec('acceptance', L('驗收', 'Acceptance'), L(
    '設計方交付最終成果後，委託方應於 7 日內完成驗收或提出具體修改意見。逾期未提出者，視為驗收完成。',
    'After final delivery, the Client will accept the deliverables or provide specific revision requests within 7 days. If no response is received within that period, the deliverables are considered accepted.',
  )),
  sec('ip', L('智慧財產權', 'Intellectual property'), L('{{ip.clause}}', '{{ip.clause}}')),
  sec('portfolio', L('作品集使用', 'Portfolio use'), L('{{portfolio.clause}}', '{{portfolio.clause}}')),
  sec('confidentiality', L('保密', 'Confidentiality'), L(
    '雙方對於因本專案知悉之對方營業秘密及非公開資訊負保密義務，非經對方書面同意不得揭露予第三人。本條於合約終止後仍有效。',
    'Each party will keep the other party\'s non-public and commercially sensitive information confidential and will not disclose it to third parties without written consent. This clause survives termination.',
  ), { optional: true }),
  sec('cancellation', L('取消與終止', 'Cancellation'), L(
    '任一方得以書面通知終止本合約。委託方提前終止時，已支付之訂金不予退還，並應依已完成之工作比例支付費用；設計方提前終止時，應退還未完成部分之已收費用。',
    'Either party may end this agreement by written notice. If the Client cancels, the deposit is non-refundable and the Client pays for work completed to date. If the Designer cancels, the Designer refunds fees received for work not yet completed.',
  )),
  sec('general', L('其他約定', 'General'), L(
    '本合約以{{jurisdiction}}法律為準據法。本合約之修改應以書面為之。本合約一式兩份，雙方各執一份。',
    'This agreement is governed by the laws of {{jurisdiction}}. Changes to this agreement must be made in writing. Each party keeps one signed copy.',
  )),
  sec('signatures', L('簽署', 'Signatures'), L(
    '委託方：____________________　日期：__________\n\n設計方：____________________　日期：__________',
    'Client: ____________________    Date: __________\n\nDesigner: ____________________    Date: __________',
  )),
];

const DEV_SECTION = sec('development', L('工程開發', 'Development'), L(
  '設計方將協助委託方尋找合適之工程團隊並協調開發。開發費用、時程與保固由委託方與工程團隊另行約定，或依報價單所列之開發費用辦理。設計方負責設計規格說明與開發期間之設計確認。',
  'The Designer will help the Client find a suitable development team and coordinate development. Development fees, timeline and warranty are agreed separately between the Client and the developers, or as listed in the quote. The Designer provides design specifications and design review during development.',
));

function withSections(keys, extra = []) {
  const all = [...BASE_SECTIONS, ...extra];
  return keys.map((k) => JSON.parse(JSON.stringify(all.find((s) => s.key === k))));
}

const STANDARD_KEYS = ['parties', 'scope', 'deliverables', 'timeline', 'fees', 'payment', 'revisions', 'outOfScope', 'assumptions', 'clientResponsibilities', 'scopeChanges', 'acceptance', 'ip', 'portfolio', 'confidentiality', 'cancellation', 'general', 'signatures'];

export function starterTemplates() {
  return [
    {
      id: 'uxui-standard',
      starter: true,
      name: L('UX/UI 設計標準合約', 'UX/UI Design Standard'),
      description: L('適用於產品、Web App、系統介面設計。', 'For product, web app and system interface design.'),
      defaults: { ip: 'assignment', portfolio: 'approval', confidentiality: true },
      sections: withSections(STANDARD_KEYS),
    },
    {
      id: 'website-standard',
      starter: true,
      name: L('網站設計標準合約', 'Website Design Standard'),
      description: L('適用於品牌、形象與行銷網站。', 'For brand, corporate and marketing websites.'),
      defaults: { ip: 'assignment', portfolio: 'allowed', confidentiality: false },
      sections: withSections(STANDARD_KEYS),
    },
    {
      id: 'audit-consulting',
      starter: true,
      name: L('UX 診斷／顧問合約', 'UX Audit / Consulting'),
      description: L('適用於 UX 診斷、研究、工作坊與顧問服務。', 'For UX audits, research, workshops and consulting.'),
      defaults: { ip: 'license', portfolio: 'approval', confidentiality: true },
      sections: withSections(['parties', 'scope', 'deliverables', 'timeline', 'fees', 'payment', 'outOfScope', 'assumptions', 'clientResponsibilities', 'scopeChanges', 'ip', 'portfolio', 'confidentiality', 'cancellation', 'general', 'signatures']),
    },
    {
      id: 'design-dev',
      starter: true,
      name: L('設計＋開發合約', 'Design + Development'),
      description: L('設計之外，由設計方協助尋找並協調工程開發。', 'Design plus help finding and coordinating developers.'),
      defaults: { ip: 'assignment', portfolio: 'approval', confidentiality: true },
      sections: withSections([...STANDARD_KEYS.slice(0, 8), 'development', ...STANDARD_KEYS.slice(8)], [DEV_SECTION]),
    },
    {
      id: 'custom',
      starter: true,
      name: L('自訂合約', 'Custom'),
      description: L('只包含基本條款，其餘自行撰寫。', 'Only the essentials; write the rest yourself.'),
      defaults: { ip: 'custom', portfolio: 'custom', confidentiality: false },
      sections: withSections(['parties', 'scope', 'deliverables', 'timeline', 'fees', 'payment', 'ip', 'signatures']),
    },
  ];
}

export const CONTRACT_DISCLAIMER = L(
  '此合約草稿依據你的專案資訊與標準合約範本產生。簽署前請自行審閱並調整；如有特定法律需求，請諮詢合格的法律專業人士。',
  'Contract draft generated from your project information and standard contract template. Please review and adjust it before signing. For specific legal requirements, consult a qualified legal professional.',
);
