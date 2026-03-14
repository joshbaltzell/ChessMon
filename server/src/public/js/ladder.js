/* ============================================================
   ChessMon — Mini-Boss Ladder (Punch-Out Style)
   Vertical bracket UI with 3 opponents + championship bout
   Now rendered in its own LADDER SCREEN
   ============================================================ */

/**
 * Render the ladder from dashboard data.
 * Shows in the dedicated ladder screen container.
 */
function renderLadder(d) {
  const ladder = d.ladder;
  const ladderEl = document.getElementById('ladderContainer');
  if (!ladderEl) return;

  if (!ladder || !ladder.opponents) {
    ladderEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim)">No ladder data available.</div>';
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
      ? '<button class="ladder-fight-btn" onclick="doBossFight()">&#9876; Fight</button>'
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
        <div class="ladder-championship-icon">&#127942;</div>
        <div class="ladder-championship-info">
          <div class="ladder-championship-title">Championship &mdash; Round ${d.championship.currentRound}</div>
          <div class="ladder-championship-desc">Score: ${d.championship.gamesWon}-${d.championship.gamesPlayed - d.championship.gamesWon}</div>
        </div>
        <button class="ladder-fight-btn" onclick="playChampionshipRound()">Play Round</button>
      </div>
    `;
  } else if (ladder.allDefeated) {
    champHtml = `
      <div class="ladder-championship unlocked" onclick="startChampionship()">
        <div class="ladder-championship-icon">&#127942;</div>
        <div class="ladder-championship-info">
          <div class="ladder-championship-title">Championship Bout</div>
          <div class="ladder-championship-desc">All opponents defeated! Click to begin.</div>
        </div>
      </div>
    `;
  } else {
    champHtml = `
      <div class="ladder-championship locked">
        <div class="ladder-championship-icon">&#128274;</div>
        <div class="ladder-championship-info">
          <div class="ladder-championship-title">Championship Bout</div>
          <div class="ladder-championship-desc">Defeat all opponents to unlock</div>
        </div>
      </div>
    `;
  }

  // Bot stats summary for context
  const botStats = d.stats ? `
    <div class="ladder-bot-stats">
      <span>Your bot: Lv.${d.stats.level} &bull; ${d.stats.elo} elo</span>
    </div>
  ` : '';

  ladderEl.innerHTML = `
    <div class="ladder-panel">
      <div class="ladder-title">Boss Ladder &mdash; Level ${ladder.targetLevel}</div>
      ${botStats}
      <div class="ladder-bracket">
        ${champHtml}
        ${opponentsHtml}
      </div>
    </div>
  `;
}
