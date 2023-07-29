// Needs to be an ES module for `import.meta` and `customElements`
export {};

export function config(config) {
    if (config.urlFromElementName) {
        state.urlFromElementName = config.urlFromElementName;
    }
    if (config.shouldHandleElement) {
        state.shouldHandleElement = config.shouldHandleElement;
    }
}

export function compose(...args) {
    console.log("compose(", ...args, ")");
    const ViewModel = class {
    };
    // state.scope.ViewModel = ViewModel;
    // console.log("  defining", state.scope.defining);
    return ViewModel;
}

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
        // ViewModel: null,
    },
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

// document.addEventListener("DOMNodeInserted", ev => {
//     console.log("DOMNodeInserted", ev);
//     maybeRequestElement(ev.target);
//     // if (ev.target.tagName.toLowerCase() === "script" && state.scope.defining) {
//     //     const node = ev.target;
//     //     console.log("  defining...", node);
//     // }
// });
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

    console.log("parseElementDocument", doc);
    const def = doc.querySelector("template");
    console.log("  ", def);

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

    let seal;
    const sealedPromise = new Promise(resolve => {
        seal = resolve;
    });

    const Element = class extends HTMLElement {
        static Component;

        static init(Component) {
            // console.log(`<${tagName}>.init(`, ...arguments, ")");
            // console.log("  ", state.scope.ViewModel);
            this.Component = Component;
            seal();
        }

        constructor() {
            super();
        }

        async connectedCallback(...args) {
            await sealedPromise;
            console.log("  ", `<${tagName}>.connectedCallback`, ...args);
            // console.log("    ViewModel.name", Element.ViewModel.name)

            const vm = new Element.Component();

            const desc = Object.getOwnPropertyDescriptors(vm);
            console.log("viewModel.getOwnPropertyDescriptors", desc);

            const proxy = createScope(vm);

            this.attachShadow({ mode: "open" });
            const dom = bind(viewTemplate.content.cloneNode(true), proxy);
            this.shadowRoot.appendChild(dom);
        }

        disconnectedCallback() {
            console.log("  ", `<${tagName}>.disconnectedCallback`, ...args);
        }
    };
    customElements.define(tagName, Element);
}

function createScope(parentScope) {
    // const scope = Object.create(parentScope);
    // scope.$parent = parentScope;
    // return scope;
    const watches = new Map();
    function $watch(prop, fn) {
        console.log($watch.name, '"', prop, '"', fn, this);
        const w = watches.get(prop) ?? [];
        w.push(fn);
        watches.set(prop, w);
    }

    const scope = new Proxy(parentScope, {
        get(target, prop, receiver) {
            if (prop === "$watch") {
                return $watch;
            }
            if (prop === "$parent") {
                return parentScope;
            }
            const value = this[prop] ?? target[prop];
            return value;
        },
        set(target, prop, value, receiver) {
            this[prop] = value;
            if (watches.has(prop)) {
                for (const fn of watches.get(prop)) {
                    fn();
                }
            }
            return true;
        }
    });
    // Object.defineProperty(scope, "$watch", {
    //     configurable: false,
    //     writable: false,
    //     value: $watch,
    // });
    // scope.$parent = parentScope;
    return scope;
}

function grab(scope, prop) {
    const invert = prop[0] === "!";
    const path = prop.replace(/^!/, "").split(".");
    let sub = scope;
    for (let i = 0; i < path.length; i += 1) {
        sub = sub[path[i]];
    }
    return invert ? !sub : sub;
}
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

