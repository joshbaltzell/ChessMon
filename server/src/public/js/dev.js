/* ============================================================
   ChessMon — Dev Mode (Mass Sparring for ML Testing)
   ============================================================ */

let devMassSparRunning = false;

async function devMassSpar() {
  if (!currentBotId) { alert('Select a bot first'); return; }
  if (devMassSparRunning) { return; }
  devMassSparRunning = true;

  const count = parseInt(document.getElementById('devSparCount').value) || 100;
  const oppLvl = parseInt(document.getElementById('devOpponentLvl').value) || 1;
  const devLog = document.getElementById('devLog');
  const devProg = document.getElementById('devProgress');
  devLog.innerHTML = '';

  let wins = 0, losses = 0, draws = 0;
  let startElo = null, currentElo = null;
  let lastMlLoss = null;
  const eloHistory = [];
  const winRateHistory = [];

  for (let i = 1; i <= count; i++) {
    if (!devMassSparRunning) {
      devAppend(devLog, `\nStopped after ${i-1} games.`, 'info');
      break;
    }

    devProg.innerHTML = `<strong>Game ${i} / ${count}</strong> | W:${wins} L:${losses} D:${draws} | Win rate: ${((wins/(i-1||1))*100).toFixed(1)}%`;

    try {
      const r = await api('POST', `/bots/${currentBotId}/train/dev-spar`, { opponent: 'system', opponent_level: oppLvl });
      if (startElo === null) startElo = r.newElo - r.eloChange;
      currentElo = r.newElo;

      const botWon = (r.game.result === '1-0' && r.game.botPlayedWhite) || (r.game.result === '0-1' && !r.game.botPlayedWhite);
      const botLost = (r.game.result === '1-0' && !r.game.botPlayedWhite) || (r.game.result === '0-1' && r.game.botPlayedWhite);
      if (botWon) wins++;
      else if (botLost) losses++;
      else draws++;

      if (r.mlTraining) lastMlLoss = r.mlTraining.finalLoss;

      eloHistory.push(currentElo);
      winRateHistory.push(wins / i);

      if (i <= 5 || i % 10 === 0) {
        const mlStr = lastMlLoss !== null ? ` | ML loss: ${lastMlLoss.toFixed(4)}` : '';
        devAppend(devLog, `#${i}: ${botWon?'WIN':botLost?'LOSS':'DRAW'} in ${r.game.moveCount}mv | Elo: ${currentElo} (${r.eloChange>=0?'+':''}${r.eloChange}) | WR: ${((wins/i)*100).toFixed(1)}%${mlStr}`, botWon ? 'win' : botLost ? 'loss' : 'draw');
      }
    } catch(e) {
      devAppend(devLog, `#${i}: ERROR - ${e.message}`, 'loss');
      break;
    }
  }

  devMassSparRunning = false;

  const total = wins + losses + draws;
  devAppend(devLog, `\n${'='.repeat(50)}`, 'dim');
  devAppend(devLog, `SUMMARY: ${total} games vs Lv.${oppLvl}`, 'info');
  devAppend(devLog, `  Wins: ${wins} (${((wins/total)*100).toFixed(1)}%)`, 'win');
  devAppend(devLog, `  Losses: ${losses} (${((losses/total)*100).toFixed(1)}%)`, 'loss');
  devAppend(devLog, `  Draws: ${draws} (${((draws/total)*100).toFixed(1)}%)`, 'draw');
  devAppend(devLog, `  Elo: ${startElo} \u2192 ${currentElo} (${currentElo - startElo >= 0 ? '+' : ''}${currentElo - startElo})`, 'info');
  if (lastMlLoss !== null) devAppend(devLog, `  Final ML loss: ${lastMlLoss.toFixed(4)}`, 'dim');

  if (winRateHistory.length >= 10) {
    const buckets = 10;
    const bucketSize = Math.floor(winRateHistory.length / buckets);
    let sparkline = '  Win rate trend: ';
    for (let b = 0; b < buckets; b++) {
      const wr = winRateHistory[Math.min((b + 1) * bucketSize - 1, winRateHistory.length - 1)];
      sparkline += `${(wr * 100).toFixed(0)}%`;
      if (b < buckets - 1) sparkline += ' \u2192 ';
    }
    devAppend(devLog, sparkline, 'dim');
  }

  devProg.innerHTML = `<strong>Done!</strong> ${total} games | W:${wins} L:${losses} D:${draws} | Final WR: ${((wins/total)*100).toFixed(1)}%`;
  await refreshDashboard();
}

function devStopMassSpar() {
  devMassSparRunning = false;
}

function devAppend(el, msg, cls) {
  const span = document.createElement('span');
  span.className = cls || '';
  span.textContent = msg + '\n';
  el.appendChild(span);
  el.scrollTop = el.scrollHeight;
}
