const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length,1);
new vm.Script(scripts[0][1]);
let checks=0;
function app(date='2026-09-20', saved=null){
  const elements=new Map(), memory=new Map();
  if(saved) memory.set('caprica_workout_v2',JSON.stringify(saved));
  function el(id){
    if(!elements.has(id)) elements.set(id,{innerHTML:'',textContent:'',value:'',style:{},dataset:{},
      classList:{add(){},remove(){},toggle(){},contains(){return false;}},
      addEventListener(){},getBoundingClientRect(){return {top:0,bottom:100};},focus(){},click(){},scrollIntoView(){}});
    return elements.get(id);
  }
  class Clock extends Date { constructor(...args){super(...(args.length?args:[date+'T08:00:00']));} static now(){return new Date(date+'T08:00:00').getTime();} }
  const ctx=vm.createContext({console,Date:Clock,
    localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)},
    document:{getElementById:el,querySelector:el,querySelectorAll:()=>[],addEventListener(){},createElement:()=>el('new')},
    window:{scrollY:0,innerHeight:900,scrollTo(){},addEventListener(){},matchMedia:()=>({matches:false})},
    navigator:{userAgent:'test',onLine:false},location:{reload(){}},
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
    confirm:()=>true,prompt:()=>null,Blob,URL,crypto:require('node:crypto').webcrypto,
    fetch:()=>Promise.reject(new Error('offline'))});
  vm.runInContext(scripts[0][1],ctx);
  return {run:s=>vm.runInContext(s,ctx),el,memory};
}
function eq(actual,expected){assert.deepEqual(actual === undefined ? undefined : JSON.parse(JSON.stringify(actual)),expected);checks++;}
function ok(value){assert.ok(value);checks++;}
const a=app();
eq(a.run("projection().firstDate"),'2026-09-21');
eq(a.run("Array.from({length:14},(_,i)=>getDayType(addDays('2026-09-21',i)))"),
 ['Upper A','Lower A','Upper B','Lower B','Upper A','Rest','Rest','Lower A','Upper B','Lower B','Upper A','Lower A','Rest','Rest']);
eq(a.run("getDayType('2026-09-20')"),'Rest');
eq(a.run("getPlan('2026-09-21').map(e=>[e.exercise,e.sets,e.range])"),[
 ['Barbell Bench Press',2,'6-10'],['Pull-ups (Wide/Neutral)',2,'5-10'],['Dumbbell Row',2,'8-12 / arm'],['DB Lateral Raise',2,'12-20'],['Dumbbell Curl',2,'10-15']]);
ok(a.run("GYM_ROTATION.every(t=>GYM_TEMPLATES[t].every(e=>!/cable|pulldown|leg extension/i.test(e.exercise)))"));
a.run("onRepChange({value:'10'},'2026-09-21',0,0);onRepChange({value:'10'},'2026-09-21',0,1)");
eq(a.run("PROGRESSION['Barbell Bench Press'].weight"),'150');
ok(a.run("allSetsAtTop('2026-09-21',0)"));
a.el('weight-step').value='5';
a.run("approveIncrease('2026-09-21',0)");
eq(a.run("PROGRESSION['Barbell Bench Press'].weight"),'155');
eq(a.run("getWeight('2026-09-21',0,'Barbell Bench Press')"),'150');
a.run("onRepChange({value:'9'},'2026-09-21',0,1)");
eq(a.run("PROGRESSION['Barbell Bench Press'].weight"),'150');
a.run("onRepChange({value:'10'},'2026-09-21',0,1);approveIncrease('2026-09-21',0);approveIncrease('2026-09-21',0)");
eq(a.run("PROGRESSION['Barbell Bench Press'].weight"),'155');
a.run("swapExercise('2026-09-21',0,'Dumbbell Bench Press')");
eq(a.run("PROGRESSION['Barbell Bench Press'].weight"),'150');
eq(a.run("getPlan('2026-09-21')[0].range"),undefined); // new lift uses its own range, never the old one
a.run("onRepChange({value:'12'},'2026-09-21',2,0);onRepChange({value:'12'},'2026-09-21',2,1)");
a.el('weight-step').value='2.5'; a.run("approveIncrease('2026-09-21',2)");
eq(a.run("PROGRESSION['Dumbbell Row'].weight"),'42.5');
a.run("onRepChange({value:'10'},'2026-09-21',1,0);onRepChange({value:'10'},'2026-09-21',1,1);approveIncrease('2026-09-21',1)");
eq(a.run("PROGRESSION['Pull-ups (Wide/Neutral)'].weight"),'BW');
ok(a.memory.get('caprica_workout_v2'));
eq(a.run("getPlan('2026-09-21').length"),5);
a.run("setFullVolume(true)");
eq(a.run("S().fullVolumeFrom"),undefined);
// Misses slide without consuming the sequence.
const skipped=app('2026-09-23');
eq(skipped.run("getDayType('2026-09-23')"),'Upper A');
skipped.run("setDayType('2026-09-21','Upper A');setDayType('2026-09-24','Rest')");
eq(skipped.run("getDayType('2026-09-23')"),'Lower A');
eq(skipped.run("getDayType('2026-09-25')"),'Upper B');
eq(skipped.run("getDayType('2026-09-26')"),'Rest');
skipped.run("S().customTypes.Conditioning=[];setDayType('2026-09-25','Conditioning')");
eq(skipped.run("getDayType('2026-09-28')"),'Upper B');
skipped.run("setDayType('2026-09-26','Lower B')");
eq(skipped.run("getDayType('2026-09-28')"),'Upper A'); // explicit weekend override respected
// Legacy history, custom plans and saved weights survive loading without migration.
const legacy={_schemaVersion:4,progression:{'Barbell Bench Press':{group:'Chest',range:'6-8',top:8,weight:'165'}},
 store:{gym:{dayTypes:{'2026-08-06':'Upper','2026-09-22':'Arms'},dayPlans:{},sessionLog:{'2026-08-06':{0:{weight:'150',reps:[8,8,7],done:true}}},dayNotes:{'2026-08-06':'Original'},exNotes:{},customTypes:{},futureKey:{kept:true}},travel:{dayTypes:{'2026-09-19':'Lower'}}}};
