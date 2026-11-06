/**
 * dsh-hide-time — 主控侧（host half）。
 *
 * 这个插件只做一件事：把侧栏会话行右侧的相对时间戳隐藏掉。
 * 所有隐藏逻辑都在前端（lib/client.js），主控侧只负责两件事：
 *   1. 提供一个合法的 Cordis 插件入口，让 DSH 能把它登记进插件树；
 *   2. 在加载时写一行日志，用来证明「主控侧确实被注册了」。
 *
 * 为什么需要第 2 条：2026-10-31 两次配置重置事故里，前端代码一直是正常的，
 * 崩的是主控侧插件注册。没有加载日志就无法区分「插件没加载」与「加载了但前端没生效」，
 * 只能靠猜。这行日志是给未来的自己留的证据。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const name = 'dsh-hide-time';
export const inject = [];

/** 与 DSH 主控一致地解析配置目录（支持 DSH_HOME 覆盖）。 */
function stateDir() {
	const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
	return path.join(home, 'dsh-hide-time');
}

/** 追加一行加载日志；任何失败都吞掉，绝不因为写日志把 DSH 弄挂。 */
function logLoaded() {
	try {
		const dir = stateDir();
		fs.mkdirSync(dir, { recursive: true });
		const line = `[${new Date().toISOString()}] host loaded pid=${process.pid}\n`;
		fs.appendFileSync(path.join(dir, 'host.log'), line, 'utf8');
	} catch {
		/* 写不了日志不算错误 */
	}
}

export function apply(ctx) {
	logLoaded();

	// 纯前端插件：这里不需要起端口、不需要读文件
	if (ctx && typeof ctx.effect === 'function') {
		ctx.effect(() => () => {}, 'hide-time: noop');
	}
}
