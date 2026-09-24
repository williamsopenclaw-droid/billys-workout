const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length,1);
new vm.Script(scripts[0][1]);
let checks=0, finished=false;
// An async test that never settles lets Node exit quietly with code 0 — which
// looks like a pass. Treat not reaching the end as a failure.
process.on('exit',()=>{ if(!finished){ console.error('TESTS DID NOT FINISH after '+checks+' assertions'); process.exitCode=1; } });
function app(date='2026-09-20', saved=null){
  const elements=new Map(), memory=new Map(), listeners={};
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
    document:{getElementById:el,querySelector:el,querySelectorAll:()=>[],createElement:()=>el('new'),
      addEventListener(t,f){(listeners[t]=listeners[t]||[]).push(f);}},
    window:{scrollY:0,innerHeight:900,scrollTo(){},addEventListener(){},matchMedia:()=>({matches:false})},
    navigator:{userAgent:'test',onLine:false},location:{reload(){}},
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
    confirm:()=>true,prompt:()=>null,Blob,URL,crypto:require('node:crypto').webcrypto,
    fetch:()=>Promise.reject(new Error('offline'))});
  vm.runInContext(scripts[0][1],ctx);
  return {run:s=>vm.runInContext(s,ctx),el,memory,fire:t=>(listeners[t]||[]).forEach(f=>f({}))};
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
// --- Gate 1a ---
// Navigation is per-device: it never marks sync dirty and never enters the synced blob.
const nav=app('2026-09-23',fSaved);
nav.memory.set('caprica_workout_sync_key','bw-'+'0'.repeat(48));
nav.memory.set('caprica_workout_sync_meta',JSON.stringify({syncedAt:'t1',dirty:false}));
const blobBefore=nav.memory.get('caprica_workout_v2');
nav.run("switchSection('food');setFoodTab('history')");
eq(JSON.parse(nav.memory.get('caprica_workout_sync_meta')).dirty,false);
eq(nav.memory.get('caprica_workout_v2'),blobBefore);
eq(JSON.parse(nav.memory.get('caprica_workout_v2_view')),{section:'food',foodTab:'history'});
nav.run("addMealToDay('2026-09-23',{id:'n1',name:'Apple',items:[{kcal:95}]})");
eq(JSON.parse(nav.memory.get('caprica_workout_sync_meta')).dirty,true);        // real edits still do
eq(JSON.parse(nav.memory.get('caprica_workout_v2')).viewState,undefined);
const navReload=app('2026-09-23',JSON.parse(nav.memory.get('caprica_workout_v2')));
eq(navReload.run("viewState.section"),'workout');                              // prefs are this device's only
// A v36-37 blob's synced viewState is a first-load fallback; this device's own prefs win over it.
const oldView={...fSaved,viewState:{section:'food',foodTab:'saved'}};
eq(app('2026-09-23',oldView).run("[viewState.section,viewState.foodTab]"),['food','saved']);
const withPrefs=(()=>{const x=app('2026-09-23',oldView);x.memory.set('caprica_workout_v2_view',JSON.stringify({section:'workout',foodTab:'recipes'}));x.run("loadState()");return x;})();
eq(withPrefs.run("[viewState.section,viewState.foodTab]"),['workout','recipes']);
// Foreground re-check runs, except while a modal (possibly a half-typed meal) is open.
eq(nav.run("resumeSync()"),true);
nav.el('modal-overlay').classList.contains=()=>true;
eq(nav.run("resumeSync()"),false);
nav.el('modal-overlay').classList.contains=()=>false;
// Going to the background pushes pending changes now; with nothing pending it does nothing.
// (The stub is offline, so an attempted sync shows up as status 'offline'.)
nav.run("syncState={status:'idle'};document.visibilityState='hidden'"); nav.fire('visibilitychange');
eq(nav.run("syncState.status"),'offline');
nav.memory.set('caprica_workout_sync_meta',JSON.stringify({syncedAt:'t1',dirty:false}));
nav.run("syncState={status:'idle'}"); nav.fire('visibilitychange');
eq(nav.run("syncState.status"),'idle');
// Any-day logging: pick a past day, and Log Meal, saved meals and recipes all land on it.
const day=app('2026-09-23');
const click=(act,data={})=>day.run("(()=>{const e={dataset:"+JSON.stringify({act,...data})+"};e.closest=()=>e;handleFoodClick({target:e});})()");
click('food-open-day',{ds:'2026-09-22'});
eq(day.run("[foodDay(),viewState.foodTab]"),['2026-09-22','today']);
ok(day.run("renderFoodToday().includes('Tuesday, September 22')"));
click('log-meal');
eq(day.run("window._mealEditor.ds"),'2026-09-22');
day.run("window._mealEditor.name='Breakfast';window._mealEditor.items=[{name:'Banana',kcal:'105',proteinG:'1.3',carbsG:'',fatG:'',grams:''}];mealSaveDraft()");
eq(day.run("food.mealsByDay['2026-09-22'].map(m=>m.name)"),['Breakfast']);
eq(day.run("foodTotalsForDay('2026-09-22').kcal"),105);
eq(day.run("(food.mealsByDay['2026-09-23']||[]).length"),0);
day.run("addRecipe('Chili',10,[{name:'Turkey',kcal:2000,proteinG:300}]);logRecipe(food.recipes[0].id)");
day.run("addSavedMeal('Shake',[{name:'Whey',kcal:120,proteinG:25}]);logSavedMeal(food.savedMeals[0].id)");
eq(day.run("food.mealsByDay['2026-09-22'].length"),3);
eq(day.run("foodTotalsForDay('2026-09-22').kcal"),425);
click('food-day-prev'); eq(day.run("foodDay()"),'2026-09-21');
click('food-day-next'); click('food-day-next'); eq(day.run("foodDay()"),'2026-09-23'); // clamps at today
day.run("setFoodDay('2026-12-25')"); eq(day.run("foodDay()"),'2026-09-23');          // no future days
click('food-day-prev'); click('food-day-today'); eq(day.run("foodDay()"),'2026-09-23');
// History: days are tappable, and paging goes back a week at a time.
day.run("viewState.foodTab='history'");
ok(day.run("renderFoodHistory().includes('data-act=\"food-open-day\" data-ds=\"2026-09-22\"')"));
click('food-hist-older'); ok(day.run("renderFoodHistory().includes('data-ds=\"2026-09-16\"')"));
ok(!day.run("renderFoodHistory().includes('data-ds=\"2026-09-22\"')"));
click('food-hist-newer'); ok(day.run("renderFoodHistory().includes('data-ds=\"2026-09-22\"')"));
// Deletes ask first; cancelling keeps the data.
day.run("confirm=()=>false");
const mealId=day.run("food.mealsByDay['2026-09-22'][0].id");
day.run("deleteMeal('2026-09-22','"+mealId+"');deleteSavedMeal(food.savedMeals[0].id);deleteRecipe(food.recipes[0].id)");
eq(day.run("[food.mealsByDay['2026-09-22'].length,food.savedMeals.length,food.recipes.length]"),[3,1,1]);
day.run("confirm=()=>true;deleteMeal('2026-09-22','"+mealId+"')");
eq(day.run("food.mealsByDay['2026-09-22'].length"),2);
// Typed text is escaped, including the meal time.
day.run("setFoodDay(null);addMealToDay('2026-09-23',{id:'x1',name:'<b>n</b>',time:'<img src=x onerror=alert(1)>',items:[]})");
ok(!day.run("renderFoodToday()").includes('<img'));
ok(!day.run("renderFoodToday()").includes('<b>n'));
// Bad numbers are rejected rather than saved as negative or silent zero.
for (const bad of ['-5','abc','1e999']){
  day.run("openMealEditor('2026-09-23',null);window._mealEditor.name='Bad';window._mealEditor.items=[{name:'X',kcal:'100',proteinG:'"+bad+"'}];mealSaveDraft()");
  eq(day.run("food.mealsByDay['2026-09-23'].length"),1);
}
day.run("openRecipeEditor(null);window._recipeEditor.name='R';window._recipeEditor.portions='0';recipeSaveDraft()");
eq(day.run("food.recipes.length"),1);
day.run("window._recipeEditor.portions='8';window._recipeEditor.ingredients=[{name:'Oil',kcal:'-1'}];recipeSaveDraft()");
eq(day.run("food.recipes.length"),1);
day.run("window._recipeEditor.ingredients=[{name:'Oil',kcal:'265',fatG:'30'}];recipeSaveDraft()");
eq(day.run("food.recipes.length"),2);
// --- Gate 2: meal categories and goals ---
const g2=app('2026-09-23');
const click2=(act,data={})=>g2.run("(()=>{const e={dataset:"+JSON.stringify({act,...data})+"};e.closest=()=>e;handleFoodClick({target:e});})()");
// New meals default by time of day today (test clock is 8am), and to no category on a past day.
eq(g2.run("categoryForNow()"),'breakfast');
g2.run("openMealEditor('2026-09-23',null)"); eq(g2.run("window._mealEditor.category"),'breakfast');
g2.run("openMealEditor('2026-09-22',null)"); eq(g2.run("window._mealEditor.category"),'');
ok(g2.el('modal').innerHTML.includes('data-cat="post-workout"'));
// Chips select, and a second tap clears.
click2('meal-cat',{cat:'lunch'}); eq(g2.run("window._mealEditor.category"),'lunch');
click2('meal-cat',{cat:'lunch'}); eq(g2.run("window._mealEditor.category"),'');
click2('meal-cat',{cat:'not-a-category'}); eq(g2.run("window._mealEditor.category"),'');
// With no name and no category, nothing saves; a category alone names the meal.
g2.run("window._mealEditor.items=[{name:'Stir-fry',kcal:'600',proteinG:'45'}];mealSaveDraft()");
eq(g2.run("(food.mealsByDay['2026-09-22']||[]).length"),0);
click2('meal-cat',{cat:'lunch'}); g2.run("mealSaveDraft()");
eq(g2.run("food.mealsByDay['2026-09-22'].map(m=>[m.name,m.category])"),[['Lunch','lunch']]);
// Day view groups in the fixed order; older meals without a category are grouped by
// name ("Morning Snack") or under Other — at render time only, never rewritten.
g2.run("addMealToDay('2026-09-22',{id:'d1',name:'Dinner',category:'dinner',items:[{name:'Rice',kcal:200}]});"
 +"addMealToDay('2026-09-22',{id:'b1',name:'Breakfast',category:'breakfast',items:[{name:'Strawberries',kcal:24},{name:'Blueberries',kcal:43}]});"
 +"addMealToDay('2026-09-22',{id:'s1',name:'Morning Snack',items:[{name:'Banana',kcal:105}]});"
 +"addMealToDay('2026-09-22',{id:'o1',name:'Pizza',items:[{kcal:300}]});"
 +"addMealToDay('2026-09-22',{id:'x1',name:'Odd',category:'<img src=x>',items:[]});"
 +"addMealToDay('2026-09-22',{id:'w1',name:'After Work',items:[{name:'Gatorade Zero',kcal:0}]})");
