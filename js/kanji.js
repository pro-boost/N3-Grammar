
// ================================================================
// DATA — N3 Kanji & Vocabulary
// type: 'kanji' | 'noun' | 'verb' | 'adj' | 'adv'
// w = week (1-10), d = day (1-5)
// ================================================================
let ITEMS = [];
// ================================================================
// EXAM QUESTIONS
// ================================================================
let EXAM_QS_KANJI = [];

// ================================================================
// WEEK TITLES
// ================================================================
const KANJI_WEEK_TITLES = {1:'政治・社会',2:'制度・法律',3:'経済・産業',4:'職業・仕事',5:'変化・行動',6:'感情・心理',7:'思考・判断',8:'知識・学習',9:'交通・移動',10:'生活・健康',11:'自然・環境',12:'状態・様子',13:'人・関係',14:'言語・表現',15:'時間・順序',16:'形・位置',17:'成否・勝負',18:'義務・権利',19:'命令・依頼',20:'感覚・体',21:'動作①',22:'動作②',23:'動作③',24:'形容詞①',25:'形容詞②',26:'副詞・接続',27:'漢字復習①',28:'漢字復習②',29:'語彙復習',30:'総まとめ'};
const KANJI_DAY_NAMES=['','Mon','Tue','Wed','Thu','Fri'];
const KANJI_TYPE_COLORS={kanji:'ct-kanji',noun:'ct-noun',verb:'ct-verb',adj:'ct-adj',adv:'ct-adv'};
const KANJI_BADGE_CLASSES={kanji:'badge-kanji',noun:'badge-noun',verb:'badge-verb',adj:'badge-adj',adv:'badge-adv'};

// ================================================================
// STATE
// ================================================================
let KANJI_PROGRESS={
  knownSet:[],unsureSet:[],againSet:[],totalKnown:0,
  quizBestPct:0,gameBestStreak:0,gameTotalAnswered:0,
  badgesEarned:[],lastSaved:null
};
const KANJI_SHEET_URL='https://script.google.com/macros/s/AKfycbxBCzoirHbX6_abSEul__JLekBRIwVQagFuwQI5ordXX4_ihXfyiyyOi-pOkKuYTBqC/exec';
let kanjiSyncTimer=null, kanjiGlobalFilter='all', kanjiTypeFilter='all';

// ================================================================
// TIME HELPERS
// ================================================================
function kanjiGetStudyStart(){
  const now=new Date(); const dow=now.getDay();
  const daysToMon=dow===0?-6:1-dow;
  const mon=new Date(now); mon.setDate(now.getDate()+daysToMon); mon.setHours(0,0,0,0);
  return mon;
}
function kanjiStudyDay(){
  const start=kanjiGetStudyStart(); start.setHours(0,0,0,0);
  const now=new Date(); now.setHours(0,0,0,0);
  let day=0, cur=new Date(start);
  while(cur<=now){const dow=cur.getDay();if(dow>=1&&dow<=5)day++;if(cur.getTime()===now.getTime())break;cur.setDate(cur.getDate()+1);}
  return Math.max(1,day);
}
function kanjiStudyWeek(){return Math.ceil(kanjiStudyDay()/5);}
// gDayIdx is defined in app.js and shared
function kanjiIsUnlocked(g){return gDayIdx(g)<=kanjiStudyDay();}
function kanjiIsToday(g){return gDayIdx(g)===kanjiStudyDay();}
function kanjiIsThisWeek(g){return g.w===kanjiStudyWeek();}
function kanjiIsThisMonth(g){const d=gDayIdx(g);return d<=kanjiStudyDay()+20&&d>=Math.max(1,kanjiStudyDay()-15);}

function kanjiApplyFilter(pool){
  let p=pool;
  if(kanjiTypeFilter==='kanji') p=p.filter(g=>g.type==='kanji');
  else if(kanjiTypeFilter==='vocab') p=p.filter(g=>g.type!=='kanji');
  switch(kanjiGlobalFilter){
    case 'today': return p.filter(g=>kanjiIsToday(g));
    case 'week': return p.filter(g=>kanjiIsThisWeek(g));
    case 'month': return p.filter(g=>kanjiIsThisMonth(g));
    case 'reached': return p.filter(g=>kanjiIsUnlocked(g));
    case 'srs_review': return p.filter(g=>KANJI_PROGRESS.unsureSet.includes(g.id)||KANJI_PROGRESS.againSet.includes(g.id));
    default: return p;
  }
}

// ================================================================
// NAVIGATION
// ================================================================
// ================================================================
// SCHEDULE
// ================================================================
function renderKanjiSchedule(){
  const grid=document.getElementById('sched-grid'); grid.innerHTML='';
  const today=kanjiStudyDay();
  // Hero stats are set by renderKanjiPage, no need to set them here

  for(let w=1;w<=30;w++){
    const wStart=(w-1)*5+1, wEnd=w*5;
    const wDone=wEnd<today, wCurrent=w===kanjiStudyWeek(), wLocked=wStart>today;
    const block=document.createElement('div'); block.className='week-block';
    let badge=wDone?'<span class="wb-status wbs-done">✓</span>':wCurrent?`<span class="wb-status wbs-current">Now</span>`:wLocked?'<span class="wb-status wbs-locked">Locked</span>':'';
    block.innerHTML=`<div class="wb-header"><span class="wb-num">${String(w).padStart(2,'0')}</span><span class="wb-title">${KANJI_WEEK_TITLES[w]}</span>${badge}</div><div class="day-list" id="dl-w${w}"></div>`;
    grid.appendChild(block);
    const dl=block.querySelector('.day-list');
    for(let d=1;d<=5;d++){
      const pts=ITEMS.filter(g=>g.w===w&&g.d===d);
      if(!pts.length)continue;
      const di=gDayIdx(pts[0]);
      const locked=di>today, isT=di===today, done=di<today;
      const mastered=pts.filter(g=>KANJI_PROGRESS.knownSet.includes(g.id)).length;
      const row=document.createElement('div');
      row.className='day-row'+(locked?' locked':'')+(isT?' today':'')+(done?' done':'');
      const ptLabels=pts.map(g=>`<span class="type-dot ${g.type==='kanji'?'k':'v'}"></span>${g.main}`).join('、');
      row.innerHTML=`<span class="day-lbl">${KANJI_DAY_NAMES[d]}</span><span class="day-pts">${ptLabels}</span><span class="day-badge-icon">${locked?'':done?mastered+'/'+pts.length:isT?'':''}</span>`;
      if(!locked) row.onclick=()=>{ window.globalFilter='day';window.filterDay={w,d};showPage('lessons',null,true); };
      dl.appendChild(row);
    }
  }
}



// ================================================================
// LESSON RENDERER
// ================================================================
function typeLabel(t){return{kanji:'漢字 Kanji',noun:'名詞 Noun',verb:'動詞 Verb',adj:'形容詞 Adjective',adv:'副詞 Adverb'}[t]||t;}
function typeBadgeClass(t){return KANJI_BADGE_CLASSES[t]||'badge-noun';}

// Parse '政治 (せいじ) / 政府 (せいふ)' -> [{word,reading}]
function parseWords(str){
  if(!str)return[];
  return str.split('/').map(w=>{
    const m=w.trim().match(/^(.+?)\s*[（(]([^)）]+)[)）]/);
    return m?{word:m[1].trim(),reading:m[2].trim()}:{word:w.trim(),reading:''};
  }).filter(x=>x.word&&x.word.length>0);
}

// Split 'セイ・ショウ/まつりごと' -> {on:['セイ','ショウ'], kun:['まつりごと']}
function splitReadings(r){
  const parts=r.split('/');
  const clean=s=>s.split('・').map(x=>x.replace(/[.．]/g,'').trim()).filter(Boolean);
  return{on:parts[0]?clean(parts[0]):[],kun:parts[1]?clean(parts[1]):[]};
}