const b=app('2026-09-20',legacy);
eq(b.run("getPlan('2026-08-06').map(e=>e.exercise)"),['Barbell Bench Press','Lat Pulldown','Overhead Press','Barbell Curl','Tricep Pushdown (rope)','Hanging Leg Raises']);
eq(b.run("S().sessionLog['2026-08-06'][0].reps"),[8,8,7]);
eq(b.run("getDayType('2026-09-22')"),'Arms');
eq(b.run("PROGRESSION['Barbell Bench Press'].weight"),'165');
eq(b.run("getPlan('2026-09-21')[0].range"),'6-10');
b.run("saveState()");const saved=JSON.parse(b.memory.get('caprica_workout_v2'));
eq(saved.store.gym.futureKey,{kept:true});
const reload=app('2026-09-20',saved);eq(reload.run("getPlan('2026-08-06')[0].exercise"),'Barbell Bench Press');
b.run("switchMode('travel')");
eq(b.run("projection().firstType"),'Arms');
eq(b.run("getPlan('2026-09-20').length"),6);
eq(b.run("getPlan('2026-09-20')[0].exercise"),'Hammer Curl (band)');
eq(b.run("getDayType('2026-09-21')"),'Rest');
eq(b.run("getDayType('2026-09-22')"),'Upper');
ok(b.run("renderMonth().includes('Exercise block')"));
b.run("switchMode('gym')");ok(!b.run("renderMonth().includes('Exercise block')"));
// Ramp-up only changes future untouched sessions after explicit enablement.
const ramp=app('2026-10-05');
ramp.run("setDayType('2026-09-21','Upper A');onRepChange({value:'8'},'2026-09-21',0,0);setFullVolume(true)");
eq(ramp.run("getPlan('2026-09-21')[0].sets"),2);
eq(ramp.run("templateFor('2026-10-05','Upper A')[0].sets"),3);
eq(ramp.run("templateFor('2026-10-05','Upper A')[2].sets"),2);
ramp.run("onRepChange({value:'8'},'2026-10-05',0,0);setFullVolume(false)");
eq(ramp.run("getPlan('2026-10-05')[0].sets"),3);
eq(ramp.run("templateFor('2026-10-06','Upper A')[0].sets"),2);
// v3 migration remains supported.
const v3=app('2026-09-20',{_schemaVersion:3,sessionLog:{0:{1:{0:{weight:'100',reps:[6,7,8]}}}}});
eq(v3.run("S().dayTypes['2026-06-08']"),'Upper');
eq(v3.run("S().sessionLog['2026-06-08'][0].reps"),[6,7,8]);
ok(v3.memory.has('caprica_workout_v2_v3_backup'));
// All four day screens render, custom cloning keeps ranges, and CSV labels match.
const ui=app();
for(const d of ['2026-09-21','2026-09-22','2026-09-23','2026-09-24']){
 ok(ui.run("renderDayView('"+d+"').includes('2 sets')"));
}
ui.run("setDayType('2026-09-21','Upper A');S().customTypes.Test=templateFor('2026-09-21','Upper A');setDayType('2026-09-22','Test')");
eq(ui.run("getPlan('2026-09-22')[0].range"),'6-10');
ui.run("openExerciseModal('2026-09-21',1)");ok(ui.el('modal').innerHTML.includes('Bodyweight'));
eq(JSON.parse(v3.memory.get('caprica_workout_v2')).sessionLog,undefined); // old top-level keys not carried forward
// Food: totals are recomputed from items, and meals persist across a reload.
const f=app('2026-09-23');
f.run("addMealToDay('2026-09-23',{id:'m1',name:'Oats',items:[{kcal:300,proteinG:10,carbsG:50,fatG:5,grams:80},{kcal:120,proteinG:25}],totals:{kcal:9999}})");
eq(f.run("foodTotalsForDay('2026-09-23')"),{kcal:420,proteinG:35,carbsG:50,fatG:5,count:1});
const fSaved=JSON.parse(f.memory.get('caprica_workout_v2'));
eq(fSaved.food.mealsByDay['2026-09-23'].length,1);
eq(app('2026-09-23',fSaved).run("foodTotalsForDay('2026-09-23').kcal"),420);
f.run("updateMeal('2026-09-23','m1',{name:'Oats + whey'})");
eq(f.run("food.mealsByDay['2026-09-23'][0].name"),'Oats + whey');
f.run("deleteMeal('2026-09-23','m1')");
eq(f.run("foodTotalsForDay('2026-09-23').count"),0);
// Recipes log one portion; saved meals log a copy with fresh ids.
f.run("addRecipe('Chili',4,[{name:'Beef',kcal:1000,proteinG:100},{name:'Beans',kcal:400,proteinG:28}]);logRecipe(food.recipes[0].id)");
eq(f.run("[foodTotalsForDay('2026-09-23').kcal,foodTotalsForDay('2026-09-23').proteinG]"),[350,32]);
f.run("addSavedMeal('Shake',[{id:'x',name:'Whey',kcal:200,proteinG:40}]);logSavedMeal(food.savedMeals[0].id)");
eq(f.run("foodTotalsForDay('2026-09-23').count"),2);
ok(f.run("food.mealsByDay['2026-09-23'][1].id!==food.savedMeals[0].id"));
f.run("deleteSavedMeal(food.savedMeals[0].id);deleteRecipe(food.recipes[0].id)");
eq(f.run("[food.savedMeals.length,food.recipes.length,foodTotalsForDay('2026-09-23').count]"),[0,0,2]);
// A pre-food blob loads with empty food, and saving adds it.
const preFood=app('2026-09-23',{_schemaVersion:4,store:{gym:{},travel:{}}});
eq(preFood.run("food.mealsByDay"),{});
preFood.run("saveState()");ok(JSON.parse(preFood.memory.get('caprica_workout_v2')).food);
// Unknown top-level keys survive a save (the next feature added up there must not be dropped by this build).
const future=app('2026-09-23',{_schemaVersion:5,store:{gym:{},travel:{}},food:fSaved.food,futureTop:{kept:true}});
future.run("saveState()");
eq(JSON.parse(future.memory.get('caprica_workout_v2')).futureTop,{kept:true});
// A synced copy from a pre-food build keeps this device's food and queues a push to repair the server.
const pull=app('2026-09-23',fSaved);
pull.run("applyRemote({updated_at:'t1',data:{_schemaVersion:4,store:{gym:{},travel:{}}}})");
eq(JSON.parse(pull.memory.get('caprica_workout_v2')).food.mealsByDay['2026-09-23'].length,1);
eq(JSON.parse(pull.memory.get('caprica_workout_sync_meta')).dirty,true);
// ...but a copy that has food wins as usual, including an empty log.
pull.run("applyRemote({updated_at:'t2',data:{_schemaVersion:5,store:{gym:{},travel:{}},food:{mealsByDay:{}}}})");
eq(JSON.parse(pull.memory.get('caprica_workout_v2')).food.mealsByDay,{});
eq(JSON.parse(pull.memory.get('caprica_workout_sync_meta')).dirty,false);
eq(pull.run("countMeals("+JSON.stringify(fSaved)+")"),1);
// Food-photo function: off unless the token is set, and every schema property is required (strict mode).
(async()=>{
  const {pathToFileURL}=require('node:url');
  const fn=(await import(pathToFileURL(path.join(__dirname,'..','netlify','functions','analyze-food.js')).href)).default;
  const req=(h={})=>new Request('http://x/api/analyze-food',{method:'POST',headers:h,body:JSON.stringify({photoBase64:'data:image/png;base64,AAAA'})});
  delete process.env.ANALYZE_FOOD_TOKEN;
  eq((await fn(req())).status,503);
  process.env.ANALYZE_FOOD_TOKEN='t0ken';
  eq((await fn(req({'X-Food-Token':'wrong'}))).status,401);
  process.env.OPENAI_API_KEY='k';process.env.OPENAI_BASE_URL='http://gw';
  let sent;const realFetch=global.fetch;
  global.fetch=async(url,o)=>{sent=JSON.parse(o.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({items:[{name:'Egg',grams:50,kcal:70,proteinG:6,carbsG:0,fatG:5,confidence:'high',notes:''}],totals:{kcal:1,proteinG:1,carbsG:1,fatG:1},assumptions:[],warnings:[]})}}]}),{status:200});};
  const res=await fn(req({'X-Food-Token':'t0ken'}));global.fetch=realFetch;
  eq(res.status,200);
  eq((await res.json()).totals.kcal,70); // totals recomputed from items, not trusted
  (function walk(s){ if(s&&s.type==='object'&&s.properties){ eq([...s.required].sort(),Object.keys(s.properties).sort()); Object.values(s.properties).forEach(walk);} if(s&&s.items) walk(s.items); })(sent.response_format.json_schema.schema);
  console.log(checks+' assertions passed: scheduling, history, travel, ramp, progression, storage, migration, rendering, food, sync-merge and food function.');
})().catch(e=>{console.error(e);process.exit(1);});