eq(g2.run("groupMealsByCategory(food.mealsByDay['2026-09-22']).map(g=>[g.id,g.meals.map(m=>m.id)])"),
  [['breakfast',['b1']],['am-snack',['s1']],['lunch',[g2.run("food.mealsByDay['2026-09-22'][0].id")]],['post-workout',['w1']],['dinner',['d1']],['other',['o1','x1']]]);
const stored=JSON.parse(g2.memory.get('caprica_workout_v2')).food.mealsByDay['2026-09-22'];
eq(stored.find(m=>m.id==='s1').category,undefined);                        // legacy meal untouched
g2.run("setFoodDay('2026-09-22')");
const dayHtml=g2.run("renderFoodToday()");
const order=['>Breakfast<','>Morning Snack<','>Lunch<','>After Work / Workout<','>Dinner<','>Other<'].map(s=>dayHtml.indexOf(s));
ok(order.every((v,i)=>v>=0&&(i===0||v>order[i-1])));
ok(!dayHtml.includes('<img src=x>'));
ok(dayHtml.includes('Strawberries, Blueberries'));                          // item names shown under the category
// History shows what was eaten, under each category.
const hist=g2.run("renderFoodHistory()");
ok(hist.includes('<b>Breakfast</b> Strawberries, Blueberries'));
ok(hist.includes('<b>Morning Snack</b> Banana'));
ok(hist.includes('<b>Other</b> Pizza; Odd'));
// An older build's edit (patch without `category`) keeps the category.
g2.run("updateMeal('2026-09-22','d1',{id:'d1',name:'Dinner',time:'',items:[{name:'Rice',kcal:250}],notes:''})");
eq(g2.run("food.mealsByDay['2026-09-22'].find(m=>m.id==='d1').category"),'dinner');
// Editing a legacy meal shows its inferred category and saves it for real.
g2.run("openMealEditor('2026-09-22','s1')"); eq(g2.run("window._mealEditor.category"),'am-snack');
g2.run("mealSaveDraft()"); eq(g2.run("food.mealsByDay['2026-09-22'].find(m=>m.id==='s1').category"),'am-snack');
// Saved meals carry their category; recipes default by time today, none on a past day.
g2.run("savedPick('b1')"); eq(g2.run("food.savedMeals[0].category"),'breakfast');
g2.run("setFoodDay('2026-09-21');logSavedMeal(food.savedMeals[0].id)");
eq(g2.run("food.mealsByDay['2026-09-21'][0].category"),'breakfast');
g2.run("addRecipe('Chili',10,[{name:'Turkey',kcal:2000}]);logRecipe(food.recipes[0].id)");
eq(g2.run("food.mealsByDay['2026-09-21'][1].category"),'');
g2.run("setFoodDay(null);logRecipe(food.recipes[0].id)");
eq(g2.run("food.mealsByDay['2026-09-23'][0].category"),'breakfast');
// Goals: editable, validated, saved in the synced food slice, and unknown goal fields kept.
g2.run("food.goals.carbsG=250"); click2('edit-goals');
ok(g2.el('modal').innerHTML.includes('data-input="goal-kcal" value="2200"'));
for (const [k,v] of [['kcal','22000'],['kcal',''],['kcal','abc'],['proteinG','-1'],['proteinG','600']]){
  click2('edit-goals'); g2.run("window._goalsEditor."+k+"="+JSON.stringify(v)); click2('goals-save');
  eq(g2.run("[food.goals.kcal,food.goals.proteinG]"),[2200,160]);
}
click2('edit-goals'); g2.run("window._goalsEditor.kcal='2400';window._goalsEditor.proteinG='170.4'"); click2('goals-save');
eq(g2.run("food.goals"),{kcal:2400,proteinG:170,carbsG:250});
eq(JSON.parse(g2.memory.get('caprica_workout_v2')).food.goals,{kcal:2400,proteinG:170,carbsG:250});
ok(g2.run("renderFoodToday()").includes(' / 2400'));
eq(app('2026-09-23',JSON.parse(g2.memory.get('caprica_workout_v2'))).run("food.goals.kcal"),2400);
// --- Recipe partial portions ---
const rp=app('2026-09-23');
const clickR=(act,data={})=>rp.run("(()=>{const e={dataset:"+JSON.stringify({act,...data})+"};e.closest=()=>e;handleFoodClick({target:e});})()");
rp.run("addRecipe('Stir-fry',8,[{id:'b',name:'Beef',kcal:1600,proteinG:160,grams:1200},{id:'r',name:'Rice',kcal:700,proteinG:14,portions:7},{id:'o',name:'Oil',kcal:240}],{cookedWeightG:2400});"
 +"addRecipe('Chili',10,[{name:'Turkey',kcal:2000,proteinG:300}])");