// Generate a contextual sentence for a word+reading
function makeSentence(word,reading,meaning){
  const w=reading?`<ruby>${word}<rt>${reading}</rt></ruby>`:word;
  const m=meaning.toLowerCase();
  let jp,en;
  if(m.includes('politic')||m.includes('government'))
    {jp=`${w}に<ruby>興味<rt>きょうみ</rt></ruby>がありますか。`;en=`Are you interested in ${meaning}?`;}
  else if(m.includes('society')||m.includes('community'))
    {jp=`${w}の<ruby>問題<rt>もんだい</rt></ruby>を<ruby>考<rt>かんが</rt></ruby>えます。`;en=`I think about ${meaning} issues.`;}
  else if(m.includes('law')||m.includes('rule')||m.includes('regulation'))
    {jp=`${w}を<ruby>守<rt>まも</rt></ruby>ることが<ruby>大切<rt>たいせつ</rt></ruby>です。`;en=`It is important to follow the ${meaning}.`;}
  else if(m.includes('respon')||m.includes('duty')||m.includes('obligat'))
    {jp=`<ruby>自分<rt>じぶん</rt></ruby>の${w}を<ruby>果<rt>は</rt></ruby>たします。`;en=`I fulfil my ${meaning}.`;}
  else if(m.includes('econ')||m.includes('financ'))
    {jp=`<ruby>日本<rt>にほん</rt></ruby>の${w}は<ruby>成長<rt>せいちょう</rt></ruby>しています。`;en=`Japan's ${meaning} is growing.`;}
  else if(m.includes('health'))
    {jp=`${w}のために<ruby>毎日<rt>まいにち</rt></ruby><ruby>運動<rt>うんどう</rt></ruby>します。`;en=`I exercise every day for my ${meaning}.`;}
  else if(m.includes('daily life')||m.includes('livelihood'))
    {jp=`<ruby>日本<rt>にほん</rt></ruby>での${w}に<ruby>慣<rt>な</rt></ruby>れました。`;en=`I got used to ${meaning} in Japan.`;}
  else if(m.includes('feel')||m.includes('emotion')||m.includes('mood'))
    {jp=`<ruby>自分<rt>じぶん</rt></ruby>の${w}を<ruby>伝<rt>つた</rt></ruby>えるのが<ruby>難<rt>むずか</rt></ruby>しい。`;en=`It is hard to express my ${meaning}s.`;}
  else if(m.includes('effort')||m.includes('endeav'))
    {jp=`<ruby>毎日<rt>まいにち</rt></ruby>${w}を<ruby>続<rt>つづ</rt></ruby>けています。`;en=`I keep up my ${meaning} every day.`;}
  else if(m.includes('hope')||m.includes('wish')||m.includes('desire'))
    {jp=`<ruby>将来<rt>しょうらい</rt></ruby>の${w}は<ruby>医者<rt>いしゃ</rt></ruby>になることです。`;en=`My ${meaning} for the future is to become a doctor.`;}
  else if(m.includes('danger')||m.includes('risk')||m.includes('peril'))
    {jp=`${w}なので<ruby>気<rt>き</rt></ruby>をつけてください。`;en=`Please be careful, it is ${meaning}.`;}
  else if(m.includes('safe')||m.includes('secur'))
    {jp=`この<ruby>地域<rt>ちいき</rt></ruby>は${w}です。`;en=`This area is ${meaning}.`;}
  else if(m.includes('success'))
    {jp=`<ruby>試験<rt>しけん</rt></ruby>に${w}しました！`;en=`I succeeded in the exam!`;}
  else if(m.includes('fail')||m.includes('mistake'))
    {jp=`<ruby>今回<rt>こんかい</rt></ruby>は${w}してしまいました。`;en=`I made a ${meaning} this time.`;}
  else if(m.includes('change')||m.includes('transform'))
    {jp=`<ruby>状況<rt>じょうきょう</rt></ruby>が<ruby>大<rt>おお</rt></ruby>きく${w}しました。`;en=`The situation changed greatly.`;}
  else if(m.includes('increas'))
    {jp=`<ruby>人口<rt>じんこう</rt></ruby>が${w}しています。`;en=`The population is increasing.`;}
  else if(m.includes('decreas')||m.includes('reduc'))
    {jp=`<ruby>費用<rt>ひよう</rt></ruby>が${w}しました。`;en=`The cost decreased.`;}
  else if(m.includes('gather')||m.includes('collect'))
    {jp=`<ruby>情報<rt>じょうほう</rt></ruby>を${w}ます。`;en=`I gather information.`;}
  else if(m.includes('explain')||m.includes('descript'))
    {jp=`<ruby>先生<rt>せんせい</rt></ruby>が${w}してくれました。`;en=`The teacher gave a ${meaning}.`;}
  else if(m.includes('underst')||m.includes('compreh'))
    {jp=`やっとこの<ruby>文法<rt>ぶんぽう</rt></ruby>を${w}しました。`;en=`I finally understood this grammar.`;}
  else if(m.includes('research')||m.includes('study')||m.includes('investig'))
    {jp=`<ruby>新<rt>あたら</rt></ruby>しいテーマを${w}しています。`;en=`I am conducting ${meaning} on a new topic.`;}
  else if(m.includes('convenient')||m.includes('handy'))
    {jp=`このアプリはとても${w}です。`;en=`This app is very ${meaning}.`;}
  else if(m.includes('important')||m.includes('significant'))
    {jp=`これは${w}な<ruby>問題<rt>もんだい</rt></ruby>です。`;en=`This is an ${meaning} issue.`;}
  else if(m.includes('necessary')||m.includes('essential'))
    {jp=`パスポートが${w}です。`;en=`A passport is ${meaning}.`;}
  else if(m.includes('various')||m.includes('diverse'))
    {jp=`${w}な<ruby>意見<rt>いけん</rt></ruby>を<ruby>聞<rt>き</rt></ruby>きました。`;en=`I heard ${meaning} opinions.`;}
  else if(m.includes('special')||m.includes('particul'))
    {jp=`これは${w}な<ruby>機会<rt>きかい</rt></ruby>です。`;en=`This is a ${meaning} opportunity.`;}
  else if(m.includes('sudden')||m.includes('abrupt'))
    {jp=`${w}の<ruby>雨<rt>あめ</rt></ruby>が<ruby>降<rt>ふ</rt></ruby>ってきた。`;en=`Rain fell ${meaning}ly.`;}
  else if(m.includes('gradual'))
    {jp=`<ruby>日本語<rt>にほんご</rt></ruby>が${w}<ruby>上手<rt>じょうず</rt></ruby>になってきた。`;en=`My Japanese is ${meaning}ly improving.`;}
  else if(m.includes('of course')||m.includes('certain'))
    {jp=`${w}、<ruby>行<rt>い</rt></ruby>きます！`;en=`${meaning.charAt(0).toUpperCase()+meaning.slice(1)}, I'll go!`;}
  else if(m.includes('already'))
    {jp=`<ruby>宿題<rt>しゅくだい</rt></ruby>は${w}<ruby>終<rt>お</rt></ruby>わりました。`;en=`Homework is ${meaning} finished.`;}
  else if(m.includes('however')||m.includes('nevertheless'))
    {jp=`<ruby>難<rt>むずか</rt></ruby>しい。${w}、<ruby>諦<rt>あきら</rt></ruby>めません。`;en=`It's difficult. ${meaning.charAt(0).toUpperCase()+meaning.slice(1)}, I won't give up.`;}
  else if(m.includes('furthermore')||m.includes('addition'))
    {jp=`${w}、もっと<ruby>練習<rt>れんしゅう</rt></ruby>が<ruby>必要<rt>ひつよう</rt></ruby>です。`;en=`${meaning.charAt(0).toUpperCase()+meaning.slice(1)}, more practice is needed.`;}
  else if(m.includes('in other words')||m.includes('that is'))
    {jp=`${w}、やめるということです。`;en=`${meaning.charAt(0).toUpperCase()+meaning.slice(1)}, it means to stop.`;}
  else if(m.includes('rarely')||m.includes('seldom'))
    {jp=`<ruby>彼<rt>かれ</rt></ruby>は${w}遅刻します。`;en=`He ${meaning} comes late.`;}
  else if(m.includes('work')||m.includes('labor'))
    {jp=`<ruby>毎日<rt>まいにち</rt></ruby>よく${w}きます。`;en=`I work hard every day.`;}
  else if(m.includes('buy')||m.includes('purchas'))
    {jp=`スーパーで<ruby>食料<rt>しょくりょう</rt></ruby>を${w}いました。`;en=`I bought groceries at the supermarket.`;}
  else if(m.includes('drink'))
    {jp=`<ruby>毎日<rt>まいにち</rt></ruby><ruby>水<rt>みず</rt></ruby>をたくさん${w}みます。`;en=`I drink a lot of water every day.`;}
  else if(m.includes('eat'))
    {jp=`<ruby>毎朝<rt>まいあさ</rt></ruby><ruby>朝食<rt>ちょうしょく</rt></ruby>を${w}べます。`;en=`I eat breakfast every morning.`;}
  else if(m.includes('run'))
    {jp=`<ruby>公園<rt>こうえん</rt></ruby>を${w}りました。`;en=`I ran through the park.`;}
  else if(m.includes('walk'))
    {jp=`<ruby>駅<rt>えき</rt></ruby>まで${w}きます。`;en=`I walk to the station.`;}
  else if(m.includes('ride')||m.includes('board'))
    {jp=`<ruby>電車<rt>でんしゃ</rt></ruby>に${w}ります。`;en=`I ride the train.`;}
  else if(m.includes('return')||m.includes('go back'))
    {jp=`<ruby>本<rt>ほん</rt></ruby>を<ruby>図書館<rt>としょかん</rt></ruby>に${w}しました。`;en=`I returned the book to the library.`;}
  else if(m.includes('send'))
    {jp=`<ruby>友達<rt>ともだち</rt></ruby>にメールを${w}りました。`;en=`I sent an email to my friend.`;}
  else if(m.includes('receive')||m.includes('accept'))
    {jp=`<ruby>賞<rt>しょう</rt></ruby>を${w}けました。`;en=`I received an award.`;}
  else if(m.includes('protect')||m.includes('defend'))
    {jp=`<ruby>環境<rt>かんきょう</rt></ruby>を${w}ることが<ruby>大切<rt>たいせつ</rt></ruby>です。`;en=`It is important to ${meaning} the environment.`;}
  else if(m.includes('teach'))
    {jp=`<ruby>子供<rt>こども</rt></ruby>たちに<ruby>数学<rt>すうがく</rt></ruby>を${w}えます。`;en=`I teach mathematics to children.`;}
  else if(m.includes('speak')||m.includes('talk')||m.includes('say'))
    {jp=`<ruby>日本語<rt>にほんご</rt></ruby>で${w}します。`;en=`I speak in Japanese.`;}
  else if(m.includes('listen')||m.includes('hear'))
    {jp=`<ruby>先生<rt>せんせい</rt></ruby>の<ruby>話<rt>はなし</rt></ruby>をよく${w}きます。`;en=`I listen carefully to my teacher.`;}
  else if(m.includes('read'))
    {jp=`<ruby>毎日<rt>まいにち</rt></ruby><ruby>本<rt>ほん</rt></ruby>を${w}みます。`;en=`I read books every day.`;}
  else if(m.includes('write'))
    {jp=`<ruby>日記<rt>にっき</rt></ruby>を${w}きます。`;en=`I write in my diary.`;}
  else if(m.includes('choose')||m.includes('select')||m.includes('elect'))
    {jp=`<ruby>正<rt>ただ</rt></ruby>しい<ruby>答<rt>こた</rt></ruby>えを${w}んでください。`;en=`Please choose the correct answer.`;}
  else if(m.includes('win')||m.includes('victor'))
    {jp=`<ruby>試合<rt>しあい</rt></ruby>に${w}ちました！`;en=`We won the match!`;}
  else if(m.includes('lose')||m.includes('defeat'))
    {jp=`<ruby>試合<rt>しあい</rt></ruby>に${w}けてしまいました。`;en=`We lost the match.`;}
  else if(m.includes('stop')||m.includes('halt'))
    {jp=`<ruby>電車<rt>でんしゃ</rt></ruby>が${w}まりました。`;en=`The train stopped.`;}
  else if(m.includes('begin')||m.includes('start'))
    {jp=`<ruby>授業<rt>じゅぎょう</rt></ruby>が${w}まります。`;en=`The class is starting.`;}
  else if(m.includes('end')||m.includes('finish')||m.includes('complet'))
    {jp=`<ruby>宿題<rt>しゅくだい</rt></ruby>が${w}わりました。`;en=`The homework is finished.`;}
  else if(m.includes('continue'))
    {jp=`<ruby>毎日<rt>まいにち</rt></ruby><ruby>勉強<rt>べんきょう</rt></ruby>を${w}けています。`;en=`I continue studying every day.`;}
  else if(m.includes('open')||m.includes('develop'))
    {jp=`ドアを${w}けてください。`;en=`Please open the door.`;}
  else if(m.includes('close')||m.includes('shut'))
    {jp=`<ruby>窓<rt>まど</rt></ruby>を${w}めました。`;en=`I closed the window.`;}
  else if(m.includes('build')||m.includes('construct'))
    {jp=`<ruby>新<rt>あたら</rt></ruby>しい<ruby>建物<rt>たてもの</rt></ruby>を${w}てました。`;en=`I built a new building.`;}
  else if(m.includes('break')||m.includes('destroy'))
    {jp=`<ruby>コップ<rt></rt></ruby>が${w}れました。`;en=`The cup broke.`;}
  else if(m.includes('advance')||m.includes('progress'))
    {jp=`<ruby>計画<rt>けいかく</rt></ruby>が<ruby>順調<rt>じゅんちょう</rt></ruby>に${w}んでいます。`;en=`The plan is progressing smoothly.`;}
  else if(m.includes('fall')||m.includes('drop'))
    {jp=`<ruby>葉<rt>は</rt></ruby>が${w}ちています。`;en=`Leaves are falling.`;}
  else if(m.includes('float')||m.includes('rise'))
    {jp=`<ruby>雲<rt>くも</rt></ruby>が<ruby>空<rt>そら</rt></ruby>に${w}んでいます。`;en=`Clouds are floating in the sky.`;}
  else if(m.includes('burn')||m.includes('fire'))
    {jp=`キャンプファイヤーが${w}えています。`;en=`The campfire is burning.`;}
  else if(m.includes('surprise')||m.includes('astonish'))
    {jp=`<ruby>突然<rt>とつぜん</rt></ruby>のことに${w}きました。`;en=`I was surprised by the sudden event.`;}
  else if(m.includes('worry')||m.includes('trouble'))
    {jp=`<ruby>将来<rt>しょうらい</rt></ruby>のことで${w}んでいます。`;en=`I am worried about the future.`;}
  else if(m.includes('glad')||m.includes('rejoice')||m.includes('delight'))
    {jp=`<ruby>合格<rt>ごうかく</rt></ruby>できて${w}びました！`;en=`I was delighted to pass!`;}
  else if(m.includes('sad')||m.includes('grief')||m.includes('sorrow'))
    {jp=`<ruby>別<rt>わか</rt></ruby>れがとても${w}しかったです。`;en=`The farewell was very sad.`;}
  else if(m.includes('angry')||m.includes('rage'))
    {jp=`<ruby>彼<rt>かれ</rt></ruby>は<ruby>遅刻<rt>ちこく</rt></ruby>して${w}られました。`;en=`He was scolded for being late.`;}
  else if(m.includes('laugh')||m.includes('smile'))
    {jp=`<ruby>映画<rt>えいが</rt></ruby>を<ruby>見<rt>み</rt></ruby>て${w}いました。`;en=`I was laughing watching the movie.`;}
  else if(m.includes('cry')||m.includes('weep'))
    {jp=`<ruby>悲<rt>かな</rt></ruby>しくて${w}きました。`;en=`I was so sad that I cried.`;}
  else if(m.includes('pain')||m.includes('ache'))
    {jp=`<ruby>頭<rt>あたま</rt></ruby>が${w}いです。`;en=`My head hurts.`;}
  else if(m.includes('cold')&&m.includes('weather'))
    {jp=`<ruby>今日<rt>きょう</rt></ruby>は${w}いですね。`;en=`It is cold today, isn't it.`;}
  else if(m.includes('warm'))
    {jp=`<ruby>今日<rt>きょう</rt></ruby>は<ruby>天気<rt>てんき</rt></ruby>が<ruby>良<rt>よ</rt></ruby>くて${w}かいです。`;en=`The weather is nice and warm today.`;}
  else if(m.includes('hot')||m.includes('heat'))
    {jp=`<ruby>夏<rt>なつ</rt></ruby>はとても${w}いです。`;en=`Summer is very hot.`;}
  else if(m.includes('difficult')||m.includes('hard'))
    {jp=`この<ruby>問題<rt>もんだい</rt></ruby>は${w}しいです。`;en=`This problem is difficult.`;}
  else if(m.includes('easy')||m.includes('simple'))
    {jp=`この<ruby>問題<rt>もんだい</rt></ruby>は${w}しいです。`;en=`This problem is easy.`;}
  else if(m.includes('deep'))
    {jp=`この<ruby>湖<rt>みずうみ</rt></ruby>はとても${w}い。`;en=`This lake is very deep.`;}
  else if(m.includes('beautiful'))
    {jp=`<ruby>富士山<rt>ふじさん</rt></ruby>はとても${w}しいです。`;en=`Mt. Fuji is very beautiful.`;}
  else if(m.includes('young'))
    {jp=`${w}いころからよく<ruby>勉強<rt>べんきょう</rt></ruby>していました。`;en=`I studied hard from a young age.`;}
  else if(m.includes('old')||m.includes('aged'))
    {jp=`${w}人の<ruby>話<rt>はなし</rt></ruby>をよく<ruby>聞<rt>き</rt></ruby>きましょう。`;en=`Let's listen well to elderly people.`;}
  else if(m.includes('quiet')||m.includes('calm'))
    {jp=`<ruby>図書館<rt>としょかん</rt></ruby>の<ruby>中<rt>なか</rt></ruby>は${w}かです。`;en=`Inside the library it is quiet.`;}
  else if(m.includes('busy'))
    {jp=`<ruby>試験前<rt>しけんまえ</rt></ruby>はいつも${w}しいです。`;en=`I'm always busy before exams.`;}
  else if(m.includes('kind')||m.includes('gentle'))
    {jp=`<ruby>先生<rt>せんせい</rt></ruby>はとても${w}です。`;en=`The teacher is very kind.`;}
  else if(m.includes('strict')||m.includes('severe'))
    {jp=`<ruby>父<rt>ちち</rt></ruby>はとても${w}いです。`;en=`My father is very strict.`;}
  else if(m.includes('polite'))
    {jp=`${w}に<ruby>話<rt>はな</rt></ruby>してください。`;en=`Please speak politely.`;}
  else if(m.includes('rich')||m.includes('abundan'))
    {jp=`この<ruby>地域<rt>ちいき</rt></ruby>は<ruby>自然<rt>しぜん</rt></ruby>が${w}かです。`;en=`This region is rich in nature.`;}
  else if(m.includes('poor')||m.includes('impover'))
    {jp=`<ruby>昔<rt>むかし</rt></ruby>は${w}しかったです。`;en=`In the past I was poor.`;}
  else if(m.includes('complex')||m.includes('complic'))
    {jp=`この<ruby>文法<rt>ぶんぽう</rt></ruby>は${w}です。`;en=`This grammar is complex.`;}
  else if(m.includes('ordinary')||m.includes('normal')||m.includes('usual'))
    {jp=`${w}の<ruby>日<rt>ひ</rt></ruby>でした。`;en=`It was an ordinary day.`;}
  else if(m.includes('accurate')||m.includes('precise'))
    {jp=`${w}な<ruby>情報<rt>じょうほう</rt></ruby>が<ruby>必要<rt>ひつよう</rt></ruby>です。`;en=`Accurate information is necessary.`;}
  else{
    jp=`${w}は<ruby>大切<rt>たいせつ</rt></ruby>な<ruby>言葉<rt>ことば</rt></ruby>です。`;
    en=`"${word}" (${meaning}) is an important word.`;
  }
  return{jp,en};
}

