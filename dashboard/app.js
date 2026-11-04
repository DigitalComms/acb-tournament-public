(() => {
  'use strict';
  const E=window.ACBTournament;
  function element(tag, className, text) { const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e; }
  for(const root of document.querySelectorAll('[data-acb-dashboard]')) {
    if(root.dataset.mounted)continue;root.dataset.mounted='true';
    let data,divisionId,view='fixtures',query='',filter='all',loading=false;
    const source=root.dataset.source;
    root.innerHTML='<header class="acb-top"><div><p class="acb-eyebrow">TOURNAMENT CENTRE · MATCH SCHEDULE</p><h1>Fixtures & results</h1><p class="acb-event-name"></p></div><button class="acb-refresh" type="button">Refresh results</button></header><div class="acb-statusline"></div><p class="acb-notice" role="status" hidden></p><div class="acb-controls"><label>Division<select class="acb-division" aria-label="Division"></select></label><label class="acb-search-label">Find your team<input class="acb-search" type="search" placeholder="Team, pitch or match ID"></label><label>Show<select class="acb-filter" aria-label="Match status"><option value="all">All matches</option><option value="upcoming">Upcoming</option><option value="results">Results</option></select></label></div><div class="acb-tabs" role="tablist" aria-label="Competition view"></div><p class="acb-format"></p><section class="acb-content" role="tabpanel" tabindex="0"></section><section class="acb-schedule"></section><p class="acb-bottom">Scores and tables update from the tournament file. All times are local to the venue.</p>';
    const find=s=>root.querySelector(s),content=find('.acb-content'),notice=find('.acb-notice');
    const id='acb-'+Math.random().toString(36).slice(2);content.id=id+'-panel';
    const division=()=>data.divisions.find(d=>d.id===divisionId);
    const textDate=()=>{
      const date=new Date(data.updatedAt);
      return data.updatedAt&&Number.isFinite(date.getTime())?'Results file updated '+new Intl.DateTimeFormat('en-GB',{timeZone:data.timeZone,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(date):'Schedule available · no results update recorded';
    };
    function announce(text){notice.textContent=text;notice.hidden=!text;}
    function tabs(d){
      const choices=[['fixtures','Fixtures & Results']];
      if(d.rules.competitionPoints)choices.push(['standings','Standings']);
      if(d.rules.progression)choices.push(['finals',d.format==='best_of_three'?'Series':'Finals']);
      if(!choices.some(([key])=>key===view))view='fixtures';
      find('.acb-tabs').replaceChildren(...choices.map(([key,label],i)=>{
        const b=element('button','',label);b.type='button';b.id=id+'-'+key;b.setAttribute('role','tab');b.setAttribute('aria-controls',content.id);b.setAttribute('aria-selected',String(view===key));b.tabIndex=view===key?0:-1;
        b.onclick=()=>{view=key;render();find('#'+b.id).focus();};
        b.onkeydown=event=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?choices.length-1:(i+(event.key==='ArrowRight'?1:choices.length-1))%choices.length;view=choices[index][0];render();find('#'+id+'-'+view).focus();};return b;
      }));content.setAttribute('aria-labelledby',id+'-'+view);
    }
    function format(d){
      if(d.format==='best_of_three')return `${d.name} · Friendlies are excluded from the championship. ${d.rules.progression.seriesTeams.join(' v ')}: best of three; Game 3 only if the series is 1–1. Level series games need a team-agreed winner.`;
      const p=d.rules.competitionPoints;
      const points=p?` ${p.win} league points for a win · ${p.draw} for a draw.`:'';
      if(d.format==='festival')return 'Festival · Each team plays the others twice. Six 10-minute fixtures; no finals.'+points;
      if(d.groups&&Object.keys(d.groups).length)return 'Two groups of three · Crossover results count. Group A v Group B: 1st → Cup, 2nd → Plate, 3rd → Shield.'+points;
      return 'Four-team round robin · 1st v 2nd → Cup final; 3rd v 4th → Plate final.'+points;
    }
    function matchInfo(d,m){
      const f=E.finals(d).find(f=>f.match.id===m.id);
      if(f&&!f.confirmed)return {names:f.projected || [m.team1Label,m.team2Label],score:null,win:null,status:f.reason};
      const series=d.format==='best_of_three'?E.series(d):null;
      if(series&&d.rules.progression.conditionalMatch?.matchId===m.id&&!series.thirdRequired)return {names:[m.team1,m.team2],score:null,win:null,status:series.thirdStatus};
      const win=E.winner(d,m), tied=m.score&&E.total(d,m.score.team1)===E.total(d,m.score.team2);
      return {names:[m.team1||m.team1Label,m.team2||m.team2Label],score:m.score,win,status:tied&&(f||m.countsForSeries)&&!win?'Awaiting team agreement':m.score?(m.decision&&win?'Result · team agreement':'Full time'):m.status==='conditional'?'Required · series is 1–1':m.status.replaceAll('_',' ')};
    }
    function card(d,m){
      const info=matchInfo(d,m),article=element('article','acb-card');article.dataset.match=m.id;
      const meta=element('div','acb-card-meta');meta.append(element('span','',`${m.start}–${m.end} · ${m.pitch==='Full Pitch'?m.pitch:'Pitch '+m.pitch}`),element('span','acb-badge'+(/awaiting|provisional/i.test(info.status)?' is-pending':info.score?' is-completed':''),info.status));
      article.append(meta,element('p','acb-match-id',`${m.id} · ${m.stage}`));
      info.names.forEach((name,i)=>{const row=element('div','acb-team'+(info.win===name?' is-winner':''));row.append(element('span','acb-team-name',name),element('strong','acb-team-score',info.score?`${info.score['team'+(i+1)].goals}–${String(info.score['team'+(i+1)].points).padStart(2,'0')}`:'—'));article.append(row);});
      article.append(element('p','acb-card-footer',`Referee: ${m.referee || 'TBC'}${info.score?' · Total points '+E.total(d,info.score.team1)+'–'+E.total(d,info.score.team2):''}`));return article;
    }
    function matches(d){
      const title=element('div','acb-panel-title');
      const list=d.matches.filter(m=>{
        const info=matchInfo(d,m);
        return [m.id,m.pitch,m.start,...info.names].join(' ').toLowerCase().includes(query)&& (filter==='all'||(filter==='results'?!!info.score:!info.score));
      });
      title.append(element('h2','',d.name),element('span','acb-muted',list.length+' matches'));content.append(title);
      if(!list.length){content.append(element('p','acb-empty','No matches match these filters. Try another team or show all matches.'));return;}
      content.append(element('p','acb-score-key',`Scores show goals–points. Goals count as ${d.rules.scoreValues.goal}; points count as ${d.rules.scoreValues.point}.`));
      const grid=element('div','acb-grid');list.forEach(m=>grid.append(card(d,m)));content.append(grid);
    }
    function table(d,group){
      const rows=E.standings(d,group),wrap=element('div','acb-table-scroll'),t=element('table');wrap.tabIndex=0;wrap.setAttribute('aria-label',`${group?'Group '+group:d.name} standings; scroll horizontally for all columns`);
      t.append(element('caption','',group?'Group '+group:d.name+' standings'));
      const head=element('thead'),tr=element('tr');['Pos','Team','P','W','D','L','For','Against','Diff','Pts'].forEach(label=>{const th=element('th','',label);th.scope='col';tr.append(th);});head.append(tr);t.append(head);
      const body=element('tbody');rows.forEach(r=>{const tr=element('tr');[String(r.position)+(r.tied?' =':r.agreed?' *':''),r.name,r.played,r.won,r.drawn,r.lost,r.for,r.against,(r.scoreDifference>0?'+':'')+r.scoreDifference,r.competitionPoints].forEach(value=>tr.append(element('td','',value)));body.append(tr);});t.append(body);wrap.append(t);content.append(wrap);
      content.append(element('p','acb-standings-note',rows.some(r=>r.tied)?'Equal positions are shown with “=”. Points, difference and scores for guide team agreements; unresolved qualifying ties hold progression.':rows.some(r=>r.agreed)?'* Position confirmed by a recorded team agreement.':'Positions shown by points, score difference, then total scored.'));
    }
    function standings(d){
      const groups=Object.keys(d.groups || {});
      (groups.length?groups:[null]).forEach(g=>table(d,g));
      content.append(element('p','acb-muted',`For and Against use total points (${d.rules.scoreValues.goal} per goal). ${groups.length?'Crossover results count in each team’s group. ':''}Finals do not count towards these tables.`));
    }
    function finals(d){
      if(d.format==='best_of_three'){
        const s=E.series(d);content.append(element('h2','','Championship series'));
        const scores=element('div','acb-series');Object.entries(s.wins).forEach(([name,wins])=>{const box=element('div','acb-series-team');box.append(element('h3','',name),element('strong','',String(wins)),element('p','acb-muted',wins===1?'win':'wins'));scores.append(box);});content.append(scores,element('p','acb-format',s.winner?'Series winner: '+s.winner:s.thirdStatus));
        const grid=element('div','acb-grid');d.rules.progression.matchIds.forEach(id=>grid.append(card(d,d.matches.find(m=>m.id===id))));content.append(grid,element('p','acb-score-key','Friendlies are shown in Fixtures & Results and do not count towards the series.'));
      }else{
        content.append(element('h2','','Finals'));
        for(const f of E.finals(d)){const heading=element('div','acb-panel-title');heading.append(element('h3','',f.name+' final'));content.append(heading,card(d,f.match));}
      }
    }
    function render(){
      const d=division();tabs(d);find('.acb-format').textContent=format(d);
      find('.acb-controls').querySelector('.acb-search-label').hidden=view!=='fixtures';find('.acb-filter').parentElement.hidden=view!=='fixtures';
      content.replaceChildren();if(view==='fixtures')matches(d);else if(view==='standings')standings(d);else finals(d);
    }
    function renderData(){
      if(!data.divisions.some(d=>d.id===divisionId))divisionId=data.divisions[0].id;
      find('.acb-event-name').textContent=data.name;
      const selector=find('.acb-division');selector.replaceChildren(...data.divisions.map(d=>{const o=element('option','',d.name);o.value=d.id;return o;}));selector.value=divisionId;
      find('.acb-statusline').replaceChildren(element('span','acb-chip',textDate()),element('span','acb-chip','Venue time · '+data.timeZone.replaceAll('_',' ')),element('span','acb-chip',data.divisions.reduce((n,d)=>n+d.matches.length,0)+' tournament fixtures'));
      const schedule=find('.acb-schedule');schedule.hidden=!data.scheduleItems?.length;schedule.replaceChildren();
      if(data.scheduleItems?.length){schedule.append(element('p','acb-eyebrow','ALSO ON THE SCHEDULE'));data.scheduleItems.forEach(e=>{const row=element('div','acb-schedule-item');row.append(element('strong','',e.name),element('span','acb-muted',`${e.start}–${e.end} · ${e.pitch}`));schedule.append(row);});}
      render();
    }
    async function refresh(){
      if(loading)return;loading=true;find('.acb-refresh').disabled=true;
      try{
        if(!source)throw Error('No tournament source configured');
        const response=await fetch(source,{cache:'no-store',signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('Schedule request failed');
        const next=E.validate(await response.json());data=next;announce('');renderData();
      }catch(error){
        if(data)announce('Updates unavailable. Showing the last successfully loaded tournament file. Use Refresh results to retry.');
        else{content.replaceChildren(element('p','acb-error','The tournament schedule could not be loaded. Please try Refresh results.'));announce('Fixtures are temporarily unavailable.');find('.acb-controls').hidden=true;find('.acb-tabs').hidden=true;}
      }finally{loading=false;find('.acb-refresh').disabled=false;if(data){find('.acb-controls').hidden=false;find('.acb-tabs').hidden=false;}}
    }
    find('.acb-refresh').onclick=refresh;
    find('.acb-division').onchange=event=>{divisionId=event.target.value;query='';filter='all';find('.acb-search').value='';find('.acb-filter').value='all';render();};
    find('.acb-search').oninput=event=>{query=event.target.value.toLowerCase().trim();render();};find('.acb-filter').onchange=event=>{filter=event.target.value;render();};
    refresh();setInterval(()=>{if(!document.hidden)refresh();},60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  }
})();