const SF=rp.run("food.recipes[0].id"), CH=rp.run("food.recipes[1].id");
// Per-portion maths honours an ingredient's own portion count (rice made 7, not 8).
eq(rp.run("recipePerPortion(food.recipes[0])"),{kcal:330,proteinG:22,carbsG:0,fatG:0});
eq(rp.run("recipePortionWeight(food.recipes[0])"),300);
ok(rp.run("renderFoodRecipes()").includes('330 kcal · 22g P / portion'));
ok(rp.run("renderFoodRecipes()").includes('≈300 g each'));
ok(rp.run("renderFoodRecipes()").includes('data-act=\"log-recipe-amount\"'));
// The one-tap button still logs exactly one portion.
clickR('log-recipe',{id:SF});
eq(rp.run("food.mealsByDay['2026-09-23'][0].name"),'Stir-fry (1 portion)');
eq(rp.run("mealMacros(food.mealsByDay['2026-09-23'][0]).kcal"),330);
// Portions: 1.5 of the batch.
clickR('log-recipe-amount',{id:SF}); rp.run("window._recipeLog.value='1.5'");
ok(rp.run("recipeLogPreviewText()").includes('495 kcal'));
clickR('recipe-log-confirm');
eq(rp.run("[food.mealsByDay['2026-09-23'][1].name,mealMacros(food.mealsByDay['2026-09-23'][1]).kcal]"),['Stir-fry (1.5 portions)',495]);
eq(rp.run("food.mealsByDay['2026-09-23'][1].recipe"),{id:SF,portions:1.5});
eq(rp.run("window._recipeLog"),null);
// Grams: 375 g of a 300 g-per-portion batch = 1.25 portions.
clickR('log-recipe-amount',{id:SF}); clickR('recipe-log-mode',{mode:'grams'});
eq(rp.run("window._recipeLog.value"),'300');                                  // 1 portion carried across as grams
rp.run("window._recipeLog.value='375'");
ok(rp.run("recipeLogPreviewText()").includes('= 1.25 portions'));
ok(rp.run("recipeLogPreviewText()").includes('413 kcal'));
clickR('recipe-log-confirm');
const g375=rp.run("food.mealsByDay['2026-09-23'][2]");
eq([g375.name,g375.recipe],['Stir-fry (375 g)',{id:SF,portions:1.25,grams:375}]);
eq(g375.items.map(i=>[i.name,i.kcal]),[['Beef',250],['Rice',125],['Oil',37.5]]);
// Switching modes keeps the amount.
clickR('log-recipe-amount',{id:SF}); rp.run("window._recipeLog.value='1.5'");
clickR('recipe-log-mode',{mode:'grams'}); eq(rp.run("window._recipeLog.value"),'450');
clickR('recipe-log-mode',{mode:'portions'}); eq(rp.run("window._recipeLog.value"),'1.5');
clickR('recipe-log-cancel');
// Grams need a cooked weight; bad amounts are refused and nothing is logged.
clickR('log-recipe-amount',{id:CH}); clickR('recipe-log-mode',{mode:'grams'});
ok(rp.el('modal').innerHTML.includes('Weigh the whole cooked batch'));
rp.run("window._recipeLog.value='300'"); clickR('recipe-log-confirm');
ok(rp.run("recipeLogAmount().error").includes('cooked weight'));
for (const [mode,v,msg] of [['portions','0','above 0'],['portions','-1','above 0'],['portions','abc','above 0'],['portions','21','more than 20'],['portions','','above 0'],['grams','6000','more than 5000']]){
  rp.run("window._recipeLog={id:'"+(mode==='grams'?SF:CH)+"',mode:'"+mode+"',value:"+JSON.stringify(v)+"}");
  ok(rp.run("recipeLogAmount().error").includes(msg));                       // the user is told why
  clickR('recipe-log-confirm');
  ok(rp.el('toast').textContent.includes(msg));
}
eq(rp.run("food.mealsByDay['2026-09-23'].length"),3);
// Logging goes to the day being viewed.
rp.run("setFoodDay('2026-09-22');window._recipeLog={id:'"+CH+"',mode:'portions',value:'0.5'}"); clickR('recipe-log-confirm');
eq(rp.run("[food.mealsByDay['2026-09-22'][0].name,mealMacros(food.mealsByDay['2026-09-22'][0]).kcal]"),['Chili (0.5 portions)',100]);
// Editor: cooked weight and per-ingredient portions are validated, saved, and clearable; other fields kept.
rp.run("openRecipeEditor('"+SF+"')");
ok(rp.el('modal').innerHTML.includes('data-input="recipe-cooked"') && rp.el('modal').innerHTML.includes('value="2400"'));
ok(rp.el('modal').innerHTML.includes('data-input="ing-portions" data-index="1"'));
rp.run("window._recipeEditor.cookedWeightG='-5';recipeSaveDraft()"); eq(rp.run("food.recipes[0].cookedWeightG"),2400);
rp.run("window._recipeEditor.cookedWeightG='2000';window._recipeEditor.ingredients[1].portions='0';recipeSaveDraft()"); eq(rp.run("food.recipes[0].cookedWeightG"),2400);
rp.run("window._recipeEditor.ingredients[1].portions='7';window._recipeEditor.ingredients[0].futureField=1;recipeSaveDraft()");
eq(rp.run("[food.recipes[0].cookedWeightG,food.recipes[0].ingredients.map(i=>i.portions),food.recipes[0].ingredients[0].futureField]"),[2000,[null,7,null],1]);   // eq() round-trips through JSON: unset shows as null
rp.run("openRecipeEditor('"+SF+"');window._recipeEditor.cookedWeightG='';window._recipeEditor.ingredients[1].portions='';recipeSaveDraft()");
const savedR=JSON.parse(rp.memory.get('caprica_workout_v2')).food.recipes[0];
eq(['cookedWeightG' in savedR,'portions' in savedR.ingredients[1]],[false,false]);
rp.run("openRecipeEditor(null);window._recipeEditor.name='New';window._recipeEditor.cookedWeightG='1800';window._recipeEditor.ingredients=[{name:'X',kcal:'900'}];recipeSaveDraft()");
eq(rp.run("food.recipes[2].cookedWeightG"),1800);
// Old recipes (no cooked weight, no ingredient portions) behave exactly as before.
eq(rp.run("recipePerPortion(food.recipes[1]).kcal"),200);

