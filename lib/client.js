/**
 * dsh-hide-time — 显示侧（client half）。
 *
 * 目标：把侧栏会话行右侧的相对时间戳（"刚刚" / "7小时" / "1天" / "昨天"…）隐藏。
 *
 * 识别方式（为什么不是纯文字匹配）：
 *   DSH 前端用 CSS Modules，类名形如 `JoiKIa_time`——哈希前缀会随版本变，
 *   但 `_time` 这个语义后缀是稳定的（源码里是 `Rows_module_css_default.time`）。
 *   所以这里同时要求三件事都成立才隐藏：
 *     ① 元素在侧栏里；
 *     ② class 里有一段以 `_time` 结尾；
 *     ③ 文本整体符合相对时间形状。
 *   只认文字（不认结构）会误伤标题叫「昨天」的会话；只认结构（不认文字）会误伤
 *   以后可能出现的其它 `_time` 元素。两个都要过。
 *
 * 找不到侧栏就什么都不做——绝不回退到 document.body 全页扫描。
 *
 * ⚠️ 规范（踩过坑，见 README）：
 *   factory 返回的 module.exports 必须带 apply 方法，否则 DSH 前端加载器会抛
 *   `invalid plugin, expect function or object with an "apply" method, received object`，
 *   并且会连带把整个 profile 配置重置。只 return 空 exports = 必然崩。
 *   另外这里不在 factory 里启动任何东西：所有观察器/定时器都由 apply 注册、
 *   由 ctx.effect 清理，插件停用后 DOM 能恢复原样。
 */

