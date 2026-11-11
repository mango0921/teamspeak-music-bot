export interface ParsedCommand {
  name: string;
  args: string;
  rawArgs: string[];
  flags: Set<string>;
}

/**
 * The fixed set of "admin" chat commands. This is the SINGLE source of truth
 * for which commands the permission gate restricts; reclassifying a command is
 * a one-line edit here. Everything not in this set is public.
 */
export const ADMIN_COMMANDS = new Set([
  "stop", "clear", "remove", "move", "vol", "mode",
]);

/**
 * 内置中文指令别名：`!播放 晴天` 与 `!play 晴天` 等价。
 * 键统一小写；配置里的 commandAliases 仍然优先，方便用户覆盖。
 */
export const CHINESE_COMMAND_ALIASES: Record<string, string> = {
  搜索: "search",
  查找: "find",
  播放: "play",
  点歌: "play",
  添加: "add",
  优先播放: "playnext",
  插播: "playnext",
  暂停: "pause",
  继续: "resume",
  停止: "stop",
  下一首: "next",
  下一曲: "next",
  切歌: "skip",
  跳过: "skip",
  上一首: "prev",
  上一曲: "prev",
  音量: "vol",
  当前: "now",
  队列: "queue",
  列表: "list",
  清空: "clear",
  移除: "remove",
  模式: "mode",
  歌单: "playlist",
  专辑: "album",
  电台: "fm",
  歌手: "artist",
  投票: "vote",
  歌词: "lyrics",
  移动: "move",
  跟随: "follow",
  保存: "save",
  加载: "load",
  存档: "queues",
  帮助: "help",
};

export function parseCommand(
  message: string,
  prefix: string,
  aliases: Record<string, string> = {},
): ParsedCommand | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith(prefix)) return null;

  const withoutPrefix = trimmed.slice(prefix.length);
  if (!withoutPrefix) return null;

  const parts = withoutPrefix.split(/\s+/);
  let name = parts[0].toLowerCase();

  // 中文别名先归一化到英文命令名，配置里的 aliases 仍然优先。
  const resolved = { ...CHINESE_COMMAND_ALIASES, ...aliases }[name];
  if (resolved) {
    name = resolved;
  }

  const flags = new Set<string>();
  const argParts: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    if (
      parts[i].startsWith("-") &&
      parts[i].length === 2 &&
      /[a-zA-Z]/.test(parts[i][1])
    ) {
      flags.add(parts[i][1].toLowerCase());
    } else {
      argParts.push(parts[i]);
    }
  }

  return {
    name,
    args: argParts.join(" "),
    rawArgs: argParts,
    flags,
  };
}

export function isAdminCommand(commandName: string): boolean {
  return ADMIN_COMMANDS.has(commandName);
}

/**
 * Decide whether a chat command may run, given the invoker's TS server groups
 * and the configured admin groups. Pure + synchronous so it is trivially unit
 * tested and reused by the async gate in BotInstance.
 *
 * Allowed iff: (1) it is a public command, OR (2) enforcement is off
 * (adminGroups empty), OR (3) some invoker group is in adminGroups.
 * invokerGroups (strings from TS) and adminGroups (numbers) are normalized to
 * strings before comparison so "6" matches 6.
 */
export function canRunCommand(
  commandName: string,
  invokerGroups: readonly (string | number)[],
  adminGroups: readonly number[],
): boolean {
  if (!isAdminCommand(commandName)) return true;
  if (adminGroups.length === 0) return true;
  const admin = new Set(adminGroups.map((g) => String(g)));
  return invokerGroups.some((g) => admin.has(String(g)));
}
