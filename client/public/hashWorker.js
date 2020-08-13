importScripts('https://cdn.bootcss.com/spark-md5/3.0.0/spark-md5.js')
onmessage = async (event) => {
    const {
        partList
    } = event.data
    const spark = new self.SparkMD5.ArrayBuffer()
    let percent = 0
    let perSize = 100 / partList.length
    const buffers = await Promise.all(partList.map(({
        chunk,
    }) => new Promise(resolve => {
        const reader = new FileReader()
        reader.readAsArrayBuffer(chunk)
        reader.onload = (event) => {
            percent += perSize
            postMessage({
                percent: +percent.toFixed(2)
            })
            resolve(event.target.result)
        }
    })))
    buffers.forEach(buffer => spark.append(buffer))
    postMessage({
        percent: 100,
        hash: spark.end()
    })
    close()
}