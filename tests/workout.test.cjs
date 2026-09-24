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
  console.log(checks+' assertions passed: scheduling, history, travel, ramp, progression, storage, migration, rendering, food, any-day food, meal categories, goals, sync-merge, navigation and food function.');
})().catch(e=>{console.error(e);process.exit(1);});
