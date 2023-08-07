// Needs to be an ES module for `import.meta` and `customElements`
export {};

export function config(config) {
    if (config.urlFromElementName) {
        state.urlFromElementName = config.urlFromElementName;
    }
    if (config.shouldHandleElement) {
        state.shouldHandleElement = config.shouldHandleElement;
    }
    if (config.compositionRoot) {
        config.compositionRoot({
            singleton(token, factory) {
                const instance = factory();
                state.registrations.set(token, () => instance);
            },
        });
    }
}

export function compose(cls) {
    console.log("compose(", ...arguments, ")");
    return cls;
}

export class Base { }

export function attr(...args) {
    console.log("attr(", ...args, ")");
}

const sentinel = {};

const state = {
    baseUrl: "",
    prefix: "x-",
    revision: "",
    shouldHandleElement: () => true,
    urlFromElementName: (elementName, baseUrl, revision) => {
        const path = elementName.replace(/-/g, "/");
        return `${baseUrl}/${path}.html${revision ? `?${revision}` : ""}`;
    },
    scope: {
        defining: false,
    },
    registrations: new Map(),
    defaultModifiers: [
        {
            defaults: function (cursor, what, action) {
                if (what === "onsubmit" && action === "bind" && cursor.tagName.toLowerCase() === "form") {
                    return ["prevent"];
                }
                return [];
            },
        },
    ],
    bindings: [
        {
            binding: function ifBinding(cursor, scope, val, what, action, mods) {
                if (what === "if" && action === "bind") {
                    // const prop = what;
                    // console.log("        binding: if[", what, "]", "=>", val);
                    if (grab(scope, val)) {
                        cursor.classList.remove("hidden");
                    } else {
                        cursor.classList.add("hidden");
                    }
                    return true;
                }
                return false;
            }
        },
        {
            binding: function eventBinding(cursor, scope, val, what, action, mods) {
                if (/^on/.test(what) && action === "bind") {
                    const evt = what;
                    let fn;
                    let argNames;
                    val.replace(/^([^)]+)\w*\(([^)]+)?\)\w*$/, (_, n, a = "") => {
                        fn = n;
                        argNames = a.split(",").map(it => it.trim());
                    });
                    // console.log("        binding: (event)", evt, "=>", fn, "(", ...argNames, ")");
                    cursor.addEventListener(evt.slice(2), function (ev) {
                        // console.log(what, scope.item, ev, scope);
                        if (mods.has("prevent")) {
                            ev.preventDefault();
                        }
                        if (mods.has("stop")) {
                            ev.stopPropagation();
                        }
                        const args = argNames.map(a => {
                            if (a === "event") {
                                return ev;
                            }
                            if (a === "this") {
                                return this;
                            }
                            return grab(scope, a);
                        });
                        scope[fn].apply(scope, args);
                    });
                    return true;
                }
                return false;
            }
        },
        {
            binding: function checkboxBinding(cursor, scope, val, what, action, mods) {
                if (what === "checked" && action === "bind" && cursor.getAttribute("type") === "checkbox") {
                    const prop = what;
                    // console.log("        binding: checkbox[", prop, "]", "=>", val);
                    cursor.addEventListener("change", function (ev) {
                        // console.log("        checkbox.onchange", ev, this)
                        if (this.checked) {
                            grabAndSet(scope, val, true);
                        } else {
                            grabAndSet(scope, val, false);
                        }
                    });
                    return true;
                }
                return false;
            },
        },
        {
            binding: function textInputBinding(cursor, scope, val, what, action, mods) {
                const tagName = cursor.tagName.toLowerCase();
                if (what === "value" && action === "bind" && (tagName === "input" && cursor.getAttribute("type") === "text" || tagName === "textarea")) {
                    const prop = what;
                    let reacting = false;
                    // console.log("        binding: <", tagName, "> text[", prop, "]", "=>", val);
                    cursor.addEventListener("input", function () {
                        if (reacting) {
                            return;
                        }
                        grabAndSet(scope, val, this.value);
                    });
                    cursor.value = grab(scope, val);
                    scope.$watch(val, () => {
                        reacting = true;
                        cursor.value = grab(scope, val);
                        reacting = false;
                    });
                    return true;
                }
                return false;
            },
        },
        {
            binding: function radioBinding(cursor, scope, val, what, action, mods) {
                if (what === "value" && action === "bind" && cursor.tagName.toLowerCase() === "input" && cursor.getAttribute("type") === "radio") {
                    const prop = what;
                    // console.log("        binding: radio[", prop, "]", "=>", val);
                    cursor.addEventListener("change", function () {
                        if (this.checked) {
                            grabAndSet(scope, val, this.value);
                        }
                    });
                    return true;
                }
                return false;
            },
        },
        {
            binding: function selectBinding(cursor, scope, val, what, action, mods) {
                if (what === "value" && action === "bind" && cursor.tagName.toLowerCase() === "select") {
                    const prop = what;
                    // console.log("        binding: select[", prop, "]", "=>", val);
                    cursor.addEventListener("change", function () {
                        grabAndSet(scope, val, this.value);
                    });
                    return true;
                }
                return false;
            },
        },
        {
            binding: function optionBinding(cursor, scope, val, what, action, mods) {
                if (what === "value" && action === "bind" && cursor.tagName.toLowerCase() === "option") {
                    const prop = what;
                    // console.log("        binding: option[", prop, "]", "=>", val);
                    cursor.value = grab(scope, val);
                    return true;
                }
                return false;
            },
        },
        {
            binding: function classBinding(cursor, scope, val, what, action, mods) {
                if (what === "class" && action === "bind") {
                    const prop = what;
                    const it = grab(scope, val);
                    // console.log("        binding: class[", prop, "]", "=>", val, "->", it);
                    if (typeof it === "string") {
                        // console.log("          string", it)
                        cursor.className = it;
                    } else if (it && typeof it[Symbol.iterator] === "function") {
                        // console.log("          iterable", it)
                        cursor.className = [...Object.values(it)].join(" ");
                    } else if (it && typeof it === "object") {
                        // console.log("          object", it)
                        cursor.className = Object.entries(it).filter(([_, v]) => {
                            return v;
                        }).map(([k]) => k).join(" ");
                    } else {
                        // console.log("          nothing", it)
                        cursor.className = "";
                    }
                    return true;
                }
                return false;
            },
        },
        {
            binding: function innerHtmlBinding(cursor, scope, val, what, action, mods) {
                if (what === "innerhtml" && action === "bind") {
                    const prop = what;
                    const it = grab(scope, val);
                    cursor.innerHTML = it;
                    return true;
                }
                return false;
            },
        },
        {
            binding: function contenteditableBinding(cursor, scope, val, what, action, mods) {
                if (what === "contenteditable" && action === "bind") {
                    const prop = what;
                    const it = grab(scope, val);
                    cursor[what] = it;
                    cursor.setAttribute(what, true);
                    return true;
                }
                return false;
            },
        },
        {
            binding: function fallbackPropertyBinding(cursor, scope, val, what, action, mods) {
                if (action === "bind") {
                    const prop = what;
                    const it = grab(scope, val);
                    cursor[what] = it;
                    cursor.setAttribute(what, String(it));
                    return true;
                }
                return false;
            },
        },
    ],
};

