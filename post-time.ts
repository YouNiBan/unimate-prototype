export function formatPostTime(timestamp: number, language = 'EN', now = Date.now()): string {
  if (!Number.isFinite(timestamp) || Number.isNaN(new Date(timestamp).getTime())) return '';
  const elapsed = Math.max(0, now - timestamp);
  const simplified = language === '简体';
  const english = language === 'EN';
  if (elapsed < 60000) return english ? 'Just now' : simplified ? '刚刚' : '剛剛';
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 60) return english ? `${minutes} minute${minutes === 1 ? '' : 's'} ago` : `${minutes} 分鐘前`.replace('分鐘', simplified ? '分钟' : '分鐘');
  const hours = Math.floor(elapsed / 3600000);
  if (hours < 24) return english ? `${hours} hour${hours === 1 ? '' : 's'} ago` : `${hours} ${simplified ? '小时' : '小時'}前`;
  const days = Math.floor(elapsed / 86400000);
  if (elapsed <= 7 * 86400000) return english ? `${days} day${days === 1 ? '' : 's'} ago` : `${days} 天前`;
  const date = new Date(timestamp);
  if (!english) return date.toLocaleDateString(simplified ? 'zh-CN' : 'zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
  const day = date.getDate();
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] || 'th';
  return `${day}${suffix} ${date.toLocaleDateString('en-GB', { month: 'long' })} ${date.getFullYear()}`;
}
