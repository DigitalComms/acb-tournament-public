(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ACBTournament = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const total = (division, score) => score.goals * division.rules.scoreValues.goal + score.points * division.rules.scoreValues.point;
  function winner(division, match) {
    if (!match.score) return null;
    const a = total(division, match.score.team1), b = total(division, match.score.team2);
    if (a !== b) return a > b ? match.team1 : match.team2;
    const decision = match.decision;
    return decision?.type === 'team_agreement' && [match.team1,match.team2].includes(decision.winner) && typeof decision.note === 'string' && decision.note.trim() && Array.isArray(decision.agreedBy) && [match.team1,match.team2].every(t => decision.agreedBy.includes(t)) ? decision.winner : null;
  }
  function standings(division, group = null) {
    const names = group ? division.groups[group] : division.teams;
    const all = new Map(division.teams.map(name => [name,{name,played:0,won:0,drawn:0,lost:0,for:0,against:0,scoreDifference:0,totalScored:0,competitionPoints:0}]));
    for (const m of division.matches) {
      if (!m.countsForStandings || !m.score) continue;
      const a = all.get(m.team1), b = all.get(m.team2);
      const x = total(division,m.score.team1), y = total(division,m.score.team2), points = division.rules.competitionPoints;
      for (const [r,f,c] of [[a,x,y],[b,y,x]]) {
        r.played++; r.for += f; r.against += c;
        if (f === c) { r.drawn++; r.competitionPoints += points.draw; }
        else if (f > c) { r.won++; r.competitionPoints += points.win; }
        else { r.lost++; r.competitionPoints += points.loss; }
        r.scoreDifference = r.for - r.against; r.totalScored = r.for;
      }
    }
    const keys = division.rules.rankingGuidance || ['competitionPoints','scoreDifference','totalScored'];
    const compare = (a,b) => { for (const key of keys) { const delta = b[key]-a[key]; if (delta) return delta; } return 0; };
    const rows = names.map(name => all.get(name)).sort(compare);
    for (let i=0;i<rows.length;) {
      let end=i+1; while(end<rows.length && compare(rows[i],rows[end])===0) end++;
      const tied=rows.slice(i,end), decision=(division.standingsDecisions || []).find(d => d.type==='team_agreement' && (d.group || null)===(group || null) && typeof d.note==='string' && d.note.trim() && Array.isArray(d.orderedTeams) && d.orderedTeams.length===tied.length && new Set(d.orderedTeams).size===tied.length && tied.every(r=>d.orderedTeams.includes(r.name) && d.agreedBy?.includes(r.name)));
      if (tied.length>1 && decision) tied.sort((a,b)=>decision.orderedTeams.indexOf(a.name)-decision.orderedTeams.indexOf(b.name));
      tied.forEach((r,j)=> {r.position=i+1+(decision?j:0);r.tied=tied.length>1&&!decision;r.agreed=!!decision&&tied.length>1;});
      rows.splice(i,tied.length,...tied);i=end;
    }
    return rows;
  }
  function series(division) {
    const p=division.rules.progression, wins=Object.fromEntries(p.seriesTeams.map(t=>[t,0]));
    const matches=p.matchIds.map(id=>division.matches.find(m=>m.id===id));
    const first=matches.slice(0,2).map(m=>winner(division,m));
    const ready=first.every(Boolean), thirdRequired=ready&&first[0]!==first[1];
    matches.forEach((m,i)=> { if(i===2&&!thirdRequired)return; const name=winner(division,m);if(name in wins)wins[name]++; });
    return {wins,winner:Object.keys(wins).find(t=>wins[t]>=p.winsRequired)||null,thirdRequired,thirdStatus:!ready?'Conditional · if series is 1–1':thirdRequired?'Required · series is 1–1':'Not required · series decided'};
  }
  function finals(division) {
    const qualifying=division.matches.filter(m=>m.countsForStandings), complete=qualifying.length>0&&qualifying.every(m=>m.score);
    return (division.rules.progression?.finals || []).map(f=> {
      const m=division.matches.find(m=>m.id===f.matchId);
      const sets=f.participants.map(p=>standings(division,p.group || null));
      const selected=f.participants.map((p,i)=>sets[i].find(r=>r.position===p.position));
      const resolved=complete&&selected.every(r=>r&&!r.tied);
      const projected=resolved?selected.map(r=>r.name):null;
      const confirmed=resolved&&!!m.qualification&&m.team1===projected[0]&&m.team2===projected[1];
      return {name:f.name,match:m,projected,confirmed,reason:!complete?'Awaiting qualifying results':!resolved?'Awaiting team agreement':confirmed?'Finalists confirmed':'Provisional · awaiting organiser confirmation'};
    });
  }
  function validate(data) {
    const fail=()=>{throw Error('Tournament data is incomplete or invalid.');};
    const number=n=>Number.isSafeInteger(n)&&n>=0;
    if(!data||data.schemaVersion!==1||typeof data.name!=='string'||typeof data.timeZone!=='string'||!Array.isArray(data.divisions)||!data.divisions.length)fail();
    try {new Intl.DateTimeFormat('en',{timeZone:data.timeZone});}catch{fail();}
    const ids=new Set(), divIds=new Set();
    for(const d of data.divisions){
      if(!d||typeof d.id!=='string'||divIds.has(d.id)||typeof d.name!=='string'||typeof d.format!=='string'||!Array.isArray(d.teams)||!d.teams.length||d.teams.some(t=>typeof t!=='string')||new Set(d.teams).size!==d.teams.length||!Array.isArray(d.matches)||!d.rules?.scoreValues||!['goal','point'].every(k=>number(d.rules.scoreValues[k])))fail();
      divIds.add(d.id);
      if(d.rules.competitionPoints&&!['win','draw','loss'].every(k=>number(d.rules.competitionPoints[k])))fail();
      if(!Array.isArray(d.rules.rankingGuidance)||d.rules.rankingGuidance.some(k=>!['competitionPoints','scoreDifference','totalScored'].includes(k)))fail();
      for(const m of d.matches){
        if(!m||typeof m.id!=='string'||ids.has(m.id)||!['start','end','pitch','stage','team1Label','team2Label','status'].every(k=>typeof m[k]==='string')||![m.team1,m.team2].every(t=>t===null||d.teams.includes(t)))fail();ids.add(m.id);
        if(m.countsForStandings&&!d.rules.competitionPoints)fail();
        if(m.score!==null&&(!m.score||!m.team1||!m.team2||m.team1===m.team2||!['team1','team2'].every(k=>m.score[k]&&number(m.score[k].goals)&&number(m.score[k].points)&&Number.isSafeInteger(total(d,m.score[k])))))fail();
        if(m.decision!=null&&(!m.score||m.decision.type!=='team_agreement'||typeof m.decision.note!=='string'||!m.decision.note.trim()||!Array.isArray(m.decision.agreedBy)||![m.team1,m.team2].every(t=>m.decision.agreedBy.includes(t))||![m.team1,m.team2].includes(m.decision.winner)||total(d,m.score.team1)!==total(d,m.score.team2)))fail();
      }
      for(const names of Object.values(d.groups || {}))if(!Array.isArray(names)||names.some(t=>!d.teams.includes(t)))fail();
      if(d.standingsDecisions!=null&&(!Array.isArray(d.standingsDecisions)||d.standingsDecisions.some(x=>!x||x.type!=='team_agreement'||typeof x.note!=='string'||!Array.isArray(x.orderedTeams)||!Array.isArray(x.agreedBy)||x.orderedTeams.some(t=>!d.teams.includes(t))||(x.group&&!d.groups?.[x.group]))))fail();
      const p=d.rules.progression;
      if(p?.finals&&(!Array.isArray(p.finals)||p.finals.some(f=>!f||typeof f.name!=='string'||!d.matches.some(m=>m.id===f.matchId)||!Array.isArray(f.participants)||f.participants.length!==2||f.participants.some(x=>!x||!Number.isInteger(x.position)||x.position<1||(x.group&&!d.groups?.[x.group])))))fail();
      if(p?.matchIds&&(!Array.isArray(p.matchIds)||p.matchIds.length!==3||p.matchIds.some(id=>!d.matches.some(m=>m.id===id))||!Array.isArray(p.seriesTeams)||p.seriesTeams.length!==2||p.seriesTeams.some(t=>!d.teams.includes(t))||!number(p.winsRequired)))fail();
      if(d.format==='best_of_three'&&!p?.matchIds)fail();
    }
    if(data.scheduleItems!=null&&(!Array.isArray(data.scheduleItems)||data.scheduleItems.some(e=>!e||!['name','start','end','pitch'].every(k=>typeof e[k]==='string'))))fail();
    return data;
  }
  return {total,winner,standings,series,finals,validate};
});