// We want to be able to drop this module into a CDN and have it just work
state.baseUrl = import.meta.url.replace(/^(.+)\/(\w+)\/fx.js(?:\?([a-zA-Z][\w&=]*))?$/, (_, path, pre, hash) => {
    //console.log({ _, path, pre, hash });
    state.prefix = `${pre}-`;
    state.revision = hash;
    return `${path}/${pre}`;
});
state.cache = new Map();

async function requireElement(rawElementName) {
    const elementName = rawElementName.toLowerCase();
    const url = state.urlFromElementName(elementName, state.baseUrl, state.revision);

    if (state.cache.has(elementName)) {
        return state.cache.get(elementName);
    }
    state.cache.set(elementName, sentinel);
    
    const xhr = new XMLHttpRequest();
    xhr.responseType = "document";
    xhr.open("GET", url, true);

    try {
        const res = await new Promise(resolve => {
            xhr.addEventListener("readystatechange", () => {
                if (xhr.readyState === xhr.DONE) {
                    resolve(xhr.response);
                }
            });
            xhr.send(null);
        });
        state.cache.set(elementName, res);
        return res;
    } catch (e) {
        console.error("requireElement", e);
        return null;
    }
}

new MutationObserver((records, observer) => {
    // console.log("MutationObserver.callback", records, observer);
    for (const { addedNodes } of records) {
        for (const node of addedNodes) {
            maybeRequestElement(node);
        }
    }
}).observe(document, {
    childList: true,
    subtree: true,
});

