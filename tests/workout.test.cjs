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
// New saved meal from scratch: same saved-mode editor, empty; saving adds it and logs nothing.
ok(sm.run("renderFoodSaved()").includes('data-act=\"new-saved-meal\"'));
const loggedBefore=sm.run("JSON.stringify(food.mealsByDay)");
clickS('new-saved-meal');
ok(sm.el('modal').innerHTML.includes('New saved meal')); ok(!sm.el('modal').innerHTML.includes('data-input="meal-time"'));
eq(sm.run("[window._mealEditor.kind,window._mealEditor.savedId,window._mealEditor.category,window._mealEditor.items.length]"),['saved',null,'',1]);
sm.run("mealSaveDraft()"); ok(sm.el('toast').textContent.includes('Pick a meal'));      // no name, no category
sm.run("window._mealEditor.name='Empty';mealSaveDraft()"); ok(sm.el('toast').textContent.includes('at least one item'));
sm.run("window._mealEditor.items=[{name:'Greek yogurt',kcal:'-3'}];mealSaveDraft()"); eq(sm.run("food.savedMeals.length"),1);
clickS('meal-cat',{cat:'pm-snack'});
sm.run("window._mealEditor.name='';window._mealEditor.items=[{name:'Greek yogurt',kcal:'60',proteinG:'6'},{name:'Hummus',kcal:'100',proteinG:'3'}]"); clickS('meal-save');
eq(sm.run("food.savedMeals.length"),2);
eq(sm.run("[food.savedMeals[1].name,food.savedMeals[1].category,food.savedMeals[1].items.map(i=>[i.name,i.kcal])]"),['Afternoon Snack','pm-snack',[['Greek yogurt',60],['Hummus',100]]]);
eq(sm.run("JSON.stringify(food.mealsByDay)"),loggedBefore);                         // nothing logged
eq(JSON.parse(sm.memory.get('caprica_workout_v2')).food.savedMeals.length,2);           // persisted
eq(sm.run("window._mealEditor"),null);
// ...and it logs like any other saved meal.
clickS('log-saved-meal',{id:sm.run("food.savedMeals[1].id")});
eq(sm.run("food.mealsByDay['2026-09-23'].slice(-1).map(m=>[m.category,mealMacros(m).kcal])"),[['pm-snack',160]]);

// --- Import saved meals ---
const im=app('2026-09-23');
const clickI=(act,data={})=>im.run("(()=>{const e={dataset:"+JSON.stringify({act,...data})+"};e.closest=()=>e;handleFoodClick({target:e});})()");
const typeI=v=>im.run("handleFoodInput({target:{dataset:{input:'import-text'},value:"+JSON.stringify(v)+"}})");
// The exact text handed to William for his three daily meals.
const THREE={savedMeals:[
 {name:'Breakfast coffee',category:'Breakfast',items:[{name:'Whey isolate, vanilla (1 scoop)',kcal:120,proteinG:27,carbsG:2,fatG:0.5,grams:32},{name:'Creatine',kcal:0,grams:5},{name:'Silk protein almond/cashew, 60 mL',kcal:22,proteinG:1.9},{name:'International Delight Zero, 40 mL',kcal:40}]},
 {name:'Banana + Premier Protein',category:'Morning Snack',items:[{name:'Banana, medium',kcal:105,proteinG:1.3,carbsG:27,fatG:0.4,grams:118},{name:'Premier Protein Chocolate',kcal:160,proteinG:30,carbsG:4,fatG:3}]},
 {name:'Post-workout shake',category:'After Work / Workout',items:[{name:'Whey isolate, vanilla (1 scoop)',kcal:120,proteinG:27,carbsG:2,fatG:0.5,grams:32},{name:'Silk protein almond/cashew, 250 mL',kcal:90,proteinG:8},{name:'Water, 125 mL',kcal:0},{name:'Gatorade Zero',kcal:10}]}]};
