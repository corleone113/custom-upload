interface Options {
    method?: string, // 请求方法
    urlPath?: string, // url路径部分
    host?: string, // url主机部分
    headers?: { [k: string]: string }, // 请求头
    data?: any, // 请求体
    setXHR?: Function, // 使用xhr的回调
    onProgress?: (this: XMLHttpRequest, event: ProgressEvent) => void, // 上传进度回调——实现进度条
}
export function request(options: Options): Promise<any> {
    const _default: Options = { // 默认请求配置
        method: 'get',
        host: 'http://localhost:34778',
        headers: {},
        data: {},
    }
    options = { ..._default, ...options, headers: { ..._default.headers, ...options.headers } }
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open(options.method!, options.host! + options.urlPath)
        for (const k in options.headers) { // 初始化请求头
            xhr.setRequestHeader(k, options.headers[k])
        }
        xhr.responseType = 'json'
        xhr.upload.onprogress = options.onProgress || null
        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    resolve(xhr.response) // 返回响应
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