function maybeRequestElement(node) {
    if (node.tagName && /-/.test(node.tagName)) {
        const tagName = node.tagName.toLowerCase();
        if (customElements.get(tagName) || !state.shouldHandleElement(tagName)) {
            return;
        }
        requireElement(tagName).then(root => {
            if (root === sentinel) {
                // Is already being processed asynchronously
                // console.log("[SKIP]    <=", tagName, "->", root);
                return;
            }
            // console.log("    <=", tagName, "->", root);
            parseElementDocument(root, tagName);
        });
    }
}

document.addEventListener("DOMContentLoaded", function (ev) {
    // console.log("DOMContentLoaded", ev.target, this);
    
    let node = ev.target.body;
    while (node) {
        // console.log("  ->", node);
        maybeRequestElement(node);
        node = node.nextSibling || node.firstChild;
    }
});

function parseElementDocument(doc, tagName) {
    if (customElements.get(tagName)) {
        // Already defined, can't do anything about it
        return;
    }

    // console.log("parseElementDocument", doc);
    const def = doc.querySelector("template");
    // console.log("  ", def);

    const scriptsOnly = def.content.cloneNode(true);
    /** @type {Node} */
    let node = scriptsOnly;
    while (node) {
        /** @type {Node} */
        let toRemove = null;

        const isScript = node.tagName && node.tagName.toLowerCase() === "script";
        if (node.nodeType === node.TEXT_NODE || node.tagName && !isScript) {
            toRemove = node;
        }
        if (isScript) {
            // FIXME: It'd be preferred not to have to inject code, maybe there is a way?
            node.textContent += `;typeof Component !== "undefined" && customElements.whenDefined("${tagName}").then(Ctor => Ctor.init(Component));`
        }
        // console.log("  node", node, "toRemove", toRemove);
        node = node.nextSibling || node.firstChild;
        if (toRemove && toRemove.parentNode) {
            // console.log("    remove", toRemove);
            toRemove.parentNode.removeChild(toRemove);
        }
    }

    state.scope.defining = true;
    // console.log("  scriptsOnly", scriptsOnly);
    document.body.appendChild(scriptsOnly);
    state.scope.defining = false;

    /** @type {HTMLTemplateElement} */
    const viewTemplate = def.cloneNode(true);
    node = viewTemplate.content;
    while (node) {
        /** @type {Node} */
        let toRemove = null;

        if (node.tagName && node.tagName.toLowerCase() === "script") {
            toRemove = node;
        }
        // console.log("  node", node, "toRemove", toRemove);
        node = node.nextSibling || node.firstChild;
        if (toRemove && toRemove.parentNode) {
            // console.log("    remove", toRemove);
            toRemove.parentNode.removeChild(toRemove);
        }
    }

    let provideComponent;
    const componentProvided = new Promise(resolve => {
        provideComponent = resolve;
    });

    const Element = class extends HTMLElement {
        static init(Component) {
            // console.log(`<${tagName}>.init(`, ...arguments, ")");
            // console.log("  ", state.scope.ViewModel);
            provideComponent(Component);
        }

        constructor() {
            super();
        }

        async connectedCallback(...args) {
            const Component = await componentProvided;
            // console.log("  ", `<${tagName}>.connectedCallback`, ...args);
            // console.log("    ViewModel.name", Element.ViewModel.name)

            const deps = [];
            if (typeof Component.requires === "function") {
                const map = {};
                for (const [type, _] of state.registrations) {
                    map[type.name] = type;
                }
                for (const dep of Component.requires(map)) {
                    const factory = state.registrations.get(dep);
                    deps.push(factory());
                }
            }
            const vm = new Component(...deps);

            const desc = Object.getOwnPropertyDescriptors(vm);
            // console.log("viewModel.getOwnPropertyDescriptors", desc);
            const scope = createScope(vm);

            for (const [key, def] of Object.entries(desc)) {
                maybePatch(key, def.value, scope);
            }

            this.attachShadow({ mode: "open" });
            const dom = bind(viewTemplate.content.cloneNode(true), scope);
            this.shadowRoot.appendChild(dom);
        }

        disconnectedCallback() {
            console.log("  ", `<${tagName}>.disconnectedCallback`, ...args);
        }
    };
    customElements.define(tagName, Element);
}

/**
 * @param {string} key 
 * @param {any} value 
 * @param {any} scope 
 */