window.__ModuleLoader__.load({
	id: "dsh-hide-time",
	factory: function (require) {
		var module = { exports: {} };
		var exports = module.exports;

		// 相对时间格式：刚刚 / 今天 / 昨天 / 前天 / N秒|分钟|小时|天|周|星期|个月|年
		var TIME_RE = /^(刚刚|今天|昨日|昨天|前天|\d+\s*(秒钟?|分钟|小时|天|日|周|星期|个月|月|年)(前后|前|后|以前|之前)?)$/;
		var MARK = "data-dsh-hide-time";
		var PREV = "__dshHideTimePrevDisplay";
		var THROTTLE_MS = 120;
		var ROOT_CHECK_MS = 3000;

		var state = {
			root: null,
			observer: null,
			finder: null,
			poll: null,
			timer: null,
			started: false
		};

		/* --------------------------- 识别 --------------------------- */

		/** 侧栏容器。DSH 用 <aside>；变了就按 class 关键字找。找不到返回 null。 */
		function findSidebar() {
			try {
				var el = document.querySelector("aside");
				if (el) return el;
				return document.querySelector('[class*="sidebar"]') || null;
			} catch (e) {
				return null;
			}
		}

		/** class 里是否有以 `_time` 结尾的一段（`JoiKIa_time` 命中，`x_timeout` 不命中）。 */
		function looksLikeTimeClass(el) {
			var cls = String((el && el.className) || "");
			return /(^|\s)[A-Za-z0-9_-]*_time(\s|$)/.test(cls);
		}

		/** 往上几层里是否落在一条会话行内。 */
		function inSessionRow(el) {
			var node = el;
			for (var i = 0; i < 8 && node; i++) {
				var cls = String(node.className || "");
				if (cls.indexOf("sessionRow") >= 0 || cls.indexOf("session-row") >= 0) return true;
				node = node.parentElement;
			}
			return false;
		}

		/** 三条件全过才算"这就是那个时间戳"。 */
		function isTimeNode(el) {
			if (!el || !el.parentElement) return false;
			if (!looksLikeTimeClass(el)) return false;
			var text = (el.textContent || "").trim();
			if (!text || text.length > 12) return false;
			if (!TIME_RE.test(text)) return false;
			return true;
		}

		/* --------------------------- 隐藏/恢复 --------------------------- */

		function hide(el) {
			if (el.getAttribute(MARK) === "1") return false;
			el[PREV] = el.style.display;
			el.setAttribute(MARK, "1");
			el.style.display = "none";
			return true;
		}

		/** 恢复到隐藏前的 display，并去掉标记。 */
		function restore(el) {
			var prev = el[PREV];
			el.style.display = prev === undefined ? "" : prev;
			try {
				delete el[PREV];
			} catch (e) {
				el[PREV] = "";
			}
			el.removeAttribute(MARK);
		}

		function restoreAll() {
			var marked;
			try {
				marked = document.querySelectorAll("[" + MARK + "]");
			} catch (e) {
				return;
			}
			for (var i = 0; i < marked.length; i++) restore(marked[i]);
		}

		/**
		 * 扫一遍：先把不该再藏的原样放回（React 会复用节点，旧标记必须能撤销），
		 * 再藏新出现的。
		 */
		function sweep(root) {
			if (!root || !root.querySelectorAll) return { hidden: 0, restored: 0 };
			var hidden = 0;
			var restored = 0;

			var marked = root.querySelectorAll("[" + MARK + "]");
			for (var i = 0; i < marked.length; i++) {
				var old = marked[i];
				if (!root.contains(old) || !isTimeNode(old) || !inSessionRow(old)) {
					restore(old);
					restored++;
				}
			}

			var nodes = root.querySelectorAll('[class*="_time"]');
			for (var j = 0; j < nodes.length; j++) {
				var el = nodes[j];
				if (el.getAttribute(MARK) === "1") continue;
				if (!isTimeNode(el)) continue;
				if (!inSessionRow(el)) continue;
				if (hide(el)) hidden++;
			}
			return { hidden: hidden, restored: restored };
		}

		function schedule() {
			if (state.timer) return;
			state.timer = setTimeout(function () {
				state.timer = null;
				try {
					sweep(state.root);
				} catch (e) {
					/* 单次扫描失败不影响下一次 */
				}
			}, THROTTLE_MS);
		}

		/* --------------------------- 生命周期 --------------------------- */

		function detachObserver() {
			if (state.observer) {
				try {
					state.observer.disconnect();
				} catch (e) {
					/* ignore */
				}
				state.observer = null;
			}
			if (state.timer) {
				clearTimeout(state.timer);
				state.timer = null;
			}
		}

		function attach(root) {
			if (state.root === root) return;
			detachObserver();
			state.root = root;
			try {
				state.observer = new MutationObserver(schedule);
				state.observer.observe(root, { childList: true, subtree: true, characterData: true });
			} catch (e) {
				state.observer = null;
			}
			schedule();
		}

		/**
		 * 没有侧栏时只等它出现（观察 documentElement 的 childList），
		 * 一旦找到就断开并收窄到侧栏内部，不做全页扫描。
		 */
		function waitForSidebar() {
			if (state.finder) return;
			try {
				state.finder = new MutationObserver(function () {
					var root = findSidebar();
					if (!root) return;
					if (state.finder) {
						try {
							state.finder.disconnect();
						} catch (e) {
							/* ignore */
						}
						state.finder = null;
					}
					attach(root);
				});
				state.finder.observe(document.documentElement, { childList: true, subtree: true });
			} catch (e) {
				state.finder = null;
			}
		}

		/** 侧栏被整体替换（切工作区、主题重挂）时重新挂上去。 */
		function checkRoot() {
			if (!state.started) return;
			var root = findSidebar();
			if (root === state.root) return;
			if (root) {
				attach(root);
			} else {
				detachObserver();
				state.root = null;
				waitForSidebar();
			}
		}

		function start() {
			if (state.started) {
				try {
					sweep(state.root);
				} catch (e) {
					/* ignore */
				}
				return;
			}
			state.started = true;
			var root = findSidebar();
			if (root) {
				attach(root);
			} else {
				waitForSidebar();
			}
			state.poll = setInterval(checkRoot, ROOT_CHECK_MS);
			if (state.poll && typeof state.poll.unref === "function") state.poll.unref();
		}

		function stop() {
			state.started = false;
			detachObserver();
			if (state.finder) {
				try {
					state.finder.disconnect();
				} catch (e) {
					/* ignore */
				}
				state.finder = null;
			}
			if (state.poll) {
				clearInterval(state.poll);
				state.poll = null;
			}
			state.root = null;
			// 插件停用后把被我们藏起来的时间还回去
			restoreAll();
		}

		/* --------------------------- 插件契约 --------------------------- */

		function apply(ctx) {
			var disposed = false;
			function begin() {
				if (disposed) return;
				try {
					start();
				} catch (e) {
					/* 启动失败就保持原样，绝不抛给加载器 */
				}
			}
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", begin, { once: true });
			} else {
				begin();
			}
			if (ctx && typeof ctx.effect === "function") {
				try {
					// cordis 的 effect(fn) 会**立即**调用 fn，并把 fn 的返回值当清理函数。
					// 所以这里必须返回 stop，而不是在 fn 里调用 stop（那样插件一装上就停）。
					ctx.effect(function () {
						return function () {
							disposed = true;
							document.removeEventListener("DOMContentLoaded", begin);
							stop();
						};
					});
				} catch (e) {
					/* 老版本 cordis 没有 effect */
				}
			}
		}

		exports.apply = apply;
		exports.inject = [];

		return module.exports;
	},
});