function renderKanjiLesson(container,pts){
  if(!pts||!pts.length){
    container.innerHTML='<div class="locked-overlay"><div class="locked-title">No lessons</div></div>';
    return;
  }
  const PAGE_SIZE=20;
  let shown=0;

  function renderBatch(){
    const batch=pts.slice(shown,shown+PAGE_SIZE);
    let html='';
    batch.forEach(g=>{
      const mastered=KANJI_PROGRESS.knownSet.includes(g.id);
      const unsure=KANJI_PROGRESS.unsureSet.includes(g.id);
      const statusBadge=mastered
        ?'<span style="font-size:10px;padding:2px 8px;border-radius:100px;background:#4caf82;color:#fff;font-family:\'DM Mono\',monospace;display:inline-block;margin-top:6px">✓ mastered</span>'
        :unsure
        ?'<span style="font-size:10px;padding:2px 8px;border-radius:100px;background:var(--gold-l);color:var(--gold);font-family:\'DM Mono\',monospace;display:inline-block;margin-top:6px">〜 review</span>'
        :'';
      const headerEl=g.type==='kanji'
        ?`<div class="lesson-kanji">${g.main}</div>`
        :`<div class="lesson-vocab"><ruby>${g.main}<rt style="font-size:0.42em;color:rgba(245,240,232,0.55);font-family:'DM Mono',monospace">${g.reading}</rt></ruby></div>`;

      html+=`<div class="lesson-card">
        <div class="lesson-header">
          <div>
            ${headerEl}
            <div class="lesson-reading">${g.reading}</div>
            <span class="lesson-type-badge ${typeBadgeClass(g.type)}">${typeLabel(g.type)}</span>
            ${statusBadge}
          </div>
          <div class="lesson-meaning-big">${g.meaning}</div>
        </div>`;

      if(g.type==='kanji'){
        const {on,kun}=splitReadings(g.reading);
        if(on.length||kun.length){
          html+=`<div class="lesson-readings-row">`;
          if(on.length) html+=`<span style="margin-right:12px"><strong>ON: </strong>${on.map(r=>`<span style="font-family:'DM Mono',monospace;font-size:12px;background:var(--purple-l);color:var(--purple);padding:2px 8px;border-radius:4px;margin:0 2px">${r}</span>`).join('')}</span>`;
          if(kun.length) html+=`<span><strong>KUN: </strong>${kun.map(r=>`<span style="font-family:'Shippori Mincho',serif;font-size:12px;background:var(--blue-l);color:var(--blue);padding:2px 8px;border-radius:4px;margin:0 2px">${r}</span>`).join('')}</span>`;
          html+=`</div>`;
        }
      }

      const wordList=parseWords(g.words);
      if(wordList.length>0){
        html+=`<div class="lesson-examples">
          <div style="font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:rgba(26,23,20,0.35);margin-bottom:.7rem">Kanji words — reading in context</div>`;
        wordList.forEach(({word,reading})=>{
          const {jp,en}=makeSentence(word,reading,g.meaning);
          html+=`<div class="ex-block">
            <div style="display:flex;align-items:center;margin-bottom:.55rem">
              <span style="font-family:'Shippori Mincho',serif;font-size:22px;font-weight:600"><ruby>${word}<rt style="font-size:0.48em;color:rgba(26,23,20,0.5)">${reading}</rt></ruby></span>
            </div>
            <div class="ex-jp">${jp}</div>
            <div class="ex-en">${en}</div>
          </div>`;
        });
        html+=`</div>`;
      } else {
        const {jp,en}=makeSentence(g.main,g.reading,g.meaning);
        html+=`<div class="lesson-examples">
          <div style="font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:rgba(26,23,20,0.35);margin-bottom:.7rem">Example sentence</div>
          <div class="ex-block">
            <div style="display:flex;align-items:center;margin-bottom:.55rem">
              <span style="font-family:'Shippori Mincho',serif;font-size:22px;font-weight:600"><ruby>${g.main}<rt style="font-size:0.48em;color:rgba(26,23,20,0.5)">${g.reading}</rt></ruby></span>
            </div>
            <div class="ex-jp">${jp}</div>
            <div class="ex-en">${en}</div>
          </div>
        </div>`;
      }
      html+=`</div>`;
    });
    shown+=batch.length;

    if(shown===batch.length){
      container.innerHTML=html;
    } else {
      const oldBtn=container.querySelector('#kanji-load-more');
      if(oldBtn) oldBtn.remove();
      container.insertAdjacentHTML('beforeend',html);
    }

    if(shown<pts.length){
      const loadBtn=document.createElement('button');
      loadBtn.id='kanji-load-more';
      loadBtn.className='btn-primary';
      loadBtn.style.cssText='display:block;margin:1.5rem auto;padding:12px 32px';
      loadBtn.textContent=`Load more (${pts.length-shown} remaining)`;
      loadBtn.onclick=renderBatch;
      container.appendChild(loadBtn);
    }
  }
  renderBatch();
}

