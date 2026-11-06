/**
 * dsh-hide-time 自检脚本 —— 装进 profile 前先跑一遍，别拿真 DSH 试错。
 *
 * 为什么要有这个文件：
 *   2026-10-31 这个插件让 DSH 整个配置被重置了两次。根因是前端 factory 只
 *   `return module.exports`（一个空对象），而 DSH 前端加载器的判定是：
 *
 *     function Fb(e){ return e && typeof e == "object" && typeof e.apply == "function" }
 *     resolve(e){ if (typeof e == "function") return e; if (Fb(e)) return e.apply }
 *     plugin(e){ const i = this.resolve(e); if (!i) throw new Error(
 *       'invalid plugin, expect function or object with an "apply" method, received ' + typeof e) }
 *
 *   空对象过不了 Fb —— 于是报 "received object"，并且 DSH 会把整个 profile 配置重置。
 *   这个脚本就是把那段判定原样重放一遍，离线跑，0 风险。
 *
 * 用法：
 *   node check.mjs                     # 检查本目录
 *   node check.mjs <path-to-package>   # 检查已安装的副本
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(root, 'package.json');
let failures = 0;

function ok(label, cond, detail = '') {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
	if (!cond) failures++;
}

// ---------- 0. 清单 ----------
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
ok('package.json name', pkg.name === 'dsh-hide-time', pkg.name);
ok('type: module', pkg.type === 'module', pkg.type);
ok('exports["."]', pkg.exports?.['.'] === './lib/index.js', JSON.stringify(pkg.exports?.['.']));
ok('exports["./client"]', pkg.exports?.['./client'] === './lib/client.js', JSON.stringify(pkg.exports?.['./client']));
ok('dsh.bundle.patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml');
ok('dsh.client.platform', pkg.dsh?.client?.platform === 'web');

// ---------- 1. bundle patch：insert 条目必须写全 id/name/config ----------
const patchSrc = fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8');
ok('patch has "config: {}"', /config:\s*\{\s*\}/.test(patchSrc), '缺它会让加载器把条目对象当插件');
ok('patch id === package name', new RegExp(`id:\\s*'?"?dsh-hide-time'?"?`).test(patchSrc));

// ---------- 2. host 入口 ----------
const host = await import(pathToFileURL(path.join(root, 'lib/index.js')).href);
ok('host name', host.name === 'dsh-hide-time', host.name);
ok('host apply is function', typeof host.apply === 'function');
ok('host inject is array', Array.isArray(host.inject));

// ---------- 3. client 入口：重放 DSH 前端加载器的判定 ----------
const clientSrc = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8');

let def = null;
const noopEl = {
	textContent: '', children: [], classList: { contains: () => false },
	getAttribute: () => null, setAttribute() {}, style: {}, parentElement: null,
};
const fakeWindow = { __ModuleLoader__: { load(d) { def = d; } } };
const fakeDocument = {
	readyState: 'complete', body: noopEl, addEventListener() {},
	querySelector: () => noopEl, querySelectorAll: () => [],
};
const FakeObserver = class { observe() {} disconnect() {} };

new Function('window', 'document', 'MutationObserver', 'setInterval', 'setTimeout', 'console', 'location', clientSrc)(
	fakeWindow, fakeDocument, FakeObserver, () => 0, () => 0, console, { href: 'about:blank' },
);

ok('client calls __ModuleLoader__.load once', !!def);
ok('client id === package name', def?.id === 'dsh-hide-time', def?.id);

if (def) {
	const exported = def.factory(function unknownRequire(name) {
		throw new Error(`unexpected require(${name})`);
	});

	// 这两行就是 DSH 的原版判定
	const Fb = (e) => e && typeof e === 'object' && typeof e.apply === 'function';
	const resolved = typeof exported === 'function' ? exported : (Fb(exported) ? exported.apply : undefined);

	ok('loader would resolve the plugin', typeof resolved !== 'undefined', '否则 DSH 报 invalid plugin 并重置配置');
	ok('exports.apply is function', typeof exported?.apply === 'function');
	ok('exports.inject is array', Array.isArray(exported?.inject));

	try {
		exported.apply({});
		ok('apply() runs without throwing', true);
	} catch (err) {
		ok('apply() runs without throwing', false, String(err && err.message));
	}
}

// ---------- 4. 加载日志路径（host 侧可观测性）----------
const hostSrc = fs.readFileSync(path.join(root, 'lib/index.js'), 'utf8');
ok('host writes a load log', hostSrc.includes('host.log'), '没日志就无法区分「没加载」和「加载了没生效」');

console.log('');
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED — 不要装进 profile`);
process.exit(failures === 0 ? 0 : 1);