function bind(tmpl, vm) {
    const view = document.createDocumentFragment();
    const scopes = [vm];

    /** @type {HTMLElement} */
    let src;
    /** @type {HTMLElement} */
    let cursor;
    /** @type {HTMLElement} */
    let parent;
    const list = [...([...tmpl.childNodes].map(n => [view, n]))];
    while ((() => {
        const [it] = list.splice(0, 1);
        if (!it) {
            return null;
        }
        [parent, src] = it;
        return true;
    })()) {
        // console.log("..", parent, src)
        cursor = src.cloneNode();
        switch (src.nodeType) {
            case src.TEXT_NODE: {
                parent.appendChild(cursor);
                const scope = src.parentNode.__SCOPE__ || scopes.at(-1);
                interpolate(cursor, scope);
                break;
            }
            case src.COMMENT_NODE:
                // parent.appendChild(cursor);
                break;
            case src.ATTRIBUTE_NODE:
                break;
            case src.CDATA_SECTION_NODE:
                // parent.appendChild(cursor);
                break;
            case src.DOCUMENT_FRAGMENT_NODE:
                // parent.appendChild(cursor);
                break;
            case src.DOCUMENT_NODE:
                // parent.appendChild(cursor);
                break;
            case src.ELEMENT_NODE: {
                const attrSet = new Set(src.getAttributeNames());
                const attrs = [...attrSet];
                console.log("  ~>", src);
                let appendToParent = true;

                if (attrSet.has("repeat.for")) {
                    const attr = "repeat.for";
                    const val = src.getAttribute(attr);
                    let varName;
                    let iterable;
                    val.replace(/^([^\s]+)\s+of\s+([^\s]+)$/, (_, v, it) => {
                        varName = v;
                        iterable = it;
                    });
                    // console.log("        binding: [repeat.for]", varName, "of", iterable);
                    const scope = scopes.at(-1);
                    // const fragment = document.createDocumentFragment();
                    for (const it of scope[iterable]) {
                        const itemScope = createScope(scope);
                        itemScope[varName] = it;
                        const node = src.cloneNode(true);
                        node.removeAttribute(attr);
                        // fragment.appendChild(node);
                        node.__SCOPE__ = itemScope;
                        // src.parentNode.appendChild(node);
                        // console.log("  node.__SCOPE__", node.__SCOPE__);
                        list.push([parent, node]);
                    }
                    // src.parentNode.appendChild(fragment);
                    // src.parentNode.removeChild(src);
                    appendToParent = false;
                }

                if (appendToParent) {
                    for (const attr of attrs) {
                        if (!/\./.test(attr)) {
                            continue;
                        }
                        const [what, action, ...modList] = attr.split('.');
                        const mods = new Set(modList);
                        if (mods.size === 0) {
                            switch (cursor.tagName.toLowerCase()) {
                                case "form":
                                    mods.add("prevent");
                                    break;
                            }
                        }
                        const val = cursor.getAttribute(attr);
                        // console.log("    binding", attr, "->", val);
                        // console.log("      evt", evt, mods);
                        switch (action) {
                            case "bind":
                                if (what === "if") {
                                    const prop = what;
                                    console.log("        binding: if[", prop, "]", "=>", val);
                                    const scope = scopes.at(-1);
                                    if (grab(scope, val)) {
                                        cursor.classList.remove("hidden");
                                    } else {
                                        cursor.classList.add("hidden");
                                    }
                                    break;
                                }
                                if (/^on/.test(what)) {
                                    const evt = what;
                                    const scope = scopes.at(-1);
                                    let fn;
                                    let argNames;
                                    val.replace(/^([^)]+)\w*\(([^)]+)\)\w*$/, (_, n, a = "") => {
                                        fn = n;
                                        argNames = a.split(",").map(it => it.trim());
                                    });
                                    console.log("        binding: (event)", evt, "=>", fn, "(", ...argNames, ")");
                                    cursor.addEventListener(evt.slice(2), function (ev) {
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
                                            return scope[a];
                                        });
                                        scope[fn].apply(scope, args);
                                    });
                                    break;
                                }
                                if (what === "checked" && cursor.getAttribute("type") === "checkbox") {
                                    const prop = what;
                                    console.log("        binding: checkbox[", prop, "]", "=>", val);
                                    const scope = scopes.at(-1);
                                    cursor.addEventListener("change", function (ev) {
                                        if (this.checked) {
                                            grabAndSet(scope, val, true);
                                            // scope[val] = true;
                                        } else {
                                            grabAndSet(scope, val, false);
                                            // scope[val] = false;
                                        }
                                    });
                                    break;
                                }
                                if (what === "value" && cursor.getAttribute("type") === "text") {
                                    const prop = what;
                                    console.log("        binding: text[", prop, "]", "=>", val);
                                    const scope = scopes.at(-1);
                                    cursor.addEventListener("change", function () {
                                        grabAndSet(scope, val, this.value);
                                        // scope[val] = this.value;
                                    });
                                    break;
                                }
                                if (what === "value" && cursor.getAttribute("type") === "radio") {
                                    const prop = what;
                                    console.log("        binding: radio[", prop, "]", "=>", val);
                                    const scope = scopes.at(-1);
                                    cursor.addEventListener("change", function () {
                                        if (this.checked) {
                                            grabAndSet(scope, val, this.value);
                                            // scope[val] = this.value;
                                        }
                                    });
                                    break;
                                }
                                if (what === "value" && cursor.tagName.toLowerCase() === "select") {
                                    const prop = what;
                                    console.log("        binding: select[", prop, "]", "=>", val);
                                    const scope = scopes.at(-1);
                                    cursor.addEventListener("change", function () {
                                        grabAndSet(scope, val, this.value);
                                        // scope[val] = this.value;
                                    });
                                    break;
                                }
                                if (what === "value" && cursor.tagName.toLowerCase() === "option") {
                                    const prop = what;
                                    console.log("        binding: option[", prop, "]", "=>", val);
                                    const scope = src.__SCOPE__ || scopes.at(-1);
                                    cursor.value = grab(scope, val);
                                    break;
                                }
                                if (what === "class") {
                                    const prop = what;
                                    const scope = scopes.at(-1);
                                    const it = grab(scope, val);
                                    console.log("        binding: class[", prop, "]", "=>", val, "->", it);
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
                                    break;
                                }
                                if (what === "innerhtml") {
                                    const prop = what;
                                    const scope = scopes.at(-1);
                                    const it = grab(scope, val);
                                    cursor.innerHTML = it;
                                    break;
                                }
                                // if (Object.hasOwn(cursor, what)) {
                                //     const prop = what;
                                //     const scope = scopes.at(-1);
                                //     const it = grab(scope, val);
                                //     cursor[what] = it;
                                //     break;
                                // }
                                // if (cursor.getAttribute(what)) {
                                //     const prop = what;
                                //     const scope = scopes.at(-1);
                                //     const it = grab(scope, val);
                                //     cursor.setAttribute(what, it);
                                //     break;
                                // }
                                // throw new Error(`Binding for "${what}" not supported`);
                                {
                                    const prop = what;
                                    const scope = scopes.at(-1);
                                    const it = grab(scope, val);
                                    cursor[what] = it;
                                    if (what === "contenteditable") {
                                        cursor.setAttribute(what, "plaintext-only");
                                        // cursor.toggleAttribute(what);
                                    } else {
                                        cursor.setAttribute(what, String(it));
                                    }
                                }
                        }
                    }
                    parent.appendChild(cursor);

                    for (const child of src.childNodes) {
                        list.push([cursor, child]);
                    }
                }

                break;
            }
            default:
                throw new Error(`nodeType ${node.nodeType} unknown`);
        }
    }

    return view;
}