// ================================================================
// FLASHCARDS / SRS
// ================================================================
function renderKanjiFC(container,pool){
  if(!pool||!pool.length){
    container.innerHTML='<div class="locked-overlay"><span class="locked-icon">🔒</span><div class="locked-title">No content available</div><div class="locked-sub">Change the filter or unlock more days.</div></div>';
    return;
  }
  const again=pool.filter(g=>KANJI_PROGRESS.againSet.includes(g.id));
  const unsure=pool.filter(g=>KANJI_PROGRESS.unsureSet.includes(g.id)&&!KANJI_PROGRESS.againSet.includes(g.id));
  const fresh=pool.filter(g=>!KANJI_PROGRESS.knownSet.includes(g.id)&&!KANJI_PROGRESS.unsureSet.includes(g.id)&&!KANJI_PROGRESS.againSet.includes(g.id));
  const known=pool.filter(g=>KANJI_PROGRESS.knownSet.includes(g.id));
  const deck=shuffle([...again,...unsure,...fresh,...known]).slice(0,20);
  let idx=0,know=0,unsureC=0,againC=0;
  const unsureBuf=[];

  function getCard(){
    if(unsureBuf.length&&idx>0&&idx%5===0)return unsureBuf.shift();
    return idx<deck.length?deck[idx++]:null;
  }

  function render(){
    const c=getCard();
    if(!c){
      container.innerHTML=`<div style="text-align:center;padding:2rem">
        <div style="font-family:'Shippori Mincho',serif;font-size:26px;font-weight:700;margin-bottom:.5rem">完了！</div>
        <div style="font-size:13px;color:rgba(26,23,20,0.48);margin-bottom:1.25rem">✓ ${know} &nbsp; 〜 ${unsureC} &nbsp; ↺ ${againC}</div>
        <button class="btn-primary" id="fc-restart">Restart</button></div>`;
      container.querySelector('#fc-restart').onclick=()=>renderKanjiFC(container,pool);
      return;
    }
    const tag=KANJI_PROGRESS.knownSet.includes(c.id)?'k':KANJI_PROGRESS.unsureSet.includes(c.id)?'u':'';
    const total=deck.length; const cur=Math.min(idx,total);

    // Build back content — examples
    const exHtml=c.examples.slice(0,3).map((ex,ei)=>{
      const furi=ex.jp||'';
      const eng=ex.en||'';
      return `<div style="margin-bottom:${ei<2?'.6rem':'0'};padding-bottom:${ei<2?'.6rem':'0'};${ei<2?'border-bottom:1px solid rgba(26,23,20,0.07)':''}">
        <span style="font-family:'Shippori Mincho',serif;font-size:14px;line-height:2.3;color:var(--ink)">${furi}</span>
        <span style="font-size:11px;font-style:italic;color:rgba(26,23,20,0.48);margin-left:6px">${eng}</span>
      </div>`;
    }).join('');

    container.innerHTML=`
      <div class="prog-row">
        <span class="prog-counter">${cur}/${total}</span>
        <div class="prog-track"><div class="prog-fill" style="width:${Math.round(cur/total*100)}%"></div></div>
        <span class="srs-sc k">✓ ${know}</span>
        <span class="srs-sc u">〜 ${unsureC}</span>
        <span class="srs-sc a">↺ ${againC}</span>
      </div>
      <div class="card-scene" onclick="this.classList.toggle('flipped')">
        <div class="card-3d">
          <!-- FRONT -->
          <div class="card-front card-side">
            <div class="card-glyph">${c.main}</div>
            <div class="card-romaji">${c.reading}</div>
            <div class="card-tap">tap to reveal</div>
            ${tag?`<span class="srs-tag ${tag}">${tag==='k'?'mastered':'unsure'}</span>`:''}
          </div>
          <!-- BACK -->
          <div class="card-back card-side">
            <div style="font-size:10px;font-weight:500;color:rgba(26,23,20,0.28);letter-spacing:.1em;text-transform:uppercase;margin-bottom:.5rem">Meaning</div>
            <div style="font-family:'Shippori Mincho',serif;font-size:17px;font-weight:600;color:var(--ink);margin-bottom:.75rem;padding-bottom:.6rem;border-bottom:1px solid var(--border)">${c.meaning}</div>
            ${exHtml}
          </div>
        </div>
      </div>
      <button class="btn-flip-fc" onclick="const scene = this.previousElementSibling; if(scene.classList.contains('card-scene')) scene.classList.toggle('flipped')">Flip — show meaning & examples</button>
      <div class="srs-actions">
        <button class="btn-srs btn-again" id="srs-a">↺ Again</button>
        <button class="btn-srs btn-unsure" id="srs-u">〜 Not Sure</button>
        <button class="btn-srs btn-know" id="srs-k">✓ Know it</button>
      </div>`;

    container.querySelector('#srs-a').onclick=()=>act('again');
    container.querySelector('#srs-u').onclick=()=>act('unsure');
    container.querySelector('#srs-k').onclick=()=>act('know');

    function act(r){
      if(r==='know'){know++;if(!KANJI_PROGRESS.knownSet.includes(c.id)){KANJI_PROGRESS.knownSet.push(c.id);}KANJI_PROGRESS.unsureSet=KANJI_PROGRESS.unsureSet.filter(k=>k!==c.id);KANJI_PROGRESS.againSet=KANJI_PROGRESS.againSet.filter(k=>k!==c.id);}
      else if(r==='unsure'){unsureC++;if(!KANJI_PROGRESS.unsureSet.includes(c.id))KANJI_PROGRESS.unsureSet.push(c.id);KANJI_PROGRESS.againSet=KANJI_PROGRESS.againSet.filter(k=>k!==c.id);KANJI_PROGRESS.knownSet=KANJI_PROGRESS.knownSet.filter(k=>k!==c.id);unsureBuf.push(c);}
      else{againC++;if(!KANJI_PROGRESS.againSet.includes(c.id))KANJI_PROGRESS.againSet.push(c.id);KANJI_PROGRESS.knownSet=KANJI_PROGRESS.knownSet.filter(k=>k!==c.id);deck.splice(Math.min(idx+2,deck.length),0,c);}
      KANJI_PROGRESS.totalKnown=KANJI_PROGRESS.knownSet.length;
      const hEl=document.getElementById('h-stat-1');if(hEl)hEl.textContent=KANJI_PROGRESS.totalKnown;
      scheduleSave(); render();
    }
  }
  render();
}