// --- Editing saved meals ---
const sm=app('2026-09-23');
const clickS=(act,data={})=>sm.run("(()=>{const e={dataset:"+JSON.stringify({act,...data})+"};e.closest=()=>e;handleFoodClick({target:e});})()");
sm.run("addSavedMeal('Shake',[{id:'w',name:'Whey',kcal:120,proteinG:25,source:'ai',confidence:'high'}],'post-workout');food.savedMeals[0].futureKey='kept';saveState()");
const SM=sm.run("food.savedMeals[0].id");
ok(sm.run("renderFoodSaved()").includes('data-act=\"edit-saved-meal\" data-id=\"'+SM+'\"'));
ok(sm.run("renderFoodSaved()").includes('After Work / Workout · 120 kcal'));
// Log it once before editing: that logged copy must not change afterwards.
clickS('log-saved-meal',{id:SM});
// The editor opens in saved mode: chips, name and items, but no date, time, notes or photo.
clickS('edit-saved-meal',{id:SM});
const smHtml=sm.el('modal').innerHTML;
ok(smHtml.includes('Edit saved meal')); ok(smHtml.includes('data-cat="post-workout"'));
ok(!smHtml.includes('data-input="meal-time"')); ok(!smHtml.includes('data-input="meal-notes"')); ok(!smHtml.includes('meal-photo'));
eq(sm.run("[window._mealEditor.kind,window._mealEditor.name,window._mealEditor.category,window._mealEditor.items.map(i=>i.name)]"),['saved','Shake','post-workout',['Whey']]);
// Bad numbers and an empty item list are refused; nothing changes.
sm.run("window._mealEditor.items[0].kcal='-1';mealSaveDraft()");
eq(sm.run("food.savedMeals[0].items[0].kcal"),120);
sm.run("window._mealEditor.items=[{name:'',kcal:''}];mealSaveDraft()");
ok(sm.el('toast').textContent.includes('at least one item')); eq(sm.run("food.savedMeals[0].items.length"),1);
// A real edit: rename, change category, change an amount, add an item.
sm.run("window._mealEditor.name='Shake + banana';window._mealEditor.items=[{id:'w',name:'Whey',kcal:'130',proteinG:'26',source:'ai',confidence:'high'},{name:'Banana',kcal:'105',proteinG:'1.3'}]");
clickS('meal-cat',{cat:'am-snack'}); clickS('meal-save');
const edited=sm.run("food.savedMeals[0]");
eq([edited.id,edited.name,edited.category,edited.items.map(i=>[i.name,i.kcal]),edited.items[0].source,edited.futureKey],
   [SM,'Shake + banana','am-snack',[['Whey',130],['Banana',105]],'ai','kept']);