// const nativeCreateElement = document.createElement.bind(document);
// document.createElement = function customCreateElement(...args) {
//     console.log("document.createElement", ...args);
//     return nativeCreateElement(...args);
// };

// const nativeGet = customElements.get.bind(customElements);
// const nativeWhenDefined = customElements.whenDefined.bind(customElements);
// Object.defineProperties(customElements, {
//     get: {
//         value(...args) {
//             console.log("customElements.get(", ...args, ")");
//             return nativeGet(...args);
//         },
//     },
//     whenDefined: {
//         value(...args) {
//             console.log("customElements.whenDefined(", ...args, ")");
//             return nativeWhenDefined(...args);
//         }
//     }
// });

// const observer = new MutationObserver((...args) => {
//     console.log("MutationObserver.callback", ...args);
// });
// observer.observe(ev.target.body, {
//     attributes: false,
//     childList: true,
//     subtree: true,
// });

// function LegacyElement() {
//     const that = Reflect.construct(HTMLElement, [], this.constructor);
//     // const proxy = new Proxy(that, {
//     // });
//     // return proxy;
//     return that;
// }
// LegacyElement.prototype = Object.create(HTMLElement.prototype);
// LegacyElement.prototype.constructor = LegacyElement;
// LegacyElement.prototype.connectedCallback = function () {
//     this.appendChild(document.createTextNode("A little rusty!"));
// };
// Object.setPrototypeOf(LegacyElement, HTMLElement);

// // customElements.define(tagName, LegacyElement);
// // customElements.define("legacy-element", LegacyElement);
