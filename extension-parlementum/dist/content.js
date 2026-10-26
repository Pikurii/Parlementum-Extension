(function(){"use strict";const je={};function pe(){try{return!!(typeof chrome<"u"&&chrome?.runtime&&chrome.runtime.id)}catch{return!1}}async function An(){if(pe())try{const e=await chrome.storage.local.get(null);Object.assign(je,e)}catch{}}function Q(e,t=null){return e in je?je[e]:t}let Ce=null,ft=!1;function Dn(){ft||(ft=!0,queueMicrotask(()=>{if(ft=!1,!Ce)return;const e=Ce;if(Ce=null,!!pe())try{chrome.storage.local.set(e).catch(t=>{t?.message?.includes("Extension context invalidated")||console.error("[Storage] batch setValue failed:",t)})}catch{}}))}function v(e,t){je[e]=t,pe()&&(Ce||(Ce={}),Ce[e]=t,Dn())}function Ln(e){if(pe())try{chrome.storage.onChanged.addListener((t,a)=>{if(pe()&&a==="local")for(const[r,{newValue:o}]of Object.entries(t))o!==void 0?je[r]=o:delete je[r],e(r,o)})}catch{}}const ke={sendNotification:!0,tokenRefreshInterval:36e5,tokenExpiryThreshold:3e5,panelDefaultX:10,panelDefaultY:10,soundNotificationEnabled:!0,soundNotificationVolume:.3,energyFullAlertSoundEnabled:!0,energyFullAlertVolume:.3,panelPinned:!1,panelFollowViewport:!0,panelReturnToOriginal:!1,panelDashboardOnly:!0,panelLeaderOnly:!0,maxLogEntries:200,quietModeEnabled:!0,quietModeInterval:12e4,energyThreshold:10,energyFullAlertEnabled:!0,historyMaxDays:30,stealthJitterEnabled:!0,stealthJitterMaxSeconds:25,energyFlushEnabled:!0,autoReloadTabEnabled:!0,circuitBreakerEnabled:!0,foodReminderEnabled:!0,foodResetReminderEnabled:!0,maxFoodDaily:10,sleepScheduleEnabled:!1,sleepStartHour:23,sleepEndHour:5,sleepStartTime:"23:30",sleepEndTime:"05:45",microBreaksEnabled:!1,microBreakFrequencyHours:4,microBreakDurationMinutes:10,energyThresholdJitterEnabled:!1,energyThresholdJitterRange:3,autoReloginEnabled:!1,ecoModeEnabled:!0,autoTrainEnabled:!1,trainStrengthEnabled:!0,trainEducationEnabled:!0,trainEconomyEnabled:!0,trainPriority:"education",targetStrength:100,targetEducation:100,targetEconomy:100,minGoldReserve:50,shortcuts:{showHide:{keys:["Control","Shift","KeyA"],display:"Ctrl+Shift+A"},workNow:{keys:["Alt","Shift","KeyW"],display:"Alt+Shift+W"},pauseResume:{keys:["Alt","Shift","KeyP"],display:"Alt+Shift+P"},openLog:{keys:["Control","Shift","KeyL"],display:"Ctrl+Shift+L"},openSettings:{keys:["Control","Shift","KeyS"],display:"Ctrl+Shift+S"}}},$n={tokenRefreshInterval:[1e3,864e5],tokenExpiryThreshold:[0,864e5],panelDefaultX:[0,1e4],panelDefaultY:[0,1e4],soundNotificationVolume:[0,1],energyFullAlertVolume:[0,1],maxLogEntries:[1,1e3],quietModeInterval:[1e3,864e5],energyThreshold:[10,210],stealthJitterMaxSeconds:[5,120],maxFoodDaily:[10,20],historyMaxDays:[1,365],sleepStartHour:[0,23],sleepEndHour:[0,23],microBreakFrequencyHours:[1,12],microBreakDurationMinutes:[3,45],energyThresholdJitterRange:[1,10],targetStrength:[1,500],targetEducation:[1,500],targetEconomy:[1,500],minGoldReserve:[0,1e6]};function Ye(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}function mt(e,t=!1){if(!Ye(e))return t?null:{...ke,shortcuts:{...ke.shortcuts}};const a={...ke,shortcuts:{...ke.shortcuts}};for(const[r,o]of Object.entries(e)){if(r==="shortcuts"||o===void 0)continue;if(r==="sleepStartTime"||r==="sleepEndTime"){if(typeof o=="string"&&/^\d{1,2}:\d{2}$/.test(o))a[r]=o;else if(t)return null;continue}if(typeof ke[r]=="boolean"){if(typeof o=="boolean")a[r]=o;else if(t)return null;continue}const i=$n[r];if(i){if(typeof o=="number"&&Number.isFinite(o)&&o>=i[0]&&o<=i[1])a[r]=o;else if(t)return null;continue}if(r==="trainPriority"){if(["education","economy","strength","balanced"].includes(o))a.trainPriority=o;else if(t)return null}}if(e.shortcuts!==void 0){if(Ye(e.shortcuts))for(const[r,o]of Object.entries(e.shortcuts)){if(!Object.prototype.hasOwnProperty.call(ke.shortcuts,r))continue;if(Ye(o)&&Array.isArray(o.keys)&&o.keys.length>=1&&o.keys.length<=3&&o.keys.every(s=>typeof s=="string"&&/^[A-Za-z][A-Za-z0-9]*$/.test(s))&&typeof o.display=="string"&&/^[A-Za-z0-9+ ]{1,64}$/.test(o.display))a.shortcuts[r]={keys:[...o.keys],display:o.display};else if(t)return null}else if(t)return null}return a}function Rn(){const e=Q("aw_config",null);if(!e)return mt(ke);try{const t=typeof e=="string"?JSON.parse(e):e;return mt(t)}catch(t){return console.error("[Config] Failed to parse config:",t),mt(ke)}}function tt(e){v("aw_config",e)}function yt(e,t,a=-1/0,r=1/0){let o=0,i=0;for(;o===0;)o=Math.random();for(;i===0;)i=Math.random();const s=Math.sqrt(-2*Math.log(o))*Math.cos(2*Math.PI*i),n=e+s*t;return Math.max(a,Math.min(r,n))}function Ue(e,t,a=null){const r=a??e+(t-e)*.4,o=Math.max(1,(t-e)/6);return Math.round(yt(r,o,e,t))}function Dt(e,t=45e3,a=48e4){if(e<=0)return 0;const r=Math.min(5,e-1),o=t*Math.pow(1.8,r),i=Ue(5e3,25e3,12e3);return Math.min(a,Math.round(o+i))}function Pn(e){if(!e?.energyThresholdJitterEnabled)return 0;const t=Math.max(1,Math.min(5,e.energyThresholdJitterRange||3));return Math.round(yt(0,t*.45,-t,t))}function Lt(e,t,a=Date.now()){if(!t?.microBreaksEnabled)return e.microBreakUntil=0,{inBreak:!1,remainingMs:0};if(e.microBreakUntil&&a<e.microBreakUntil)return{inBreak:!0,remainingMs:e.microBreakUntil-a,reason:e.microBreakReason||"Istirahat santai berkala"};e.microBreakUntil&&a>=e.microBreakUntil&&(e.microBreakUntil=0,e.microBreakReason="");const o=Math.max(1,t.microBreakFrequencyHours||4)*36e5;if(!e.nextMicroBreakScheduledAt){const i=Ue(-.2*o,.2*o,0);e.nextMicroBreakScheduledAt=a+Math.max(18e5,o+i)}if(a>=e.nextMicroBreakScheduledAt){const s=Math.max(5,Math.min(30,t.microBreakDurationMinutes||10))*6e4+Ue(-6e4,12e4,3e4);e.microBreakUntil=a+Math.max(18e4,s),e.microBreakReason="Istirahat santai berkala";const n=Ue(-.2*o,.2*o,0);return e.nextMicroBreakScheduledAt=e.microBreakUntil+Math.max(18e5,o+n),{inBreak:!0,startingNow:!0,remainingMs:e.microBreakUntil-a,reason:e.microBreakReason}}return{inBreak:!1,remainingMs:0}}let ve=null;function $t(){if(typeof BroadcastChannel>"u")return null;if(!ve)try{ve=new BroadcastChannel("aw_parlamentum_tabs"),ve.onmessageerror=()=>{try{ve.close()}catch{}ve=null}}catch{ve=null}return ve}function me(e){if(!e||typeof e!="object")return;const t=$t();if(t)try{t.postMessage(e)}catch{try{t.close()}catch{}ve=null}}function C(){if(typeof window>"u")return!0;const e=(window.location.pathname||"").toLowerCase(),t=e.length>1&&e.endsWith("/")?e.slice(0,-1):e;return t==="/dashboard"||t.startsWith("/dashboard/")||t==="/"||t===""}function ge(){try{if(!C())return null;const e=s=>s?!!s.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast"):!0,t=document.querySelectorAll('[data-testid="dash-energy"], [data-testid="energy"], [data-testid*="energy" i]');for(const s of t){if(e(s))continue;const l=(s.textContent||"").trim().match(/(?:^|[^\d])(\d{1,3})\s*\/\s*(\d{2,3})(?:[^\d]|$)/);if(l){const c=parseInt(l[1],10),f=parseInt(l[2],10);if(f>=50&&f<=350&&c<=f)return{current:c,max:f}}}const a=document.querySelectorAll("span, div, p");for(const s of a){if(e(s))continue;const n=(s.textContent||"").trim();if(/^Penuh\s+dalam\b/i.test(n)||/^(?:ISI|ISI\s*[-·])\s*\d+/i.test(n)){let l=s.parentElement;for(let c=0;c<4&&l&&l!==document.body;c++){const g=(l.textContent||"").trim().match(/(?:(?:ENERGI|ENERGY)[\s\S]{0,30}?)?(\d{1,3})\s*\/\s*(\d{2,3})\b/i);if(g){const y=parseInt(g[1],10),m=parseInt(g[2],10);if(m>=50&&m<=350&&y<=m)return{current:y,max:m}}l=l.parentElement}}}const r=document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, div, p");for(const s of r){if(e(s))continue;const n=(s.textContent||"").trim();if(/^(?:\u26A1)?\s*(?:ENERGI|ENERGY)$/i.test(n)||/^(?:\u26A1)?\s*(?:ENERGI|ENERGY)\b/i.test(n)&&n.length<=20){let l=s.parentElement;for(let c=0;c<4&&l&&l!==document.body&&!(l.getAttribute("data-testid")==="dash-deck"||l.getAttribute("data-testid")==="dash-col-you"||l.tagName==="MAIN");c++){const g=(l.textContent||l.innerText||"").trim().match(/(?:(?:ENERGI|ENERGY)[\s\S]{0,40}?)?(\d{1,3})\s*\/\s*(\d{2,3})\b/i);if(g){const m=parseInt(g[1],10),x=parseInt(g[2],10);if(x>=50&&x<=350&&m<=x)return{current:m,max:x}}const y=l.querySelectorAll("span, div, p");for(const m of y){if(e(m))continue;const x=(m.textContent||"").trim();if(!x.includes("/")||x.length>20||/\b(?:LEVEL|XP|ROTI|SLOT|EMAS|USD|LV)\b/i.test(x))continue;const B=x.match(/(\d{1,3})\s*\/\s*(\d{2,3})\b/);if(B){const D=parseInt(B[1],10),S=parseInt(B[2],10);if(S>=50&&S<=350&&D<=S)return{current:D,max:S}}}l=l.parentElement}}}const o=document.querySelectorAll('header, nav, footer, [role="banner"], [role="status"], div[class*="nav" i], div[class*="bar" i], div[class*="bottom" i], div[class*="fixed" i], div[class*="sticky" i]');for(const s of o){if(e(s))continue;const n=s.querySelectorAll("span, div, p, a, button");for(const l of n){if(e(l))continue;const c=(l.textContent||"").trim();if(!c.includes("/")||c.length>25||/\b(?:LEVEL|XP|MAKANAN|ROTI|SLOT|DOMPET|EMAS|USD|LATIHAN|KEKUATAN|PENDIDIKAN)\b/i.test(c))continue;const f=c.match(/(?:\u26A1|\b)(\d{1,3})\s*\/\s*(\d{2,3})\b/);if(f){const g=parseInt(f[1],10),y=parseInt(f[2],10);if(y>=50&&y<=350&&g<=y)return{current:g,max:y}}}}const i=document.querySelector('button[data-testid="work"]')||Array.from(document.querySelectorAll("button")).find(s=>!e(s)&&/KERJAKAN\s+SATU\s+GILIRAN/i.test(s.textContent||""));if(i){const n=(i.textContent||"").trim().match(/(?:\u26A1)\s*(\d{1,3})\b/);if(n){const l=parseInt(n[1],10);if(l>=0&&l<=350)return{current:l,max:215}}}}catch{}return null}function Rt(e=15e3){return new Promise(t=>{if(!C())return t(null);const a=ge();if(a)return t(a);const r=Date.now()+e;let o=!1;const i=f=>{if(!o){o=!0;try{n.disconnect()}catch{}c&&clearInterval(c),t(f||ge())}};let s=!1;const n=new MutationObserver(()=>{s||(s=!0,requestAnimationFrame(()=>{s=!1;const f=ge();f?i(f):Date.now()>=r&&i(null)}))});try{n.observe(document.documentElement,{childList:!0,subtree:!0})}catch{}const l=Date.now(),c=setInterval(()=>{const f=ge();f?i(f):Date.now()>=r&&i(null)},Date.now()-l<1500?50:200);setTimeout(()=>i(null),e)})}function ze(e,t=Date.now()){if(!e||typeof e.current!="number")return 0;const a=e.max||115;if(e.current>=a)return a;const r=e.updatedAt||t,o=Math.max(0,t-r),i=Math.max(.5,e.regenRate||1),s=Math.floor(o*i/6e4);return Math.min(a,e.current+s)}function Ee(e){const t=Date.now();if(C()){const s=ge();if(s){const n=e.regenRate||at()||1;e.regenRate=n;const l=typeof document<"u"&&document.hidden,c=!!(e.lastWorkTimestamp&&t-e.lastWorkTimestamp<1e4);if(!!!(l&&e.domEnergyStale&&s.current>(e.postShiftEnergy??0)+2||c&&e.postShiftEnergy!=null&&s.current>e.postShiftEnergy+2))return e.hasInitialDomEnergyRead=!0,e.currentEnergy=s.current,e.maxEnergy=s.max,e.domEnergyStale=!1,e.shiftExecutedInSession=!1,(!e.energySyncBase||e.energySyncBase.current!==s.current||Math.abs(ze(e.energySyncBase,t)-s.current)>=1)&&(e.energySyncBase={current:s.current,max:s.max,updatedAt:t,regenRate:n}),s}}(!e.energySyncBase||typeof e.energySyncBase.current!="number")&&(e.energySyncBase={current:e.currentEnergy||0,max:e.maxEnergy||115,updatedAt:t,regenRate:e.regenRate||at()||1});const r=e.regenRate||at()||1;e.regenRate=r,e.energySyncBase.regenRate=r;const o=e.energySyncBase.max||e.maxEnergy||115,i=ze(e.energySyncBase,t);return(i>0||e.hasInitialDomEnergyRead||e.postShiftEnergy===0)&&(e.currentEnergy=i),e.maxEnergy=o,{current:e.currentEnergy,max:o}}function bt(e){if(!e?.sleepScheduleEnabled)return!1;const t=new Date;if(e.sleepStartTime&&e.sleepEndTime){const[i,s]=e.sleepStartTime.split(":").map(Number),[n,l]=e.sleepEndTime.split(":").map(Number);if(!isNaN(i)&&!isNaN(n)){const c=t.getHours()*60+t.getMinutes(),f=i*60+(s||0),g=n*60+(l||0);return f<g?c>=f&&c<g:c>=f||c<g}}const a=t.getHours(),r=e.sleepStartHour??1,o=e.sleepEndHour??6;return r<o?a>=r&&a<o:a>=r||a<o}let se=null,ht=0;function Pt(){try{const e=o=>!!o.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast"),t=document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, div, p");for(const o of t){if(e(o))continue;const i=(o.textContent||"").trim();if(/^(?:\u26A1)?\s*(?:ENERGI|ENERGY)\b/i.test(i)&&i.length<=25){let s=o.parentElement;for(let n=0;n<4&&s&&s!==document.body;n++){const c=(s.innerText||s.textContent||"").match(/Penuh\s+dalam\s+([0-9\sA-Za-z<]+?)(?:\n|$|\.|\()/i);if(c&&c[1]){const f=c[1].trim();if(f.length>0&&f.length<=15)return f}s=s.parentElement}}}const r=(document.body&&document.body.innerText||"").match(/Penuh\s+dalam\s+([0-9\sA-Za-z<]+?)(?:\n|$|\.|\()/i);if(r&&r[1]){const o=r[1].trim();if(o.length>0&&o.length<=15)return o}}catch{}return null}typeof window<"u"&&window.addEventListener("popstate",()=>{ht=0});function nt(e=!1){if(typeof document>"u")return{name:"Wilayah",level:0,bonusPercent:0,bonusMultiplier:1};const t=Date.now();if(!e&&se&&(t-ht<3e5||!C()))return se;let a="",r=0,o=0,i=0,s="";try{const c=[],f=document.querySelector('header, nav, [class*="topbar" i], [class*="region" i], [data-testid="region-index-health"]')?.closest("div, section")||null;f?c.push(f.innerText||f.textContent||""):document.body&&c.push(document.body.innerText||"");const g=document.querySelectorAll('[role="tooltip"], [data-radix-popper-content-wrapper], [class*="tooltip" i], [class*="popover" i]');for(const S of g)c.push(S.innerText||S.textContent||"");s=c.join(`
`);const y=s.match(/Kamu\s+di\s+sini\s*[—–-]\s*([A-Za-zÀ-ÿ\s]{2,30})/i);if(y&&y[1]&&(a=y[1].trim()),!a){const S=s.match(/DITEMPATKAN\s+DI[^\n]*\n+([A-Za-zÀ-ÿ\s]{2,30})\n/i);if(S&&S[1]){const E=S[1].trim();/^(?:DI\s+PETA|PETA|MAP)\b/i.test(E)||(a=E)}}if(!a){const S=s.match(/(?:Negara\s+Kesatuan\s+Republik\s+Indonesia|NKRI)[^\n]*\n+([A-Za-zÀ-ÿ\s]{2,30})\n/i);S&&S[1]&&(a=S[1].trim())}if(!a){const S=s.match(/\d\d:\d\d\s+UTC\s*\n*([A-Za-zÀ-ÿ\s]{2,30})/i);S&&S[1]&&(a=S[1].trim())}a&&(a=a.split(`
`)[0].trim(),a=a.toLowerCase().replace(/\b[a-zÀ-ÿ]/g,S=>S.toUpperCase()));const m=s.match(/(?:REGENERASI\s+ENERGI[^\n\d]*)?\+([0-9.]+)\s*\/\s*(?:mnt|min)/i);if(m&&m[1]){const S=parseFloat(m[1]);S>=.5&&S<=10&&(i=S)}const x=s.match(/Kesehatan\s*(?:kota|wilayah)?\s*:\s*\+?(\d+)%/i);x&&x[1]&&(o=parseInt(x[1],10),r=Math.round(o/5));let B=1;const D=s.match(/BONUS\s+INDEKS[^\d\n]*(\d+(?:\.\d+)?)/i);if(D&&D[1]){const S=parseFloat(D[1]);S>=1&&S<=2&&(B=S)}if(!r&&!o){const S=s.match(/\bKESEHATAN\b[^\d\n]*(\d+)/i);S&&S[1]&&(r=parseInt(S[1],10),o=Math.round(r*5*B))}if(!r&&!o){const S=document.querySelector('[data-testid="region-index-health"]');if(S){const M=S.querySelector('[aria-label*="Kesehatan"]')?.getAttribute("aria-label")?.match(/Kesehatan\s+(\d+)/i);M&&(r=parseInt(M[1],10),o=Math.round(r*5*B))}}}catch(c){console.error("[getRegionDetails] Error:",c)}if(i>0&&!o&&(o=Math.round((i-1)*100)),o>0&&!i){const c=1+o/100,f=Math.round(60/c);i=Math.round(60/f*100)/100}r=Math.max(0,Math.min(15,r||Math.round(o/5))),!o&&r>0&&(o=r*5),se&&se.name===(a||se.name)&&(se.bonusPercent>o&&!s.includes("Kesehatan")&&(o=se.bonusPercent),se.bonusMultiplier>i&&!s.includes("/mnt")&&(i=se.bonusMultiplier));const n=i>0?i:1+o/100,l={name:a||se?.name||"Jawa Barat",level:r,bonusPercent:o||se?.bonusPercent||0,bonusMultiplier:n||1};return(a||r>0||o>0||i>0)&&(se=l,ht=t),l}function at(){return nt().bonusMultiplier}function Wt(e){const t=new Date,a=new Date;return a.setHours(e.sleepEndHour??6,0,0,0),a<=t&&a.setDate(a.getDate()+1),Math.max(1e3,a.getTime()-t.getTime())}function De(e){if(!e?.energyFlushEnabled)return!1;const t=new Date,a=t.getUTCHours(),r=t.getUTCMinutes();return a===23&&r>=15}function ye(e,t){if(De(t)){if(e?.energyFlushLockoutUntil&&Date.now()<e.energyFlushLockoutUntil)return t?.energyThreshold||20;const r=e?.unitEnergyCost||10;return Math.min(t?.energyThreshold||r,r)}const a=t?.energyThreshold||10;if(t?.energyThresholdJitterEnabled&&!De(t)){const r=Pn(t),o=e?.maxEnergy||115;return Math.max(10,Math.min(o,a+r))}return a}function Le(e,t){if(bt(t))return Wt(t);const a=De(t);let r=ye(e,t);if(!a&&t.stealthJitterEnabled){const l=Math.max(0,Math.round(yt(.4,.8,0,2)));r=Math.min(100,Math.max(10,r+l))}if(e.currentEnergy>=r){if(t.stealthJitterEnabled){const l=(t.stealthJitterMaxSeconds||25)*1e3;return Ue(4e3,l,7e3+(l-4e3)*.28)}return 3e3}const o=r-e.currentEnergy,i=e.regenRate||at()||1;e.regenRate=i;const s=o/i*6e4,n=Ue(2500,8500,4800);return Math.round(s+n)}function wt(e,t){if(bt(t))return"Tidur";const a=Lt(e,t);if(a.inBreak)return`Istirahat ${Math.ceil(a.remainingMs/6e4)}m`;if(e.backoffUntil&&Date.now()<e.backoffUntil)return`Retry ${Math.ceil((e.backoffUntil-Date.now())/1e3)}s`;if(C()&&!e.hasInitialDomEnergyRead&&(!e.currentEnergy||e.currentEnergy<=0))return"Sinkronisasi...";const r=De(t),o=ye(e,t),i=e.currentEnergy??0,s=Math.max(.5,e.regenRate||1);if(e.serverCooldownUntil&&Date.now()<e.serverCooldownUntil){const f=e.serverCooldownUntil-Date.now(),g=Math.ceil(f/1e3);return`${Math.floor(g/60)}m ${String(g%60).padStart(2,"0")}s`}if(i>=o){if(e.nextWorkTimestamp&&e.nextWorkTimestamp>Date.now()){const f=Math.ceil((e.nextWorkTimestamp-Date.now())/1e3);if(f>0&&f<=35)return`${f}s`}return r?"Flush!":"Siap"}const n=Math.max(1,o-i);let l=Math.round(n/s*6e4);if(e.nextWorkTimestamp&&e.nextWorkTimestamp>Date.now()){const f=e.nextWorkTimestamp-Date.now();f>=l-12e4&&(l=f)}if(l<=0)return r?"Flush...":"Menunggu energi...";const c=Math.ceil(l/1e3);return`${Math.floor(c/60)}m ${String(c%60).padStart(2,"0")}s`}function xt(e){if(C()&&!e.hasInitialDomEnergyRead&&(!e.currentEnergy||e.currentEnergy<=0))return"Sinkronisasi...";const t=Math.max(50,e.maxEnergy||115),a=Math.max(0,e.currentEnergy??0),r=Math.max(0,t-a);if(r<=0)return"Penuh!";const o=Pt();if(o)return o.replace(/\s+/g," ").trim();const i=Math.max(.5,e.regenRate||1),s=Math.max(1,Math.round(r/i));if(s<60)return`~${s} mnt`;const n=Math.max(0,Math.floor(s/60)),l=Math.max(0,s%60);return l===0?`~${n}j`:n<24?`~${n}j ${l}m`:`~${Math.floor(n/24)}h ${n%24}j`}let _t=0;function Wn(e){if(Date.now()-_t<1e4)return e.playerLevel;_t=Date.now();try{const t=document.createTreeWalker(document.body||document.documentElement,NodeFilter.SHOW_TEXT);let a;for(;a=t.nextNode();){const r=a.textContent.trim().match(/^Level\s+(\d+)$/i);if(r)return parseInt(r[1],10)}}catch{}return e.playerLevel}function _n(e){return Math.min(300,100+5*(e-1))}function In(e,t,a=!1){return!1}let It=null,jt=null;function be(e,t,a=null){if(typeof document>"u"||!C())return null;const r=o=>!!o?.closest?.("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast");try{let o=document.querySelector('[data-testid="bread-today"]');if(o&&r(o)&&(o=null),!o){const g=document.querySelector('[data-testid="rations"]');g&&!r(g)&&(o=g.querySelector('[data-testid="bread-today"]')||g.querySelector("span.tabular-nums"))}if(!o){const g=document.querySelectorAll("span, p, div");for(const y of g){if(r(y))continue;const m=(y.textContent||"").trim();if(/sisa\s*roti/i.test(m)&&/\d+\s*\/\s*\d+/.test(m)){o=y;break}}}if(!o)return null;const s=(o.textContent||"").trim().match(/(\d{1,2})\s*\/\s*(\d{1,2})/);if(!s)return null;const n=parseInt(s[1],10),l=parseInt(s[2],10);if(isNaN(n)||isNaN(l)||l<5||l>50)return null;const c=Math.max(0,Math.min(l,l-n));let f=!1;if(t&&(t.maxFoodDaily!==l||e.maxFoodDaily!==l)){const g=t.maxFoodDaily;t.maxFoodDaily=l,e.maxFoodDaily=l,v("aw_maxFoodDaily",l.toString()),v("maxFoodDaily",l),a&&It!==l&&g&&g!==l&&(It=l,a(`[Auto Roti] Kuota roti otomatis terdeteksi dari game: ${l} slot (${l===20?"Akun Premium":"Akun Standar"}).`,"info")),f=!0}if(e.foodEatenToday!==c){const g=e.foodEatenToday;e.foodEatenToday=c,v("aw_foodEatenToday",c.toString()),me({type:"FOOD_UPDATED",foodEatenToday:c,maxFoodDaily:l,timestamp:Date.now()}),a&&g!==void 0&&c>g&&jt!==c&&(jt=c,a(`Makan roti terdeteksi (+${c-g}): ${c}/${l} slot (${n} sisa).`,"info")),f=!0}return{remaining:n,maxCap:l,eaten:c,changed:f}}catch{return null}}function X(e,t,a=0,r=Number.MAX_SAFE_INTEGER){const o=Q(e,t.toString()),i=Number(o);return Number.isSafeInteger(i)&&i>=a&&i<=r?i:t}function jn(e,t,a){const r=Q("aw_worker_running","true"),o=!a&&r!=="false";let i=0,s=100,n=null,l=1,c="",f=0,g=0;const y=Q("aw_live_status");if(y&&typeof y=="object")if(s=y.maxEnergy||100,y.regenRate!=null&&(l=y.regenRate),y.regionHealthBonusPercent!=null&&(f=y.regionHealthBonusPercent),y.regionName&&(c=y.regionName),y.lastWorkTimestamp&&(g=y.lastWorkTimestamp),y.energySyncBase&&typeof y.energySyncBase.current=="number"){n={...y.energySyncBase};const m=ze(n,Date.now());typeof m=="number"&&m>0?i=Math.min(s,m):typeof y.currentEnergy=="number"&&y.currentEnergy>0?i=Math.min(s,y.currentEnergy):i=Math.max(0,m||0)}else y.currentEnergy!=null&&(i=Math.min(s,y.currentEnergy),n={current:i,max:s,updatedAt:y.updatedAt||Date.now(),regenRate:l});return{running:o,totalWorked:X("totalWorked",0),totalWorkXP:X("totalWorkXP",0),workToday:X("workToday",0),xpToday:X("xpToday",0),lastWorkDate:Q("lastWorkDate",new Date().toDateString()),lastWorkTime:Q("lastWorkTime","Belum pernah"),currentToken:null,tokenExpiry:null,storedTokenValue:"",pausedForToken:!1,tokenExpired:!1,currentEnergy:i,maxEnergy:s,hasInitialDomEnergyRead:!1,energyFullAlertActive:!1,energySyncBase:n,workInFlight:!1,workResultUncertain:a,uncertainReconciliation:a?"pending":"none",postShiftEnergy:null,shiftExecutedInSession:!1,playerLevel:1,regionName:c,regionHealthBonusPercent:f,regenRate:l,lastWorkTimestamp:g,panelMinimized:Q("panelMinimized","false")==="true",panelVisible:Q("panelVisible","true")==="true",userManuallyToggledPanel:!1,panelX:X("panelX",e.panelDefaultX,0,1e4),panelY:X("panelY",e.panelDefaultY,0,1e4),originalPanelX:X("panelX",e.panelDefaultX,0,1e4),originalPanelY:X("panelY",e.panelDefaultY,0,1e4),logs:[],settingsOpen:!1,lastLowEnergyLogTime:0,scriptStartTime:Date.now(),sessionStartTime:t,nextWorkTimestamp:0,isTabLockOwner:!1,tabLockManaged:!1,waitedForTabLock:!1,totalEnergySpent:X("totalEnergySpent",0),totalActualEnergySpent:X("totalActualEnergySpent",0),totalEstimatedEnergySpent:X("totalEstimatedEnergySpent",0),foodEatenToday:(()=>{const m=new Date().toISOString().slice(0,10),x=Q("aw_foodUtcDate","");return x&&x!==m?(v("aw_foodUtcDate",m),v("aw_foodEatenToday","0"),0):(x||v("aw_foodUtcDate",m),X("aw_foodEatenToday",0,0,20))})(),maxFoodDaily:X("aw_maxFoodDaily",10,10,20),circuitBreakerActive:!1,circuitBreakerReason:"",isEnergyFlushActive:!1,trainingStats:{strength:X("aw_stat_strength",0),education:X("aw_stat_education",0),economy:X("aw_stat_economy",0)},walletGold:X("aw_wallet_gold",0),activeTraining:(()=>{const m=Q("aw_active_training",null);return m&&typeof m=="object"&&m.endsAt&&new Date(m.endsAt).getTime()>Date.now()?m:null})(),nextTrainCheckTimestamp:0,trainingInFlight:!1,consecutiveErrors:0,backoffUntil:0,microBreakUntil:0,microBreakReason:"",nextMicroBreakScheduledAt:0}}function $e(e){const t={totalWorked:e.totalWorked.toString(),workToday:e.workToday.toString(),totalWorkXP:e.totalWorkXP.toString(),xpToday:e.xpToday.toString(),totalEnergySpent:e.totalEnergySpent.toString(),totalActualEnergySpent:e.totalActualEnergySpent.toString(),totalEstimatedEnergySpent:e.totalEstimatedEnergySpent.toString(),lastWorkTime:e.lastWorkTime,lastWorkDate:e.lastWorkDate,aw_worker_running:e.running.toString()};for(const[a,r]of Object.entries(t))v(a,r)}let Ct="",Ut=0;function Cn(e,t=null){const a=e.lastLogMessage||(e.logs&&e.logs.length>0?e.logs[0].message:""),r=!!(e.tokenExpired||e.pausedForToken||!e.currentToken||e.tokenExpiry&&Number(e.tokenExpiry)<=Date.now()),o=t?.energyThreshold??10;(!e.energySyncBase||typeof e.energySyncBase.current!="number")&&(e.energySyncBase={current:e.currentEnergy??0,max:e.maxEnergy||115,updatedAt:Date.now(),regenRate:e.regenRate||1}),e.regenRate&&e.energySyncBase.regenRate!==e.regenRate&&(e.energySyncBase.regenRate=e.regenRate);let i=e.currentEnergy;if(i==null||e.domEnergyStale||!e.hasInitialDomEnergyRead){const n=ze(e.energySyncBase,Date.now());typeof n=="number"&&(i=n,e.currentEnergy=n)}let s=e.nextWorkTimestamp??0;if(!s&&i<o){const n=e.regenRate||1,l=Math.max(1,(o-i)/n);s=Date.now()+Math.round(l*6e4),e.nextWorkTimestamp=s}return{running:!!e.running,currentEnergy:i,maxEnergy:e.maxEnergy??100,energySyncBase:{current:e.energySyncBase.current,max:e.energySyncBase.max||e.maxEnergy||115,updatedAt:e.energySyncBase.updatedAt,regenRate:e.energySyncBase.regenRate||e.regenRate||1},nextWorkTimestamp:s,lastWorkTimestamp:e.lastWorkTimestamp||0,workToday:e.workToday??0,xpToday:e.xpToday??0,totalWorked:e.totalWorked??0,totalWorkXP:e.totalWorkXP??0,hasToken:!!e.currentToken,tokenExpiry:e.tokenExpiry?new Date(e.tokenExpiry).getTime():null,tokenExpired:r,pausedForToken:!!e.pausedForToken,lastWorkTime:e.lastWorkTime||"Belum pernah",energyThreshold:o,playerLevel:e.playerLevel||1,regionName:e.regionName||"",regionHealthBonusPercent:e.regionHealthBonusPercent||0,regenRate:e.regenRate||1,lastLogMessage:a,isTabLockOwner:!!e.isTabLockOwner,foodEatenToday:e.foodEatenToday??0,maxFoodDaily:t?.maxFoodDaily||e.maxFoodDaily||10,circuitBreakerActive:!!e.circuitBreakerActive,circuitBreakerReason:e.circuitBreakerReason||"",isEnergyFlushActive:!!e.isEnergyFlushActive,serverCooldownUntil:e.serverCooldownUntil||0,microBreakUntil:e.microBreakUntil||0,microBreakReason:e.microBreakReason||"",backoffUntil:e.backoffUntil||0,trainingStats:e.trainingStats||{strength:0,education:0,economy:0},walletGold:e.walletGold||0,activeTraining:e.activeTraining||null,updatedAt:Date.now()}}function N(e,t=null,a=!1){const r=Cn(e,t),o=(typeof window<"u"&&window.location.pathname||"").toLowerCase().replace(/\/+$/,""),i=o==="/dashboard"||o.startsWith("/dashboard/")||o==="";if(!i&&e.hasActiveDashboardTab||!i&&!a&&e.tabLockManaged&&!e.isTabLockOwner)return r;if(!e.hasInitialDomEnergyRead&&r.currentEnergy===0&&e.postShiftEnergy!==0){const c=Q("aw_live_status");if(c&&typeof c.currentEnergy=="number"&&c.currentEnergy>0)return r.currentEnergy=c.currentEnergy,r.maxEnergy=c.maxEnergy||r.maxEnergy,r.energySyncBase=c.energySyncBase||r.energySyncBase,e.currentEnergy=c.currentEnergy,e.maxEnergy=c.maxEnergy||e.maxEnergy,e.energySyncBase=c.energySyncBase||e.energySyncBase,r}const s=Math.round((r.nextWorkTimestamp||0)/3e3),n=`${r.running}|${r.currentEnergy}|${r.maxEnergy}|${r.workToday}|${r.hasToken}|${r.tokenExpired}|${r.energyThreshold}|${s}|${r.lastLogMessage}`,l=Date.now();return!a&&n===Ct&&l-Ut<3e3||(Ct=n,Ut=l,v("aw_live_status",r)),r}function kt(e,t){e.totalWorked=X("totalWorked",0),e.totalWorkXP=X("totalWorkXP",0),e.workToday=X("workToday",0),e.xpToday=X("xpToday",0),e.totalEnergySpent=X("totalEnergySpent",0),e.totalActualEnergySpent=X("totalActualEnergySpent",0),e.totalEstimatedEnergySpent=X("totalEstimatedEnergySpent",0);const a=new Date().toISOString().slice(0,10),r=Q("aw_foodUtcDate","");r&&r!==a?(e.foodEatenToday=0,v("aw_foodUtcDate",a),v("aw_foodEatenToday","0")):e.foodEatenToday=X("aw_foodEatenToday",0,0,20),e.maxFoodDaily=X("aw_maxFoodDaily",10,10,20),e.lastWorkDate=Q("lastWorkDate",new Date().toDateString()),e.lastWorkTime=Q("lastWorkTime","Belum pernah");const o=Q("aw_worker_running","true");e.running=o!=="false",t()}function zt(e,t=30){const a=new Date;a.setDate(a.getDate()-(t||30));let r=!1;for(const o of Object.keys(e))new Date(o)<a&&(delete e[o],r=!0);return r}function Un(e){if(!Ye(e))return null;const t=Object.create(null);for(const[a,r]of Object.entries(e)){const o=new Date(a);if(Number.isNaN(o.getTime())||o.toDateString()!==a||!Ye(r)||!Number.isSafeInteger(r.shifts)||r.shifts<0||!Number.isSafeInteger(r.xp)||r.xp<0)return null;const i=["energySpent","estimatedEnergySpent","energyDataShifts"].some(s=>Object.prototype.hasOwnProperty.call(r,s));if(i&&(!Number.isSafeInteger(r.energySpent)||r.energySpent<0||!Number.isSafeInteger(r.estimatedEnergySpent)||r.estimatedEnergySpent<0||!Number.isSafeInteger(r.energyDataShifts)||r.energyDataShifts<0||r.energyDataShifts>r.shifts))return null;t[a]={shifts:r.shifts,xp:r.xp},i&&(t[a].energySpent=r.energySpent,t[a].estimatedEnergySpent=r.estimatedEnergySpent,t[a].energyDataShifts=r.energyDataShifts)}return t}function zn(e){for(const t of Object.values(e))Object.prototype.hasOwnProperty.call(t,"energySpent")&&(t.energySpent=Math.max(0,t.energySpent-t.estimatedEnergySpent));return e}function ot(e={},t={}){try{const a=Q("aw_workHistory",null),r=a?typeof a=="string"?JSON.parse(a):a:{};let o=Un(r)||Object.create(null);X("aw_energySchemaVersion",1,1,2)<2&&(zn(o),v("aw_energySchemaVersion","2"),v("aw_workHistory",JSON.stringify(o)));const i=X("workToday",0),s=X("xpToday",0),n=new Date().toDateString(),l=t?.historyMaxDays||30;return!o[n]||o[n].shifts!==i||o[n].xp!==s?(o[n]={shifts:i,xp:s},zt(o,l),v("aw_workHistory",JSON.stringify(o))):zt(o,l)&&v("aw_workHistory",JSON.stringify(o)),o}catch(a){return console.error("[History] Failed to load:",a),{}}}function Ht(e){v("aw_workHistory",JSON.stringify(e))}const He=new Map;let Kt=null;function Hn(e){Kt=e}function Kn(e,t,a,r="info",o=!0){const i=new Date().toLocaleTimeString("id-ID"),s=r==="error"?"[ERROR]":r==="success"?"[OK]":r==="warn"?"[WARN]":"[INFO]";if(o&&r==="warn"&&/(?:Energi (?:belum|tidak) cukup|Server menolak kerja|Shift tidak menghasilkan unit)/i.test(a)&&t.quietModeEnabled){const n=Date.now();if(n-e.lastLowEnergyLogTime<t.quietModeInterval)return;e.lastLowEnergyLogTime=n}if(o&&(r==="warn"||r==="error")){const n=/^Retry dalam /i.test(a)?`${r}:retry`:`${r}:${a}`,l=Date.now(),c=He.get(n);if(c&&l-c.time<3e4){c.suppressed++;return}c?.suppressed>0&&(a+=` (${c.suppressed} pesan serupa disembunyikan)`),He.set(n,{time:l,suppressed:0}),He.size>100&&He.delete(He.keys().next().value)}console.log(`[${i}] ${s} ${a}`),(o||!e.lastLogMessage)&&(e.lastLogMessage=`[${i}] ${a}`,e.lastLogTime=i),o&&(/^Panel v[\d.]+\s+siap!/i.test(a)||/^Auto Worker v[\d.]+/i.test(a)||e.logs.length>0&&e.logs[0].message===a||(e.logs.unshift({time:i,type:r,message:a}),e.logs.length>t.maxLogEntries&&(e.logs=e.logs.slice(0,t.maxLogEntries)),Xn(e.logs),Kt?.()))}let Re=null;function Xn(e){typeof chrome>"u"||!chrome.storage?.local||(Re&&clearTimeout(Re),Re=setTimeout(()=>{Re=null;try{const t=e.slice(0,80);v("aw_recent_logs",t)}catch{}},300))}function Xt(){if(Re&&(clearTimeout(Re),Re=null),He.clear(),v("aw_recent_logs",[]),typeof chrome<"u"&&chrome.storage?.local)try{chrome.storage.local.set({aw_recent_logs:[]}).catch(()=>{})}catch{}}function qn(e){if(!e||typeof e!="string")return null;try{let t=e.trim();if(t.startsWith('"')&&t.endsWith('"')||t.startsWith("'")&&t.endsWith("'"))try{t=JSON.parse(t)}catch{t=t.slice(1,-1).trim()}if(t=t.replace(/^Bearer\s+/i,"").trim(),t.startsWith("{"))try{const n=JSON.parse(t);t=n.token||n.access_token||n.jwt||n.value||t}catch{}const a=t.split(".");if(a.length!==3)return null;let r=a[1].replace(/-/g,"+").replace(/_/g,"/");for(;r.length%4!==0;)r+="=";const o=Uint8Array.from(atob(r),n=>n.charCodeAt(0)),i=JSON.parse(new TextDecoder("utf-8").decode(o)),s=i.exp?new Date(i.exp*1e3):null;return{payload:i,cleanToken:t,expiry:s,isExpired:s?s<new Date:!1}}catch(t){return console.error("[JWT] Failed to parse:",t),null}}function Yn(e,t,a,r,o="storage",i=null,s=null){if(!r)return!1;const n=qn(r);if(!n)return!1;const{cleanToken:l,expiry:c,isExpired:f}=n;if(f)return console.warn(`[Token] Token dari ${o} sudah EXPIRED pada ${c?.toLocaleString("id-ID")}`),!1;if(l===e.storedTokenValue&&e.currentToken)return!0;e.storedTokenValue=l,e.currentToken=`Bearer ${l}`,e.tokenExpiry=c;try{v("aw_auth_token",l),v("aw_auth_token_expiry",c?c.getTime().toString():"")}catch{}const g=c?Math.floor((c-Date.now())/1e3):null,y=c?`${c.toLocaleTimeString("id-ID")} (${Math.floor(g/3600)}h ${Math.floor(g%3600/60)}m)`:"Tidak ada exp";t(`Token valid via ${o}! Exp: ${y}`,"success",!1),e.tokenExpired=!1;try{sessionStorage.removeItem("aw_token_reload_attempts"),sessionStorage.removeItem("aw_auth_reload_attempts")}catch{}if(e.pausedForToken){e.running=!0,e.pausedForToken=!1;try{v("aw_worker_running","true")}catch{}t("Sesi diperbarui. Script dilanjutkan otomatis.","success"),i?.(),a?.()}return s?.(),!0}function rt(e,t){const a=Date.now()-(rt._lastDiagAt||0)>=3e4;a&&(console.log("[Token] Memindai storage..."),rt._lastDiagAt=Date.now());const r=[];try{window.localStorage&&r.push({name:"localStorage",store:window.localStorage})}catch{}try{const i=window;i?.localStorage&&i.localStorage!==window.localStorage&&r.push({name:"pw.localStorage",store:i.localStorage})}catch{}try{window.sessionStorage&&r.push({name:"sessionStorage",store:window.sessionStorage})}catch{}const o=["token","auth_token","authToken","access_token","jwt","session","parlamentum_token","sb-token","sb-access-token","user_token"];for(const{name:i,store:s}of r)for(const n of o){const l=s.getItem(n);if(l&&t(l,`${i}[${n}]`))return e.currentToken}for(const{name:i,store:s}of r)for(let n=0;n<s.length;n++){const l=s.key(n);if(!l)continue;const c=s.getItem(l);if(c&&typeof c=="string"&&(c.includes("eyJ")||c.startsWith("{"))&&t(c,`${i}[auto:${l}]`))return e.currentToken}if(a){console.warn("[Token] Tidak ditemukan. Keys tersedia:");for(const{name:i,store:s}of r)try{console.log(`  ${i}:`,Object.keys(s))}catch{}}return null}function Jn(e){if(!e.tokenExpiry)return"N/A";const t=e.tokenExpiry-Date.now();return t<=0?"EXPIRED":`${Math.floor(t/36e5)}h ${Math.floor(t%36e5/6e4)}m`}function Vn(e,t,a){window.addEventListener("storage",({newValue:r,key:o})=>{r&&t(r,`storage-event[${o}]`)});try{const r=window.fetch;window.fetch=function(...o){try{const[i,s]=o;let n=null;s?.headers&&(n=s.headers instanceof Headers?s.headers.get("Authorization")||s.headers.get("authorization"):s.headers.Authorization||s.headers.authorization),!n&&i instanceof Request&&(n=i.headers?.get("Authorization")||i.headers?.get("authorization")),n?.includes("Bearer ")&&t(n,"fetch-intercept")}catch{}return r.apply(this,o)}}catch{}setInterval(()=>{(!e.currentToken||e.tokenExpiry&&e.tokenExpiry<new Date)&&a()},8e3)}let it=null;function vt(e,t){if(!document.body)return;let a=document.getElementById("aw-notification-toast");a||(a=document.createElement("div"),a.id="aw-notification-toast",a.setAttribute("role","status"),a.setAttribute("aria-live","polite"),a.style.cssText=["position:fixed","top:16px","right:16px","z-index:100010","display:none","width:min(360px,calc(100vw - 32px))","padding:12px 14px","background:rgba(10,10,20,.97)","border:1px solid #00aaff","border-left:4px solid #00e99a","border-radius:6px","box-shadow:0 6px 24px rgba(0,0,0,.55)","color:#eee","font:12px/1.45 Segoe UI,Tahoma,sans-serif","pointer-events:none"].join(";"),document.body.appendChild(a));const r=document.createElement("div");r.textContent=e,r.style.cssText="font-weight:700;color:#00e99a;margin-bottom:3px;";const o=document.createElement("div");o.textContent=t,o.style.color="#ddd",a.replaceChildren(r,o),a.style.display="block",it!==null&&clearTimeout(it),it=setTimeout(()=>{a.style.display="none",it=null},6e3)}function qt(e,t,a){let r=null,o="",i="";if(typeof e=="object"&&e!==null?(r=e,o=typeof t=="string"?t:String(t||""),i=typeof a=="string"?a:String(a||"")):(o=typeof e=="string"?e:String(e||""),i=typeof t=="string"?t:String(t||"")),!(r&&!r.sendNotification)){vt(o,i);try{if(typeof chrome<"u"&&chrome?.runtime&&chrome.runtime.id){const s=/expired|401|habis|kadaluarsa|dijeda|login/i.test(`${o} ${i}`);chrome.runtime.sendMessage({type:"NOTIFY",title:o,message:i,priority:s?2:1,requireInteraction:s})?.catch?.(()=>{})}}catch{}}}let Yt=!1;if(typeof window<"u"){const e=()=>{Yt=!0,window.removeEventListener("click",e,!0),window.removeEventListener("keydown",e,!0),window.removeEventListener("touchstart",e,!0)};window.addEventListener("click",e,!0),window.addEventListener("keydown",e,!0),window.addEventListener("touchstart",e,!0)}function Jt(){return typeof document<"u"&&document.hidden?!1:typeof navigator<"u"&&navigator.userActivation?!!navigator.userActivation.hasBeenActive:Yt}function Nn(e,t){let a=null,r="success";if(typeof e=="object"&&e!==null?(a=e,r=typeof t=="string"?t:"success"):typeof e=="string"&&(r=e,typeof t=="object"&&t!==null&&(a=t)),a&&!a.soundNotificationEnabled||!Jt())return;const o=a?.soundNotificationVolume!=null?a.soundNotificationVolume:.3,i=window.AudioContext||window.webkitAudioContext;if(!i)return;let s=null;try{if(s=new i,s.state==="suspended")if(navigator?.userActivation?.hasBeenActive)s.resume().catch(()=>{});else{s.close().catch(()=>{});return}const n=s.createOscillator(),l=s.createGain();n.connect(l),l.connect(s.destination),l.gain.value=o,r==="success"?(n.frequency.value=800,n.start(),n.stop(s.currentTime+.1),setTimeout(()=>{try{const c=s.createOscillator(),f=s.createGain();c.connect(f),f.connect(s.destination),f.gain.value=o,c.frequency.value=1e3,c.start(),c.stop(s.currentTime+.1),setTimeout(()=>s.close().catch(()=>{}),150)}catch{try{s.close().catch(()=>{})}catch{}}},100)):(n.frequency.value=200,n.start(),n.stop(s.currentTime+.3),setTimeout(()=>s.close().catch(()=>{}),400))}catch{try{s?.close().catch(()=>{})}catch{}}}function Zn(e=null){if(e&&!e.energyFullAlertSoundEnabled||!Jt())return;const t=e?.energyFullAlertVolume!=null?e.energyFullAlertVolume:.3,a=window.AudioContext||window.webkitAudioContext;if(!a)return;let r=null;try{if(r=new a,r.state==="suspended")if(navigator?.userActivation?.hasBeenActive)r.resume().catch(()=>{});else{r.close().catch(()=>{});return}const o=r.currentTime;[660,880,1100].forEach((i,s)=>{const n=r.createOscillator(),l=r.createGain(),c=o+s*.18;n.type="sine",n.frequency.value=i,l.gain.value=t,n.connect(l),l.connect(r.destination),n.start(c),n.stop(c+.13)}),setTimeout(()=>r.close().catch(()=>{}),800)}catch{try{r?.close().catch(()=>{})}catch{}}}function Vt(){const e=Q("aw_login_creds",null);if(!e)return null;try{const t=typeof e=="string"?JSON.parse(e):e;return t&&typeof t.email=="string"&&typeof t.password=="string"?t:null}catch{return null}}function Nt(e,t){const a={email:e.trim(),password:t,savedAt:Date.now()};return v("aw_login_creds",JSON.stringify(a)),a}function Qn(){v("aw_login_creds","")}function Zt(e,t){if(e)try{const a=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value")?.set;a?a.call(e,t):e.value=t,e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0}))}catch{e.value=t,e.dispatchEvent(new Event("input",{bubbles:!0}))}}function Fn(e){if(!/^\/(login|register|signup)/i.test(window.location.pathname))return;function t(){try{const a=Array.from(document.querySelectorAll("input")).filter(i=>!i.closest("#aw-panel, #aw-settings-modal, #aw-log-modal, #aw-analytics-modal")),r=a.find(i=>i.type==="email"||/email|username/i.test(i.name||i.placeholder||""))||a.find(i=>i.type==="text"&&/@/i.test(i.placeholder||"")),o=a.find(i=>i.type==="password");r?.value&&o?.value&&(Nt(r.value,o.value),console.log("[Auto Worker] Kredensial login berhasil disimpan otomatis untuk Auto Re-Login."),e?.("Kredensial login berhasil diperbarui otomatis.","info"))}catch{}}document.addEventListener("submit",t,!0),document.addEventListener("click",a=>{try{const r=a.target?.closest?.("button");r&&/masuk|login|sign in|enter/i.test(r.textContent||"")&&t()}catch{}},!0)}function On(e=12e3){return new Promise(t=>{const a=()=>{const s=Array.from(document.querySelectorAll("input")).filter(g=>!g.closest("#aw-panel, #aw-settings-modal, #aw-log-modal, #aw-analytics-modal")),n=s.find(g=>g.type==="email"||/email|username/i.test(g.name||g.placeholder||""))||s.find(g=>g.type==="text"&&/@/i.test(g.placeholder||"")),l=s.find(g=>g.type==="password"),c=Array.from(document.querySelectorAll("button")).filter(g=>!g.closest("#aw-panel, #aw-settings-modal, #aw-log-modal, #aw-analytics-modal")),f=c.find(g=>/masuk|login|sign in|enter/i.test(g.textContent||""))||document.querySelector('button[type="submit"]')||c.find(g=>g.offsetWidth>100);return n&&l&&f?{emailInput:n,passInput:l,submitBtn:f}:null},r=a();if(r)return t(r);const o=Date.now(),i=setInterval(()=>{const s=a();s?(clearInterval(i),t(s)):Date.now()-o>e&&(clearInterval(i),t(null))},350)})}async function Gn(e,t,a){if(!/^\/login/i.test(window.location.pathname)){try{sessionStorage.removeItem("aw_login_attempts")}catch{}return!1}if(!e?.autoReloginEnabled)return!1;const r=Vt();if(!r?.email||!r?.password)return console.log("[Auto Worker] Auto Re-Login aktif tetapi belum ada email & kata sandi tersimpan."),t?.("Auto Re-Login aktif tetapi belum ada email & kata sandi tersimpan. Silakan isi di Settings atau login manual.","info"),!1;let o=0;try{o=parseInt(sessionStorage.getItem("aw_login_attempts")||"0",10)}catch{}if(o>=2)return console.warn("[Auto Worker] Auto Re-Login dihentikan sementara: telah mencoba 2x."),t?.("Auto Re-Login dihentikan sementara: telah mencoba 2x. Silakan login manual untuk verifikasi akun.","error"),a?.(e,"Auto Re-Login Dihentikan","Mencapai batas 2x percobaan. Silakan periksa akun."),!1;console.log("[Auto Worker] Halaman login terdeteksi. Mempersiapkan Auto Re-Login..."),t?.("Halaman login terdeteksi. Memulai Auto Re-Login dalam 1.5 detik...","info"),await new Promise(c=>setTimeout(c,1200));const i=await On(1e4);if(!i)return console.warn("[Auto Worker] Elemen form login tidak ditemukan dalam 10 detik."),t?.("Elemen form login tidak ditemukan dalam 10 detik.","warn"),!1;const{emailInput:s,passInput:n,submitBtn:l}=i;try{sessionStorage.setItem("aw_login_attempts",(o+1).toString())}catch{}return await new Promise(c=>setTimeout(c,600)),Zt(s,r.email),await new Promise(c=>setTimeout(c,450)),Zt(n,r.password),await new Promise(c=>setTimeout(c,600)),console.log(`[Auto Worker] Mengirim login otomatis untuk ${r.email}...`),t?.(`Mengirim login otomatis untuk ${r.email}...`,"info"),a?.(e,"Auto Re-Login",`Mencoba masuk otomatis sebagai ${r.email}...`),l.click(),!0}async function Je(e,t=!1){const{state:a,CONFIG:r,workHistory:o,log:i,setRunningUI:s,sendNotification:n,playNotificationSound:l,updatePanel:c,wakePendingWork:f}=e;if(!t&&a.tabLockManaged&&!a.isTabLockOwner)return"standby";if(a.workResultUncertain)return i("Hasil request kerja sebelumnya belum pasti. Muat ulang halaman untuk sinkronisasi sebelum mencoba lagi.","error"),"paused";if(!t){const E=Lt(a,r);if(E.inBreak){const M=Math.ceil(E.remainingMs/6e4);return E.startingNow&&i(`[Micro-Break] Memulai jeda istirahat santai selama ${M} menit untuk naturalisasi bot...`,"info"),a.nextWorkTimestamp=a.microBreakUntil,c?.(),"waiting"}if(a.backoffUntil&&Date.now()<a.backoffUntil)return a.nextWorkTimestamp=a.backoffUntil,"waiting"}if(a.workInFlight)if(Date.now()-(a.workInFlightAt||0)>15e3)a.workInFlight=!1;else return"busy";if(!a.running&&!t)return"paused";if(!t&&C()&&!a.hasInitialDomEnergyRead)return"waiting";t&&i("Menjalankan shift kerja manual...","info");const g=Ee(a);if(!g)return i("Gagal membaca energi dari halaman. Mencoba lagi dalam 5 detik.","warn"),a.nextWorkTimestamp=Date.now()+5e3,"retrySoon";if(a.currentEnergy=g.current,a.maxEnergy=g.max,!t&&a.serverCooldownUntil&&Date.now()<a.serverCooldownUntil)return a.nextWorkTimestamp=a.serverCooldownUntil,c(),"waiting";if(!t&&a.lastWorkTimestamp&&Date.now()-a.lastWorkTimestamp<45e3)return"waiting";if(!t&&bt(r)){const E=Wt(r),M=String(r.sleepEndHour??6).padStart(2,"0")+":00";return i(`Jam istirahat aktif (${r.sleepStartHour??1}:00 - ${r.sleepEndHour??6}:00 WIB). Auto Worker istirahat sampai pukul ${M}...`,"info"),a.nextWorkTimestamp=Date.now()+E,c(),"waiting"}const y=ye(a,r),m=De(r);if(t){if(a.currentEnergy<10)return i(`Energi saat ini (${a.currentEnergy}/${a.maxEnergy} EN) belum cukup! Butuh minimal 10 EN untuk giliran kerja.`,"warn"),"waiting"}else{if(a.currentEnergy<y)return a.nextWorkTimestamp=Date.now()+Le(a,r),"waiting";m&&a.currentEnergy>=10&&(!a._lastLoggedFlushTime||Date.now()-a._lastLoggedFlushTime>18e5)&&(a._lastLoggedFlushTime=Date.now(),i(`[Energy Flush 00:00 UTC] Jam emas aktif: Menguras sisa energi (${a.currentEnergy} EN) sebelum reset server.`,"info"))}const x=ge()||g,B=typeof document<"u"&&!document.hidden,D=C()&&B?ea():null;if(D&&ta(D)){a.workTriggeredViaDom=!0,a.workInFlight=!0,a.workInFlightAt=Date.now();const E=new Promise(L=>{const I=U=>{if(!U||U.source!==window)return;const W=U.data;!W||W.source!=="PARLAMENTUM_INTERCEPTOR"||(W.type==="WORK_SUCCESS"||W.type==="WORK_REJECTED")&&(window.removeEventListener("message",I),L(W))};window.addEventListener("message",I),setTimeout(()=>{window.removeEventListener("message",I),L(null)},4500)});na(D),t&&i("Shift kerja manual dikirim via tombol game...","info");const M=await E;if(a.workInFlight=!1,a.workTriggeredViaDom=!1,M&&M.type==="WORK_SUCCESS")return a.nextWorkTimestamp=Date.now()+Le(a,r),c?.(),"worked";if(M&&M.type==="WORK_REJECTED")return c?.(),"waiting";i("Tombol game tidak merespons, beralih ke direct API request...","info")}a.workTriggeredViaDom=!1,a.workInFlight=!0,a.workInFlightAt=Date.now();let S=null;try{if(!a.currentToken){if(rt(a,(L,I)=>e.handleNewToken(L,I)),!a.currentToken){const L=getValue("aw_auth_token");L&&e.handleNewToken(L,"storage")}if(!a.currentToken)return i("Token tidak ditemukan! Pastikan sudah login di akun Parlementum.","error"),"retry"}const E=new AbortController;S=setTimeout(()=>E.abort(),15e3);const M=await fetch("https://parlamentum.org/api/player/work",{method:"POST",headers:{"Content-Type":"application/json",Authorization:a.currentToken,Accept:"*/*"},credentials:"include",signal:E.signal,body:JSON.stringify({})});if(M.ok)return aa(e,M,g,x);if(M.status===401)return oa(e);if(M.status===400||M.status===422)return ra(e,M);if(M.status>=500&&M.status<=504){a.consecutiveErrors=(a.consecutiveErrors||0)+1;const L=Dt(a.consecutiveErrors);return a.backoffUntil=Date.now()+L,a.nextWorkTimestamp=a.backoffUntil,i(`Gangguan server (HTTP ${M.status}). Percobaan ulang adaptif ke-${a.consecutiveErrors} dalam ${Math.round(L/1e3)} detik...`,"warn"),$e(a),N(a,r,!0),c(),"waiting"}else return i(`Error HTTP: ${M.status}`,"error"),"retry"}catch(E){if(E.name==="AbortError")return ia(e,x);a.consecutiveErrors=(a.consecutiveErrors||0)+1;const M=Dt(a.consecutiveErrors);return a.backoffUntil=Date.now()+M,a.nextWorkTimestamp=a.backoffUntil,console.error("[doWork] Error:",E),i(`Gagal koneksi: ${E.message}. Percobaan ulang adaptif ke-${a.consecutiveErrors} dalam ${Math.round(M/1e3)} detik...`,"warn"),c?.(),"waiting"}finally{S!==null&&clearTimeout(S),a.workInFlight=!1}}function ea(){if(typeof document>"u")return null;const e=o=>!!(!o||o.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast")),t=document.querySelector('button[data-testid="work"], button[data-tutorial-target="work"]');if(t&&!e(t))return t;const a=document.querySelectorAll("button");for(const o of a){if(e(o))continue;const i=(o.textContent||"").trim();if(/KERJAKAN\s+SATU\s+GILIRAN/i.test(i))return o}for(const o of a){if(e(o))continue;const i=(o.textContent||"").trim();if(/(?:^|\b)(?:KERJAKAN|BEKERJA)(?:\b|$)/i.test(i)&&i.length<=25)return o}const r=document.querySelectorAll('button, [role="button"]');for(const o of r){if(e(o))continue;const i=(o.getAttribute("aria-label")||o.getAttribute("title")||"").trim();if(/KERJAKAN\s+SATU\s+GILIRAN|BEKERJA/i.test(i))return o}return null}function ta(e){return!(!e||e.disabled||e.getAttribute("aria-disabled")==="true"||e.classList.contains("disabled")||e.style.pointerEvents==="none")}function na(e){if(!e)return!1;try{const t=e.getBoundingClientRect(),a=Math.floor(t.width*(.35+Math.random()*.3)),r=Math.floor(t.height*(.35+Math.random()*.3)),o=Math.round(t.left+Math.max(1,a)),i=Math.round(t.top+Math.max(1,r)),s={bubbles:!0,cancelable:!0,view:window,clientX:o,clientY:i,screenX:o+(window.screenX||0),screenY:i+(window.screenY||0),button:0,buttons:1};return typeof PointerEvent<"u"&&e.dispatchEvent(new PointerEvent("pointerdown",s)),e.dispatchEvent(new MouseEvent("mousedown",s)),typeof PointerEvent<"u"&&e.dispatchEvent(new PointerEvent("pointerup",s)),e.dispatchEvent(new MouseEvent("mouseup",s)),e.click(),!0}catch{return e.click(),!0}}async function aa(e,t,a,r){const{state:o,CONFIG:i,workHistory:s,log:n,sendNotification:l,playNotificationSound:c,updatePanel:f,wakePendingWork:g}=e;let y=null;try{y=await t.json()}catch(b){if(b.name==="AbortError")throw b;return n("Respons server bukan JSON valid.","warn"),"retry"}const m=y&&typeof y=="object"&&y.data&&typeof y.data=="object"?{...y,...y.data}:y||{},x=typeof m.message=="string"?m.message:typeof m.error=="string"?m.error:"";if(m.success===!1||!!m.error||/(?:not enough energy|produce even one unit|insufficient|tidak cukup|kurang|error|gagal|failed)/i.test(x)){const b=Date.now();o.currentEnergy=0,o.postShiftEnergy=0,o.lastWorkTimestamp=b,o.domEnergyStale=!0,o.energySyncBase={current:0,max:o.maxEnergy||115,updatedAt:b,regenRate:o.regenRate||1};const w=Math.max(20,i.energyThreshold||90),A=o.regenRate||1,j=Math.max(12e4,Math.round(w/A*6e4));return o.serverCooldownUntil=b+j,o.nextWorkTimestamp=o.serverCooldownUntil,n(`Server menolak kerja: ${x||m.error||"Energi belum cukup"}. Menunggu target ${w} EN (~${Math.round(j/6e4)} mnt)...`,"warn"),$e(o),N(o,i,!0),me({type:"WORK_SHIFT_COMPLETED",currentEnergy:0,maxEnergy:o.maxEnergy||115,energySyncBase:o.energySyncBase,serverCooldownUntil:o.serverCooldownUntil,nextWorkTimestamp:o.nextWorkTimestamp,timestamp:b}),f(),"waiting"}const D=Number(m.energyUsed)||Number(m.energy_used)||0,S=Number(m.xpEarned)||Number(m.xp_earned)||0,E=D>=10&&D<=350,M=S>0;if(m.energyUsed===0||m.xpEarned===0){const b=Date.now();o.currentEnergy=0,o.postShiftEnergy=0,o.lastWorkTimestamp=b,o.domEnergyStale=!0,o.energySyncBase={current:0,max:o.maxEnergy||115,updatedAt:b,regenRate:o.regenRate||1};const w=Math.max(10*6e4,Le(o,i));return n(`Shift selesai tapi menghasilkan 0 XP. Menunggu energi pulih (~${Math.round(w/6e4)} mnt)...`,"warn"),o.nextWorkTimestamp=b+w,$e(o),N(o,i,!0),f(),"waiting"}if(!E&&!M){const b=Date.now(),w=Math.max(12e4,Le(o,i));return n(`Respons server tidak mengonfirmasi perolehan kerja. Menunggu siklus berikutnya (~${Math.round(w/6e4)} mnt)...`,"warn"),o.nextWorkTimestamp=b+w,N(o,i,!0),f(),"waiting"}const L=E?D:Math.floor(S/4)*10,I=M?S:Math.floor(L/10)*4,U=Number(m.workerUnits)||Number(m.worker_units)||Number(m.produced)||0;if(I<=0)return n(`Shift tidak menghasilkan XP. Energi saat ini: ${o.currentEnergy}/${o.maxEnergy} EN.`,"warn"),f(),"waiting";o.totalWorked++,o.workToday++,o.totalWorkXP+=I,o.xpToday+=I,o.totalEnergySpent+=L,o.totalActualEnergySpent+=E?D:0,o.totalEstimatedEnergySpent+=E?0:L,o.lastWorkTime=new Date().toLocaleTimeString("id-ID");const W=new Date().toDateString();let T=s||e?.workHistory;if(typeof T=="string")try{T=JSON.parse(T)}catch{T={}}(!T||typeof T!="object")&&(T={}),T[W]||(T[W]={shifts:0,xp:0});const z=T[W];z.shifts=(z.shifts||0)+1,z.xp=(z.xp||0)+I,z.energySpent=(z.energySpent||0)+(E?L:0),z.estimatedEnergySpent=(z.estimatedEnergySpent||0)+(E?0:L),z.energyDataShifts=(z.energyDataShifts||0)+(E?1:0),Ht(T),e&&(e.workHistory=T),m.energy!=null&&typeof m.energy=="number"?o.currentEnergy=Math.max(0,Math.round(m.energy)):m.remainingEnergy!=null&&typeof m.remainingEnergy=="number"?o.currentEnergy=Math.max(0,Math.round(m.remainingEnergy)):o.currentEnergy=Math.max(0,(o.currentEnergy||0)-L);const V=Date.now();o.shiftExecutedInSession=!0,o.postShiftEnergy=o.currentEnergy,o.lastWorkTimestamp=V,o.energySyncBase={current:o.currentEnergy,max:o.maxEnergy,updatedAt:V,regenRate:o.regenRate||1},o.domEnergyStale=!0,setTimeout(()=>{if(o.shiftExecutedInSession=!1,!(typeof document<"u"&&document.hidden)){const w=ge();w&&w.current<=(o.postShiftEnergy??0)+2&&(o.currentEnergy=w.current,o.maxEnergy=w.max,o.energySyncBase={current:w.current,max:w.max,updatedAt:Date.now(),regenRate:o.regenRate||1},o.domEnergyStale=!1,N(o,i,!0),f?.())}},1500),$e(o),N(o,i,!0),me({type:"WORK_SHIFT_COMPLETED",currentEnergy:o.currentEnergy,maxEnergy:o.maxEnergy,energySyncBase:o.energySyncBase,lastWorkTime:o.lastWorkTime,lastWorkTimestamp:o.lastWorkTimestamp,workToday:o.workToday,xpToday:o.xpToday,totalWorked:o.totalWorked,totalWorkXP:o.totalWorkXP,nextWorkTimestamp:o.nextWorkTimestamp,timestamp:Date.now()}),o.consecutive400Errors=0,o.consecutiveErrors=0,o.backoffUntil=0,o.serverCooldownUntil=0,L>0&&(o.unitEnergyCost=Math.max(o.unitEnergyCost||10,L));const Z=U>0?` | +${U} unit`:"";return n(`Kerja sukses! +${I} XP${Z}`,"success"),c(i,"success"),l(i,"Parlamentum",`Kerja sukses! +${I} XP${Z}`),o.nextWorkTimestamp=Date.now()+Le(o,i),f(),"worked"}function oa(e){const{state:t,CONFIG:a,log:r,setRunningUI:o,sendNotification:i,playNotificationSound:s,updatePanel:n,setValue:l}=e;t.pausedForToken=!0,t.tokenExpired=!0;let c=0;try{c=parseInt(sessionStorage.getItem("aw_auth_reload_attempts")||"0",10)}catch{}if(c<1){try{sessionStorage.setItem("aw_auth_reload_attempts",(c+1).toString())}catch{}r("Sesi token kedaluwarsa (401). Me-reload tab game sekali untuk memperbarui sesi...","warn"),setTimeout(()=>{window.location.reload()},2e3)}else t.running=!1,l?.("aw_worker_running","false"),o?.(!1),r("Sesi login telah kedaluwarsa (401). Auto Worker dijeda. Silakan login kembali di game.","error"),i?.(a,"Sesi Kedaluwarsa","Silakan login kembali di Parlamentum.");return n?.(),"paused"}async function ra(e,t){const{state:a,CONFIG:r,log:o,setRunningUI:i,sendNotification:s,updatePanel:n}=e,l=await t.text();let c="";try{const y=JSON.parse(l);typeof y=="string"?c=y:y&&typeof y=="object"&&(c=[y.message,y.error,y.detail,y.reason].find(m=>typeof m=="string")||"")}catch{}c||(c=l.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()),c=c.slice(0,240);const f=`${l} ${c}`;if(/wallet|wage/i.test(f))return o("Majikan Kehabisan Saldo! Kas perusahaan tidak cukup untuk membayar upah. Script dijeda.","error"),a.running=!1,e.setValue?.("aw_worker_running","false"),i(!1),s(r,"Parlamentum","Kas majikan habis! Pindah lowongan di Job Board."),"paused";if(/region|wilayah|transit|travel|penerbangan/i.test(f))return o(`${c||"Anda harus berada di wilayah perusahaan untuk bekerja (sedang dalam perjalanan)"}. Menunggu 3 menit...`,"warn"),a.nextWorkTimestamp=Date.now()+3*6e4,n(),"waiting";if(/(insufficient[_ ]energy|not enough energy|energi.{0,40}(?:tidak|belum|kurang)|produce even one unit)/i.test(f)){const y=Date.now();a.currentEnergy=0,a.postShiftEnergy=0,a.lastWorkTimestamp=y,a.domEnergyStale=!0,a.energySyncBase={current:0,max:a.maxEnergy||115,updatedAt:y,regenRate:a.regenRate||1},(!a.unitEnergyCost||a.unitEnergyCost<20)&&(a.unitEnergyCost=20),a.energyFlushLockoutUntil=y+15*6e4;const m=Math.max(20,r.energyThreshold||90),x=a.regenRate||1,B=Math.max(12e4,Math.round(m/x*6e4)),D=Math.round(B/6e4);if(a.serverCooldownUntil=y+B,a.nextWorkTimestamp=a.serverCooldownUntil,a.consecutive400Errors=(a.consecutive400Errors||0)+1,a.consecutive400Errors>=3){const S=Math.min(6e5,18e4*Math.pow(1.5,a.consecutive400Errors-3));a.serverCooldownUntil=Math.max(a.serverCooldownUntil,y+S),a.nextWorkTimestamp=a.serverCooldownUntil,o(`[Cooldown Darurat] Terdeteksi ${a.consecutive400Errors} penolakan beruntun dari server. Jeda darurat aktif ${Math.round(S/6e4)} menit untuk melindungi akun.`,"warn")}else o(`Server menolak kerja (HTTP ${t.status}): ${c||"Energi di server belum cukup"}. Menunggu target ${m} EN (~${D} mnt)...`,"warn");return $e(a),N(a,r,!0),me({type:"WORK_SHIFT_COMPLETED",currentEnergy:a.currentEnergy,maxEnergy:a.maxEnergy||115,energySyncBase:a.energySyncBase,serverCooldownUntil:a.serverCooldownUntil,nextWorkTimestamp:a.nextWorkTimestamp,timestamp:y}),n(),"waiting"}return o(`Server menolak kerja (HTTP ${t.status})${c?`: ${c}`:""}`,"error"),a.running=!1,i(!1),$e(a),N(a,r,!0),n(),s(r,"Parlamentum Auto Worker dijeda",c||`Server menolak (HTTP ${t.status}).`),"paused"}function ia(e,t){const{state:a,log:r,setRunningUI:o,updatePanel:i,setValue:s}=e;return a.workResultUncertain=!0,a.uncertainReconciliation="pending",e.uncertainEnergyBefore=t,s("aw_workResultUncertain","true"),s("aw_uncertainEnergyBefore",JSON.stringify(t)),a.running=!1,s("aw_worker_running","false"),o(!1),r("Request kerja timeout (15 detik). Hasil belum pasti; script dijeda. Muat ulang halaman setelah memeriksa status kerja.","error"),e.reconcileUncertainWork?.(),i(),"uncertain"}const $={minimize:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>',expand:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>',lockOpen:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>',lockClosed:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',settings:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 4.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',close:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',robot:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>',shrink:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>',terminal:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>',target:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>',play:'<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',pause:'<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>',zap:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',mapPin:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',shield:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',fileText:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',clock:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',search:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',trash:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',copy:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',check:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',alert:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',volume:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>',utensils:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2"></path><path d="M15 2v18"></path><path d="M7 2v20"></path><path d="M4 2v5a3 3 0 0 0 6 0V2"></path></svg>',dumbbell:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6.5 6.5 11 11"></path><path d="m21 21-1-1"></path><path d="m3 3 1 1"></path><path d="m18 22 4-4"></path><path d="m2 6 4-4"></path><path d="m3 10 7-7"></path><path d="m14 21 7-7"></path></svg>',sword:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"></polyline><line x1="13" y1="19" x2="19" y2="13"></line><line x1="16" y1="16" x2="20" y2="20"></line><line x1="19" y1="21" x2="21" y2="19"></line></svg>',book:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path><path d="M6 6h10"></path><path d="M6 10h10"></path></svg>',trendingUp:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>',wallet:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path></svg>',sliders:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>',barChart:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',keyboard:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="6" y1="8" x2="6" y2="8"></line><line x1="10" y1="8" x2="10" y2="8"></line><line x1="14" y1="8" x2="14" y2="8"></line><line x1="18" y1="8" x2="18" y2="8"></line><line x1="6" y1="12" x2="6" y2="12"></line><line x1="10" y1="12" x2="10" y2="12"></line><line x1="14" y1="12" x2="14" y2="12"></line><line x1="18" y1="12" x2="18" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line></svg>'},st={education:"Pendidikan",economy:"Ekonomi",strength:"Kekuatan"};function Et(e,t){const a=Math.max(0,parseInt(e,10)||0),r=Math.max(0,parseInt(t,10)||0);if(r<=a)return 0;const o=r-a;return Math.round(o*(a+1+r)/2)}function Ve(e,t=0){const a=Math.max(1,parseInt(e,10)||1),r=Math.max(0,parseInt(t,10)||0),o=.2894*Math.pow(a,2.5)*(1/(1+.01*r));return Math.max(1,Math.round(o))}function Tt(e,t,a=0,r=!1){const o=Math.max(0,parseInt(e,10)||0),i=Math.max(0,parseInt(t,10)||0);if(i<=o)return 0;let s=0;const n=Math.max(0,parseInt(a,10)||0);for(let l=o+1;l<=i;l++){const c=r?l-1:n;s+=Ve(l,c)}return s}function lt(e){if(e<=0)return"0 dtk";const t=Math.floor(e/86400),a=Math.floor(e%86400/3600),r=Math.floor(e%3600/60);return t>0?a>0?`~${t} hari ${a} jam`:`~${t} hari`:a>0?r>0?`~${a} jam ${r} mnt`:`~${a} jam`:r>0?`~${r} mnt`:"< 1 mnt"}function sa(e){if(e<=0)return"0s";const t=Math.floor(e/1e3),a=Math.floor(t/3600),r=Math.floor(t%3600/60),o=t%60;return a>0?`${a}j ${r}m`:r>0?`${r}m ${o}s`:`${o}s`}function la(e,t=null){if(!e||!e.endsAt)return 0;if(typeof e.domProgressPct=="number"&&e.domProgressPct>=0&&e.domProgressPct<=100)return Math.max(0,Math.min(100,e.domProgressPct));const a=new Date(e.endsAt).getTime(),r=Date.now(),o=Math.max(0,a-r);if(o<=0)return 100;const i=e.targetLevel||1,s=t?.education||0,n=Ve(i,s),c=(e.totalSeconds||n||3600)*1e3,f=Math.max(c,o+1e3),g=Math.max(0,f-o),y=Math.round(g/f*100);return Math.max(0,Math.min(100,y))}function Pe(e){if(typeof document>"u"||!C())return!1;e.trainingStats||(e.trainingStats={strength:0,education:0,economy:0});let t=!1;const a=i=>!!i?.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast"),r={strength:/KEKUATAN/i,education:/PENDIDIKAN/i,economy:/EKONOMI|PRODUKSI/i};try{const i=document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, div, p");for(const s of i){if(a(s))continue;const n=(s.textContent||"").trim();if(/^LATIHAN\b/i.test(n)&&n.length<=15){let l=s.parentElement;for(let c=0;c<4&&l&&l!==document.body;c++){const f=l.querySelectorAll("div, li, section");for(const g of f){if(a(g))continue;const y=g.textContent||"";for(const[m,x]of Object.entries(r))if(x.test(y)){const B=y.match(/(?:LATIH|BERLATIH)\s*(?:-|KE)?\s*LV\s*(\d{1,3})/i);if(B){const S=parseInt(B[1],10);if(S>=1&&S<=500){const E=S-1;E!==e.trainingStats[m]&&(e.trainingStats[m]=E,v(`aw_stat_${m}`,E.toString()),t=!0);break}}const D=g.querySelectorAll("span, div, p, b, strong, h1, h2, h3, h4");for(const S of D){if(a(S))continue;const M=(S.textContent||"").trim().match(/^(\d{1,3})$/);if(M){const L=parseInt(M[1],10);if(L>=1&&L<=500&&L!==e.trainingStats[m]){e.trainingStats[m]=L,v(`aw_stat_${m}`,L.toString()),t=!0;break}}}}}l=l.parentElement}}}}catch{}const o={strength:["stat-strength","stat-kekuatan"],education:["stat-education","stat-pendidikan"],economy:["stat-economy","stat-production","stat-economic","stat-ekonomi"]};for(const[i,s]of Object.entries(o))if(!(e.trainingStats[i]>0))for(const n of s){const l=document.querySelector(`[data-testid="${n}"]`);if(l&&!a(l)){const c=(l.textContent||"").trim().match(/^(\d{1,3})$/);if(c){const f=parseInt(c[1],10);f>=0&&f<=500&&f!==e.trainingStats[i]&&(e.trainingStats[i]=f,v(`aw_stat_${i}`,f.toString()),t=!0)}break}}return St(e),da(e),t}function St(e){if(typeof document>"u")return 0;try{const t=s=>!!s?.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast"),a=document.querySelector('[data-testid="wallet-gold"]');if(a&&!t(a)){const n=(a.textContent||"").trim().replace(/[^\d]/g,""),l=parseInt(n,10);if(!isNaN(l)&&l>=0)return e.walletGold=l,v("aw_wallet_gold",l.toString()),l}const r=document.querySelector('[data-testid="wallet"], [data-testid="wallet-button"]');if(r&&!t(r)){const s=r.querySelector('[data-testid="wallet-gold"]')||r.querySelector('.text-gold-light, [class*="text-gold"]')||r.querySelector('svg.lucide-coins, svg[class*="lucide-coins"]')?.parentElement;if(s){const n=(s.textContent||"").replace(/[^\d]/g,""),l=parseInt(n,10);if(!isNaN(l)&&l>=0)return e.walletGold=l,v("aw_wallet_gold",l.toString()),l}}const o=document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, div, p, aside, section");for(const s of o){if(t(s))continue;const n=(s.textContent||"").trim();if(/^EMAS\b/i.test(n)&&n.length<=15){let l=s.parentElement;for(let c=0;c<4&&l&&l!==document.body;c++){const g=(l.textContent||"").match(/(?:EMAS[\s\S]{0,25}?)?([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{1,7})(?:[\s\S]{0,25}?EMAS)?/i);if(g&&g[1]){const y=g[1].replace(/[.,]/g,"").replace(/[^\d]/g,""),m=parseInt(y,10);if(!isNaN(m)&&m>=0)return e.walletGold=m,v("aw_wallet_gold",m.toString()),m}l=l.parentElement}}}for(const s of o){if(t(s))continue;const n=(s.textContent||"").trim();if(/^DOMPET\b/i.test(n)&&n.length<=25){let l=s.parentElement;for(let c=0;c<5&&l&&l!==document.body;c++){const f=l.textContent||"";if(/EMAS/i.test(f)){const g=f.match(/EMAS[\s\S]{0,30}?([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{1,7})/i);if(g&&g[1]){const y=g[1].replace(/[.,]/g,"").replace(/[^\d]/g,""),m=parseInt(y,10);if(!isNaN(m)&&m>=0)return e.walletGold=m,v("aw_wallet_gold",m.toString()),m}}l=l.parentElement}}}const i=document.querySelectorAll('header, nav, [class*="navbar"], [class*="header"], [class*="topbar"]');for(const s of i){if(t(s))continue;const n=s.textContent||"";if(/USD/i.test(n)){const l=n.match(/\b([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{1,7})\b/g);if(l&&l.length>=1){for(const c of l)if(!new RegExp(`${c.replace(/[.,]/g,"[.,]")}\\s*USD`,"i").test(n)){const g=c.replace(/[.,]/g,"").replace(/[^\d]/g,""),y=parseInt(g,10);if(!isNaN(y)&&y>=0)return e.walletGold=y,v("aw_wallet_gold",y.toString()),y}}}}}catch{}return e.walletGold||0}function da(e){if(typeof document>"u"||!C())return;const t=i=>!!i?.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast"),a=document.querySelector('[data-testid^="train-timer-"]');if(a&&!t(a)){const s=(a.getAttribute("data-testid")||"").replace("train-timer-","").trim(),n=(a.textContent||"").trim().toLowerCase();let l=0;const c=n.match(/(\d+)\s*j/i),f=n.match(/(\d+)\s*mnt/i),g=n.match(/(\d+)\s*dtk/i);if(c&&(l+=parseInt(c[1],10)*3600),f&&(l+=parseInt(f[1],10)*60),g&&(l+=parseInt(g[1],10)),l>0){const y=Date.now()+l*1e3,m=e.activeTraining?.endsAt?new Date(e.activeTraining.endsAt).getTime():0,x=(e.trainingStats?.[s]||0)+1;let B=Ve(x,e.trainingStats?.education||0),D=null;const S=a.closest("li, div.mt-3, section")||a.parentElement?.parentElement;if(S){const E=S.querySelectorAll('[style*="width"]');for(const M of E){const I=(M.style.width?.trim()||M.getAttribute("style")||"").match(/([\d.]+)%/);if(I){const U=parseFloat(I[1]);if(U>=0&&U<=100){D=Math.round(U*10)/10;break}}}if(D===null){const M=S.querySelector('[class*="rounded-full"][class*="overflow-hidden"], [class*="bg-gold/[0.08]"]'),L=M?.querySelector("div");if(M&&L&&M.offsetWidth>10){const I=Math.round(L.offsetWidth/M.offsetWidth*1e3)/10;I>=0&&I<=100&&(D=I)}}}if(D!==null&&D>0&&D<100){const E=Math.round(l/(1-D/100));E>0&&E<864e3&&(B=E)}if(!e.activeTraining||Math.abs(m-y)>8e3||e.activeTraining.stat!==s)e.activeTraining={stat:s,endsAt:new Date(y).toISOString(),targetLevel:x,totalSeconds:B,domProgressPct:D},v("aw_active_training",e.activeTraining);else{let E=!1;D!==null&&e.activeTraining.domProgressPct!==D&&(e.activeTraining.domProgressPct=D,E=!0),B&&e.activeTraining.totalSeconds!==B&&(e.activeTraining.totalSeconds=B,E=!0),E&&v("aw_active_training",e.activeTraining)}return}}const r={strength:/KEKUATAN/i,education:/PENDIDIKAN/i,economy:/EKONOMI|PRODUKSI/i},o=document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, div, p");for(const i of o){if(t(i))continue;const s=(i.textContent||"").trim();if(/^LATIHAN\b/i.test(s)&&s.length<=15){let n=i.parentElement;for(let l=0;l<4&&n&&n!==document.body;l++){const c=n.textContent||"";if(/BERLATIH/i.test(c)){const f=n.querySelectorAll("div, section, li");for(const g of f){if(t(g))continue;const y=g.textContent||"";if(/\bBERLATIH\b/i.test(y)&&!/\bLATIH\s*-/i.test(y)){let m=null;for(const[x,B]of Object.entries(r))if(B.test(y)){m=x;break}if(m){const x=y.match(/BERLATIH\s*(?:KE\s*)?LV\s*(\d+)/i),B=x?parseInt(x[1],10):(e.trainingStats?.[m]||0)+1;let D=0;const S=y.match(/(\d+)\s*j(?:am)?\b/i),E=y.match(/(\d+)\s*mnt\b/i),M=y.match(/(\d+)\s*dtk\b/i);if(S&&(D+=parseInt(S[1],10)*3600),E&&(D+=parseInt(E[1],10)*60),M&&(D+=parseInt(M[1],10)),D>0){const L=Date.now()+D*1e3,I=e.activeTraining?.endsAt?new Date(e.activeTraining.endsAt).getTime():0,U=e.trainingStats?.education||0,W=Ve(B,U);let T=null;const z=g.querySelectorAll('[style*="width"]');for(const V of z){const b=(V.style.width?.trim()||V.getAttribute("style")||"").match(/([\d.]+)%/);if(b){const w=parseFloat(b[1]);if(w>=0&&w<=100){T=Math.round(w*10)/10;break}}}if(T===null){const V=g.querySelector('[role="progressbar"], [aria-valuenow]');if(V){const Z=parseFloat(V.getAttribute("aria-valuenow")),b=parseFloat(V.getAttribute("aria-valuemax")||"100");!isNaN(Z)&&b>0&&(T=Math.round(Z/b*100))}}if(T===null){const V=g.querySelectorAll("div, span");for(const Z of V){const b=window.getComputedStyle?.(Z)?.backgroundColor||"";if(/rgb\(2[0-5]\d,\s*(?:1\d\d|2[0-5]\d),\s*\d+\)/.test(b)){const w=Z.parentElement;if(w&&w.offsetWidth>40&&Z.offsetWidth>0&&Z.offsetWidth<=w.offsetWidth){const A=Math.round(Z.offsetWidth/w.offsetWidth*100);if(A>0&&A<=100){T=A;break}}}}}if(!e.activeTraining||Math.abs(I-L)>8e3||e.activeTraining.stat!==m)e.activeTraining={stat:m,endsAt:new Date(L).toISOString(),targetLevel:B,totalSeconds:W,domProgressPct:T},v("aw_active_training",e.activeTraining);else{let V=!1;T!==null&&e.activeTraining.domProgressPct!==T&&(e.activeTraining.domProgressPct=T,V=!0),(!e.activeTraining.totalSeconds||e.activeTraining.totalSeconds!==W)&&(e.activeTraining.totalSeconds=W,V=!0),V&&v("aw_active_training",e.activeTraining)}return}}}}}n=n.parentElement}}}if(e.activeTraining&&e.activeTraining.endsAt){const i=new Date(e.activeTraining.endsAt).getTime();Date.now()>=i&&(e.activeTraining=null,v("aw_active_training",null))}}function dt(e){if(!e)return!1;try{e.scrollIntoView({behavior:"instant",block:"center"})}catch{try{e.scrollIntoView()}catch{}}try{e.focus?.()}catch{}const t=e.getBoundingClientRect(),a=Math.round(t.left+(t.width>0?t.width/2:10)),r=Math.round(t.top+(t.height>0?t.height/2:10)),o={bubbles:!0,cancelable:!0,composed:!0,view:window,clientX:a,clientY:r,screenX:a+(window.screenX||0),screenY:r+(window.screenY||0),button:0,buttons:1,pointerId:1,pointerType:"mouse",isPrimary:!0};try{e.dispatchEvent(new PointerEvent("pointerover",o)),e.dispatchEvent(new MouseEvent("mouseover",o)),e.dispatchEvent(new PointerEvent("pointerdown",o)),e.dispatchEvent(new MouseEvent("mousedown",o))}catch{}try{e.dispatchEvent(new PointerEvent("pointerup",o)),e.dispatchEvent(new MouseEvent("mouseup",o))}catch{}try{e.click()}catch{}try{const i=Object.keys(e).find(s=>s.startsWith("__reactProps")||s.startsWith("__reactEventHandlers"));i&&typeof e[i]?.onClick=="function"&&e[i].onClick({preventDefault:()=>{},stopPropagation:()=>{},target:e,currentTarget:e,bubbles:!0})}catch{}return!0}function Qt(e){if(typeof document<"u"&&(Ne()||document.querySelector('[data-testid="train-confirm"], [data-testid="train-confirm-start"], [data-testid="train-confirm-cancel"]')))return!1;if(e.activeTraining&&e.activeTraining.endsAt&&new Date(e.activeTraining.endsAt).getTime()>Date.now())return!0;if(typeof document<"u"){if(document.querySelector('[data-testid^="train-timer-"]'))return!0;if(document.querySelector('[data-testid="train-strength"][disabled], [data-testid="train-education"][disabled], [data-testid="train-economy"][disabled], [data-testid="train-production"][disabled]')&&document.querySelector('[data-testid="dash-training"]')){const r=document.querySelector('[data-testid="dash-training"]')?.textContent||"";if(/berlatih ke lv/i.test(r))return!0}}return!1}function Ne(){if(typeof document>"u")return null;const e=i=>!!i?.closest?.("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast"),t=document.querySelector('[data-testid="train-confirm-start"]');if(t&&!e(t))return t;const a=document.querySelector('[data-testid*="confirm-start"], [data-testid="train-confirm"] button.btn-gold');if(a&&!e(a))return a;const r=document.querySelectorAll('[data-testid="train-confirm"], div[role="dialog"], dialog, div.fixed.inset-0');for(const i of r){if(e(i))continue;const s=(i.textContent||"").toLowerCase();if(s.includes("pelatihan")||s.includes("latihan")){const n=i.querySelector("button.btn-gold");if(n&&!e(n))return n;for(const l of i.querySelectorAll('button, [role="button"]')){if(e(l))continue;if((l.textContent||"").trim().toLowerCase().includes("mulai pelatihan"))return l}}}const o=document.querySelectorAll('button, div[role="button"], a[role="button"]');for(const i of o){if(e(i))continue;if((i.textContent||"").trim().toLowerCase().includes("mulai pelatihan"))return i}return null}function ca(e){if(typeof document>"u")return null;const t=n=>!!n?.closest('#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast, [data-testid="train-confirm"]'),r={strength:["train-strength","train-kekuatan"],education:["train-education","train-pendidikan"],economy:["train-economy","train-production","train-economic","train-ekonomi","train-produksi"]}[e]||[`train-${e}`];for(const n of r){const l=document.querySelector(`[data-testid="${n}"]`);if(l&&!t(l))return l}const i={strength:/KEKUATAN/i,education:/PENDIDIKAN/i,economy:/EKONOMI|PRODUKSI/i}[e];if(!i)return null;const s=document.querySelectorAll('div, li, section, [class*="card"]');for(const n of s){if(t(n))continue;const l=n.textContent||"";if(i.test(l)&&/(?:LATIH|BERLATIH)/i.test(l)){const c=n.querySelectorAll("button");for(const f of c){if(t(f))continue;const g=(f.textContent||"").trim();if(/(?:LATIH|BERLATIH)/i.test(g))return f}}}return null}async function ua(e,t=6e3){const a=Date.now();for(;Date.now()-a<t;){const r=Ne();if(r)return r.disabled||r.getAttribute("aria-disabled")==="true"?(e?.("[Auto Latihan] Pop up konfirmasi muncul namun tombol dinonaktifkan (kemungkinan emas tidak cukup).","warn"),!1):(e?.('[Auto Latihan] Mengonfirmasi popup "Mulai Pelatihan"...',"info"),dt(r),!0);await new Promise(o=>setTimeout(o,60))}return!1}async function Ze(e){const{CONFIG:t,log:a,state:r,updatePanel:o}=e;if(!t.autoTrainEnabled)return!1;const i=Ne();if(!i||i.disabled||i.getAttribute("aria-disabled")==="true"||r._confirmModalInFlight)return!1;r._confirmModalInFlight=!0;try{return a?.('[Auto Latihan] Pop up konfirmasi "Mulai Pelatihan" terdeteksi, mengonfirmasi otomatis...',"info"),dt(i),await new Promise(s=>setTimeout(s,800)),Pe(r),o?.(),!0}catch(s){return a?.(`[Auto Latihan] Gagal konfirmasi popup: ${s?.message||s}`,"warn"),!1}}function Ft(e,t){if(!t.autoTrainEnabled||Qt(e))return null;const a={strength:t.trainStrengthEnabled!==!1,education:t.trainEducationEnabled!==!1,economy:t.trainEconomyEnabled!==!1};if(!(a.strength||a.education||a.economy))return{noActiveStats:!0};const o={education:t.targetEducation??100,economy:t.targetEconomy??100,strength:t.targetStrength??100},i=e.trainingStats||{education:0,economy:0,strength:0},s=["education","economy","strength"].filter(m=>a[m]&&(i[m]||0)<o[m]);if(s.length===0)return null;const n=t.trainPriority||"education";let l=null;if(n==="balanced"?(s.sort((m,x)=>{const B=(i[m]||0)-(i[x]||0);if(B!==0)return B;const D={education:1,economy:2,strength:3};return D[m]-D[x]}),l=s[0]):a[n]&&s.includes(n)?l=n:l=["education","economy","strength"].find(x=>s.includes(x))||s[0],!l)return null;const c=(i[l]||0)+1,f=t.minGoldReserve??50,g=e.walletGold||0,y=g>0&&g-c<f;return{stat:l,cost:c,targetLevel:c,insufficientGold:y,minReserve:f}}function pa(e,t){if(e.activeTraining&&e.activeTraining.endsAt){const o=new Date(e.activeTraining.endsAt).getTime()-Date.now();if(o>0){const i=st[e.activeTraining.stat]||e.activeTraining.stat,s=e.activeTraining.targetLevel?` Lv ${e.activeTraining.targetLevel}`:"";return{text:`Latih ${i}${s}`,timerText:sa(o),isActive:!0,isOff:!1}}}if(!t.autoTrainEnabled)return{text:"Latihan Stats: Nonaktif",timerText:"OFF",isActive:!1,isOff:!0};const a=Ft(e,t);return a?a.noActiveStats?{text:"Siaga (0 Stat Dipilih)",timerText:"STANDBY",isActive:!1,isOff:!1}:a.insufficientGold?{text:`Emas Kurang (< ${a.minReserve} Cadangan)`,timerText:"PAUSE",isActive:!1,isOff:!1}:{text:`Siap Latih ${st[a.stat]||a.stat} Lv ${a.targetLevel}`,timerText:"SIAP",isActive:!1,isOff:!1}:{text:"Semua Target Tercapai",timerText:"MAX",isActive:!1,isOff:!1}}let Ot=0;async function Bt(e){const{state:t,CONFIG:a,log:r,updatePanel:o}=e;if(!a.autoTrainEnabled||t.trainingInFlight||t.tabLockManaged&&!t.isTabLockOwner)return;const i=Ne();if(i){if(i.disabled||i.getAttribute("aria-disabled")==="true"){r?.('[Auto Latihan] Pop up konfirmasi "Mulai Pelatihan" terbuka namun tombol dinonaktifkan (kemungkinan emas tidak mencukupi).',"warn");return}t.trainingInFlight=!0;try{r?.('[Auto Latihan] Pop up konfirmasi "Mulai Pelatihan" terdeteksi, mengonfirmasi otomatis...',"info"),dt(i),await new Promise(l=>setTimeout(l,1e3)),Pe(t),o?.()}finally{t.trainingInFlight=!1}return}Pe(t);const s=Ft(t,a);if(!s){!t._allTargetsCompletedLogged&&!Qt(t)&&(a.trainStrengthEnabled!==!1||a.trainEducationEnabled!==!1||a.trainEconomyEnabled!==!1)&&(t._allTargetsCompletedLogged=!0,r("[Auto Latihan] Selamat! Seluruh target latihan level telah tercapai. Auto Latihan memasuki mode siaga (MAX).","success"));return}if(t._allTargetsCompletedLogged=!1,s.noActiveStats)return;if(s.insufficientGold){const l=Date.now();l-Ot>3e5&&(Ot=l,r(`[Auto Latihan] Ditunda: Emas di dompet (${t.walletGold||0}) tidak cukup untuk cadangan minimal (${s.minReserve} Emas).`,"warn"));return}t.trainingInFlight=!0;const n=st[s.stat]||s.stat;try{r(`[Auto Latihan] Memulai latihan ${n} Lv ${s.targetLevel} (Biaya: ${s.cost} Emas)...`,"info");const l=ca(s.stat);if(l&&!l.disabled){if(dt(l),await ua(r,6e3)){await new Promise(f=>setTimeout(f,1e3)),Pe(t),o?.();return}await new Promise(f=>setTimeout(f,800)),Pe(t),o?.();return}if(t.currentToken){const c=await fetch("https://parlamentum.org/api/player/train",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t.currentToken}`},body:JSON.stringify({stat:s.stat})});if(c.ok){const f=await c.json();Gt({stat:s.stat,endsAt:f.endsAt||f.ends_at,targetLevel:Number(f.targetLevel??f.target_level??s.targetLevel),costGold:Number(f.costGold??f.cost_gold??s.cost*100),raw:f},t,a,e)}else{let f="Server menolak latihan";try{const g=await c.json();(g.message||g.error)&&(f=g.message||g.error)}catch{}r(`[Auto Latihan] Gagal: ${f} (${c.status})`,"warn")}}}catch(l){r(`[Auto Latihan] Error eksekusi: ${l?.message||l}`,"error")}finally{t.trainingInFlight=!1,o?.()}}function Gt(e,t,a,r){const o=e.endsAt||e.ends_at,i=Number(e.targetLevel??e.target_level??0),s=Number(e.costGold??e.cost_gold??0),n=e.stat||"strength",l=Ve(i,t.trainingStats?.education||0);if(t.activeTraining={stat:n,endsAt:o,targetLevel:i,costGold:s,totalSeconds:l,domProgressPct:0},v("aw_active_training",t.activeTraining),s>0&&t.walletGold>0){const g=Math.round(s>=100?s/100:s);t.walletGold=Math.max(0,t.walletGold-g),v("aw_wallet_gold",t.walletGold.toString())}if(o){const g=new Date(o).getTime();t.nextTrainCheckTimestamp=g+3500}N(t,a,!0),me({type:"TRAIN_UPDATED",activeTraining:t.activeTraining,walletGold:t.walletGold,timestamp:Date.now()});const c=st[n]||n,f=o?new Date(o).toLocaleTimeString():"segera";r?.log?.(`[Auto Latihan] Sukses: Latihan ${c} Lv ${i} aktif. Selesai pukul ${f}.`,"success"),r?.updatePanel?.()}function ga(e,t,a,r){const o=e.message||"Latihan ditolak oleh server.";r?.log?.(`[Auto Latihan] Rejection: ${o}`,"warn")}function fa(){if(!(typeof document>"u")&&!document.getElementById("aw-google-fonts")){const e=document.createElement("link");e.rel="preconnect",e.href="https://fonts.googleapis.com",document.head.appendChild(e);const t=document.createElement("link");t.rel="preconnect",t.href="https://fonts.gstatic.com",t.crossOrigin="anonymous",document.head.appendChild(t);const a=document.createElement("link");a.id="aw-google-fonts",a.rel="stylesheet",a.href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap",document.head.appendChild(a)}}function ma(){if(typeof document>"u"||document.getElementById("aw-panel-styles"))return;fa();const e=document.createElement("style");e.id="aw-panel-styles",e.textContent=`
        :root, #aw-panel, #aw-full-container, #aw-pill-container {
            --bg-abyss: #0a0e1a;
            --surface-card: rgba(22, 27, 42, 0.75);
            --surface-elevated: rgba(30, 39, 59, 0.82);
            --surface-inner: rgba(13, 18, 30, 0.72);
            --border-subtle: rgba(255, 255, 255, 0.08);
            --border-highlight: rgba(56, 189, 248, 0.32);
        }

        #aw-panel {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            color: #f1f5f9 !important;
            letter-spacing: -0.01em;
        }

        .tabular-nums, .paw-mono {
            font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace !important;
            font-variant-numeric: tabular-nums !important;
            letter-spacing: -0.02em !important;
        }

        /* Argon Cyber Glass Shell */
        .paw-shell {
            background: rgba(13, 18, 30, 0.88) !important;
            backdrop-filter: blur(20px) saturate(160%) !important;
            -webkit-backdrop-filter: blur(20px) saturate(160%) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: 
                0 24px 48px -12px rgba(0, 0, 0, 0.75),
                0 0 0 1px rgba(56, 189, 248, 0.06),
                inset 0 1px 0 0 rgba(255, 255, 255, 0.12) !important;
            border-radius: 16px !important;
        }

        #aw-pill-container {
            border-radius: 999px !important;
            min-width: 250px !important;
            background: rgba(13, 18, 30, 0.94) !important;
            backdrop-filter: blur(20px) saturate(160%) !important;
            -webkit-backdrop-filter: blur(20px) saturate(160%) !important;
            border: 1px solid rgba(56, 189, 248, 0.35) !important;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 0 0 14px rgba(56, 189, 248, 0.25) !important;
        }

        /* Modular Inner Glass Card */
        .paw-card {
            background: rgba(22, 27, 42, 0.75) !important;
            backdrop-filter: blur(16px) !important;
            -webkit-backdrop-filter: blur(16px) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.05) !important;
            border-radius: 12px !important;
            transition: border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease !important;
        }
        .paw-card:hover {
            border-color: rgba(56, 189, 248, 0.28) !important;
            background: rgba(26, 33, 52, 0.82) !important;
        }

        /* Recessed Well for Sub-Metrics */
        .paw-well {
            background: rgba(13, 18, 30, 0.72) !important;
            border: 1px solid rgba(255, 255, 255, 0.06) !important;
            border-radius: 8px !important;
        }

        /* Low-Profile Neutral OFF Badge */
        .badge-train-off {
            background: rgba(255, 255, 255, 0.03) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            color: #94a3b8 !important;
        }

        /* Pulse Animations for Status Dots */
        @keyframes pulseRing {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .status-dot-active {
            animation: pulseRing 2s infinite !important;
        }

        @keyframes pulseAmber {
            0%, 100% { opacity: 1; box-shadow: 0 0 10px rgba(245, 158, 11, 0.35); }
            50% { opacity: 0.72; box-shadow: 0 0 4px rgba(245, 158, 11, 0.1); }
        }
        .badge-flush-pulse {
            animation: pulseAmber 2.2s infinite ease-in-out !important;
        }

        @keyframes shimmerBar {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        @keyframes statGradientShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        .energy-progress-fill {
            background: linear-gradient(90deg, #0ea5e9 0%, #38bdf8 45%, #818cf8 85%, #38bdf8 100%) !important;
            background-size: 200% 100% !important;
            animation: shimmerBar 4s infinite linear !important;
            box-shadow: 0 0 14px rgba(56, 189, 248, 0.45) !important;
            border-radius: 999px !important;
            transition: width 0.35s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .stat-progress-fill {
            background: linear-gradient(90deg, #f43f5e 0%, #fb923c 45%, #fbbf24 85%, #f43f5e 100%) !important;
            background-size: 200% 100% !important;
            animation: statGradientShimmer 4s infinite linear !important;
            box-shadow: 0 0 10px rgba(244, 63, 94, 0.45) !important;
        }

        @keyframes aw-pulse-glow {
            0% {
                box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.75), 0 0 12px rgba(0, 255, 136, 0.25);
                border-color: rgba(0, 255, 136, 0.45);
            }
            50% {
                box-shadow: 0 28px 54px -10px rgba(0, 0, 0, 0.85), 0 0 24px rgba(0, 255, 136, 0.65);
                border-color: rgba(0, 255, 136, 0.85);
            }
            100% {
                box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.75), 0 0 12px rgba(0, 255, 136, 0.25);
                border-color: rgba(0, 255, 136, 0.45);
            }
        }
        @keyframes aw-pill-pulse-glow {
            0% {
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.65), 0 0 8px rgba(0, 255, 136, 0.3);
                border-color: rgba(0, 255, 136, 0.45);
            }
            50% {
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.75), 0 0 18px rgba(0, 255, 136, 0.75);
                border-color: rgba(0, 255, 136, 0.9);
            }
            100% {
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.65), 0 0 8px rgba(0, 255, 136, 0.3);
                border-color: rgba(0, 255, 136, 0.45);
            }
        }
        .aw-ready-glow {
            animation: aw-pulse-glow 2.2s infinite ease-in-out !important;
        }
        #aw-pill-container.aw-ready-glow {
            animation: aw-pill-pulse-glow 2.2s infinite ease-in-out !important;
        }

        .btn-cyber {
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
            outline: none !important;
            user-select: none !important;
            cursor: pointer !important;
            -webkit-tap-highlight-color: transparent !important;
        }
        .btn-cyber:hover:not(:disabled) {
            filter: brightness(1.15) !important;
            transform: translateY(-1.5px) !important;
        }
        .btn-cyber:active:not(:disabled) {
            transform: translateY(0.5px) scale(0.985) !important;
        }

        .aw-btn-action {
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
            outline: none !important;
            user-select: none !important;
            -webkit-tap-highlight-color: transparent !important;
        }
        .aw-btn-action:hover:not(:disabled) {
            filter: brightness(1.15) !important;
            transform: translateY(-1.5px) !important;
        }
        .aw-btn-action:active:not(:disabled) {
            transform: translateY(0.5px) scale(0.97) !important;
            filter: brightness(0.92) !important;
        }
        .aw-header-btn {
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
            border-radius: 8px !important;
            outline: none !important;
            -webkit-tap-highlight-color: transparent !important;
        }
        .aw-header-btn:hover {
            background: rgba(255, 255, 255, 0.12) !important;
            color: #fff !important;
            border-color: rgba(255, 255, 255, 0.2) !important;
        }
        .aw-pill-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            outline: none !important;
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
            user-select: none !important;
            padding: 0 !important;
            -webkit-tap-highlight-color: transparent !important;
        }
        .aw-pill-btn:hover:not(:disabled) {
            filter: brightness(1.2) !important;
            transform: scale(1.08) !important;
        }
        .aw-pill-btn:active:not(:disabled) {
            transform: scale(0.94) !important;
        }
        .aw-pill-box:hover {
            border-color: rgba(56, 189, 248, 0.45) !important;
            box-shadow: 0 12px 34px rgba(0, 0, 0, 0.75), 0 0 16px rgba(56, 189, 248, 0.28) !important;
        }
        .aw-badge-btn {
            outline: none !important;
            -webkit-tap-highlight-color: transparent !important;
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .aw-badge-btn:hover {
            filter: brightness(1.15) !important;
            transform: translateY(-0.5px) !important;
        }
        .aw-badge-btn:active {
            transform: scale(0.97) !important;
        }
        .aw-mini-stat-pill {
            background: rgba(13, 18, 30, 0.72) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-radius: 8px !important;
            padding: 6px 10px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            cursor: pointer !important;
            user-select: none !important;
            outline: none !important;
            -webkit-tap-highlight-color: transparent !important;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .aw-mini-stat-pill:hover {
            transform: translateY(-1.5px) !important;
            filter: brightness(1.15) !important;
        }
        .aw-mini-stat-pill:active {
            transform: scale(0.97) !important;
        }
        .aw-mini-stat-pill .pill-lbl {
            font-size: 11.5px !important;
            font-weight: 700 !important;
            transition: color 0.2s ease !important;
        }
        .aw-mini-stat-pill .stat-val {
            font-size: 13.5px !important;
            font-weight: 700 !important;
            color: #ffffff !important;
            transition: color 0.2s ease !important;
        }

        /* Active / Selected Pills (Gambar 3): Show color indicator border & colored label */
        .aw-mini-stat-pill.pill-str:not(.dimmed) {
            border-left: 2.5px solid #f43f5e !important;
        }
        .aw-mini-stat-pill.pill-str:not(.dimmed) .pill-lbl {
            color: #f43f5e !important;
        }

        .aw-mini-stat-pill.pill-edu:not(.dimmed) {
            border-left: 2.5px solid #38bdf8 !important;
        }
        .aw-mini-stat-pill.pill-edu:not(.dimmed) .pill-lbl {
            color: #38bdf8 !important;
        }

        .aw-mini-stat-pill.pill-eko:not(.dimmed) {
            border-left: 2.5px solid #10b981 !important;
        }
        .aw-mini-stat-pill.pill-eko:not(.dimmed) .pill-lbl {
            color: #10b981 !important;
        }

        /* Unselected / Dimmed Pills (Gambar 2): Border turns gray (NO red/blue/green), text turns gray */
        .aw-mini-stat-pill.dimmed {
            opacity: 0.55 !important;
            background: rgba(13, 18, 30, 0.45) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-left: 1px solid rgba(255, 255, 255, 0.08) !important;
        }
        .aw-mini-stat-pill.dimmed .pill-lbl,
        .aw-mini-stat-pill.dimmed span {
            color: #64748b !important;
        }
        .aw-mini-stat-pill.dimmed .stat-val,
        .aw-mini-stat-pill.dimmed div {
            color: #64748b !important;
        }
        #aw-training-body {
            transition: max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, margin-top 0.25s ease !important;
        }
        #aw-training-body.collapsed {
            max-height: 0px !important;
            opacity: 0 !important;
            margin-top: 0px !important;
            padding-top: 0px !important;
            padding-bottom: 0px !important;
            overflow: hidden !important;
            pointer-events: none !important;
        }
        #aw-training-body.expanded {
            max-height: 180px !important;
            opacity: 1 !important;
            margin-top: 8px !important;
            overflow: hidden !important;
            pointer-events: auto !important;
        }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
            -webkit-appearance: none !important;
            margin: 0 !important;
        }
        /* Battery & GPU Saving: suspend all animations when tab is hidden */
        .aw-tab-hidden *, .aw-tab-hidden *::before, .aw-tab-hidden *::after {
            animation-play-state: paused !important;
        }
        input[type="number"] {
            -moz-appearance: textfield !important;
        }
    `,document.head.appendChild(e),typeof document<"u"&&!window.__AW_VISIBILITY_ATTACHED__&&(window.__AW_VISIBILITY_ATTACHED__=!0,document.addEventListener("visibilitychange",()=>{const t=document.getElementById("aw-panel");t&&(document.hidden?t.classList.add("aw-tab-hidden"):t.classList.remove("aw-tab-hidden"))}))}function en(e,t){return!(t.panelDashboardOnly&&!C()||t.panelLeaderOnly&&e.tabLockManaged&&!e.isTabLockOwner&&typeof document<"u"&&document.hidden||e.panelVisible===!1)}function Ke(e,t){const a=document.getElementById("aw-panel");if(!a)return;const r=e.userManuallyToggledPanel?!!e.panelVisible:en(e,t);a.style.display=r?"block":"none"}function ya(e,t,a){const r=document.getElementById("aw-panel");r&&r.remove(),ma(),e.userManuallyToggledPanel=!1,t.panelDashboardOnly&&C()&&(e.panelVisible=!0,v("panelVisible","true")),setTimeout(()=>{const o=Math.max(10,window.innerWidth-(e.panelMinimized?280:376)),i=Math.max(10,window.innerHeight-(e.panelMinimized?46:200));e.panelX=Math.max(10,Math.min(e.panelX??10,o)),e.panelY=Math.max(10,Math.min(e.panelY??10,i));const s=document.createElement("div");s.id="aw-panel",s.style.cssText=`
            position: fixed; top: ${e.panelY}px; left: ${e.panelX}px;
            color: #f1f5f9;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            font-size: 12px;
            z-index: 99999;
            box-sizing: border-box;
            user-select: none;
            overflow: visible;
            background: transparent;
            display: ${en(e,t)?"block":"none"};
        `,s.innerHTML=ba(e,t),document.body.appendChild(s),Te(e,!!e.panelMinimized),ha(s,e,t),wa(s,e,t,a),ka(s,e,t),document.addEventListener("visibilitychange",()=>{document.hidden||a.updatePanel?.()}),a.log("Panel v5.12.0 siap!","success",!1)},250)}function Mt(e,t,a,r){if(!chrome.runtime?.id){R("aw-circuit-breaker-banner",u=>{u.style.display="block",u.style.background="rgba(239, 68, 68, 0.25)",u.style.borderColor="rgba(239, 68, 68, 0.5)",u.style.color="#fca5a5",u.style.cursor="pointer",u.textContent="Ekstensi telah di-reload. Klik di sini atau tekan F5 untuk menyambungkan kembali.",u.onclick=()=>window.location.reload()});return}const{getSyncedEnergy:o,getPlayerLevel:i,getMaxEnergyForLevel:s}=r;if(e.userManuallyToggledPanel||Ke(e,t),e.tabLockManaged&&!e.isTabLockOwner){const u=Date.now();u-(Mt._lastStandby||0)>=3e3&&(r.reloadStateFromStorage?.(),Mt._lastStandby=u)}const n=r.getSyncedEnergy(e);n&&(e.currentEnergy=n.current,e.maxEnergy=n.max);const l=ye(e,t);if(e.currentEnergy<l){const u=e.regenRate||1,P=Math.max(1,(l-e.currentEnergy)/u)*6e4;if(!e.nextWorkTimestamp)e.nextWorkTimestamp=Date.now()+P;else if(e.nextWorkTimestamp>Date.now())if(e.serverCooldownUntil&&Date.now()<e.serverCooldownUntil)e.nextWorkTimestamp=Math.max(e.nextWorkTimestamp,e.serverCooldownUntil);else{const q=e.nextWorkTimestamp-Date.now();Math.abs(q-P)>12e4&&(e.nextWorkTimestamp=Date.now()+P)}}else e.running&&e.isTabLockOwner&&!e.workInFlight&&!e.workResultUncertain&&(e.serverCooldownUntil&&Date.now()<e.serverCooldownUntil?e.nextWorkTimestamp=Math.max(e.nextWorkTimestamp||0,e.serverCooldownUntil):(!e.nextWorkTimestamp||Date.now()>=e.nextWorkTimestamp)&&(e.nextWorkTimestamp=Date.now(),r.wakePendingWork?.()));const c=r.getPlayerLevel(e);if(c!==e.playerLevel&&(e.playerLevel=c,!n)){const u=s(c);u!==e.maxEnergy&&(e.maxEnergy=u)}if(e.maxEnergy>0&&e.currentEnergy>=e.maxEnergy?t.energyFullAlertEnabled&&!e.energyFullAlertActive&&(e.energyFullAlertActive=!0,(!e.tabLockManaged||e.isTabLockOwner)&&(r.log(`Energi penuh (${e.currentEnergy}/${e.maxEnergy})! Mengeksekusi shift...`,"warn"),r.playEnergyFullAlarm?.(t),r.sendNotification?.(t,"Energi Penuh",`Energi ${e.currentEnergy}/${e.maxEnergy}. Siap bekerja.`)),e.running&&e.isTabLockOwner&&!e.workInFlight&&!e.workResultUncertain&&(!e.nextWorkTimestamp||Date.now()>=e.nextWorkTimestamp)&&(e.nextWorkTimestamp=Date.now(),r.wakePendingWork?.())):e.energyFullAlertActive=!1,r.getRegionDetails){const u=r.getRegionDetails();if(u){if(u.name&&u.name!==e.regionName&&(e.regionName=u.name),u.bonusPercent!==e.regionHealthBonusPercent&&(e.regionHealthBonusPercent=u.bonusPercent),u.bonusMultiplier&&Math.abs(u.bonusMultiplier-(e.regenRate||1))>.01&&(e.regenRate=u.bonusMultiplier,e.currentEnergy<t.energyThreshold)){const P=Math.max(1,(t.energyThreshold-e.currentEnergy)/e.regenRate)*6e4;e.nextWorkTimestamp=Date.now()+P}R("aw-region-name",P=>P.textContent=e.regionName||"Wilayah"),R("aw-region-buff",P=>{P.textContent=e.regionHealthBonusPercent>0?`+${e.regionHealthBonusPercent}% Regen`:"Normal (1.0x)"})}}const g=typeof document<"u"&&document.hidden;if(t.ecoModeEnabled!==!1&&g){(!e.tabLockManaged||e.isTabLockOwner)&&N(e,t);return}const y=ye(e,t),m=e.currentEnergy>=y&&(!e.serverCooldownUntil||Date.now()>=e.serverCooldownUntil),x=document.getElementById("aw-panel"),B=document.getElementById("aw-pill-container");x&&(m&&e.running&&!e.workInFlight?(x.classList.add("aw-ready-glow"),B&&B.classList.add("aw-ready-glow")):(x.classList.remove("aw-ready-glow"),B&&B.classList.remove("aw-ready-glow")));const D=C()&&!e.hasInitialDomEnergyRead&&(!e.currentEnergy||e.currentEnergy<=0),S=e.maxEnergy&&e.maxEnergy>0?e.maxEnergy:110,E=Math.max(0,Math.min(100,e.currentEnergy/S*100));R("aw-energy-text",u=>u.textContent=D?"Sinkronisasi...":`${e.currentEnergy}/${e.maxEnergy}`),R("aw-energy-pct",u=>u.textContent=D?"(0%)":`(${Math.round(E)}%)`),R("aw-energy-bar",u=>u.style.width=D?"0%":`${E}%`);const M=D?"Sinkronisasi...":wt(e,t);R("aw-next-work",u=>{if(u.textContent=M,u.style.color=m?"#00ff88":"#00d9ff",e.nextWorkTimestamp&&e.nextWorkTimestamp>Date.now()){const P=new Date(e.nextWorkTimestamp),q=String(P.getHours()).padStart(2,"0"),K=String(P.getMinutes()).padStart(2,"0");u.title=`Shift berikutnya diperkirakan pukul ${q}:${K} WIB`}else u.title="Energi target tercapai. Siap bekerja."}),R("aw-full-energy",u=>u.textContent=D?"Sinkronisasi...":xt(e)),R("aw-pill-energy",u=>u.textContent=D?"...":`${e.currentEnergy}/${e.maxEnergy}`),R("aw-pill-countdown",u=>{u.textContent=D?"Sinkronisasi...":m?"Siap":M,u.style.color=m?"#00ff88":"#00d9ff"}),R("aw-pill-countdown-icon",u=>{u.innerHTML=m?$.zap:$.clock}),R("aw-pill-status-dot",u=>{const P=e.workResultUncertain?"#ffaa00":e.running?"#10b981":"#f43f5e";u.style.background=P,u.style.boxShadow=`0 0 8px ${P}`,u.className=e.running?"status-dot-active":""});const L=new Date,I=String(L.getUTCHours()).padStart(2,"0"),U=String(L.getUTCMinutes()).padStart(2,"0"),W=String(L.getUTCSeconds()).padStart(2,"0"),T=`${I}:${U}:${W} UTC`,z=(23-L.getUTCHours())*60+(59-L.getUTCMinutes()),V=Math.floor(z/60),Z=z%60,b=`Reset: ${V}j ${Z}m`,w=De(t);R("aw-utc-time",u=>u.textContent=T),R("aw-flush-badge",u=>{u.style.display=w?"inline-block":"none"}),R("aw-utc-reset",u=>{u.textContent=b,u.title=`Reset harian server (jatah 10 slot makanan harian & bonus) terjadi pukul 00:00 UTC (${V} jam ${Z} menit lagi)`}),R("aw-circuit-breaker-banner",u=>{e.circuitBreakerActive?(u.style.display="block",u.textContent=`Pemeriksaan keamanan aktif (${e.circuitBreakerReason||"Cloudflare/Maintenance"}). Worker dijeda.`):u.style.display="none"});const A=t.maxFoodDaily||e.maxFoodDaily||10,j=Math.max(0,Math.min(A,e.foodEatenToday||0)),H=Math.max(0,A-j);R("aw-food-slot-text",u=>{u.textContent=`${j}/${A}`}),R("aw-food-reminder",u=>{H===0?(u.textContent="Kuota habis",u.style.color="#10b981",u.style.background="rgba(16, 185, 129, 0.15)",u.style.borderColor="rgba(16, 185, 129, 0.3)"):z<=240&&t.foodResetReminderEnabled!==!1?(u.textContent=`Sisa ${H}!`,u.style.color="#f59e0b",u.style.background="rgba(245, 158, 11, 0.15)",u.style.borderColor="rgba(245, 158, 11, 0.3)"):(u.textContent=`${H} sisa`,u.style.color="#94a3b8",u.style.background="rgba(148, 163, 184, 0.12)",u.style.borderColor="rgba(148, 163, 184, 0.2)")}),R("aw-pill-container",u=>{const P=e.workResultUncertain?"Hasil kerja belum pasti":e.running?"Sedang Berjalan":"Dijeda",q=w?" • [JAM EMAS UTC]":"";u.title=`Auto Worker: ${P}${q}