function maybePatch(key, value, scope) {
    if (Array.isArray(value) && !/function\s+patched/.test(Object.toString.call(value.fill))) {
        for (const method of ["fill", "pop", "push", "reverse", "shift", "sort", "splice", "unshift"]) {
            const nativeMethod = Array.prototype[method];
            // console.log("  patching", nativeMethod);
            value[method] = function patched() {
                const val = nativeMethod.apply(this, arguments)
                scope.$emit("mutated", key);
                return val;
            };
        }
    }
    return value;
}

/** @param {any} parentScope */
function createScope(parentScope, decls) {
    const watchers = new Map();
    function $watch(prop, fn) {
        // console.log($watch.name, '"', prop, '"'); //, fn, this);
        const w = watchers.get(prop) ?? [];
        w.push(fn);
        watchers.set(prop, w);
    }

    function $emit(what, prop) {
        console.log($emit.name, what, '"', prop, '"');
        if (watchers.has(prop)) {
            for (const fn of watchers.get(prop)) {
                fn();
            }
        }
    }

    const store = {
        $parent: parentScope,
        ...decls,
    };
    const scope = new Proxy(parentScope, {
        get(target, prop, receiver) {
            if (prop === "$emit") {
                return $emit;
            }
            if (prop === "$watch") {
                return $watch;
            }
            if (prop === "$parent") {
                return parentScope;
            }
            const value = store[prop] ?? target[prop];
            return value;
        },
        set(target, prop, value, receiver) {
            let host = store;
            while (!Object.hasOwn(host, prop)) {
                if (!host.$parent) {
                    break;
                }
                host = host.$parent;
            }
            host[prop] = maybePatch(prop, value, scope);
            $emit("mutated", prop)
            return true;
        }
    });
    return scope;
}

/**
 * @param {any} scope 
 * @param {string} prop 
 */
function grab(scope, prop) {
    const invert = prop[0] === "!";
    const path = prop.replace(/^!/, "").split(".");
    let sub = scope;
    for (let i = 0; i < path.length; i += 1) {
        sub = sub[path[i]];
    }
    return invert ? !sub : sub;
}

/**
 * @param {any} scope 
 * @param {string} prop 
 * @param {unknown} value 
 */
function grabAndSet(scope, prop, value) {
    const path = prop.split(".");
    if (path.length > 2) {
        const last = path[path.length - 1];
        const host = grab(scope, path.slice(0, path.length - 2).join("."));
        host[last] = value;
    } else if (path.length === 2) {
        const last = path[path.length - 1];
        const host = grab(scope, path[0]);
        host[last] = value;
    } else {
        scope[prop] = value;
    }
}

/**
 * @param {DocumentFragment} tmpl 
 * @param {any} scope
 */
function bind(tmpl, scope) {
    const fragment = document.createDocumentFragment();

    /** @type {Node} */
    let src;
    /** @type {Node} */
    let parent;
    const list = [...([...tmpl.childNodes].map(n => [fragment, n]))];

    function enqueue(parent, node) {
        list.push([parent, node])
    }

    while ((() => {
        const [it] = list.splice(0, 1);
        if (!it) {
            return null;
        }
        [parent, src] = it;
        return true;
    })()) {
        switch (src.nodeType) {
            case src.TEXT_NODE:
                visitTextNode(parent, src, scope);
                break;
            case src.COMMENT_NODE:
                break;
            case src.ATTRIBUTE_NODE:
                throw new Error(`nodeType ${src.nodeType} (ATTRIBUTE_NODE) unsupported`);
            case src.CDATA_SECTION_NODE:
                throw new Error(`nodeType ${src.nodeType} (CDATA_SECTION_NODE) unsupported`);
            case src.DOCUMENT_FRAGMENT_NODE:
                throw new Error(`nodeType ${src.nodeType} (DOCUMENT_FRAGMENT_NODE) unsupported`);
            case src.DOCUMENT_NODE:
                throw new Error(`nodeType ${src.nodeType} (DOCUMENT_NODE) unsupported`);
            case src.ELEMENT_NODE:
                visitElementNode(parent, src, scope, enqueue);
                break;
            default:
                throw new Error(`nodeType ${src.nodeType} unknown`);
        }
    }

    return fragment;
}

/**
 * @param {Node} cursor 
 * @param {any} scope 
 */