eq(sm.run("food.savedMeals.length"),1);                                         // updated in place, not duplicated
eq(sm.run("window._mealEditor"),null);
eq(JSON.parse(sm.memory.get('caprica_workout_v2')).food.savedMeals[0].name,'Shake + banana');   // persisted
// The meal logged before the edit is unchanged; logging now uses the new version.
eq(sm.run("food.mealsByDay['2026-09-23'].map(m=>[m.name,mealMacros(m).kcal])"),[['Shake',120]]);
clickS('log-saved-meal',{id:SM});
eq(sm.run("food.mealsByDay['2026-09-23'].map(m=>[m.name,m.category,mealMacros(m).kcal])"),[['Shake','post-workout',120],['Shake + banana','am-snack',235]]);
// Clearing the category removes it; a blank name then isn't allowed.
clickS('edit-saved-meal',{id:SM}); clickS('meal-cat',{cat:'am-snack'});
sm.run("window._mealEditor.name='';mealSaveDraft()"); eq(sm.run("food.savedMeals[0].name"),'Shake + banana');
sm.run("window._mealEditor.name='Shake';mealSaveDraft()");
eq(sm.run("['category' in food.savedMeals[0],food.savedMeals[0].name]"),[false,'Shake']);
// Editing a saved meal that another device deleted meanwhile doesn't resurrect it.
clickS('edit-saved-meal',{id:SM}); sm.run("food.savedMeals=[];mealSaveDraft()");
eq(sm.run("food.savedMeals.length"),0); ok(sm.el('toast').textContent.includes('no longer exists'));
// Cancel leaves it alone; ordinary meal editing is unaffected by the saved mode.
sm.run("addSavedMeal('Oats',[{name:'Oats',kcal:300}])"); clickS('edit-saved-meal',{id:sm.run("food.savedMeals[0].id")});
sm.run("window._mealEditor.name='Changed'"); clickS('meal-cancel'); eq(sm.run("food.savedMeals[0].name"),'Oats');
sm.run("openMealEditor('2026-09-23',null)"); ok(sm.el('modal').innerHTML.includes('data-input="meal-time"')); ok(sm.el('modal').innerHTML.includes('meal-photo'));

