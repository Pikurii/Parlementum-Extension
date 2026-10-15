(function(){"use strict";const ae={};async function bt(){const e=await chrome.storage.local.get(null);Object.assign(ae,e)}function N(e,t=null){return e in ae?ae[e]:t}function M(e,t){if(ae[e]=t,!!chrome.runtime?.id)try{chrome.storage.local.set({[e]:t}).catch(a=>{a?.message?.includes("Extension context invalidated")||console.error("[Storage] setValue failed:",e,a)})}catch{}}function ht(e){chrome.storage.onChanged.addListener((t,a)=>{if(a==="local")for(const[o,{newValue:r}]of Object.entries(t))r!==void 0?ae[o]=r:delete ae[o],e(o,r)})}const ee={sendNotification:!0,tokenRefreshInterval:36e5,tokenExpiryThreshold:3e5,panelDefaultX:10,panelDefaultY:10,soundNotificationEnabled:!0,soundNotificationVolume:.3,energyFullAlertSoundEnabled:!0,energyFullAlertVolume:.3,panelPinned:!1,panelFollowViewport:!0,panelReturnToOriginal:!1,panelDashboardOnly:!0,panelLeaderOnly:!0,maxLogEntries:200,quietModeEnabled:!0,quietModeInterval:12e4,energyThreshold:10,energyFullAlertEnabled:!0,historyMaxDays:30,stealthJitterEnabled:!0,stealthJitterMaxSeconds:25,energyFlushEnabled:!0,autoReloadTabEnabled:!0,circuitBreakerEnabled:!0,foodReminderEnabled:!0,foodResetReminderEnabled:!0,maxFoodDaily:10,sleepScheduleEnabled:!1,sleepStartHour:1,sleepEndHour:6,autoReloginEnabled:!1,ecoModeEnabled:!0,shortcuts:{showHide:{keys:["Control","Shift","KeyA"],display:"Ctrl+Shift+A"},workNow:{keys:["Alt","Shift","KeyW"],display:"Alt+Shift+W"},pauseResume:{keys:["Alt","Shift","KeyP"],display:"Alt+Shift+P"},openLog:{keys:["Control","Shift","KeyL"],display:"Ctrl+Shift+L"},openSettings:{keys:["Control","Shift","KeyS"],display:"Ctrl+Shift+S"}}},wt={tokenRefreshInterval:[1e3,864e5],tokenExpiryThreshold:[0,864e5],panelDefaultX:[0,1e4],panelDefaultY:[0,1e4],soundNotificationVolume:[0,1],energyFullAlertVolume:[0,1],maxLogEntries:[1,1e3],quietModeInterval:[1e3,864e5],energyThreshold:[10,100],stealthJitterMaxSeconds:[5,120],maxFoodDaily:[10,20],historyMaxDays:[1,365],sleepStartHour:[0,23],sleepEndHour:[0,23]};function ce(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}function be(e,t=!1){if(!ce(e))return t?null:{...ee,shortcuts:{...ee.shortcuts}};const a={...ee,shortcuts:{...ee.shortcuts}};for(const[o,r]of Object.entries(e)){if(o==="shortcuts"||r===void 0)continue;if(typeof ee[o]=="boolean"){if(typeof r=="boolean")a[o]=r;else if(t)return null;continue}const i=wt[o];if(i){if(typeof r=="number"&&Number.isFinite(r)&&r>=i[0]&&r<=i[1])a[o]=r;else if(t)return null}}if(e.shortcuts!==void 0){if(ce(e.shortcuts))for(const[o,r]of Object.entries(e.shortcuts)){if(!Object.prototype.hasOwnProperty.call(ee.shortcuts,o))continue;if(ce(r)&&Array.isArray(r.keys)&&r.keys.length>=1&&r.keys.length<=3&&r.keys.every(s=>typeof s=="string"&&/^[A-Za-z][A-Za-z0-9]*$/.test(s))&&typeof r.display=="string"&&/^[A-Za-z0-9+ ]{1,64}$/.test(r.display))a.shortcuts[o]={keys:[...r.keys],display:r.display};else if(t)return null}else if(t)return null}return a}function kt(){const e=N("aw_config",null);if(!e)return be(ee);try{const t=typeof e=="string"?JSON.parse(e):e;return be(t)}catch(t){return console.error("[Config] Failed to parse config:",t),be(ee)}}function he(e){M("aw_config",e)}function U(e,t,a=0,o=Number.MAX_SAFE_INTEGER){const r=N(e,t.toString()),i=Number(r);return Number.isSafeInteger(i)&&i>=a&&i<=o?i:t}function xt(e,t,a){return{running:!a,totalWorked:U("totalWorked",0),totalWorkXP:U("totalWorkXP",0),workToday:U("workToday",0),xpToday:U("xpToday",0),lastWorkDate:N("lastWorkDate",new Date().toDateString()),lastWorkTime:N("lastWorkTime","Belum pernah"),currentToken:null,tokenExpiry:null,storedTokenValue:"",pausedForToken:!1,tokenExpired:!1,currentEnergy:0,maxEnergy:100,energyFullAlertActive:!1,energySyncBase:null,workInFlight:!1,workResultUncertain:a,uncertainReconciliation:a?"pending":"none",playerLevel:1,regionName:"",regionHealthBonusPercent:0,panelMinimized:N("panelMinimized","false")==="true",panelVisible:N("panelVisible","true")==="true",userManuallyToggledPanel:!1,panelX:U("panelX",e.panelDefaultX,0,1e4),panelY:U("panelY",e.panelDefaultY,0,1e4),originalPanelX:U("panelX",e.panelDefaultX,0,1e4),originalPanelY:U("panelY",e.panelDefaultY,0,1e4),logs:[],settingsOpen:!1,lastLowEnergyLogTime:0,scriptStartTime:Date.now(),sessionStartTime:t,nextWorkTimestamp:0,isTabLockOwner:!1,tabLockManaged:!1,waitedForTabLock:!1,totalEnergySpent:U("totalEnergySpent",0),totalActualEnergySpent:U("totalActualEnergySpent",0),totalEstimatedEnergySpent:U("totalEstimatedEnergySpent",0),foodEatenToday:(()=>{const o=new Date().toISOString().slice(0,10),r=N("aw_foodUtcDate","");return r&&r!==o?(M("aw_foodUtcDate",o),M("aw_foodEatenToday","0"),0):(r||M("aw_foodUtcDate",o),U("aw_foodEatenToday",0,0,20))})(),maxFoodDaily:U("aw_maxFoodDaily",10,10,20),circuitBreakerActive:!1,circuitBreakerReason:"",isEnergyFlushActive:!1}}function we(e){const t={totalWorked:e.totalWorked.toString(),workToday:e.workToday.toString(),totalWorkXP:e.totalWorkXP.toString(),xpToday:e.xpToday.toString(),totalEnergySpent:e.totalEnergySpent.toString(),totalActualEnergySpent:e.totalActualEnergySpent.toString(),totalEstimatedEnergySpent:e.totalEstimatedEnergySpent.toString(),lastWorkTime:e.lastWorkTime,lastWorkDate:e.lastWorkDate};for(const[a,o]of Object.entries(t))M(a,o)}let Re="",_e=0;function Et(e,t=null){const a=e.lastLogMessage||(e.logs&&e.logs.length>0?e.logs[0].message:""),o=!!(e.tokenExpired||e.pausedForToken||!e.currentToken||e.tokenExpiry&&Number(e.tokenExpiry)<=Date.now()),r=t?.energyThreshold??10,i=e.currentEnergy??0;let s=e.nextWorkTimestamp??0;if(!s&&i<r){const n=e.regenRate||1,u=Math.max(1,(r-i)/n);s=Date.now()+Math.round(u*6e4),e.nextWorkTimestamp=s}return{running:!!e.running,currentEnergy:i,maxEnergy:e.maxEnergy??100,nextWorkTimestamp:s,workToday:e.workToday??0,xpToday:e.xpToday??0,totalWorked:e.totalWorked??0,totalWorkXP:e.totalWorkXP??0,hasToken:!!e.currentToken,tokenExpiry:e.tokenExpiry?new Date(e.tokenExpiry).getTime():null,tokenExpired:o,pausedForToken:!!e.pausedForToken,lastWorkTime:e.lastWorkTime||"Belum pernah",energyThreshold:r,playerLevel:e.playerLevel||1,regionName:e.regionName||"",regionHealthBonusPercent:e.regionHealthBonusPercent||0,regenRate:e.regenRate||1,lastLogMessage:a,isTabLockOwner:!!e.isTabLockOwner,foodEatenToday:e.foodEatenToday??0,maxFoodDaily:t?.maxFoodDaily||e.maxFoodDaily||10,circuitBreakerActive:!!e.circuitBreakerActive,circuitBreakerReason:e.circuitBreakerReason||"",isEnergyFlushActive:!!e.isEnergyFlushActive,updatedAt:Date.now()}}function K(e,t=null,a=!1){const o=Et(e,t);if(!a&&e.tabLockManaged&&(!e.isTabLockOwner||!(typeof window<"u"&&(/^\/(dashboard(?:\/.*)?|$)/i.test(window.location.pathname||"")||window.location.pathname==="/"))&&e.hasActiveDashboardTab))return o;const r=Math.round((o.nextWorkTimestamp||0)/3e3),i=`${o.running}|${o.currentEnergy}|${o.maxEnergy}|${o.workToday}|${o.hasToken}|${o.tokenExpired}|${o.energyThreshold}|${r}|${o.lastLogMessage}`,s=Date.now();return!a&&i===Re&&s-_e<3e3||(Re=i,_e=s,M("aw_live_status",o)),o}function De(e,t){e.totalWorked=U("totalWorked",0),e.totalWorkXP=U("totalWorkXP",0),e.workToday=U("workToday",0),e.xpToday=U("xpToday",0),e.totalEnergySpent=U("totalEnergySpent",0),e.totalActualEnergySpent=U("totalActualEnergySpent",0),e.totalEstimatedEnergySpent=U("totalEstimatedEnergySpent",0);const a=new Date().toISOString().slice(0,10),o=N("aw_foodUtcDate","");o&&o!==a?(e.foodEatenToday=0,M("aw_foodUtcDate",a),M("aw_foodEatenToday","0")):e.foodEatenToday=U("aw_foodEatenToday",0,0,20),e.maxFoodDaily=U("aw_maxFoodDaily",10,10,20),e.lastWorkDate=N("lastWorkDate",new Date().toDateString()),e.lastWorkTime=N("lastWorkTime","Belum pernah"),t()}function je(e,t=30){const a=new Date;a.setDate(a.getDate()-(t||30));let o=!1;for(const r of Object.keys(e))new Date(r)<a&&(delete e[r],o=!0);return o}function vt(e){if(!ce(e))return null;const t=Object.create(null);for(const[a,o]of Object.entries(e)){const r=new Date(a);if(Number.isNaN(r.getTime())||r.toDateString()!==a||!ce(o)||!Number.isSafeInteger(o.shifts)||o.shifts<0||!Number.isSafeInteger(o.xp)||o.xp<0)return null;const i=["energySpent","estimatedEnergySpent","energyDataShifts"].some(s=>Object.prototype.hasOwnProperty.call(o,s));if(i&&(!Number.isSafeInteger(o.energySpent)||o.energySpent<0||!Number.isSafeInteger(o.estimatedEnergySpent)||o.estimatedEnergySpent<0||!Number.isSafeInteger(o.energyDataShifts)||o.energyDataShifts<0||o.energyDataShifts>o.shifts))return null;t[a]={shifts:o.shifts,xp:o.xp},i&&(t[a].energySpent=o.energySpent,t[a].estimatedEnergySpent=o.estimatedEnergySpent,t[a].energyDataShifts=o.energyDataShifts)}return t}function Tt(e){for(const t of Object.values(e))Object.prototype.hasOwnProperty.call(t,"energySpent")&&(t.energySpent=Math.max(0,t.energySpent-t.estimatedEnergySpent));return e}function ke(e={},t={}){try{const a=N("aw_workHistory",null),o=a?typeof a=="string"?JSON.parse(a):a:{};let r=vt(o)||Object.create(null);U("aw_energySchemaVersion",1,1,2)<2&&(Tt(r),M("aw_energySchemaVersion","2"),M("aw_workHistory",JSON.stringify(r)));const i=U("workToday",0),s=U("xpToday",0),n=new Date().toDateString(),u=t?.historyMaxDays||30;return!r[n]||r[n].shifts!==i||r[n].xp!==s?(r[n]={shifts:i,xp:s},je(r,u),M("aw_workHistory",JSON.stringify(r))):je(r,u)&&M("aw_workHistory",JSON.stringify(r)),r}catch(a){return console.error("[History] Failed to load:",a),{}}}function Ie(e){M("aw_workHistory",JSON.stringify(e))}const oe=new Map;let ze=null;function St(e){ze=e}function Mt(e,t,a,o="info",r=!0){const i=new Date().toLocaleTimeString("id-ID"),s=o==="error"?"[ERROR]":o==="success"?"[OK]":o==="warn"?"[WARN]":"[INFO]";if(r&&o==="warn"&&/(?:Energi (?:belum|tidak) cukup|Server menolak kerja|Shift tidak menghasilkan unit)/i.test(a)&&t.quietModeEnabled){const n=Date.now();if(n-e.lastLowEnergyLogTime<t.quietModeInterval)return;e.lastLowEnergyLogTime=n}if(r&&(o==="warn"||o==="error")){const n=/^Retry dalam /i.test(a)?`${o}:retry`:`${o}:${a}`,u=Date.now(),d=oe.get(n);if(d&&u-d.time<3e4){d.suppressed++;return}d?.suppressed>0&&(a+=` (${d.suppressed} pesan serupa disembunyikan)`),oe.set(n,{time:u,suppressed:0}),oe.size>100&&oe.delete(oe.keys().next().value)}console.log(`[${i}] ${s} ${a}`),e.lastLogMessage=`[${i}] ${a}`,e.lastLogTime=i,r&&(e.logs.unshift({time:i,type:o,message:a}),e.logs.length>t.maxLogEntries&&(e.logs=e.logs.slice(0,t.maxLogEntries)),At(e.logs),ze?.())}let te=null;function At(e){typeof chrome>"u"||!chrome.storage?.local||(te&&clearTimeout(te),te=setTimeout(()=>{te=null;try{const t=e.slice(0,80);M("aw_recent_logs",t)}catch{}},300))}function Dt(){if(te&&(clearTimeout(te),te=null),oe.clear(),M("aw_recent_logs",[]),typeof chrome<"u"&&chrome.storage?.local)try{chrome.storage.local.set({aw_recent_logs:[]}).catch(()=>{})}catch{}}function Bt(e){if(!e||typeof e!="string")return null;try{let t=e.trim();if(t.startsWith('"')&&t.endsWith('"')||t.startsWith("'")&&t.endsWith("'"))try{t=JSON.parse(t)}catch{t=t.slice(1,-1).trim()}if(t=t.replace(/^Bearer\s+/i,"").trim(),t.startsWith("{"))try{const n=JSON.parse(t);t=n.token||n.access_token||n.jwt||n.value||t}catch{}const a=t.split(".");if(a.length!==3)return null;let o=a[1].replace(/-/g,"+").replace(/_/g,"/");for(;o.length%4!==0;)o+="=";const r=Uint8Array.from(atob(o),n=>n.charCodeAt(0)),i=JSON.parse(new TextDecoder("utf-8").decode(r)),s=i.exp?new Date(i.exp*1e3):null;return{payload:i,cleanToken:t,expiry:s,isExpired:s?s<new Date:!1}}catch(t){return console.error("[JWT] Failed to parse:",t),null}}function Lt(e,t,a,o,r="storage",i=null,s=null){if(!o)return!1;const n=Bt(o);if(!n)return!1;const{cleanToken:u,expiry:d,isExpired:y}=n;if(y)return console.warn(`[Token] Token dari ${r} sudah EXPIRED pada ${d?.toLocaleString("id-ID")}`),!1;if(u===e.storedTokenValue&&e.currentToken)return!0;e.storedTokenValue=u,e.currentToken=`Bearer ${u}`,e.tokenExpiry=d;try{M("aw_auth_token",u),M("aw_auth_token_expiry",d?d.getTime().toString():"")}catch{}const h=d?Math.floor((d-Date.now())/1e3):null,p=d?`${d.toLocaleTimeString("id-ID")} (${Math.floor(h/3600)}h ${Math.floor(h%3600/60)}m)`:"Tidak ada exp";return t(`Token valid via ${r}! Exp: ${p}`,"success"),e.tokenExpired=!1,(e.pausedForToken||!e.running)&&(e.running=!0,e.pausedForToken=!1,t("Sesi diperbarui. Script dilanjutkan otomatis.","success"),i?.(),a?.()),s?.(),!0}function xe(e,t){const a=Date.now()-(xe._lastDiagAt||0)>=3e4;a&&(console.log("[Token] Memindai storage..."),xe._lastDiagAt=Date.now());const o=[];try{window.localStorage&&o.push({name:"localStorage",store:window.localStorage})}catch{}try{const i=window;i?.localStorage&&i.localStorage!==window.localStorage&&o.push({name:"pw.localStorage",store:i.localStorage})}catch{}try{window.sessionStorage&&o.push({name:"sessionStorage",store:window.sessionStorage})}catch{}const r=["token","auth_token","authToken","access_token","jwt","session","parlamentum_token","sb-token","sb-access-token","user_token"];for(const{name:i,store:s}of o)for(const n of r){const u=s.getItem(n);if(u&&t(u,`${i}[${n}]`))return e.currentToken}for(const{name:i,store:s}of o)for(let n=0;n<s.length;n++){const u=s.key(n);if(!u)continue;const d=s.getItem(u);if(d&&typeof d=="string"&&(d.includes("eyJ")||d.startsWith("{"))&&t(d,`${i}[auto:${u}]`))return e.currentToken}if(a){console.warn("[Token] Tidak ditemukan. Keys tersedia:");for(const{name:i,store:s}of o)try{console.log(`  ${i}:`,Object.keys(s))}catch{}}return null}function $t(e){if(!e.tokenExpiry)return"N/A";const t=e.tokenExpiry-Date.now();return t<=0?"EXPIRED":`${Math.floor(t/36e5)}h ${Math.floor(t%36e5/6e4)}m`}function Wt(e,t,a){window.addEventListener("storage",({newValue:o,key:r})=>{o&&t(o,`storage-event[${r}]`)});try{const o=window.fetch;window.fetch=function(...r){try{const[i,s]=r;let n=null;s?.headers&&(n=s.headers instanceof Headers?s.headers.get("Authorization")||s.headers.get("authorization"):s.headers.Authorization||s.headers.authorization),!n&&i instanceof Request&&(n=i.headers?.get("Authorization")||i.headers?.get("authorization")),n?.includes("Bearer ")&&t(n,"fetch-intercept")}catch{}return o.apply(this,r)}}catch{}setInterval(()=>{(!e.currentToken||e.tokenExpiry&&e.tokenExpiry<new Date)&&a()},8e3)}function Y(){if(typeof window>"u")return!1;const e=(window.location.pathname||"").toLowerCase();return e==="/dashboard"||e.startsWith("/dashboard/")||e==="/"||e===""}function O(){try{const e=s=>!!s.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast"),t=document.querySelectorAll('header, nav, [role="banner"], [class*="nav" i], [class*="header" i], [class*="topbar" i], [class*="navbar" i]');for(const s of t){if(e(s))continue;const n=s.querySelectorAll("*"),u=[];for(const d of n){if(e(d))continue;const y=(d.textContent||"").trim();if(!y.includes("/")||y.length>30)continue;const h=y.match(/(?:\u26A1|\b)(\d+)\s*\/\s*(\d+)\b/);if(h){const p=parseInt(h[1],10),g=parseInt(h[2],10);g>=50&&g<=350&&p<=g&&u.push({current:p,max:g,len:y.length})}}if(u.length>0)return u.sort((d,y)=>d.len-y.len),{current:u[0].current,max:u[0].max}}const a=document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, div, p");for(const s of a){if(e(s))continue;const n=(s.textContent||"").trim();if(/^(?:\u26A1)?\s*(?:ENERGI|ENERGY)\b/i.test(n)&&n.length<=30){let u=s.parentElement;for(let d=0;d<4&&u&&u!==document.body;d++){const y=u.querySelectorAll("*");for(const g of y){if(e(g))continue;const S=(g.textContent||"").trim();if(!S.includes("/")||S.length>25)continue;const T=S.match(/(?:\u26A1|\b)(\d+)\s*\/\s*(\d+)/);if(T){const b=parseInt(T[1],10),$=parseInt(T[2],10);if($>=50&&$<=350&&b<=$)return{current:b,max:$}}}const p=(u.textContent||"").trim().match(/(\d+)\s*\/\s*(\d+)/);if(p){const g=parseInt(p[1],10),S=parseInt(p[2],10);if(S>=50&&S<=350&&g<=S)return{current:g,max:S}}u=u.parentElement}}}const o=document.querySelectorAll('div, span, p, a, button, [role="status"]'),r=[];for(const s of o){if(e(s))continue;const n=(s.textContent||"").trim();if(!n.includes("/")||n.length>35)continue;const u=n.match(/(?:\u26A1|\b)(\d+)\s*\/\s*(\d+)\b/);if(u){const d=parseInt(u[1],10),y=parseInt(u[2],10);if(y>=50&&y<=350&&d<=y){const h=n.includes("⚡")||!!s.querySelector("svg");r.push({current:d,max:y,len:n.length,hasIcon:h})}}}if(r.length>0)return r.sort((s,n)=>(n.hasIcon?1:0)-(s.hasIcon?1:0)||s.len-n.len),{current:r[0].current,max:r[0].max};const i=document.querySelectorAll("span, div");for(const s of i)if(!e(s)&&(s.textContent||"").trim()==="/"){const n=s.previousElementSibling,u=s.nextElementSibling;if(n&&u){const d=parseInt((n.textContent||"").trim(),10),y=parseInt((u.textContent||"").trim(),10);if(Number.isSafeInteger(d)&&Number.isSafeInteger(y)&&y>=50&&y<=350&&d<=y)return{current:d,max:y}}}}catch{}return null}function Pt(e=15e3){return new Promise(t=>{const a=O();if(a)return t(a);const o=Date.now()+e,r=new MutationObserver(()=>{const i=O();i?(r.disconnect(),t(i)):Date.now()>=o&&(r.disconnect(),t(null))});r.observe(document.documentElement,{childList:!0,subtree:!0}),setTimeout(()=>{r.disconnect(),t(O())},e)})}function re(e){const t=typeof document<"u"&&document.hidden,a=Date.now(),o=Y();if((t||!o)&&e.energySyncBase&&typeof e.energySyncBase.current=="number"){const s=e.energySyncBase,n=s.max||e.maxEnergy||115,u=s.updatedAt?(a-s.updatedAt)/6e4:0,d=e.regenRate||1,y=Math.floor(u*d),h=Math.min(n,s.current+Math.max(0,y));if(!o){const p=O();if(p&&p.current>h)return e.energySyncBase={current:p.current,max:p.max,updatedAt:a},e.currentEnergy=p.current,e.maxEnergy=p.max,p}return{current:h,max:n}}const r=O();if(r&&!t&&o)return e.domEnergyStale=!1,e.currentEnergy=r.current,e.maxEnergy=r.max,e.energySyncBase={current:r.current,max:r.max,updatedAt:a},r;const i=e.energySyncBase;if(i&&typeof i.current=="number"){const s=i.max||e.maxEnergy||115,n=i.updatedAt?(a-i.updatedAt)/6e4:0,u=e.regenRate||Ue()||1,d=Math.floor(n*u);return{current:Math.min(s,i.current+Math.max(0,d)),max:s}}return r||{current:e.currentEnergy||0,max:e.maxEnergy||115}}function Be(e){if(!e?.sleepScheduleEnabled)return!1;const a=new Date().getHours(),o=e.sleepStartHour??1,r=e.sleepEndHour??6;return o<r?a>=o&&a<r:a>=o||a<r}let F=null,He=0;function Rt(){try{const e=r=>!!r.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast"),t=document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, div, p");for(const r of t){if(e(r))continue;const i=(r.textContent||"").trim();if(/^(?:\u26A1)?\s*(?:ENERGI|ENERGY)\b/i.test(i)&&i.length<=25){let s=r.parentElement;for(let n=0;n<4&&s&&s!==document.body;n++){const d=(s.innerText||s.textContent||"").match(/Penuh\s+dalam\s+([0-9\sA-Za-z<]+?)(?:\n|$|\.|\()/i);if(d&&d[1]){const y=d[1].trim();if(y.length>0&&y.length<=15)return y}s=s.parentElement}}}const o=(document.body&&document.body.innerText||"").match(/Penuh\s+dalam\s+([0-9\sA-Za-z<]+?)(?:\n|$|\.|\()/i);if(o&&o[1]){const r=o[1].trim();if(r.length>0&&r.length<=15)return r}}catch{}return null}function Ee(e=!1){if(typeof document>"u")return{name:"Wilayah",level:0,bonusPercent:0,bonusMultiplier:1};const t=Date.now();if(!e&&F&&t-He<1e4)return F;let a="",o=0,r=0,i=0,s="";try{const d=[];document.body&&d.push(document.body.innerText||"");const y=document.querySelectorAll('[role="tooltip"], [data-radix-popper-content-wrapper], [class*="tooltip" i], [class*="popover" i]');for(const b of y)d.push(b.innerText||b.textContent||"");s=d.join(`
`);const h=s.match(/Kamu\s+di\s+sini\s*[—–-]\s*([A-Za-zÀ-ÿ\s]{2,30})/i);if(h&&h[1]&&(a=h[1].trim()),!a){const b=s.match(/DITEMPATKAN\s+DI[^\n]*\n+([A-Za-zÀ-ÿ\s]{2,30})\n/i);if(b&&b[1]){const $=b[1].trim();/^(?:DI\s+PETA|PETA|MAP)\b/i.test($)||(a=$)}}if(!a){const b=s.match(/(?:Negara\s+Kesatuan\s+Republik\s+Indonesia|NKRI)[^\n]*\n+([A-Za-zÀ-ÿ\s]{2,30})\n/i);b&&b[1]&&(a=b[1].trim())}if(!a){const b=s.match(/\d\d:\d\d\s+UTC\s*\n*([A-Za-zÀ-ÿ\s]{2,30})/i);b&&b[1]&&(a=b[1].trim())}a&&(a=a.split(`
`)[0].trim(),a=a.toLowerCase().replace(/\b[a-zÀ-ÿ]/g,b=>b.toUpperCase()));const p=s.match(/(?:REGENERASI\s+ENERGI[^\n\d]*)?\+([0-9.]+)\s*\/\s*(?:mnt|min)/i);if(p&&p[1]){const b=parseFloat(p[1]);b>=.5&&b<=10&&(i=b)}const g=s.match(/Kesehatan\s*(?:kota|wilayah)?\s*:\s*\+?(\d+)%/i);g&&g[1]&&(r=parseInt(g[1],10),o=Math.round(r/5));let S=1;const T=s.match(/BONUS\s+INDEKS[^\d\n]*(\d+(?:\.\d+)?)/i);if(T&&T[1]){const b=parseFloat(T[1]);b>=1&&b<=2&&(S=b)}if(!o&&!r){const b=s.match(/\bKESEHATAN\b[^\d\n]*(\d+)/i);b&&b[1]&&(o=parseInt(b[1],10),r=Math.round(o*5*S))}if(!o&&!r){const b=document.querySelector('[data-testid="region-index-health"]');if(b){const A=b.querySelector('[aria-label*="Kesehatan"]')?.getAttribute("aria-label")?.match(/Kesehatan\s+(\d+)/i);A&&(o=parseInt(A[1],10),r=Math.round(o*5*S))}}}catch(d){console.error("[getRegionDetails] Error:",d)}if(i>0&&!r&&(r=Math.round((i-1)*100)),r>0&&!i){const d=1+r/100,y=Math.round(60/d);i=Math.round(60/y*100)/100}o=Math.max(0,Math.min(15,o||Math.round(r/5))),!r&&o>0&&(r=o*5),F&&F.name===(a||F.name)&&(F.bonusPercent>r&&!s.includes("Kesehatan")&&(r=F.bonusPercent),F.bonusMultiplier>i&&!s.includes("/mnt")&&(i=F.bonusMultiplier));const n=i>0?i:1+r/100,u={name:a||F?.name||"Jawa Barat",level:o,bonusPercent:r||F?.bonusPercent||0,bonusMultiplier:n||1};return(a||o>0||r>0||i>0)&&(F=u,He=t),u}function Ue(){return Ee().bonusMultiplier}function Ce(e){const t=new Date,a=new Date;return a.setHours(e.sleepEndHour??6,0,0,0),a<=t&&a.setDate(a.getDate()+1),Math.max(1e3,a.getTime()-t.getTime())}function ie(e){if(!e?.energyFlushEnabled)return!1;const t=new Date,a=t.getUTCHours(),o=t.getUTCMinutes();return a===23&&o>=15}function ue(e,t){return ie(t)?10:t?.energyThreshold||10}function pe(e,t){if(Be(t))return Ce(t);const a=ie(t);let o=ue(e,t);if(!a&&t.stealthJitterEnabled){const u=Math.floor(Math.random()*4)-1;o=Math.min(100,Math.max(10,o+u))}if(e.currentEnergy>=o){if(t.stealthJitterEnabled){const u=(t.stealthJitterMaxSeconds||25)*1e3;return Math.floor(Math.random()*(u-4e3))+4e3}return 3e3}const r=o-e.currentEnergy,i=e.regenRate||Ue()||1;e.regenRate=i;const s=r/i*6e4,n=Math.floor(Math.random()*7e3)+3e3;return Math.round(s+n)}function Le(e,t){if(Be(t))return"Tidur";const a=ie(t),o=ue(e,t),r=e.currentEnergy??0;if(r>=o)return a?"Flush!":"Now!";let i=(e.nextWorkTimestamp||0)-Date.now();if(!e.nextWorkTimestamp&&r<o){const n=e.regenRate||1;i=Math.max(1,(o-r)/n)*6e4}if(i<=0)return a?"Flush...":"Menunggu energi...";const s=Math.ceil(i/1e3);return`${Math.floor(s/60)}m ${String(s%60).padStart(2,"0")}s`}function $e(e){const t=Math.max(50,e.maxEnergy||115),a=Math.max(0,e.currentEnergy??0),o=Math.max(0,t-a);if(o<=0)return"Penuh!";const r=Math.max(.5,e.regenRate||1),i=Math.max(1,Math.round(o/r));if(i<60)return`~${i} mnt`;const s=Math.max(0,Math.floor(i/60)),n=Math.max(0,i%60);return n===0?`~${s} j`:s<24?`~${s} j ${n} mnt`:`~${Math.floor(s/24)} hari ${s%24} j`}let Ne=0;function _t(e){if(Date.now()-Ne<1e4)return e.playerLevel;Ne=Date.now();try{const t=document.createTreeWalker(document.body||document.documentElement,NodeFilter.SHOW_TEXT);let a;for(;a=t.nextNode();){const o=a.textContent.trim().match(/^Level\s+(\d+)$/i);if(o)return parseInt(o[1],10)}}catch{}return e.playerLevel}function jt(e){return Math.min(300,100+5*(e-1))}let Ke=null,Xe=null,Ve=0;function ne(e,t,a=!1){if(!(typeof document>"u"))try{let d=function(g){const S=document.createTreeWalker(g,NodeFilter.SHOW_TEXT);let T,b=!1;for(;T=S.nextNode();){const $=T.nodeValue||"";$.includes("/")&&/\d+\s*\/\s*\d+/.test($)&&(T.nodeValue=$.replace(/(\d+)(\s*\/\s*)(\d+)/,(A,E,D,I)=>{const _=parseInt(I,10);return _>=50&&_<=350?(b=!0,`${o}${D}${r||_}`):A}))}if(!b){const A=(g.textContent||"").trim().match(/^(\d+)(\s*\/\s*)(\d+)$/);if(A){const E=parseInt(A[3],10);if(E>=50&&E<=350){let I=document.createTreeWalker(g,NodeFilter.SHOW_TEXT).nextNode();I&&/^\d+$/.test(I.nodeValue?.trim()||"")&&(I.nodeValue=String(o))}}}};const o=Math.max(0,Math.round(e)),r=typeof t=="number"&&t>0?Math.round(t):115,i=Date.now();if(!a&&o===Ke&&r===Xe&&i-Ve<1e3)return;Ke=o,Xe=r,Ve=i;const s=Math.min(100,Math.max(0,o/r*100)).toFixed(1),n=/(?:SKOR\s+KOTA|KAPASITAS\s+WILAYAH|PETA\s+LANGSUNG|INFRASTRUKTUR)/i,u=g=>{if(!g||g.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast"))return!0;const S=g.closest("div, section, article");if(S){const T=S.textContent||"";if(n.test(T)&&!/^\s*(?:\u26A1)?\s*ENERGI\b/i.test(T))return!0}return!1},y=document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, div, p");for(const g of y){if(u(g))continue;const S=(g.textContent||"").trim();if(/^(?:\u26A1)?\s*(?:ENERGI|ENERGY)\b/i.test(S)&&S.length<=15){let T=g.parentElement,b=0;for(;T&&T!==document.body&&b<5;){const $=(T.textContent||"").trim();if(n.test($))break;if($.includes("/")&&/\d+\s*\/\s*\d+/.test($)){const A=T.querySelectorAll("*");for(const D of A){if(u(D))continue;const I=(D.textContent||"").trim();I.includes("/")&&I.length<=25&&/\d+\s*\/\s*\d+/.test(I)&&d(D)}const E=T.querySelectorAll('[role="progressbar"], div[style*="width"], span[style*="width"], [class*="bg-cyan" i], [class*="bg-teal" i], [class*="bg-emerald" i]');for(const D of E)u(D)||(D.style.width=`${s}%`,D.hasAttribute("aria-valuenow")&&D.setAttribute("aria-valuenow",String(o)),D.hasAttribute("aria-valuemax")&&D.setAttribute("aria-valuemax",String(r)));if(E.length>0)break}T=T.parentElement,b++}}}const h=document.querySelectorAll('header, nav, footer, [role="banner"], [class*="nav" i], [class*="header" i], [class*="topbar" i], [class*="navbar" i], [class*="bottom" i]');for(const g of h){if(u(g))continue;const S=g.querySelectorAll("*");for(const T of S){if(u(T))continue;const b=(T.textContent||"").trim();b.includes("/")&&b.length<=30&&/\d+\s*\/\s*\d+/.test(b)&&d(T)}}const p=document.querySelectorAll("button");for(const g of p){if(u(g))continue;const S=(g.textContent||"").trim();if(/KERJAKAN\s+SATU\s+GILIRAN/i.test(S)){const T=document.createTreeWalker(g,NodeFilter.SHOW_TEXT);let b;for(;b=T.nextNode();){const $=b.nodeValue||"";/(?:\u26A1)?\s*\d+/.test($)&&(b.nodeValue=$.replace(/((?:\u26A1)?\s*)(\d+)/,`$1${o}`))}o<10?(g.style.opacity="0.55",g.style.filter="grayscale(0.6)",g.title=`Energi saat ini ${o}/${r} EN (butuh minimal 10 EN untuk giliran kerja)`):(g.style.opacity="1",g.style.filter="none",g.title="")}}}catch{}}let ve=null;function Fe(e,t){if(!document.body)return;let a=document.getElementById("aw-notification-toast");a||(a=document.createElement("div"),a.id="aw-notification-toast",a.setAttribute("role","status"),a.setAttribute("aria-live","polite"),a.style.cssText=["position:fixed","top:16px","right:16px","z-index:100010","display:none","width:min(360px,calc(100vw - 32px))","padding:12px 14px","background:rgba(10,10,20,.97)","border:1px solid #00aaff","border-left:4px solid #00e99a","border-radius:6px","box-shadow:0 6px 24px rgba(0,0,0,.55)","color:#eee","font:12px/1.45 Segoe UI,Tahoma,sans-serif","pointer-events:none"].join(";"),document.body.appendChild(a));const o=document.createElement("div");o.textContent=e,o.style.cssText="font-weight:700;color:#00e99a;margin-bottom:3px;";const r=document.createElement("div");r.textContent=t,r.style.color="#ddd",a.replaceChildren(o,r),a.style.display="block",ve!==null&&clearTimeout(ve),ve=setTimeout(()=>{a.style.display="none",ve=null},6e3)}function qe(e,t,a){let o=null,r="",i="";if(typeof e=="object"&&e!==null?(o=e,r=typeof t=="string"?t:String(t||""),i=typeof a=="string"?a:String(a||"")):(r=typeof e=="string"?e:String(e||""),i=typeof t=="string"?t:String(t||"")),!(o&&!o.sendNotification)){Fe(r,i);try{const s=/expired|401|habis|kadaluarsa|dijeda|login/i.test(`${r} ${i}`);chrome.runtime.sendMessage({type:"NOTIFY",title:r,message:i,priority:s?2:1,requireInteraction:s})}catch{}}}function It(e,t){let a=null,o="success";if(typeof e=="object"&&e!==null?(a=e,o=typeof t=="string"?t:"success"):typeof e=="string"&&(o=e,typeof t=="object"&&t!==null&&(a=t)),a&&!a.soundNotificationEnabled||typeof document<"u"&&document.hidden)return;const r=a?.soundNotificationVolume!=null?a.soundNotificationVolume:.3,i=window.AudioContext||window.webkitAudioContext;if(!i)return;let s=null;try{s=new i,s.state==="suspended"&&s.resume().catch(()=>{});const n=s.createOscillator(),u=s.createGain();n.connect(u),u.connect(s.destination),u.gain.value=r,o==="success"?(n.frequency.value=800,n.start(),n.stop(s.currentTime+.1),setTimeout(()=>{try{const d=s.createOscillator(),y=s.createGain();d.connect(y),y.connect(s.destination),y.gain.value=r,d.frequency.value=1e3,d.start(),d.stop(s.currentTime+.1),setTimeout(()=>s.close().catch(()=>{}),150)}catch{try{s.close().catch(()=>{})}catch{}}},100)):(n.frequency.value=200,n.start(),n.stop(s.currentTime+.3),setTimeout(()=>s.close().catch(()=>{}),400))}catch{try{s?.close().catch(()=>{})}catch{}}}function zt(e=null){if(e&&!e.energyFullAlertSoundEnabled||typeof document<"u"&&document.hidden)return;const t=e?.energyFullAlertVolume!=null?e.energyFullAlertVolume:.3,a=window.AudioContext||window.webkitAudioContext;if(!a)return;let o=null;try{o=new a,o.state==="suspended"&&o.resume().catch(()=>{});const r=o.currentTime;[660,880,1100].forEach((i,s)=>{const n=o.createOscillator(),u=o.createGain(),d=r+s*.18;n.type="sine",n.frequency.value=i,u.gain.value=t,n.connect(u),u.connect(o.destination),n.start(d),n.stop(d+.13)}),setTimeout(()=>o.close().catch(()=>{}),800)}catch{try{o?.close().catch(()=>{})}catch{}}}function Je(){const e=N("aw_login_creds",null);if(!e)return null;try{const t=typeof e=="string"?JSON.parse(e):e;return t&&typeof t.email=="string"&&typeof t.password=="string"?t:null}catch{return null}}function Ye(e,t){const a={email:e.trim(),password:t,savedAt:Date.now()};return M("aw_login_creds",JSON.stringify(a)),a}function Ht(){M("aw_login_creds","")}function Oe(e,t){if(e)try{const a=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value")?.set;a?a.call(e,t):e.value=t,e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0}))}catch{e.value=t,e.dispatchEvent(new Event("input",{bubbles:!0}))}}function Ut(e){if(!/^\/(login|register|signup)/i.test(window.location.pathname))return;function t(){try{const a=Array.from(document.querySelectorAll("input")).filter(i=>!i.closest("#aw-panel, #aw-settings-modal, #aw-log-modal, #aw-analytics-modal")),o=a.find(i=>i.type==="email"||/email|username/i.test(i.name||i.placeholder||""))||a.find(i=>i.type==="text"&&/@/i.test(i.placeholder||"")),r=a.find(i=>i.type==="password");o?.value&&r?.value&&(Ye(o.value,r.value),console.log("[Auto Worker] Kredensial login berhasil disimpan otomatis untuk Auto Re-Login."),e?.("Kredensial login berhasil diperbarui otomatis.","info"))}catch{}}document.addEventListener("submit",t,!0),document.addEventListener("click",a=>{try{const o=a.target?.closest?.("button");o&&/masuk|login|sign in|enter/i.test(o.textContent||"")&&t()}catch{}},!0)}function Ct(e=12e3){return new Promise(t=>{const a=()=>{const s=Array.from(document.querySelectorAll("input")).filter(h=>!h.closest("#aw-panel, #aw-settings-modal, #aw-log-modal, #aw-analytics-modal")),n=s.find(h=>h.type==="email"||/email|username/i.test(h.name||h.placeholder||""))||s.find(h=>h.type==="text"&&/@/i.test(h.placeholder||"")),u=s.find(h=>h.type==="password"),d=Array.from(document.querySelectorAll("button")).filter(h=>!h.closest("#aw-panel, #aw-settings-modal, #aw-log-modal, #aw-analytics-modal")),y=d.find(h=>/masuk|login|sign in|enter/i.test(h.textContent||""))||document.querySelector('button[type="submit"]')||d.find(h=>h.offsetWidth>100);return n&&u&&y?{emailInput:n,passInput:u,submitBtn:y}:null},o=a();if(o)return t(o);const r=Date.now(),i=setInterval(()=>{const s=a();s?(clearInterval(i),t(s)):Date.now()-r>e&&(clearInterval(i),t(null))},350)})}async function Nt(e,t,a){if(!/^\/login/i.test(window.location.pathname)){try{sessionStorage.removeItem("aw_login_attempts")}catch{}return!1}if(!e?.autoReloginEnabled)return!1;const o=Je();if(!o?.email||!o?.password)return console.log("[Auto Worker] Auto Re-Login aktif tetapi belum ada email & kata sandi tersimpan."),t?.("Auto Re-Login aktif tetapi belum ada email & kata sandi tersimpan. Silakan isi di Settings atau login manual.","info"),!1;let r=0;try{r=parseInt(sessionStorage.getItem("aw_login_attempts")||"0",10)}catch{}if(r>=2)return console.warn("[Auto Worker] Auto Re-Login dihentikan sementara: telah mencoba 2x."),t?.("Auto Re-Login dihentikan sementara: telah mencoba 2x. Silakan login manual untuk verifikasi akun.","error"),a?.(e,"Auto Re-Login Dihentikan","Mencapai batas 2x percobaan. Silakan periksa akun."),!1;console.log("[Auto Worker] Halaman login terdeteksi. Mempersiapkan Auto Re-Login..."),t?.("Halaman login terdeteksi. Memulai Auto Re-Login dalam 1.5 detik...","info"),await new Promise(d=>setTimeout(d,1200));const i=await Ct(1e4);if(!i)return console.warn("[Auto Worker] Elemen form login tidak ditemukan dalam 10 detik."),t?.("Elemen form login tidak ditemukan dalam 10 detik.","warn"),!1;const{emailInput:s,passInput:n,submitBtn:u}=i;try{sessionStorage.setItem("aw_login_attempts",(r+1).toString())}catch{}return await new Promise(d=>setTimeout(d,600)),Oe(s,o.email),await new Promise(d=>setTimeout(d,450)),Oe(n,o.password),await new Promise(d=>setTimeout(d,600)),console.log(`[Auto Worker] Mengirim login otomatis untuk ${o.email}...`),t?.(`Mengirim login otomatis untuk ${o.email}...`,"info"),a?.(e,"Auto Re-Login",`Mencoba masuk otomatis sebagai ${o.email}...`),u.click(),!0}async function ge(e,t=!1){const{state:a,CONFIG:o,workHistory:r,log:i,setRunningUI:s,sendNotification:n,playNotificationSound:u,updatePanel:d,wakePendingWork:y}=e;if(!t&&a.tabLockManaged&&!a.isTabLockOwner)return"standby";if(a.workResultUncertain)return i("Hasil request kerja sebelumnya belum pasti. Muat ulang halaman untuk sinkronisasi sebelum mencoba lagi.","error"),"paused";if(a.workInFlight)if(Date.now()-(a.workInFlightAt||0)>15e3)a.workInFlight=!1;else return"busy";if(!a.running&&!t)return"paused";t&&i("Menjalankan shift kerja manual...","info");const h=re(a);if(!h)return i("Gagal membaca energi dari halaman. Mencoba lagi dalam 5 detik.","warn"),a.nextWorkTimestamp=Date.now()+5e3,"retrySoon";if(a.currentEnergy=h.current,a.maxEnergy=h.max,!t&&Be(o)){const A=Ce(o),E=String(o.sleepEndHour??6).padStart(2,"0")+":00";return i(`Jam istirahat aktif (${o.sleepStartHour??1}:00 - ${o.sleepEndHour??6}:00 WIB). Auto Worker istirahat sampai pukul ${E}...`,"info"),a.nextWorkTimestamp=Date.now()+A,d(),"waiting"}const p=ue(a,o),g=ie(o);if(t){if(a.currentEnergy<10)return i(`Energi saat ini (${a.currentEnergy}/${a.maxEnergy} EN) belum cukup! Butuh minimal 10 EN untuk giliran kerja.`,"warn"),"waiting";if(a.currentEnergy<p)return i(`Energi belum mencapai target (${a.currentEnergy}/${a.maxEnergy} EN • Target: ${p} EN).`,"warn"),"waiting"}else{if(a.currentEnergy<p)return a.nextWorkTimestamp=Date.now()+pe(a,o),"waiting";g&&a.currentEnergy>=10&&(!a._lastLoggedFlushTime||Date.now()-a._lastLoggedFlushTime>18e5)&&(a._lastLoggedFlushTime=Date.now(),i(`[Energy Flush 00:00 UTC] Jam emas aktif: Menguras sisa energi (${a.currentEnergy} EN) sebelum reset server.`,"info"))}const S=O()||h,b=typeof document<"u"&&!document.hidden?Ze():null;if(b&&Qe(b)){a.workTriggeredViaDom=!0,a.workInFlight=!0,a.workInFlightAt=Date.now();const A=new Promise(D=>{const I=_=>{_?.data?.source==="PARLAMENTUM_INTERCEPTOR"&&(_.data.type==="WORK_SUCCESS"||_.data.type==="WORK_REJECTED")&&(window.removeEventListener("message",I),D(_.data))};window.addEventListener("message",I),setTimeout(()=>{window.removeEventListener("message",I),D(null)},4e3)});Ge(b),t&&i("Shift kerja manual dikirim via tombol game...","info");const E=await A;if(a.workInFlight=!1,a.workTriggeredViaDom=!1,E&&E.type==="WORK_SUCCESS")return a.nextWorkTimestamp=Date.now()+pe(a,o),d?.(),"worked";if(E&&E.type==="WORK_REJECTED")return d?.(),"waiting";i("Tombol game tidak merespon (tab background/idle). Beralih ke direct API fetch...","info")}a.workTriggeredViaDom=!1,a.workInFlight=!0,a.workInFlightAt=Date.now();let $=null;try{if(!a.currentToken){if(xe(a,(D,I)=>e.handleNewToken(D,I)),!a.currentToken){const D=getValue("aw_auth_token");D&&e.handleNewToken(D,"storage")}if(!a.currentToken)return i("Token tidak ditemukan! Pastikan sudah login di akun Parlementum.","error"),"retry"}const A=new AbortController;$=setTimeout(()=>A.abort(),15e3);const E=await fetch("https://parlamentum.org/api/player/work",{method:"POST",headers:{"Content-Type":"application/json",Authorization:a.currentToken,Accept:"*/*"},credentials:"include",signal:A.signal,body:JSON.stringify({})});return E.ok?Kt(e,E,h,S):E.status===401?Xt(e):E.status===400||E.status===422?Vt(e,E):E.status===404||E.status===405?et()?(i("Endpoint API tidak merespon (HTTP 404), mengeksekusi klik tombol kerja di halaman...","info"),"worked"):(i(`Error HTTP: ${E.status}`,"error"),"retry"):(i(`Error HTTP: ${E.status}`,"error"),"retry")}catch(A){return A.name==="AbortError"?Ft(e,S):(console.error("[doWork] Error:",A),et()?(i("Mengeksekusi klik tombol kerja di halaman (fallback)...","info"),"worked"):(i(`Gagal koneksi: ${A.message}`,"error"),"retry"))}finally{$!==null&&clearTimeout($),a.workInFlight=!1}}function Ze(){if(typeof document>"u")return null;const e=document.querySelector('button[data-testid="work"], button[data-tutorial-target="work"]');if(e)return e;const t=document.querySelectorAll("button");for(const o of t){const r=(o.textContent||"").trim();if(/KERJAKAN\s+SATU\s+GILIRAN/i.test(r))return o}const a=document.querySelectorAll('button, [role="button"]');for(const o of a){const r=(o.getAttribute("aria-label")||o.getAttribute("title")||"").trim();if(/KERJAKAN\s+SATU\s+GILIRAN/i.test(r))return o}return null}function Qe(e){return!(!e||e.disabled||e.getAttribute("aria-disabled")==="true"||e.classList.contains("disabled")||e.style.pointerEvents==="none")}function Ge(e){if(!e)return!1;try{const t=e.getBoundingClientRect(),a=Math.floor(t.width*(.35+Math.random()*.3)),o=Math.floor(t.height*(.35+Math.random()*.3)),r=Math.round(t.left+a),i=Math.round(t.top+o),s={bubbles:!0,cancelable:!0,view:window,clientX:r,clientY:i,screenX:r+(window.screenX||0),screenY:i+(window.screenY||0),button:0,buttons:1};return typeof PointerEvent<"u"&&e.dispatchEvent(new PointerEvent("pointerdown",s)),e.dispatchEvent(new MouseEvent("mousedown",s)),typeof PointerEvent<"u"&&e.dispatchEvent(new PointerEvent("pointerup",s)),e.dispatchEvent(new MouseEvent("mouseup",s)),e.click(),!0}catch{return e.click(),!0}}function et(){const e=Ze();return e&&Qe(e)?Ge(e):!1}async function Kt(e,t,a,o){const{state:r,CONFIG:i,workHistory:s,log:n,sendNotification:u,playNotificationSound:d,updatePanel:y,wakePendingWork:h}=e;let p=null;try{p=await t.json()}catch(B){if(B.name==="AbortError")throw B;n("Respons kerja sukses, tetapi data tidak terbaca; memakai nilai fallback.","warn")}const g=p?.energyUsed!=null?Number(p.energyUsed):NaN,S=Number.isSafeInteger(g)&&g===0,T=Number.isSafeInteger(g)&&g>=10&&g<=350,b=p?.xpEarned!=null?Number(p.xpEarned):NaN,$=Number.isSafeInteger(b)&&b===0;if(S||$||p?.error||typeof p?.message=="string"&&/energy|unit/i.test(p.message)){const B=O();B?(r.currentEnergy=B.current,r.maxEnergy=B.max,r.energySyncBase={current:B.current,max:B.max,updatedAt:Date.now()}):(r.currentEnergy=0,r.energySyncBase={current:0,max:r.maxEnergy||115,updatedAt:Date.now()});const W=Math.max(10*6e4,pe(r,i));return n(`Shift selesai tapi menghasilkan 0 XP (energi game saat ini: ${r.currentEnergy}/${r.maxEnergy} EN). Menunggu energi pulih...`,"warn"),r.nextWorkTimestamp=Date.now()+W,y(),"waiting"}const A=o&&typeof o.current=="number"?o.current:a&&typeof a.current=="number"?a.current:r.currentEnergy||0,E=Math.floor(A/10)*10,D=T?g:E>0?E:10,I=Math.max(4,Math.floor(D/10)*4),_=Number.isSafeInteger(b)&&b>0?b:I,j=Number(p?.workerUnits)||Number(p?.produced)||0;if(_<=0)return n(`Shift tidak menghasilkan XP. Energi saat ini: ${r.currentEnergy}/${r.maxEnergy} EN.`,"warn"),y(),"waiting";r.totalWorked++,r.workToday++,r.totalWorkXP+=_,r.xpToday+=_,r.totalEnergySpent+=D,r.totalActualEnergySpent+=T?g:0,r.totalEstimatedEnergySpent+=T?0:D,r.lastWorkTime=new Date().toLocaleTimeString("id-ID");const v=new Date().toDateString();let m=s||e?.workHistory;if(typeof m=="string")try{m=JSON.parse(m)}catch{m={}}(!m||typeof m!="object")&&(m={}),m[v]||(m[v]={shifts:0,xp:0});const k=m[v];k.shifts=(k.shifts||0)+1,k.xp=(k.xp||0)+_,k.energySpent=(k.energySpent||0)+(T?D:0),k.estimatedEnergySpent=(k.estimatedEnergySpent||0)+(T?0:D),k.energyDataShifts=(k.energyDataShifts||0)+(T?1:0),Ie(m),e&&(e.workHistory=m),p?.energy!=null&&typeof p.energy=="number"?r.currentEnergy=Math.max(0,Math.round(p.energy)):r.currentEnergy=Math.max(0,A-D),r.energySyncBase={current:r.currentEnergy,max:r.maxEnergy,updatedAt:Date.now()},r.lastWorkTimestamp=Date.now(),r.domEnergyStale=!0,ne(r.currentEnergy,r.maxEnergy,!0);try{window.dispatchEvent(new Event("focus"))}catch{}setTimeout(()=>{const B=O();B&&(r.currentEnergy=B.current,r.maxEnergy=B.max,r.energySyncBase={current:B.current,max:B.max,updatedAt:Date.now()},r.domEnergyStale=!1,y?.())},600),we(r);const P=j>0?` | +${j} unit`:"";return n(`Kerja sukses! +${_} XP${P}`,"success"),d(i,"success"),u(i,"Parlamentum",`Kerja sukses! +${_} XP${P}`),r.nextWorkTimestamp=Date.now()+pe(r,i),y(),h?.(),"worked"}function Xt(e){const{state:t,CONFIG:a,log:o,setRunningUI:r,sendNotification:i,playNotificationSound:s,updatePanel:n}=e;return o("Sesi token kedaluwarsa (401). Me-reload tab game dalam 2 detik untuk memperbarui token...","warn"),t.pausedForToken=!0,setTimeout(()=>{window.location.reload()},2e3),"paused"}async function Vt(e,t){const{state:a,CONFIG:o,log:r,setRunningUI:i,sendNotification:s,updatePanel:n}=e,u=await t.text();let d="";try{const p=JSON.parse(u);typeof p=="string"?d=p:p&&typeof p=="object"&&(d=[p.message,p.error,p.detail,p.reason].find(g=>typeof g=="string")||"")}catch{}d||(d=u.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()),d=d.slice(0,240);const y=`${u} ${d}`;if(/wallet|wage/i.test(y))return r("Majikan Kehabisan Saldo! Kas perusahaan tidak cukup untuk membayar upah. Script dijeda.","error"),a.running=!1,i(!1),s(o,"Parlamentum","Kas majikan habis! Pindah lowongan di Job Board."),"paused";if(/region|wilayah|transit|travel|penerbangan/i.test(y))return r(`${d||"Anda harus berada di wilayah perusahaan untuk bekerja (sedang dalam perjalanan)"}. Menunggu 3 menit...`,"warn"),a.nextWorkTimestamp=Date.now()+3*6e4,n(),"waiting";if(/(insufficient[_ ]energy|not enough energy|energi.{0,40}(?:tidak|belum|kurang)|produce even one unit)/i.test(y)){const p=Math.max(0,Number(a.currentEnergy)||0),g=Math.max(1,(o.energyThreshold||90)-p),S=a.regenRate||1,T=Math.max(6e4,Math.round(g/S*6e4)),b=Math.round(T/6e4);return r(`Server menolak kerja (HTTP ${t.status}): ${d||"Energi di server belum cukup"}. Menunggu target ${o.energyThreshold} EN (~${b} mnt)...`,"warn"),a.nextWorkTimestamp=Date.now()+T,we(a),K(a,o,!0),n(),"waiting"}return r(`Server menolak kerja (HTTP ${t.status})${d?`: ${d}`:""}`,"error"),a.running=!1,i(!1),we(a),K(a,o,!0),n(),s(o,"Parlamentum Auto Worker dijeda",d||`Server menolak (HTTP ${t.status}).`),"paused"}function Ft(e,t){const{state:a,log:o,setRunningUI:r,updatePanel:i,setValue:s}=e;return a.workResultUncertain=!0,a.uncertainReconciliation="pending",e.uncertainEnergyBefore=t,s("aw_workResultUncertain","true"),s("aw_uncertainEnergyBefore",JSON.stringify(t)),a.running=!1,r(!1),o("Request kerja timeout (15 detik). Hasil belum pasti; script dijeda. Muat ulang halaman setelah memeriksa status kerja.","error"),e.reconcileUncertainWork?.(),i(),"uncertain"}const L={minimize:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>',expand:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>',lockOpen:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>',lockClosed:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',settings:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 4.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',close:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',robot:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>',play:'<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',pause:'<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>',zap:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',mapPin:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',shield:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',key:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L14 9l-1.5-1.5-3 3 1.5 1.5L9 14l-1.5-1.5-3 3 1.5 1.5L3 20l1 1 5-5-1.5-1.5 2-2 1.5 1.5 3-3-1.5-1.5 3.5-3.5a5 5 0 1 0-7-7z"></path></svg>',fileText:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',clock:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',search:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',trash:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',copy:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',bell:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>',monitor:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',check:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',alert:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',utensils:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2"></path><path d="M15 2v18"></path><path d="M7 2v20"></path><path d="M4 2v5a3 3 0 0 0 6 0V2"></path></svg>'},Te=`
    background: transparent; border: none; cursor: pointer; padding: 0;
    border-radius: 6px; display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; min-width: 24px; max-width: 24px; flex-shrink: 0 !important;
    transition: all 0.15s ease; color: #8892b0; line-height: 1; box-sizing: border-box;
`;function qt(){if(typeof document>"u"||document.getElementById("aw-panel-styles"))return;const e=document.createElement("style");e.id="aw-panel-styles",e.textContent=`
        @keyframes aw-pulse-glow {
            0% {
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 0 10px rgba(0, 255, 136, 0.25);
                border-color: rgba(0, 255, 136, 0.45);
            }
            50% {
                box-shadow: 0 16px 44px rgba(0, 0, 0, 0.65), 0 0 20px rgba(0, 255, 136, 0.65);
                border-color: rgba(0, 255, 136, 0.85);
            }
            100% {
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 0 10px rgba(0, 255, 136, 0.25);
                border-color: rgba(0, 255, 136, 0.45);
            }
        }
        @keyframes aw-pill-pulse-glow {
            0% {
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 8px rgba(0, 255, 136, 0.3);
                border-color: rgba(0, 255, 136, 0.45);
            }
            50% {
                box-shadow: 0 10px 28px rgba(0, 0, 0, 0.75), 0 0 18px rgba(0, 255, 136, 0.75);
                border-color: rgba(0, 255, 136, 0.9);
            }
            100% {
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 8px rgba(0, 255, 136, 0.3);
                border-color: rgba(0, 255, 136, 0.45);
            }
        }
        .aw-ready-glow {
            animation: aw-pulse-glow 2.2s infinite ease-in-out !important;
        }
        #aw-pill-container.aw-ready-glow {
            animation: aw-pill-pulse-glow 2.2s infinite ease-in-out !important;
        }
        .aw-btn-action {
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
            outline: none !important;
            user-select: none !important;
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
            transition: all 0.15s ease !important;
            border-radius: 6px !important;
        }
        .aw-header-btn:hover {
            background: rgba(255, 255, 255, 0.1) !important;
            color: #fff !important;
        }
        .aw-pill-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            outline: none !important;
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
            user-select: none !important;
            padding: 0 !important;
        }
        .aw-pill-btn:hover:not(:disabled) {
            filter: brightness(1.2) !important;
            transform: scale(1.08) !important;
        }
        .aw-pill-btn:active:not(:disabled) {
            transform: scale(0.94) !important;
        }
        .aw-pill-box:hover {
            border-color: rgba(255, 255, 255, 0.25) !important;
            box-shadow: 0 12px 34px rgba(0, 0, 0, 0.75), 0 0 14px rgba(0, 217, 255, 0.22) !important;
        }
    `,document.head.appendChild(e)}function Se(){if(typeof window>"u")return!0;const e=window.location.pathname||"",t=e.length>1&&e.endsWith("/")?e.slice(0,-1):e;return t==="/dashboard"||t.startsWith("/dashboard/")||t==="/"||t===""}function tt(e,t){return!(t.panelDashboardOnly&&!Se()||t.panelLeaderOnly&&e.tabLockManaged&&!e.isTabLockOwner&&typeof document<"u"&&document.hidden||e.panelVisible===!1)}function se(e,t){const a=document.getElementById("aw-panel");if(!a)return;const o=e.userManuallyToggledPanel?!!e.panelVisible:tt(e,t);a.style.display=o?"block":"none"}function Jt(e,t,a){const o=document.getElementById("aw-panel");o&&o.remove(),qt(),e.userManuallyToggledPanel=!1,t.panelDashboardOnly&&Se()&&(e.panelVisible=!0,M("panelVisible","true")),setTimeout(()=>{const r=document.createElement("div");r.id="aw-panel",r.style.cssText=`
            position: fixed; top: ${e.panelY}px; left: ${e.panelX}px;
            color: #e0e0e0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 12px;
            z-index: 99999;
            box-sizing: border-box;
            user-select: none;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
            overflow: visible;
            display: ${tt(e,t)?"block":"none"};
        `,r.innerHTML=Yt(e,t),document.body.appendChild(r),fe(e,!!e.panelMinimized),Ot(r,e,t),Zt(r,e,t,a),Gt(r,e,t),document.addEventListener("visibilitychange",()=>{document.hidden||a.updatePanel?.()}),a.log("Panel v5.11.0 siap!","success")},250)}function We(e,t,a,o){if(!chrome.runtime?.id)return;const{getSyncedEnergy:r,getPlayerLevel:i,getMaxEnergyForLevel:s}=o;if(e.userManuallyToggledPanel||se(e,t),e.tabLockManaged&&!e.isTabLockOwner){const f=Date.now();f-(We._lastStandby||0)>=3e3&&(o.reloadStateFromStorage?.(),We._lastStandby=f)}const n=o.getSyncedEnergy(e);if(n&&(e.currentEnergy=n.current,e.maxEnergy=n.max,(e.domEnergyStale||!Se())&&ne(e.currentEnergy,e.maxEnergy)),e.currentEnergy<t.energyThreshold){const f=e.regenRate||1,R=Math.max(1,(t.energyThreshold-e.currentEnergy)/f)*6e4;if(!e.nextWorkTimestamp)e.nextWorkTimestamp=Date.now()+R;else if(e.nextWorkTimestamp>Date.now()){const V=e.nextWorkTimestamp-Date.now();Math.abs(V-R)>12e4&&(e.nextWorkTimestamp=Date.now()+R)}}else e.running&&e.isTabLockOwner&&!e.workInFlight&&!e.workResultUncertain&&(!e.nextWorkTimestamp||Date.now()>=e.nextWorkTimestamp)&&(e.nextWorkTimestamp=Date.now(),o.wakePendingWork?.());const u=o.getPlayerLevel(e);if(u!==e.playerLevel&&(e.playerLevel=u,!n)){const f=s(u);f!==e.maxEnergy&&(e.maxEnergy=f)}if(e.maxEnergy>0&&e.currentEnergy>=e.maxEnergy?t.energyFullAlertEnabled&&!e.energyFullAlertActive&&(e.energyFullAlertActive=!0,(!e.tabLockManaged||e.isTabLockOwner)&&(o.log(`Energi penuh (${e.currentEnergy}/${e.maxEnergy})! Mengeksekusi shift...`,"warn"),o.playEnergyFullAlarm?.(t),o.sendNotification?.(t,"Energi Penuh",`Energi ${e.currentEnergy}/${e.maxEnergy}. Siap bekerja.`)),e.running&&e.isTabLockOwner&&!e.workInFlight&&!e.workResultUncertain&&(!e.nextWorkTimestamp||Date.now()>=e.nextWorkTimestamp)&&(e.nextWorkTimestamp=Date.now(),o.wakePendingWork?.())):e.energyFullAlertActive=!1,o.getRegionDetails){const f=o.getRegionDetails();if(f){if(f.name&&f.name!==e.regionName&&(e.regionName=f.name),f.bonusPercent!==e.regionHealthBonusPercent&&(e.regionHealthBonusPercent=f.bonusPercent),f.bonusMultiplier&&Math.abs(f.bonusMultiplier-(e.regenRate||1))>.01&&(e.regenRate=f.bonusMultiplier,e.currentEnergy<t.energyThreshold)){const R=Math.max(1,(t.energyThreshold-e.currentEnergy)/e.regenRate)*6e4;e.nextWorkTimestamp=Date.now()+R}H("aw-region-name",R=>R.textContent=e.regionName||"Wilayah"),H("aw-region-buff",R=>{R.textContent=e.regionHealthBonusPercent>0?`+${e.regionHealthBonusPercent}% Regen`:"Normal (1.0x)"})}}const y=typeof document<"u"&&document.hidden;if(t.ecoModeEnabled!==!1&&y){(!e.tabLockManaged||e.isTabLockOwner)&&K(e,t);return}const h=t.energyThreshold||10,p=e.currentEnergy>=h,g=document.getElementById("aw-panel"),S=document.getElementById("aw-pill-container");g&&(p&&e.running&&!e.workInFlight?(g.classList.add("aw-ready-glow"),S&&S.classList.add("aw-ready-glow")):(g.classList.remove("aw-ready-glow"),S&&S.classList.remove("aw-ready-glow")));const T=e.maxEnergy&&e.maxEnergy>0?e.maxEnergy:110,b=Math.max(0,Math.min(100,e.currentEnergy/T*100));H("aw-energy-text",f=>f.textContent=`${e.currentEnergy}/${e.maxEnergy}`),H("aw-energy-bar",f=>f.style.width=`${b}%`);const $=Le(e,t);H("aw-next-work",f=>{f.textContent=$,f.style.color=p?"#00ff88":"#00d9ff"}),H("aw-full-energy",f=>f.textContent=$e(e)),H("aw-pill-energy",f=>f.textContent=`${e.currentEnergy}/${e.maxEnergy}`),H("aw-pill-countdown",f=>{f.textContent=p?"Siap":$,f.style.color=p?"#00ff88":"#00d9ff"}),H("aw-pill-countdown-icon",f=>{f.innerHTML=p?L.zap:L.clock}),H("aw-pill-status-dot",f=>{const R=e.workResultUncertain?"#ffaa00":e.running?"#00ff88":"#ff4757";f.style.background=R,f.style.boxShadow=`0 0 8px ${R}`});const A=new Date,E=String(A.getUTCHours()).padStart(2,"0"),D=String(A.getUTCMinutes()).padStart(2,"0"),I=String(A.getUTCSeconds()).padStart(2,"0"),_=`${E}:${D}:${I} UTC`,j=(23-A.getUTCHours())*60+(59-A.getUTCMinutes()),v=Math.floor(j/60),m=j%60,k=`Reset: ${v}j ${m}m`,P=ie(t);H("aw-utc-time",f=>f.textContent=_),H("aw-flush-badge",f=>{f.style.display=P?"inline-block":"none"}),H("aw-utc-reset",f=>{f.textContent=k,f.title=`Reset harian server (jatah 10 slot makanan harian & bonus) terjadi pukul 00:00 UTC (${v} jam ${m} menit lagi)`}),H("aw-circuit-breaker-banner",f=>{e.circuitBreakerActive?(f.style.display="block",f.textContent=`Pemeriksaan keamanan aktif (${e.circuitBreakerReason||"Cloudflare/Maintenance"}). Worker dijeda.`):f.style.display="none"});const B=t.maxFoodDaily||e.maxFoodDaily||10,W=Math.max(0,Math.min(B,e.foodEatenToday||0)),z=Math.max(0,B-W);H("aw-food-slot-text",f=>{f.textContent=`${W}/${B}`}),H("aw-food-reminder",f=>{z===0?(f.textContent="Kuota habis",f.style.color="#10b981"):j<=240&&t.foodResetReminderEnabled!==!1?(f.textContent=`Sisa ${z}!`,f.style.color="#f59e0b"):(f.textContent=`${z} sisa`,f.style.color="#94a3b8")}),H("aw-pill-container",f=>{const R=e.workResultUncertain?"Hasil kerja belum pasti":e.running?"Sedang Berjalan":"Dijeda",V=P?" • [JAM EMAS UTC]":"";f.title=`Auto Worker: ${R}${V}
Energi: ${e.currentEnergy}/${e.maxEnergy}
Giliran: ${$}
Waktu Server: ${_} (${k})
Makanan: ${W}/${B} slot

(Seret untuk geser • Klik 2x untuk perbesar)`}),H("aw-next-wrap",f=>{if(p)f.title="Energi sudah mencapai target. Siap bekerja.";else if(e.nextWorkTimestamp&&e.nextWorkTimestamp>Date.now()){const V=new Date(e.nextWorkTimestamp).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"});f.title=`Estimasi giliran kerja: pk. ${V} WIB`}else f.title="Menunggu energi pulih..."}),H("aw-full-wrap",f=>{const R=(e.maxEnergy||115)-(e.currentEnergy||0);if(R<=0)f.title="Energi sudah 100% penuh.";else{const V=e.regenRate||1,l=Math.round(R/V*6e4),w=new Date(Date.now()+l).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}),x=Rt(),C=x?` | Sesuai game: Penuh dalam ${x}`:"";f.title=`Estimasi energi 100% penuh: pk. ${w} WIB (~${Math.round(R/V)} mnt @ ${V} EN/mnt)${C}`}}),H("aw-mode-title",f=>{f.textContent=e.running?"Auto Kerja: AKTIF":"Auto Kerja: DIJEDA",f.style.color=e.running?"#00ff88":"#ff7777"}),H("aw-mode-icon",f=>{f.innerHTML=e.running?L.zap:L.pause,f.style.color=e.running?"#00ff88":"#ff7777"}),H("aw-target-threshold",f=>{f.textContent=String(t.energyThreshold||10)}),H("aw-shift-countdown",f=>{f.textContent=p?"Siap Kerja":$,f.style.color=p?"#00ff88":"#00d9ff"}),H("aw-token-status",f=>{!!(e.tokenExpired||e.pausedForToken||e.tokenExpiry&&Number(e.tokenExpiry)<=Date.now())?(f.textContent="EXPIRED",f.style.color="#ff4444"):e.currentToken?(f.textContent="VALID",f.style.color="#00ff88"):(f.textContent="NOT FOUND",f.style.color="#ffaa00")}),H("aw-token-expiry",f=>f.textContent=$t(e)),H("aw-uncertain-banner",f=>f.style.display=e.workResultUncertain?"block":"none"),H("aw-reconciliation-status",f=>{f.textContent=e.uncertainReconciliation==="energy_changed"?"Status rekonsiliasi: perubahan energi terdeteksi; konfirmasi manual tetap diperlukan.":"Status rekonsiliasi: menunggu pembacaan energi."});const X=e.workResultUncertain||e.tabLockManaged&&!e.isTabLockOwner;H("aw-work-now",f=>f.disabled=X),H("aw-toggle",f=>f.disabled=X),H("aw-pill-toggle",f=>f.disabled=X),(!e.tabLockManaged||e.isTabLockOwner||Se()&&!document.hidden)&&K(e,t)}function Me(e){H("aw-toggle",t=>{t.innerHTML=e?`<span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">${L.pause} Jeda</span>`:`<span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">${L.play} Lanjut</span>`,t.style.background=e?"linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)":"linear-gradient(135deg, #10b981 0%, #059669 100%)",t.style.boxShadow=`0 2px 8px ${e?"rgba(239,68,68,0.3)":"rgba(16,185,129,0.3)"}`}),H("aw-status-dot",t=>{t.style.background=e?"#00ff88":"#ff4757",t.style.boxShadow=`0 0 8px ${e?"#00ff88":"#ff4757"}`}),H("aw-pill-toggle",t=>{t.innerHTML=e?L.pause:L.play,t.title=e?"Jeda Worker":"Lanjutkan Worker",t.style.background=e?"linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)":"linear-gradient(135deg, #10b981 0%, #059669 100%)",t.style.boxShadow=`0 2px 6px ${e?"rgba(239,68,68,0.35)":"rgba(16,185,129,0.35)"}`}),H("aw-pill-status-dot",t=>{t.style.background=e?"#00ff88":"#ff4757",t.style.boxShadow=`0 0 8px ${e?"#00ff88":"#ff4757"}`})}function nt(e,t){const a=document.getElementById("aw-panel");if(!a)return;const o=a.style.display!=="none";e.panelVisible=!o,e.userManuallyToggledPanel=!0,a.style.display=e.panelVisible?"block":"none",M("panelVisible",e.panelVisible.toString())}function H(e,t){const a=document.getElementById(e);a&&t(a)}function fe(e,t){e.panelMinimized=!!t,M("panelMinimized",e.panelMinimized.toString());const a=document.getElementById("aw-panel"),o=document.getElementById("aw-full-container"),r=document.getElementById("aw-pill-container"),i=document.getElementById("aw-minimize");if(a)if(e.panelMinimized)o&&(o.style.display="none"),r&&(r.style.display="flex"),a.style.width="auto",a.style.minWidth="0",a.style.maxWidth="none",a.style.background="transparent",a.style.backdropFilter="none",a.style.webkitBackdropFilter="none",a.style.border="none",a.style.boxShadow="none",a.style.borderRadius="999px",a.style.padding="0",a.style.overflow="visible",i&&(i.innerHTML=L.expand,i.title="Perbesar Panel");else{const s=window.innerWidth-335;e.panelX>s&&s>0&&(e.panelX=Math.max(10,s),a.style.left=e.panelX+"px",M("panelX",e.panelX.toString())),o&&(o.style.display="block"),r&&(r.style.display="none"),a.style.width="315px",a.style.minWidth="315px",a.style.maxWidth="325px",a.style.background="rgba(18, 22, 34, 0.92)",a.style.backdropFilter="blur(14px)",a.style.webkitBackdropFilter="blur(14px)",a.style.border="1px solid rgba(255, 255, 255, 0.08)",a.style.borderRadius="12px",a.style.boxShadow="0 16px 40px rgba(0, 0, 0, 0.55), 0 0 1px rgba(255, 255, 255, 0.15)",a.style.padding="0",a.style.overflow="visible",i&&(i.innerHTML=L.minimize,i.title="Mode Ringkas (Pill)")}}function Yt(e,t){const a=!!e.panelMinimized,o=t.panelPinned,r=e.running;return`
        <!-- Full Panel View -->
        <div id="aw-full-container" style="display: ${a?"none":"block"}; width: 100%;">
            <div id="aw-header" style="
                background: linear-gradient(135deg, rgba(26, 32, 53, 0.98) 0%, rgba(18, 22, 34, 0.98) 100%);
                padding: 10px 12px; cursor: ${o?"default":"move"};
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex; justify-content: space-between; align-items: center;
                border-radius: 12px 12px 0 0;
                gap: 8px; box-sizing: border-box; width: 100%;
            ">
                <div style="display:flex;align-items:center;gap:7px;flex-shrink:0;min-width:0;">
                    <span style="color:#38bdf8;display:flex;align-items:center;flex-shrink:0;">${L.robot}</span>
                    <span style="font-weight:700;color:#fff;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap;">Auto Worker</span>
                    <span id="aw-status-dot" style="
                        width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0;
                        background:${r?"#00ff88":"#ff4757"};
                        box-shadow:0 0 8px ${r?"#00ff88":"#ff4757"};
                    "></span>
                </div>
                <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;">
                    <button id="aw-minimize"  class="aw-header-btn" title="Mode Ringkas (Pill)" style="${Te}">${L.minimize}</button>
                    <button id="aw-pin"       class="aw-header-btn" title="${o?"Unpin":"Pin"}" style="${Te} background:${o?"rgba(0, 136, 255, 0.2)":"transparent"};color:${o?"#00d9ff":"#8892b0"};border:${o?"1px solid rgba(0, 136, 255, 0.4)":"none"};">${o?L.lockClosed:L.lockOpen}</button>
                    <button id="aw-settings"  class="aw-header-btn" title="Pengaturan" style="${Te}">${L.settings}</button>
                    <button id="aw-hide"      class="aw-header-btn" title="Sembunyikan (${t.shortcuts.showHide.display})" style="${Te}color:#ff5252;margin-left:2px;">${L.close}</button>
                </div>
            </div>
            <div id="aw-body" style="padding: 12px; display: block;">
                <div id="aw-circuit-breaker-banner" style="display:${e.circuitBreakerActive?"block":"none"};margin-bottom:10px;padding:8px 10px;background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.4);border-radius:6px;color:#fca5a5;font-size:11px;line-height:1.4;text-align:center;font-weight:600;">
                    Pemeriksaan keamanan aktif (${e.circuitBreakerReason||"Cloudflare/Maintenance"}). Worker dijeda.
                </div>
                <div id="aw-uncertain-banner" style="display:${e.workResultUncertain?"block":"none"};margin-bottom:10px;padding:9px;background:rgba(255,68,68,0.12);border:1px solid rgba(255,68,68,0.55);border-radius:6px;color:#ffb3b3;font-size:11px;line-height:1.4;">
                    <div style="display:flex;align-items:center;gap:6px;font-weight:700;color:#ff7777;margin-bottom:4px;">
                        <span style="display:flex;align-items:center;">${L.alert}</span> Hasil kerja belum pasti
                    </div>
                    <div>Periksa halaman game sebelum melanjutkan.</div>
                    <div id="aw-reconciliation-status" style="margin-top:4px;color:#ffd166;">Status rekonsiliasi: menunggu pembacaan energi.</div>
                    <button id="aw-confirm-uncertain" style="margin-top:7px;padding:5px 8px;background:#8f3030;color:#fff;border:1px solid #b44;border-radius:4px;cursor:pointer;font-size:10px;">Saya sudah memeriksa, lanjutkan</button>
                </div>

                <!-- Region & Buff Badge -->
                <div id="aw-region-badge" style="
                    display: flex; align-items: center; justify-content: space-between;
                    background: linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(16, 185, 129, 0.05) 100%);
                    border: 1px solid rgba(56, 189, 248, 0.2);
                    border-radius: 8px;
                    padding: 6px 10px;
                    margin-bottom: 9px;
                    font-size: 11px;
                ">
                    <div style="display:flex;align-items:center;gap:6px;overflow:hidden;">
                        <span style="color:#38bdf8;display:flex;align-items:center;">${L.mapPin}</span>
                        <span id="aw-region-name" style="font-weight:600;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;">${e.regionName||"Memuat wilayah..."}</span>
                    </div>
                    <span id="aw-region-buff" style="
                        background: rgba(16, 185, 129, 0.14);
                        color: #10b981;
                        border: 1px solid rgba(16, 185, 129, 0.3);
                        padding: 1px 7px;
                        border-radius: 4px;
                        font-weight: 700;
                        font-size: 9.5px;
                        white-space: nowrap;
                    ">${e.regionHealthBonusPercent?`+${e.regionHealthBonusPercent}% Regen`:"Normal (1.0x)"}</span>
                </div>

                <!-- Server Time (UTC) & Daily Reset Bar -->
                <div id="aw-utc-bar" style="
                    display: flex; align-items: center; justify-content: space-between;
                    background: rgba(255, 255, 255, 0.025);
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 7px;
                    padding: 6px 10px;
                    margin-bottom: 9px;
                    font-size: 10.5px;
                    white-space: nowrap;
                    box-sizing: border-box;
                ">
                    <div style="display:flex;align-items:center;gap:6px;white-space:nowrap;flex-shrink:0;">
                        <span style="color:#38bdf8;display:flex;align-items:center;flex-shrink:0;">${L.clock}</span>
                        <span style="color:#94a3b8;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap;flex-shrink:0;">Waktu Server:</span>
                        <span id="aw-utc-time" style="color:#38bdf8;font-weight:700;font-family:ui-monospace,Menlo,monospace;letter-spacing:0.3px;white-space:nowrap;flex-shrink:0;">00:00:00 UTC</span>
                        <span id="aw-flush-badge" style="display:none;background:rgba(245,158,11,0.2);color:#f59e0b;border:1px solid rgba(245,158,11,0.4);border-radius:4px;padding:0 5px;font-size:9px;font-weight:700;white-space:nowrap;flex-shrink:0;">JAM EMAS</span>
                    </div>
                    <span id="aw-utc-reset" style="font-size:9.5px;color:#718096;font-weight:500;white-space:nowrap;flex-shrink:0;margin-left:auto;" title="Reset harian server (jatah makanan & bonus) terjadi pada pukul 00:00 UTC">Reset: --j --m</span>
                </div>

                <!-- Daily Food Slots Bar -->
                <div id="aw-food-bar" style="
                    display: flex; align-items: center; justify-content: space-between;
                    background: rgba(255, 255, 255, 0.025);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 7px;
                    padding: 6px 10px;
                    margin-bottom: 9px;
                    font-size: 10.5px;
                    white-space: nowrap;
                    box-sizing: border-box;
                ">
                    <div style="display:flex;align-items:center;gap:5px;white-space:nowrap;flex-shrink:0;">
                        <span style="color:#f59e0b;display:flex;align-items:center;flex-shrink:0;">${L.utensils}</span>
                        <span style="color:#94a3b8;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap;flex-shrink:0;">Slot Makanan:</span>
                        <span id="aw-food-slot-text" style="color:#f59e0b;font-weight:700;font-family:ui-monospace,Menlo,monospace;letter-spacing:0.3px;white-space:nowrap;flex-shrink:0;">${e.foodEatenToday||0}/${t.maxFoodDaily||10}</span>
                        <span style="color:#475569;font-size:9px;margin:0 1px;">•</span>
                        <span id="aw-food-reminder" style="font-size:9.5px;color:#94a3b8;font-weight:500;white-space:nowrap;flex-shrink:0;">${(t.maxFoodDaily||10)-(e.foodEatenToday||0)===0?"Kuota habis":`${(t.maxFoodDaily||10)-(e.foodEatenToday||0)} sisa`}</span>
                    </div>
                    <div style="display:inline-flex;align-items:center;gap:2px;flex-shrink:0;margin-left:auto;" title="Koreksi manual jika diperlukan (deteksi otomatis tetap aktif)">
                        <button id="aw-food-dec" type="button" title="Kurangi 1 kuota makanan (koreksi manual)" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#94a3b8;border-radius:3px;padding:0 5px;font-size:10px;cursor:pointer;line-height:1.3;transition:all 0.15s ease;">-</button>
                        <button id="aw-food-inc" type="button" title="Tambah 1 kuota makanan (koreksi manual)" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#94a3b8;border-radius:3px;padding:0 5px;font-size:10px;cursor:pointer;line-height:1.3;transition:all 0.15s ease;">+</button>
                        <button id="aw-food-max" type="button" title="Set kuota penuh (koreksi manual)" style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.35);color:#f59e0b;border-radius:3px;padding:0 5px;font-size:9px;font-weight:600;cursor:pointer;line-height:1.3;transition:all 0.15s ease;">Max</button>
                    </div>
                </div>

                <!-- Energy Card -->
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);padding:10px 12px;border-radius:9px;margin-bottom:9px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:11px;">
                        <span style="display:flex;align-items:center;gap:5px;color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">
                            <span style="color:#00ff88;display:flex;align-items:center;">${L.zap}</span> Energi
                        </span>
                        <span id="aw-energy-text" style="color:#00ff88;font-weight:700;letter-spacing:0.3px;font-family:ui-monospace,Menlo,monospace;">${e.currentEnergy}/${e.maxEnergy}</span>
                    </div>
                    <div style="background:rgba(0,0,0,0.5);height:7px;border-radius:999px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);padding:1px;">
                        <div id="aw-energy-bar" style="height:100%;width:${e.currentEnergy/e.maxEnergy*100}%;background:linear-gradient(90deg, #38bdf8, #10b981);border-radius:999px;transition:width 0.3s ease;box-shadow:0 0 8px rgba(0,255,136,0.35);"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:10px;color:#718096;margin-top:6px;">
                        <span id="aw-next-wrap" style="cursor:help;">Next: <span id="aw-next-work" style="color:#00ff88;font-weight:600;">Now</span></span>
                        <span id="aw-full-wrap" style="cursor:help;">Full: <span id="aw-full-energy" style="color:#38bdf8;font-weight:500;">${$e(e)}</span></span>
                    </div>
                </div>

                <!-- Focused Auto Work Status Section -->
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);padding:8px 10px;border-radius:8px;margin-bottom:9px;display:flex;align-items:center;justify-content:space-between;font-size:11px;">
                    <div style="display:flex;align-items:center;gap:7px;">
                        <span id="aw-mode-icon" style="color:${r?"#00ff88":"#ff7777"};display:flex;align-items:center;">${r?L.zap:L.pause}</span>
                        <div>
                            <div id="aw-mode-title" style="font-weight:700;color:${r?"#00ff88":"#ff7777"};font-size:11px;">${r?"Auto Kerja: AKTIF":"Auto Kerja: DIJEDA"}</div>
                            <div style="font-size:9.5px;color:#718096;">Target: ≥ <span id="aw-target-threshold">${t.energyThreshold||10}</span> EN</div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div id="aw-shift-countdown" style="font-weight:700;color:#38bdf8;font-size:11px;">${Le(e,t)}</div>
                        <div style="font-size:9px;color:#718096;">Countdown</div>
                    </div>
                </div>

                <!-- Token & Expiry Row -->
                <div style="font-size:10.5px;color:#718096;margin-bottom:9px;padding:6px 9px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="color:#38bdf8;display:flex;align-items:center;">${L.shield}</span>
                        <span style="color:#a0aec0;">Sesi Auth:</span>
                        <span id="aw-token-status" style="font-weight:700;color:#00ff88;">VALID</span>
                    </div>
                    <span id="aw-token-expiry" style="font-size:10px;color:#718096;">N/A</span>
                </div>

                <!-- Action Buttons -->
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
                    <button id="aw-work-now" class="aw-btn-action" style="
                        background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
                        color: #fff; border: 1px solid rgba(255,255,255,0.15);
                        padding: 8px 0; border-radius: 7px; cursor: pointer;
                        font-weight: 600; font-size: 11px; box-shadow: 0 2px 6px rgba(2,132,199,0.25);
                    "><span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">${L.zap} Kerja</span></button>
                    <button id="aw-toggle" class="aw-btn-action" style="
                        background: ${r?"linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)":"linear-gradient(135deg, #10b981 0%, #059669 100%)"};
                        color: #fff; border: 1px solid rgba(255,255,255,0.15);
                        padding: 8px 0; border-radius: 7px; cursor: pointer;
                        font-weight: 600; font-size: 11px;
                        box-shadow: 0 2px 6px ${r?"rgba(239,68,68,0.25)":"rgba(16,185,129,0.25)"};
                    "><span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">${r?L.pause+" Jeda":L.play+" Lanjut"}</span></button>
                    <button id="aw-logs" class="aw-btn-action" style="
                        background: linear-gradient(135deg, #475569 0%, #334155 100%);
                        color: #fff; border: 1px solid rgba(255,255,255,0.15);
                        padding: 8px 0; border-radius: 7px; cursor: pointer;
                        font-weight: 600; font-size: 11px; box-shadow: 0 2px 6px rgba(71,85,105,0.25);
                    "><span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">${L.fileText} Log</span></button>
                </div>
            </div>
        </div>

        <!-- Mini Floating Pill Container (Mode Ringkas) -->
        <div id="aw-pill-container" class="aw-pill-box" style="
            display: ${a?"flex":"none"};
            align-items: center;
            gap: 7px;
            background: linear-gradient(135deg, rgba(20, 25, 42, 0.95) 0%, rgba(13, 16, 26, 0.98) 100%);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 999px;
            padding: 4px 8px 4px 10px;
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.2);
            cursor: ${o?"default":"move"};
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
            box-sizing: border-box;
            white-space: nowrap;
        " title="Auto Worker • Seret untuk pindah • Klik 2x untuk perbesar">

            <!-- Robot Icon & Live Status Dot -->
            <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;">
                <span style="color: #38bdf8; display: flex; align-items: center;">${L.robot}</span>
                <span id="aw-pill-status-dot" style="
                    width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0;
                    background: ${r?"#00ff88":"#ff4757"};
                    box-shadow: 0 0 8px ${r?"#00ff88":"#ff4757"};
                "></span>
            </div>

            <!-- Energy Badge -->
            <div id="aw-pill-energy-badge" style="
                display: flex; align-items: center; gap: 4px;
                background: rgba(0, 255, 136, 0.08);
                border: 1px solid rgba(0, 255, 136, 0.22);
                border-radius: 6px;
                padding: 2px 7px;
                font-size: 11px;
                font-weight: 700;
                color: #00ff88;
                letter-spacing: 0.2px;
                flex-shrink: 0;
            " title="Energi Saat Ini">
                <span style="display: flex; align-items: center;">${L.zap}</span>
                <span id="aw-pill-energy">${e.currentEnergy||0}/${e.maxEnergy||110}</span>
            </div>

            <!-- Next Work / Countdown Badge -->
            <div id="aw-pill-countdown-badge" style="
                display: flex; align-items: center; gap: 4px;
                background: rgba(56, 189, 248, 0.08);
                border: 1px solid rgba(56, 189, 248, 0.22);
                border-radius: 6px;
                padding: 2px 7px;
                font-size: 11px;
                font-weight: 700;
                color: #38bdf8;
                letter-spacing: 0.2px;
                flex-shrink: 0;
            " title="Countdown Giliran Kerja">
                <span id="aw-pill-countdown-icon" style="display: flex; align-items: center;">${L.clock}</span>
                <span id="aw-pill-countdown">Memuat...</span>
            </div>

            <!-- Subtle Divider -->
            <div style="width: 1px; height: 16px; background: rgba(255, 255, 255, 0.12); flex-shrink: 0; margin: 0 1px;"></div>

            <!-- Mini Quick Actions -->
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                <button id="aw-pill-toggle" class="aw-pill-btn" style="
                    width: 22px; height: 22px; border-radius: 50%; border: none;
                    background: ${r?"linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)":"linear-gradient(135deg, #10b981 0%, #059669 100%)"};
                    color: #fff; font-size: 9.5px; font-weight: 700;
                    box-shadow: 0 2px 6px ${r?"rgba(239,68,68,0.35)":"rgba(16,185,129,0.35)"};
                " title="${r?"Jeda Worker":"Lanjutkan Worker"}">${r?L.pause:L.play}</button>

                <button id="aw-pill-expand" class="aw-pill-btn" style="
                    width: 22px; height: 22px; border-radius: 50%;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    color: #cbd5e1;
                " title="Perbesar ke Panel Penuh">${L.expand}</button>
            </div>
        </div>
    `}function Ot(e,t,a){let o=!1,r=0,i=0,s=0,n=0;const u=h=>{a.panelPinned||h.target.closest("button")||(o=!0,r=h.clientX,i=h.clientY,s=t.panelX,n=t.panelY,h.preventDefault())},d=document.getElementById("aw-header"),y=document.getElementById("aw-pill-container");d&&d.addEventListener("mousedown",u),y&&y.addEventListener("mousedown",u),document.addEventListener("mousemove",h=>{o&&(t.panelX=Math.max(0,s+h.clientX-r),t.panelY=Math.max(0,n+h.clientY-i),e.style.left=t.panelX+"px",e.style.top=t.panelY+"px")}),document.addEventListener("mouseup",()=>{o&&(o=!1,M("panelX",t.panelX.toString()),M("panelY",t.panelY.toString()))})}function Zt(e,t,a,o){const{openSettings:r,openLogViewer:i,doWork:s}=o,n=document.getElementById("aw-minimize"),u=document.getElementById("aw-pin"),d=document.getElementById("aw-hide"),y=document.getElementById("aw-toggle"),h=document.getElementById("aw-work-now"),p=document.getElementById("aw-logs"),g=document.getElementById("aw-settings"),S=document.getElementById("aw-confirm-uncertain"),T=document.getElementById("aw-pill-expand"),b=document.getElementById("aw-pill-toggle"),$=document.getElementById("aw-header"),A=document.getElementById("aw-pill-container");e.querySelectorAll(".aw-header-btn").forEach(v=>{v.addEventListener("mouseenter",()=>{v.style.background="rgba(255,255,255,0.12)",v.style.color="#fff"}),v.addEventListener("mouseleave",()=>{v.id==="aw-pin"&&a.panelPinned?(v.style.background="rgba(0, 136, 255, 0.2)",v.style.color="#00d9ff"):v.id==="aw-hide"?(v.style.background="transparent",v.style.color="#ff5252"):(v.style.background="transparent",v.style.color="#8892b0")})}),n?.addEventListener("click",()=>{fe(t,!t.panelMinimized),o.updatePanel?.()}),T?.addEventListener("click",()=>{fe(t,!1),o.updatePanel?.()}),$?.addEventListener("dblclick",v=>{v.target.closest("button")||(fe(t,!0),o.updatePanel?.())}),A?.addEventListener("dblclick",v=>{v.target.closest("button")||(fe(t,!1),o.updatePanel?.())}),u?.addEventListener("click",()=>{a.panelPinned=!a.panelPinned,o.saveConfig?.(a);const v=document.getElementById("aw-header"),m=document.getElementById("aw-pill-container");v&&(v.style.cursor=a.panelPinned?"default":"move"),m&&(m.style.cursor=a.panelPinned?"default":"move"),u&&(u.style.background=a.panelPinned?"rgba(0, 136, 255, 0.2)":"transparent",u.style.color=a.panelPinned?"#00d9ff":"#8892b0",u.style.border=a.panelPinned?"1px solid rgba(0, 136, 255, 0.4)":"none",u.title=a.panelPinned?"Unpin":"Pin")});function E(){t.running=!t.running,Me(t.running),o.log(t.running?"Script dilanjutkan":"Script di-pause","info"),t.running&&o.wakePendingWork?.(),we(t);const v=K(t,a,!0);o.updatePanel?.();try{chrome?.runtime?.id&&(chrome.storage.local.set({aw_live_status:v}),chrome.runtime.sendMessage({type:"POPUP_TO_TAB",action:"toggleRunning",value:t.running}).catch(()=>{}))}catch{}}b?.addEventListener("click",E),g?.addEventListener("click",()=>o.openSettings?.()),d?.addEventListener("click",()=>nt(t)),y?.addEventListener("click",E),h?.addEventListener("click",()=>{o.log("Manual work triggered!","info"),o.doWork?.(!0)}),p?.addEventListener("click",()=>o.openLogViewer?.());const D=document.getElementById("aw-food-dec"),I=document.getElementById("aw-food-inc"),_=document.getElementById("aw-food-max");function j(v){try{const m=new BroadcastChannel("aw_parlamentum_tabs");m.postMessage({type:"FOOD_UPDATED",foodEatenToday:v,timestamp:Date.now()}),m.close()}catch{}}D?.addEventListener("click",v=>{v.stopPropagation(),t.foodEatenToday=Math.max(0,(t.foodEatenToday||0)-1),M("aw_foodEatenToday",t.foodEatenToday.toString()),K(t,a,!0),j(t.foodEatenToday),o.updatePanel?.()}),I?.addEventListener("click",v=>{v.stopPropagation();const m=a.maxFoodDaily||t.maxFoodDaily||10;t.foodEatenToday=Math.min(m,(t.foodEatenToday||0)+1),M("aw_foodEatenToday",t.foodEatenToday.toString()),K(t,a,!0),j(t.foodEatenToday),o.updatePanel?.()}),_?.addEventListener("click",v=>{v.stopPropagation();const m=a.maxFoodDaily||t.maxFoodDaily||10;t.foodEatenToday=m,M("aw_foodEatenToday",m.toString()),K(t,a,!0),j(m),o.log(`Slot makanan disetel penuh (${m}/${m}). Kuota tercapai.`,"info"),o.updatePanel?.()}),S?.addEventListener("click",()=>{if(!t.workResultUncertain||!t.isTabLockOwner||!confirm("Pastikan sudah memeriksa halaman game. Lanjutkan worker?"))return;t.workResultUncertain=!1,t.uncertainReconciliation="none",o.uncertainEnergyBefore=null,M("aw_workResultUncertain","false"),M("aw_uncertainEnergyBefore",""),t.energySyncBase=null;const v=getCurrentEnergy();v&&(t.currentEnergy=v.current,t.maxEnergy=v.max),t.running=!0,o.log("Worker dilanjutkan setelah hasil timeout diperiksa manual.","warn"),o.updatePanel?.(),o.wakePendingWork?.()}),document.removeEventListener("keydown",e._keyHandler,!0),e._keyHandler=Qt(t,a,o,E),document.addEventListener("keydown",e._keyHandler,!0)}function Qt(e,t,a,o){return function(i){if(e.settingsOpen)return;const s=i.target;if(!(s?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(s?.tagName)))for(const[n,u]of Object.entries(t.shortcuts)){if(!u?.keys||u.keys.length===0)continue;const d=u.keys.includes("Control"),y=u.keys.includes("Shift"),h=u.keys.includes("Alt");if(!!i.ctrlKey!==d||!!i.shiftKey!==y||!!i.altKey!==h||i.metaKey)continue;const p=u.keys.filter(g=>g!=="Control"&&g!=="Shift"&&g!=="Alt");if(!(p.length>0&&!p.includes(i.code))){if(n==="pauseResume"&&e.tabLockManaged&&!e.isTabLockOwner)return;i.preventDefault(),i.stopPropagation(),n==="showHide"?nt(e):n==="workNow"?(a.log("Manual work!","info"),a.doWork?.(!0)):n==="pauseResume"?o():n==="openLog"?a.openLogViewer?.():n==="openSettings"&&a.openSettings?.();return}}}}function Gt(e,t,a){a.panelFollowViewport&&window.addEventListener("resize",()=>{const o=window.innerWidth-e.offsetWidth-10,r=window.innerHeight-e.offsetHeight-10;(t.panelX>o||t.panelY>r)&&(a.panelReturnToOriginal?(t.panelX=t.originalPanelX,t.panelY=t.originalPanelY):(t.panelX=Math.max(0,Math.min(t.panelX,o)),t.panelY=Math.max(0,Math.min(t.panelY,r))),e.style.left=t.panelX+"px",e.style.top=t.panelY+"px")})}function en(){if(document.getElementById("aw-settings-styles"))return;const e=document.createElement("style");e.id="aw-settings-styles",e.textContent=`
        /* Modal & Container */
        #aw-settings-modal {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #e2e8f0;
        }

        /* Modern Tabs Navigation */
        .aw-tab-nav {
            display: flex;
            gap: 5px;
            padding: 8px 14px;
            background: rgba(12, 16, 26, 0.7);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            overflow-x: auto;
            scrollbar-width: none;
            scroll-behavior: smooth;
        }
        .aw-tab-nav::-webkit-scrollbar {
            display: none;
        }
        .aw-tab-btn {
            flex: 1 1 auto;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            padding: 7px 10px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 8px;
            color: #8b9bb4;
            font-size: 11.5px;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
        }
        .aw-tab-btn:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.15);
        }
        .aw-tab-btn.active {
            color: #00ff88;
            background: linear-gradient(135deg, rgba(0, 255, 136, 0.14), rgba(0, 180, 216, 0.09));
            border-color: rgba(0, 255, 136, 0.5);
            font-weight: 600;
            box-shadow: 0 2px 10px rgba(0, 255, 136, 0.15);
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
    `,document.head.appendChild(e)}function tn(e,t){en();const a=Je(),o=document.getElementById("aw-settings-modal");o&&o.remove();const r=document.createElement("div");r.id="aw-settings-modal",r.style.cssText=`
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(4, 7, 14, 0.78);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 100001;
        justify-content: center;
        align-items: center;
    `;const i=[{id:"showHide",label:"Tampilkan/Sembunyikan Panel"},{id:"workNow",label:"Kerja Sekarang (Work Now)"},{id:"pauseResume",label:"Jeda/Lanjutkan (Pause/Resume)"},{id:"openLog",label:"Buka Activity Log"},{id:"openSettings",label:"Buka Menu Pengaturan"}],s=i.map(m=>{const k=e.shortcuts[m.id]||{display:""};return`
            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px; background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="color: #cbd5e1; font-size: 12px; flex: 1; font-weight: 500;">${m.label}</span>
                <div style="display: flex; gap: 8px; align-items: center; flex: 0 0 210px;">
                    <button id="record-${m.id}" style="
                        background: #252c40; color: #fff; border: 1px solid #3b4563;
                        padding: 6px 10px; border-radius: 6px; cursor: pointer;
                        font-size: 11px; min-width: 76px; font-weight: 500; transition: background 0.15s;
                    ">Rekam</button>
                    <input type="text" id="shortcut-${m.id}" value="${k.display}"
                        readonly
                        style="width: 110px; background: #121624; color: #00d4ff; border: 1px solid #28334e; border-radius: 6px; padding: 6px 8px; font-size: 11px; font-weight: 700; text-align: center;">
                </div>
            </div>
        `}).join("");r.innerHTML=`
        <div style="
            background: linear-gradient(180deg, #131724 0%, #0d101a 100%);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            width: 95%;
            max-width: 680px;
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
                        background: linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,180,216,0.2));
                        border: 1px solid rgba(0,255,136,0.3);
                        display: flex; align-items: center; justify-content: center;
                        color: #00ff88;
                    ">${L.settings}</div>
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 14.5px; letter-spacing: 0.3px;">Pengaturan Bot</div>
                        <div style="font-size: 11px; color: #8b9bb4;">Sesuaikan jadwal, threshold, notifikasi & keamanan</div>
                    </div>
                </div>
                <button id="aw-close-settings" style="
                    background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                    padding: 6px 12px; border-radius: 8px; cursor: pointer;
                    font-size: 12px; font-weight: 600; transition: all 0.15s;
                ">Tutup</button>
            </div>

            <!-- Segmented Category Tabs -->
            <div class="aw-tab-nav">
                <button class="aw-tab-btn active" data-tab="tab-work">${L.zap} Kerja & Energi</button>
                <button class="aw-tab-btn" data-tab="tab-stealth">${L.shield} Stealth & Jadwal</button>
                <button class="aw-tab-btn" data-tab="tab-notif">${L.bell} Notifikasi & Suara</button>
                <button class="aw-tab-btn" data-tab="tab-ui">${L.monitor} Tampilan & Pintasan</button>
                <button class="aw-tab-btn" data-tab="tab-account">${L.key} Akun & Sistem</button>
            </div>

            <!-- Scrollable Content Body -->
            <div id="aw-settings-content" style="
                padding: 18px 20px;
                overflow-y: auto;
                flex: 1;
                overscroll-behavior: contain;
            ">
                <!-- TAB 1: KERJA & ENERGI -->
                <div id="tab-work" class="aw-tab-pane active">
                    <div class="aw-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="aw-card-title">Batas Energi Sebelum Kerja</div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="number" id="setting-energy-threshold-num" min="10" max="100" step="5" value="${e.energyThreshold}" class="aw-num-badge">
                                <span style="color: #00ff88; font-size: 11px; font-weight: 700;">EN</span>
                            </div>
                        </div>
                        <div class="aw-card-desc" style="margin-bottom: 12px;">
                            Bot hanya akan mengeksekusi shift kerja saat energi akun mencapai angka ini.
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 12px;">
                            <input type="range" id="setting-energy-threshold" min="10" max="100" step="5" value="${e.energyThreshold}" class="aw-range-slider">
                        </div>
                        <!-- Quick Presets -->
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="font-size: 11px; color: #64748b; margin-right: 4px;">Pilihan Cepat:</span>
                            <button type="button" class="aw-preset-btn" data-val="10">10 EN</button>
                            <button type="button" class="aw-preset-btn" data-val="25">25 EN</button>
                            <button type="button" class="aw-preset-btn" data-val="50">50 EN</button>
                            <button type="button" class="aw-preset-btn" data-val="80">80 EN</button>
                            <button type="button" class="aw-preset-btn" data-val="100">100 EN</button>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Energy Flush 00:00 UTC (Jam Emas)</div>
                                <div class="aw-card-desc">Otomatis menguras seluruh sisa energi (≥ 10 EN) 45 menit sebelum reset server harian (23:15-23:59 UTC / 06:15-06:59 WIB) agar tidak ada energi yang hangus.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-energy-flush" ${e.energyFlushEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Batas Jatah Makanan Harian (Roti)</div>
                                <div class="aw-card-desc">Batas konsumsi roti harian dari game (disetel ulang 00:00 UTC). Pemain standar memiliki kuota 10 slot, sedangkan akun Premium memiliki kuota 20 slot.</div>
                            </div>
                            <select id="setting-max-food-daily" class="aw-select-box">
                                <option value="10" ${(e.maxFoodDaily??10)===10?"selected":""}>10 Slot (Regular)</option>
                                <option value="20" ${(e.maxFoodDaily??10)===20?"selected":""}>20 Slot (Premium)</option>
                            </select>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Pengingat Kuota Roti Sebelum Reset UTC</div>
                                <div class="aw-card-desc">Menampilkan penanda visual mencolok jika waktu server mendekati pergantian hari (&lt; 4 jam ke 00:00 UTC) dan kuota makanan masih belum habis digunakan.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-food-reset-reminder" ${e.foodResetReminderEnabled!==!1?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Formula Sleep Info Card -->
                    <div style="background: rgba(0, 255, 136, 0.04); border: 1px solid rgba(0, 255, 136, 0.15); border-radius: 10px; padding: 14px; margin-top: 14px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="color: #00ff88; font-size: 12px; font-weight: 600;">Rumus Timer Pemulihan</span>
                            <span style="color: #94a3b8; font-size: 11px; font-family: monospace;">(Threshold - Sisa) × 60s + Jitter</span>
                        </div>
                        <div style="font-size: 11px; color: #94a3b8; line-height: 1.5;">
                            • <b>Buff Wilayah:</b> Jika tinggal di wilayah berfasilitas (seperti Jawa Barat), pemulihan energi otomatis dipercepat hingga +50% (40 detik per energi).<br>
                            • <b>Optimistic Decrement:</b> Energi langsung terpotong seketika shift dikirimkan, mencegah tabrakan permintaan ganda (0 race conditions).
                        </div>
                    </div>
                </div>

                <!-- TAB 2: STEALTH & JADWAL -->
                <div id="tab-stealth" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Threshold Jitter (Anti-Pola)</div>
                                <div class="aw-card-desc">Mengacak sedikit ambang batas energi (±2 EN) di setiap siklus agar interval kerja tidak terbaca kaku dan terdeteksi bot oleh server.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-stealth-jitter" ${e.stealthJitterEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 10px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Jadwal Istirahat Malam</div>
                                <div class="aw-card-desc">Bot otomatis berhenti kerja pada rentang jam istirahat malam layaknya pola hidup manusia normal.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-sleep-schedule" ${e.sleepScheduleEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center; background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
                            <span style="font-size: 12px; color: #94a3b8;">Jam Istirahat:</span>
                            <select id="setting-sleep-start" class="aw-select-box">
                                ${Array.from({length:24},(m,k)=>`<option value="${k}" ${(e.sleepStartHour??1)===k?"selected":""}>${String(k).padStart(2,"0")}:00</option>`).join("")}
                            </select>
                            <span style="font-size: 12px; color: #64748b;">s/d</span>
                            <select id="setting-sleep-end" class="aw-select-box">
                                ${Array.from({length:24},(m,k)=>`<option value="${k}" ${(e.sleepEndHour??6)===k?"selected":""}>${String(k).padStart(2,"0")}:00</option>`).join("")}
                            </select>
                            <span style="font-size: 11px; color: #64748b; margin-left: auto;">WIB</span>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Peredam Log Energi Rendah (Quiet Mode)</div>
                                <div class="aw-card-desc">Membatasi log "Energi tidak cukup" maksimal 1x per 2 menit agar Activity Log tetap bersih dan mudah dibaca.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-quiet-mode" ${e.quietModeEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- TAB 3: NOTIFIKASI & SUARA -->
                <div id="tab-notif" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Notifikasi Pop-up Browser</div>
                                <div class="aw-card-desc">Menampilkan banner notifikasi desktop browser ketika shift berhasil dikerjakan.</div>
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
                                <div class="aw-card-title">Alert Desktop Saat Energi Penuh</div>
                                <div class="aw-card-desc">Kirim notifikasi desktop segera setelah energi mencapai batas maksimal agar tidak terbuang.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-energy-full-alert" ${e.energyFullAlertEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 8px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Suara Notifikasi Kerja</div>
                                <div class="aw-card-desc">Putar efek audio halus saat selesai bekerja atau terjadi kesalahan.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-sound-notification-enabled" ${e.soundNotificationEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center; margin-top: 6px;">
                            <span style="font-size: 11px; color: #94a3b8; width: 50px;">Volume:</span>
                            <input type="range" id="setting-sound-notification-volume" min="0" max="100" value="${Math.round(e.soundNotificationVolume*100)}" class="aw-range-slider">
                            <input type="number" id="setting-sound-notification-volume-num" min="0" max="100" value="${Math.round(e.soundNotificationVolume*100)}" class="aw-num-badge" style="color: #00d4ff;">
                            <span style="color: #64748b; font-size: 12px;">%</span>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 8px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Alarm Suara Energi Penuh</div>
                                <div class="aw-card-desc">Putar alarm khusus saat energi akun sudah menyentuh kapasitas maksimal.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-energy-full-sound-enabled" ${e.energyFullAlertSoundEnabled?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center; margin-top: 6px;">
                            <span style="font-size: 11px; color: #94a3b8; width: 50px;">Volume:</span>
                            <input type="range" id="setting-energy-full-volume" min="0" max="100" value="${Math.round(e.energyFullAlertVolume*100)}" class="aw-range-slider">
                            <input type="number" id="setting-energy-full-volume-num" min="0" max="100" value="${Math.round(e.energyFullAlertVolume*100)}" class="aw-num-badge" style="color: #00d4ff;">
                            <span style="color: #64748b; font-size: 12px;">%</span>
                        </div>
                    </div>

                    <button id="aw-test-notification-sound" style="
                        background: rgba(255, 255, 255, 0.05); color: #fff; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 9px 16px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; width: 100%; font-weight: 600; margin-top: 4px;
                        transition: all 0.15s;
                    ">Uji Coba Bunyi Suara (Test Sound)</button>
                </div>

                <!-- TAB 4: TAMPILAN & SHORTCUT -->
                <div id="tab-ui" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Hanya Tampilkan di Dashboard (/dashboard)</div>
                                <div class="aw-card-desc">Otomatis sembunyikan panel jika membuka halaman lain (misal: /map, /market). Bot tetap aktif di background.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-panel-dashboard-only" ${e.panelDashboardOnly?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Hanya Tampilkan di Tab Utama (Standby Hidden)</div>
                                <div class="aw-card-desc">Jika membuka banyak tab game bersamaan, panel hanya melayang di tab utama yang memimpin kerja.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-panel-leader-only" ${e.panelLeaderOnly?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 8px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Sesuaikan dengan Ukuran Jendela Browser</div>
                                <div class="aw-card-desc">Mencegah panel keluar layar saat ukuran browser diperkecil.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-follow-viewport" ${e.panelFollowViewport?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Kembali ke Posisi Semula Saat Browser Dibesarkan</div>
                                <div class="aw-card-desc">Mengembalikan panel ke koordinat asal saat ruang layar kembali lega.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-return-original" ${e.panelReturnToOriginal?"checked":""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <button id="aw-reset-position" style="
                        background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1);
                        padding: 8px 16px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; width: 100%; margin-bottom: 16px; font-weight: 500;
                        transition: all 0.15s;
                    ">Atur Ulang Posisi Panel ke Pojok Kanan</button>

                    <!-- Keyboard Shortcuts Sub-Section -->
                    <div style="margin-top: 10px;">
                        <div style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 4px;">Pintasan Keyboard (Shortcuts)</div>
                        <div style="font-size: 11px; color: #8b9bb4; margin-bottom: 10px;">
                            Klik <b>Rekam</b> lalu tekan 1–3 kombinasi tombol. Tekan <kbd style="background:#222;padding:1px 4px;border-radius:3px;">Enter</kbd> untuk simpan, <kbd style="background:#222;padding:1px 4px;border-radius:3px;">Esc</kbd> untuk batalkan.
                        </div>
                        ${s}
                        <div id="shortcut-error" style="color: #ff4444; font-size: 11px; margin-top: 8px; display: none;"></div>
                    </div>
                </div>

                <!-- TAB 5: AKUN & SISTEM -->
                <div id="tab-account" class="aw-tab-pane">
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
                                <div class="aw-card-desc">Memuat ulang tab secara higienis setelah berjalan 12+ jam saat energi kosong (< 20 EN) dan countdown masih lama (> 20 menit), mencegah tab browser crash karena memory leak game.</div>
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
    `,document.body.appendChild(r);const n=r.querySelector(".aw-tab-nav"),u=r.querySelectorAll(".aw-tab-btn"),d=r.querySelectorAll(".aw-tab-pane");u.forEach(m=>{m.addEventListener("click",()=>{const k=m.dataset.tab;u.forEach(B=>B.classList.remove("active")),d.forEach(B=>B.classList.remove("active")),m.classList.add("active"),m.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"});const P=r.querySelector(`#${k}`);P&&P.classList.add("active")})}),n?.addEventListener("wheel",m=>{m.deltaY!==0&&(m.preventDefault(),n.scrollLeft+=m.deltaY)},{passive:!1});let y=null;function h(m=!1){const k=document.getElementById("setting-energy-threshold"),P=document.getElementById("setting-energy-threshold-num"),B=parseInt(k?.value??"",10),W=parseInt(P?.value??"",10),z=!isNaN(W)&&W>=10&&W<=100?W:isNaN(B)?e.energyThreshold:B;z>=10&&z<=100&&(e.energyThreshold=z,k&&k.value!==String(z)&&(k.value=z),P&&P.value!==String(z)&&(P.value=z));const X=document.getElementById("setting-quiet-mode");X&&(e.quietModeEnabled=X.checked);const f=document.getElementById("setting-panel-dashboard-only");f&&(e.panelDashboardOnly=f.checked);const R=document.getElementById("setting-panel-leader-only");R&&(e.panelLeaderOnly=R.checked);const V=document.getElementById("setting-follow-viewport");V&&(e.panelFollowViewport=V.checked);const l=document.getElementById("setting-return-original");l&&(e.panelReturnToOriginal=l.checked);const c=document.getElementById("setting-sound-notification-enabled");c&&(e.soundNotificationEnabled=c.checked);const w=document.getElementById("setting-sound-notification-volume");if(w){const Q=Math.max(0,Math.min(100,parseInt(w.value||"30",10)));e.soundNotificationVolume=Q/100}const x=document.getElementById("setting-energy-full-sound-enabled");x&&(e.energyFullAlertSoundEnabled=x.checked);const C=document.getElementById("setting-energy-full-volume");if(C){const Q=Math.max(0,Math.min(100,parseInt(C.value||"30",10)));e.energyFullAlertVolume=Q/100}const q=document.getElementById("setting-notifications");q&&(e.sendNotification=q.checked);const de=document.getElementById("setting-energy-full-alert");de&&(e.energyFullAlertEnabled=de.checked);const ye=document.getElementById("setting-stealth-jitter");ye&&(e.stealthJitterEnabled=ye.checked);const rt=document.getElementById("setting-energy-flush");rt&&(e.energyFlushEnabled=rt.checked);const it=document.getElementById("setting-max-food-daily");it&&(e.maxFoodDaily=parseInt(it.value,10)||10);const st=document.getElementById("setting-food-reset-reminder");st&&(e.foodResetReminderEnabled=st.checked);const lt=document.getElementById("setting-auto-reload-tab");lt&&(e.autoReloadTabEnabled=lt.checked);const dt=document.getElementById("setting-circuit-breaker");dt&&(e.circuitBreakerEnabled=dt.checked);const ct=document.getElementById("setting-sleep-schedule");ct&&(e.sleepScheduleEnabled=ct.checked);const ut=document.getElementById("setting-sleep-start");ut&&(e.sleepStartHour=parseInt(ut.value,10));const pt=document.getElementById("setting-sleep-end");pt&&(e.sleepEndHour=parseInt(pt.value,10));const gt=document.getElementById("setting-auto-relogin");gt&&(e.autoReloginEnabled=gt.checked);const ft=document.getElementById("setting-eco-mode");if(ft&&(e.ecoModeEnabled=ft.checked),m){const Q={};i.forEach(G=>{const yt=document.getElementById(`shortcut-${G.id}`)?.value.trim()??"",hn=yt.split("+").filter(Boolean).map(J=>J==="Ctrl"?"Control":J==="Shift"?"Shift":J==="Alt"?"Alt":J==="Space"?"Space":J.length===1&&/[A-Z]/.test(J)?`Key${J}`:/^\d$/.test(J)?`Digit${J}`:J);Q[G.id]={keys:hn,display:yt}});const mn=be({shortcuts:Q},!0),yn=Object.values(Q).every(G=>G.keys.some(Pe=>Pe==="Control"||Pe==="Alt")),mt=Object.values(Q).map(G=>G.display),bn=new Set(mt).size===mt.length;if(mn&&yn&&bn){e.shortcuts=Q;const G=document.getElementById("shortcut-error");G&&(G.style.display="none")}}he(e),t.updatePanelVisibility?.(e),t.updatePanel?.();const Z=document.getElementById("aw-settings-status");Z&&(y&&clearTimeout(y),m?(Z.textContent=`Tersimpan! Batas energi: ${e.energyThreshold} EN`,Z.style.color="#00ff88",Z.style.display="block"):(Z.textContent=`Disimpan otomatis (Batas: ${e.energyThreshold} EN)`,Z.style.color="#00e99a",Z.style.display="block",y=setTimeout(()=>{Z&&(Z.style.display="none")},2500)))}function p(m,k){const P=document.getElementById(m),B=document.getElementById(k);if(!P||!B)return;const W=z=>{let X=parseInt(z,10);(isNaN(X)||X<0)&&(X=0),X>100&&(X=100),P.value=X,B.value=X,h(!1)};P.addEventListener("input",z=>W(z.target.value)),P.addEventListener("change",z=>W(z.target.value)),B.addEventListener("input",z=>W(z.target.value)),B.addEventListener("change",z=>W(z.target.value)),B.addEventListener("blur",z=>W(z.target.value))}p("setting-sound-notification-volume","setting-sound-notification-volume-num"),p("setting-energy-full-volume","setting-energy-full-volume-num");const g=document.getElementById("setting-energy-threshold"),S=document.getElementById("setting-energy-threshold-num");if(g&&S){const m=k=>{let P=parseInt(k,10);(isNaN(P)||P<10)&&(P=10),P>100&&(P=100),g.value=P,S.value=P,h(!1)};g.addEventListener("input",k=>m(k.target.value)),g.addEventListener("change",k=>m(k.target.value)),S.addEventListener("input",k=>m(k.target.value)),S.addEventListener("change",k=>m(k.target.value)),S.addEventListener("blur",k=>m(k.target.value))}r.querySelectorAll(".aw-preset-btn").forEach(m=>{m.addEventListener("click",()=>{const k=parseInt(m.dataset.val,10);isNaN(k)||(g&&(g.value=k),S&&(S.value=k),h(!1))})}),["setting-quiet-mode","setting-panel-dashboard-only","setting-panel-leader-only","setting-follow-viewport","setting-return-original","setting-sound-notification-enabled","setting-energy-full-sound-enabled","setting-notifications","setting-energy-full-alert","setting-stealth-jitter","setting-sleep-schedule","setting-sleep-start","setting-sleep-end","setting-auto-relogin","setting-eco-mode"].forEach(m=>{document.getElementById(m)?.addEventListener("change",()=>h(!1))});const T=document.getElementById("setting-login-pwd"),b=document.getElementById("aw-toggle-pwd-vis");b?.addEventListener("click",()=>{T&&(T.type==="password"?(T.type="text",b.textContent="Sembunyikan"):(T.type="password",b.textContent="Lihat"))});const $=document.getElementById("aw-save-login-creds"),A=document.getElementById("aw-clear-login-creds"),E=document.getElementById("aw-login-creds-msg"),D=document.getElementById("setting-login-email");$?.addEventListener("click",()=>{const m=D?.value.trim()||"",k=T?.value||"";if(!m||!k){E&&(E.textContent="Harap isi email dan kata sandi!",E.style.color="#ff6b6b",E.style.display="block");return}Ye(m,k),e.autoReloginEnabled=!0;const P=document.getElementById("setting-auto-relogin");P&&(P.checked=!0),he(e),E&&(E.textContent=`Kredensial untuk ${m} tersimpan! Auto Re-Login AKTIF.`,E.style.color="#00ff88",E.style.display="block"),t.log?.("Kredensial Auto Re-Login berhasil disimpan.","success")}),A?.addEventListener("click",()=>{Ht(),D&&(D.value=""),T&&(T.value=""),e.autoReloginEnabled=!1;const m=document.getElementById("setting-auto-relogin");m&&(m.checked=!1),he(e),E&&(E.textContent="Kredensial telah dihapus dari browser.",E.style.color="#ffaa00",E.style.display="block"),t.log?.("Kredensial Auto Re-Login dihapus.","info")});const I={};i.forEach(m=>{const k=document.getElementById(`record-${m.id}`),P=document.getElementById(`shortcut-${m.id}`);k&&P&&k.addEventListener("click",()=>{I[m.id]={keys:[],recording:!0},k.textContent="Tekan tombol...",k.style.background="#0284c7",P.value="Menunggu input...",P.style.color="#38bdf8"})});const _=m=>{if(m.type!=="keydown")return;let k=!1;if(i.forEach(P=>{if(!I[P.id]?.recording)return;m.preventDefault(),m.stopPropagation();const B=I[P.id],W=document.getElementById(`record-${P.id}`),z=document.getElementById(`shortcut-${P.id}`),X=m.code;if(X==="Escape"){B.recording=!1,z&&(z.value=e.shortcuts[P.id]?.display??""),W&&(W.textContent="Rekam",W.style.background="#252c40"),k=!0;return}if(X==="Enter"){B.keys.length>0&&(B.recording=!1,W&&(W.textContent="Selesai",W.style.background="#00ff88",W.style.color="#000",setTimeout(()=>{W.textContent="Rekam",W.style.background="#252c40",W.style.color="#fff"},1500))),k=!0;return}if(m.repeat){k=!0;return}B.keys.includes(X)||B.keys.push(X);const f=B.keys.map(R=>R==="ControlLeft"||R==="ControlRight"?"Ctrl":R==="ShiftLeft"||R==="ShiftRight"?"Shift":R==="AltLeft"||R==="AltRight"?"Alt":R.startsWith("Key")?R.replace("Key",""):R.startsWith("Digit")?R.replace("Digit",""):R==="Space"?"Space":R).join("+");z&&(z.value=f,z.style.color="#00ff88"),B.keys.length>=3&&(B.recording=!1,W&&(W.textContent="Selesai",W.style.background="#00ff88",W.style.color="#000",setTimeout(()=>{W.textContent="Rekam",W.style.background="#252c40",W.style.color="#fff"},1500))),k=!0}),k)return!1};function j(m){m.key==="Escape"&&r.style.display==="flex"&&v(!0)}function v(m=!0){m&&h(!1),r.style.display="none",t.state&&(t.state.settingsOpen=!1),document.removeEventListener("keydown",_,!0),document.removeEventListener("keydown",j)}r.closeModalSafely=v,r.recordHandler=_,r.handleEscapeKey=j,document.getElementById("aw-close-settings")?.addEventListener("click",()=>v(!0)),document.getElementById("aw-cancel-settings")?.addEventListener("click",()=>{at(e,t),v(!1)}),r.addEventListener("click",m=>{m.target===r&&v(!0)}),document.addEventListener("keydown",j),document.getElementById("aw-test-notification-sound")?.addEventListener("click",()=>{const m=parseInt(document.getElementById("setting-sound-notification-volume")?.value??"70",10),k=isNaN(m)?.7:Math.max(0,Math.min(100,m))/100;t.sendNotification?.("Parlamentum Auto Worker","Tes notifikasi suara berhasil."),t.playNotificationSound?.({soundNotificationEnabled:!0,soundNotificationVolume:k},"success")}),document.getElementById("aw-reset-position")?.addEventListener("click",()=>{if(!t.state)return;t.state.panelX=e.panelDefaultX,t.state.panelY=e.panelDefaultY;const m=document.getElementById("aw-panel");m&&(m.style.left=t.state.panelX+"px",m.style.top=t.state.panelY+"px"),M("panelX",t.state.panelX.toString()),M("panelY",t.state.panelY.toString()),t.log?.("Posisi panel berhasil di-reset ke default","success");const k=document.getElementById("aw-settings-status");k&&(k.textContent="Posisi panel di-reset ke default",k.style.color="#0088ff",k.style.display="block",setTimeout(()=>{k&&(k.style.display="none")},2500))}),document.getElementById("aw-restore-defaults")?.addEventListener("click",()=>{confirm(`Yakin ingin mengembalikan SEMUA pengaturan ke default?