function interpolate(cursor, scope) {
    const tmpl = cursor.textContent;
    const re = /\${([^}]+)}/g;
    const props = [];
    tmpl.replace(re, (_, prop) => {
        props.push(prop);
    });

    if (props.length === 0) {
        return;
    }

    function fn() {
        cursor.textContent = tmpl.replace(re, (_, prop) => {
            // console.log("interpolate", _, prop, "in", scope);
            return grab(scope, prop);
        });
    }

    for (const prop of props.filter(p => !/\./.test(p))) {
        scope.$watch(prop, fn);
    }

    fn();
}

/**
 * @param {Node} parent
 * @param {Node} src
 * @param {any} scope
 */
function visitTextNode(parent, src, scope) {
    const cursor = src.cloneNode();
    cursor.__EXPANDO__ = src.__EXPANDO__;
    parent.appendChild(cursor);
    interpolate(cursor, scope);
}

/**
 * @param {HTMLElement} parent
 * @param {HTMLElement} src
 * @param {any} scope
 * @param {(parent: Node, src: Node) => void} enqueue
 */
function visitElementNode(parent, src, scope, enqueue) {
    const bindings = state.bindings;
    const defaultModifiers = state.defaultModifiers;

    const attrSet = new Set(src.getAttributeNames());
    const attrs = [...attrSet];
    // console.log("  ~>", src);
    let appendToParent = true;

    if (attrSet.has("repeat.for")) {
        const attr = "repeat.for";
        const val = src.getAttribute(attr);
        const expando = `repeat.for(${Math.random()})`;
        let varName;
        let iterable;
        val.replace(/^([^\s]+)\s+of\s+([^\s]+)$/, (_, v, it) => {
            varName = v;
            iterable = it;
        });
        // console.log("        binding: [repeat.for]", varName, "of", iterable);
        function updateNode() {
            let posStart;
            let posEnd;
            let last;
            const toRemove = [];
            for (const child of parent.childNodes) {
                if (child.__EXPANDO__ === expando) {
                    if (!posStart) {
                        posStart = last;
                    }
                    toRemove.push(child);
                } else if (posStart && !posEnd) {
                    posEnd = child;
                }
                last = child;
            }
            for (const child of toRemove) {
                parent.removeChild(child);
            }
            for (const it of scope[iterable]) {
                const itemScope = createScope(scope, {
                    [varName]: it,
                });
                const node = src.cloneNode(true);
                node.__EXPANDO__ = expando;
                node.removeAttribute(attr);

                const tmpl = document.createDocumentFragment();
                tmpl.appendChild(node);
                const fragment = bind(tmpl, itemScope);
                if (posEnd) {
                    parent.insertBefore(fragment, posEnd);
                } else {
                    parent.appendChild(fragment);
                }
            }
        }
        scope.$watch(iterable, updateNode);
        for (const it of scope[iterable]) {
            const itemScope = createScope(scope, {
                [varName]: it,
            });
            const node = src.cloneNode(true);
            node.__EXPANDO__ = expando;
            node.removeAttribute(attr);

            const tmpl = document.createDocumentFragment();
            tmpl.appendChild(node);
            const fragment = bind(tmpl, itemScope);
            parent.appendChild(fragment);
        }
        appendToParent = false;
    }

    if (appendToParent) {
        /** @type {Node} */
        const cursor = src.cloneNode();
        cursor.__EXPANDO__ = src.__EXPANDO__;

        for (const attr of attrs) {
            if (!/\./.test(attr)) {
                continue;
            }
            const [what, action, ...modList] = attr.split('.');
            const mods = new Set(modList);
            if (mods.size === 0) {
                let matched = false;
                let i = 0;
                while (!matched && i < defaultModifiers.length) {
                    const d = defaultModifiers[i];
                    const defaultMods = d.defaults(cursor, what, action);
                    matched = defaultMods.length > 0;
                    for (const mod of defaultMods) {
                        mods.add(mod);
                    }
                    i += 1;
                }
            }
            const val = cursor.getAttribute(attr);
            // console.log("    binding", attr, "->", val);
            // console.log("      evt", evt, mods);

            let matched = false;
            let i = 0;
            while (!matched && i < bindings.length) {
                const { binding } = bindings[i];
                matched = binding(cursor, scope, val, what, action, mods);
                i += 1;
            }
        }
        parent.appendChild(cursor);

        for (const child of src.childNodes) {
            enqueue(cursor, child);
        }
    }
}