im.run("addMealToDay('2026-09-23',{id:'keep',name:'Lunch',category:'lunch',items:[{name:'Rice',kcal:195}]})");
const loggedI=im.run("JSON.stringify(food.mealsByDay)");
ok(im.run("renderFoodSaved()").includes('data-act=\"import-saved-meals\"'));
clickI('import-saved-meals'); ok(im.el('modal').innerHTML.includes('Import saved meals'));
typeI(JSON.stringify(THREE,null,1)); clickI('import-check');
eq(im.run("window._importSaved.result.meals.map(m=>[m.name,m.category,m.replacesId,Math.round(mealMacros(m).kcal)])"),
  [['Breakfast coffee','breakfast',null,182],['Banana + Premier Protein','am-snack',null,265],['Post-workout shake','post-workout',null,220]]);
ok(im.el('modal').innerHTML.includes('3 new · 0 will replace')); ok(im.el('modal').innerHTML.includes('Import 3 saved meals'));
eq(im.run("(food.savedMeals||[]).length"),0);                                    // Check saves nothing
clickI('import-apply');
eq(im.run("food.savedMeals.map(s=>[s.name,s.category,Math.round(mealMacros(s).kcal),Math.round(mealMacros(s).proteinG)])"),
  [['Breakfast coffee','breakfast',182,29],['Banana + Premier Protein','am-snack',265,31],['Post-workout shake','post-workout',220,35]]);
ok(im.el('toast').textContent.includes('3 new, 0 updated'));
eq(JSON.parse(im.memory.get('caprica_workout_v2')).food.savedMeals.length,3);       // persisted (and so synced)
eq(im.run("JSON.stringify(food.mealsByDay)"),loggedI);                            // logged meals untouched
eq(im.run("window._importSaved"),null);
// Importing again updates in place (case-insensitive name match): no duplicates, ids and extra fields kept.
const idsI=JSON.parse(JSON.stringify(im.run("food.savedMeals.map(s=>s.id)"))); im.run("food.savedMeals[0].futureKey='kept'");
const again=JSON.parse(JSON.stringify(THREE)); again.savedMeals[0].name='BREAKFAST COFFEE'; again.savedMeals[0].items[0].kcal=130;
clickI('import-saved-meals'); typeI(JSON.stringify(again)); clickI('import-check');
ok(im.el('modal').innerHTML.includes('0 new · 3 will replace'));
clickI('import-apply');
eq(im.run("[food.savedMeals.length,food.savedMeals.map(s=>s.id),food.savedMeals[0].name,food.savedMeals[0].items[0].kcal,food.savedMeals[0].futureKey]"),
  [3,idsI,'BREAKFAST COFFEE',130,'kept']);