Ini akan:
- Reset keyboard shortcuts
- Reset batas energi ke 10 EN
- Reset semua preferensi
- Reset posisi panel

Konfigurasi yang tersimpan akan dihapus.`)&&(M("aw_config",null),M("panelX",(e.panelDefaultX??20).toString()),M("panelY",(e.panelDefaultY??20).toString()),t.log?.("Semua pengaturan berhasil di-reset ke default! Refresh halaman untuk menerapkan.","success"),setTimeout(()=>{confirm("Pengaturan sudah di-reset. Refresh halaman sekarang?")&&location.reload()},500))}),document.getElementById("aw-save-settings")?.addEventListener("click",()=>{h(!0),e.sendNotification&&"Notification"in window&&Notification.permission==="default"&&Notification.requestPermission().catch(()=>{});const m=document.getElementById("aw-hide");m&&(m.title=`Hide (${e.shortcuts.showHide?.display??""})`),t.log?.(`Pengaturan disimpan! Batas energi sebelum kerja: ${e.energyThreshold} EN`,"success"),t.playNotificationSound?.("success"),setTimeout(()=>v(!1),700)})}function at(e,t){const a=document.getElementById("aw-settings-modal");if(!a)return;const o=document.getElementById("setting-energy-threshold"),r=document.getElementById("setting-energy-threshold-num");o&&(o.value=e.energyThreshold),r&&(r.value=e.energyThreshold);const i=document.getElementById("setting-quiet-mode");i&&(i.checked=!!e.quietModeEnabled);const s=document.getElementById("setting-panel-dashboard-only");s&&(s.checked=!!e.panelDashboardOnly);const n=document.getElementById("setting-panel-leader-only");n&&(n.checked=!!e.panelLeaderOnly);const u=document.getElementById("setting-follow-viewport");u&&(u.checked=!!e.panelFollowViewport);const d=document.getElementById("setting-return-original");d&&(d.checked=!!e.panelReturnToOriginal);const y=document.getElementById("setting-sound-notification-enabled");y&&(y.checked=!!e.soundNotificationEnabled);const h=document.getElementById("setting-sound-notification-volume"),p=document.getElementById("setting-sound-notification-volume-num");h&&(h.value=Math.round(e.soundNotificationVolume*100)),p&&(p.value=Math.round(e.soundNotificationVolume*100));const g=document.getElementById("setting-energy-full-sound-enabled");g&&(g.checked=!!e.energyFullAlertSoundEnabled);const S=document.getElementById("setting-energy-full-volume"),T=document.getElementById("setting-energy-full-volume-num");S&&(S.value=Math.round(e.energyFullAlertVolume*100)),T&&(T.value=Math.round(e.energyFullAlertVolume*100));const b=document.getElementById("setting-notifications");b&&(b.checked=!!e.sendNotification);const $=document.getElementById("setting-energy-full-alert");$&&($.checked=!!e.energyFullAlertEnabled);const A=document.getElementById("setting-stealth-jitter");A&&(A.checked=!!e.stealthJitterEnabled);const E=document.getElementById("setting-energy-flush");E&&(E.checked=!!e.energyFlushEnabled);const D=document.getElementById("setting-max-food-daily");D&&(D.value=String(e.maxFoodDaily??10));const I=document.getElementById("setting-food-reset-reminder");I&&(I.checked=e.foodResetReminderEnabled!==!1);const _=document.getElementById("setting-auto-reload-tab");_&&(_.checked=!!e.autoReloadTabEnabled);const j=document.getElementById("setting-circuit-breaker");j&&(j.checked=!!e.circuitBreakerEnabled);const v=document.getElementById("setting-sleep-schedule");v&&(v.checked=!!e.sleepScheduleEnabled);const m=document.getElementById("setting-sleep-start");m&&(m.value=String(e.sleepStartHour??1));const k=document.getElementById("setting-sleep-end");k&&(k.value=String(e.sleepEndHour??6)),["showHide","workNow","pauseResume","openLog","openSettings"].forEach(W=>{const z=document.getElementById(`shortcut-${W}`);z&&e.shortcuts[W]&&(z.value=e.shortcuts[W].display||"",z.style.color="#00d4ff")});const P=document.getElementById("aw-settings-status");P&&(P.style.display="none"),a.style.display="flex",t?.state&&(t.state.settingsOpen=!0);const B=a.querySelector(".aw-tab-btn.active");B&&setTimeout(()=>B.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"}),60),a.recordHandler&&(document.removeEventListener("keydown",a.recordHandler,!0),document.addEventListener("keydown",a.recordHandler,!0)),a.handleEscapeKey&&(document.removeEventListener("keydown",a.handleEscapeKey),document.addEventListener("keydown",a.handleEscapeKey))}function nn(){if(document.getElementById("aw-log-styles"))return;const e=document.createElement("style");e.id="aw-log-styles",e.textContent=`
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

        /* Log Row */
        .aw-log-row {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 8px 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            border-radius: 6px;
            transition: background 0.15s;
            position: relative;
        }
        .aw-log-row:hover {
            background: rgba(255, 255, 255, 0.04);
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
    `,document.head.appendChild(e)}function an(e,t){nn();const a=document.getElementById("aw-log-modal");a&&a.remove();const o=document.createElement("div");o.id="aw-log-modal",o.style.cssText=`
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(4, 7, 14, 0.78);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 100003;
        justify-content: center;
        align-items: center;
    `,o.innerHTML=`
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
                    ">${L.fileText}</div>
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
                    "><span style="display:flex;align-items:center;">${L.copy}</span> Salin Log</button>
                    <button id="aw-clear-log" style="
                        background: rgba(255, 255, 255, 0.05); color: #ff6b6b; border: 1px solid rgba(255, 107, 107, 0.25);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 11.5px; font-weight: 600; transition: all 0.15s;
                        display: inline-flex; align-items: center; gap: 5px;
                    "><span style="display:flex;align-items:center;">${L.trash}</span> Bersihkan</button>
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
                    <span style="position: absolute; left: 10px; color: #64748b; pointer-events: none; display: flex; align-items: center;">${L.search}</span>
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
    `,document.body.appendChild(o);function r(){o.style.display="none"}document.getElementById("aw-close-log")?.addEventListener("click",r),document.getElementById("aw-close-log-footer")?.addEventListener("click",r),o.addEventListener("click",d=>{d.target===o&&r()});let i="all",s="";const n=o.querySelectorAll(".aw-log-filter-pill"),u=document.getElementById("aw-log-filter-type");n.forEach(d=>{d.addEventListener("click",()=>{n.forEach(y=>y.classList.remove("active")),d.classList.add("active"),i=d.dataset.type||"all",u&&(u.value=i),me(e,i,s)})}),u?.addEventListener("change",d=>{i=d.target.value,n.forEach(y=>y.classList.toggle("active",y.dataset.type===i)),me(e,i,s)}),document.getElementById("aw-log-filter-text")?.addEventListener("input",d=>{s=d.target.value.toLowerCase(),me(e,i,s)}),document.getElementById("aw-clear-log")?.addEventListener("click",()=>{confirm("Yakin ingin membersihkan semua riwayat Activity Log?")&&(e.logs=[],Dt(),me(e,i,s))}),document.getElementById("aw-copy-all-log")?.addEventListener("click",()=>{if(!e.logs||e.logs.length===0)return;const d=e.logs.map(y=>`[${y.time}] [${y.type.toUpperCase()}] ${y.message}`).join(`
`);navigator.clipboard.writeText(d).then(()=>{const y=document.getElementById("aw-copy-all-log");if(y){const h=y.innerHTML;y.innerHTML=`<span style="display:inline-flex;align-items:center;gap:4px;color:#00ff88;">${L.check} Tersalin</span>`,setTimeout(()=>{y.innerHTML=h},1500)}}).catch(()=>{})}),document.getElementById("aw-export-log-btn")?.addEventListener("click",()=>{if(!e.logs||e.logs.length===0){alert("Tidak ada riwayat log untuk diekspor.");return}const d=["=== PARLAMENTUM AUTO WORKER ACTIVITY LOG ===",`Diekspor pada: ${new Date().toLocaleString("id-ID")}`,`Total log: ${e.logs.length}`,`============================================
`,...e.logs.map(S=>`[${S.time}] [${S.type.toUpperCase()}] ${S.message}`)].join(`
`),y=new Blob([d],{type:"text/plain;charset=utf-8"}),h=URL.createObjectURL(y),p=document.createElement("a");p.href=h;const g=new Date().toISOString().slice(0,10);p.download=`parlementum-log-${g}.txt`,document.body.appendChild(p),p.click(),document.body.removeChild(p),URL.revokeObjectURL(h)})}function on(e,t){const a=document.getElementById("aw-log-modal");a&&(a.style.display="flex",Ae(e))}function Ae(e,t){if(document.getElementById("aw-log-modal")?.style.display!=="flex")return;const a=document.getElementById("aw-log-filter-type")?.value||"all",o=(document.getElementById("aw-log-filter-text")?.value||"").toLowerCase();me(e,a,o)}function me(e,t,a){const o=document.getElementById("aw-log-entries");if(!o)return;const r=e.logs||[],i=r.length;let s=0,n=0,u=0,d=0;r.forEach(A=>{A.type==="success"?s++:A.type==="warn"?n++:A.type==="error"?u++:A.type==="info"&&d++});const y=document.getElementById("aw-count-all"),h=document.getElementById("aw-count-success"),p=document.getElementById("aw-count-warn"),g=document.getElementById("aw-count-error"),S=document.getElementById("aw-count-info");y&&(y.textContent=i),h&&(h.textContent=s),p&&(p.textContent=n),g&&(g.textContent=u),S&&(S.textContent=d);const T=r.filter(A=>(t==="all"||A.type===t)&&(!a||A.message.toLowerCase().includes(a))),b=document.getElementById("aw-log-summary");if(b&&(b.textContent=`Menampilkan ${T.length} dari ${i} riwayat log`),T.length===0){o.innerHTML=`
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #64748b; padding: 40px 20px; text-align: center;">
                <span style="color: #475569; margin-bottom: 12px; display: flex; transform: scale(1.6);">${L.fileText}</span>
                <span style="font-size: 13.5px; font-weight: 600; color: #94a3b8; margin-bottom: 4px;">Tidak ada riwayat aktivitas</span>
                <span style="font-size: 11.5px; color: #64748b;">${i===0?"Belum ada aktivitas yang dicatat.":"Tidak ada log yang cocok dengan filter atau kata kunci."}</span>
            </div>
        `;return}const $={success:{text:"SUKSES",cls:"aw-log-badge-success",dot:"#00ff88"},warn:{text:"WARN",cls:"aw-log-badge-warn",dot:"#ffd166"},error:{text:"ERROR",cls:"aw-log-badge-error",dot:"#ff6b6b"},info:{text:"INFO",cls:"aw-log-badge-info",dot:"#38bdf8"}};o.replaceChildren(...T.map(A=>{const E=document.createElement("div");E.className="aw-log-row";const D=document.createElement("span");D.className="aw-log-time",D.textContent=A.time||"--:--:--";const I=document.createElement("span"),_=$[A.type]||$.info;I.className=`aw-log-badge ${_.cls}`,I.innerHTML=`<span style="width:5px;height:5px;border-radius:50%;background:${_.dot};display:inline-block;margin-right:4px;"></span>${_.text}`;const j=document.createElement("span");j.className="aw-log-msg",j.textContent=A.message;const v=document.createElement("button");return v.className="aw-log-copy-btn",v.textContent="Salin",v.title="Salin baris log ini",v.addEventListener("click",m=>{m.stopPropagation(),navigator.clipboard.writeText(`[${A.time}] ${A.message}`).then(()=>{v.textContent="Tersalin",v.style.color="#00ff88",setTimeout(()=>{v.textContent="Salin",v.style.color="#94a3b8"},1200)}).catch(()=>{})}),E.append(D,I,j,v),E}))}const rn="PARLAMENTUM_INTERCEPTOR",sn="PARLAMENTUM_EXTENSION";function ln(e,t,a){if(!e._interceptorClientInitialized){e._interceptorClientInitialized=!0,window.addEventListener("message",o=>{if(!o||o.source!==window)return;const r=o.data;if(!(!r||r.source!==rn))switch(r.type){case"READY":case"PONG":e.interceptorActive=!0;break;case"AUTH_TOKEN":r.token&&typeof r.token=="string"&&r.token!==e.currentToken&&a?.handleNewToken&&a.handleNewToken(r.token,"network_interceptor");break;case"ENERGY_SYNC":dn(e,r,a);break;case"WORK_SUCCESS":cn(e,r,a);break;case"WORK_REJECTED":un(e,r,a);break;case"FOOD_STATUS":if(typeof r.foodEatenToday=="number"){const i=t.maxFoodDaily||10;e.foodEatenToday=Math.max(0,Math.min(i,Math.round(r.foodEatenToday))),M("aw_foodEatenToday",e.foodEatenToday.toString());try{const s=new BroadcastChannel("aw_parlamentum_tabs");s.postMessage({type:"FOOD_UPDATED",foodEatenToday:e.foodEatenToday,timestamp:Date.now()}),s.close()}catch{}a?.updatePanel?.()}break;case"FOOD_CONSUMED":{const i=t.maxFoodDaily||10;e.foodEatenToday=Math.min(i,(e.foodEatenToday||0)+1),M("aw_foodEatenToday",e.foodEatenToday.toString());try{const s=new BroadcastChannel("aw_parlamentum_tabs");s.postMessage({type:"FOOD_UPDATED",foodEatenToday:e.foodEatenToday,timestamp:Date.now()}),s.close()}catch{}a?.log?.(`Makan roti terdeteksi (+1): ${e.foodEatenToday}/${i} slot terpakai.`,"info"),a?.updatePanel?.();break}case"PREMIUM_STATUS":r.isPremium&&t.maxFoodDaily!==20&&(t.maxFoodDaily=20,M("aw_maxFoodDaily","20"),a?.saveConfig?.(t),a?.log?.("Akun Premium terdeteksi: Kuota makanan harian disesuaikan jadi 20 slot.","info"),a?.updatePanel?.());break}});try{window.postMessage({source:sn,action:"PING"},"*")}catch{}setTimeout(()=>{if(!e.interceptorActive&&chrome.runtime?.getURL)try{const o=document.createElement("script");o.src=chrome.runtime.getURL("interceptor.js"),o.async=!1,(document.head||document.documentElement).appendChild(o),o.onload=()=>o.remove()}catch{}},350)}}function dn(e,t,a){const o=t.currentEnergy,r=t.maxEnergy;let i=!1;if(typeof o=="number"&&Number.isFinite(o)){const s=Math.max(0,Math.round(o));e.currentEnergy=s,i=!0}typeof r=="number"&&Number.isFinite(r)&&r>0&&(e.maxEnergy=Math.round(r),i=!0),i&&(e.energySyncBase={current:e.currentEnergy,max:e.maxEnergy||110,updatedAt:Date.now()},a?.updatePanel?.())}function cn(e,t,a){const o=Number(t.energyUsed)||Number(t.raw?.energyUsed)||0,r=o>=10?o:10,i=Math.max(4,Math.floor(r/10)*4),s=Number(t.xpEarned)>0?Number(t.xpEarned):i,n=Number(t.workerUnits)||Number(t.produced)||Number(t.raw?.workerUnits)||Number(t.raw?.produced)||0;if(e.workInFlight&&!e.workTriggeredViaDom)return;const u=!!e.workTriggeredViaDom;e.workTriggeredViaDom=!1,e.workInFlight=!1,t.remainingEnergy!=null&&typeof t.remainingEnergy=="number"?e.currentEnergy=Math.max(0,Math.round(t.remainingEnergy)):e.currentEnergy=Math.max(0,(e.currentEnergy||0)-r),e.energySyncBase={current:e.currentEnergy,max:e.maxEnergy||110,updatedAt:Date.now()};const d=new Date().toLocaleTimeString("id-ID");e.workToday=(e.workToday||0)+1,e.totalWorked=(e.totalWorked||0)+1,e.xpToday=(e.xpToday||0)+s,e.totalWorkXP=(e.totalWorkXP||0)+s,e.lastWorkTime=d,e.lastWorkTimestamp=Date.now(),a?.getNextWorkDelay&&(e.nextWorkTimestamp=Date.now()+a.getNextWorkDelay(e)),a?.setValue?.("workToday",e.workToday),a?.setValue?.("totalWorked",e.totalWorked),a?.setValue?.("xpToday",e.xpToday),a?.setValue?.("totalWorkXP",e.totalWorkXP);const y=n>0?` | +${n} unit`:"",h=u?`Kerja sukses! +${s} XP${y}`:`Shift di game terdeteksi: +${s} XP${y}`;a?.log?.(h,"success"),a?.updatePanel?.(),setTimeout(()=>{const p=a?.getCurrentEnergy?.();p&&p.current!==e.currentEnergy&&(e.currentEnergy=p.current,e.maxEnergy=p.max,e.energySyncBase={current:p.current,max:p.max,updatedAt:Date.now()},a?.updatePanel?.())},600)}function un(e,t,a){const o=String(t.message||t.raw?.message||"");/not enough energy|energi tidak cukup|kurang/i.test(o)&&(e.currentEnergy=0,e.energySyncBase={current:0,max:e.maxEnergy||110,updatedAt:Date.now()},ne(0,e.maxEnergy,!0),a?.updatePanel?.())}(async function(){await bt();const t=kt(),a=new Date().toDateString(),o=N("sessionStartDay","");let r=U("sessionStartTime",Date.now(),1);o!==a&&(r=Date.now(),M("sessionStartTime",r.toString()),M("sessionStartDay",a));const i=N("aw_workResultUncertain","false")==="true";let s=null;try{const l=N("aw_uncertainEnergyBefore","");s=l?JSON.parse(l):null}catch{}const n=xt(t,r,i);let u=ke(n,t);pn(n);const d=(l,c,w)=>Mt(n,t,l,c,w),y=(l,c)=>Lt(n,d,()=>b?.(),l,c,()=>Me(!0),()=>g()),h=()=>xe(n,y),p={state:n,CONFIG:t,get workHistory(){return u},set workHistory(l){u=l},log:d,handleNewToken:y,setRunningUI:l=>Me(l),sendNotification:(l,c,w)=>qe(l===t?c:l,l===t?w:c),playNotificationSound:(l,c)=>It(l,c),playEnergyFullAlarm:l=>zt(l||t),updatePanel:()=>g(),updatePanelVisibility:l=>se(n,l||t),wakePendingWork:()=>b?.(),setValue:M,get uncertainEnergyBefore(){return s},set uncertainEnergyBefore(l){s=l},reconcileUncertainWork:T,getSyncedEnergy:l=>re(l),getPlayerLevel:l=>_t(l),getMaxEnergyForLevel:l=>jt(l),getLiveCountdown:l=>Le(l,t),getTimeToFullEnergy:l=>$e(l),getNextWorkDelay:l=>pe(l,t),getRegionDetails:(l=!1)=>Ee(l),doWork:(l=!1)=>ge(p,l),openSettings:()=>at(t,p),openLogViewer:()=>on(n),saveConfig:l=>he(l),reloadStateFromStorage:()=>De(n,()=>{u=ke(n,t)}),patchPageVisualEnergy:(l,c,w)=>ne(l,c,w)};ln(n,t,p),St(()=>Ae(n));function g(){We(n,t,u,p)}function S(){if(!chrome.runtime?.id)return;const l=new Date().toISOString().slice(0,10),c=new Date().toDateString(),w=N("aw_foodUtcDate","");if(w&&w!==l){n.foodEatenToday=0,M("aw_foodEatenToday","0"),M("aw_foodUtcDate",l);try{j?.postMessage({type:"FOOD_UPDATED",foodEatenToday:0,timestamp:Date.now()})}catch{}d("Reset server 00:00 UTC tercapai. Kuota makanan harian di-reset ke 0.","info")}else w||M("aw_foodUtcDate",l);n.lastWorkDate===c&&w===l||(n.lastWorkDate!==c&&(n.workToday=0,n.xpToday=0,n.lastWorkDate=c,n.sessionStartTime=Date.now(),M("sessionStartTime",n.sessionStartTime.toString()),M("sessionStartDay",c),u[c]||(u[c]={shifts:0,xp:0}),M("workToday","0"),M("xpToday","0"),M("lastWorkDate",c),Ie(u),d("Hari berganti. Counter shift harian & sesi di-reset.","info")),g())}function T(){if(!chrome.runtime?.id||!n.workResultUncertain||!s)return;const l=O();l&&(l.current<s.current?n.uncertainReconciliation!=="energy_changed"&&(n.uncertainReconciliation="energy_changed",d(`Perubahan energi terdeteksi (${s.current} → ${l.current}). Shift mungkin diproses.`,"warn")):n.uncertainReconciliation==="energy_changed"&&(n.uncertainReconciliation="pending"),g())}p.reconcileUncertainWork=T;let b=null,$=null,A=null;try{const l=new Blob([`
            let t = null;
            self.onmessage = e => {
                if (t !== null) clearTimeout(t);
                t = setTimeout(() => self.postMessage('wake'), Math.max(10, e.data));
            };
        `],{type:"application/javascript"});A=new Worker(URL.createObjectURL(l))}catch{A=null}function E(l){return new Promise(c=>{let w=!1;const x=()=>{w||(w=!0,$!==null&&clearTimeout($),$=null,b=null,A&&(A.onmessage=null),c())};b=x;const C=Math.min(l,3e4);A&&(A.onmessage=x,A.postMessage(Math.max(10,C))),$=setTimeout(x,C)})}p.wakePendingWork=()=>b?.();const D=(l=window.location.pathname)=>/^\/(login|register|signup|forgot-password|reset-password)/i.test(l);if(D()){console.log(`[Auto Worker] Halaman autentikasi terdeteksi (${window.location.pathname}). Isolasi aktif: DOM tidak dimodifikasi agar form login tetap utuh.`),Ut(d),Nt(t,d,qe),ot(()=>{D()||(console.log(`[Auto Worker] Navigasi ke halaman game terdeteksi (${window.location.pathname}). Memuat lingkungan game...`),window.location.reload())});return}n.tabLockManaged=!!navigator?.locks?.request,n.isTabLockOwner=!n.tabLockManaged,fn(d,t,n),h(),Jt(n,t,p);const I=N("aw_recent_logs");Array.isArray(I)&&(n.logs=[...I]),an(n),tn(t,p),Wt(n,y,h),ot(()=>{D()&&(console.log(`[Auto Worker] Logout / Navigasi ke auth page terdeteksi (${window.location.pathname}). Mengalihkan ke mode isolasi...`),window.location.reload()),n.userManuallyToggledPanel=!1;const l=window.location.pathname||"",c=l==="/dashboard"||l.startsWith("/dashboard/")||l==="/"||l==="";t.panelDashboardOnly&&c&&(n.panelVisible=!0,M("panelVisible","true")),Ee(!0),se(n,t)}),document.addEventListener("click",l=>{const c=l.target?.closest?.("button");if(!c)return;const w=(c.textContent||"").trim();/KERJAKAN\s+SATU\s+GILIRAN/i.test(w)&&n.currentEnergy!=null&&n.currentEnergy<10&&(l.preventDefault(),l.stopPropagation(),d(`Energi saat ini ${n.currentEnergy}/${n.maxEnergy} EN (butuh minimal 10 EN). Menunggu energi pulih.`,"warn"),Fe(`Energi belum cukup (${n.currentEnergy}/${n.maxEnergy} EN). Butuh minimal 10 EN untuk giliran kerja.`,"warn"))},!0);const _=N("aw_live_status");if(_&&_.currentEnergy!=null){const l=_.maxEnergy||n.maxEnergy||110;n.maxEnergy=l,n.currentEnergy=Math.min(l,_.currentEnergy),n.energySyncBase={current:n.currentEnergy,max:l,updatedAt:_.updatedAt||Date.now()}}Pt(15e3).then(l=>{if(l){const c=Y(),w=N("aw_live_status");!c&&w&&w.currentEnergy!=null&&(w.currentEnergy>l.current||w.updatedAt&&Date.now()-w.updatedAt<3e5)?(n.currentEnergy=w.currentEnergy,n.maxEnergy=w.maxEnergy||l.max,n.energySyncBase={current:w.currentEnergy,max:n.maxEnergy,updatedAt:w.updatedAt||Date.now()}):(n.currentEnergy=l.current,n.maxEnergy=l.max,n.domEnergyStale=!1,n.lastWorkTimestamp=0,n.energySyncBase={current:l.current,max:l.max,updatedAt:Date.now()});const C=Ee(!0),q=C.bonusMultiplier||1;if(n.regenRate=q,n.regionHealthBonusPercent=C.bonusPercent||0,n.regionHealthBonusPercent>0||q>1){const de=n.regionHealthBonusPercent||Math.round((q-1)*100);d(`Buff Kota: Kesehatan +${de}% pemulihan energi pasif (${q}x / mnt)`,"info")}d(`Energi terbaca: ${n.currentEnergy}/${n.maxEnergy}`,"info"),c&&K(n,t),g()}else d("Elemen energi tidak ditemukan dalam 15 detik. Energi akan terbaca saat panel update.","warn")}),setInterval(()=>{n.running&&gn(n,t,d,p)},Math.min(t.tokenRefreshInterval,6e4)),setInterval(S,6e4),setInterval(g,1e3),setInterval(T,1e4),R();let j=null;try{j=new BroadcastChannel("aw_parlamentum_tabs")}catch{j=null}const v=Y();j&&(v&&j.postMessage({type:"CLAIM_LEADERSHIP_FOR_DASHBOARD",timestamp:Date.now()}),j.onmessage=l=>{const c=l?.data;!c||typeof c!="object"||(c.type==="DASHBOARD_HEARTBEAT"&&(n.hasActiveDashboardTab=!0,n.lastDashboardHeartbeat=Date.now(),Y()||(c.currentEnergy!=null&&(n.currentEnergy=c.currentEnergy,n.maxEnergy=c.maxEnergy||n.maxEnergy,n.energySyncBase={current:c.currentEnergy,max:n.maxEnergy,updatedAt:c.timestamp||Date.now()}),c.regenRate!=null&&(n.regenRate=c.regenRate),c.workToday!=null&&(n.workToday=c.workToday),c.xpToday!=null&&(n.xpToday=c.xpToday),c.totalWorked!=null&&(n.totalWorked=c.totalWorked),c.totalWorkXP!=null&&(n.totalWorkXP=c.totalWorkXP),c.lastWorkTime&&(n.lastWorkTime=c.lastWorkTime),c.nextWorkTimestamp!=null&&(n.nextWorkTimestamp=c.nextWorkTimestamp),c.foodEatenToday!=null&&c.foodEatenToday!==n.foodEatenToday&&(n.foodEatenToday=c.foodEatenToday,M("aw_foodEatenToday",n.foodEatenToday.toString())),c.maxFoodDaily!=null&&c.maxFoodDaily!==t.maxFoodDaily&&(t.maxFoodDaily=c.maxFoodDaily),g(),ne(n.currentEnergy,n.maxEnergy))),c.type==="FOOD_UPDATED"&&typeof c.foodEatenToday=="number"&&n.foodEatenToday!==c.foodEatenToday&&(n.foodEatenToday=c.foodEatenToday,M("aw_foodEatenToday",n.foodEatenToday.toString()),K(n,t,!0),g()),c.type==="CLAIM_LEADERSHIP_FOR_DASHBOARD"&&(n.hasActiveDashboardTab=!0,n.lastDashboardHeartbeat=Date.now(),!Y()&&n.isTabLockOwner&&(console.log("[Auto Worker] Tab Dashboard terdeteksi. Mengalihkan worker lock ke tab Dashboard."),n.shouldYieldLock=!0,b?.())),c.type==="DASHBOARD_CLOSED"&&(n.hasActiveDashboardTab=!1,n.lastDashboardHeartbeat=0))},v?setInterval(()=>{j&&Y()&&n.currentEnergy!=null&&j.postMessage({type:"DASHBOARD_HEARTBEAT",currentEnergy:n.currentEnergy,maxEnergy:n.maxEnergy,regenRate:n.regenRate,workToday:n.workToday,xpToday:n.xpToday,totalWorked:n.totalWorked,totalWorkXP:n.totalWorkXP,lastWorkTime:n.lastWorkTime,nextWorkTimestamp:n.nextWorkTimestamp,foodEatenToday:n.foodEatenToday,maxFoodDaily:t.maxFoodDaily||10,timestamp:Date.now()})},2e3):setInterval(()=>{n.lastDashboardHeartbeat&&Date.now()-n.lastDashboardHeartbeat>7e3&&(n.hasActiveDashboardTab=!1)},4e3));try{chrome.runtime.onMessage.addListener((l,c,w)=>{if(l?.type==="POPUP_COMMAND"){if(l.action==="toggleRunning"){const x=l.value!=null?!!l.value:!n.running;return n.running=x,Me(x),g(),K(n,t,!0),d(`Auto Worker ${x?"dilanjutkan":"dijeda"} via Popup toolbar.`,"info"),x&&b?.(),w({ok:!0,running:n.running}),!0}if(l.action==="workNow")return d("Manual work dipicu via Popup toolbar.","info"),n.tokenExpired||n.pausedForToken||!n.currentToken?(w({ok:!1,error:"token_expired"}),!0):(ge(p,!0).then(x=>{K(n,t,!0),g(),x==="worked"?w({ok:!0,isLockOwner:n.isTabLockOwner,result:x}):x==="paused"&&(n.pausedForToken||n.tokenExpired)?w({ok:!1,error:"token_expired"}):x==="waiting"&&n.currentEnergy<10?w({ok:!1,error:"insufficient_energy"}):w({ok:!1,error:x||"work_failed"})}).catch(x=>{w({ok:!1,error:x.message})}),!0);if(l.action==="getStatus"){const x=re(n);return x&&(n.currentEnergy=x.current,n.maxEnergy=x.max),w({ok:!0,status:K(n,t,!0)}),!0}if(l.action==="getLogs")return w({ok:!0,logs:n.logs||[]}),!0;if(l.action==="clearLogs")return n.logs=[],clearStoredLogs(),Ae(n,t),w({ok:!0}),!0;if(l.action==="setFoodCount"){const x=t.maxFoodDaily||10,C=Math.max(0,Math.min(x,Number(l.value)||0));n.foodEatenToday=C,M("aw_foodEatenToday",C.toString()),K(n,t,!0);try{j?.postMessage({type:"FOOD_UPDATED",foodEatenToday:C,timestamp:Date.now()})}catch{}return g(),w({ok:!0,foodEatenToday:C}),!0}}if(l?.type==="STORAGE_SYNC"&&l.action==="backgroundWorkDone")return l.energy!=null&&(n.currentEnergy=l.energy,n.postShiftEnergy=l.energy,n.lastWorkTimestamp=Date.now(),n.domEnergyStale=!0,n.energySyncBase={current:l.energy,max:l.maxEnergy||n.maxEnergy||110,updatedAt:Date.now()}),l.status&&(l.status.workToday!=null&&(n.workToday=l.status.workToday),l.status.xpToday!=null&&(n.xpToday=l.status.xpToday),l.status.totalWorked!=null&&(n.totalWorked=l.status.totalWorked),l.status.totalWorkXP!=null&&(n.totalWorkXP=l.status.totalWorkXP),l.status.lastWorkTime&&(n.lastWorkTime=l.status.lastWorkTime),l.status.nextWorkTimestamp!=null&&(n.nextWorkTimestamp=l.status.nextWorkTimestamp)),n.workInFlight=!1,n.workResultUncertain=!1,n.energyFullAlertActive=!1,g(),w({ok:!0}),!0;if(l?.type==="EXECUTE_WORK_NOW")return(async()=>{try{if(!n.running&&!l.manual){w({ok:!1,result:"paused"});return}if(n.workInFlight)if(Date.now()-(n.workInFlightAt||0)>15e3)n.workInFlight=!1;else{w({ok:!1,result:"busy"});return}if(n.tokenExpired||n.pausedForToken||!n.currentToken){w({ok:!1,result:"token_expired"});return}if(n.tabLockManaged&&!n.isTabLockOwner){w({ok:!1,result:"standby"});return}const x=re(n);if(x&&(n.currentEnergy=x.current,n.maxEnergy=x.max),!l.manual&&n.currentEnergy<t.energyThreshold){w({ok:!0,result:"waiting",energy:n.currentEnergy});return}d("Trigger background: Menjalankan shift kerja otomatis...","info");const C=await ge(p,!!l.manual);K(n,t,!0),g(),w({ok:C==="worked",result:C,energy:n.currentEnergy,isLockOwner:!!n.isTabLockOwner})}catch(x){w({ok:!1,error:x?.message||String(x)})}})(),!0;if(l?.type==="WAKE_WORKER")return(async()=>{try{const x=N("aw_live_status");if(x&&(x.lastWorkTimestamp&&x.lastWorkTimestamp>(n.lastWorkTimestamp||0)&&(n.lastWorkTimestamp=x.lastWorkTimestamp,n.currentEnergy=x.currentEnergy,n.postShiftEnergy=x.currentEnergy,n.domEnergyStale=!0,n.energySyncBase={current:x.currentEnergy,max:x.maxEnergy||n.maxEnergy||115,updatedAt:x.updatedAt||x.lastWorkTimestamp}),x.nextWorkTimestamp&&(n.nextWorkTimestamp=x.nextWorkTimestamp),x.workToday!=null&&(n.workToday=x.workToday),x.xpToday!=null&&(n.xpToday=x.xpToday),x.totalWorked!=null&&(n.totalWorked=x.totalWorked),x.totalWorkXP!=null&&(n.totalWorkXP=x.totalWorkXP)),n.running){const C=re(n);C&&(n.currentEnergy=C.current,n.maxEnergy=C.max);const q=n.lastWorkTimestamp&&Date.now()-n.lastWorkTimestamp<3e4,de=n.currentEnergy>=t.energyThreshold;if(n.isTabLockOwner&&de&&!q&&!n.workInFlight&&!n.workResultUncertain){d("Background wake: Energi target tercapai, mengeksekusi shift kerja...","info");const ye=await ge({...p},!1);K(n,t),g(),w({handled:!0,isLockOwner:!0,energy:n.currentEnergy,worked:ye==="worked",result:ye});return}}g(),K(n,t),w({handled:!0,isLockOwner:!!n.isTabLockOwner,energy:n.currentEnergy,worked:!1})}catch(x){w({handled:!1,error:x?.message})}})(),!0})}catch{}ht((l,c)=>{if(l==="aw_live_status"&&c){const w=!!(c.lastWorkTime&&c.lastWorkTime!==n.lastWorkTime&&(c.totalWorked||0)>(n.totalWorked||0));(!n.isTabLockOwner||!Y()||w)&&(c.workToday!=null&&(n.workToday=c.workToday),c.xpToday!=null&&(n.xpToday=c.xpToday),c.totalWorked!=null&&(n.totalWorked=c.totalWorked),c.totalWorkXP!=null&&(n.totalWorkXP=c.totalWorkXP),c.lastWorkTime&&(n.lastWorkTime=c.lastWorkTime),c.nextWorkTimestamp!=null&&(n.nextWorkTimestamp=c.nextWorkTimestamp),c.currentEnergy!=null&&(n.currentEnergy=c.currentEnergy,n.lastWorkTimestamp=c.updatedAt||Date.now(),n.energySyncBase={current:c.currentEnergy,max:c.maxEnergy||n.maxEnergy||110,updatedAt:c.updatedAt||Date.now()}),c.maxEnergy!=null&&(n.maxEnergy=c.maxEnergy)),g()}if(l==="aw_config"&&c)try{Object.assign(t,typeof c=="string"?JSON.parse(c):c),g()}catch{}l==="aw_recent_logs"&&(n.logs=Array.isArray(c)?[...c]:[],Ae(n))}),document.addEventListener("visibilitychange",B),window.addEventListener("focus",B),window.addEventListener("online",m),window.addEventListener("offline",k),window.addEventListener("beforeunload",P);function m(){chrome.runtime?.id&&(n.isOffline=!1,W=0,d("Koneksi internet pulih (online). Memeriksa jadwal kerja...","info"),g(),b?.())}function k(){chrome.runtime?.id&&(n.isOffline=!0,d("Koneksi internet terputus (offline). Menunggu jaringan kembali...","warn"),g())}function P(){if(j){if(Y())try{j.postMessage({type:"DASHBOARD_CLOSED",timestamp:Date.now()})}catch{}try{j.close()}catch{}}}function B(){chrome.runtime?.id&&document.visibilityState!=="hidden"&&(n.lastForegroundReturnTime=Date.now(),se(n,t),ne(n.currentEnergy,n.maxEnergy,!0),K(n,t),chrome.storage.local.get(["aw_live_status"],l=>{const c=l?.aw_live_status;c&&(c.lastWorkTime&&c.lastWorkTime!==n.lastWorkTime&&(c.totalWorked||0)>(n.totalWorked||0))&&(c.currentEnergy!=null&&(n.currentEnergy=c.currentEnergy,n.lastWorkTimestamp=c.updatedAt||Date.now(),n.domEnergyStale=!0,n.energySyncBase={current:c.currentEnergy,max:c.maxEnergy||n.maxEnergy||110,updatedAt:c.updatedAt||Date.now()}),c.workToday!=null&&(n.workToday=c.workToday),c.xpToday!=null&&(n.xpToday=c.xpToday),c.totalWorked!=null&&(n.totalWorked=c.totalWorked),c.totalWorkXP!=null&&(n.totalWorkXP=c.totalWorkXP),c.lastWorkTime&&(n.lastWorkTime=c.lastWorkTime),c.nextWorkTimestamp!=null&&(n.nextWorkTimestamp=c.nextWorkTimestamp)),De(n,()=>{u=ke(n,t)});const w=re(n);w&&(n.currentEnergy=w.current,n.maxEnergy=w.max,n.domEnergyStale&&ne(w.current,w.max,!0)),g(),se(n,t),n.running&&n.isTabLockOwner&&n.currentEnergy>=ue(n,t)&&b?.()}))}let W=0;function z(){if(!t.circuitBreakerEnabled)return{active:!1,reason:""};try{const l=(document.title||"").toLowerCase();if(l.includes("just a moment")||l.includes("attention required")||l.includes("security check"))return{active:!0,reason:"Cloudflare Challenge terdeteksi"};if(document.querySelector("#challenge-running, #cf-wrapper, .cf-turnstile, #cf-stage, .cf-browser-verification"))return{active:!0,reason:"Cloudflare Verification terdeteksi"};const c=(document.body?.innerText||"").substring(0,500).toLowerCase();if(c.includes("502 bad gateway")||c.includes("503 service unavailable")||c.includes("504 gateway time-out")||c.includes("server sedang pemeliharaan")||c.includes("under maintenance"))return{active:!0,reason:"Server Maintenance / Error 50x terdeteksi"};if(document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .h-captcha, .g-recaptcha'))return{active:!0,reason:"Captcha interaktif terdeteksi"}}catch{}return{active:!1,reason:""}}function X(){if(!t.autoReloadTabEnabled||!n.running||n.workInFlight||n.circuitBreakerActive)return;if(Date.now()-n.scriptStartTime>=432e5){const c=n.currentEnergy??0,w=(n.nextWorkTimestamp||0)-Date.now();c<20&&w>12e5&&(d("[Auto Refresh] Membersihkan memori tab setelah berjalan 12+ jam. Memuat ulang tab game...","info"),K(n,t,!0),setTimeout(()=>{window.location.reload()},2e3))}}function f(){const l=t.maxFoodDaily||10;if(!(n.foodEatenToday>=l))try{const c=document.querySelectorAll('[role="alert"], [role="status"], .toast, [class*="toast" i], [class*="alert" i], [data-radix-popper-content-wrapper], [data-sonner-toast]');for(const w of c){if(w.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast"))continue;const x=w.textContent||"";if(/batas roti harian tercapai|daily bread limit/i.test(x)){n.foodEatenToday=l,M("aw_foodEatenToday",l.toString()),K(n,t,!0);try{j?.postMessage({type:"FOOD_UPDATED",foodEatenToday:l,timestamp:Date.now()})}catch{}d(`Notifikasi game: Batas konsumsi roti harian tercapai (${l}/${l}).`,"info"),g();return}}}catch{}}function R(){if(f(),typeof MutationObserver<"u"&&typeof document<"u"){const l=new MutationObserver(c=>{const w=t.maxFoodDaily||10;if(!(n.foodEatenToday>=w)){for(const x of c)for(const C of x.addedNodes)if(C.nodeType===1){if(C.closest?.("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast"))continue;const q=C.textContent||"";if(/batas roti harian tercapai|daily bread limit/i.test(q)){n.foodEatenToday=w,M("aw_foodEatenToday",w.toString()),K(n,t,!0);try{j?.postMessage({type:"FOOD_UPDATED",foodEatenToday:w,timestamp:Date.now()})}catch{}d(`Notifikasi game: Batas konsumsi roti harian tercapai (${w}/${w}).`,"info"),g();return}}}});try{l.observe(document.body||document.documentElement,{childList:!0,subtree:!0})}catch{}}document.addEventListener("click",l=>{l.target?.closest?.("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal")||setTimeout(f,400)},{passive:!0})}async function V(){for(;;)try{if(!chrome.runtime?.id){console.warn("[Auto Worker] Ekstensi telah di-reload. Loop dihentikan bersih. Silakan refresh tab game (F5).");return}if(n.shouldYieldLock){n.shouldYieldLock=!1,le(n,!1,p);return}const l=z();if(l.active){n.circuitBreakerActive||(n.circuitBreakerActive=!0,n.circuitBreakerReason=l.reason,d(`[Circuit Breaker] ${l.reason}. Worker dijeda otomatis demi keamanan akun.`,"warn"),g()),await E(3e4);continue}else n.circuitBreakerActive&&(n.circuitBreakerActive=!1,n.circuitBreakerReason="",d("[Circuit Breaker] Halaman game kembali normal. Melanjutkan jadwal kerja...","info"),g());if(X(),f(),typeof navigator<"u"&&(navigator.onLine===!1||n.isOffline)){await E(5e3);continue}if(S(),n.running){n.isEnergyFlushActive=ie(t);const c=ue(n,t);if(n.currentEnergy<c&&n.nextWorkTimestamp>Date.now()){const x=Math.max(1e3,n.nextWorkTimestamp-Date.now());await E(x);continue}const w=await ge(p);if(w==="retrySoon")await E(5e3);else if(w==="retry"){W++;const x=Math.min(3e5,1e4*Math.pow(2,W-1));d(`Retry dalam ${(x/1e3).toFixed(0)}s (percobaan ke-${W})...`,"warn"),await E(x)}else if(w==="waiting"||w==="worked"){W=0;const x=Math.max(1e3,n.nextWorkTimestamp-Date.now());await E(x)}else await E(1e4)}else await E(1e4)}catch(l){if(l?.message?.includes("Extension context invalidated")||!chrome.runtime?.id){console.warn("[Auto Worker] Ekstensi telah di-reload. Loop dihentikan bersih.");return}console.error("[MainLoop]",l),d(`Main loop error: ${l.message}`,"error"),W++;const c=Math.min(3e5,1e4*Math.pow(2,W-1));await E(c)}}if(!n.tabLockManaged){d("Web Locks tidak tersedia; perlindungan multi-tab tidak aktif.","warn"),await V();return}for(le(n,!1,p);;){if(!Y()&&n.hasActiveDashboardTab){n.waitedForTabLock=!0,le(n,!1,p),await new Promise(c=>setTimeout(c,3e3));continue}let l=!1;try{await navigator.locks.request("parlamentum-auto-worker",{ifAvailable:!0},async c=>{c&&(l=!0,De(n,()=>{u=ke(n,t)}),N("aw_workResultUncertain","false")==="true"&&(n.workResultUncertain=!0,n.running=!1,g()),le(n,!0,p),n.waitedForTabLock=!1,await V())})}catch(c){d(`Web Locks gagal: ${c.message}. Worker dijeda.`,"error"),n.running=!1,le(n,!1,p);return}l||(n.waitedForTabLock=!0,le(n,!1,p),await new Promise(c=>setTimeout(c,3e3)))}})();function pn(e,t,a){U("aw_energySchemaVersion",1,1,2)>=2||(e.totalWorkXP<e.totalWorked*3&&e.totalWorked>0&&(e.totalWorkXP=e.totalWorked*10/10*4,M("totalWorkXP",e.totalWorkXP.toString())),e.totalEnergySpent<e.totalWorked*5&&e.totalWorked>0&&(e.totalEnergySpent=e.totalWorked*10,M("totalEnergySpent",e.totalEnergySpent.toString()),console.log("[Init] Estimasi energi masa lalu diterapkan (migrasi sekali jalan).")),M("aw_energySchemaVersion","2"))}function gn(e,t,a,o=null){if(!chrome.runtime?.id||!e.currentToken||!e.tokenExpiry)return;const r=e.tokenExpiry-Date.now();if(r<=0){e.pausedForToken||(a("Token sesi kedaluwarsa. Me-reload tab otomatis untuk memperbarui token...","warn"),e.pausedForToken=!0,setTimeout(()=>{window.location.reload()},1500));return}r<t.tokenExpiryThreshold&&(a(`Token akan expired dalam ${Math.round(r/1e3)} detik!`,"warn"),a("Token tidak auto-refresh. Login ulang jika expired.","warn"))}function le(e,t,a){e.isTabLockOwner=t,a?.CONFIG&&se(e,a.CONFIG),a.updatePanel?.()}function fn(e,t,a){const o=Math.floor((Date.now()-a.scriptStartTime)/1e3);e("Auto Worker v5.11.0 (Network Interceptor) aktif.","success"),e(`Energy Threshold: ${t.energyThreshold} EN`,"info"),e(`History: simpan ${t.historyMaxDays} hari terakhir`,"info"),e(`Quiet mode: ${t.quietModeEnabled?"ON":"OFF"}`,"info"),e(`Shortcuts: ${Object.values(t.shortcuts).map(r=>r.display).join(", ")}`,"info"),e(`Script uptime: ${o}s`,"info")}function ot(e){let t=window.location.pathname;const a=()=>{window.location.pathname!==t&&(t=window.location.pathname,e?.())};try{const o=history.pushState;history.pushState=function(...i){o.apply(this,i),a()};const r=history.replaceState;history.replaceState=function(...i){r.apply(this,i),a()}}catch{}window.addEventListener("popstate",a),setInterval(a,1e3)}})();
