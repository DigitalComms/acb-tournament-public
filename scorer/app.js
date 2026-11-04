/* Standalone local scorer. No credentials or network writes. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const storageKey = 'acb-scorer-draft-v1';
  let tournament, division, match, dirty = false, formDirty = false;
  const scoreIds = ['goals1', 'points1', 'goals2', 'points2'];
  const totals = (d, score) => ['team1', 'team2'].map(key => score[key].goals * d.rules.scoreValues.goal + score[key].points * d.rules.scoreValues.point);
  function validate(data) {
    const fail = () => { throw Error('This is not a supported tournament file. Open a version 1 tournament JSON file with valid divisions, rules and matches.'); };
    const integer = v => Number.isSafeInteger(v) && v >= 0;
    if (!data || data.schemaVersion !== 1 || typeof data.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(data.id) || typeof data.name !== 'string' || !Array.isArray(data.divisions) || !data.divisions.length) fail();
    const ids = new Set(), divisionIds = new Set();
    for (const d of data.divisions) {
      if (!d || typeof d.id !== 'string' || divisionIds.has(d.id) || typeof d.name !== 'string' || typeof d.format !== 'string' || !Array.isArray(d.teams) || !d.teams.every(t => typeof t === 'string') || new Set(d.teams).size !== d.teams.length || !Array.isArray(d.matches) || !d.rules || !d.rules.scoreValues || !integer(d.rules.scoreValues.goal) || !integer(d.rules.scoreValues.point)) fail();
      if (d.rules.competitionPoints && !['win','draw','loss'].every(k => integer(d.rules.competitionPoints[k]))) fail();
      divisionIds.add(d.id);
      for (const m of d.matches) {
        if (!m || typeof m.id !== 'string' || ids.has(m.id) || !['start','end','pitch','stage','team1Label','team2Label','status'].every(k => typeof m[k] === 'string') || ![m.team1,m.team2].every(t => t === null || d.teams.includes(t))) fail();
        ids.add(m.id);
        if (m.score !== null && (!m.score || !['team1','team2'].every(k => m.score[k] && integer(m.score[k].goals) && integer(m.score[k].points)) || totals(d,m.score).some(v => !Number.isSafeInteger(v)))) fail();
        if (m.score && (!m.team1 || !m.team2 || m.team1 === m.team2)) fail();
        if (m.decision != null && (!m.score || m.decision.type !== 'team_agreement' || ![m.team1,m.team2].includes(m.decision.winner) || !Array.isArray(m.decision.agreedBy) || ![m.team1,m.team2].every(t => m.decision.agreedBy.includes(t)) || typeof m.decision.note !== 'string' || !m.decision.note.trim() || totals(d,m.score)[0] !== totals(d,m.score)[1])) fail();
      }
      const p = d.rules.progression;
      if (p?.finals && (!Array.isArray(p.finals) || p.finals.some(f => !f || !d.matches.some(m => m.id === f.matchId) || !Array.isArray(f.participants) || f.participants.length !== 2 || f.participants.some(x => !x || !Number.isInteger(x.position) || x.position < 1 || (x.group && (!Array.isArray(d.groups?.[x.group]) || !d.groups[x.group].every(t => d.teams.includes(t)))))))) fail();
      if (p?.matchIds && (!Array.isArray(p.matchIds) || p.matchIds.some(id => !d.matches.some(m => m.id === id)))) fail();
      if (p?.conditionalMatch && (!Array.isArray(p.matchIds) || p.matchIds.length < 3 || !p.matchIds.includes(p.conditionalMatch.matchId))) fail();
    }
    return data;
  }
  function message(text, error = false) { $('message').textContent = text; $('message').style.color = error ? '#ffadbd' : ''; }
  function option(text, value = text) { const el = document.createElement('option'); el.textContent = text; el.value = value; return el; }
  function discardForm() { return !formDirty || window.confirm('Discard the unsaved score fields for this match?'); }
  function load(data) {
    tournament = clone(validate(data)); dirty = false; formDirty = false;
    $('tournament-name').textContent = tournament.name;
    $('division').replaceChildren(...tournament.divisions.map(d => option(d.name, d.id)));
    $('workspace').hidden = false; $('download').disabled = false; $('search').value = '';
    division = tournament.divisions[0]; match = null;
    render(); fileState();
  }
  function fileState() {
    const saved = tournament.divisions.reduce((n,d) => n + d.matches.filter(m => m.score !== null).length,0);
    $('file-state').textContent = `${tournament.id}.json · ${saved} results · ${dirty ? 'Local changes — download and upload to GitHub.' : 'Loaded file. Changes here are local until uploaded to GitHub.'}`;
  }
  function persist() {
    dirty = true; fileState();
    try { localStorage.setItem(storageKey, JSON.stringify({ tournament, savedAt: new Date().toISOString() })); }
    catch { message('Result saved in memory. Browser backup is unavailable; download your file now.', true); }
  }
  function finalSpec(m) { return division.rules.progression?.finals?.find(f => f.matchId === m.id); }
  function winner(m) {
    if (!m?.score) return null;
    const [a,b] = totals(division,m.score);
    return a === b ? m.decision?.winner || null : a > b ? m.team1 : m.team2;
  }
  function conditionalReady() {
    const p = division.rules.progression;
    if (!p?.conditionalMatch || match.id !== p.conditionalMatch.matchId) return true;
    const winners = p.matchIds.slice(0,2).map(id => winner(division.matches.find(m => m.id === id)));
    return winners.every(Boolean) && winners[0] !== winners[1];
  }
  function dependencyError() {
    const p = division.rules.progression;
    if (match.countsForStandings && p?.finals?.some(f => division.matches.find(m => m.id === f.matchId)?.score)) return 'Remove saved final results before changing qualifying results. Finalists must then be confirmed again.';
    if (p?.conditionalMatch && p.matchIds?.slice(0,2).includes(match.id) && division.matches.find(m => m.id === p.conditionalMatch.matchId)?.score) return 'Remove the Game 3 result before changing the earlier series games.';
    return '';
  }
  function render() {
    const filter = $('search').value.toLowerCase().trim();
    const list = division.matches.filter(m => [m.id,m.start,m.pitch,m.team1 || m.team1Label,m.team2 || m.team2Label].join(' ').toLowerCase().includes(filter));
    $('division-note').textContent = `${division.name} · ${division.format.replaceAll('_',' ')} · ${division.rules.scoreValues.goal} per goal, ${division.rules.scoreValues.point} per point. ${division.rules.competitionPoints ? `${division.rules.competitionPoints.win} league points for a win, ${division.rules.competitionPoints.draw} for a draw.` : 'Friendlies excluded from the championship series.'}`;
    $('count').textContent = `(${list.length})`;
    $('matches').replaceChildren(...list.map(m => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'match'; button.dataset.match = m.id; button.setAttribute('aria-pressed', String(match?.id === m.id));
      const meta = document.createElement('span'); meta.textContent = `${m.start}–${m.end} · ${m.pitch === 'Full Pitch' ? m.pitch : 'Pitch '+m.pitch} · ${m.id}`;
      const title = document.createElement('strong'); title.textContent = `${m.team1 || m.team1Label} v ${m.team2 || m.team2Label}`;
      const result = document.createElement('span'); result.textContent = m.score ? `${m.score.team1.goals}–${String(m.score.team1.points).padStart(2,'0')} : ${m.score.team2.goals}–${String(m.score.team2.points).padStart(2,'0')} · ${m.status.replaceAll('_',' ')}` : m.status.replaceAll('_',' ');
      button.append(meta,title,result); button.onclick = () => { if (!discardForm()) return; match = m; edit(); render(); }; return button;
    }));
    if (!list.length) $('matches').textContent = 'No matches found. Try another team or match ID.';
  }
  function participantNames() { return finalSpec(match) ? [$('participant1').value,$('participant2').value] : [match.team1,match.team2]; }
  function edit() {
    formDirty = false; $('score-form').hidden = false; $('form-error').textContent = '';
    $('match-title').textContent = match.id;
    $('match-detail').textContent = `${match.start}–${match.end} · ${match.pitch === 'Full Pitch' ? match.pitch : 'Pitch '+match.pitch} · ${match.stage} · Referee: ${match.referee || 'TBC'}`;
    const final = finalSpec(match); $('qualification').hidden = !final;
    if (final) {
      [1,2].forEach((n,i) => {
        const group = final.participants[i].group;
        const names = group ? division.groups[group] : division.teams;
        $('participant'+n).replaceChildren(option(match['team'+n+'Label'],''),...names.map(t => option(t)));
        $('participant'+n).value = match['team'+n] || '';
      });
      $('qualified').checked = !!match.qualification;
    }
    $('conditional-note').hidden = !division.rules.progression?.conditionalMatch || division.rules.progression.conditionalMatch.matchId !== match.id;
    const s = match.score;
    scoreIds.forEach((id,i) => $(id).value = s ? s[i < 2 ? 'team1' : 'team2'][i % 2 ? 'points' : 'goals'] : '');
    $('agreed').checked = !!match.decision; $('agreement-note').value = match.decision?.note || '';
    updatePreview(match.decision?.winner || '');
  }
  function enteredScore() {
    const values = scoreIds.map(id => $(id).value);
    if (values.some(v => v.trim() === '' || !Number.isSafeInteger(Number(v)) || Number(v) < 0)) return null;
    const [g1,p1,g2,p2] = values.map(Number);
    const score = {team1:{goals:g1,points:p1},team2:{goals:g2,points:p2}};
    return totals(division,score).every(Number.isSafeInteger) ? score : null;
  }
  function updatePreview(selectedWinner = $('winner').value) {
    const names = participantNames();
    [1,2].forEach((n,i) => $('team'+n+'-label').textContent = names[i] || match['team'+n+'Label']);
    const score = enteredScore();
    const values = score ? totals(division,score) : null;
    $('score-preview').textContent = values ? `Total points: ${values[0]} – ${values[1]}` : 'Enter goals and points for both teams, including zero.';
    const tied = values && values[0] === values[1] && (finalSpec(match) || match.countsForSeries);
    $('tie-panel').hidden = !tied;
    $('winner').replaceChildren(option('Awaiting team agreement',''),...names.filter(Boolean).map(t => option(t)));
    $('winner').value = names.includes(selectedWinner) ? selectedWinner : '';
  }
  function invalidateFinalists() {
    if (!match.countsForStandings) return;
    division.standingsDecisions = [];
    for (const f of division.rules.progression?.finals || []) {
      const m = division.matches.find(m => m.id === f.matchId);
      m.team1 = null; m.team2 = null; m.qualification = null; m.decision = null; m.status = 'awaiting_qualification';
    }
  }
  $('score-form').addEventListener('input', () => { formDirty = true; updatePreview(); });
  $('score-form').addEventListener('change', () => { formDirty = true; updatePreview(); });
  $('score-form').onsubmit = event => {
    event.preventDefault(); $('form-error').textContent = '';
    const fail = text => { $('form-error').textContent = text; };
    const score = enteredScore(); if (!score) return fail('Enter a nonnegative whole number in all four score fields.');
    const blocked = dependencyError(); if (blocked) return fail(blocked);
    const final = finalSpec(match), names = participantNames();
    if (!conditionalReady()) return fail('Game 3 is only required after one agreed win each in Games 1 and 2.');
    if (final && (!division.matches.filter(m => m.countsForStandings).every(m => m.score) || !names.every(Boolean) || names[0] === names[1] || !$('qualified').checked)) return fail('Complete qualifying results, select two different eligible teams and confirm qualification with any standings ties resolved.');
    const [a,b] = totals(division,score); let decision = null;
    if (a === b && (final || match.countsForSeries) && $('winner').value) {
      if (!$('agreed').checked || !$('agreement-note').value.trim()) return fail('Confirm both teams agreed and add an agreement note, or leave the winner pending.');
      decision = {type:'team_agreement',winner:$('winner').value,agreedBy:names,note:$('agreement-note').value.trim(),recordedAt:new Date().toISOString()};
    }
    if (final) {
      match.team1 = names[0]; match.team2 = names[1];
      match.qualification = {type:'organiser_confirmation',tiesResolvedWithTeams:true,recordedAt:new Date().toISOString()};
    }
    match.score = score; match.decision = decision;
    match.status = a === b && (final || match.countsForSeries) && !decision ? 'awaiting_team_agreement' : 'completed';
    invalidateFinalists(); message(`${match.id} saved to your draft. Download the file when ready to update GitHub.`); persist(); edit(); render();
  };
  $('clear').onclick = () => {
    const blocked = dependencyError(); if (blocked) { $('form-error').textContent = blocked; return; }
    if (!window.confirm(`Remove the saved result for ${match.id}?`)) return;
    match.score = null; match.decision = null;
    match.status = finalSpec(match) ? 'awaiting_qualification' : division.rules.progression?.conditionalMatch?.matchId === match.id ? 'conditional' : 'scheduled';
    invalidateFinalists(); message(`${match.id} result removed from your draft.`); persist(); edit(); render();
  };
  $('division').onchange = () => {
    if (!discardForm()) { $('division').value = division.id; return; }
    division = tournament.divisions.find(d => d.id === $('division').value); match = null; formDirty = false; $('search').value = ''; $('score-form').hidden = true; $('match-title').textContent = 'Select a match'; $('match-detail').textContent = ''; render();
  };
  $('search').oninput = render;
  $('file').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    if ((dirty || formDirty) && !window.confirm('Replace this draft? Download any results you want to keep first.')) { event.target.value = ''; return; }
    try { const data = validate(JSON.parse(await file.text())); load(data); $('restore').hidden = true; message('Tournament file opened.'); }
    catch (e) { message(`File not opened: ${e.message}`,true); }
    event.target.value = '';
  };
  $('download').onclick = () => {
    if (formDirty) { message('Save or discard the current score fields before downloading. Unsaved fields are not included.',true); return; }
    try {
      const output = clone(validate(tournament)); output.updatedAt = new Date().toISOString();
      const url = URL.createObjectURL(new Blob([JSON.stringify(output,null,2)+'\n'],{type:'application/json'}));
      const a = document.createElement('a'); a.href = url; a.download = output.id+'.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
      tournament.updatedAt = output.updatedAt; persist();
      message(`Download prepared: ${output.id}.json. Upload it to tournaments/${output.id}.json in GitHub and commit the change. This screen has not published anything.`);
    } catch (e) { message(`Cannot export: ${e.message}`,true); }
  };
  $('restore-button').onclick = () => {
    if ((dirty || formDirty) && !window.confirm('Replace your current draft with the saved browser draft?')) return;
    try { const saved = JSON.parse(localStorage.getItem(storageKey)); load(saved.tournament); dirty = true; fileState(); $('restore').hidden = true; message('Browser draft restored. Download it to keep a separate backup.'); }
    catch (e) { message(`Cannot restore draft: ${e.message}`,true); }
  };
  $('discard-draft').onclick = () => { if (window.confirm('Discard the saved browser backup? This does not change the currently open file.')) { try { localStorage.removeItem(storageKey); $('restore').hidden = true; } catch { message('Cannot access browser storage.',true); } } };
  window.addEventListener('beforeunload', event => { if (formDirty || dirty) { event.preventDefault(); event.returnValue = ''; } });
  async function init() {
    let saved;
    try { saved = localStorage.getItem(storageKey); } catch { /* File mode may restrict browser storage. */ }
    $('restore').hidden = !saved;
    try { const response = await fetch('../tournaments/ayc-2026.json',{cache:'no-store'}); if (!response.ok) throw Error('Schedule unavailable'); const data = await response.json(); load(data); }
    catch { $('tournament-name').textContent = 'Open a tournament file to begin'; message('Use “Open tournament file” to select ayc-2026.json. This works without a server or internet connection.'); }
  }
  init();
})();