ok(im.el('toast').textContent.includes('0 new, 3 updated'));
// A bare array, category ids, numeric strings and protein/carbs/fat aliases are accepted.
eq(im.run("parseSavedMealsImport("+JSON.stringify(JSON.stringify([{category:'dinner',items:[{name:'Soup',kcal:'150',protein:'9',carbs:12,fat:'4'}]}]))+").meals[0]").items.map(i=>[i.kcal,i.proteinG,i.carbsG,i.fatG]),[[150,9,12,4]]);
eq(im.run("parseSavedMealsImport('[{\"category\":\"dinner\",\"items\":[{\"kcal\":1}]}]').meals[0].name"),'Dinner');   // category names it
// Bad input: clear message, nothing imported (all-or-nothing).
const badCases=[
 ['',"Nothing to import"],['{not json',"valid import text"],['{"meals":[]}',"Expected a list"],['[]',"empty"],
 ['[{"name":"A","category":"Brunch","items":[{"kcal":1}]}]','unknown category'],
 ['[{"name":"A","items":[{"kcal":-5}]}]','kcal must be a number'],['[{"name":"A","items":[{"kcal":"abc"}]}]','kcal must be a number'],
 ['[{"name":"A","items":[{"kcal":20000}]}]','from 0 to 10000'],['[{"name":"A","items":[]}]','at least one item'],
 ['[{"items":[{"kcal":1}]}]','name or a category'],['[{"name":"A","items":[{"kcal":1}]},{"name":"a","items":[{"kcal":2}]}]','appears twice'],
 ['[{"name":"A","items":["x"]}]','not an item'],['[5]','not a meal'],
 [JSON.stringify(Array.from({length:51},(_,i)=>({name:'M'+i,items:[{kcal:1}]}))),'At most 50'],
 ['x'.repeat(200001),'too much text'],
 ['[{"name":"Good","items":[{"kcal":1}]},{"name":"Bad","items":[{"kcal":-1}]}]','Meal 2'],     // one bad meal blocks the good one
];
for (const [text,msg] of badCases){
  const before=im.run("JSON.stringify(food.savedMeals)");
  clickI('import-saved-meals'); typeI(text); clickI('import-check');
  ok(im.run("window._importSaved.result.errors.join(' ')").includes(msg));
  ok(im.el('modal').innerHTML.includes('Nothing will be imported'));
  ok(!im.el('modal').innerHTML.includes('import-apply'));
  clickI('import-apply');                                                        // even forced, nothing happens
  eq(im.run("JSON.stringify(food.savedMeals)"),before);
  clickI('import-cancel');
}
// Pasted text is escaped in the preview and in error messages.
clickI('import-saved-meals'); typeI('[{"name":"<img src=x onerror=alert(1)>","items":[{"name":"<b>i</b>","kcal":1}]}]'); clickI('import-check');
ok(!im.el('modal').innerHTML.includes('<img')); ok(im.el('modal').innerHTML.includes('&lt;img'));
typeI('[{"name":"A","category":"<i>x</i>","items":[{"kcal":1}]}]'); clickI('import-check');
ok(!im.el('modal').innerHTML.includes('<i>x</i>'));
// Editing the text after Check clears the preview, and Import re-checks the current text.
typeI(JSON.stringify(THREE)); clickI('import-check'); ok(im.el('modal').innerHTML.includes('import-apply'));
im.el('import-result').innerHTML='stale preview'; typeI('{broken'); eq(im.el('import-result').innerHTML,''); eq(im.run("window._importSaved.result"),null);
const beforeForced=im.run("JSON.stringify(food.savedMeals)");
clickI('import-apply'); eq(im.run("JSON.stringify(food.savedMeals)"),beforeForced);
ok(im.run("window._importSaved.result.errors[0]").includes('valid import text'));
clickI('import-cancel'); eq(im.run("window._importSaved"),null);