// ================================================================
// QUIZ
// ================================================================
function renderKanjiQuiz(container,pool){
  if(!pool||pool.length<4){
    container.innerHTML='<div class="locked-overlay"><div class="locked-title">Not enough content</div><div class="locked-sub">Need at least 4 items. Change filter.</div></div>';
    return;
  }
  let score=0,wrong=0,qi=0,answered=false;
  const set=shuffle([...pool]).slice(0,10);
  const allPool=[...ITEMS]; // for distractors

  function updateScore(){
    const t=score+wrong; const pct=t>0?Math.round(score/t*100):0;
    container.querySelector('#qs').textContent=score;
    container.querySelector('#qw').textContent=wrong;
    container.querySelector('#qp').textContent=t>0?pct+'%':'—';
    if(pct>(KANJI_PROGRESS.quizBestPct||0)){KANJI_PROGRESS.quizBestPct=pct;const el=document.getElementById('qh-pct');if(el)el.textContent=pct+'%';}
  }

  function showQ(){
    const q=set[qi]; answered=false;
    // Randomly choose question type
    const qTypes=['meaning','reading'];
    const qt=qTypes[Math.floor(Math.random()*qTypes.length)];
    const wrongs=shuffle(allPool.filter(g=>g.id!==q.id)).slice(0,3);
    const opts=shuffle([q,...wrongs]);

    container.innerHTML=`
      <div class="quiz-scorebar">
        <div class="qsc"><span class="qsc-num" id="qs" style="color:var(--green)">${score}</span><span class="qsc-lbl">correct</span></div>
        <div class="qsc"><span class="qsc-num" id="qw" style="color:var(--red)">${wrong}</span><span class="qsc-lbl">wrong</span></div>
        <div class="qsc"><span class="qsc-num" id="qp">${score+wrong>0?Math.round(score/(score+wrong)*100)+'%':'—'}</span><span class="qsc-lbl">accuracy</span></div>
      </div>
      <div class="quiz-num">Question ${qi+1} of ${set.length}</div>
      <div class="quiz-q-text">${qt==='meaning'?'What is the meaning of:':'What is the reading of:'}</div>
      <div class="quiz-q-sub">${q.main}</div>
      <div class="quiz-opts">${opts.map(o=>`<button class="quiz-opt" data-k="${o.id}">${qt==='meaning'?o.meaning:o.reading}</button>`).join('')}</div>
      <div class="quiz-fb" id="qfb"></div>
      <button class="btn-next" id="qnext">Next →</button>`;

    container.querySelectorAll('.quiz-opt').forEach(btn=>{
      btn.onclick=()=>{
        if(answered)return; answered=true;
        const correct=btn.dataset.k===q.id;
        container.querySelectorAll('.quiz-opt').forEach(b=>{b.disabled=true;if(b.dataset.k===q.id)b.classList.add('correct');});
        if(!correct){btn.classList.add('wrong');wrong++;}else score++;
        updateScore(); scheduleSave();
        const fb=container.querySelector('#qfb');
        fb.className='quiz-fb '+(correct?'good':'bad');
        fb.innerHTML=(correct?'<strong>✓ Correct!</strong> ':'<strong>✗ Incorrect.</strong> ')
          +`<span style="font-family:'Shippori Mincho',serif">${q.main}</span> (${q.reading}) = ${q.meaning}`
          +`<div style="margin-top:6px;font-size:12px;font-style:italic;opacity:.8">${q.examples[0].jp.replace(/<[^>]+>/g,'')} ${q.examples[0].en}</div>`;
        fb.style.display='block';
        container.querySelector('#qnext').style.display='block';
      };
    });
    container.querySelector('#qnext').onclick=()=>{
      qi++;
      if(qi>=set.length){
        const pct=score+wrong>0?Math.round(score/(score+wrong)*100):0;
        container.innerHTML=`<div style="text-align:center;padding:2rem">
          <div style="font-family:'Shippori Mincho',serif;font-size:26px;font-weight:700;margin-bottom:.4rem">完了！</div>
          <div style="font-size:16px;font-weight:500;margin-bottom:.4rem">${score}/${set.length} — ${pct}%</div>
          <div style="font-size:12px;color:rgba(26,23,20,0.48);margin-bottom:1.25rem">${pct>=80?'🎌 Excellent!':pct>=60?'👍 Good progress.':'📚 Review weak points.'}</div>
          <button class="btn-primary" id="qrestart">Try again ↺</button></div>`;
        container.querySelector('#qrestart').onclick=()=>renderKanjiQuiz(container,pool);
      }else showQ();
    };
  }
  showQ();
}