Energi: ${e.currentEnergy}/${e.maxEnergy}
Giliran: ${M}
Waktu Server: ${T} (${b})
Makanan: ${j}/${A} slot

(Seret untuk geser • Klik 2x untuk perbesar)`}),R("aw-next-wrap",u=>{if(m)u.title=`Energi saat ini (${e.currentEnergy} EN) sudah mencapai target shift (≥ ${y} EN). Siap bekerja.`;else if(e.nextWorkTimestamp&&e.nextWorkTimestamp>Date.now()){const q=new Date(e.nextWorkTimestamp).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"});u.title=`Estimasi mencapai target shift (≥ ${y} EN): pk. ${q} WIB`}else u.title="Menunggu energi pulih menuju target shift..."}),R("aw-full-wrap",u=>{const P=(e.maxEnergy||115)-(e.currentEnergy||0);if(P<=0)u.title="Energi sudah 100% penuh.";else{const q=e.regenRate||1,K=Math.round(P/q*6e4),d=new Date(Date.now()+K).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}),h=Pt(),k=h?` | Sesuai game: Penuh dalam ${h}`:"";u.title=`Estimasi energi 100% penuh: pk. ${d} WIB (~${Math.round(P/q)} mnt @ ${q} EN/mnt)${k}`}}),R("aw-mode-title",u=>{u.textContent=e.running?"Auto Kerja: AKTIF":"Auto Kerja: DIJEDA",u.style.color=e.running?"#00ff88":"#ff7777"}),R("aw-mode-title-badge",u=>{u.textContent=e.running?"Auto Kerja: AKTIF":"Auto Kerja: DIJEDA",u.style.background=e.running?"rgba(16, 185, 129, 0.15)":"rgba(244, 63, 94, 0.15)",u.style.borderColor=e.running?"rgba(16, 185, 129, 0.3)":"rgba(244, 63, 94, 0.3)",u.style.color=e.running?"#34d399":"#f43f5e"}),R("aw-mode-icon",u=>{u.innerHTML=e.running?$.zap:$.pause,u.style.color=e.running?"#00ff88":"#ff7777"}),R("aw-target-threshold",u=>{u.textContent=String(t.energyThreshold||10)}),R("aw-shift-countdown",u=>{u.textContent=m?"Siap Kerja":M,u.style.color=m?"#00ff88":"#00d9ff"}),C()?(Pe(e),be(e,t)):St(e);const Y=pa(e,t),ee=(t.trainStrengthEnabled!==!1?1:0)+(t.trainEducationEnabled!==!1?1:0)+(t.trainEconomyEnabled!==!1?1:0);R("aw-train-count-badge",u=>{t.autoTrainEnabled?ee===0?(u.textContent="0/3 Aktif",u.style.background="rgba(244, 63, 94, 0.15)",u.style.color="#fda4af",u.style.borderColor="rgba(244, 63, 94, 0.3)"):(u.textContent=`${ee}/3 Aktif`,u.style.background="rgba(244, 63, 94, 0.15)",u.style.color="#fda4af",u.style.borderColor="rgba(244, 63, 94, 0.3)"):(u.textContent="Nonaktif",u.style.background="rgba(255, 255, 255, 0.05)",u.style.color="#94a3b8",u.style.borderColor="rgba(255, 255, 255, 0.1)")}),R("aw-training-body",u=>{u.className=t.autoTrainEnabled?"expanded":"collapsed"}),R("aw-pill-str",u=>{u.classList.toggle("dimmed",t.trainStrengthEnabled===!1),u.title=t.trainStrengthEnabled===!1?"Kekuatan (STR) dilewati. Klik untuk mengaktifkan.":"Kekuatan (STR) aktif. Klik untuk melewati."}),R("aw-pill-edu",u=>{u.classList.toggle("dimmed",t.trainEducationEnabled===!1),u.title=t.trainEducationEnabled===!1?"Pendidikan (EDU) dilewati. Klik untuk mengaktifkan.":"Pendidikan (EDU) aktif. Klik untuk melewati."}),R("aw-pill-eko",u=>{u.classList.toggle("dimmed",t.trainEconomyEnabled===!1),u.title=t.trainEconomyEnabled===!1?"Ekonomi (EKO) dilewati. Klik untuk mengaktifkan.":"Ekonomi (EKO) aktif. Klik untuk melewati."}),R("aw-train-str-val",u=>u.textContent=String(e.trainingStats?.strength??"--")),R("aw-train-edu-val",u=>u.textContent=String(e.trainingStats?.education??"--")),R("aw-train-eko-val",u=>u.textContent=String(e.trainingStats?.economy??"--")),R("aw-train-focus-label",u=>{const P=document.getElementById("aw-train-focus-text")||u,q=document.getElementById("aw-train-target-icon");let K="#fda4af";if(!t.autoTrainEnabled)P.textContent="Auto Latihan Nonaktif",u.style.color="#64748b",K="#64748b";else if(ee===0)P.textContent="Semua stat nonaktif (Pilih di kartu)",u.style.color="#f59e0b",K="#f59e0b";else if(e.activeTraining?.stat){const p={strength:"Kekuatan",education:"Pendidikan",economy:"Ekonomi"},d={strength:"#f43f5e",education:"#38bdf8",economy:"#10b981"},h=p[e.activeTraining.stat]||e.activeTraining.stat,k=e.activeTraining.targetLevel?` Lv ${e.activeTraining.targetLevel}`:"";P.textContent=`Fokus: ${h}${k}`,K=d[e.activeTraining.stat]||"#f43f5e",u.style.color=K}else if(Y.timerText==="MAX"){if(ee===1){const p=t.trainStrengthEnabled!==!1?"Kekuatan":t.trainEducationEnabled!==!1?"Pendidikan":"Ekonomi",d=t.trainStrengthEnabled!==!1?t.targetStrength||100:t.trainEducationEnabled!==!1?t.targetEducation||100:t.targetEconomy||100;P.textContent=`Target ${p} Lv ${d} Tercapai!`}else P.textContent="Semua Target Tercapai (MAX)";u.style.color="#34d399",K="#34d399"}else ee===1?t.trainStrengthEnabled!==!1?(P.textContent=`Fokus: Kekuatan Lv ${t.targetStrength||83}`,u.style.color="#fda4af",K="#f43f5e"):t.trainEducationEnabled!==!1?(P.textContent=`Fokus: Pendidikan Lv ${t.targetEducation||100}`,u.style.color="#7dd3fc",K="#38bdf8"):(P.textContent=`Fokus: Ekonomi Lv ${t.targetEconomy||100}`,u.style.color="#6ee7b7",K="#10b981"):(P.textContent=`Rotasi Multi-Stat (${ee} Stat Aktif)`,u.style.color="#38bdf8",K="#38bdf8");q&&(q.style.color=K)}),R("aw-train-timer-text",u=>{u.textContent=Y.timerText,u.style.color=Y.isActive?"#ffffff":Y.timerText==="MAX"?"#34d399":t.autoTrainEnabled?"#38bdf8":"#64748b"}),R("aw-train-progress-bar",u=>{if(!e.activeTraining?.endsAt)u.style.width="0%";else{const P=la(e.activeTraining,e.trainingStats);u.style.width=`${P}%`}}),R("aw-train-badge-dot",u=>{u.style.background=t.autoTrainEnabled?"#10b981":"#64748b",u.style.boxShadow=t.autoTrainEnabled?"0 0 6px #10b981":"none"}),R("aw-train-badge-text",u=>{u.textContent=t.autoTrainEnabled?"AKTIF":"• OFF"}),R("aw-training-toggle-badge",u=>{t.autoTrainEnabled?(u.className="btn-cyber",u.style.background="rgba(16, 185, 129, 0.2)",u.style.color="#34d399",u.style.borderColor="rgba(16, 185, 129, 0.4)"):(u.className="btn-cyber badge-train-off",u.style.background="",u.style.color="",u.style.borderColor="")}),R("aw-token-status",u=>{!!(e.tokenExpired||e.pausedForToken||e.tokenExpiry&&Number(e.tokenExpiry)<=Date.now())?(u.textContent="EXPIRED",u.style.color="#ff4444"):e.currentToken?(u.textContent="VALID",u.style.color="#00ff88"):(u.textContent="NOT FOUND",u.style.color="#ffaa00")}),R("aw-token-expiry",u=>u.textContent=Jn(e)),R("aw-uncertain-banner",u=>u.style.display=e.workResultUncertain?"block":"none"),R("aw-reconciliation-status",u=>{u.textContent=e.uncertainReconciliation==="energy_changed"?"Status rekonsiliasi: perubahan energi terdeteksi; konfirmasi manual tetap diperlukan.":"Status rekonsiliasi: menunggu pembacaan energi."});const te=e.workResultUncertain||e.tabLockManaged&&!e.isTabLockOwner;R("aw-work-now",u=>u.disabled=te),R("aw-toggle",u=>u.disabled=te),R("aw-pill-toggle",u=>u.disabled=te),(!e.tabLockManaged||e.isTabLockOwner||C())&&(e.hasInitialDomEnergyRead||e.currentEnergy>0||e.postShiftEnergy===0)&&N(e,t)}function he(e){R("aw-toggle-text",t=>t.textContent=e?"Jeda Bot":"Lanjutkan"),R("aw-toggle-icon",t=>t.innerHTML=e?$.pause:$.play),R("aw-toggle",t=>{t.style.background=e?"rgba(244, 63, 94, 0.2)":"rgba(16, 185, 129, 0.2)",t.style.borderColor=e?"rgba(244, 63, 94, 0.45)":"rgba(16, 185, 129, 0.45)",t.style.color=e?"#fda4af":"#6ee7b7"}),R("aw-status-dot",t=>{t.className=e?"status-dot-active":"",t.style.background=e?"#10b981":"#f43f5e"}),R("aw-mode-title-badge",t=>{t.textContent=e?"Auto Kerja: AKTIF":"Auto Kerja: DIJEDA",t.style.background=e?"rgba(16, 185, 129, 0.15)":"rgba(244, 63, 94, 0.15)",t.style.borderColor=e?"rgba(16, 185, 129, 0.3)":"rgba(244, 63, 94, 0.3)",t.style.color=e?"#34d399":"#f43f5e"}),R("aw-pill-toggle",t=>{t.innerHTML=e?$.pause:$.play,t.title=e?"Jeda Worker":"Lanjutkan Worker",t.style.background=e?"rgba(244, 63, 94, 0.2)":"rgba(16, 185, 129, 0.2)",t.style.borderColor=e?"rgba(244, 63, 94, 0.4)":"rgba(16, 185, 129, 0.4)",t.style.color=e?"#fda4af":"#6ee7b7"}),R("aw-pill-status-dot",t=>{t.className=e?"status-dot-active":"",t.style.background=e?"#10b981":"#f43f5e"})}function tn(e,t){const a=document.getElementById("aw-panel");if(!a)return;const r=a.style.display!=="none";e.panelVisible=!r,e.userManuallyToggledPanel=!0,a.style.display=e.panelVisible?"block":"none",v("panelVisible",e.panelVisible.toString()),e.panelVisible?vt("Panel Auto Worker Aktif","Panel in-game berhasil dimunculkan kembali."):vt("Panel Auto Worker Disembunyikan","Tekan "+(t?.shortcuts?.showHide?.display||"Ctrl+Shift+A")+" atau buka Pengaturan ("+(t?.shortcuts?.openSettings?.display||"Ctrl+Shift+S")+") untuk memunculkan kembali.")}function R(e,t){const a=document.getElementById(e);a&&t(a)}function Te(e,t){e.panelMinimized=!!t,v("panelMinimized",e.panelMinimized.toString());const a=document.getElementById("aw-panel"),r=document.getElementById("aw-full-container"),o=document.getElementById("aw-pill-container"),i=document.getElementById("aw-minimize");if(a)if(e.panelVisible=!0,e.userManuallyToggledPanel=!1,v("panelVisible","true"),a.style.display="block",e.panelMinimized){r&&(r.style.display="none"),o&&(o.style.display="flex"),a.style.width="auto",a.style.minWidth="0",a.style.maxWidth="none",a.style.background="transparent",a.style.backdropFilter="none",a.style.webkitBackdropFilter="none",a.style.border="none",a.style.boxShadow="none",a.style.borderRadius="999px",a.style.padding="0",a.style.overflow="visible";const s=Math.max(10,window.innerWidth-300),n=Math.max(10,window.innerHeight-46);(e.panelX>s||e.panelX<10)&&(e.panelX=Math.max(10,Math.min(e.panelX||10,s)),a.style.left=e.panelX+"px",v("panelX",e.panelX.toString())),(e.panelY>n||e.panelY<10)&&(e.panelY=Math.max(10,Math.min(e.panelY||10,n)),a.style.top=e.panelY+"px",v("panelY",e.panelY.toString())),i&&(i.innerHTML=$.expand,i.title="Perbesar Panel")}else{const s=Math.max(10,window.innerWidth-376),n=Math.max(10,window.innerHeight-100);e.panelX>s&&s>0&&(e.panelX=Math.max(10,s),a.style.left=e.panelX+"px",v("panelX",e.panelX.toString())),e.panelY>n&&n>0&&(e.panelY=Math.max(10,n),a.style.top=e.panelY+"px",v("panelY",e.panelY.toString())),r&&(r.style.display="flex"),o&&(o.style.display="none"),a.style.width="356px",a.style.minWidth="356px",a.style.maxWidth="356px",a.style.background="transparent",a.style.backdropFilter="none",a.style.webkitBackdropFilter="none",a.style.border="none",a.style.boxShadow="none",a.style.borderRadius="16px",a.style.padding="0",a.style.overflow="visible",i&&(i.innerHTML=$.shrink,i.title="Mode Ringkas (Pill)")}}function ba(e,t){const a=!!e.panelMinimized,r=t.panelPinned,o=e.running,i=e.maxEnergy&&e.maxEnergy>0?e.maxEnergy:110,s=Math.max(0,Math.min(100,Math.round((e.currentEnergy||0)/i*100)));return`
        <!-- Full Panel View (Argon Surface A - 356px Cyber Abyss Glass Shell) -->
        <div id="aw-full-container" class="paw-shell" style="
            display: ${a?"none":"flex"};
            flex-direction: column;
            gap: 10px;
            width: 356px;
            border-radius: 16px;
            padding: 14px;
            position: relative;
            overflow: hidden;
            box-sizing: border-box;
        ">
            <!-- Top Subtle Accent Cyan Glow Line -->
            <div style="position: absolute; top: 0; left: 24px; right: 24px; height: 1px; background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.6), transparent); pointer-events: none;"></div>

            <!-- 1. Header Bar -->
            <div id="aw-header" style="
                display: flex; align-items: center; justify-content: space-between;
                padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                cursor: ${r?"default":"move"}; user-select: none;
            ">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 28px; height: 28px; border-radius: 8px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); display: flex; align-items: center; justify-content: center; color: #38bdf8; flex-shrink: 0;">
                        ${$.robot}
                    </div>
                    <span style="font-size: 13px; font-weight: 700; letter-spacing: 0.6px; color: #ffffff; text-transform: uppercase;">AUTO WORKER</span>
                    <span id="aw-status-dot" class="${o?"status-dot-active":""}" style="
                        width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0;
                        background: ${o?"#10b981":"#f43f5e"};
                    "></span>
                </div>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <button id="aw-minimize" class="btn-cyber aw-header-btn" title="Mode Ringkas (Floating Pill)" style="
                        width: 28px; height: 28px; border-radius: 8px; background: rgba(30, 41, 59, 0.8);
                        border: 1px solid rgba(255, 255, 255, 0.1); color: #cbd5e1; display: flex;
                        align-items: center; justify-content: center; cursor: pointer;
                    ">${a?$.expand:$.shrink}</button>
                    <button id="aw-pin" class="btn-cyber aw-header-btn" title="${r?"Lepas Kunci (Unpin)":"Kunci Posisi (Pin)"}" style="
                        width: 28px; height: 28px; border-radius: 8px;
                        background: ${r?"rgba(56, 189, 248, 0.2)":"rgba(30, 41, 59, 0.8)"};
                        border: 1px solid ${r?"rgba(56, 189, 248, 0.4)":"rgba(255, 255, 255, 0.1)"};
                        color: ${r?"#38bdf8":"#cbd5e1"}; display: flex;
                        align-items: center; justify-content: center; cursor: pointer;
                    ">${r?$.lockClosed:$.lockOpen}</button>
                    <button id="aw-settings" class="btn-cyber aw-header-btn" title="Pengaturan" style="
                        width: 28px; height: 28px; border-radius: 8px; background: rgba(30, 41, 59, 0.8);
                        border: 1px solid rgba(255, 255, 255, 0.1); color: #cbd5e1; display: flex;
                        align-items: center; justify-content: center; cursor: pointer;
                    ">${$.settings}</button>
                    <button id="aw-hide" class="btn-cyber aw-header-btn" title="Sembunyikan (${t.shortcuts.showHide.display})" style="
                        width: 28px; height: 28px; border-radius: 8px; background: rgba(30, 41, 59, 0.8);
                        border: 1px solid rgba(255, 255, 255, 0.1); color: #cbd5e1; display: flex;
                        align-items: center; justify-content: center; cursor: pointer;
                    ">${$.close}</button>
                </div>
            </div>

            <!-- Banners -->
            <div id="aw-circuit-breaker-banner" style="display: ${e.circuitBreakerActive?"block":"none"}; padding: 8px 12px; background: rgba(244, 63, 94, 0.18); border: 1px solid rgba(244, 63, 94, 0.4); border-radius: 8px; color: #fca5a5; font-size: 11.5px; line-height: 1.4; text-align: center; font-weight: 600;">
                Pemeriksaan keamanan aktif (${e.circuitBreakerReason||"Cloudflare/Maintenance"}). Worker dijeda.
            </div>
            <div id="aw-uncertain-banner" style="display: ${e.workResultUncertain?"block":"none"}; padding: 9px 12px; background: rgba(244, 63, 94, 0.14); border: 1px solid rgba(244, 63, 94, 0.5); border-radius: 8px; color: #fecdd3; font-size: 11.5px; line-height: 1.4;">
                <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: #f43f5e; margin-bottom: 3px;">
                    <span style="display: flex; align-items: center;">${$.alert}</span> Hasil kerja belum pasti
                </div>
                <div>Periksa halaman game sebelum melanjutkan.</div>
                <div id="aw-reconciliation-status" style="margin-top: 3px; color: #fcd34d;">Status rekonsiliasi: menunggu pembacaan energi.</div>
                <button id="aw-confirm-uncertain" class="btn-cyber" style="margin-top: 6px; padding: 5px 9px; background: #991b1b; color: #fff; border: 1px solid #dc2626; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;">Saya sudah memeriksa, lanjutkan</button>
            </div>

            <!-- 2. Location & Buff + Server UTC Row (in 1 .paw-card) -->
            <div class="paw-card" style="padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                <!-- Location & Buff -->
                <div id="aw-region-badge" style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 7px; overflow: hidden;">
                        <span style="color: #38bdf8; display: flex; align-items: center; flex-shrink: 0;">${$.mapPin}</span>
                        <span style="color: #94a3b8; font-size: 11.5px;">Lokasi:</span>
                        <span id="aw-region-name" style="font-weight: 600; color: #ffffff; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${e.regionName||"Memuat wilayah..."}</span>
                    </div>
                    <span id="aw-region-buff" class="tabular-nums" style="
                        background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);
                        padding: 2px 7px; border-radius: 6px; font-weight: 600; font-size: 11px; white-space: nowrap;
                    ">${e.regionHealthBonusPercent?`+${e.regionHealthBonusPercent}% Regen`:"Normal (1.0x)"}</span>
                </div>

                <div style="height: 1px; background: rgba(255, 255, 255, 0.06);"></div>

                <!-- Server UTC & Reset -->
                <div id="aw-utc-bar" style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="color: #818cf8; display: flex; align-items: center; flex-shrink: 0;">${$.clock}</span>
                        <span id="aw-utc-time" class="tabular-nums" style="color: #e2e8f0; font-weight: 600; font-size: 12.5px;">00:00:00 UTC</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span id="aw-utc-reset" class="tabular-nums" style="font-size: 11.5px; color: #94a3b8;">Reset: --j --m</span>
                        <span id="aw-flush-badge" class="badge-flush-pulse tabular-nums" style="display: none; background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 4px; padding: 1px 6px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.3px;">FLUSH</span>
                    </div>
                </div>
            </div>

            <!-- 3. Food Tracker (Roti) -->
            <div id="aw-food-bar" class="paw-card" style="padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 28px; height: 28px; border-radius: 8px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.25); display: flex; align-items: center; justify-content: center; color: #f59e0b; flex-shrink: 0;">
                        ${$.utensils}
                    </div>
                    <div>
                        <div style="font-size: 11px; color: #94a3b8; font-weight: 500;">Kuota Roti Harian</div>
                        <div style="font-size: 10.5px; color: #64748b;">Sinkron Otomatis</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span id="aw-food-slot-text" class="tabular-nums" style="font-size: 13.5px; font-weight: 700; color: #ffffff;">${e.foodEatenToday||0}/${t.maxFoodDaily||10}</span>
                    <span id="aw-food-reminder" class="tabular-nums" style="font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 999px; background: ${(t.maxFoodDaily||10)-(e.foodEatenToday||0)===0?"rgba(16, 185, 129, 0.15)":"rgba(245, 158, 11, 0.15)"}; border: 1px solid ${(t.maxFoodDaily||10)-(e.foodEatenToday||0)===0?"rgba(16, 185, 129, 0.3)":"rgba(245, 158, 11, 0.3)"}; color: ${(t.maxFoodDaily||10)-(e.foodEatenToday||0)===0?"#10b981":"#fbbf24"};">${(t.maxFoodDaily||10)-(e.foodEatenToday||0)===0?"Kuota habis":`${(t.maxFoodDaily||10)-(e.foodEatenToday||0)} sisa`}</span>
                </div>
            </div>

            <!-- 4. Live Energy Card -->
            <div class="paw-card" style="padding: 12px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="color: #38bdf8; display: flex; align-items: center;">${$.zap}</span>
                        <span style="font-size: 11.5px; font-weight: 700; letter-spacing: 0.5px; color: #cbd5e1; text-transform: uppercase;">ENERGI</span>
                    </div>
                    <div style="display: flex; align-items: baseline; gap: 4px;">
                        <span id="aw-energy-text" class="tabular-nums" style="font-size: 19px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">${C()&&!e.hasInitialDomEnergyRead&&(!e.currentEnergy||e.currentEnergy<=0)?"Sinkronisasi...":`${e.currentEnergy}/${e.maxEnergy}`}</span>
                        <span id="aw-energy-pct" class="tabular-nums" style="font-size: 12px; color: #38bdf8; font-family: 'JetBrains Mono', monospace;">(${s}%)</span>
                    </div>
                </div>
                <div style="width: 100%; height: 9px; border-radius: 999px; background: rgba(10, 14, 26, 0.95); border: 1px solid rgba(255, 255, 255, 0.1); overflow: hidden; padding: 1px; box-sizing: border-box;">
                    <div id="aw-energy-bar" class="energy-progress-fill" style="height: 100%; width: ${s}%;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: #94a3b8; padding-top: 1px;">
                    <span id="aw-next-wrap" style="cursor: help;">Next: <span id="aw-next-work" class="tabular-nums" style="color: #38bdf8; font-weight: 600;">Now</span></span>
                    <span id="aw-full-wrap" style="cursor: help;">Full: <span id="aw-full-energy" class="tabular-nums" style="color: #cbd5e1; font-weight: 600;">${xt(e)}</span></span>
                </div>
            </div>

            <!-- 5. Focused Auto Work Status Card -->
            <div class="paw-card rounded-xl" style="padding: 11px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <span id="aw-mode-title-badge" style="width: fit-content; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; background: ${o?"rgba(16, 185, 129, 0.15)":"rgba(244, 63, 94, 0.15)"}; border: 1px solid ${o?"rgba(16, 185, 129, 0.3)":"rgba(244, 63, 94, 0.3)"}; color: ${o?"#34d399":"#f43f5e"};">
                        ${o?"Auto Kerja: AKTIF":"Auto Kerja: DIJEDA"}
                    </span>
                    <div style="font-size: 11.5px; color: #94a3b8; display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                        <span>Target Ambang:</span>
                        <span class="tabular-nums" style="padding: 1px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; font-weight: 600;">≥ <span id="aw-target-threshold">${t.energyThreshold||10}</span> EN</span>
                    </div>
                </div>
                <div class="paw-well" style="padding: 6px 12px; border-radius: 10px; text-align: right;">
                    <div style="font-size: 11px; color: #94a3b8;">Hitung Mundur</div>
                    <div id="aw-shift-countdown" class="tabular-nums" style="font-size: 17px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">${C()&&!e.hasInitialDomEnergyRead&&(!e.currentEnergy||e.currentEnergy<=0)?"Sinkronisasi...":wt(e,t)}</div>
                </div>
            </div>

            <!-- 6. Latihan Stats Card -->
            <div id="aw-training-card" class="paw-card" style="padding: 11px 12px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; min-height: 28px;">
                    <div style="display: flex; align-items: center; gap: 7px;">
                        <span style="color: #818cf8; display: flex; align-items: center;">${$.dumbbell}</span>
                        <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.5px; color: #cbd5e1; text-transform: uppercase;">LATIHAN STATS</span>
                        <span id="aw-train-count-badge" class="tabular-nums" style="font-size: 11px; font-weight: 600; padding: 1.5px 7px; border-radius: 4px; background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.3); color: #fda4af;">${t.autoTrainEnabled?`${(t.trainStrengthEnabled!==!1?1:0)+(t.trainEducationEnabled!==!1?1:0)+(t.trainEconomyEnabled!==!1?1:0)}/3 Aktif`:"Nonaktif"}</span>
                    </div>
                    <button id="aw-training-toggle-badge" type="button" class="btn-cyber ${t.autoTrainEnabled?"":"badge-train-off"}" style="
                        font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px;
                        ${t.autoTrainEnabled?"background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);":""}
                        cursor: pointer; display: flex; align-items: center; gap: 5px;
                    " title="Aktifkan / Sembunyikan Latihan Stats">
                        <span id="aw-train-badge-dot" style="width: 6px; height: 6px; border-radius: 50%; background: ${t.autoTrainEnabled?"#10b981":"#64748b"}; display: inline-block;"></span>
                        <span id="aw-train-badge-text">${t.autoTrainEnabled?"AKTIF":"• OFF"}</span>
                    </button>
                </div>

                <!-- Collapsible Training Body -->
                <div id="aw-training-body" class="${t.autoTrainEnabled?"expanded":"collapsed"}">
                    <!-- 3 Mini Stat Pills (Interactive Click to toggle) -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-bottom: 8px;">
                        <div id="aw-pill-str" class="aw-mini-stat-pill pill-str ${t.trainStrengthEnabled!==!1?"":"dimmed"}" title="Klik untuk toggle latihan STR">
                            <span class="pill-lbl">STR</span>
                            <span id="aw-train-str-val" class="stat-val tabular-nums">${e.trainingStats?.strength||"--"}</span>
                        </div>
                        <div id="aw-pill-edu" class="aw-mini-stat-pill pill-edu ${t.trainEducationEnabled!==!1?"":"dimmed"}" title="Klik untuk toggle latihan EDU">
                            <span class="pill-lbl">EDU</span>
                            <span id="aw-train-edu-val" class="stat-val tabular-nums">${e.trainingStats?.education||"--"}</span>
                        </div>
                        <div id="aw-pill-eko" class="aw-mini-stat-pill pill-eko ${t.trainEconomyEnabled!==!1?"":"dimmed"}" title="Klik untuk toggle latihan EKO">
                            <span class="pill-lbl">EKO</span>
                            <span id="aw-train-eko-val" class="stat-val tabular-nums">${e.trainingStats?.economy||"--"}</span>
                        </div>
                    </div>

                    <!-- Focus Sub-well matching Gambar 2 -->
                    <div class="paw-well" style="padding: 8px 10px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px;">
                            <span id="aw-train-focus-label" style="font-weight: 600; color: #fda4af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; display: flex; align-items: center; gap: 6px;">
                                <span id="aw-train-target-icon" style="display: flex; align-items: center; color: #f43f5e; flex-shrink: 0;">${$.target}</span>
                                <span id="aw-train-focus-text">Fokus: Kekuatan Lv ${t.targetStrength||83}</span>
                            </span>
                            <span id="aw-train-timer-text" class="tabular-nums" style="font-weight: 700; color: #ffffff; white-space: nowrap;">1j 13m</span>
                        </div>
                        <div style="width: 100%; height: 6px; border-radius: 999px; background: rgba(10, 14, 26, 0.95); overflow: hidden;">
                            <div id="aw-train-progress-bar" class="stat-progress-fill" style="height: 100%; width: 64%; border-radius: 999px; transition: width 0.35s ease;"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 7. Sesi Auth Row -->
            <div class="paw-card" style="padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 7px;">
                    <span style="color: #10b981; display: flex; align-items: center;">${$.shield}</span>
                    <span style="color: #94a3b8; font-size: 12px;">Sesi Token Auth:</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span id="aw-token-status" style="font-weight: 700; color: #34d399; font-size: 11.5px; padding: 1.5px 7px; border-radius: 4px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3);">VALID</span>
                    <span id="aw-token-expiry" class="tabular-nums" style="font-size: 12.5px; color: #e2e8f0; font-weight: 600;">--</span>
                </div>
            </div>

            <!-- 8. 3 Action Buttons (Gambar 3) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding-top: 2px;">
                <button id="aw-work-now" class="btn-cyber aw-btn-action" style="
                    background: linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%);
                    color: #020617; border: 1px solid rgba(56, 189, 248, 0.5);
                    padding: 9px 0; border-radius: 12px; cursor: pointer;
                    font-weight: 700; font-size: 12px; box-shadow: 0 0 14px rgba(56, 189, 248, 0.35);
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                ">
                    ${$.zap}
                    <span>Kerja</span>
                </button>
                <button id="aw-toggle" class="btn-cyber aw-btn-action" style="
                    background: ${o?"rgba(244, 63, 94, 0.2)":"rgba(16, 185, 129, 0.2)"};
                    color: ${o?"#fda4af":"#6ee7b7"};
                    border: 1px solid ${o?"rgba(244, 63, 94, 0.45)":"rgba(16, 185, 129, 0.45)"};
                    padding: 9px 0; border-radius: 12px; cursor: pointer;
                    font-weight: 600; font-size: 12px;
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                ">
                    <span id="aw-toggle-icon" style="display: flex; align-items: center;">${o?$.pause:$.play}</span>
                    <span id="aw-toggle-text">${o?"Jeda Bot":"Lanjutkan"}</span>
                </button>
                <button id="aw-logs" class="btn-cyber aw-btn-action" style="
                    background: rgba(30, 41, 59, 0.9);
                    color: #e2e8f0; border: 1px solid rgba(255, 255, 255, 0.12);
                    padding: 9px 0; border-radius: 12px; cursor: pointer;
                    font-weight: 600; font-size: 12px;
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                ">
                    <span style="display: flex; align-items: center; color: #94a3b8;">${$.terminal}</span>
                    <span>Log Bot</span>
                </button>
            </div>
        </div>

        <!-- Mode Ringkas: Floating Pill Capsule (Height: 36px) -->
        <div id="aw-pill-container" class="paw-shell aw-pill-box" style="
            display: ${a?"flex":"none"};
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            height: 36px;
            padding: 0 10px;
            border-radius: 999px;
            border: 1px solid rgba(56, 189, 248, 0.25);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.65);
            cursor: ${r?"default":"move"};
            box-sizing: border-box;
            white-space: nowrap;
        " title="Auto Worker • Seret untuk pindah • Klik 2x untuk perbesar">
            <div style="display: flex; align-items: center; gap: 7px; flex-shrink: 0;">
                <span style="color: #38bdf8; display: flex; align-items: center;">${$.robot}</span>
                <span id="aw-pill-status-dot" class="${o?"status-dot-active":""}" style="
                    width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0;
                    background: ${o?"#10b981":"#f43f5e"};
                "></span>
            </div>

            <!-- Energy Badge -->
            <div id="aw-pill-energy-badge" class="tabular-nums" style="
                display: flex; align-items: center; gap: 4px;
                background: rgba(56, 189, 248, 0.15);
                border: 1px solid rgba(56, 189, 248, 0.25);
                border-radius: 999px;
                padding: 2px 8px;
                font-size: 12px;
                font-weight: 600;
                color: #7dd3fc;
                flex-shrink: 0;
            " title="Energi Saat Ini">
                <span style="display: flex; align-items: center; color: #38bdf8;">${$.zap}</span>
                <span id="aw-pill-energy">${e.currentEnergy||0}/${e.maxEnergy||110}</span>
            </div>

            <!-- Countdown Badge -->
            <div id="aw-pill-countdown-badge" class="tabular-nums" style="
                display: flex; align-items: center; gap: 4px;
                background: rgba(30, 41, 59, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 999px;
                padding: 2px 8px;
                font-size: 12px;
                font-weight: 500;
                color: #e2e8f0;
                flex-shrink: 0;
            " title="Countdown Giliran Kerja">
                <span id="aw-pill-countdown-icon" style="display: flex; align-items: center; color: #818cf8;">${$.clock}</span>
                <span id="aw-pill-countdown">Memuat...</span>
            </div>

            <!-- Mini Actions -->
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                <button id="aw-pill-toggle" class="btn-cyber aw-pill-btn" style="
                    width: 24px; height: 24px; border-radius: 50%;
                    background: ${o?"rgba(244, 63, 94, 0.2)":"rgba(16, 185, 129, 0.2)"};
                    border: 1px solid ${o?"rgba(244, 63, 94, 0.4)":"rgba(16, 185, 129, 0.4)"};
                    color: ${o?"#fda4af":"#6ee7b7"}; font-size: 9.5px; font-weight: 700;
                    display: flex; align-items: center; justify-content: center; cursor: pointer;
                " title="${o?"Jeda Worker":"Lanjutkan Worker"}">${o?$.pause:$.play}</button>

                <button id="aw-pill-expand" class="btn-cyber aw-pill-btn" style="
                    width: 24px; height: 24px; border-radius: 50%;
                    background: rgba(30, 41, 59, 0.9);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: #cbd5e1; display: flex; align-items: center; justify-content: center; cursor: pointer;
                " title="Perbesar ke Mode Penuh">${$.expand}</button>
            </div>
        </div>
    `}function ha(e,t,a){let r=!1,o=0,i=0,s=0,n=0;const l=g=>{a.panelPinned||g.target.closest("button")||(r=!0,o=g.clientX,i=g.clientY,s=t.panelX,n=t.panelY,g.preventDefault())},c=document.getElementById("aw-header"),f=document.getElementById("aw-pill-container");c&&c.addEventListener("mousedown",l),f&&f.addEventListener("mousedown",l),document.addEventListener("mousemove",g=>{if(!r)return;const y=t.panelMinimized?280:376,m=t.panelMinimized?40:300,x=Math.max(0,window.innerWidth-y),B=Math.max(0,window.innerHeight-m);t.panelX=Math.max(0,Math.min(s+g.clientX-o,x)),t.panelY=Math.max(0,Math.min(n+g.clientY-i,B)),e.style.left=t.panelX+"px",e.style.top=t.panelY+"px"}),document.addEventListener("mouseup",()=>{r&&(r=!1,v("panelX",t.panelX.toString()),v("panelY",t.panelY.toString()))})}function wa(e,t,a,r){const{openSettings:o,openLogViewer:i,doWork:s}=r,n=document.getElementById("aw-minimize"),l=document.getElementById("aw-pin"),c=document.getElementById("aw-hide"),f=document.getElementById("aw-toggle"),g=document.getElementById("aw-work-now"),y=document.getElementById("aw-logs"),m=document.getElementById("aw-settings"),x=document.getElementById("aw-confirm-uncertain"),B=document.getElementById("aw-pill-expand"),D=document.getElementById("aw-pill-toggle"),S=document.getElementById("aw-header"),E=document.getElementById("aw-pill-container");e.querySelectorAll(".aw-header-btn").forEach(T=>{T.addEventListener("mouseenter",()=>{T.style.background="rgba(255,255,255,0.12)",T.style.color="#fff"}),T.addEventListener("mouseleave",()=>{T.id==="aw-pin"&&a.panelPinned?(T.style.background="rgba(0, 136, 255, 0.2)",T.style.color="#00d9ff"):T.id==="aw-hide"?(T.style.background="transparent",T.style.color="#ff5252"):(T.style.background="transparent",T.style.color="#8892b0")})}),n?.addEventListener("click",()=>{Te(t,!t.panelMinimized),r.updatePanel?.()}),B?.addEventListener("click",()=>{Te(t,!1),r.updatePanel?.()}),S?.addEventListener("dblclick",T=>{T.target.closest("button")||(Te(t,!0),r.updatePanel?.())}),E?.addEventListener("dblclick",T=>{T.target.closest("button")||(Te(t,!1),r.updatePanel?.())}),l?.addEventListener("click",()=>{a.panelPinned=!a.panelPinned,r.saveConfig?.(a);const T=document.getElementById("aw-header"),z=document.getElementById("aw-pill-container");T&&(T.style.cursor=a.panelPinned?"default":"move"),z&&(z.style.cursor=a.panelPinned?"default":"move"),l&&(l.style.background=a.panelPinned?"rgba(0, 136, 255, 0.2)":"transparent",l.style.color=a.panelPinned?"#00d9ff":"#8892b0",l.style.border=a.panelPinned?"1px solid rgba(0, 136, 255, 0.4)":"none",l.title=a.panelPinned?"Unpin":"Pin")});function M(){if(!chrome?.runtime?.id){window.location.reload();return}t.running=!t.running,v("aw_worker_running",t.running.toString()),he(t.running),r.log(t.running?"Auto Worker dilanjutkan":"Auto Worker dijeda (Status disimpan)","info"),t.running&&r.wakePendingWork?.(),$e(t);const T=N(t,a,!0);r.updatePanel?.();try{chrome.storage.local.set({aw_live_status:T,aw_worker_running:t.running.toString()}),me({type:"TOGGLE_RUNNING",running:t.running,timestamp:Date.now()}),chrome.runtime.sendMessage({type:"POPUP_TO_TAB",action:"toggleRunning",value:t.running}).catch(()=>{})}catch{}}D?.addEventListener("click",M),m?.addEventListener("click",()=>r.openSettings?.()),c?.addEventListener("click",()=>tn(t,a)),f?.addEventListener("click",M),g?.addEventListener("click",()=>{if(!chrome?.runtime?.id){window.location.reload();return}r.log("Manual work triggered!","info"),r.doWork?.(!0)}),y?.addEventListener("click",()=>r.openLogViewer?.()),document.getElementById("aw-training-toggle-badge")?.addEventListener("click",T=>{T.stopPropagation(),a.autoTrainEnabled=!a.autoTrainEnabled,r.saveConfig?.(a),r.log?.(`Auto Latihan Stats ${a.autoTrainEnabled?"diaktifkan":"dinonaktifkan"}.`,"info"),r.updatePanel?.(),a.autoTrainEnabled&&r.executeAutoTrain?.()});const I=document.getElementById("aw-pill-str"),U=document.getElementById("aw-pill-edu"),W=document.getElementById("aw-pill-eko");I?.addEventListener("click",T=>{T.stopPropagation(),a.trainStrengthEnabled=a.trainStrengthEnabled===!1,r.saveConfig?.(a),r.log?.(`Target STR ${a.trainStrengthEnabled?"diaktifkan":"dilewati"}.`,"info"),r.updatePanel?.(),a.autoTrainEnabled&&r.executeAutoTrain?.()}),U?.addEventListener("click",T=>{T.stopPropagation(),a.trainEducationEnabled=a.trainEducationEnabled===!1,r.saveConfig?.(a),r.log?.(`Target EDU ${a.trainEducationEnabled?"diaktifkan":"dilewati"}.`,"info"),r.updatePanel?.(),a.autoTrainEnabled&&r.executeAutoTrain?.()}),W?.addEventListener("click",T=>{T.stopPropagation(),a.trainEconomyEnabled=a.trainEconomyEnabled===!1,r.saveConfig?.(a),r.log?.(`Target EKO ${a.trainEconomyEnabled?"diaktifkan":"dilewati"}.`,"info"),r.updatePanel?.(),a.autoTrainEnabled&&r.executeAutoTrain?.()}),x?.addEventListener("click",()=>{if(!t.workResultUncertain||!t.isTabLockOwner||!confirm("Pastikan sudah memeriksa halaman game. Lanjutkan worker?"))return;t.workResultUncertain=!1,t.uncertainReconciliation="none",r.uncertainEnergyBefore=null,v("aw_workResultUncertain","false"),v("aw_uncertainEnergyBefore",""),t.energySyncBase=null;const T=getCurrentEnergy();T&&(t.currentEnergy=T.current,t.maxEnergy=T.max),t.running=!0,v("aw_worker_running","true"),he(!0),r.log("Worker dilanjutkan setelah hasil timeout diperiksa manual.","warn"),r.updatePanel?.(),r.wakePendingWork?.()}),document.removeEventListener("keydown",e._keyHandler,!0),e._keyHandler=xa(t,a,r,M),document.addEventListener("keydown",e._keyHandler,!0)}function xa(e,t,a,r){return function(i){if(e.settingsOpen)return;const s=i.target;if(!(s?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(s?.tagName)))for(const[n,l]of Object.entries(t.shortcuts)){if(!l?.keys||l.keys.length===0)continue;const c=l.keys.includes("Control"),f=l.keys.includes("Shift"),g=l.keys.includes("Alt");if(!!i.ctrlKey!==c||!!i.shiftKey!==f||!!i.altKey!==g||i.metaKey)continue;const y=l.keys.filter(m=>m!=="Control"&&m!=="Shift"&&m!=="Alt");if(!(y.length>0&&!y.includes(i.code))){if(n==="pauseResume"&&e.tabLockManaged&&!e.isTabLockOwner)return;i.preventDefault(),i.stopPropagation(),n==="showHide"?tn(e,t):n==="workNow"?(a.log("Manual work!","info"),a.doWork?.(!0)):n==="pauseResume"?r():n==="openLog"?a.openLogViewer?.():n==="openSettings"&&a.openSettings?.();return}}}}function ka(e,t,a){a.panelFollowViewport&&window.addEventListener("resize",()=>{const r=window.innerWidth-e.offsetWidth-10,o=window.innerHeight-e.offsetHeight-10;(t.panelX>r||t.panelY>o)&&(a.panelReturnToOriginal?(t.panelX=t.originalPanelX,t.panelY=t.originalPanelY):(t.panelX=Math.max(0,Math.min(t.panelX,r)),t.panelY=Math.max(0,Math.min(t.panelY,o))),e.style.left=t.panelX+"px",e.style.top=t.panelY+"px")})}function va(){if(document.getElementById("aw-settings-styles"))return;const e=document.createElement("style");e.id="aw-settings-styles",e.textContent=`
        /* Modal & Container */
        #aw-settings-modal {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #e2e8f0;
        }

        /* Modern Tabs Navigation */
        .aw-tab-nav {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 6px;
            padding: 10px 16px;
            background: rgba(10, 14, 26, 0.85);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            box-sizing: border-box;
        }
        .aw-tab-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px 10px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 10px;
            color: #94a3b8;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            box-sizing: border-box;
        }
        .aw-tab-btn:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.15);
        }
        .aw-tab-btn.active {
            color: #38bdf8 !important;
            background: rgba(56, 189, 248, 0.2) !important;
            border-color: rgba(56, 189, 248, 0.45) !important;
            font-weight: 600 !important;
            box-shadow: 0 0 14px rgba(56, 189, 248, 0.25) !important;
        }

        /* Tab Content Animation */
        .aw-tab-pane {
            display: none;
            animation: awTabFade 0.22s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .aw-tab-pane.active {
            display: block;
        }
        @keyframes awTabFade {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Setting Cards */
        .aw-card {
            background: rgba(22, 27, 42, 0.55);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 10px;
            padding: 12px 14px;
            margin-bottom: 10px;
            transition: all 0.2s;
        }
        .aw-card:hover {
            border-color: rgba(255, 255, 255, 0.12);
            background: rgba(28, 35, 54, 0.65);
        }
        .aw-card-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 14px;
        }
        .aw-card-info {
            flex: 1;
            min-width: 0;
        }
        .aw-card-title {
            font-size: 13px;
            font-weight: 600;
            color: #f1f5f9;
            margin-bottom: 3px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .aw-card-desc {
            font-size: 11px;
            color: #8b9bb4;
            line-height: 1.45;
        }

        /* Modern iOS/Fluent Toggle Switch */
        .aw-switch {
            position: relative;
            display: inline-block;
            width: 44px;
            height: 24px;
            flex-shrink: 0;
            margin: 0;
            cursor: pointer;
        }
        .aw-switch input {
            opacity: 0;
            width: 0;
            height: 0;
            position: absolute;
        }
        .aw-switch .aw-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background: #1e2436;
            border: 1px solid #373f59;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 24px;
        }
        .aw-switch .aw-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 2px;
            bottom: 2px;
            background-color: #94a3b8;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        }
        .aw-switch input:checked + .aw-slider {
            background: linear-gradient(135deg, #00ff88, #00cc66);
            border-color: #00ff88;
            box-shadow: 0 0 12px rgba(0, 255, 136, 0.35);
        }
        .aw-switch input:checked + .aw-slider:before {
            transform: translateX(20px);
            background-color: #ffffff;
        }
        .aw-switch:hover .aw-slider {
            border-color: #505c80;
        }

        /* Range Slider & Inputs */
        .aw-range-slider {
            flex: 1;
            height: 6px;
            border-radius: 3px;
            background: #252c42;
            outline: none;
            accent-color: #00ff88;
            cursor: pointer;
        }
        .aw-num-badge {
            width: 58px;
            background: #141826;
            color: #00ff88;
            border: 1px solid #2e3752;
            border-radius: 6px;
            padding: 5px 6px;
            font-size: 13px;
            font-weight: 700;
            text-align: center;
            transition: border-color 0.2s;
        }
        .aw-num-badge:focus {
            border-color: #00ff88;
            outline: none;
            box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.2);
        }
        .aw-select-box {
            background: #141826;
            color: #00ff88;
            border: 1px solid #2e3752;
            border-radius: 6px;
            padding: 5px 10px;
            font-size: 12px;
            font-weight: 600;
            outline: none;
            cursor: pointer;
            transition: border-color 0.2s;
        }
        .aw-select-box:focus {
            border-color: #00ff88;
        }

        /* Quick Preset Chips */
        .aw-preset-btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #94a3b8;
            border-radius: 6px;
            padding: 3px 9px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s;
        }
        .aw-preset-btn:hover {
            background: rgba(0, 255, 136, 0.12);
            color: #00ff88;
            border-color: rgba(0, 255, 136, 0.4);
        }

        /* Custom Scrollbar */
        #aw-settings-content::-webkit-scrollbar {
            width: 6px;
        }
        #aw-settings-content::-webkit-scrollbar-track {
            background: transparent;
        }
        #aw-settings-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.14);
            border-radius: 4px;
        }
        #aw-settings-content::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.28);
        }

        /* Remove Number Spinner Arrows & Button Outlines */
        #aw-settings-modal input[type=number]::-webkit-inner-spin-button,
        #aw-settings-modal input[type=number]::-webkit-outer-spin-button {
            -webkit-appearance: none !important;
            margin: 0 !important;
        }
        #aw-settings-modal input[type=number] {
            -moz-appearance: textfield !important;
        }
        #aw-settings-modal button,
        #aw-settings-modal .aw-tab-btn,
        #aw-settings-modal .aw-switch {
            outline: none !important;
        }

        /* Stat Cards & Dimming System */
        .stat-card,
        .aw-stat-card {
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            user-select: none;
        }
        .stat-card.active.theme-str,
        .aw-stat-card.active.theme-str {
            border-color: rgba(244, 63, 94, 0.45);
            background: radial-gradient(circle at 50% 0%, rgba(244, 63, 94, 0.12) 0%, transparent 70%), rgba(22, 27, 42, 0.85);
            box-shadow: 0 8px 24px -6px rgba(244, 63, 94, 0.18), inset 0 1px 0 0 rgba(244, 63, 94, 0.25);
        }
        .stat-card.active.theme-edu,
        .aw-stat-card.active.theme-edu {
            border-color: rgba(56, 189, 248, 0.45);
            background: radial-gradient(circle at 50% 0%, rgba(56, 189, 248, 0.12) 0%, transparent 70%), rgba(22, 27, 42, 0.85);
            box-shadow: 0 8px 24px -6px rgba(56, 189, 248, 0.18), inset 0 1px 0 0 rgba(56, 189, 248, 0.25);
        }
        .stat-card.active.theme-eko,
        .aw-stat-card.active.theme-eko {
            border-color: rgba(16, 185, 129, 0.45);
            background: radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.12) 0%, transparent 70%), rgba(22, 27, 42, 0.85);
            box-shadow: 0 8px 24px -6px rgba(16, 185, 129, 0.18), inset 0 1px 0 0 rgba(16, 185, 129, 0.25);
        }
        .stat-card.dimmed,
        .aw-stat-card.dimmed {
            opacity: 0.42;
            filter: grayscale(65%);
            border-color: rgba(255, 255, 255, 0.06);
            background: rgba(13, 17, 28, 0.65);
            box-shadow: none;
        }
        .stat-card.dimmed:hover,
        .aw-stat-card.dimmed:hover {
            opacity: 0.62;
            filter: grayscale(35%);
            border-color: rgba(255, 255, 255, 0.14);
        }
        .stat-checkbox-box,
        .aw-stat-checkbox-box {
            width: 20px;
            height: 20px;
            border-radius: 6px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            cursor: pointer;
            flex-shrink: 0;
        }
        .stat-checkbox-box.checked-str,
        .aw-stat-checkbox-box.checked-str {
            background: #f43f5e;
            border: 1px solid #fda4af;
            color: #0f172a;
            box-shadow: 0 0 10px rgba(244, 63, 94, 0.5);
        }
        .stat-checkbox-box.checked-edu,
        .aw-stat-checkbox-box.checked-edu {
            background: #38bdf8;
            border: 1px solid #bae6fd;
            color: #0f172a;
            box-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
        }
        .stat-checkbox-box.checked-eko,
        .aw-stat-checkbox-box.checked-eko {
            background: #10b981;
            border: 1px solid #a7f3d0;
            color: #0f172a;
            box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
        }
        .stat-checkbox-box.unchecked,
        .aw-stat-checkbox-box.unchecked {
            background: #0f172a;
            border: 1px solid rgba(255, 255, 255, 0.25);
            color: transparent;
        }
        .stat-target-input {
            width: 62px;
            height: 30px;
            text-align: center;
            font-family: 'JetBrains Mono', monospace;
            font-variant-numeric: tabular-nums;
            font-weight: 700;
            font-size: 13px;
            border-radius: 6px;
            background: rgba(10, 14, 26, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #fff;
            transition: all 0.2s ease;
            box-sizing: border-box;
        }
        .paw-gold-input {
            width: 78px;
            height: 28px;
            text-align: right;
            padding: 2px 8px;
            font-family: 'JetBrains Mono', monospace;
            font-variant-numeric: tabular-nums;
            font-weight: 700;
            font-size: 13px;
            border-radius: 6px;
            background: rgba(10, 14, 26, 0.92);
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
            box-sizing: border-box;
        }
        .paw-gold-input:focus {
            outline: none;
            border-color: rgba(245, 158, 11, 0.75);
            box-shadow: 0 0 10px rgba(245, 158, 11, 0.25);
        }
        .paw-well {
            background: rgba(13, 18, 30, 0.72);
            border: 1px solid rgba(255, 255, 255, 0.06);
            box-sizing: border-box;
        }
        .paw-hotkey-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 80px;
            padding: 5px 12px;
            border-radius: 8px;
            background: #0b0f1a;
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #38bdf8;
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
            outline: none;
            user-select: none;
            box-sizing: border-box;
        }
        .paw-hotkey-btn:hover {
            border-color: #38bdf8;
            background: rgba(56, 189, 248, 0.12);
            color: #7dd3fc;
        }
        .paw-hotkey-btn.recording {
            border-color: #38bdf8 !important;
            background: rgba(56, 189, 248, 0.25) !important;
            color: #fff !important;
            box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
        }
        .paw-preset-chip {
            padding: 6px 0;
            border-radius: 8px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            font-weight: 600;
            text-align: center;
            cursor: pointer;
            transition: all 0.15s ease;
            user-select: none;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(30, 41, 59, 0.9);
            color: #cbd5e1;
            box-sizing: border-box;
        }
        .paw-preset-chip:hover {
            background: rgba(51, 65, 85, 0.9);
            color: #fff;
        }
        .paw-preset-chip.active {
            background: rgba(56, 189, 248, 0.25) !important;
            border-color: rgba(56, 189, 248, 0.5) !important;
            color: #38bdf8 !important;
            font-weight: 700 !important;
        }
        .aw-stepper-btn {
            width: 28px;
            height: 28px;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #f1f5f9;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s;
            user-select: none;
        }
        .aw-stepper-btn:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.25);
            color: #fff;
        }
        .aw-stepper-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }
    `,document.head.appendChild(e)}function Ea(e,t){va();const a=Vt(),r=document.getElementById("aw-settings-modal");r&&r.remove();const o=document.createElement("div");o.id="aw-settings-modal",o.style.cssText=`
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(4, 7, 14, 0.78);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 100001;
        justify-content: center;
        align-items: center;
    `;const i=[{id:"showHide",label:"Sembunyikan / Tampilkan Panel"},{id:"workNow",label:"Eksekusi Kerja Sekarang"},{id:"pauseResume",label:"Jeda / Lanjutkan Bot"},{id:"openLog",label:"Buka Log Aktivitas"},{id:"openSettings",label:"Buka Menu Pengaturan"}],s=i.map(b=>{const w=e.shortcuts[b.id]||{display:""};return`
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
                <span style="font-size: 12px; color: #cbd5e1;">${b.label}</span>
                <button type="button" id="record-${b.id}" class="paw-hotkey-btn" data-action="${b.id}">${w.display||"Klik untuk Set"}</button>
            </div>
        `}).join("");o.innerHTML=`
        <div style="
            background: linear-gradient(180deg, #131724 0%, #0d101a 100%);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            width: 95%;
            max-width: 650px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 1px 1px rgba(255,255,255,0.05);
            overflow: hidden;
            box-sizing: border-box;
        ">
            <!-- Modal Header -->
            <div style="
                padding: 16px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: rgba(15, 23, 42, 0.7);
            ">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="
                        width: 36px; height: 36px; border-radius: 10px;
                        background: rgba(56, 189, 248, 0.15);
                        border: 1px solid rgba(56, 189, 248, 0.35);
                        display: flex; align-items: center; justify-content: center;
                        color: #38bdf8;
                    ">${$.sliders}</div>
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 14px; letter-spacing: 0.6px; text-transform: uppercase;">PENGATURAN AUTO WORKER</div>
                        <div style="font-size: 11.5px; color: #94a3b8; margin-top: 2px;">Konfigurasi Otomasi, Kalkulator Emas &amp; Keamanan Bot</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="padding: 4px 10px; border-radius: 8px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399; font-size: 11.5px; font-weight: 600;">Auto-Save Aktif</span>
                    <button id="aw-close-settings" style="
                        background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; font-weight: 600; transition: all 0.15s;
                    ">Tutup</button>
                </div>
            </div>

            <!-- 5-Segmented Category Tabs matching Prototype -->
            <div class="aw-tab-nav">
                <button class="aw-tab-btn active" data-tab="tab-work">${$.zap} <span>Kerja</span></button>
                <button class="aw-tab-btn" data-tab="tab-training">${$.barChart} <span>Stats &amp; Emas</span></button>
                <button class="aw-tab-btn" data-tab="tab-stealth">${$.shield} <span>Stealth</span></button>
                <button class="aw-tab-btn" data-tab="tab-notif">${$.volume} <span>Suara</span></button>
                <button class="aw-tab-btn" data-tab="tab-ui">${$.keyboard} <span>Pintasan</span></button>
            </div>

            <!-- Scrollable Content Body -->
            <div id="aw-settings-content" style="
                padding: 16px 20px;
                overflow-x: hidden;
                overflow-y: auto;
                flex: 1;
                overscroll-behavior: contain;
                box-sizing: border-box;
            ">
                <!-- TAB 1: KERJA & ENERGI (Gambar 3) -->
                <div id="tab-work" class="aw-tab-pane active">
                    <!-- Ambang Batas Energi Kerja -->
                    <div class="aw-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <div>
                                <div class="aw-card-title">Ambang Batas Energi Kerja</div>
                                <div class="aw-card-desc">Bot mengeksekusi kerja saat energi mencapai batas ini</div>
                            </div>
                            <span id="slider-energy-readout" style="padding: 4px 10px; border-radius: 8px; background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; font-weight: 700; font-size: 13.5px; font-variant-numeric: tabular-nums;">${e.energyThreshold} EN</span>
                        </div>
                        <div style="margin: 10px 0 12px 0;">
                            <input type="range" id="setting-energy-threshold" min="10" max="210" step="5" value="${e.energyThreshold}" class="aw-range-slider" style="width: 100%;">
                        </div>
                        <!-- Preset Chips: 10, 20, 50, 100, Max (210) -->
                        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px;">
                            <button type="button" class="paw-preset-chip ${e.energyThreshold===10?"active":""}" data-val="10">10</button>
                            <button type="button" class="paw-preset-chip ${e.energyThreshold===20?"active":""}" data-val="20">20</button>
                            <button type="button" class="paw-preset-chip ${e.energyThreshold===50?"active":""}" data-val="50">50</button>
                            <button type="button" class="paw-preset-chip ${e.energyThreshold===100?"active":""}" data-val="100">100</button>
                            <button type="button" class="paw-preset-chip ${e.energyThreshold===210?"active":""}" data-val="210">Max (210)</button>
                        </div>
                    </div>

                    <!-- Kapasitas Kuota Roti Harian -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <div class="aw-card-title">Kapasitas Kuota Roti Harian</div>
                                    <span style="font-size: 10px; font-weight: 700; padding: 1.5px 6px; border-radius: 999px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35);">AUTO-SYNC</span>
                                </div>
                                <div id="aw-bread-cap-desc" class="aw-card-desc">Terbaca otomatis dari game: ${(e.maxFoodDaily??10)===20?"20 Slot (Akun Premium)":"10 Slot (Akun Standar)"}</div>
                            </div>
                            <div id="aw-bread-cap-badge" class="tabular-nums" style="padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; font-family: 'JetBrains Mono', monospace; background: ${(e.maxFoodDaily??10)===20?"rgba(245, 158, 11, 0.15)":"rgba(56, 189, 248, 0.15)"}; color: ${(e.maxFoodDaily??10)===20?"#fbbf24":"#38bdf8"}; border: 1px solid ${(e.maxFoodDaily??10)===20?"rgba(245, 158, 11, 0.35)":"rgba(56, 189, 248, 0.35)"}; flex-shrink: 0;">${e.maxFoodDaily??10} Slot</div>
                        </div>
                    </div>

                    <!-- Pengingat Kuota Roti Sebelum Reset -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Pengingat Kuota Roti Sebelum Reset</div>
                                <div class="aw-card-desc">Tampilkan peringatan jika kuota roti tersisa 30 menit sebelum 00:00 UTC</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-food-reset-reminder" ${e.foodResetReminderEnabled!==!1?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Energy Flush Akhir Hari -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">
                                    <span>Energy Flush Akhir Hari</span>
                                    <span style="padding: 2px 6px; border-radius: 4px; background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.35); color: #fbbf24; font-size: 10.5px; font-weight: 700;">FLUSH</span>
                                </div>
                                <div class="aw-card-desc">Kuras sisa energi otomatis mendekati reset harian server</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-energy-flush" ${e.energyFlushEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- TAB 2: LATIHAN STATS & KALKULATOR EMAS (Gambar 1 & Reference 2) -->
                <div id="tab-training" class="aw-tab-pane">
                    <!-- Master Toggle Switch -->
                    <div class="paw-card" style="border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; background: rgba(22, 27, 42, 0.75); border: 1px solid rgba(255, 255, 255, 0.08); box-sizing: border-box;">
                        <div class="aw-card-row" style="display: flex; align-items: center; justify-content: space-between;">
                            <div class="aw-card-info" style="display: flex; align-items: center; gap: 12px;">
                                <div style="width: 34px; height: 34px; border-radius: 8px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); display: flex; align-items: center; justify-content: center; color: #818cf8; flex-shrink: 0;">
                                    ${$.barChart}
                                </div>
                                <div>
                                    <div class="aw-card-title" style="display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; color: #fff;">
                                        <span>Auto Latihan Stats</span>
                                        <span id="settings-train-master-badge" style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; ${e.autoTrainEnabled?"background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);":"background: rgba(255, 255, 255, 0.05); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.1);"}">${e.autoTrainEnabled?"AKTIF":"• OFF"}</span>
                                    </div>
                                    <div class="aw-card-desc" style="color: #94a3b8; font-size: 12px; margin-top: 2px;">Matikan sakelar untuk menyembunyikan seluruh konfigurasi latihan &amp; kalkulator</div>
                                </div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-auto-train-enabled" ${e.autoTrainEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Sub-panel Wrapper with Solid Dimmed State -->
                    <div id="aw-training-content-wrapper" style="transition: opacity 0.25s ease, filter 0.25s ease; ${e.autoTrainEnabled?"":"opacity: 0.35; filter: grayscale(80%); pointer-events: none; user-select: none;"}">
                        <!-- Smart Priority Bar -->
                        <div class="paw-card" style="border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; background: rgba(22, 27, 42, 0.75); border: 1px solid rgba(255, 255, 255, 0.08); box-sizing: border-box;">
                            <!-- STATE 0: 0 STATS CHECKED -->
                            <div id="priority-zero-pill" class="paw-well" style="display:none; border-radius: 10px; padding: 10px 14px; border: 1px solid rgba(245, 158, 11, 0.35); background: rgba(245, 158, 11, 0.1); align-items: center; justify-content: space-between; gap: 10px;">
                                <div style="display:flex; align-items:center; gap: 8px; color: #fbbf24; font-size: 12.5px; font-weight: 600;">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                    <span>Tidak Ada Stat Aktif — Auto Latihan Siaga</span>
                                </div>
                                <button type="button" id="aw-btn-enable-str" style="background: rgba(245,158,11,0.2); border: 1px solid rgba(245,158,11,0.4); color: #fde68a; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer;">Aktifkan STR</button>
                            </div>

                            <!-- STATE 1: SINGLE STAT CHECKED -->
                            <div id="priority-single-pill" class="paw-well" style="display:none; border-radius: 10px; padding: 10px 14px; border: 1px solid rgba(244, 63, 94, 0.3); background: rgba(244, 63, 94, 0.08); align-items: center; justify-content: space-between; gap: 10px;">
                                <div style="display:flex; align-items: center; gap: 10px;">
                                    <div id="single-focus-icon-box" style="width: 28px; height: 28px; border-radius: 8px; background: rgba(244, 63, 94, 0.2); border: 1px solid rgba(244, 63, 94, 0.4); display: flex; align-items: center; justify-content: center; color: #fda4af; flex-shrink: 0;">
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
                                    </div>
                                    <div>
                                        <span id="single-focus-title" style="font-size: 13px; font-weight: 700; color: #fda4af; display: block;">Fokus Tunggal: Kekuatan</span>
                                        <span style="font-size: 11.5px; color: #94a3b8;">Stat lain yang tidak dicentang otomatis dilewati</span>
                                    </div>
                                </div>
                                <span class="tabular-nums" style="padding: 3px 10px; border-radius: 6px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); font-size: 11.5px; font-weight: 600; color: #cbd5e1; white-space: nowrap;">1 Stat Aktif</span>
                            </div>

                            <!-- STATE 2: 2 OR 3 STATS CHECKED -->
                            <div id="priority-multi-dropdown" class="paw-well" style="display:none; border-radius: 10px; padding: 10px 14px; border: 1px solid rgba(56, 189, 248, 0.3); background: rgba(56, 189, 248, 0.06); align-items: center; justify-content: space-between; gap: 12px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" style="flex-shrink: 0;"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
                                    <div>
                                        <div style="font-size: 13px; font-weight: 600; color: #fff;">Urutan Prioritas Multi-Stat</div>
                                        <div id="multi-stat-sublabel" style="font-size: 11.5px; color: #94a3b8;">Stat yang dicentang masuk dalam rotasi latihan</div>
                                    </div>
                                </div>
                                <select id="setting-train-priority" class="aw-select-box" style="min-width: 200px; font-size: 12px;">
                                    <!-- Populated dynamically based on checked stats -->
                                </select>
                            </div>
                        </div>

                        <!-- 3 Stat Cards Grid (STR, EDU, EKO) - Spaciously Fitting Without Stepper Buttons -->
                        <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px;">
                            
                            <!-- KEKUATAN (STR) -->
                            <div id="stat-card-str" class="stat-card theme-str ${e.trainStrengthEnabled!==!1?"active":"dimmed"}">
                                <!-- Top Bar: Icon + STR + Checkbox -->
                                <div id="stat-toggle-header-str" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select:none;">
                                    <div style="display:flex; align-items:center; gap: 7px; min-width: 0;">
                                        <div style="width:24px; height:24px; border-radius:6px; background:rgba(244,63,94,0.18); border:1px solid rgba(244,63,94,0.3); display:flex; align-items:center; justify-content:center; color:#f43f5e; flex-shrink:0;">
                                            ${$.sword}
                                        </div>
                                        <span style="color:#ffffff; font-size: 13px; font-weight: 700; white-space: nowrap;">Kekuatan</span>
                                    </div>
                                    <div style="display:flex; align-items:center; gap: 6px; flex-shrink: 0;">
                                        <input type="checkbox" id="setting-train-str-enabled" ${e.trainStrengthEnabled!==!1?"checked":""} style="display:none;">
                                        <div id="checkbox-box-str" class="stat-checkbox-box ${e.trainStrengthEnabled!==!1?"checked-str":"unchecked"}">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                    </div>
                                </div>
                                <!-- Level Saat Ini -->
                                <div style="display:flex; justify-content:space-between; align-items:baseline; font-size: 11.5px; white-space: nowrap;">
                                    <span style="color:#94a3b8; font-weight:500;">Level Saat Ini:</span>
                                    <span style="color:#fff; font-weight:700; font-family: monospace;">Lv. <span id="aw-calc-cur-str">${t.state?.trainingStats?.strength||0}</span></span>
                                </div>
                                <!-- Target Level Clean Input (No Stepper Buttons) -->
                                <div class="paw-well" style="border-radius: 8px; padding: 6px 10px; display:flex; justify-content:space-between; align-items:center; gap: 6px; box-sizing: border-box;">
                                    <span style="color:#cbd5e1; font-size: 11.5px; font-weight:500; white-space: nowrap;">Target Level</span>
                                    <input type="number" id="setting-target-strength" min="1" max="500" value="${e.targetStrength||100}" class="stat-target-input" style="color:#f43f5e; border-color: rgba(244, 63, 94, 0.4);" ${e.trainStrengthEnabled===!1?"disabled":""}>
                                </div>
                                <!-- Footer -->
                                <div style="font-size: 11.5px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); min-height: 26px; display:flex; align-items:center;">
                                    <div id="footer-active-str" style="display:${e.trainStrengthEnabled!==!1?"flex":"none"}; justify-content:space-between; align-items:center; width:100%; white-space: nowrap;">
                                        <span style="color:#94a3b8;">Biaya:</span>
                                        <span id="cost-str-display" class="tabular-nums" style="font-weight:700; color:#fda4af; font-family: monospace;">-- Emas</span>
                                    </div>
                                    <div id="footer-dimmed-str" style="display:${e.trainStrengthEnabled===!1?"flex":"none"}; width:100%; justify-content:center; align-items:center;">
                                        <span class="tabular-nums" style="padding: 2px 10px; border-radius: 999px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.15); font-size: 11px; font-weight: 500; color: #94a3b8; white-space: nowrap;">[ Dilewati ]</span>
                                    </div>
                                </div>
                            </div>

                            <!-- PENDIDIKAN (EDU) -->
                            <div id="stat-card-edu" class="stat-card theme-edu ${e.trainEducationEnabled!==!1?"active":"dimmed"}">
                                <div id="stat-toggle-header-edu" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select:none;">
                                    <div style="display:flex; align-items:center; gap: 7px; min-width: 0;">
                                        <div style="width:24px; height:24px; border-radius:6px; background:rgba(56,189,248,0.18); border:1px solid rgba(56,189,248,0.3); display:flex; align-items:center; justify-content:center; color:#38bdf8; flex-shrink:0;">
                                            ${$.book}
                                        </div>
                                        <span style="color:#ffffff; font-size: 13px; font-weight: 700; white-space: nowrap;">Pendidikan</span>
                                    </div>
                                    <div style="display:flex; align-items:center; gap: 6px; flex-shrink: 0;">
                                        <input type="checkbox" id="setting-train-edu-enabled" ${e.trainEducationEnabled!==!1?"checked":""} style="display:none;">
                                        <div id="checkbox-box-edu" class="stat-checkbox-box ${e.trainEducationEnabled!==!1?"checked-edu":"unchecked"}">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                    </div>
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:baseline; font-size: 11.5px; white-space: nowrap;">
                                    <span style="color:#94a3b8; font-weight:500;">Level Saat Ini:</span>
                                    <span style="color:#fff; font-weight:700; font-family: monospace;">Lv. <span id="aw-calc-cur-edu">${t.state?.trainingStats?.education||0}</span></span>
                                </div>
                                <div class="paw-well" style="border-radius: 8px; padding: 6px 10px; display:flex; justify-content:space-between; align-items:center; gap: 6px; box-sizing: border-box;">
                                    <span style="color:#cbd5e1; font-size: 11.5px; font-weight:500; white-space: nowrap;">Target Level</span>
                                    <input type="number" id="setting-target-education" min="1" max="500" value="${e.targetEducation||100}" class="stat-target-input" style="color:#38bdf8; border-color: rgba(56, 189, 248, 0.4);" ${e.trainEducationEnabled===!1?"disabled":""}>
                                </div>
                                <div style="font-size: 11.5px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); min-height: 26px; display:flex; align-items:center;">
                                    <div id="footer-active-edu" style="display:${e.trainEducationEnabled!==!1?"flex":"none"}; justify-content:space-between; align-items:center; width:100%; white-space: nowrap;">
                                        <span style="color:#94a3b8;">Biaya:</span>
                                        <span id="cost-edu-display" class="tabular-nums" style="font-weight:700; color:#7dd3fc; font-family: monospace;">-- Emas</span>
                                    </div>
                                    <div id="footer-dimmed-edu" style="display:${e.trainEducationEnabled===!1?"flex":"none"}; width:100%; justify-content:center; align-items:center;">
                                        <span class="tabular-nums" style="padding: 2px 10px; border-radius: 999px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.15); font-size: 11px; font-weight: 500; color: #94a3b8; white-space: nowrap;">[ Dilewati ]</span>
                                    </div>
                                </div>
                            </div>

                            <!-- EKONOMI (EKO) -->
                            <div id="stat-card-eko" class="stat-card theme-eko ${e.trainEconomyEnabled!==!1?"active":"dimmed"}">
                                <div id="stat-toggle-header-eko" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); user-select:none;">
                                    <div style="display:flex; align-items:center; gap: 7px; min-width: 0;">
                                        <div style="width:24px; height:24px; border-radius:6px; background:rgba(16,185,129,0.18); border:1px solid rgba(16,185,129,0.3); display:flex; align-items:center; justify-content:center; color:#10b981; flex-shrink:0;">
                                            ${$.trendingUp}
                                        </div>
                                        <span style="color:#ffffff; font-size: 13px; font-weight: 700; white-space: nowrap;">Ekonomi</span>
                                    </div>
                                    <div style="display:flex; align-items:center; gap: 6px; flex-shrink: 0;">
                                        <input type="checkbox" id="setting-train-eko-enabled" ${e.trainEconomyEnabled!==!1?"checked":""} style="display:none;">
                                        <div id="checkbox-box-eko" class="stat-checkbox-box ${e.trainEconomyEnabled!==!1?"checked-eko":"unchecked"}">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                    </div>
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:baseline; font-size: 11.5px; white-space: nowrap;">
                                    <span style="color:#94a3b8; font-weight:500;">Level Saat Ini:</span>
                                    <span style="color:#fff; font-weight:700; font-family: monospace;">Lv. <span id="aw-calc-cur-eko">${t.state?.trainingStats?.economy||0}</span></span>
                                </div>
                                <div class="paw-well" style="border-radius: 8px; padding: 6px 10px; display:flex; justify-content:space-between; align-items:center; gap: 6px; box-sizing: border-box;">
                                    <span style="color:#cbd5e1; font-size: 11.5px; font-weight:500; white-space: nowrap;">Target Level</span>
                                    <input type="number" id="setting-target-economy" min="1" max="500" value="${e.targetEconomy||100}" class="stat-target-input" style="color:#10b981; border-color: rgba(16, 185, 129, 0.4);" ${e.trainEconomyEnabled===!1?"disabled":""}>
                                </div>
                                <div style="font-size: 11.5px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); min-height: 26px; display:flex; align-items:center;">
                                    <div id="footer-active-eko" style="display:${e.trainEconomyEnabled!==!1?"flex":"none"}; justify-content:space-between; align-items:center; width:100%; white-space: nowrap;">
                                        <span style="color:#94a3b8;">Biaya:</span>
                                        <span id="cost-eko-display" class="tabular-nums" style="font-weight:700; color:#6ee7b7; font-family: monospace;">-- Emas</span>
                                    </div>
                                    <div id="footer-dimmed-eko" style="display:${e.trainEconomyEnabled===!1?"flex":"none"}; width:100%; justify-content:center; align-items:center;">
                                        <span class="tabular-nums" style="padding: 2px 10px; border-radius: 999px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.15); font-size: 11px; font-weight: 500; color: #94a3b8; white-space: nowrap;">[ Dilewati ]</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Real-Time Gold Calculator matching Prototype Surface C -->
                        <div class="paw-card" style="border: 1px solid rgba(245, 158, 11, 0.28); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; background: rgba(22, 27, 42, 0.75); box-sizing: border-box;">
                            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="8" y1="10" x2="16" y2="10"></line><line x1="8" y1="14" x2="12" y2="14"></line></svg>
                                    <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #fbbf24;">KALKULATOR BIAYA EMAS REAL-TIME</span>
                                </div>
                                <span style="font-size: 11.5px; color: #94a3b8; font-family: monospace;">Otomatisasi Deret Level</span>
                            </div>

                            <!-- 3 Breakdown Pills -->
                            <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;">
                                <div id="breakdown-pill-str" class="paw-well" style="border-radius: 8px; padding: 7px 10px; border: 1px solid rgba(244, 63, 94, 0.35); background: rgba(244, 63, 94, 0.1); display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; white-space: nowrap;">
                                    <span style="font-weight: 700; color: #fda4af; font-family: monospace;">STR:</span>
                                    <span id="breakdown-val-str" class="tabular-nums" style="font-weight: 600; color: #fff;">-- Emas</span>
                                </div>
                                <div id="breakdown-pill-edu" class="paw-well" style="border-radius: 8px; padding: 7px 10px; border: 1px solid rgba(255, 255, 255, 0.06); opacity: 0.45; display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; white-space: nowrap;">
                                    <span style="font-weight: 600; color: #94a3b8; font-family: monospace;">EDU:</span>
                                    <span id="breakdown-val-edu" class="tabular-nums" style="color: #94a3b8;">[ Dilewati ]</span>
                                </div>
                                <div id="breakdown-pill-eko" class="paw-well" style="border-radius: 8px; padding: 7px 10px; border: 1px solid rgba(255, 255, 255, 0.06); opacity: 0.45; display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; white-space: nowrap;">
                                    <span style="font-weight: 600; color: #94a3b8; font-family: monospace;">EKO:</span>
                                    <span id="breakdown-val-eko" class="tabular-nums" style="color: #94a3b8;">[ Dilewati ]</span>
                                </div>
                            </div>

                            <!-- 2 Columns: Inputs & Totals -->
                            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
                                <!-- Left Column: Inputs -->
                                <div class="paw-well" style="border-radius: 10px; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column; justify-content: space-between; gap: 8px; box-sizing: border-box;">
                                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                        <label for="wallet-gold-input" style="font-size: 11.5px; color: #cbd5e1; font-weight: 500; white-space: nowrap;">Saldo Dompet Emas</label>
                                        <div style="display: flex; align-items: center; gap: 5px;">
                                            <input id="wallet-gold-input" type="number" min="0" value="${t.state?.walletGold||0}" class="paw-gold-input tabular-nums" style="border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24;" />
                                            <span style="font-size: 11px; color: #94a3b8;">Emas</span>
                                        </div>
                                    </div>
                                    <div style="height: 1px; background: rgba(255, 255, 255, 0.06);"></div>
                                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                        <label for="setting-min-gold-reserve" style="font-size: 11.5px; color: #cbd5e1; font-weight: 500; white-space: nowrap;">Cadangan Minimal</label>
                                        <div style="display: flex; align-items: center; gap: 5px;">
                                            <input id="setting-min-gold-reserve" type="number" min="0" value="${e.minGoldReserve??50}" class="paw-gold-input tabular-nums" style="border: 1px solid rgba(245, 158, 11, 0.3); color: #fde68a;" />
                                            <span style="font-size: 11px; color: #94a3b8;">Emas</span>
                                        </div>
                                    </div>
                                    <div style="height: 1px; background: rgba(255, 255, 255, 0.06);"></div>
                                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; white-space: nowrap;">
                                        <span style="color: #94a3b8;">Saldo Siap Pakai:</span>
                                        <span id="usable-gold-readout" class="tabular-nums" style="font-weight: 600; color: #fbbf24; font-family: monospace;">0 Emas</span>
                                    </div>
                                </div>

                                <!-- Right Column: Results & Status Badge -->
                                <div class="paw-well" style="border-radius: 10px; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column; justify-content: space-between; gap: 8px; box-sizing: border-box;">
                                    <div>
                                        <div id="total-gold-label" style="font-size: 11.5px; color: #94a3b8; font-weight: 500;">Total Emas Dibutuhkan (1 Stat)</div>
                                        <div id="total-gold-needed" class="tabular-nums" style="font-size: 18px; font-weight: 700; color: #ffffff; margin-top: 2px;">0 Emas</div>
                                    </div>
                                    <div style="padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.06); display: flex; flex-direction: column; gap: 4px;">
                                        <span style="font-size: 11.5px; color: #94a3b8;">Status Kelayakan Keuangan:</span>
                                        <span id="finance-status-badge" class="tabular-nums" style="width: fit-content; padding: 3px 10px; border-radius: 8px; font-size: 11.5px; font-weight: 700; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399;">AMAN • Sisa +0 Emas</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- TAB 3: STEALTH & JADWAL (Gambar 4) -->
                <div id="tab-stealth" class="aw-tab-pane">
                    <!-- Istirahat Santai Acak (Micro-Breaks) -->
                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 8px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">
                                    <span>Istirahat Santai Acak (Micro-Breaks)</span>
                                    <span style="padding: 2px 7px; border-radius: 4px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399; font-size: 11px; font-weight: 600; font-family: monospace;">ANTI-DETEKSI</span>
                                </div>
                                <div class="aw-card-desc">Simulasikan perilaku manusia yang sesekali beristirahat santai 8–15 menit secara acak di sela-sela kerja</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-micro-breaks" ${e.microBreaksEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                            <div class="paw-well" style="border-radius: 8px; padding: 8px 10px;">
                                <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">Frekuensi (Tiap X Jam)</label>
                                <input type="number" id="setting-micro-break-freq" min="1" max="12" value="${e.microBreakFrequencyHours||4}" style="width: 100%; box-sizing: border-box; background: #0b0f1a; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 6px 10px; font-size: 13px; font-family: monospace; color: #fff; outline: none;">
                            </div>
                            <div class="paw-well" style="border-radius: 8px; padding: 8px 10px;">
                                <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">Durasi Istirahat (Menit)</label>
                                <input type="number" id="setting-micro-break-dur" min="3" max="30" value="${e.microBreakDurationMinutes||10}" style="width: 100%; box-sizing: border-box; background: #0b0f1a; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 6px 10px; font-size: 13px; font-family: monospace; color: #fff; outline: none;">
                            </div>
                        </div>
                    </div>

                    <!-- Variasi Ambang Energi Dinamis -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">
                                    <span>Variasi Ambang Energi Dinamis</span>
                                    <span style="padding: 2px 7px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; font-size: 11px; font-weight: 600; font-family: monospace;">±3 EN</span>
                                </div>
                                <div class="aw-card-desc">Sedikit memvariasikan ambang eksekusi shift (misal 87–93 EN) agar grafik konsumsi energi server tidak kaku</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-threshold-jitter" ${e.energyThresholdJitterEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Acak Jitter Ambang Energi -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">
                                    <span>Jitter Waktu Eksekusi Acak</span>
                                    <span style="padding: 2px 7px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; font-size: 11px; font-weight: 600; font-family: monospace;">±25s</span>
                                </div>
                                <div class="aw-card-desc">Variasikan detik eksekusi kerja (jeda acak 5-25 detik) saat energi telah siap</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-stealth-jitter" ${e.stealthJitterEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Jadwal Istirahat Malam (Sleep Mode) -->
                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 8px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Jadwal Istirahat Malam (Sleep Mode)</div>
                                <div class="aw-card-desc">Hentikan aktivitas bot otomatis pada jam tidur yang ditentukan</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-sleep-schedule" ${e.sleepScheduleEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                            <div class="paw-well" style="border-radius: 8px; padding: 8px 10px;">
                                <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">Jam Mulai Istirahat</label>
                                <input type="time" id="setting-sleep-start-time" value="${e.sleepStartTime||(e.sleepStartHour!==void 0?String(e.sleepStartHour).padStart(2,"0")+":00":"23:30")}" style="width: 100%; box-sizing: border-box; background: #0b0f1a; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 6px 10px; font-size: 13px; font-family: monospace; color: #fff; outline: none;">
                            </div>
                            <div class="paw-well" style="border-radius: 8px; padding: 8px 10px;">
                                <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">Jam Bangun Aktif</label>
                                <input type="time" id="setting-sleep-end-time" value="${e.sleepEndTime||(e.sleepEndHour!==void 0?String(e.sleepEndHour).padStart(2,"0")+":00":"05:45")}" style="width: 100%; box-sizing: border-box; background: #0b0f1a; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 6px 10px; font-size: 13px; font-family: monospace; color: #fff; outline: none;">
                            </div>
                        </div>
                    </div>

                    <!-- Peredam Log Energi Rendah -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Peredam Log Energi Rendah</div>
                                <div class="aw-card-desc">Sembunyikan baris log rutin saat energi masih di bawah target kerja</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-quiet-mode" ${e.quietModeEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- TAB 4: NOTIFIKASI & SUARA -->
                <div id="tab-notif" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Notifikasi Desktop Browser</div>
                                <div class="aw-card-desc">Kirim banner notifikasi OS saat kerja atau latihan selesai</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-notifications" ${e.sendNotification?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Alert Energi Penuh (Full Cap)</div>
                                <div class="aw-card-desc">Peringatan visual saat energi mencapai batas maksimum 210/210</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-energy-full-alert" ${e.energyFullAlertEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Efek Audio Eksekusi Kerja</div>
                                <div class="aw-card-desc">Bunyikan nada lembut saat bot berhasil mengeksekusi kerja</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-sound-notification-enabled" ${e.soundNotificationEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Alarm Suara Energi Penuh</div>
                                <div class="aw-card-desc">Bunyikan synthesizer alarm jika bot dijeda dan energi penuh</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-energy-full-sound-enabled" ${e.energyFullAlertSoundEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span class="aw-card-title" style="margin-bottom: 0;">Volume Master Efek Suara</span>
                            <span id="volume-readout" style="color: #38bdf8; font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums;">${Math.round(e.soundNotificationVolume*100)}%</span>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="range" id="setting-sound-notification-volume" min="0" max="100" value="${Math.round(e.soundNotificationVolume*100)}" class="aw-range-slider" style="flex: 1;">
                            <button type="button" id="aw-test-notification-sound" class="btn-cyber" style="
                                background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35);
                                padding: 6px 14px; border-radius: 8px; font-size: 11.5px; font-weight: 600; cursor: pointer;
                                display: flex; align-items: center; gap: 6px; flex-shrink: 0;
                            ">
                                ${$.volume}
                                <span>Test Sound</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- TAB 5: TAMPILAN & PINTASAN KEYBOARD (Gambar 5) -->
                <div id="tab-ui" class="aw-tab-pane">
                    <!-- Panel Hanya di Halaman Dashboard -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Panel Hanya di Halaman Dashboard</div>
                                <div class="aw-card-desc">Sembunyikan floating panel saat membuka halaman pasar atau profil</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-panel-dashboard-only" ${e.panelDashboardOnly?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Eksekusi Multi-Tab Leader-Only -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Eksekusi Multi-Tab Leader-Only</div>
                                <div class="aw-card-desc">Cegah bentrok request saat membuka banyak tab Parlementum sekaligus</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-panel-leader-only" ${e.panelLeaderOnly?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Koordinat Floating Panel -->
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Koordinat Floating Panel</div>
                                <div class="aw-card-desc">Kembalikan panel ke sudut kanan atas layar monitor</div>
                            </div>
                            <button type="button" id="aw-reset-position" class="btn-cyber" style="
                                background: rgba(30, 41, 59, 0.9); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.15);
                                padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0;
                            ">Reset Posisi Panel</button>
                        </div>
                    </div>

                    <!-- Pintasan Keyboard (Klik untuk Ubah) -->
                    <div class="aw-card" style="padding: 14px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 6px;">
                            <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #e2e8f0;">PINTASAN KEYBOARD (KLIK UNTUK UBAH)</span>
                            <span style="font-size: 11.5px; color: #38bdf8; font-weight: 500;">Global Hotkeys</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${s}
                        </div>
                    </div>

                    <!-- SUB-SECTION: AKUN & SISTEM -->
                    <div style="margin-top: 20px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                        <div style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                            <span style="color: #38bdf8; display: flex; align-items: center;">${$.settings}</span>
                            <span>Pengaturan Sistem &amp; Akun</span>
                        </div>
                        <div style="font-size: 11.5px; color: #94a3b8; margin-bottom: 12px;">
                            Optimasi memori browser, circuit breaker anti-deteksi, auto-login, dan pemulihan data pabrik.
                        </div>
                    </div>
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Mode Eco (Hemat RAM & CPU)</div>
                                <div class="aw-card-desc">Menghentikan render visual DOM saat tab ditinggal di latar belakang dan men-cache pembacaan wilayah. Timer dan giliran kerja tetap berjalan 100% presisi tanpa tertunda.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-eco-mode" ${e.ecoModeEnabled!==!1?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Auto-Refresh Tab Higienis (Pembersih Memori)</div>
                                <div class="aw-card-desc">Memuat ulang tab secara higienis setelah berjalan 12+ jam saat energi kosong (&lt; 20 EN) dan countdown masih lama (&gt; 20 menit), mencegah tab browser crash karena memory leak game.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-auto-reload-tab" ${e.autoReloadTabEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Circuit Breaker Keamanan (Anti-Spam)</div>
                                <div class="aw-card-desc">Otomatis mengunci worker jika server game masuk mode pemeliharaan (502/503) atau memunculkan pemeriksaan Cloudflare / Captcha.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-circuit-breaker" ${e.circuitBreakerEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 10px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Masuk Otomatis (Auto Re-Login)</div>
                                <div class="aw-card-desc">Jika sesi/token game habis (HTTP 401), bot akan otomatis login kembali ke akun Anda dan melanjutkan kerja. Data disimpan aman 100% lokal di browser.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-auto-relogin" ${e.autoReloginEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>

                        <div id="aw-autologin-fields" style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-top: 8px;">
                            <div style="margin-bottom: 10px;">
                                <label style="display: block; font-size: 11px; color: #94a3b8; margin-bottom: 4px; font-weight: 500;">Email Akun Game</label>
                                <input type="email" id="setting-login-email" autocomplete="off" data-lpignore="true" data-form-type="other" placeholder="nama@email.com" value="${a?.email||""}" style="width: 100%; box-sizing: border-box; background: #131724; color: #fff; border: 1px solid #2d364f; border-radius: 6px; padding: 8px 10px; font-size: 12px;">
                            </div>
                            <div style="margin-bottom: 12px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                    <label style="font-size: 11px; color: #94a3b8; font-weight: 500;">Kata Sandi</label>
                                    <span id="aw-toggle-pwd-vis" style="font-size: 11px; color: #00d4ff; cursor: pointer; user-select: none;">Lihat</span>
                                </div>
                                <input type="password" id="setting-login-pwd" autocomplete="off" data-lpignore="true" data-form-type="other" placeholder="Kata sandi akunmu" value="${a?.password||""}" style="width: 100%; box-sizing: border-box; background: #131724; color: #fff; border: 1px solid #2d364f; border-radius: 6px; padding: 8px 10px; font-size: 12px;">
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button id="aw-save-login-creds" style="flex: 1; background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;">Simpan Kredensial</button>
                                <button id="aw-clear-login-creds" style="background: rgba(255,255,255,0.05); color: #ff5555; border: 1px solid rgba(255,85,85,0.3); padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 500;">Hapus</button>
                            </div>
                            <div id="aw-login-creds-msg" style="font-size: 11px; margin-top: 8px; display: none;"></div>
                        </div>
                    </div>

                    <div class="aw-card" style="margin-top: 14px; border-color: rgba(255, 85, 85, 0.2);">
                        <div class="aw-card-title" style="color: #ff6b6b; margin-bottom: 6px;">Zona Bahaya (Reset Total)</div>
                        <div class="aw-card-desc" style="margin-bottom: 12px;">
                            Mengembalikan seluruh preferensi, batas energi, pintasan keyboard, dan posisi panel ke pengaturan awal pabrik.
                        </div>
                        <button id="aw-restore-defaults" style="
                            background: linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(204, 0, 0, 0.3));
                            color: #ff8888; border: 1px solid rgba(255, 107, 107, 0.4); padding: 9px;
                            border-radius: 6px; cursor: pointer; font-weight: 600;
                            font-size: 12px; width: 100%; transition: all 0.15s;
                        ">Pulihkan Semua Pengaturan ke Default</button>
                    </div>
                </div>
            </div>

            <!-- Sticky Modal Footer -->
            <div id="aw-settings-footer" style="
                padding: 12px 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                gap: 12px;
                justify-content: space-between;
                align-items: center;
                background: linear-gradient(135deg, #131724 0%, #0d101a 100%);
            ">
                <div id="aw-settings-status" style="font-size: 12px; color: #00ff88; font-weight: 600; display: none;"></div>
                <div style="display: flex; gap: 8px; margin-left: auto;">
                    <button id="aw-cancel-settings" style="
                        background: transparent; color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.15);
                        padding: 8px 16px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; font-weight: 600; transition: all 0.15s;
                    ">Batal</button>
                    <button id="aw-save-settings" style="
                        background: linear-gradient(135deg, #00ff88, #00cc66);
                        color: #050a14; border: none; padding: 9px 24px;
                        border-radius: 8px; cursor: pointer; font-weight: 700;
                        font-size: 13px; box-shadow: 0 4px 14px rgba(0,255,136,0.3);
                        transition: transform 0.15s, box-shadow 0.15s;
                    ">Simpan Pengaturan</button>
                </div>
            </div>
        </div>
    `,document.body.appendChild(o);const n=o.querySelector(".aw-tab-nav"),l=o.querySelectorAll(".aw-tab-btn"),c=o.querySelectorAll(".aw-tab-pane");l.forEach(b=>{b.addEventListener("click",()=>{const w=b.dataset.tab;l.forEach(j=>j.classList.remove("active")),c.forEach(j=>j.classList.remove("active")),b.classList.add("active"),b.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"});const A=o.querySelector(`#${w}`);A&&A.classList.add("active")})}),n?.addEventListener("wheel",b=>{b.deltaY!==0&&(b.preventDefault(),n.scrollLeft+=b.deltaY)},{passive:!1});let f=null;function g(b=!1){const w=document.getElementById("setting-energy-threshold"),A=parseInt(w?.value??"",10);if(!isNaN(A)&&A>=10&&A<=210){e.energyThreshold=A;const ne=document.getElementById("slider-energy-readout");ne&&(ne.textContent=`${A} EN`)}const j=document.getElementById("setting-quiet-mode");j&&(e.quietModeEnabled=j.checked);const H=document.getElementById("setting-panel-dashboard-only");H&&(e.panelDashboardOnly=H.checked);const Y=document.getElementById("setting-panel-leader-only");Y&&(e.panelLeaderOnly=Y.checked);const ee=document.getElementById("setting-follow-viewport");ee&&(e.panelFollowViewport=ee.checked);const te=document.getElementById("setting-return-original");te&&(e.panelReturnToOriginal=te.checked);const u=document.getElementById("setting-sound-notification-enabled");u&&(e.soundNotificationEnabled=u.checked);const P=document.getElementById("setting-sound-notification-volume");if(P){const ne=Math.max(0,Math.min(100,parseInt(P.value||"30",10)));e.soundNotificationVolume=ne/100;const ue=document.getElementById("volume-readout");ue&&(ue.textContent=`${ne}%`)}const q=document.getElementById("setting-energy-full-sound-enabled");q&&(e.energyFullAlertSoundEnabled=q.checked);const K=document.getElementById("setting-notifications");K&&(e.sendNotification=K.checked);const p=document.getElementById("setting-energy-full-alert");p&&(e.energyFullAlertEnabled=p.checked);const d=document.getElementById("setting-stealth-jitter");d&&(e.stealthJitterEnabled=d.checked);const h=document.getElementById("setting-energy-flush");h&&(e.energyFlushEnabled=h.checked);const k=document.getElementById("setting-food-reset-reminder");k&&(e.foodResetReminderEnabled=k.checked);const _=document.getElementById("setting-auto-reload-tab");_&&(e.autoReloadTabEnabled=_.checked);const G=document.getElementById("setting-circuit-breaker");G&&(e.circuitBreakerEnabled=G.checked);const oe=document.getElementById("setting-sleep-schedule");oe&&(e.sleepScheduleEnabled=oe.checked);const ce=document.getElementById("setting-sleep-start-time");if(ce&&ce.value){e.sleepStartTime=ce.value;const ne=ce.value.split(":");ne[0]&&(e.sleepStartHour=parseInt(ne[0],10))}const we=document.getElementById("setting-sleep-end-time");if(we&&we.value){e.sleepEndTime=we.value;const ne=we.value.split(":");ne[0]&&(e.sleepEndHour=parseInt(ne[0],10))}const We=document.getElementById("setting-micro-breaks");We&&(e.microBreaksEnabled=We.checked);const _e=document.getElementById("setting-micro-break-freq");_e&&(e.microBreakFrequencyHours=Math.max(1,Math.min(12,parseInt(_e.value,10)||4)));const qe=document.getElementById("setting-micro-break-dur");qe&&(e.microBreakDurationMinutes=Math.max(3,Math.min(45,parseInt(qe.value,10)||10)));const le=document.getElementById("setting-threshold-jitter");le&&(e.energyThresholdJitterEnabled=le.checked);const Ie=document.getElementById("setting-auto-relogin");Ie&&(e.autoReloginEnabled=Ie.checked);const xe=document.getElementById("setting-eco-mode");xe&&(e.ecoModeEnabled=xe.checked);const Be=document.getElementById("setting-auto-train-enabled");Be&&(e.autoTrainEnabled=Be.checked);const fe=document.getElementById("setting-train-str-enabled");fe&&(e.trainStrengthEnabled=fe.checked);const ut=document.getElementById("setting-train-edu-enabled");ut&&(e.trainEducationEnabled=ut.checked);const pt=document.getElementById("setting-train-eko-enabled");pt&&(e.trainEconomyEnabled=pt.checked);const Fe=document.getElementById("setting-train-priority");Fe&&Fe.value&&(e.trainPriority=Fe.value);const Oe=document.getElementById("setting-target-strength");Oe&&(e.targetStrength=Math.max(1,Math.min(500,parseInt(Oe.value,10)||100)));const Ge=document.getElementById("setting-target-education");Ge&&(e.targetEducation=Math.max(1,Math.min(500,parseInt(Ge.value,10)||100)));const et=document.getElementById("setting-target-economy");et&&(e.targetEconomy=Math.max(1,Math.min(500,parseInt(et.value,10)||100)));const Me=document.getElementById("setting-min-gold-reserve");Me&&(e.minGoldReserve=Math.max(0,parseInt(Me.value,10)||0)),tt(e),t.updatePanelVisibility?.(e),t.updatePanel?.();const re=document.getElementById("aw-settings-status");re&&(f&&clearTimeout(f),b?(re.textContent=`Tersimpan! Batas energi: ${e.energyThreshold} EN`,re.style.color="#00ff88",re.style.display="block"):(re.textContent=`Disimpan otomatis (Batas: ${e.energyThreshold} EN)`,re.style.color="#00e99a",re.style.display="block",f=setTimeout(()=>{re&&(re.style.display="none")},2500)))}const y=document.getElementById("setting-energy-threshold"),m=document.getElementById("slider-energy-readout");function x(b){o.querySelectorAll(".paw-preset-chip").forEach(w=>{const A=parseInt(w.dataset.val,10);w.classList.toggle("active",A===b)})}y&&y.addEventListener("input",b=>{const w=parseInt(b.target.value,10);m&&(m.textContent=`${w} EN`),x(w),g(!1)}),o.querySelectorAll(".paw-preset-chip").forEach(b=>{b.addEventListener("click",()=>{const w=parseInt(b.dataset.val,10);isNaN(w)||(y&&(y.value=w),m&&(m.textContent=`${w} EN`),x(w),g(!1))})});const B=document.getElementById("setting-sound-notification-volume"),D=document.getElementById("volume-readout");B&&B.addEventListener("input",b=>{const w=parseInt(b.target.value,10)||0;D&&(D.textContent=`${w}%`),e.soundNotificationVolume=w/100,g(!1)}),["setting-food-reset-reminder","setting-energy-flush","setting-micro-breaks","setting-micro-break-freq","setting-micro-break-dur","setting-threshold-jitter","setting-stealth-jitter","setting-sleep-schedule","setting-sleep-start-time","setting-sleep-end-time","setting-quiet-mode","setting-notifications","setting-energy-full-alert","setting-sound-notification-enabled","setting-energy-full-sound-enabled","setting-panel-dashboard-only","setting-panel-leader-only","setting-eco-mode","setting-auto-reload-tab","setting-circuit-breaker","setting-auto-relogin"].forEach(b=>{document.getElementById(b)?.addEventListener("change",()=>g(!1))});function S(){const b=document.getElementById("setting-auto-train-enabled"),w=b?b.checked:!!e.autoTrainEnabled,A=document.getElementById("settings-train-master-badge");A&&(A.textContent=w?"AKTIF":"NONAKTIF",A.style.background=w?"rgba(16, 185, 129, 0.16)":"rgba(255, 255, 255, 0.05)",A.style.color=w?"#34d399":"#94a3b8",A.style.borderColor=w?"rgba(16, 185, 129, 0.35)":"rgba(255, 255, 255, 0.1)");const j=document.getElementById("settings-train-off-banner");j&&(j.style.display=w?"none":"flex");const H=document.getElementById("aw-training-content-wrapper");H&&(H.style.display="block",H.style.opacity=w?"1":"0.35",H.style.filter=w?"none":"grayscale(80%)",H.style.pointerEvents=w?"auto":"none",H.style.userSelect=w?"auto":"none");const Y=document.getElementById("setting-train-str-enabled"),ee=document.getElementById("setting-train-edu-enabled"),te=document.getElementById("setting-train-eko-enabled"),u=Y?Y.checked:e.trainStrengthEnabled!==!1,P=ee?ee.checked:e.trainEducationEnabled!==!1,q=te?te.checked:e.trainEconomyEnabled!==!1,K=[];u&&K.push("strength"),P&&K.push("education"),q&&K.push("economy");const p={strength:{key:"str",name:"Kekuatan",code:"STR",color:"#f43f5e",lightColor:"#fda4af",activeClass:"checked-str"},education:{key:"edu",name:"Pendidikan",code:"EDU",color:"#38bdf8",lightColor:"#7dd3fc",activeClass:"checked-edu"},economy:{key:"eko",name:"Ekonomi",code:"EKO",color:"#10b981",lightColor:"#6ee7b7",activeClass:"checked-eko"}},d={strength:u,education:P,economy:q};for(const[J,O]of Object.entries(p)){const F=d[J],de=document.getElementById(`stat-card-${O.key}`);de&&(de.className=`aw-stat-card theme-${O.key} ${F?"active":"dimmed"}`);const gt=document.getElementById(`check-label-${O.key}`);gt&&(gt.textContent=F?"Aktif":"Off",gt.style.color=F?O.lightColor:"#64748b");const Ae=document.getElementById(`checkbox-box-${O.key}`);Ae&&(Ae.className=`aw-stat-checkbox-box ${F?O.activeClass:"unchecked"}`);const En=document.getElementById(`setting-step-down-${O.key}`);En&&(En.disabled=!F);const Tn=document.getElementById(`setting-step-up-${O.key}`);Tn&&(Tn.disabled=!F);const Sn=document.getElementById(`setting-target-${J}`);Sn&&(Sn.disabled=!F);const Bn=document.getElementById(`footer-active-${O.key}`),Mn=document.getElementById(`footer-dimmed-${O.key}`);Bn&&Mn&&(Bn.style.display=F?"flex":"none",Mn.style.display=F?"none":"flex")}const h=document.getElementById("priority-zero-pill"),k=document.getElementById("priority-single-pill"),_=document.getElementById("priority-multi-dropdown");if(K.length===0)h&&(h.style.display="flex"),k&&(k.style.display="none"),_&&(_.style.display="none");else if(K.length===1){h&&(h.style.display="none"),k&&(k.style.display="flex"),_&&(_.style.display="none");const J=p[K[0]],O=document.getElementById("single-focus-title");O&&(O.textContent=`Fokus Tunggal: ${J.name} (${J.code})`,O.style.color=J.lightColor);const F=document.getElementById("single-focus-icon-box");F&&(F.style.color=J.lightColor,F.style.borderColor=J.color,F.style.background=`${J.color}33`)}else{h&&(h.style.display="none"),k&&(k.style.display="none"),_&&(_.style.display="flex");const J=document.getElementById("multi-stat-sublabel");if(J){const F=K.map(de=>p[de].code).join(" + ");J.textContent=`${K.length} stat dicentang (${F}) untuk rotasi latihan`}const O=document.getElementById("setting-train-priority");if(O){const F=O.value||e.trainPriority||"education",de=[{value:"balanced",text:"Seimbang (Rotasi Terendah)"}];u&&de.push({value:"strength",text:"Kekuatan Dulu (Damage Perang)"}),P&&de.push({value:"education",text:"Pendidikan Dulu (Diskon Waktu)"}),q&&de.push({value:"economy",text:"Ekonomi Dulu (Hasil Produksi)"}),O.innerHTML=de.map(Ae=>`<option value="${Ae.value}" ${Ae.value===F?"selected":""}>${Ae.text}</option>`).join(""),de.map(Ae=>Ae.value).includes(O.value)||(O.value=de[0].value,e.trainPriority=de[0].value)}}const G=t.state?.trainingStats?.strength||0,oe=t.state?.trainingStats?.education||0,ce=t.state?.trainingStats?.economy||0,we=document.getElementById("wallet-gold-input"),We=we?parseInt(we.value,10)||0:t.state?.walletGold||0,_e=document.getElementById("setting-min-gold-reserve"),qe=_e?parseInt(_e.value,10)||0:e.minGoldReserve??50,le=Math.max(0,We-qe),Ie=document.getElementById("usable-gold-readout");Ie&&(Ie.textContent=`${le.toLocaleString("id-ID")} Emas`);const xe=parseInt(document.getElementById("setting-target-strength")?.value,10)||G,Be=parseInt(document.getElementById("setting-target-education")?.value,10)||oe,fe=parseInt(document.getElementById("setting-target-economy")?.value,10)||ce,ut=Math.max(0,xe-G),pt=Math.max(0,Be-oe),Fe=Math.max(0,fe-ce),Oe=document.getElementById("delta-str-badge");Oe&&(Oe.textContent=u?`+${ut} Lv`:"Terkunci");const Ge=document.getElementById("delta-edu-badge");Ge&&(Ge.textContent=P?`+${pt} Lv`:"Terkunci");const et=document.getElementById("delta-eko-badge");et&&(et.textContent=q?`+${Fe} Lv`:"Terkunci");const Me=u?Et(G,xe):0,re=P?Et(oe,Be):0,ne=q?Et(ce,fe):0,ue=Me+re+ne,an=u?Tt(G,xe,oe,!1):0,on=P?Tt(oe,Be,oe,!0):0,rn=q?Tt(ce,fe,oe,!1):0,Ia=an+on+rn,sn=document.getElementById("cost-str-display");sn&&(sn.textContent=`${Me.toLocaleString("id-ID")} Emas`);const ln=document.getElementById("cost-edu-display");ln&&(ln.textContent=`${re.toLocaleString("id-ID")} Emas`);const dn=document.getElementById("cost-eko-display");dn&&(dn.textContent=`${ne.toLocaleString("id-ID")} Emas`),[{key:"str",active:u,cost:Me,color:"rgba(244, 63, 94, 0.35)",bg:"rgba(244, 63, 94, 0.1)"},{key:"edu",active:P,cost:re,color:"rgba(56, 189, 248, 0.35)",bg:"rgba(56, 189, 248, 0.1)"},{key:"eko",active:q,cost:ne,color:"rgba(16, 185, 129, 0.35)",bg:"rgba(16, 185, 129, 0.1)"}].forEach(J=>{const O=document.getElementById(`breakdown-pill-${J.key}`),F=document.getElementById(`breakdown-val-${J.key}`);O&&(O.style.opacity=J.active?"1":"0.45",O.style.borderColor=J.active?J.color:"rgba(255, 255, 255, 0.06)",O.style.background=J.active?J.bg:"rgba(15, 23, 42, 0.6)"),F&&(J.active?(F.textContent=`${J.cost.toLocaleString("id-ID")} Emas`,F.style.color="#ffffff",F.style.fontWeight="600"):(F.textContent="[ Dilewati ]",F.style.color="#94a3b8",F.style.fontWeight="500"))});const cn=document.getElementById("total-gold-label");cn&&(cn.textContent=`Total Emas Dibutuhkan (${K.length} Stat)`);const un=document.getElementById("total-gold-needed");un&&(un.textContent=`${ue.toLocaleString("id-ID")} Emas`);const pn=document.getElementById("aw-calc-cost-str");pn&&(pn.textContent=`${Me.toLocaleString("id-ID")} Emas`);const gn=document.getElementById("aw-calc-time-str");gn&&(gn.textContent=lt(an));const fn=document.getElementById("aw-calc-cost-edu");fn&&(fn.textContent=`${re.toLocaleString("id-ID")} Emas`);const mn=document.getElementById("aw-calc-time-edu");mn&&(mn.textContent=lt(on));const yn=document.getElementById("aw-calc-cost-eko");yn&&(yn.textContent=`${ne.toLocaleString("id-ID")} Emas`);const bn=document.getElementById("aw-calc-time-eko");bn&&(bn.textContent=lt(rn));const hn=document.getElementById("aw-calc-cost-str-pill");hn&&(hn.textContent=u?`${Me.toLocaleString("id-ID")} Emas`:"Dilewati (0)");const wn=document.getElementById("aw-calc-cost-edu-pill");wn&&(wn.textContent=P?`${re.toLocaleString("id-ID")} Emas`:"Dilewati (0)");const xn=document.getElementById("aw-calc-cost-eko-pill");xn&&(xn.textContent=q?`${ne.toLocaleString("id-ID")} Emas`:"Dilewati (0)");const kn=document.getElementById("aw-calc-total-cost");kn&&(kn.textContent=`${ue.toLocaleString("id-ID")} Emas`);const vn=document.getElementById("aw-calc-total-time");vn&&(vn.textContent=K.length>0?lt(Ia):"0 dtk");const ie=document.getElementById("finance-status-badge");if(ie)if(K.length===0)ie.textContent="SIAGA • 0 Stat Dipilih",ie.style.color="#94a3b8",ie.style.background="rgba(255, 255, 255, 0.06)",ie.style.borderColor="rgba(255, 255, 255, 0.1)";else if(le>=ue){const J=le-ue;ie.textContent=`AMAN • Sisa +${J.toLocaleString("id-ID")} Emas`,ie.style.color="#34d399",ie.style.background="rgba(16, 185, 129, 0.15)",ie.style.borderColor="rgba(16, 185, 129, 0.35)"}else{const J=ue-le;ie.textContent=`KURANG ${J.toLocaleString("id-ID")} EMAS`,ie.style.color="#fbbf24",ie.style.background="rgba(245, 158, 11, 0.15)",ie.style.borderColor="rgba(245, 158, 11, 0.35)"}const ae=document.getElementById("aw-calc-gold-status");if(ae)if(K.length===0)ae.textContent="SIAGA • 0 Stat Dipilih",ae.style.color="#94a3b8",ae.style.background="rgba(255,255,255,0.06)",ae.style.borderColor="rgba(255,255,255,0.1)";else if(We<=0)ae.textContent="Memuat Dompet Emas...",ae.style.color="#94a3b8",ae.style.background="rgba(255,255,255,0.06)",ae.style.borderColor="rgba(255,255,255,0.1)";else if(le<ue){const J=ue-le;ae.textContent=`KURANG ${J.toLocaleString("id-ID")} EMAS • Melatih Bertahap`,ae.style.color="#f59e0b",ae.style.background="rgba(245,158,11,0.15)",ae.style.borderColor="rgba(245,158,11,0.35)"}else{const J=le-ue;ae.textContent=`AMAN • Sisa +${J.toLocaleString("id-ID")} Emas`,ae.style.color="#00ff88",ae.style.background="rgba(0,255,136,0.15)",ae.style.borderColor="rgba(0,255,136,0.3)"}}document.getElementById("setting-auto-train-enabled")?.addEventListener("change",()=>{S(),g(!1)}),document.getElementById("setting-train-priority")?.addEventListener("change",()=>{g(!1)}),["str","edu","eko"].forEach(b=>{const w=b==="str"?"strength":b==="edu"?"education":"economy",A=document.getElementById(`setting-target-${w}`),j=t.state?.trainingStats?.[w]||1;document.getElementById(`setting-step-down-${b}`)?.addEventListener("click",()=>{if(!A||A.disabled)return;const H=parseInt(A.value,10)||j;A.value=Math.max(j,H-1),S(),g(!1)}),document.getElementById(`setting-step-up-${b}`)?.addEventListener("click",()=>{if(!A||A.disabled)return;const H=parseInt(A.value,10)||j;A.value=Math.min(500,H+1),S(),g(!1)}),document.getElementById(`stat-toggle-header-${b}`)?.addEventListener("click",()=>{const H=document.getElementById(`setting-train-${b}-enabled`);H&&(H.checked=!H.checked,S(),g(!1))})}),document.getElementById("aw-btn-enable-str")?.addEventListener("click",()=>{const b=document.getElementById("setting-train-str-enabled");b&&(b.checked=!0,S(),g(!1))}),["setting-target-strength","setting-target-education","setting-target-economy","setting-min-gold-reserve","wallet-gold-input"].forEach(b=>{const w=document.getElementById(b);w&&(w.addEventListener("input",()=>{S(),b!=="wallet-gold-input"&&g(!1)}),w.addEventListener("change",()=>{S(),b!=="wallet-gold-input"&&g(!1)}))}),S();const E=document.getElementById("setting-login-pwd"),M=document.getElementById("aw-toggle-pwd-vis");M?.addEventListener("click",()=>{E&&(E.type==="password"?(E.type="text",M.textContent="Sembunyikan"):(E.type="password",M.textContent="Lihat"))});const L=document.getElementById("aw-save-login-creds"),I=document.getElementById("aw-clear-login-creds"),U=document.getElementById("aw-login-creds-msg"),W=document.getElementById("setting-login-email");L?.addEventListener("click",()=>{const b=W?.value.trim()||"",w=E?.value||"";if(!b||!w){U&&(U.textContent="Harap isi email dan kata sandi!",U.style.color="#ff6b6b",U.style.display="block");return}Nt(b,w),e.autoReloginEnabled=!0;const A=document.getElementById("setting-auto-relogin");A&&(A.checked=!0),tt(e),U&&(U.textContent=`Kredensial untuk ${b} tersimpan! Auto Re-Login AKTIF.`,U.style.color="#00ff88",U.style.display="block"),t.log?.("Kredensial Auto Re-Login berhasil disimpan.","success")}),I?.addEventListener("click",()=>{Qn(),W&&(W.value=""),E&&(E.value=""),e.autoReloginEnabled=!1;const b=document.getElementById("setting-auto-relogin");b&&(b.checked=!1),tt(e),U&&(U.textContent="Kredensial telah dihapus dari browser.",U.style.color="#ffaa00",U.style.display="block"),t.log?.("Kredensial Auto Re-Login dihapus.","info")});let T=null;i.forEach(b=>{const w=document.getElementById(`record-${b.id}`);w&&w.addEventListener("click",A=>{if(A.stopPropagation(),T&&T!==b.id){const j=document.getElementById(`record-${T}`);j&&(j.classList.remove("recording"),j.textContent=e.shortcuts[T]?.display||"Klik untuk Set")}T=b.id,w.classList.add("recording"),w.textContent="Tekan tombol..."})});const z=b=>{if(b.type!=="keydown"||!T)return;b.preventDefault(),b.stopPropagation();const w=T,A=document.getElementById(`record-${w}`);if(b.key==="Escape"){T=null,A&&(A.classList.remove("recording"),A.textContent=e.shortcuts[w]?.display||"Klik untuk Set");return}const j=[],H=[];b.ctrlKey&&(j.push("Control"),H.push("Ctrl")),b.altKey&&(j.push("Alt"),H.push("Alt")),b.shiftKey&&(j.push("Shift"),H.push("Shift"));const Y=b.code,ee=b.key;if(["Control","Shift","Alt","Meta"].includes(ee)){A&&(A.textContent=H.length>0?H.join(" + ")+" + ...":"Tekan tombol...");return}Y.startsWith("Key")?(j.push(Y),H.push(Y.replace("Key",""))):Y.startsWith("Digit")?(j.push(Y),H.push(Y.replace("Digit",""))):Y==="Space"?(j.push("Space"),H.push("Space")):(j.push(Y),H.push(ee.toUpperCase()));const te=H.join(" + ");j.length>0&&(e.shortcuts[w]={keys:j,display:te},A&&(A.classList.remove("recording"),A.textContent=te),T=null,g(!1),t.log?.(`Pintasan [${w}] diubah menjadi ${te}`,"info"))};function V(b){b.key==="Escape"&&o.style.display==="flex"&&Z(!0)}function Z(b=!0){if(T){const w=document.getElementById(`record-${T}`);w&&(w.classList.remove("recording"),w.textContent=e.shortcuts[T]?.display||"Klik untuk Set"),T=null}b&&g(!1),o.style.display="none",t.state&&(t.state.settingsOpen=!1),document.removeEventListener("keydown",z,!0),document.removeEventListener("keydown",V)}o.closeModalSafely=Z,o.recordHandler=z,o.handleEscapeKey=V,o.updateTrainingCalculator=S,document.getElementById("aw-close-settings")?.addEventListener("click",()=>Z(!0)),document.getElementById("aw-cancel-settings")?.addEventListener("click",()=>{At(e,t),Z(!1)}),o.addEventListener("click",b=>{b.target===o&&Z(!0)}),document.addEventListener("keydown",V),document.getElementById("aw-test-notification-sound")?.addEventListener("click",()=>{const b=parseInt(document.getElementById("setting-sound-notification-volume")?.value??"70",10),w=isNaN(b)?.7:Math.max(0,Math.min(100,b))/100;t.sendNotification?.("Parlamentum Auto Worker","Tes notifikasi suara berhasil."),t.playNotificationSound?.({soundNotificationEnabled:!0,soundNotificationVolume:w},"success")}),document.getElementById("aw-reset-position")?.addEventListener("click",()=>{if(!t.state)return;t.state.panelX=e.panelDefaultX??10,t.state.panelY=e.panelDefaultY??10,t.state.panelVisible=!0,t.state.userManuallyToggledPanel=!1,v("panelX",t.state.panelX.toString()),v("panelY",t.state.panelY.toString()),v("panelVisible","true");const b=document.getElementById("aw-panel");b&&(b.style.left=t.state.panelX+"px",b.style.top=t.state.panelY+"px",b.style.display="block"),Te(t.state,!1),t.updatePanel?.(),t.log?.("Posisi dan visibilitas panel berhasil di-reset ke default (Mode Penuh)!","success");const w=document.getElementById("aw-settings-status");w&&(w.textContent="Panel in-game berhasil dimunculkan kembali ke posisi awal!",w.style.color="#38bdf8",w.style.display="block",setTimeout(()=>{w&&(w.style.display="none")},3e3));const A=document.getElementById("aw-settings-mode-text"),j=document.getElementById("aw-settings-mode-icon");A&&(A.textContent="Penuh"),j&&(j.innerHTML=$.minimize)}),document.getElementById("aw-btn-force-show-panel")?.addEventListener("click",()=>{if(!t.state)return;t.state.panelVisible=!0,t.state.userManuallyToggledPanel=!1,v("panelVisible","true");const b=document.getElementById("aw-panel");b&&(b.style.display="block"),Te(t.state,!1),t.updatePanel?.(),t.log?.("Panel in-game berhasil dimunculkan kembali!","success");const w=document.getElementById("aw-settings-status");w&&(w.textContent="Panel in-game berhasil ditampilkan di layar!",w.style.color="#10b981",w.style.display="block",setTimeout(()=>{w&&(w.style.display="none")},2500));const A=document.getElementById("aw-settings-mode-text"),j=document.getElementById("aw-settings-mode-icon");A&&(A.textContent="Penuh"),j&&(j.innerHTML=$.minimize)}),document.getElementById("aw-btn-toggle-pill")?.addEventListener("click",()=>{if(!t.state)return;const b=!t.state.panelMinimized;Te(t.state,b),t.updatePanel?.();const w=document.getElementById("aw-settings-mode-text"),A=document.getElementById("aw-settings-mode-icon");w&&(w.textContent=b?"Pill (Kapsul)":"Penuh"),A&&(A.innerHTML=b?$.expand:$.minimize)}),document.getElementById("aw-restore-defaults")?.addEventListener("click",()=>{confirm(`Yakin ingin mengembalikan SEMUA pengaturan ke default?

Ini akan:
- Reset keyboard shortcuts
- Reset batas energi ke 10 EN
- Reset semua preferensi
- Reset posisi panel

Konfigurasi yang tersimpan akan dihapus.`)&&(v("aw_config",null),v("panelX",(e.panelDefaultX??20).toString()),v("panelY",(e.panelDefaultY??20).toString()),t.log?.("Semua pengaturan berhasil di-reset ke default! Refresh halaman untuk menerapkan.","success"),setTimeout(()=>{confirm("Pengaturan sudah di-reset. Refresh halaman sekarang?")&&location.reload()},500))}),document.getElementById("aw-save-settings")?.addEventListener("click",()=>{g(!0),e.sendNotification&&"Notification"in window&&Notification.permission==="default"&&Notification.requestPermission().catch(()=>{});const b=document.getElementById("aw-hide");b&&(b.title=`Hide (${e.shortcuts.showHide?.display??""})`),t.log?.(`Pengaturan disimpan! Batas energi sebelum kerja: ${e.energyThreshold} EN`,"success"),t.playNotificationSound?.("success"),setTimeout(()=>Z(!1),700)})}function At(e,t){const a=document.getElementById("aw-settings-modal");if(!a)return;t?.state&&(C()&&(Pe(t.state),be(t.state,e)),St(t.state));const r=document.getElementById("setting-energy-threshold");r&&(r.value=e.energyThreshold);const o=document.getElementById("slider-energy-readout");o&&(o.textContent=`${e.energyThreshold} EN`),a.querySelectorAll(".paw-preset-chip").forEach(k=>{const _=parseInt(k.dataset.val,10);k.classList.toggle("active",_===e.energyThreshold)});const i=e.maxFoodDaily??10,s=document.getElementById("aw-bread-cap-desc");s&&(s.textContent=`Terbaca otomatis dari game: ${i} Slot (${i===20?"Akun Premium":"Akun Standar"})`);const n=document.getElementById("aw-bread-cap-badge");n&&(n.textContent=`${i} Slot`,n.style.background=i===20?"rgba(245, 158, 11, 0.15)":"rgba(56, 189, 248, 0.15)",n.style.color=i===20?"#fbbf24":"#38bdf8",n.style.borderColor=i===20?"rgba(245, 158, 11, 0.35)":"rgba(56, 189, 248, 0.35)");const l=document.getElementById("aw-calc-cur-str");l&&(l.textContent=String(t?.state?.trainingStats?.strength||0));const c=document.getElementById("aw-calc-cur-edu");c&&(c.textContent=String(t?.state?.trainingStats?.education||0));const f=document.getElementById("aw-calc-cur-eko");f&&(f.textContent=String(t?.state?.trainingStats?.economy||0));const g=document.getElementById("aw-calc-wallet-gold");if(g){const k=(t?.state?.walletGold||0).toLocaleString("id-ID");g.innerHTML=`<span style="color:#fbbf24;display:flex;align-items:center;">${$.wallet}</span> Dompet: <b style="color:#fbbf24;font-family:ui-monospace,monospace;">${k} Emas</b>`}const y=document.getElementById("wallet-gold-input");y&&(y.value=String(t?.state?.walletGold||0));const m=document.getElementById("setting-auto-train-enabled");m&&(m.checked=!!e.autoTrainEnabled);const x=document.getElementById("setting-train-str-enabled");x&&(x.checked=e.trainStrengthEnabled!==!1);const B=document.getElementById("setting-train-edu-enabled");B&&(B.checked=e.trainEducationEnabled!==!1);const D=document.getElementById("setting-train-eko-enabled");D&&(D.checked=e.trainEconomyEnabled!==!1);const S=document.getElementById("setting-train-priority");S&&(S.value=e.trainPriority||"education");const E=document.getElementById("setting-target-strength");E&&(E.value=String(e.targetStrength||100));const M=document.getElementById("setting-target-education");M&&(M.value=String(e.targetEducation||100));const L=document.getElementById("setting-target-economy");L&&(L.value=String(e.targetEconomy||100));const I=document.getElementById("setting-min-gold-reserve");I&&(I.value=String(e.minGoldReserve??50)),a.updateTrainingCalculator?.();const U=document.getElementById("setting-quiet-mode");U&&(U.checked=!!e.quietModeEnabled);const W=document.getElementById("setting-panel-dashboard-only");W&&(W.checked=!!e.panelDashboardOnly);const T=document.getElementById("setting-panel-leader-only");T&&(T.checked=!!e.panelLeaderOnly);const z=document.getElementById("setting-follow-viewport");z&&(z.checked=!!e.panelFollowViewport);const V=document.getElementById("setting-return-original");V&&(V.checked=!!e.panelReturnToOriginal);const Z=document.getElementById("setting-sound-notification-enabled");Z&&(Z.checked=!!e.soundNotificationEnabled);const b=document.getElementById("setting-sound-notification-volume");b&&(b.value=Math.round(e.soundNotificationVolume*100));const w=document.getElementById("volume-readout");w&&(w.textContent=`${Math.round(e.soundNotificationVolume*100)}%`);const A=document.getElementById("setting-energy-full-sound-enabled");A&&(A.checked=!!e.energyFullAlertSoundEnabled);const j=document.getElementById("setting-notifications");j&&(j.checked=!!e.sendNotification);const H=document.getElementById("setting-energy-full-alert");H&&(H.checked=!!e.energyFullAlertEnabled);const Y=document.getElementById("setting-stealth-jitter");Y&&(Y.checked=!!e.stealthJitterEnabled);const ee=document.getElementById("setting-energy-flush");ee&&(ee.checked=!!e.energyFlushEnabled);const te=document.getElementById("setting-food-reset-reminder");te&&(te.checked=e.foodResetReminderEnabled!==!1);const u=document.getElementById("setting-auto-reload-tab");u&&(u.checked=!!e.autoReloadTabEnabled);const P=document.getElementById("setting-circuit-breaker");P&&(P.checked=!!e.circuitBreakerEnabled);const q=document.getElementById("setting-sleep-schedule");q&&(q.checked=!!e.sleepScheduleEnabled);const K=document.getElementById("setting-sleep-start-time");K&&(K.value=e.sleepStartTime||(e.sleepStartHour!==void 0?String(e.sleepStartHour).padStart(2,"0")+":00":"23:30"));const p=document.getElementById("setting-sleep-end-time");p&&(p.value=e.sleepEndTime||(e.sleepEndHour!==void 0?String(e.sleepEndHour).padStart(2,"0")+":00":"05:45")),["showHide","workNow","pauseResume","openLog","openSettings"].forEach(k=>{const _=document.getElementById(`record-${k}`);_&&e.shortcuts[k]&&(_.textContent=e.shortcuts[k].display||"Klik untuk Set",_.classList.remove("recording"))});const d=document.getElementById("aw-settings-status");d&&(d.style.display="none"),a.style.display="flex",t?.state&&(t.state.settingsOpen=!0);const h=a.querySelector(".aw-tab-btn.active");h&&setTimeout(()=>h.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"}),60),a.recordHandler&&(document.removeEventListener("keydown",a.recordHandler,!0),document.addEventListener("keydown",a.recordHandler,!0)),a.handleEscapeKey&&(document.removeEventListener("keydown",a.handleEscapeKey),document.addEventListener("keydown",a.handleEscapeKey))}function Ta(){if(document.getElementById("aw-log-styles"))return;const e=document.createElement("style");e.id="aw-log-styles",e.textContent=`
        #aw-log-modal {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #e2e8f0;
        }

        /* Filter Pills */
        .aw-log-filter-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 11px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 8px;
            color: #8b9bb4;
            font-size: 11.5px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            white-space: nowrap;
        }
        .aw-log-filter-pill:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.14);
        }
        .aw-log-filter-pill.active {
            color: #00ff88;
            background: linear-gradient(135deg, rgba(0, 255, 136, 0.14), rgba(0, 180, 216, 0.09));
            border-color: rgba(0, 255, 136, 0.5);
            font-weight: 600;
            box-shadow: 0 2px 10px rgba(0, 255, 136, 0.15);
        }
        .aw-log-filter-count {
            font-size: 10px;
            font-weight: 700;
            padding: 1px 6px;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.08);
            color: #94a3b8;
            transition: all 0.2s;
        }
        .aw-log-filter-pill.active .aw-log-filter-count {
            background: rgba(0, 255, 136, 0.2);
            color: #00ff88;
        }

        /* Type Badges */
        .aw-log-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.3px;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .aw-log-badge-success {
            background: rgba(0, 255, 136, 0.12);
            color: #00ff88;
            border: 1px solid rgba(0, 255, 136, 0.25);
        }
        .aw-log-badge-warn {
            background: rgba(255, 209, 102, 0.12);
            color: #ffd166;
            border: 1px solid rgba(255, 209, 102, 0.25);
        }
        .aw-log-badge-error {
            background: rgba(255, 107, 107, 0.12);
            color: #ff6b6b;
            border: 1px solid rgba(255, 107, 107, 0.25);
        }
        .aw-log-badge-info {
            background: rgba(0, 212, 255, 0.12);
            color: #00d4ff;
            border: 1px solid rgba(0, 212, 255, 0.25);
        }
        .aw-log-badge-training {
            background: rgba(129, 140, 248, 0.15);
            color: #a5b4fc;
            border: 1px solid rgba(129, 140, 248, 0.3);
        }
        .aw-log-badge-food {
            background: rgba(249, 115, 22, 0.15);
            color: #fdba74;
            border: 1px solid rgba(249, 115, 22, 0.3);
        }
        .aw-log-badge-work {
            background: rgba(6, 182, 212, 0.15);
            color: #67e8f9;
            border: 1px solid rgba(6, 182, 212, 0.3);
        }

        /* Log Row */
        .aw-log-row {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 7px 10px;
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-left: 3px solid #38bdf8;
            background: rgba(18, 24, 38, 0.65);
            border-radius: 6px;
            margin-bottom: 4px;
            transition: background 0.15s, border-color 0.15s;
            position: relative;
        }
        .aw-log-row:hover {
            background: rgba(30, 41, 59, 0.85);
            border-color: rgba(255, 255, 255, 0.1);
        }
        .aw-log-row:last-child {
            border-bottom: none;
        }
        .aw-log-time {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 11px;
            color: #64748b;
            white-space: nowrap;
            padding-top: 1px;
            flex-shrink: 0;
        }
        .aw-log-msg {
            flex: 1;
            font-size: 12px;
            line-height: 1.45;
            word-break: break-word;
            color: #cbd5e1;
        }
        .aw-log-copy-btn {
            opacity: 0;
            transition: opacity 0.15s, background 0.15s;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #94a3b8;
            border-radius: 4px;
            padding: 2px 7px;
            font-size: 10px;
            cursor: pointer;
            margin-left: auto;
            flex-shrink: 0;
        }
        .aw-log-row:hover .aw-log-copy-btn {
            opacity: 1;
        }
        .aw-log-copy-btn:hover {
            background: rgba(0, 255, 136, 0.15);
            color: #00ff88;
            border-color: rgba(0, 255, 136, 0.4);
        }

        /* Custom Scrollbars */
        #aw-log-entries::-webkit-scrollbar {
            width: 6px;
        }
        #aw-log-entries::-webkit-scrollbar-track {
            background: transparent;
        }
        #aw-log-entries::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.14);
            border-radius: 4px;
        }
        #aw-log-entries::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.28);
        }

        .aw-log-pills-container::-webkit-scrollbar {
            display: none;
        }
    `,document.head.appendChild(e)}function Sa(e,t){Ta();const a=document.getElementById("aw-log-modal");a&&a.remove();const r=document.createElement("div");r.id="aw-log-modal",r.style.cssText=`
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(4, 7, 14, 0.78);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 100003;
        justify-content: center;
        align-items: center;
    `,r.innerHTML=`
        <div style="
            background: linear-gradient(180deg, #131724 0%, #0d101a 100%);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            width: 95%;
            max-width: 680px;
            height: 620px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 1px 1px rgba(255,255,255,0.05);
            overflow: hidden;
        ">
            <!-- Modal Header -->
            <div style="
                padding: 16px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: linear-gradient(135deg, rgba(26, 33, 54, 0.8) 0%, rgba(18, 22, 36, 0.95) 100%);
            ">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="
                        width: 32px; height: 32px; border-radius: 8px;
                        background: linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(2, 132, 199, 0.2));
                        border: 1px solid rgba(56, 189, 248, 0.3);
                        display: flex; align-items: center; justify-content: center;
                        color: #38bdf8;
                    ">${$.fileText}</div>
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 14.5px; letter-spacing: 0.3px;">Activity Log</div>
                        <div style="font-size: 11px; color: #8b9bb4;">Riwayat aktivitas & status kerja bot secara real-time</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button id="aw-copy-all-log" style="
                        background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 11.5px; font-weight: 600; transition: all 0.15s;
                        display: inline-flex; align-items: center; gap: 5px;
                    "><span style="display:flex;align-items:center;">${$.copy}</span> Salin Log</button>
                    <button id="aw-clear-log" style="
                        background: rgba(255, 255, 255, 0.05); color: #ff6b6b; border: 1px solid rgba(255, 107, 107, 0.25);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 11.5px; font-weight: 600; transition: all 0.15s;
                        display: inline-flex; align-items: center; gap: 5px;
                    "><span style="display:flex;align-items:center;">${$.trash}</span> Bersihkan</button>
                    <button id="aw-close-log" style="
                        background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; font-weight: 600; transition: all 0.15s;
                    ">Tutup</button>
                </div>
            </div>

            <!-- Toolbar: Filter Pills & Search Input -->
            <div style="
                padding: 10px 18px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                background: rgba(12, 16, 26, 0.6);
                display: flex;
                gap: 12px;
                align-items: center;
                flex-wrap: wrap;
            ">
                <!-- Category Filter Pills -->
                <div class="aw-log-pills-container" style="display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none;">
                    <button type="button" class="aw-log-filter-pill active" data-type="all">
                        Semua <span class="aw-log-filter-count" id="aw-count-all">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="success">
                        <span style="width:6px;height:6px;border-radius:50%;background:#00ff88;display:inline-block;"></span> Sukses <span class="aw-log-filter-count" id="aw-count-success">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="warn">
                        <span style="width:6px;height:6px;border-radius:50%;background:#ffd166;display:inline-block;"></span> Peringatan <span class="aw-log-filter-count" id="aw-count-warn">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="error">
                        <span style="width:6px;height:6px;border-radius:50%;background:#ff6b6b;display:inline-block;"></span> Error <span class="aw-log-filter-count" id="aw-count-error">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="info">
                        <span style="width:6px;height:6px;border-radius:50%;background:#38bdf8;display:inline-block;"></span> Info <span class="aw-log-filter-count" id="aw-count-info">0</span>
                    </button>
                </div>

                <!-- Hidden select for backward compatibility -->
                <select id="aw-log-filter-type" style="display: none;">
                    <option value="all">Semua</option>
                    <option value="success">Success</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                    <option value="info">Info</option>
                </select>

                <!-- Search Input -->
                <div style="flex: 1; min-width: 170px; position: relative; display: flex; align-items: center;">
                    <span style="position: absolute; left: 10px; color: #64748b; pointer-events: none; display: flex; align-items: center;">${$.search}</span>
                    <input id="aw-log-filter-text" type="text" placeholder="Cari aktivitas (shift, energi, buff)..." style="
                        width: 100%; box-sizing: border-box;
                        background: #141826; color: #fff;
                        border: 1px solid #28334e; border-radius: 8px;
                        padding: 6px 12px 6px 30px; font-size: 11.5px;
                        outline: none; transition: border-color 0.2s;
                    ">
                </div>
            </div>

            <!-- Scrollable Log Entries -->
            <div id="aw-log-entries" style="
                flex: 1;
                overflow-y: auto;
                padding: 12px 18px;
                overscroll-behavior: contain;
                background: rgba(8, 11, 18, 0.4);
            "></div>

            <!-- Sticky Modal Footer -->
            <div style="
                padding: 10px 18px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: linear-gradient(135deg, #131724 0%, #0d101a 100%);
                font-size: 11.5px;
                color: #8b9bb4;
            ">
                <div id="aw-log-status" style="display: flex; align-items: center; gap: 8px;">
                    <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #00ff88; box-shadow: 0 0 8px #00ff88;"></span>
                    <span id="aw-log-summary">Stream aktif • 0 riwayat tersimpan</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button id="aw-export-log-btn" style="
                        background: rgba(255, 255, 255, 0.05); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.1);
                        padding: 5px 12px; border-radius: 6px; cursor: pointer;
                        font-size: 11px; font-weight: 500; transition: all 0.15s;
                    ">Ekspor .txt</button>
                    <button id="aw-close-log-footer" style="
                        background: transparent; color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 5px 14px; border-radius: 6px; cursor: pointer;
                        font-size: 11px; font-weight: 600;
                    ">Tutup</button>
                </div>
            </div>
        </div>
    `,document.body.appendChild(r);function o(){r.style.display="none"}document.getElementById("aw-close-log")?.addEventListener("click",o),document.getElementById("aw-close-log-footer")?.addEventListener("click",o),r.addEventListener("click",c=>{c.target===r&&o()});let i="all",s="";const n=r.querySelectorAll(".aw-log-filter-pill"),l=document.getElementById("aw-log-filter-type");n.forEach(c=>{c.addEventListener("click",()=>{n.forEach(f=>f.classList.remove("active")),c.classList.add("active"),i=c.dataset.type||"all",l&&(l.value=i),Qe(e,i,s)})}),l?.addEventListener("change",c=>{i=c.target.value,n.forEach(f=>f.classList.toggle("active",f.dataset.type===i)),Qe(e,i,s)}),document.getElementById("aw-log-filter-text")?.addEventListener("input",c=>{s=c.target.value.toLowerCase(),Qe(e,i,s)}),document.getElementById("aw-clear-log")?.addEventListener("click",()=>{confirm("Yakin ingin membersihkan semua riwayat Activity Log?")&&(e.logs=[],Xt(),Qe(e,i,s))}),document.getElementById("aw-copy-all-log")?.addEventListener("click",()=>{if(!e.logs||e.logs.length===0)return;const c=e.logs.map(f=>`[${f.time}] [${f.type.toUpperCase()}] ${f.message}`).join(`