// --- Public site: only the app is served (netlify.toml hides everything else) ---
{
  const root=path.join(__dirname,'..');
  const toml=fs.readFileSync(path.join(root,'netlify.toml'),'utf8').replace(/\r\n/g,'\n');
  const blocks=toml.split('[[redirects]]').slice(1);
  ok(blocks.length>=13);
  for (const b of blocks){                                                           // every rule is a forced 404
    ok(/\n\s*from = "\/[^"]+"/.test(b)); ok(/\n\s*status = 404\b/.test(b)); ok(/\n\s*force = true\b/.test(b));
  }
  const hidden=new Set(blocks.map(b=>b.match(/from = "\/([^"/*]+)(\/\*)?"/)[1]));
  const APP=new Set(['index.html','sw.js','manifest.json','icon-192.png','icon-512.png']);
  const IGNORE=new Set(['.git','.netlify','.claude','node_modules']);                  // never deployed / local only
  const exposed=fs.readdirSync(root).filter(n=>!APP.has(n)&&!IGNORE.has(n)&&!hidden.has(n));
  eq(exposed,[]);                                                                    // a new top-level file or folder must be added to netlify.toml
  for (const a of APP) ok(!hidden.has(a));                                           // and the app itself is never hidden
}

// --- Admin tab ---
{
  const ad=app('2026-09-25');
  const clickA=(act,data={})=>ad.run("(()=>{const e={dataset:"+JSON.stringify({act,...data})+"};e.closest=()=>e;handleFoodClick({target:e});})()");
  // The app's version and the service worker's must match (they're bumped together).
  const swVersion=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8').match(/VERSION = '([^']+)'/)[1];
  eq(ad.run("APP_VERSION"),swVersion);
  // The header toolbar no longer carries the data buttons; the Admin tab exists.
  const toolbar=html.slice(html.indexOf('<div class="toolbar">'),html.indexOf('<div class="view-bar"'));
  for (const f of ['exportCSV()','exportBackup()','openSyncModal()',"'restore-file').click()"]) ok(!toolbar.includes(f));
  ok(toolbar.includes('id="restore-file"')); ok(toolbar.includes('id="install-btn"'));
  ok(html.includes('data-section="admin" id="admin-seg"'));
  // Switching to Admin is navigation: remembered per device, never saved or synced.
  ad.memory.set('caprica_workout_sync_key','bw-'+'0'.repeat(48));
  ad.memory.set('caprica_workout_sync_meta',JSON.stringify({syncedAt:'t1',dirty:false,lastSync:'2026-09-25T10:00:00'}));
  const blobA=ad.memory.get('caprica_workout_v2');
  ad.run("switchSection('admin')");
  eq(ad.run("viewState.section"),'admin');
  eq(ad.memory.get('caprica_workout_v2'),blobA); eq(JSON.parse(ad.memory.get('caprica_workout_sync_meta')).dirty,false);
  eq(JSON.parse(ad.memory.get('caprica_workout_v2_view')).section,'admin');
  const reopened=app('2026-09-25'); reopened.memory.set('caprica_workout_v2_view',JSON.stringify({section:'admin',foodTab:'today'})); reopened.run("loadState()");
  eq(reopened.run("viewState.section"),'admin');
  ad.run("switchSection('nonsense')"); eq(ad.run("viewState.section"),'admin');
  // The page: sync status, inbox, backup/restore, export, version.
  const page=ad.el('workout-container').innerHTML;
  for (const s of ['☁️ Sync','Sync now','Sync settings','📥 Claude inbox','💾 Backup','♻️ Restore','📥 Workout CSV','Unsynced changes on this device: <b>no</b>','App version '+swVersion,'<div class="ver">'+swVersion+' · Admin'])
    ok(page.includes(s));
  ok(page.includes('Gym</b>')===false && page.includes('your Gym workouts'));
  // Without sync: an invitation to set it up instead of status.
  const noSync=app('2026-09-25'); noSync.run("switchSection('admin')");
  ok(noSync.el('workout-container').innerHTML.includes('Set up sync')); ok(!noSync.el('workout-container').innerHTML.includes('Sync now'));
  // Sync problems show on the Admin tab label from anywhere, and on the page; details are escaped.
  ad.run("setSyncStatus('offline')"); ok(ad.el('admin-seg').textContent.includes('📴'));
  ad.run("setSyncStatus('error','<img src=x>')"); ok(ad.el('admin-seg').textContent.includes('⚠️'));
  ok(ad.el('workout-container').innerHTML.includes('Last attempt failed: &lt;img')); ok(!ad.el('workout-container').innerHTML.includes('<img src=x>'));
  ad.run("setSyncStatus('ok')"); eq(ad.el('admin-seg').textContent,'⚙️ Admin');
  ad.run("switchSection('food');setSyncStatus('conflict')"); ok(ad.el('admin-seg').textContent.includes('⚠️'));
  ok(!ad.el('workout-container').innerHTML.includes('Claude inbox'));                  // didn't redraw Admin over Food
  ad.run("switchSection('admin');setSyncStatus('ok')");
  // Unsynced changes and a stale sync are shown.
  ad.memory.set('caprica_workout_sync_meta',JSON.stringify({syncedAt:'t1',dirty:true,lastSync:'2026-09-01T10:00:00'}));
  ad.run("render()"); ok(ad.el('workout-container').innerHTML.includes('Unsynced changes on this device: <b>yes</b>'));
  ok(ad.el('workout-container').innerHTML.includes('over a week ago'));
  // Inbox card reflects waiting suggestions.
  ad.run("food.inbox={key:'ib-'+'e'.repeat(48)};inboxState.rows=[{id:'q1',days:[]},{id:'q2',days:[]}];render()");
  ok(ad.el('workout-container').innerHTML.includes('<b>2 suggestions</b> waiting')); ok(ad.el('workout-container').innerHTML.includes('data-act="inbox-review"'));
  ad.run("inboxState.rows=[]");
  // Every button reaches the same function as before.
  ad.run("window.__hit=[];syncNow=()=>window.__hit.push('sync');openSyncModal=()=>window.__hit.push('settings');exportBackup=()=>window.__hit.push('backup');exportCSV=()=>window.__hit.push('csv')");
  ad.el('restore-file').click=()=>ad.run("window.__hit.push('restore')");
  for (const a of ['admin-sync-now','admin-sync-settings','admin-backup','admin-restore','admin-csv']) clickA(a);
  eq(JSON.parse(JSON.stringify(ad.run("window.__hit"))),['sync','settings','backup','restore','csv']);
}

(async()=>{
  // --- Claude inbox: app side ---
  const ib=app('2026-09-24');
  ib.run("navigator.onLine=true;window.__calls=[];window.__rows=[];window.__fail=false;"
    +"fetch=async(u,o)=>{o=o||{};window.__calls.push({u:String(u),method:o.method||'GET',h:o.headers||{}});if(window.__fail)throw new Error('offline');"
    +"return {ok:true,status:200,json:async()=>(o.method==='DELETE'?[]:window.__rows)};}");
  await ib.run("checkInbox(true)"); eq(ib.run("window.__calls.length"),0);            // no key: no network at all
  // Setup creates a key in the synced food slice and shows it in the Sync panel.
  ib.run("setupInbox()");
  await new Promise(r=>setImmediate(r));                                            // let setup's own check finish (checks are single-flight)
  const IBK=ib.run("inboxKey()"); ok(/^ib-[0-9a-f]{48}$/.test(IBK));
  eq(JSON.parse(ib.memory.get('caprica_workout_v2')).food.inbox.key,IBK);
  ok(ib.el('modal').innerHTML.includes(IBK)); ok(ib.el('modal').innerHTML.includes('data-act="inbox-off"'));
  ok(app('2026-09-24',JSON.parse(ib.memory.get('caprica_workout_v2'))).run("inboxKey()")===IBK);   // survives reload
  // Three rows: a good day, a future-dated one, and junk.
  ib.run("window.__calls=[];window.__rows=["
    +"{id:'r1',note:'Sep 24 <img src=x>',created_at:'t',payload:{days:[{date:'2026-09-24',meals:["
    +"{category:'Breakfast',items:[{name:'Strawberries',kcal:24,grams:75},{name:'Blueberries',kcal:43,grams:75}]},"
    +"{category:'Lunch',name:'Chicken stir-fry',notes:'from batch',items:[{name:'Rice',kcal:195,proteinG:4},{name:'<b>Chicken</b>',kcal:165,proteinG:31}]}]}]}},"
    +"{id:'r2',note:'',created_at:'t',payload:{days:[{date:'2026-12-01',meals:[{category:'Dinner',items:[{kcal:1}]}]}]}},"
    +"{id:'r3',note:'',created_at:'t',payload:'junk'}]");
  await ib.run("checkInbox(true)");
  const ibc0=ib.run("window.__calls[0]");
  ok(ibc0.u.startsWith('https://sqmkjgubujrkxygsukng.supabase.co/rest/v1/food_inbox?select=')); eq(ibc0.h['X-Inbox-Key'],IBK); ok(!ibc0.u.includes(IBK));
  eq(ib.run("inboxState.rows.map(r=>[r.id,!!r.days,!!r.errors])"),[['r1',true,false],['r2',false,true],['r3',false,true]]);
  ok(ib.run("inboxState.rows[1].errors[0]").includes('future'));
  ok(ib.run("renderFood()").includes('2 meals from Claude'));
  eq(ib.run("(food.mealsByDay['2026-09-24']||[]).length"),0);                       // shown, not added
  // Review: escaped, Accept only for usable ones.
  ib.run("addMealToDay('2026-09-24',{id:'x',name:'Chicken stir-fry',category:'lunch',items:[{kcal:1}]})");
  ib.run("openInboxReview()"); const rv=ib.el('modal').innerHTML;
  ok(rv.includes('data-act="inbox-accept" data-id="r1"')); ok(!rv.includes('data-act="inbox-accept" data-id="r2"'));
  ok(rv.includes("Can't use this suggestion")); ok(!rv.includes('<img')); ok(!rv.includes('<b>Chicken')); ok(rv.includes('already logged?'));
  ok(rv.includes('Thursday, September 24')); ok(rv.includes('Breakfast</b>'));
  ib.run("food.mealsByDay['2026-09-24']=[]");
  // Accept adds the meals, records the id, persists, then deletes the row by id.
  ib.run("switchSection('food');setFoodDay(null);setFoodTab('today')");
  ok(ib.el('workout-container').innerHTML.includes('2 meals from Claude'));
  ib.run("window.__calls=[];inboxAccept('r1')");
  // ...and the screen behind the review sheet is redrawn at once (it used to stay stale until the sheet closed).
  ok(ib.el('workout-container').innerHTML.includes('427 / 2200')); ok(!ib.el('workout-container').innerHTML.includes('2 meals from Claude'));
  eq(ib.run("food.mealsByDay['2026-09-24'].map(m=>[m.name,m.category,m.addedBy,Math.round(mealMacros(m).kcal)])"),
    [['Breakfast','breakfast','claude-inbox',67],['Chicken stir-fry','lunch','claude-inbox',360]]);
  eq(ib.run("food.mealsByDay['2026-09-24'][1].notes"),'from batch');
  ok(ib.run("food.inbox.done").includes('r1'));
  ok(JSON.parse(ib.memory.get('caprica_workout_v2')).food.inbox.done.includes('r1'));
  const ibDel=ib.run("window.__calls.find(c=>c.method==='DELETE')"); ok(ibDel.u.endsWith('food_inbox?id=eq.r1')); eq(ibDel.h['X-Inbox-Key'],IBK);
  ib.run("inboxAccept('r1')"); eq(ib.run("food.mealsByDay['2026-09-24'].length"),2);  // never twice
  // If the delete failed and the server still returns r1, it stays hidden — and the delete is retried.
  ib.run("window.__calls=[]");
  await ib.run("checkInbox(true)"); ok(!ib.run("inboxState.rows.map(r=>r.id)").includes('r1'));
  const retried=ib.run("window.__calls.filter(c=>c.method==='DELETE').map(c=>c.u.split('food_inbox')[1])");
  eq(JSON.parse(JSON.stringify(retried)),['?id=eq.r1']);                              // only the already-handled row, nothing pending
  eq(ib.run("window.__calls.find(c=>c.method==='DELETE').h['X-Inbox-Key']"),IBK);
  // An unusable suggestion can't be accepted, even by calling Accept directly.
  ib.run("inboxAccept('r2')"); eq(ib.run("food.mealsByDay['2026-12-01']"),undefined); ok(ib.run("inboxState.rows.map(r=>r.id)").includes('r2'));
  // Accepted on another device (its done list arrived by sync) while still listed here: not added again.
  ib.run("inboxState.rows.push(Object.assign({id:'r9',note:''},parseInboxPayload({days:[{date:'2026-09-23',meals:[{category:'Dinner',items:[{kcal:9}]}]}]})));food.inbox.done.push('r9')");
  ib.run("inboxAccept('r9')"); eq(ib.run("food.mealsByDay['2026-09-23']"),undefined); ok(!ib.run("inboxState.rows.map(r=>r.id)").includes('r9'));
  // Reject/Dismiss adds nothing, records the id, deletes the row.
  ib.run("window.__calls=[];inboxReject('r2');inboxReject('r3')");
  eq(ib.run("food.mealsByDay['2026-12-01']"),undefined);
  ok(ib.run("food.inbox.done").includes('r2') && ib.run("food.inbox.done").includes('r3'));
  eq(ib.run("window.__calls.filter(c=>c.method==='DELETE').length"),2);
  ib.run("window.__rows=[]"); await ib.run("checkInbox(true)"); ok(!ib.run("renderFood()").includes('from Claude'));
  // Network failure and offline are silent and harmless.
  ib.run("window.__fail=true"); await ib.run("checkInbox(true)"); eq(ib.run("inboxState.busy"),false);
  ib.run("window.__fail=false;navigator.onLine=false;window.__calls=[]"); await ib.run("checkInbox(true)"); eq(ib.run("window.__calls.length"),0);
  ib.run("navigator.onLine=true");
  // Throttled to once a minute unless forced.
  ib.run("window.__calls=[]"); await ib.run("checkInbox()"); eq(ib.run("window.__calls.length"),0);
  // The done list is capped.
  ib.run("for(let i=0;i<250;i++) markInboxDone('z'+i)"); eq(ib.run("food.inbox.done.length"),200); eq(ib.run("food.inbox.done[199]"),'z249');
  // Turning off deletes pending rows (by filter, never by key in the URL) and forgets the key.
  ib.run("window.__calls=[];turnOffInbox()");
  eq(ib.run("inboxKey()"),''); const ibOff=ib.run("window.__calls[0]"); eq([ibOff.method,ibOff.u.endsWith('food_inbox?id=not.is.null'),ibOff.h['X-Inbox-Key']],['DELETE',true,IBK]);
  ok(ib.el('modal').innerHTML.includes('data-act="inbox-setup"'));
  // Payload validation.
  const pv=p=>ib.run("parseInboxPayload("+JSON.stringify(p)+")");
  const okMeal={category:'Lunch',items:[{kcal:1}]};
  for (const [p,msg] of [[{},'No days'],[{days:[{date:'2026-02-30',meals:[okMeal]}]},'YYYY-MM-DD'],[{days:[{date:'2026-09-25',meals:[okMeal]}]},'future'],
     [{days:[{date:'2026-09-24',meals:[okMeal]},{date:'2026-09-24',meals:[okMeal]}]},'twice'],[{days:Array.from({length:15},(_,i)=>({date:'2026-09-0'+((i%9)+1),meals:[okMeal]}))},'More than 14'],
     [{days:[{date:'2026-09-24',meals:[]}]},'no meals'],[{days:[{date:'2026-09-24',meals:[{category:'Lunch',items:[]}]}]},'at least one item'],
     [{days:[{date:'2026-09-24',meals:[{category:'Brunch',items:[{kcal:1}]}]}]},'unknown category'],
     [{days:[{date:'2026-09-24',meals:[{category:'Lunch',items:[{kcal:-1}]}]}]},'kcal must be a number']]){
    ok((pv(p).errors||[]).join(' ').includes(msg));
  }
  eq(pv({days:[{date:'2026-09-23',meals:[{category:'dinner',name:'x',time:'7 pm',items:[{kcal:'5'}]}]}]}).days[0].meals[0].time,'7 pm');

  // --- Claude inbox: the posting script ---
  const {pathToFileURL:p2u}=require('node:url');
  const tool=await import(p2u(path.join(__dirname,'..','tools','food-inbox.mjs')).href);
  eq(tool.readInboxKey({BILLYS_INBOX_KEY:' ib-abc123def456ghi789jkl '},'linux'),'ib-abc123def456ghi789jkl');
  eq(tool.readInboxKey({},'linux'),'');
  eq([tool.plausibleKey('ib-'+'a'.repeat(48)),tool.plausibleKey('short'),tool.plausibleKey('has space in it but long enough')],[true,false,false]);
  eq(tool.checkPayload({days:[{date:'2026-09-24',meals:[{items:[{kcal:5}]}]}]},'2026-09-24'),[]);
  ok(tool.checkPayload({days:[{date:'2026-09-25',meals:[{items:[{kcal:5}]}]}]},'2026-09-24')[0].includes('future'));
  ok(tool.checkPayload({days:[{date:'24/09',meals:[{items:[{kcal:-1}]}]}]},'2026-09-24').join(' ').includes('YYYY-MM-DD'));
  ok(tool.checkPayload({days:[{date:'2026-09-24',meals:[{items:[{kcal:'abc'}]}]}]},'2026-09-24').join(' ').includes('kcal must be a number'));
  eq(tool.checkPayload({},'x'),['payload needs a non-empty "days" array']);
  // A fake Supabase that enforces the same per-key rules as the real RLS policies.
  // `leak` switches off one rule at a time: readAny (another key can read), noKeyRead
  // (no key can read), deleteAny (another key can delete).
  function fakeSupabase(leak={}){
    const rows=[]; let n=0; const calls=[];
    return {calls, fetch: async (url,o={})=>{
      const u=new URL(url), key=(o.headers||{})['X-Inbox-Key'], m=o.method||'GET'; calls.push({url:String(url),m,h:o.headers||{},body:o.body});
      const own=r=>!!key&&r.inbox_key===key;
      let out=[];
      if(m==='POST'){ const b=JSON.parse(o.body); if(b.inbox_key!==key) return new Response('rls',{status:403}); rows.push(Object.assign({id:'id'+(++n),created_at:'t'},b)); return new Response('',{status:201}); }
      if(m==='GET') out=rows.filter(r=>own(r)||(key?leak.readAny:leak.noKeyRead));
      if(m==='DELETE'){ const id=(u.searchParams.get('id')||'').replace('eq.',''); for(let i=rows.length-1;i>=0;i--) if(rows[i].id===id&&(own(rows[i])||leak.deleteAny)) out.push(...rows.splice(i,1)); }
      return new Response(JSON.stringify(out),{status:200});
    }};
  }
  const realFetch2=global.fetch;
  try {
    const sb=fakeSupabase(); global.fetch=sb.fetch;
    const K='ib-'+'b'.repeat(48);
    await tool.post(K,{days:[{date:'2026-09-24',meals:[okMeal]}]},'note');
    const pc=sb.calls[0]; ok(pc.url.endsWith('/rest/v1/food_inbox')); ok(!pc.url.includes(K)); eq(pc.h['X-Inbox-Key'],K);
    eq(JSON.parse(pc.body).inbox_key,K); eq(JSON.parse(pc.body).note,'note');
    eq((await tool.pending(K)).length,1); eq((await tool.pending('ib-'+'c'.repeat(48))).length,0);
    ok(!sb.calls.some(c=>c.url.includes(K)));                                     // key never in a URL
    const st=await tool.selftest(); eq(st.length,5); ok(st.every(l=>l.startsWith('PASS')));
    // Each kind of leak is caught by its own check.
    for (const [leak,line] of [['readAny','another key cannot read them'],['noKeyRead','no key reads nothing'],['deleteAny','another key cannot delete them']]){
      global.fetch=fakeSupabase({[leak]:true}).fetch;
      const res=await tool.selftest();
      ok(res.some(l=>l==='FAIL  '+line));
    }
  } finally { global.fetch=realFetch2; }

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
  console.log(checks+' assertions passed: scheduling, history, travel, ramp, progression, storage, migration, rendering, food, any-day food, meal categories, goals, recipe portions, saved-meal editing, saved-meal import, Claude inbox, sync-merge, navigation, admin tab, public-site rules, photo function and photo flow.');
})().catch(e=>{console.error(e);process.exit(1);});
