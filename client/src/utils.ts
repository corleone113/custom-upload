interface Options {
    method?: string,
    urlPath?: string,
    baseUrl?: string,
    headers?: { [k: string]: string },
    data?: any,
    setXHR?: Function,
    onProgress?: (this: XMLHttpRequest, event: ProgressEvent) => void,
}
export function request(options: Options): Promise<any> {
    const _default: Options = {
        method: 'get',
        baseUrl: 'http://localhost:34778',
        headers: {},
        data: {},
    }
    options = { ..._default, ...options, headers: { ..._default.headers, ...options.headers } }
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open(options.method!, options.baseUrl! + options.urlPath)
        for (const k in options.headers) {
            xhr.setRequestHeader(k, options.headers[k])
        }
        xhr.responseType = 'json'
        xhr.upload.onprogress = options.onProgress || null
        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    resolve(xhr.response)
                } else {
                    reject(xhr.response)
                }
            }
        }
        if (options.setXHR) {
            options.setXHR(xhr)
        }
        xhr.send(options.data)
    })
}