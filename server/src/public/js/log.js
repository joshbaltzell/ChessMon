/* ============================================================
   ChessMon — Activity Log (Enhanced)
   Animated entries with color-coded borders and timestamps
   ============================================================ */

function log(msg, cls) {
  const el = document.getElementById('actLog');
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (cls ? ' log-' + cls : '');

  // Timestamp
  const time = new Date();
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  entry.innerHTML = `<span class="log-time">${timeStr}</span><span class="log-msg">${escHtml(msg)}</span>`;
  el.appendChild(entry);
  el.scrollTop = el.scrollHeight;

  // Limit log entries to 100
  while (el.children.length > 100) {
    el.removeChild(el.firstChild);
  }
}