// ================================================================
// EXAM MODE
// ================================================================
function renderKanjiExam(container,pool){
  let score=0,total=0,qi=0;
  const qs=shuffle([...EXAM_QS_KANJI]).slice(0,8);

  function showQ(){
    const q=qs[qi];
    const typeLabel={fill:'Fill in the blank',reading:'Kanji reading',compose:'Sentence composition',text:'Text grammar',error:'Error identification'}[q.type];
    let html=`<div class="exam-pill">${typeLabel}</div>
      <div class="quiz-scorebar">
        <div class="qsc"><span class="qsc-num" style="color:var(--green)">${score}</span><span class="qsc-lbl">correct</span></div>
        <div class="qsc"><span class="qsc-num">${qi+1}/${qs.length}</span><span class="qsc-lbl">question</span></div>
        <div class="qsc"><span class="qsc-num">${total>0?Math.round(score/total*100)+'%':'—'}</span><span class="qsc-lbl">accuracy</span></div>
      </div>`;

    if(q.type==='fill'){
      html+=`<div class="quiz-q-text" style="font-family:'Shippori Mincho',serif;font-size:18px;margin-bottom:1rem;line-height:2.4">${q.q.replace('___','<span style="color:var(--teal);font-weight:700;border-bottom:2px solid var(--teal)">　　　</span>')}</div>
        <div class="quiz-opts">${q.opts.map(o=>`<button class="quiz-opt" data-a="${o}" style="font-family:'Shippori Mincho',serif;font-size:16px">${o}</button>`).join('')}</div>`;
    } else if(q.type==='reading'){
      html+=`<div class="quiz-q-text" style="margin-bottom:.5rem">${q.q}</div>
        <div style="font-family:'Shippori Mincho',serif;font-size:40px;font-weight:700;color:var(--teal);margin-bottom:1.25rem">${q.q.split('：')[1]||q.q}</div>
        <div class="quiz-opts">${q.opts.map(o=>`<button class="quiz-opt" data-a="${o}" style="font-family:'DM Mono',monospace">${o}</button>`).join('')}</div>`;
    } else if(q.type==='compose'){
      html+=`<div class="quiz-q-text" style="margin-bottom:.4rem">Arrange in the correct order:</div>
        <div style="font-family:'Shippori Mincho',serif;font-size:16px;margin-bottom:.75rem;color:rgba(26,23,20,0.6);line-height:2.2">${q.q}</div>
        <div id="ex-slots" class="sentence-slots"></div>
        <div id="ex-parts" class="sentence-parts">${shuffle([...q.parts]).map(p=>`<button class="part-chip" data-p="${p}">${p}</button>`).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:.6rem">
          <button class="btn-primary" id="ex-check" style="flex:1">Check</button>
          <button id="ex-clear" style="padding:10px 14px;border:1px solid var(--border-s);border-radius:7px;background:transparent;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif">Clear</button>
        </div>`;
    } else if(q.type==='text'){
      const parts=q.passage.split('___');
      html+=`<div class="passage-box">${parts[0]}<span style="color:var(--teal);font-weight:700;border-bottom:2px solid var(--teal)">（　①　）</span>${parts[1]||''}</div>
        <div class="quiz-q-text" style="font-size:14px;margin-bottom:.5rem">${q.q}</div>
        <div class="quiz-opts" id="opts1">${q.opts1.map(o=>`<button class="quiz-opt" data-a="${o}" style="font-family:'Shippori Mincho',serif">${o}</button>`).join('')}</div>`;
    } else if(q.type==='error'){
      html+=`<div class="quiz-q-text" style="margin-bottom:.75rem">${q.q}</div>
        <div class="quiz-opts" style="grid-template-columns:1fr">${q.opts.map((o,i)=>`<button class="quiz-opt" data-i="${i}" style="font-family:'Shippori Mincho',serif;font-size:13px">${o}</button>`).join('')}</div>`;
    }

    html+=`<div class="quiz-fb" id="ex-fb" style="display:none"></div>
      <div id="ex-answer-box" style="display:none;margin-bottom:.9rem;padding:.9rem 1.1rem;border-radius:8px;border:1px solid var(--border-s);background:var(--paper2)"></div>
      <button class="btn-next" id="ex-next">Next →</button>`;
    container.innerHTML=html;

    function showFb(ok,correctAns,hint){
      const fb=container.querySelector('#ex-fb');
      fb.className='quiz-fb '+(ok?'good':'bad');
      fb.innerHTML=(ok?'<strong>✓ Correct!</strong>':'<strong>✗ Incorrect.</strong>');
      fb.style.display='block';
      const ab=container.querySelector('#ex-answer-box');
      let abHtml='';
      if(!ok) abHtml+=`<div style="font-size:13px;font-weight:500;color:var(--green);margin-bottom:.5rem">✓ Correct answer: <span style="font-family:'Shippori Mincho',serif;font-size:16px">${correctAns}</span></div>`;
      if(q.furigana) abHtml+=`<div style="font-family:'Shippori Mincho',serif;font-size:14px;line-height:2.4;margin-bottom:.4rem">${q.furigana}</div>`;
      if(q.translation) abHtml+=`<div style="font-size:12px;font-style:italic;color:rgba(26,23,20,0.6);margin-bottom:.5rem">${q.translation}</div>`;
      if(hint) abHtml+=`<div style="font-size:12px;color:rgba(26,23,20,0.55);border-top:1px solid var(--border);padding-top:.5rem;margin-top:.5rem;line-height:1.6">💡 ${hint}</div>`;
      ab.innerHTML=abHtml; ab.style.display='block';
      container.querySelector('#ex-next').style.display='block';
    }

    if(q.type==='fill'||q.type==='reading'){
      container.querySelectorAll('.quiz-opt').forEach(btn=>{
        btn.onclick=()=>{
          container.querySelectorAll('.quiz-opt').forEach(b=>{b.disabled=true;if(b.dataset.a===q.answer||b.dataset.a===q.blank)b.classList.add('correct');});
          const ok=btn.dataset.a===(q.answer||q.blank);
          if(!ok)btn.classList.add('wrong');
          if(ok)score++;total++;
          showFb(ok,q.answer||q.blank,q.hint);scheduleSave();
        };
      });
    } else if(q.type==='compose'){
      const slots=container.querySelector('#ex-slots');
      const selected=[];
      container.querySelectorAll('.part-chip').forEach(chip=>{
        chip.onclick=()=>{
          if(chip.classList.contains('used'))return;
          selected.push(chip.dataset.p);
          const s=document.createElement('span');s.className='slot-chip';s.textContent=chip.dataset.p;
          s.onclick=()=>{const i=selected.indexOf(chip.dataset.p);if(i>-1)selected.splice(i,1);s.remove();chip.classList.remove('used');};
          slots.appendChild(s);chip.classList.add('used');
        };
      });
      container.querySelector('#ex-clear').onclick=()=>{selected.length=0;slots.innerHTML='';container.querySelectorAll('.part-chip').forEach(c=>c.classList.remove('used'));};
      container.querySelector('#ex-check').onclick=()=>{
        const ans=selected.join('');
        const ok=ans===q.answer;
        if(ok)score++;total++;
        container.querySelectorAll('.part-chip,#ex-check,#ex-clear').forEach(b=>b.disabled=true);
        const correctDisplay=q.correct_order?q.correct_order.join(' → '):q.answer;
        showFb(ok,correctDisplay,q.hint);scheduleSave();
      };
    } else if(q.type==='text'){
      container.querySelectorAll('#opts1 .quiz-opt').forEach(btn=>{
        btn.onclick=()=>{
          container.querySelectorAll('#opts1 .quiz-opt').forEach(b=>{b.disabled=true;if(b.dataset.a===q.blanks[0])b.classList.add('correct');});
          const ok=btn.dataset.a===q.blanks[0];
          if(!ok)btn.classList.add('wrong');
          if(ok)score++;total++;
          showFb(ok,`① ${q.blanks[0]}`,q.hint);scheduleSave();
        };
      });
    } else if(q.type==='error'){
      container.querySelectorAll('.quiz-opt').forEach((btn,i)=>{
        btn.onclick=()=>{
          container.querySelectorAll('.quiz-opt').forEach((b,j)=>{b.disabled=true;if(j===q.wrong)b.classList.add('correct');});
          const ok=i===q.wrong;
          if(!ok)btn.classList.add('wrong');
          if(ok)score++;total++;
          const t=q.translations?q.translations[q.wrong]:'';
          showFb(ok,q.opts[q.wrong]+(t?' ('+t+')':''),q.hint);scheduleSave();
        };
      });
    }

    container.querySelector('#ex-next').onclick=()=>{
      qi++;
      if(qi>=qs.length){
        const pct=total>0?Math.round(score/total*100):0;
        container.innerHTML=`<div style="text-align:center;padding:2.5rem 1rem">
          <div style="font-family:'Shippori Mincho',serif;font-size:30px;font-weight:700;margin-bottom:.4rem">試験完了</div>
          <div style="font-size:18px;font-weight:500;margin-bottom:.4rem">${score}/${qs.length} — ${pct}%</div>
          <div style="font-size:13px;color:rgba(26,23,20,0.48);margin-bottom:1.25rem">${pct>=80?'🎌 JLPT-ready!':pct>=60?'👍 Solid progress.':'📚 Keep reviewing.'}</div>
          <button class="btn-primary" id="ex-restart">Try again</button></div>`;
        container.querySelector('#ex-restart').onclick=()=>renderKanjiExam(container,pool);
      }else showQ();
    };
  }
  showQ();
}