(async()=>{
  // --- Gate 3: food-photo function ---
  const {pathToFileURL}=require('node:url');
  const fn=(await import(pathToFileURL(path.join(__dirname,'..','netlify','functions','analyze-food.js')).href)).default;
  const KEY='bw-'+'a1'.repeat(24);
  const PHOTO='data:image/jpeg;base64,'+'A'.repeat(400);
  const aiOk=(parsed)=>({status:200,body:{choices:[{message:{content:JSON.stringify(parsed)}}]}});
  const egg={items:[{name:'Egg',grams:50,kcal:70,proteinG:6,carbsG:0,fatG:5,confidence:'high',notes:''}],totals:{kcal:1,proteinG:1,carbsG:1,fatG:1},assumptions:['One egg'],warnings:[]};
  // Routes fetch by host: Supabase (sync-code check) or the AI gateway. Records every call and every log line.
  async function call({key=KEY,body={photoBase64:PHOTO,description:'breakfast'},sb={status:200,body:[{updated_at:'t'}]},ai=aiOk(egg),envs={}}={}){
    const calls=[],logs=[];const realFetch=global.fetch,realErr=console.error;
    for(const k of ['OPENAI_API_KEY','OPENAI_BASE_URL','FOOD_AI_DISABLED','FOOD_AI_MODEL']) delete process.env[k];
    Object.assign(process.env,{OPENAI_API_KEY:'gw-key',OPENAI_BASE_URL:'http://gw/v1'},envs);
    for(const [k,v] of Object.entries(envs)) if(v===undefined) delete process.env[k];
    global.fetch=async(url,o={})=>{calls.push({url:String(url),headers:o.headers||{},body:o.body});
      const r=String(url).includes('supabase.co')?sb:ai;
      if(r instanceof Error) throw r;
      return new Response(typeof r.body==='string'?r.body:JSON.stringify(r.body),{status:r.status});};
    console.error=(...a)=>logs.push(a.join(' '));
    try{
      const headers={'Content-Type':'application/json'}; if(key!==null) headers['X-Sync-Key']=key;
      const res=await fn(new Request('http://x/api/analyze-food',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)}));
      return {status:res.status,json:await res.json(),calls,logs};
    } finally { global.fetch=realFetch; console.error=realErr; }
  }
  // Auth is the sync code, checked against Supabase; nothing reaches the AI without it.
  let r=await call({key:null}); eq([r.status,r.json.error,r.calls.length],[401,'unauthorized',0]);
  r=await call({key:'short'}); eq([r.status,r.calls.length],[401,0]);
  r=await call({key:'has spaces in it but long enough'}); eq([r.status,r.calls.length],[401,0]);
  r=await call({sb:{status:200,body:[]}}); eq([r.status,r.calls.length],[401,1]);          // unknown code: Supabase only
  eq(r.calls[0].headers['X-Sync-Key'],KEY);
  r=await call({sb:{status:540,body:'paused'}}); eq([r.status,r.json.error,r.calls.length],[503,'verify_unavailable',1]); // fail closed
  r=await call({sb:new Error('ENOTFOUND')}); eq([r.status,r.calls.length],[503,1]);
  r=await call({envs:{FOOD_AI_DISABLED:'1'}}); eq([r.status,r.json.error,r.calls.length],[503,'disabled',0]);
  r=await call({envs:{OPENAI_API_KEY:undefined}}); eq([r.status,r.json.error,r.calls.length],[503,'not_configured',1]);
  // Input checks: only real base64 JPEG/PNG/WebP, size-capped.
  for (const bad of ['data:text/plain;base64,AAAA','data:image/gif;base64,AAAA','data:image/jpeg;base64,AA<script>','data:image/svg+xml;base64,AAAA','https://x/y.jpg',42]){
    r=await call({body:{photoBase64:bad}}); eq([r.status,r.json.error],[400,'bad_request']);
  }
  r=await call({body:'not json'}); eq(r.status,400);
  r=await call({body:{photoBase64:'data:image/jpeg;base64,'+'A'.repeat(6*1024*1024)}}); eq([r.status,r.json.error],[413,'too_large']);
  // Success: the AI request carries no sync code, the schema is strict-complete, totals are recomputed.
  r=await call({envs:{FOOD_AI_MODEL:'test-model'}});
  eq(r.status,200); eq(r.json.totals.kcal,70); eq(r.json.model,'test-model'); eq(r.json.assumptions,['One egg']);
  const aiCall=r.calls.find(c=>c.url.startsWith('http://gw/v1/chat/completions'));
  ok(aiCall); ok(!JSON.stringify(aiCall.headers).includes(KEY)); ok(!aiCall.body.includes(KEY));
  const sent=JSON.parse(aiCall.body); eq(sent.model,'test-model');
  (function walk(s){ if(s&&s.type==='object'&&s.properties){ eq([...s.required].sort(),Object.keys(s.properties).sort()); Object.values(s.properties).forEach(walk);} if(s&&s.items) walk(s.items); })(sent.response_format.json_schema.schema);
  // The model's output is cleaned: numbers clamped, strings cut, item count capped, unknown confidence -> low.
  const junk={items:Array.from({length:40},(_,i)=>({name:i===0?'x'.repeat(300):'Item '+i,grams:-5,kcal:i===0?99999:'abc',proteinG:NaN,carbsG:10,fatG:1,confidence:i===0?'sure':'medium',notes:'n'})),totals:{kcal:1},assumptions:[],warnings:['w'.repeat(500)]};
  r=await call({ai:aiOk(junk)});
  eq([r.status,r.json.items.length,r.json.items[0].name.length,r.json.items[0].kcal,r.json.items[0].grams,r.json.items[0].proteinG,r.json.items[0].confidence,r.json.items[1].kcal],[200,25,80,5000,0,0,'low',0]);
  eq(r.json.totals.carbsG,250); eq(r.json.warnings[0].length,200);
  r=await call({ai:aiOk({items:[],totals:{},assumptions:[],warnings:[]})}); eq([r.status,r.json.error],[422,'no_items']);
  // Upstream failures give a plain message, never the upstream body; the logs never hold the sync code.
  r=await call({ai:{status:500,body:'internal detail sk-LEAKY-12345'}});
  eq([r.status,r.json.error],[502,'upstream']); ok(!JSON.stringify(r.json).includes('LEAKY'));
  ok(r.logs.length && !r.logs.join(' ').includes('LEAKY') && !r.logs.join(' ').includes(KEY));
  r=await call({ai:{status:429,body:'slow down'}}); eq([r.status,r.json.error],[429,'busy']);
  r=await call({ai:{status:200,body:{choices:[{message:{content:'not json'}}]}}}); eq([r.status,r.json.error],[502,'bad_output']);
  r=await call({ai:new Error('socket hang up')}); eq([r.status,r.json.error],[502,'upstream']);
  ok(!r.logs.join(' ').includes(KEY));
  eq((await fn(new Request('http://x/api/analyze-food'))).status,405);

  // --- Gate 3: app side ---
  const p=app('2026-09-23');
  const realCompress=p.run("compressPhoto");
  // Without Sync there's no way to authenticate: explain, don't call.
  p.run("openMealEditor('2026-09-23',null);startMealPhoto()");
  ok(p.el('toast').textContent.includes('Sync'));
  p.memory.set('caprica_workout_sync_key',KEY);
  // The request goes to the function with the sync code in a header, never the URL.
  p.run("compressPhoto=async()=>'data:image/jpeg;base64,AAAA';window.__calls=[];"
   +"fetch=async(u,o)=>{window.__calls.push({u,o});return {ok:true,status:200,json:async()=>window.__resp};}");
  p.run("window.__resp={items:[{name:'Scrambled eggs',grams:150,kcal:230,proteinG:18,carbsG:2,fatG:16,confidence:'medium',notes:'butter assumed'},{name:'<img src=x onerror=alert(1)>',kcal:-40,proteinG:'9',confidence:'??'}],assumptions:['2 large eggs'],warnings:['<b>Oil unknown</b>']}");
  p.run("window._mealEditor.ai={desc:'2 eggs, toast'}");
  await p.run("onMealPhotoChosen({files:[{type:'image/jpeg'}],value:'x'})");
  const c0=p.run("window.__calls[0]");
  eq(c0.u,'/api/analyze-food'); eq(c0.o.headers['X-Sync-Key'],KEY); ok(!c0.u.includes(KEY));
  eq(JSON.parse(c0.o.body).description,'2 eggs, toast');
  // Result lands in the editor as editable rows, replacing the blank starter row; nothing is saved yet.
  eq(p.run("window._mealEditor.items.map(i=>[i.name,i.kcal,i.proteinG,i.source,i.confidence])"),
    [['Scrambled eggs',230,18,'ai','medium'],['<img src=x onerror=alert(1)>',0,9,'ai','low']]);
  eq(p.run("(food.mealsByDay['2026-09-23']||[]).length"),0);
  const modal=p.el('modal').innerHTML;
  ok(modal.includes('nothing is saved until you tap Save')); ok(modal.includes('Assumed: 2 large eggs'));
  ok(!modal.includes('<img src=x')); ok(!modal.includes('<b>Oil')); ok(modal.includes('AI estimate · medium confidence'));
  // The user edits a number, then saves: AI markers survive, and the meal is flagged.
  p.run("window._mealEditor.items[1].name='Toast';window._mealEditor.items[1].kcal='80';mealSaveDraft()");
  eq(p.run("food.mealsByDay['2026-09-23'][0].items.map(i=>[i.name,i.kcal,i.source])"),[['Scrambled eggs',230,'ai'],['Toast',80,'ai']]);
  eq(p.run("food.mealsByDay['2026-09-23'][0].aiAssisted"),true);
  // A second photo adds to rows already typed rather than replacing them.
  p.run("openMealEditor('2026-09-23',null);window._mealEditor.items=[{name:'Coffee',kcal:'5'}];window.__resp={items:[{name:'Banana',kcal:105,confidence:'high'}]}");
  await p.run("onMealPhotoChosen({files:[{type:'image/jpeg'}],value:'x'})");
  eq(p.run("window._mealEditor.items.map(i=>i.name)"),['Coffee','Banana']);
  // Errors show the server's plain message (escaped); a failure never touches the draft's rows.
  p.run("fetch=async()=>({ok:false,status:401,json:async()=>({message:'This device\\'s sync code wasn\\'t recognised. <i>x</i>'})})");
  await p.run("onMealPhotoChosen({files:[{type:'image/jpeg'}],value:'x'})");
  eq(p.run("window._mealEditor.ai.status"),'error'); ok(p.el('modal').innerHTML.includes('wasn&#39;t recognised') || p.el('modal').innerHTML.includes("wasn't recognised"));
  ok(!p.el('modal').innerHTML.includes('<i>x</i>')); eq(p.run("window._mealEditor.items.length"),2);
  p.run("fetch=async()=>{throw new Error('net')}");
  await p.run("onMealPhotoChosen({files:[{type:'image/jpeg'}],value:'x'})");
  ok(p.run("window._mealEditor.ai.message").includes('Couldn\'t reach'));
  p.run("fetch=async()=>({ok:true,status:200,json:async()=>({items:[]})})");
  await p.run("onMealPhotoChosen({files:[{type:'image/jpeg'}],value:'x'})");
  ok(p.run("window._mealEditor.ai.message").includes('No food'));
  // A result that arrives after the editor was closed is dropped, not applied or saved.
  p.run("window.__resp={items:[{name:'Late',kcal:1}]};let __release;compressPhoto=()=>new Promise(r=>{__release=()=>r('data:image/jpeg;base64,AAAA')});"
   +"fetch=async()=>({ok:true,status:200,json:async()=>window.__resp})");
  const pending=p.run("onMealPhotoChosen({files:[{type:'image/jpeg'}],value:'x'})");
  p.run("mealCancel();__release()"); await pending;
  eq(p.run("window._mealEditor"),null);
  ok(!JSON.stringify(p.run("food.mealsByDay")).includes('Late'));
  // Non-photos are refused before any upload.
  await realCompress({type:'application/pdf',size:10}).then(()=>ok(false),e=>ok(e.message.includes('isn\'t a photo')));
  await realCompress({type:'image/jpeg',size:40*1024*1024}).then(()=>ok(false),e=>ok(e.message.includes('too large')));
  // Photos are never kept: nothing image-like in saved state.
  ok(!p.memory.get('caprica_workout_v2').includes('data:image'));
  finished=true;
  console.log(checks+' assertions passed: scheduling, history, travel, ramp, progression, storage, migration, rendering, food, any-day food, meal categories, goals, recipe portions, saved-meal editing, sync-merge, navigation, photo function and photo flow.');
})().catch(e=>{console.error(e);process.exit(1);});
