/* ============================================================
   ChessMon — Mini-Boss Ladder (Punch-Out Style)
   Vertical bracket UI with 3 opponents + championship bout
   ============================================================ */

/**
 * Render the ladder from dashboard data.
 * Shows in the dashboard panel under the terrarium.
 */
function renderLadder(d) {
  const ladder = d.ladder;
  let ladderEl = document.getElementById('ladderContainer');
  if (!ladderEl) {
    ladderEl = document.createElement('div');
    ladderEl.id = 'ladderContainer';
    const dashContent = document.getElementById('dashContent');
    if (dashContent) dashContent.appendChild(ladderEl);
  }

  if (!ladder || !ladder.opponents) {
    ladderEl.innerHTML = '';
    return;
  }

  const opponentLabels = ['Warm-Up', 'Rival', 'Gatekeeper'];

  let opponentsHtml = '';
  for (let i = ladder.opponents.length - 1; i >= 0; i--) {
    const opp = ladder.opponents[i];
    let cls = '';
    if (opp.defeated) cls = 'defeated';
    else if (i === ladder.currentOpponentIndex) cls = 'current';
    else if (i > ladder.currentOpponentIndex) cls = 'locked';

    const icon = opp.defeated ? '&#10003;' : (i + 1);
    const checkHtml = opp.defeated ? '<span class="ladder-check">&#10003;</span>' : '';

    // Add fight button for current (next undefeated) opponent
    const fightBtn = (!opp.defeated && i === ladder.currentOpponentIndex)
      ? '<button class="ladder-fight-btn" onclick="doBossFight()">⚔️ Fight</button>'
      : '';

    opponentsHtml += `
      <div class="ladder-opponent ${cls}">
        <div class="ladder-icon">${icon}</div>
        <div class="ladder-info">
          <div class="ladder-name">${escHtml(opp.name)}</div>
          <div class="ladder-meta">Lv.${opp.level} &bull; ${opp.elo} elo &bull; ${opponentLabels[i] || ''}</div>
        </div>
        ${checkHtml}
        ${fightBtn}
      </div>
    `;
  }

  // Championship section
  let champHtml = '';
  if (d.championship && d.championship.status === 'active') {
    champHtml = `
      <div class="championship-active">
        <div class="ladder-championship-icon">🏆</div>
        <div class="ladder-championship-info">
          <div class="ladder-championship-title">Championship — Round ${d.championship.currentRound}</div>
          <div class="ladder-championship-desc">Score: ${d.championship.gamesWon}-${d.championship.gamesPlayed - d.championship.gamesWon}</div>
        </div>
        <button class="ladder-fight-btn" onclick="playChampionshipRound()">Play Round</button>
      </div>
    `;
  } else if (ladder.allDefeated) {
    champHtml = `
      <div class="ladder-championship unlocked" onclick="startChampionship()">
        <div class="ladder-championship-icon">🏆</div>
        <div class="ladder-championship-info">
          <div class="ladder-championship-title">Championship Bout</div>
          <div class="ladder-championship-desc">All opponents defeated! Click to begin.</div>
        </div>
      </div>
    `;
  } else {
    champHtml = `
      <div class="ladder-championship locked">
        <div class="ladder-championship-icon">🔒</div>
        <div class="ladder-championship-info">
          <div class="ladder-championship-title">Championship Bout</div>
          <div class="ladder-championship-desc">Defeat all opponents to unlock</div>
        </div>
      </div>
    `;
  }

  ladderEl.innerHTML = `
    <div class="ladder-panel">
      <div class="ladder-title">Boss Ladder &mdash; Level ${ladder.targetLevel}</div>
      <div class="ladder-bracket">
        ${champHtml}
        ${opponentsHtml}
      </div>
    </div>
  `;
}