// ================================================================
// GAME
// ================================================================
function renderKanjiGame(container,pool){
  if(!pool||!pool.length){
    container.innerHTML='<div class="locked-overlay"><div class="locked-title">No content</div><div class="locked-sub">Change filter.</div></div>';
    return;
  }
  let streak=0,best=KANJI_PROGRESS.gameBestStreak||0,gtotal=0,current=null,revealed=false;

  function next(){
    revealed=false; current=shuffle([...pool])[0];
    // Game types for kanji/vocab
    const types=['meaning','reading'];
    current._t=types[Math.floor(Math.random()*types.length)];
    const pt=current._t==='meaning'?current.main:current.meaning;
    const sub=current._t==='meaning'?'TYPE THE MEANING IN ENGLISH':'TYPE THE JAPANESE READING (romaji ok)';
    container.innerHTML=`
      <div class="game-header">
        <div><div class="streak-display" id="g-str">🔥 ${streak}</div><span class="streak-lbl">streak</span></div>
        <div style="text-align:right"><div class="streak-display">${gtotal}</div><span class="streak-lbl">answered</span></div>
      </div>
      <div class="game-prompt">
        <div class="game-prompt-text">${pt}</div>
        <div class="game-prompt-sub">${sub}</div>
      </div>
      <div class="game-hint">${current._t==='meaning'?'English meaning accepted':'Hiragana or romaji accepted'}</div>
      <div class="game-input-row">
        <input type="text" class="game-input" id="g-inp" placeholder="type your answer…"/>
        <button class="btn-check" id="g-chk">Check</button>
      </div>
      <div class="game-result" id="g-res"></div>
      <button class="btn-next" id="g-nx" style="margin-bottom:1rem;display:none">Next →</button>
      <div style="font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:rgba(26,23,20,0.32);margin-bottom:6px">Badges</div>
      <div class="badges-row">
        <span class="badge ${KANJI_PROGRESS.badgesEarned.includes('b5')?'earned':''}" id="gb5">5 streak</span>
        <span class="badge ${KANJI_PROGRESS.badgesEarned.includes('b10')?'earned':''}" id="gb10">10 streak</span>
        <span class="badge ${KANJI_PROGRESS.badgesEarned.includes('b20')?'earned':''}" id="gb20">20 streak</span>
        <span class="badge ${KANJI_PROGRESS.badgesEarned.includes('b50')?'earned':''}" id="gb50">50 answered</span>
      </div>`;

    const inp=container.querySelector('#g-inp');
    inp.focus();
    inp.onkeydown=e=>{if(e.key==='Enter')check();};
    container.querySelector('#g-chk').onclick=check;
    container.querySelector('#g-nx').onclick=next;

    function check(){
      if(revealed){next();return;}
      const val=inp.value.trim().toLowerCase();
      if(!val)return;
      gtotal++;
      let ok=false;
      if(current._t==='meaning'){
        const words=current.meaning.toLowerCase().replace(/[;()\[\]]/g,'').split(/[\s\/,·\-]+/);
        ok=words.some(w=>w.length>2&&val.includes(w))||val.includes(current.meaning.toLowerCase().slice(0,5));
      } else {
        ok=val===current.reading||current.reading.includes(val)&&val.length>2;
      }
      if(ok){streak++;if(streak>best){best=streak;KANJI_PROGRESS.gameBestStreak=best;const ghEl=document.getElementById('h-stat-2');if(ghEl)ghEl.textContent=best;}}
      else streak=0;
      KANJI_PROGRESS.gameTotalAnswered=(KANJI_PROGRESS.gameTotalAnswered||0)+1;
      ['b5','b10','b20','b50'].forEach(id=>{
        const thr={b5:5,b10:10,b20:20,b50:50}[id];
        if((id==='b50'?gtotal:streak)>=thr&&!KANJI_PROGRESS.badgesEarned.includes(id)){
          KANJI_PROGRESS.badgesEarned.push(id);
          const el=container.querySelector('#g'+id);if(el)el.classList.add('earned');
          showToast('Badge unlocked: '+id);
        }
      });
      scheduleSave();
      const res=container.querySelector('#g-res');
      res.style.display='block'; res.className='game-result '+(ok?'good':'bad');
      res.textContent=ok?'✓ Correct!':'✗ '+current.main+' ('+current.reading+') = '+current.meaning;
      container.querySelector('#g-str').textContent='🔥 '+streak;
      container.querySelector('#g-nx').style.display='block';
      revealed=true;
    }
  }
  next();
}

