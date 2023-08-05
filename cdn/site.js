
export class Store {
    getItem(key) {}
    setItem(key, value) {}
}

export class LocalStorageStore extends Store {
    getItem(key) {
        return JSON.parse(localStorage.getItem(key));
    }
    setItem(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
}
