// Ekrandaki süre ve saat biçimleri.

// 86 → "1 dk 26 sn", 3720 → "1 sa 2 dk", 45 → "45 sn"
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
  if (m > 0) return sec > 0 ? `${m} dk ${sec} sn` : `${m} dk`;
  return `${sec} sn`;
}

// Oturum saati: bugünse "14:05", değilse "19 Eki 14:05"
export function formatClock(ms, nowMs = Date.now()) {
  const d = new Date(ms);
  const now = new Date(nowMs);
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return time;
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${time}`;
}

// Veri kesintisi uyarısı: süre okunur biçimde ("1 sa", "2 dk 5 sn")
export function staleWarning(silentMs) {
  return `${formatDuration(Math.floor(silentMs / 1000))} boyunca yeni veri gelmedi. ESP32 veya broker durmuş olabilir.`;
}
