/**
 * 行为测试：用一个极简 DOM 桩跑 lib/client.js，验证
 *   - 只隐藏"会话行内 + class 含 _time + 文本是相对时间"三者都成立的节点
 *   - 不误伤标题叫「昨天」的会话、不误伤正文里的「3小时」
 *   - 找不到侧栏时什么都不做（不回退全页扫描）
 *   - React 复用同一个节点后能恢复原显示
 *   - 插件停用后全部恢复
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const SOURCE = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

/* ----------------------------- DOM 桩 ----------------------------- */

function el(tag, className, text) {
  const node = {
    tagName: tag,
    className: className || '',
    style: { display: '' },
    attrs: Object.create(null),
    children: [],
    parentElement: null,
    textContent: text === undefined ? '' : text,
    getAttribute(name) {
      return name in this.attrs ? this.attrs[name] : null
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value)
    },
    removeAttribute(name) {
      delete this.attrs[name]
    },
    append(child) {
      child.parentElement = this
      this.children.push(child)
      return child
    },
    contains(other) {
      let node = other
      while (node) {
        if (node === this) return true
        node = node.parentElement
      }
      return false
    },
    querySelectorAll(selector) {
      const out = []
      const cls = /^\[class\*="([^"]*)"\]$/.exec(selector)
      const attr = /^\[([a-zA-Z-]+)\]$/.exec(selector)
      const match = (node) => {
        if (cls) return String(node.className).includes(cls[1])
        if (attr) return attr[1] in node.attrs
        return false
      }
      const walk = (node) => {
        for (const child of node.children) {
          if (match(child)) out.push(child)
          walk(child)
        }
      }
      walk(this)
      return out
    },
  }
  return node
}

function makeDocument(root) {
  return {
    documentElement: root,
    readyState: 'complete',
    querySelector(selector) {
      if (selector === 'aside') return root.querySelectorAll('[class*="aside"]')[0] || null
      if (selector === '[class*="sidebar"]') return root.querySelectorAll('[class*="sidebar"]')[0] || null
      return null
    },
    querySelectorAll(selector) {
      return root.querySelectorAll(selector)
    },
    addEventListener() {},
    removeEventListener() {},
  }
}

/* --------------------------- 运行环境 --------------------------- */