`);navigator.clipboard.writeText(c).then(()=>{const f=document.getElementById("aw-copy-all-log");if(f){const g=f.innerHTML;f.innerHTML=`<span style="display:inline-flex;align-items:center;gap:4px;color:#00ff88;">${$.check} Tersalin</span>`,setTimeout(()=>{f.innerHTML=g},1500)}}).catch(()=>{})}),document.getElementById("aw-export-log-btn")?.addEventListener("click",()=>{if(!e.logs||e.logs.length===0){alert("Tidak ada riwayat log untuk diekspor.");return}const c=["=== PARLAMENTUM AUTO WORKER ACTIVITY LOG ===",`Diekspor pada: ${new Date().toLocaleString("id-ID")}`,`Total log: ${e.logs.length}`,`============================================
`,...e.logs.map(x=>`[${x.time}] [${x.type.toUpperCase()}] ${x.message}`)].join(`
`),f=new Blob([c],{type:"text/plain;charset=utf-8"}),g=URL.createObjectURL(f),y=document.createElement("a");y.href=g;const m=new Date().toISOString().slice(0,10);y.download=`parlementum-log-${m}.txt`,document.body.appendChild(y),y.click(),document.body.removeChild(y),URL.revokeObjectURL(g)})}function Ba(e,t){const a=document.getElementById("aw-log-modal");a&&(a.style.display="flex",ct(e))}function ct(e,t){if(document.getElementById("aw-log-modal")?.style.display!=="flex")return;const a=document.getElementById("aw-log-filter-type")?.value||"all",r=(document.getElementById("aw-log-filter-text")?.value||"").toLowerCase();Qe(e,a,r)}function Qe(e,t,a){const r=document.getElementById("aw-log-entries");if(!r)return;const o=e.logs||[],i=o.length;let s=0,n=0,l=0,c=0;o.forEach(E=>{E.type==="success"?s++:E.type==="warn"?n++:E.type==="error"?l++:E.type==="info"&&c++});const f=document.getElementById("aw-count-all"),g=document.getElementById("aw-count-success"),y=document.getElementById("aw-count-warn"),m=document.getElementById("aw-count-error"),x=document.getElementById("aw-count-info");f&&(f.textContent=i),g&&(g.textContent=s),y&&(y.textContent=n),m&&(m.textContent=l),x&&(x.textContent=c);const B=o.filter(E=>(t==="all"||E.type===t)&&(!a||E.message.toLowerCase().includes(a))),D=document.getElementById("aw-log-summary");if(D&&(D.textContent=`Menampilkan ${B.length} dari ${i} riwayat log`),B.length===0){r.innerHTML=`
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #64748b; padding: 40px 20px; text-align: center;">
                <span style="color: #475569; margin-bottom: 12px; display: flex; transform: scale(1.6);">${$.fileText}</span>
                <span style="font-size: 13.5px; font-weight: 600; color: #94a3b8; margin-bottom: 4px;">Tidak ada riwayat aktivitas</span>
                <span style="font-size: 11.5px; color: #64748b;">${i===0?"Belum ada aktivitas yang dicatat.":"Tidak ada log yang cocok dengan filter atau kata kunci."}</span>
            </div>
        `;return}const S={success:{text:"SUKSES",cls:"aw-log-badge-success",dot:"#00ff88"},warn:{text:"WARN",cls:"aw-log-badge-warn",dot:"#ffd166"},error:{text:"ERROR",cls:"aw-log-badge-error",dot:"#ff6b6b"},info:{text:"INFO",cls:"aw-log-badge-info",dot:"#38bdf8"}};r.replaceChildren(...B.map(E=>{const M=document.createElement("div");M.className="aw-log-row";let L=S[E.type]||S.info;const I=(E.message||"").toLowerCase();E.type==="info"&&(/\[auto latihan\]|latihan|target str|target edu|target eko|kekuatan|pendidikan|ekonomi/i.test(I)?L={text:"LATIHAN",cls:"aw-log-badge-training",dot:"#818cf8"}:/roti|makanan|kuota roti|slot makanan|makan/i.test(I)?L={text:"ROTI",cls:"aw-log-badge-food",dot:"#f97316"}:/shift|kerja|worker/i.test(I)?L={text:"KERJA",cls:"aw-log-badge-work",dot:"#06b6d4"}:/reset server|utc|hari berganti|token|auth/i.test(I)&&(L={text:"SISTEM",cls:"aw-log-badge-info",dot:"#38bdf8"})),M.style.borderLeft=`3px solid ${L.dot}`;const U=document.createElement("span");U.className="aw-log-time",U.textContent=E.time||"--:--:--";const W=document.createElement("span");W.className=`aw-log-badge ${L.cls}`,W.innerHTML=`<span style="width:5px;height:5px;border-radius:50%;background:${L.dot};display:inline-block;margin-right:4px;"></span>${L.text}`;const T=document.createElement("span");T.className="aw-log-msg",T.textContent=(E.message||"").replace(/^\[\d{2}[.:]\d{2}[.:]\d{2}\]\s*/,"");const z=document.createElement("button");return z.className="aw-log-copy-btn",z.textContent="Salin",z.title="Salin baris log ini",z.addEventListener("click",V=>{V.stopPropagation(),navigator.clipboard.writeText(`[${E.time}] ${E.message}`).then(()=>{z.textContent="Tersalin",z.style.color="#00ff88",setTimeout(()=>{z.textContent="Salin",z.style.color="#94a3b8"},1200)}).catch(()=>{})}),M.append(U,W,T,z),M}))}const Ma="PARLAMENTUM_INTERCEPTOR",Aa="PARLAMENTUM_EXTENSION";function Da(e,t,a){if(!e._interceptorClientInitialized){e._interceptorClientInitialized=!0,window.addEventListener("message",r=>{if(!r||r.source!==window)return;const o=r.data;if(!(!o||o.source!==Ma))switch(o.type){case"READY":case"PONG":e.interceptorActive=!0;break;case"AUTH_TOKEN":o.token&&typeof o.token=="string"&&o.token!==e.currentToken&&a?.handleNewToken&&a.handleNewToken(o.token,"network_interceptor");break;case"ENERGY_SYNC":La(e,o,a);break;case"WORK_SUCCESS":$a(e,o,a);break;case"WORK_REJECTED":Ra(e,o,a);break;case"FOOD_STATUS":if(typeof o.foodEatenToday=="number"){const i=t.maxFoodDaily||10;e.foodEatenToday=Math.max(0,Math.min(i,Math.round(o.foodEatenToday))),v("aw_foodEatenToday",e.foodEatenToday.toString()),me({type:"FOOD_UPDATED",foodEatenToday:e.foodEatenToday,timestamp:Date.now()}),a?.updatePanel?.()}break;case"FOOD_CONSUMED":{const i=Date.now();if(e._lastFoodConsumedAt&&i-e._lastFoodConsumedAt<1e3)break;if(e._lastFoodConsumedAt=i,a?.readBreadQuotaFromDom){setTimeout(()=>{a.readBreadQuotaFromDom(),a?.updatePanel?.()},350);break}const s=t.maxFoodDaily||10,n=e.foodEatenToday||0;n<s&&(e.foodEatenToday=n+1,v("aw_foodEatenToday",e.foodEatenToday.toString()),me({type:"FOOD_UPDATED",foodEatenToday:e.foodEatenToday,timestamp:Date.now()}),a?.log?.(`Makan roti terdeteksi (+1): ${e.foodEatenToday}/${s} slot terpakai.`,"info"),a?.updatePanel?.());break}case"PREMIUM_STATUS":o.isPremium&&t.maxFoodDaily!==20&&(t.maxFoodDaily=20,v("aw_maxFoodDaily","20"),a?.saveConfig?.(t),a?.log?.("Akun Premium terdeteksi: Kuota makanan harian disesuaikan jadi 20 slot.","info"),a?.updatePanel?.());break;case"WALLET_GOLD_SYNC":typeof o.gold=="number"&&o.gold>=0&&o.gold!==e.walletGold&&(e.walletGold=o.gold,v("aw_wallet_gold",o.gold.toString()),a?.saveLiveStatus?.(!0),a?.updatePanel?.());break;case"PLAYER_STATS_SYNC":if(o&&typeof o=="object"){e.trainingStats||(e.trainingStats={strength:0,education:0,economy:0});let i=!1;["strength","education","economy"].forEach(s=>{typeof o[s]=="number"&&o[s]>=0&&o[s]!==e.trainingStats[s]&&(e.trainingStats[s]=o[s],v(`aw_stat_${s}`,o[s].toString()),i=!0)}),i&&(a?.saveLiveStatus?.(!0),a?.updatePanel?.())}break;case"TRAIN_SUCCESS":a?.handleTrainSuccess?.(o);break;case"TRAIN_REJECTED":a?.handleTrainRejected?.(o);break}});try{window.postMessage({source:Aa,action:"PING"},"*")}catch{}setTimeout(()=>{if(!e.interceptorActive&&chrome.runtime?.getURL)try{const r=document.createElement("script");r.src=chrome.runtime.getURL("interceptor.js"),r.async=!1,(document.head||document.documentElement).appendChild(r),r.onload=()=>r.remove()}catch{}},350)}}function La(e,t,a){const r=t.currentEnergy,o=t.maxEnergy;let i=!1;if(typeof r=="number"&&Number.isFinite(r)){const s=Math.max(0,Math.round(r));(s>0||e.hasInitialDomEnergyRead||e.postShiftEnergy===0)&&(e.currentEnergy=s,i=!0)}typeof o=="number"&&Number.isFinite(o)&&o>0&&(e.maxEnergy=Math.round(o),i=!0),i&&(e.energySyncBase={current:e.currentEnergy,max:e.maxEnergy||110,updatedAt:Date.now(),regenRate:e.regenRate||1},a?.updatePanel?.())}function $a(e,t,a){const r=Number(t.energyUsed)||Number(t.raw?.energyUsed)||0,o=Number(t.xpEarned)>0?Number(t.xpEarned):Number(t.raw?.xpEarned)||0,i=o>0?Math.round(o/4*10):0,s=r>=10?r:i>=10?i:e.currentEnergy>=10?e.currentEnergy:10,n=Math.max(4,Math.floor(s/10)*4),l=o>0?o:n,c=Number(t.workerUnits)||Number(t.produced)||Number(t.raw?.workerUnits)||Number(t.raw?.produced)||0;if(e.workInFlight&&!e.workTriggeredViaDom)return;const f=!!e.workTriggeredViaDom;e.workTriggeredViaDom=!1,e.workInFlight=!1,t.remainingEnergy!=null&&typeof t.remainingEnergy=="number"?e.currentEnergy=Math.max(0,Math.round(t.remainingEnergy)):e.currentEnergy=Math.max(0,(e.currentEnergy||0)-s),e.shiftExecutedInSession=!0,e.postShiftEnergy=e.currentEnergy,e.domEnergyStale=!0,e.lastWorkTimestamp=Date.now(),e.energySyncBase={current:e.currentEnergy,max:e.maxEnergy||110,updatedAt:Date.now(),regenRate:e.regenRate||1};const g=new Date().toLocaleTimeString("id-ID");e.workToday=(e.workToday||0)+1,e.totalWorked=(e.totalWorked||0)+1,e.xpToday=(e.xpToday||0)+l,e.totalWorkXP=(e.totalWorkXP||0)+l,e.lastWorkTime=g,a?.getNextWorkDelay&&(e.nextWorkTimestamp=Date.now()+a.getNextWorkDelay(e)),a?.setValue?.("workToday",e.workToday),a?.setValue?.("totalWorked",e.totalWorked),a?.setValue?.("xpToday",e.xpToday),a?.setValue?.("totalWorkXP",e.totalWorkXP);const y=c>0?` | +${c} unit`:"",m=f?`Kerja sukses! +${l} XP${y}`:`Shift di game terdeteksi: +${l} XP${y}`;a?.log?.(m,"success"),a?.saveLiveStatus?.(!0),a?.updatePanel?.(),setTimeout(()=>{e.shiftExecutedInSession=!1;const x=a?.getCurrentEnergy?.();x&&x.current<=(e.postShiftEnergy||0)+2&&(e.currentEnergy=x.current,e.maxEnergy=x.max,e.energySyncBase={current:x.current,max:x.max,updatedAt:Date.now(),regenRate:e.regenRate||1},e.domEnergyStale=!1,a?.saveLiveStatus?.(!0),a?.updatePanel?.())},1500)}function Ra(e,t,a){const r=String(t.message||t.raw?.message||"");if(/(?:not enough energy|produce even one unit|insufficient|tidak cukup|kurang)/i.test(r)){const o=Date.now();e.currentEnergy=0,e.postShiftEnergy=0,e.lastWorkTimestamp=o,e.domEnergyStale=!0,e.energySyncBase={current:0,max:e.maxEnergy||110,updatedAt:o,regenRate:e.regenRate||1},a?.saveLiveStatus?.(!0),a?.updatePanel?.()}}function Se(e,t){const a=setInterval(()=>{if(!pe()){clearInterval(a);return}try{e()}catch(r){r?.message?.includes("Extension context invalidated")?clearInterval(a):console.error("[Interval Error]",r)}},t);return a}(async function(){await An();const t=Rn(),a=new Date().toDateString(),r=Q("sessionStartDay","");let o=X("sessionStartTime",Date.now(),1);r!==a&&(o=Date.now(),v("sessionStartTime",o.toString()),v("sessionStartDay",a));const i=Q("aw_workResultUncertain","false")==="true";let s=null;try{const p=Q("aw_uncertainEnergyBefore","");s=p?JSON.parse(p):null}catch{}const n=jn(t,o,i);let l=ot(n,t);Pa(n);const c=$t();function f(p){me(p)}const g=(p,d,h)=>Kn(n,t,p,d,h),y=(p,d)=>Yn(n,g,()=>E?.(),p,d,()=>he(!0),()=>B()),m=()=>rt(n,y),x={state:n,CONFIG:t,get workHistory(){return l},set workHistory(p){l=p},log:g,handleNewToken:y,setRunningUI:p=>he(p),sendNotification:(p,d,h)=>qt(p===t?d:p,p===t?h:d),playNotificationSound:(p,d)=>Nn(p,d),playEnergyFullAlarm:p=>Zn(p||t),updatePanel:()=>B(),updatePanelVisibility:p=>Ke(n,p||t),wakePendingWork:()=>E?.(),setValue:v,get uncertainEnergyBefore(){return s},set uncertainEnergyBefore(p){s=p},reconcileUncertainWork:S,getSyncedEnergy:p=>Ee(p),getPlayerLevel:p=>Wn(p),getMaxEnergyForLevel:p=>_n(p),getLiveCountdown:p=>wt(p,t),getTimeToFullEnergy:p=>xt(p),getNextWorkDelay:p=>Le(p,t),getRegionDetails:(p=!1)=>nt(p),doWork:(p=!1)=>Je(x,p),openSettings:()=>At(t,x),openLogViewer:()=>Ba(n),saveConfig:p=>tt(p),saveLiveStatus:(p=!1)=>N(n,t,p),getCurrentEnergy:()=>ge(),reloadStateFromStorage:()=>kt(n,()=>{l=ot(n,t)}),patchPageVisualEnergy:(p,d,h)=>In(p,d,h),executeAutoTrain:()=>Bt(x),autoConfirmTrainingModal:()=>Ze(x),handleTrainSuccess:p=>Gt(p,n,t,x),handleTrainRejected:p=>ga(p,n,t,x),readBreadQuotaFromDom:()=>be(n,t,g)};Da(n,t,x),Hn(()=>ct(n));function B(){Mt(n,t,l,x)}function D(){if(!chrome.runtime?.id)return;const p=new Date().toISOString().slice(0,10),d=new Date().toDateString(),h=Q("aw_foodUtcDate","");h&&h!==p?(n.foodEatenToday=0,v("aw_foodEatenToday","0"),v("aw_foodUtcDate",p),f({type:"FOOD_UPDATED",foodEatenToday:0,timestamp:Date.now()}),g("Reset server 00:00 UTC tercapai. Kuota makanan harian di-reset ke 0.","info")):h||v("aw_foodUtcDate",p),!(n.lastWorkDate===d&&h===p)&&(n.lastWorkDate!==d&&(n.workToday=0,n.xpToday=0,n.lastWorkDate=d,n.sessionStartTime=Date.now(),v("sessionStartTime",n.sessionStartTime.toString()),v("sessionStartDay",d),l[d]||(l[d]={shifts:0,xp:0}),v("workToday","0"),v("xpToday","0"),v("lastWorkDate",d),Ht(l),g("Hari berganti. Counter shift harian & sesi di-reset.","info")),B())}function S(){if(!chrome.runtime?.id||!n.workResultUncertain||!s)return;const p=ge();p&&(p.current<s.current?n.uncertainReconciliation!=="energy_changed"&&(n.uncertainReconciliation="energy_changed",g(`Perubahan energi terdeteksi (${s.current} → ${p.current}). Shift mungkin diproses.`,"warn")):n.uncertainReconciliation==="energy_changed"&&(n.uncertainReconciliation="pending"),B())}x.reconcileUncertainWork=S;let E=null,M=null,L=null;try{const p=new Blob([`
            let t = null;
            self.onmessage = e => {
                if (t !== null) clearTimeout(t);
                t = setTimeout(() => self.postMessage('wake'), Math.max(10, e.data));
            };
        `],{type:"application/javascript"});L=new Worker(URL.createObjectURL(p))}catch{L=null}function I(p){return new Promise(d=>{let h=!1;const k=()=>{h||(h=!0,M!==null&&clearTimeout(M),M=null,E=null,L&&(L.onmessage=null),d())};E=k;const _=Math.min(p,15e3);L&&(L.onmessage=k,L.postMessage(Math.max(10,_))),M=setTimeout(k,_)})}x.wakePendingWork=()=>E?.();const U=(p=window.location.pathname)=>/^\/(login|register|signup|forgot-password|reset-password)/i.test(p);if(U()){console.log(`[Auto Worker] Halaman autentikasi terdeteksi (${window.location.pathname}). Isolasi aktif: DOM tidak dimodifikasi agar form login tetap utuh.`),Fn(g),Gn(t,g,qt),nn(()=>{U()||(console.log(`[Auto Worker] Navigasi ke halaman game terdeteksi (${window.location.pathname}). Memuat lingkungan game...`),window.location.reload())});return}if(n.tabLockManaged=!!navigator?.locks?.request,n.isTabLockOwner=!n.tabLockManaged,!C())try{pe()&&chrome.storage?.local?.get?.(["aw_has_dashboard_tab"],p=>{typeof p?.aw_has_dashboard_tab=="boolean"&&(n.hasActiveDashboardTab=p.aw_has_dashboard_tab)})}catch{}_a(g,t,n);const W=Q("aw_live_status");if(W&&typeof W=="object"){const p=W.maxEnergy||n.maxEnergy||110;if(n.maxEnergy=p,W.regenRate!=null&&(n.regenRate=W.regenRate),W.regionHealthBonusPercent!=null&&(n.regionHealthBonusPercent=W.regionHealthBonusPercent),W.regionName&&(n.regionName=W.regionName),W.lastWorkTimestamp&&(n.lastWorkTimestamp=W.lastWorkTimestamp),W.energySyncBase&&typeof W.energySyncBase.current=="number"){n.energySyncBase={...W.energySyncBase};const d=ze(n.energySyncBase,Date.now());typeof d=="number"&&d>0?n.currentEnergy=Math.min(p,d):typeof W.currentEnergy=="number"&&W.currentEnergy>0&&(n.currentEnergy=Math.min(p,W.currentEnergy))}else typeof W.currentEnergy=="number"&&W.currentEnergy>0&&(n.currentEnergy=Math.min(p,W.currentEnergy),n.energySyncBase={current:n.currentEnergy,max:p,updatedAt:W.updatedAt||Date.now(),regenRate:n.regenRate||1})}const T=ge();T&&(T.current>0||n.currentEnergy<=0||n.postShiftEnergy===0)&&(n.hasInitialDomEnergyRead=!0,n.currentEnergy=T.current,n.maxEnergy=T.max,n.domEnergyStale=!1,n.energySyncBase={current:T.current,max:T.max,updatedAt:Date.now()}),m(),ya(n,t,x),he(n.running),n.running||g("Auto Worker dalam kondisi DIJEDA (status disimpan dari sesi sebelumnya).","warn",!1);const z=Q("aw_recent_logs");if(Array.isArray(z)&&(n.logs=z.filter(p=>p&&typeof p.message=="string"&&!/^Panel v[\d.]+\s+siap!/i.test(p.message)&&!/^Auto Worker v[\d.]+/i.test(p.message))),Sa(n),Ea(t,x),Vn(n,y,m),nn(()=>{U()&&(console.log(`[Auto Worker] Logout / Navigasi ke auth page terdeteksi (${window.location.pathname}). Mengalihkan ke mode isolasi...`),window.location.reload()),n.userManuallyToggledPanel=!1;const p=window.location.pathname||"",d=p==="/dashboard"||p.startsWith("/dashboard/")||p==="/"||p==="";t.panelDashboardOnly&&d&&(n.panelVisible=!0,v("panelVisible","true")),d&&Rt(5e3).then(h=>{h&&(h.current>0||n.currentEnergy<=0||n.postShiftEnergy===0)&&(n.currentEnergy=h.current,n.maxEnergy=h.max,n.domEnergyStale=!1,n.energySyncBase={current:h.current,max:h.max,updatedAt:Date.now()},N(n,t),B())}),nt(!0),Ke(n,t)}),C())Rt(15e3).then(p=>{if(p){if(p.current>0||n.currentEnergy<=0||n.postShiftEnergy===0){n.hasInitialDomEnergyRead=!0,n.currentEnergy=p.current,n.maxEnergy=p.max,n.domEnergyStale=!1,n.energySyncBase={current:p.current,max:p.max,updatedAt:Date.now()};const d=nt(!0),h=d.bonusMultiplier||1;if(n.regenRate=h,n.regionHealthBonusPercent=d.bonusPercent||0,n.regionHealthBonusPercent>0||h>1){const k=n.regionHealthBonusPercent||Math.round((h-1)*100);g(`Buff Kota: Kesehatan +${k}% pemulihan energi pasif (${h}x / mnt)`,"info",!1)}g(`Energi terbaca: ${n.currentEnergy}/${n.maxEnergy}`,"info",!1),N(n,t,!0),B()}}else n.hasInitialDomEnergyRead=!0,g("Elemen energi tidak ditemukan dalam 15 detik. Energi akan terbaca saat panel update.","warn")});else{n.hasInitialDomEnergyRead=!0;const p=Ee(n);p&&(n.currentEnergy=p.current,n.maxEnergy=p.max),B()}Se(()=>{n.running&&Wa(n,t,g,x)},Math.min(t.tokenRefreshInterval,6e4)),Se(D,6e4),Se(()=>{C()&&be(n,t,g),B(),t.autoTrainEnabled&&Ze(x)},1e3),Se(S,1e4),Se(()=>{t.autoTrainEnabled&&(Ze(x),Bt(x))},3500),P(),q(),C()&&be(n,t,g),t.autoTrainEnabled&&Ze(x);const V=C();c&&(V&&f({type:"CLAIM_LEADERSHIP_FOR_DASHBOARD",timestamp:Date.now()}),c.onmessage=p=>{const d=p?.data;!d||typeof d!="object"||(d.type==="TRAIN_UPDATED"&&(d.activeTraining!==void 0&&(n.activeTraining=d.activeTraining),d.walletGold!=null&&(n.walletGold=d.walletGold),B()),d.type==="WORK_SHIFT_COMPLETED"&&(!C()||!n.isTabLockOwner)&&(n.domEnergyStale=!0,d.currentEnergy!=null&&(n.currentEnergy=d.currentEnergy,n.postShiftEnergy=d.currentEnergy,n.maxEnergy=d.maxEnergy||n.maxEnergy,n.energySyncBase=d.energySyncBase?{...d.energySyncBase}:{current:d.currentEnergy,max:n.maxEnergy,updatedAt:d.timestamp||Date.now(),regenRate:n.regenRate||1}),d.workToday!=null&&(n.workToday=d.workToday),d.xpToday!=null&&(n.xpToday=d.xpToday),d.totalWorked!=null&&(n.totalWorked=d.totalWorked),d.totalWorkXP!=null&&(n.totalWorkXP=d.totalWorkXP),d.lastWorkTime&&(n.lastWorkTime=d.lastWorkTime),d.lastWorkTimestamp!=null&&(n.lastWorkTimestamp=d.lastWorkTimestamp),d.nextWorkTimestamp!=null&&(n.nextWorkTimestamp=d.nextWorkTimestamp),d.serverCooldownUntil!=null&&(n.serverCooldownUntil=d.serverCooldownUntil),B()),d.type==="DASHBOARD_HEARTBEAT"&&(n.hasActiveDashboardTab=!0,n.lastDashboardHeartbeat=Date.now(),!C()&&n.isTabLockOwner&&(n.shouldYieldLock=!0,E?.()),C()||(d.currentEnergy!=null&&(n.currentEnergy=d.currentEnergy,n.maxEnergy=d.maxEnergy||n.maxEnergy,n.energySyncBase=d.energySyncBase?{...d.energySyncBase}:{current:d.currentEnergy,max:n.maxEnergy,updatedAt:d.timestamp||Date.now(),regenRate:d.regenRate||n.regenRate||1}),d.regenRate!=null&&(n.regenRate=d.regenRate),d.workToday!=null&&(n.workToday=d.workToday),d.xpToday!=null&&(n.xpToday=d.xpToday),d.totalWorked!=null&&(n.totalWorked=d.totalWorked),d.totalWorkXP!=null&&(n.totalWorkXP=d.totalWorkXP),d.lastWorkTime&&(n.lastWorkTime=d.lastWorkTime),d.nextWorkTimestamp!=null&&(n.nextWorkTimestamp=d.nextWorkTimestamp),d.foodEatenToday!=null&&d.foodEatenToday!==n.foodEatenToday&&(n.foodEatenToday=d.foodEatenToday,v("aw_foodEatenToday",n.foodEatenToday.toString())),d.maxFoodDaily!=null&&d.maxFoodDaily!==t.maxFoodDaily&&(t.maxFoodDaily=d.maxFoodDaily),d.trainingStats&&(n.trainingStats={...d.trainingStats}),d.activeTraining!==void 0&&(n.activeTraining=d.activeTraining),d.walletGold!=null&&(n.walletGold=d.walletGold),B())),d.type==="FOOD_UPDATED"&&typeof d.foodEatenToday=="number"&&n.foodEatenToday!==d.foodEatenToday&&(n.foodEatenToday=d.foodEatenToday,v("aw_foodEatenToday",n.foodEatenToday.toString()),N(n,t,!0),B()),d.type==="TOGGLE_RUNNING"&&typeof d.running=="boolean"&&n.running!==d.running&&(n.running=d.running,v("aw_worker_running",d.running.toString()),he(n.running),B(),n.running&&E?.()),d.type==="CLAIM_LEADERSHIP_FOR_DASHBOARD"&&(n.hasActiveDashboardTab=!0,n.lastDashboardHeartbeat=Date.now(),!C()&&n.isTabLockOwner&&(console.log("[Auto Worker] Tab Dashboard terdeteksi. Mengalihkan worker lock ke tab Dashboard."),n.shouldYieldLock=!0,E?.())),d.type==="DASHBOARD_CLOSED"&&(n.hasActiveDashboardTab=!1,n.lastDashboardHeartbeat=0))},Se(()=>{c&&C()&&n.isTabLockOwner&&n.currentEnergy!=null&&f({type:"DASHBOARD_HEARTBEAT",currentEnergy:n.currentEnergy,maxEnergy:n.maxEnergy,energySyncBase:n.energySyncBase,regenRate:n.regenRate,workToday:n.workToday,xpToday:n.xpToday,totalWorked:n.totalWorked,totalWorkXP:n.totalWorkXP,lastWorkTime:n.lastWorkTime,nextWorkTimestamp:n.nextWorkTimestamp,foodEatenToday:n.foodEatenToday,maxFoodDaily:t.maxFoodDaily||10,trainingStats:n.trainingStats,activeTraining:n.activeTraining,walletGold:n.walletGold,timestamp:Date.now()})},2e3),Se(()=>{if(!C()){if(!pe())return;try{chrome.storage?.local?.get?.(["aw_has_dashboard_tab"],p=>{typeof p?.aw_has_dashboard_tab=="boolean"?n.hasActiveDashboardTab=p.aw_has_dashboard_tab:n.lastDashboardHeartbeat&&Date.now()-n.lastDashboardHeartbeat>25e3&&(n.hasActiveDashboardTab=!1)})}catch{}}},4e3));try{chrome.runtime.onMessage.addListener((p,d,h)=>{if(p?.type==="POPUP_COMMAND"){if(p.action==="toggleRunning"){const k=p.value!=null?!!p.value:!n.running;return n.running=k,v("aw_worker_running",k.toString()),f({type:"TOGGLE_RUNNING",running:k}),he(k),B(),N(n,t,!0),g(`Auto Worker ${k?"dilanjutkan":"dijeda"} via Popup toolbar.`,"info"),k&&E?.(),h({ok:!0,running:n.running}),!0}if(p.action==="openSettings")return At(t,x),h({ok:!0}),!0;if(p.action==="workNow")return g("Manual work dipicu via Popup toolbar.","info"),n.tokenExpired||n.pausedForToken||!n.currentToken?(h({ok:!1,error:"token_expired"}),!0):(Je(x,!0).then(k=>{N(n,t,!0),B(),k==="worked"?h({ok:!0,isLockOwner:n.isTabLockOwner,result:k}):k==="paused"&&(n.pausedForToken||n.tokenExpired)?h({ok:!1,error:"token_expired"}):k==="waiting"&&n.currentEnergy<10?h({ok:!1,error:"insufficient_energy"}):h({ok:!1,error:k||"work_failed"})}).catch(k=>{h({ok:!1,error:k.message})}),!0);if(p.action==="getStatus"){if(C()){const _=Ee(n);_&&(n.currentEnergy=_.current,n.maxEnergy=_.max);const G=n.hasInitialDomEnergyRead||n.currentEnergy>0||n.postShiftEnergy===0;h({ok:!0,status:N(n,t,G)})}else h({ok:!0,status:N(n,t,!1)});return!0}if(p.action==="getLogs")return h({ok:!0,logs:n.logs||[]}),!0;if(p.action==="clearLogs")return n.logs=[],Xt(),ct(n,t),h({ok:!0}),!0;if(p.action==="setFoodCount"){const k=t.maxFoodDaily||10,_=Math.max(0,Math.min(k,Number(p.value)||0));return n.foodEatenToday=_,v("aw_foodEatenToday",_.toString()),N(n,t,!0),f({type:"FOOD_UPDATED",foodEatenToday:_,timestamp:Date.now()}),B(),h({ok:!0,foodEatenToday:_}),!0}}if(p?.type==="CONFIG_UPDATED"&&p.config)return Object.assign(t,p.config),B(),t.autoTrainEnabled&&Bt(x),h({ok:!0}),!0;if(p?.type==="STORAGE_SYNC"&&p.action==="backgroundWorkDone")return p.energy!=null&&(n.currentEnergy=p.energy,n.postShiftEnergy=p.energy,n.lastWorkTimestamp=Date.now(),n.domEnergyStale=!0,n.energySyncBase={current:p.energy,max:p.maxEnergy||n.maxEnergy||110,updatedAt:Date.now()}),p.status&&(p.status.workToday!=null&&(n.workToday=p.status.workToday),p.status.xpToday!=null&&(n.xpToday=p.status.xpToday),p.status.totalWorked!=null&&(n.totalWorked=p.status.totalWorked),p.status.totalWorkXP!=null&&(n.totalWorkXP=p.status.totalWorkXP),p.status.lastWorkTime&&(n.lastWorkTime=p.status.lastWorkTime),p.status.nextWorkTimestamp!=null&&(n.nextWorkTimestamp=p.status.nextWorkTimestamp)),n.workInFlight=!1,n.workResultUncertain=!1,n.energyFullAlertActive=!1,B(),h({ok:!0}),!0;if(p?.type==="EXECUTE_WORK_NOW")return(async()=>{try{if(!n.running&&!p.manual){h({ok:!1,result:"paused"});return}if(n.workInFlight)if(Date.now()-(n.workInFlightAt||0)>15e3)n.workInFlight=!1;else{h({ok:!1,result:"busy"});return}if(n.tokenExpired||n.pausedForToken||!n.currentToken){h({ok:!1,result:"token_expired"});return}if(n.tabLockManaged&&!n.isTabLockOwner){h({ok:!1,result:"standby"});return}const k=Ee(n);k&&(n.currentEnergy=k.current,n.maxEnergy=k.max);const _=ye(n,t);if(!p.manual&&n.currentEnergy<_){h({ok:!0,result:"waiting",energy:n.currentEnergy});return}g("Trigger background: Menjalankan shift kerja otomatis...","info");const G=await Je(x,!!p.manual);N(n,t,!0),B(),h({ok:G==="worked",result:G,energy:n.currentEnergy,isLockOwner:!!n.isTabLockOwner})}catch(k){h({ok:!1,error:k?.message||String(k)})}})(),!0;if(p?.type==="WAKE_WORKER")return(async()=>{try{const k=Q("aw_live_status");k&&(k.lastWorkTimestamp&&k.lastWorkTimestamp>(n.lastWorkTimestamp||0)&&(n.lastWorkTimestamp=k.lastWorkTimestamp,n.currentEnergy=k.currentEnergy,n.domEnergyStale=!0,k.energySyncBase&&(n.energySyncBase={...k.energySyncBase})),k.regenRate!=null&&(n.regenRate=k.regenRate),k.regionHealthBonusPercent!=null&&(n.regionHealthBonusPercent=k.regionHealthBonusPercent),k.regionName&&(n.regionName=k.regionName),k.nextWorkTimestamp&&(n.nextWorkTimestamp=k.nextWorkTimestamp),k.workToday!=null&&(n.workToday=k.workToday),k.xpToday!=null&&(n.xpToday=k.xpToday),k.totalWorked!=null&&(n.totalWorked=k.totalWorked),k.totalWorkXP!=null&&(n.totalWorkXP=k.totalWorkXP),k.serverCooldownUntil!=null&&(n.serverCooldownUntil=k.serverCooldownUntil));const _=C(),G=n.tabLockManaged?n.isTabLockOwner:_||!n.hasActiveDashboardTab;if(n.running){const oe=Ee(n);oe&&(n.currentEnergy=oe.current,n.maxEnergy=oe.max);const ce=n.lastWorkTimestamp&&Date.now()-n.lastWorkTimestamp<3e4,we=!!(n.serverCooldownUntil&&Date.now()<n.serverCooldownUntil),We=!!(n.nextWorkTimestamp&&Date.now()<n.nextWorkTimestamp),_e=!!(n.microBreakUntil&&Date.now()<n.microBreakUntil),qe=!!(n.backoffUntil&&Date.now()<n.backoffUntil),le=ye(n,t),Ie=n.currentEnergy>=le&&!we&&!We&&!_e&&!qe;n.workInFlight&&Date.now()-(n.workInFlightAt||0)>15e3&&(n.workInFlight=!1);const xe=Q("aw_work_mutex"),Be=xe&&Date.now()<Number(xe);if(G&&Ie&&!ce&&!n.workInFlight&&!n.workResultUncertain&&!Be){v("aw_work_mutex",(Date.now()+2e4).toString()),g("Background wake: Energi target tercapai, mengeksekusi shift kerja...","info");let fe="retry";try{fe=await Je({...x},!1)}finally{v("aw_work_mutex","0")}N(n,t,!0),B(),h({handled:!0,isLockOwner:!!n.isTabLockOwner,energy:n.currentEnergy,energySyncBase:n.energySyncBase,worked:fe==="worked",result:fe});return}}B(),(_||!n.hasActiveDashboardTab)&&N(n,t),h({handled:!0,isLockOwner:!!n.isTabLockOwner,energy:n.currentEnergy,energySyncBase:n.energySyncBase,worked:!1})}catch(k){h({handled:!1,error:k?.message})}})(),!0})}catch{}Ln((p,d)=>{if(p==="aw_has_dashboard_tab"&&typeof d=="boolean"&&(n.hasActiveDashboardTab=d,!C()&&n.hasActiveDashboardTab&&n.isTabLockOwner&&(n.shouldYieldLock=!0,E?.())),p==="aw_live_status"&&d){const h=!!(d.lastWorkTimestamp&&d.lastWorkTimestamp>(n.lastWorkTimestamp||0)||d.lastWorkTime&&d.lastWorkTime!==n.lastWorkTime&&(d.totalWorked||0)>(n.totalWorked||0));d.serverCooldownUntil!=null&&(n.serverCooldownUntil=d.serverCooldownUntil);const k=typeof document<"u"&&document.hidden;if(!n.isTabLockOwner||!C()||h||k){if(d.workToday!=null&&(n.workToday=d.workToday),d.xpToday!=null&&(n.xpToday=d.xpToday),d.totalWorked!=null&&(n.totalWorked=d.totalWorked),d.totalWorkXP!=null&&(n.totalWorkXP=d.totalWorkXP),d.lastWorkTime&&(n.lastWorkTime=d.lastWorkTime),d.nextWorkTimestamp!=null&&(n.nextWorkTimestamp=d.nextWorkTimestamp),d.lastWorkTimestamp&&d.lastWorkTimestamp>(n.lastWorkTimestamp||0)&&(n.lastWorkTimestamp=d.lastWorkTimestamp),d.regenRate!=null&&(n.regenRate=d.regenRate),d.regionHealthBonusPercent!=null&&(n.regionHealthBonusPercent=d.regionHealthBonusPercent),d.regionName&&(n.regionName=d.regionName),d.energySyncBase&&typeof d.energySyncBase.current=="number"){const G=d.energySyncBase.updatedAt||0,oe=n.energySyncBase?.updatedAt||0;G>oe||!n.energySyncBase?n.energySyncBase={current:d.energySyncBase.current,max:d.energySyncBase.max||d.maxEnergy||n.maxEnergy||115,updatedAt:G||Date.now(),regenRate:d.energySyncBase.regenRate||d.regenRate||n.regenRate||1}:d.energySyncBase.regenRate&&n.energySyncBase.regenRate!==d.energySyncBase.regenRate&&(n.energySyncBase.regenRate=d.energySyncBase.regenRate)}else d.currentEnergy!=null&&!n.energySyncBase&&(n.energySyncBase={current:d.currentEnergy,max:d.maxEnergy||n.maxEnergy||115,updatedAt:d.updatedAt||Date.now(),regenRate:d.regenRate||n.regenRate||1});const _=ze(n.energySyncBase,Date.now());n.currentEnergy=_,d.maxEnergy!=null&&(n.maxEnergy=d.maxEnergy)}B()}if(p==="aw_config"&&d)try{Object.assign(t,typeof d=="string"?JSON.parse(d):d),B()}catch{}p==="aw_recent_logs"&&(n.logs=Array.isArray(d)?[...d]:[],ct(n))}),document.addEventListener("visibilitychange",H),window.addEventListener("focus",H),window.addEventListener("online",Z),window.addEventListener("offline",b),window.addEventListener("beforeunload",w);function Z(){chrome.runtime?.id&&(n.isOffline=!1,Y=0,g("Koneksi internet pulih (online). Memeriksa jadwal kerja...","info"),B(),E?.())}function b(){chrome.runtime?.id&&(n.isOffline=!0,g("Koneksi internet terputus (offline). Menunggu jaringan kembali...","warn"),B())}function w(){C()&&f({type:"DASHBOARD_CLOSED",timestamp:Date.now()})}let A=!1,j=0;function H(){if(!pe()||document.visibilityState==="hidden")return;const p=Date.now();if(!(p-j<500||A)){j=p,A=!0;try{if(n.lastForegroundReturnTime=p,Ke(n,t),!pe()){A=!1;return}chrome.storage.local.get(["aw_live_status","aw_has_dashboard_tab"],d=>{try{typeof d?.aw_has_dashboard_tab=="boolean"&&!C()&&(n.hasActiveDashboardTab=d.aw_has_dashboard_tab);const h=d?.aw_live_status;h&&(h.lastWorkTimestamp&&h.lastWorkTimestamp>(n.lastWorkTimestamp||0)||h.lastWorkTime&&h.lastWorkTime!==n.lastWorkTime&&(h.totalWorked||0)>(n.totalWorked||0))&&(h.currentEnergy!=null&&(n.currentEnergy=h.currentEnergy,n.lastWorkTimestamp=h.lastWorkTimestamp||0,n.domEnergyStale=!0,n.energySyncBase=h.energySyncBase||{current:h.currentEnergy,max:h.maxEnergy||n.maxEnergy||110,updatedAt:h.updatedAt||Date.now(),regenRate:h.regenRate||n.regenRate||1}),h.workToday!=null&&(n.workToday=h.workToday),h.xpToday!=null&&(n.xpToday=h.xpToday),h.totalWorked!=null&&(n.totalWorked=h.totalWorked),h.totalWorkXP!=null&&(n.totalWorkXP=h.totalWorkXP),h.lastWorkTime&&(n.lastWorkTime=h.lastWorkTime),h.nextWorkTimestamp!=null&&(n.nextWorkTimestamp=h.nextWorkTimestamp),h.serverCooldownUntil!=null&&(n.serverCooldownUntil=h.serverCooldownUntil)),kt(n,()=>{l=ot(n,t)});const k=Ee(n);k&&(n.currentEnergy=k.current,n.maxEnergy=k.max),B(),Ke(n,t),N(n,t,!0),n.running&&n.isTabLockOwner&&(!n.nextWorkTimestamp||Date.now()>=n.nextWorkTimestamp)&&(!n.serverCooldownUntil||Date.now()>=n.serverCooldownUntil)&&(!n.microBreakUntil||Date.now()>=n.microBreakUntil)&&(!n.backoffUntil||Date.now()>=n.backoffUntil)&&n.currentEnergy>=ye(n,t)&&E?.()}finally{A=!1}})}catch{A=!1}}}let Y=0;function ee(){if(!t.circuitBreakerEnabled)return{active:!1,reason:""};try{const p=(document.title||"").toLowerCase();if(p.includes("just a moment")||p.includes("attention required")||p.includes("security check"))return{active:!0,reason:"Cloudflare Challenge terdeteksi"};if(document.querySelector("#challenge-running, #cf-wrapper, .cf-turnstile, #cf-stage, .cf-browser-verification"))return{active:!0,reason:"Cloudflare Verification terdeteksi"};const d=(document.body?.innerText||"").substring(0,500).toLowerCase();if(d.includes("502 bad gateway")||d.includes("503 service unavailable")||d.includes("504 gateway time-out")||d.includes("server sedang pemeliharaan")||d.includes("under maintenance"))return{active:!0,reason:"Server Maintenance / Error 50x terdeteksi"};if(document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .h-captcha, .g-recaptcha'))return{active:!0,reason:"Captcha interaktif terdeteksi"}}catch{}return{active:!1,reason:""}}function te(){if(!t.autoReloadTabEnabled||!n.running||n.workInFlight||n.circuitBreakerActive)return;if(Date.now()-n.scriptStartTime>=432e5){const d=n.currentEnergy??0,h=(n.nextWorkTimestamp||0)-Date.now();d<20&&h>12e5&&(g("[Auto Refresh] Membersihkan memori tab setelah berjalan 12+ jam. Memuat ulang tab game...","info"),N(n,t,!0),setTimeout(()=>{window.location.reload()},2e3))}}function u(){const p=t.maxFoodDaily||10;if(!(n.foodEatenToday>=p))try{const d=document.querySelectorAll('[role="alert"], [role="status"], .toast, [class*="toast" i], [class*="alert" i], [data-radix-popper-content-wrapper], [data-sonner-toast]');for(const h of d){if(h.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast"))continue;const k=h.textContent||"";if(/batas roti harian tercapai|daily bread limit/i.test(k)){n.foodEatenToday=p,v("aw_foodEatenToday",p.toString()),N(n,t,!0),f({type:"FOOD_UPDATED",foodEatenToday:p,timestamp:Date.now()}),g(`Notifikasi game: Batas konsumsi roti harian tercapai (${p}/${p}).`,"info"),B();return}}}catch{}}function P(){u();let p=null;if(typeof MutationObserver<"u"&&typeof document<"u"){const d=new MutationObserver(()=>{C()&&be(n,t,g);const h=t.maxFoodDaily||10;n.foodEatenToday>=h||p||(p=setTimeout(()=>{p=null,u(),C()&&(be(n,t,g),B())},400))});try{d.observe(document.body||document.documentElement,{childList:!0,subtree:!0})}catch{}}document.addEventListener("click",d=>{d.target?.closest?.("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal")||(setTimeout(()=>{C()&&(be(n,t,g),B()),u()},300),setTimeout(()=>{C()&&(be(n,t,g),B())},1e3))},{passive:!0})}function q(){if(typeof MutationObserver>"u"||typeof document>"u")return;let p=!1;const d=new MutationObserver(h=>{if(!t.autoTrainEnabled||p)return;let k=!1;for(const _ of h){if(_.addedNodes&&_.addedNodes.length>0){for(const G of _.addedNodes)if(G.nodeType===1&&(G.matches?.('[data-testid*="train-confirm"], [role="dialog"], dialog, div.fixed.inset-0')||G.querySelector?.('[data-testid*="confirm"], [role="dialog"], button.btn-gold'))){k=!0;break}}if(k)break}(k||Ne())&&(p=!0,setTimeout(()=>{p=!1},400),Ze(x))});try{d.observe(document.body||document.documentElement,{childList:!0,subtree:!0})}catch{}}async function K(){for(;;)try{if(!chrome.runtime?.id){console.log("[Auto Worker] Ekstensi telah di-reload. Loop dihentikan bersih. Silakan refresh tab game (F5).");return}if(n.shouldYieldLock){n.shouldYieldLock=!1,Xe(n,!1,x);return}const p=ee();if(p.active){n.circuitBreakerActive||(n.circuitBreakerActive=!0,n.circuitBreakerReason=p.reason,g(`[Circuit Breaker] ${p.reason}. Worker dijeda otomatis demi keamanan akun.`,"warn"),B()),await I(3e4);continue}else n.circuitBreakerActive&&(n.circuitBreakerActive=!1,n.circuitBreakerReason="",g("[Circuit Breaker] Halaman game kembali normal. Melanjutkan jadwal kerja...","info"),B());if(te(),u(),typeof navigator<"u"&&(navigator.onLine===!1||n.isOffline)){await I(5e3);continue}if(D(),n.running){if(C()&&!n.hasInitialDomEnergyRead){await I(1e3);continue}n.isEnergyFlushActive=De(t);const d=ye(n,t),h=Ee(n);if(h&&(n.currentEnergy=h.current,n.maxEnergy=h.max),n.serverCooldownUntil&&Date.now()<n.serverCooldownUntil&&(n.nextWorkTimestamp=Math.max(n.nextWorkTimestamp||0,n.serverCooldownUntil)),n.currentEnergy>=d&&(!n.serverCooldownUntil||Date.now()>=n.serverCooldownUntil)&&n.nextWorkTimestamp&&n.nextWorkTimestamp-Date.now()>3e4&&(n.nextWorkTimestamp=0),n.nextWorkTimestamp&&n.nextWorkTimestamp>Date.now()){const _=Math.max(1e3,n.nextWorkTimestamp-Date.now());await I(_);continue}if(n.currentEnergy<d){const _=Le(n,t);n.nextWorkTimestamp=Date.now()+_,await I(_);continue}const k=await Je(x);if(k==="retrySoon")await I(5e3);else if(k==="retry"){Y++;const _=Math.min(3e5,1e4*Math.pow(2,Y-1));g(`Retry dalam ${(_/1e3).toFixed(0)}s (percobaan ke-${Y})...`,"warn"),await I(_)}else if(k==="waiting"||k==="worked"){Y=0;const _=Math.max(1e3,n.nextWorkTimestamp-Date.now());await I(_)}else await I(1e4)}else await I(1e4)}catch(p){if(p?.message?.includes("Extension context invalidated")||!chrome.runtime?.id){console.log("[Auto Worker] Ekstensi telah di-reload. Loop dihentikan bersih.");return}console.error("[MainLoop]",p),g(`Main loop error: ${p.message}`,"error"),Y++;const d=Math.min(3e5,1e4*Math.pow(2,Y-1));await I(d)}}if(!n.tabLockManaged){g("Web Locks tidak tersedia; perlindungan multi-tab tidak aktif.","warn"),await K();return}for(Xe(n,!1,x);;){if(!C()&&n.hasActiveDashboardTab){n.waitedForTabLock=!0,Xe(n,!1,x),await new Promise(d=>setTimeout(d,3e3));continue}let p=!1;try{await navigator.locks.request("parlamentum-auto-worker",{ifAvailable:!0},async d=>{d&&(p=!0,kt(n,()=>{l=ot(n,t)}),he(n.running),Q("aw_workResultUncertain","false")==="true"&&(n.workResultUncertain=!0,n.running=!1,v("aw_worker_running","false"),he(!1),B()),Xe(n,!0,x),n.waitedForTabLock=!1,await K())})}catch(d){g(`Web Locks gagal: ${d.message}. Worker dijeda.`,"error"),n.running=!1,Xe(n,!1,x);return}p||(n.waitedForTabLock=!0,Xe(n,!1,x),await new Promise(d=>setTimeout(d,3e3)))}})();function Pa(e,t,a){X("aw_energySchemaVersion",1,1,2)>=2||(e.totalWorkXP<e.totalWorked*3&&e.totalWorked>0&&(e.totalWorkXP=e.totalWorked*10/10*4,v("totalWorkXP",e.totalWorkXP.toString())),e.totalEnergySpent<e.totalWorked*5&&e.totalWorked>0&&(e.totalEnergySpent=e.totalWorked*10,v("totalEnergySpent",e.totalEnergySpent.toString()),console.log("[Init] Estimasi energi masa lalu diterapkan (migrasi sekali jalan).")),v("aw_energySchemaVersion","2"))}function Wa(e,t,a,r=null){if(!chrome.runtime?.id||!e.currentToken||!e.tokenExpiry)return;const o=e.tokenExpiry-Date.now();if(o<=0){if(!e.pausedForToken){e.pausedForToken=!0,e.tokenExpired=!0;let i=0;try{i=parseInt(sessionStorage.getItem("aw_token_reload_attempts")||"0",10)}catch{}if(i<1){try{sessionStorage.setItem("aw_token_reload_attempts",(i+1).toString())}catch{}a("Token sesi kedaluwarsa. Me-reload tab otomatis sekali untuk memperbarui sesi...","warn"),setTimeout(()=>{window.location.reload()},1500)}else e.running=!1,v("aw_worker_running","false"),r?.setRunningUI?.(!1),a("Token sesi telah kedaluwarsa. Auto Worker dijeda. Silakan login kembali.","error")}return}o<t.tokenExpiryThreshold&&(a(`Token akan expired dalam ${Math.round(o/1e3)} detik!`,"warn"),a("Token tidak auto-refresh. Login ulang jika expired.","warn"))}function Xe(e,t,a){e.isTabLockOwner=t,a?.CONFIG&&Ke(e,a.CONFIG),a.updatePanel?.()}function _a(e,t,a){const r=Math.floor((Date.now()-a.scriptStartTime)/1e3);e("Auto Worker v5.12.0 (Gaussian & Route-Throttled) aktif.","success",!1),e(`Energy Threshold: ${t.energyThreshold} EN`,"info",!1),e(`History: simpan ${t.historyMaxDays} hari terakhir`,"info",!1),e(`Quiet mode: ${t.quietModeEnabled?"ON":"OFF"}`,"info",!1),e(`Shortcuts: ${Object.values(t.shortcuts).map(o=>o.display).join(", ")}`,"info",!1),e(`Script uptime: ${r}s`,"info",!1)}function nn(e){let t=window.location.pathname;const a=()=>{window.location.pathname!==t&&(t=window.location.pathname,e?.())};try{const r=history.pushState;history.pushState=function(...i){r.apply(this,i),a()};const o=history.replaceState;history.replaceState=function(...i){o.apply(this,i),a()}}catch{}window.addEventListener("popstate",a),Se(a,1e3)}})();
