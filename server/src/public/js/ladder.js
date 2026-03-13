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
  // Ensure we have a container in dashContent
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
  // Render from top (gatekeeper) to bottom (warm-up)
  for (let i = ladder.opponents.length - 1; i >= 0; i--) {
    const opp = ladder.opponents[i];
    let cls = '';
    if (opp.defeated) cls = 'defeated';
    else if (i === ladder.currentOpponentIndex) cls = 'current';
    else if (i > ladder.currentOpponentIndex) cls = 'locked';

    const icon = opp.defeated ? '&#10003;' : (i + 1);
    const checkHtml = opp.defeated ? '<span class="ladder-check">&#10003;</span>' : '';

    opponentsHtml += `
      <div class="ladder-opponent ${cls}">
        <div class="ladder-icon">${icon}</div>
        <div class="ladder-info">
          <div class="ladder-name">${escHtml(opp.name)}</div>
          <div class="ladder-meta">Lv.${opp.level} &bull; ${opp.elo} elo &bull; ${opponentLabels[i] || ''}</div>
        </div>
        ${checkHtml}
      </div>
    `;
  }

  // Championship bout
  const champClass = ladder.allDefeated ? 'unlocked' : 'locked';
  const champOnclick = ladder.allDefeated ? 'onclick="doLevelTest()"' : '';
  const champHtml = `
    <div class="ladder-championship ${champClass}" ${champOnclick}>
      <div class="ladder-championship-icon">${ladder.allDefeated ? '&#127942;' : '&#128274;'}</div>
      <div class="ladder-championship-info">
        <div class="ladder-championship-title">Championship Bout</div>
        <div class="ladder-championship-desc">${ladder.allDefeated ? 'Level Test unlocked! Click to begin.' : 'Defeat all opponents to unlock'}</div>
      </div>
    </div>
  `;

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
