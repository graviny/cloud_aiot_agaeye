import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import { AppProvider } from '../src/context';
import { demoData } from '../src/domain';
import { Dashboard } from '../src/pages/Dashboard';
import { Summary } from '../src/pages/Summary';
import { Monitor } from '../src/pages/Monitor';
import { ChildManagement } from '../src/pages/ChildManagement';
import { Welcome } from '../src/pages/Welcome';
import { NotificationSettings } from '../src/components/NotificationSettings';
const data = demoData();
Object.defineProperty(globalThis, 'window', {value: {location: {pathname:'/home',search:'',hash:'',href:'http://localhost:5177/home'}}, configurable:true});
Object.defineProperty(globalThis, 'navigator', {value: {onLine:true}, configurable:true});
Object.defineProperty(globalThis, 'sessionStorage', {value: {getItem:()=> 'demo'}, configurable:true});
Object.defineProperty(globalThis, 'localStorage', {value: {getItem:()=> JSON.stringify(data)}, configurable:true});
for (const page of [<Dashboard onAlert={()=>{}}/>, <Summary/>, <Monitor onAlert={()=>{}}/>, <ChildManagement/>, <Welcome/>, <NotificationSettings/>]) {
  const html = renderToStaticMarkup(<AppProvider>{page}</AppProvider>);
  assert.ok(!/울음|cry-detail|cry-list|cry-alert|aicoo|아이쿠/.test(html));
}
const home = renderToStaticMarkup(<AppProvider><Dashboard onAlert={()=>{}}/></AppProvider>);
assert.ok(home.includes('아가아이')); assert.ok(home.includes('수면 시간')); assert.ok(home.includes('수면 환경 점검'));
const history = renderToStaticMarkup(<AppProvider><Summary/></AppProvider>);
assert.ok(history.includes('수면 시간 추가하기')); assert.ok(history.includes('히스토리')); assert.ok(history.includes('수면 기록 수정'));
console.log('PASS: home, history, monitor, child, welcome and settings render without cry features; sleep controls and 아가아이 branding remain.');