// ================================================================
// SYNC — uses setSyncStatus, showToast, jsonp, shuffle from app.js
// ================================================================

// INIT


// =============================
// KANJI MODULE
// =============================
async function initKanjiApp() {
    try {
        const vocabRes = await fetch("data/kanji_vocab.json");
        ITEMS = await vocabRes.json();
        
        const examRes = await fetch("data/kanji_exams.json");
        EXAM_QS_KANJI = await examRes.json();
        
        await loadKanjiProgress();
        
        const tf = document.getElementById('type-filter-select');
        if(tf) kanjiTypeFilter = tf.value;
    } catch (e) {
        console.error("Failed kanji init", e);
    }
}

async function loadKanjiProgress() {
    setSyncStatus('syncing','loading…');
    try{
        const data=await jsonp(KANJI_SHEET_URL+'?action=load');
        if(data&&data.totalKnown!==undefined){
            KANJI_PROGRESS={...KANJI_PROGRESS,...data};
            setSyncStatus('ok','synced');
            if(window.currentMode==='kanji') { refreshKanjiCurrentPage(); }
            showToast('✓ Kanji status loaded');
        } else setSyncStatus('ok','new kanji save');
    }catch(e){setSyncStatus('error','offline');}
}

async function saveKanjiProgress() {
    setSyncStatus('syncing','saving…');
    KANJI_PROGRESS.lastSaved=new Date().toISOString();
    try{
        await jsonp(KANJI_SHEET_URL+'?action=save&data='+encodeURIComponent(JSON.stringify(KANJI_PROGRESS)));
        setSyncStatus('ok','saved '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));
    }catch(e){setSyncStatus('error','save failed');}
}
function kanjiScheduleSave(){clearTimeout(kanjiSyncTimer);kanjiSyncTimer=setTimeout(saveKanjiProgress,1200);}

function renderKanjiPage(p, heroSub, heroMain, hStat1, hLbl1, hStat2, hLbl2) {
    kanjiGlobalFilter = globalFilter || 'all';
    kanjiTypeFilter = kanjiTypeFilter || 'all';

    const pool = kanjiApplyFilter(ITEMS);
    
    if (p === 'schedule') {
        if(heroSub) heroSub.textContent = "Kanji & Vocab Route";
        if(heroMain) heroMain.textContent = "学習計画";
        if(hStat1) hStat1.textContent = KANJI_PROGRESS.totalKnown || 0;
        if(hLbl1) hLbl1.textContent = "Mastered";
        const days = kanjiStudyDay();
        if(hStat2) hStat2.textContent = days;
        if(hLbl2) hLbl2.textContent = days === 1 ? "Day" : "Days";
        renderKanjiSchedule();
    } else if (p === 'lessons') {
        if(heroSub) heroSub.textContent = "Kanji & Vocab Lessons";
        if(heroMain) heroMain.textContent = "学習内容";
        if(hStat1) hStat1.textContent = pool.length;
        if(hLbl1) hLbl1.textContent = pool.length === 1 ? "Item" : "Items";
        if(hStat2) hStat2.textContent = KANJI_PROGRESS.totalKnown || 0;
        if(hLbl2) hLbl2.textContent = "Mastered";
        renderKanjiLesson(document.getElementById('lessons-body'), pool);
    } else if (p === 'flashcards') {
        if(heroSub) heroSub.textContent = "Flashcard Deck";
        if(heroMain) heroMain.textContent = "フラッシュカード";
        if(hStat1) hStat1.textContent = KANJI_PROGRESS.totalKnown || 0;
        if(hLbl1) hLbl1.textContent = "Mastered";
        if(hStat2) hStat2.textContent = pool.length;
        if(hLbl2) hLbl2.textContent = pool.length === 1 ? "Card" : "Cards";
        renderKanjiFC(document.getElementById('fc-body'), pool);
    } else if (p === 'quiz') {
        if(heroSub) heroSub.textContent = "Multiple Choice";
        if(heroMain) heroMain.textContent = "クイズ";
        if(hStat1) hStat1.textContent = pool.length;
        if(hLbl1) hLbl1.textContent = "Questions";
        if(hStat2) hStat2.textContent = KANJI_PROGRESS.quizBestPct ? KANJI_PROGRESS.quizBestPct + "%" : "—";
        if(hLbl2) hLbl2.textContent = "Best";
        renderKanjiQuiz(document.getElementById('quiz-body'), pool);
    } else if (p === 'exam') {
        if(heroSub) heroSub.textContent = "JLPT Style Tasks";
        if(heroMain) heroMain.textContent = "試験モード";
        if(hStat1) hStat1.textContent = "8";
        if(hLbl1) hLbl1.textContent = "Questions";
        if(hStat2) hStat2.textContent = "—";
        if(hLbl2) hLbl2.textContent = "Best";
        renderKanjiExam(document.getElementById('exam-body'), pool);
    } else if (p === 'game') {
        if(heroSub) heroSub.textContent = "Recall Training";
        if(heroMain) heroMain.textContent = "タイピング";
        if(hStat1) hStat1.textContent = pool.length;
        if(hLbl1) hLbl1.textContent = "Active";
        if(hStat2) hStat2.textContent = KANJI_PROGRESS.gameBestStreak || 0;
        if(hLbl2) hLbl2.textContent = "Streak";
        renderKanjiGame(document.getElementById('game-body'), ITEMS); 
    }
}

function refreshKanjiCurrentPage() {
    if(currentMode==='kanji') {
        renderKanjiPage(currentPage, 
          document.getElementById('hero-sub'), document.getElementById('hero-main'),
          document.getElementById('h-stat-1'), document.getElementById('h-lbl-1'),
          document.getElementById('h-stat-2'), document.getElementById('h-lbl-2')
        );
    }
}
