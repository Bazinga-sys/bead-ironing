/**
 * 基于作品 id 生成稳定的默认旋转角（-4°~4°），
 * 新建作品与旧数据迁移共用，保证同一作品每次打开的默认角度一致。
 */
export function rotForId(id: string): number {
  let sum = 0
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
  return (sum % 9) - 4
}
