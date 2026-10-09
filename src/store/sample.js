// A clearly labelled sample project, so the workspace can be explored before a
// real client replies. It goes through the same path as a real reply.
import { getState } from './store.js';
import { addInterviewNote, createAccess, createProject, currentSnapshot, importClientSession } from './actions.js';
import * as S from '../client/session.js';

export function createSampleProject(lang = 'zh') {
  const zh = lang === 'zh';
  const id = createProject({
    name: zh ? '（範例）瑜伽教室會員預約' : '(Sample) Yoga studio member booking',
    notes: zh ? '想讓會員可以線上預約課程，目前用 LINE 處理。' : 'Members should book classes online; today it all happens over LINE.',
  });
  createAccess(id);
  const { settings, projects } = getState();
  const p = projects[id];
  let s = S.newSession({
    token: p.access.token,
    projectId: id,
    projectName: p.name,
    createdAt: new Date().toISOString(),
    snapshot: currentSnapshot(settings),
  });
  const fns = settings.baseline.functions;
  const name = (fid) => fns.find((f) => f.id === fid)?.name || { zh: fid, en: fid };
  s = S.toggleMulti(s, 'goals', 'book');
  s = S.toggleMulti(s, 'goals', 'account');
  s = S.setAnswer(s, 'currentState', 'website');
  s = S.setAnswer(s, 'approach', 'partial');
  s = S.setAnswer(s, 'currentNote', zh ? '目前透過 LINE 接受預約' : 'Bookings currently come in through LINE');
  s = S.ensureScope(s, fns);
  s = S.setItemStatus(s, 'notifications', 'removed', name('notifications'));
  s = S.addCustom(s, zh ? 'POS 系統串接' : 'POS integration', zh ? '店內 POS 會員點數要同步' : 'Sync member points with the in-store POS');
  for (const item of s.scope.items.filter((i) => i.status !== 'removed')) s = S.setLevel(s, item.fnId, item.fnId === 'login' ? 'advanced' : 'basic', name(item.fnId));
  s = S.setValidation(s, 'login', ['password', 'social']);
  s = S.setFlowMode(s, 'book', 'standard');
  s = S.setFlowMode(s, 'account', 'standard');
  s = S.setAnswer(s, 'roles', '2');
  s = S.setAnswer(s, 'roleDiff', 'workflows');
  s = S.setAnswer(s, 'statuses', 'few');
  s = S.setAnswer(s, 'dataVolume', 'moderate');
  s = S.setAnswer(s, 'specialCases', ['cancel']);
  s = S.setAnswer(s, 'integrations', ['erp']);
  s = S.setAnswer(s, 'devices', 'mobile');
  s = S.setAnswer(s, 'collabRoles', ['management']);
  s = S.setAnswer(s, 'decider', 'management');
  s = S.setAnswer(s, 'approvalLayers', '2');
  s = S.setAnswer(s, 'contentReadiness', 'partial');
  s = S.setAnswer(s, 'techConstraints', ['none']);
  s = S.setAnswer(s, 'deadline', '1-2m');
  s = S.setAnswer(s, 'engineering', 'designOnly');
  s = S.submit(s);
  importClientSession(s);
  addInterviewNote(id, {
    category: 'clarification',
    text: zh ? '客戶說明員工與會員會看到不同的後台；POS 只需要同步點數。' : 'Staff and members see different dashboards; the POS only needs to sync points.',
  });
  return id;
}