function boot(dom) {
  const observers = []
  class MutationObserver {
    constructor(cb) {
      this.cb = cb
      this.active = true
      observers.push(this)
    }
    observe() {}
    disconnect() {
      this.active = false
    }
  }
  const sandbox = {
    document: dom.document,
    MutationObserver,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    Math,
    String,
    window: {},
  }
  sandbox.window = sandbox
  let factory = null
  sandbox.window.__ModuleLoader__ = {
    load(options) {
      factory = options.factory
    },
  }
  vm.runInNewContext(SOURCE, sandbox)
  assert.ok(factory, 'client.js 必须调用 __ModuleLoader__.load')

  const exports = factory()
  assert.equal(typeof exports.apply, 'function', 'exports 必须带 apply')

  const cleanups = []
  const ctx = {
    effect(fn) {
      cleanups.push(fn())
    },
  }
  exports.apply(ctx)

  return {
    exports,
    trigger() {
      for (const observer of observers) if (observer.active) observer.cb([])
    },
    stop() {
      for (const fn of cleanups) fn()
    },
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** 造一个会话列表：行内有一个 _time 节点和一个 _title 节点。 */
function makeSidebar() {
  const body = el('body', '')
  const aside = el('aside', 'PIRFFq_sidebarCol')
  body.append(aside)

  const row = el('div', 'JoiKIa_sessionRow')
  aside.append(row)
  const title = el('span', 'JoiKIa_title', '小插件开发 1-3')
  const time = el('span', 'JoiKIa_time', '7小时')
  row.append(title)
  row.append(time)

  const row2 = el('div', 'JoiKIa_sessionRow')
  aside.append(row2)
  const trickyTitle = el('span', 'JoiKIa_title', '昨天') // 标题就叫「昨天」，不能动
  const time2 = el('span', 'JoiKIa_time', '刚刚')
  row2.append(trickyTitle)
  row2.append(time2)

  return { body, aside, row, title, time, row2, trickyTitle, time2 }
}

test('隐藏会话行内的时间，不动同名的标题', async () => {
  const dom = makeSidebar()
  const document = makeDocument(dom.body)
  const app = boot({ document })
  await wait(200)

  assert.equal(dom.time.style.display, 'none')
  assert.equal(dom.time2.style.display, 'none')
  assert.equal(dom.title.style.display, '')
  assert.equal(dom.trickyTitle.style.display, '', '标题 textContent 是「昨天」也不能被隐藏')
  app.stop()
})

test('class 不含 _time 的节点即使文本是相对时间也不动', async () => {
  const dom = makeSidebar()
  const stray = el('span', 'JoiKIa_meta', '3小时')
  dom.aside.append(stray)
  const document = makeDocument(dom.body)
  const app = boot({ document })
  await wait(200)

  assert.equal(stray.style.display, '')
  app.stop()
})

test('不在会话行里的 _time 节点不动', async () => {
  const dom = makeSidebar()
  const banner = el('div', 'JoiKIa_banner')
  dom.aside.append(banner)
  const outside = el('span', 'JoiKIa_time', '2天')
  banner.append(outside)
  const document = makeDocument(dom.body)
  const app = boot({ document })
  await wait(200)

  assert.equal(outside.style.display, '', '没有 sessionRow 祖先就不认')
  app.stop()
})

test('没有侧栏时什么都不做，不回退全页扫描', async () => {
  const body = el('body', '')
  const loose = el('div', 'JoiKIa_sessionRow')
  body.append(loose)
  const t = el('span', 'JoiKIa_time', '5小时')
  loose.append(t)

  const document = makeDocument(body)
  const app = boot({ document })
  await wait(200)

  assert.equal(t.style.display, '', '没有 <aside> 就跳过，不能扫整页')
  app.stop()
})

test('React 复用节点：内容变了要恢复原显示并去掉标记', async () => {
  const dom = makeSidebar()
  const document = makeDocument(dom.body)
  const app = boot({ document })
  await wait(200)
  assert.equal(dom.time.style.display, 'none')

  // 同一个 DOM 节点被复用成别的文本
  dom.time.textContent = '共 12 条'
  app.trigger()
  await wait(200)
  assert.equal(dom.time.style.display, '', '不再是时间就必须还原')
  assert.equal(dom.time.getAttribute('data-dsh-hide-time'), null)

  app.stop()
})

test('插件停用后，被隐藏的时间全部恢复', async () => {
  const dom = makeSidebar()
  const document = makeDocument(dom.body)
  const app = boot({ document })
  await wait(200)
  assert.equal(dom.time.style.display, 'none')

  app.stop()
  assert.equal(dom.time.style.display, '')
  assert.equal(dom.time2.style.display, '')
  assert.equal(dom.time.getAttribute('data-dsh-hide-time'), null)
})

test('factory 本身不产生副作用：只注册，不扫描', () => {
  const dom = makeSidebar()
  const document = makeDocument(dom.body)
  const observers = []
  class MutationObserver {
    constructor(cb) {
      this.cb = cb
      this.active = true
      observers.push(this)
    }
    observe() {}
    disconnect() {
      this.active = false
    }
  }
  let factory = null
  const sandbox = {
    document,
    MutationObserver,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    Math,
    String,
  }
  sandbox.window = sandbox
  sandbox.window.__ModuleLoader__ = {
    load(options) {
      factory = options.factory
    },
  }
  vm.runInNewContext(SOURCE, sandbox)
  const exports = factory()
  assert.equal(typeof exports.apply, 'function')
  assert.equal(dom.time.style.display, '', 'factory 不应隐藏任何东西')
  assert.equal(observers.length, 0, 'factory 不应注册观察器')
})


test('DOMContentLoaded 前停用，不会被迟到的事件重新启动', async () => {
  const dom = makeSidebar()
  const document = makeDocument(dom.body)
  document.readyState = 'loading'
  let listener
  let removed = false
  document.addEventListener = (type, fn) => { listener = fn }
  document.removeEventListener = (type, fn) => { removed = fn === listener }
  const app = boot({ document })
  app.stop()
  assert.equal(removed, true)
  listener() // Even a previously queued callback must be harmless.
  await wait(160)
  assert.equal(dom.time.style.display, '')
})
